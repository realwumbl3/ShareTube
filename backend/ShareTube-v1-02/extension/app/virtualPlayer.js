import state from "./state.js";
import { getCurrentPlayingProgressMs } from "./getters.js";
import { syncLiveList } from "./utils.js";
import ShareTubeQueueItem from "./models/queueItem.js";

// Virtual room player: coordinates backend room state, local state, and the YouTube player
export default class VirtualPlayer {
    /**
     * @param {import("./app.js").default} app
     */
    constructor(app) {
        this.app = app;
        this.verbose = false;
    }

    bindListeners(socket) {
        socket.on("queue.update", this.onQueueUpdate.bind(this));
        socket.on("queue.added", this.onQueueAdded.bind(this));
        socket.on("queue.removed", this.onQueueRemoved.bind(this));
        socket.on("queue.moved", this.onQueueMoved.bind(this));
        socket.on("room.state.update", this.onRoomStateUpdate.bind(this));
        socket.on("user.join.result", this.onRoomJoinResult.bind(this));
        socket.on("room.playback", this.onRoomPlayback.bind(this));
        socket.on("queue.probe", this.onQueueProbe.bind(this));
    }

    async onQueueAdded(data) {
        if (!data.item) return;
        const item = new ShareTubeQueueItem(this.app, data.item);
        state.queue.push(item);
        if (item.status.get() === "queued") state.queueQueued.push(item);
        if (item.status.get() === "played") state.queuePlayed.push(item);
        if (item.status.get() === "skipped") state.queueSkipped.push(item);
        if (item.status.get() === "deleted") state.queueDeleted.push(item);
    }

    async onQueueRemoved(data) {
        if (!data.id) return;
        const remove = (list) => {
            const idx = list.findIndex((i) => i.id === data.id);
            if (idx !== -1) list.splice(idx, 1);
        };
        remove(state.queue);
        remove(state.queueQueued);
        remove(state.queuePlayed);
        remove(state.queueSkipped);
        remove(state.queueDeleted);
    }

    async onQueueMoved(data) {
        if (!data.id) return;
        const item = state.queue.find((i) => i.id === data.id);
        if (!item) return;

        if (data.position !== undefined) item.position.set(data.position);
        if (data.status !== undefined) item.status.set(data.status);

        // Re-sort and re-filter lists
        // Ideally we would move just this item, but re-syncing the specific lists is safer given status changes
        this.refreshQueueLists();
    }

    refreshQueueLists() {
        const all = state.queue.get().slice().sort((a, b) => (a.position.get() || 0) - (b.position.get() || 0));
        
        const sync = (list, filter) => {
             syncLiveList({
                localList: list,
                remoteItems: filter ? all.filter(filter) : all,
                extractRemoteId: (v) => v.id,
                extractLocalId: (u) => u.id,
                createInstance: (item) => item, // Should already be instances
                updateInstance: (inst, item) => {}, // Already updated
            });
        };

        sync(state.queueQueued, (i) => i.status.get() === "queued");
        sync(state.queuePlayed, (i) => i.status.get() === "played");
        sync(state.queueSkipped, (i) => i.status.get() === "skipped");
        sync(state.queueDeleted, (i) => i.status.get() === "deleted");
    }

    async onQueueProbe(data) {}

    async onRoomJoinResult(result) {
        if (!result.ok) return;

        this.updateServerClock(result);
        state.roomCode.set(result.code);
        state.inRoom.set(true);
        state.adSyncMode.set(result.snapshot.ad_sync_mode);

        const currentQueue = result.snapshot.current_queue;
        this.updateCurrentPlayingFromEntry(currentQueue?.current_entry);
        this.gotoVideoIfNotOnVideoPage(currentQueue?.current_entry);

        this.onRoomStateUpdate(result.snapshot);
        this.app.roomManager.updateCodeHashInUrl(result.code);
        this.applyTimestamp();
    }

    async emitRestartVideo() {
        return await this.app.socket.emit("room.control.restartvideo");
    }

    async onRoomStateUpdate(data) {
        if (!data.state) return;
        this.setRoomState(data.state);
        this.onQueueUpdate(data.current_queue);
    }

    shouldSuppressTimestampUpdate(data) {
        const localUserId = state.userId && state.userId.get ? state.userId.get() : null;
        const isOwnActor = data.actor_user_id && localUserId && data.actor_user_id === localUserId;
        const isFrameStep = data.frame_step !== undefined && data.frame_step !== null;
        return isOwnActor && isFrameStep;
    }

    async onRoomPlayback(data) {
        if (!this.isForCurrentRoom(data.code)) return;

        if (data.actor_user_id) {
            this.app.youtubePlayer.splash.call(data, state.getUserById(data.actor_user_id));
        }

        if (data.current_entry !== undefined) {
            this.updateCurrentPlayingFromEntry(data.current_entry);
            this.gotoVideoIfNotOnVideoPage(data.current_entry);
        } else {
            this.updateCurrentPlayingTiming(data.playing_since_ms, data.progress_ms);
        }

        if (data.state) {
            this.setRoomState(data.state);
        }

        if (data.trigger === "room.control.seek" && !this.shouldSuppressTimestampUpdate(data)) this.applyTimestamp();
    }

    async onQueueUpdate(queue) {
        if (!queue || !queue.entries) return;
        this.updateCurrentPlayingFromEntry(queue.current_entry);

        const entries = (queue.entries || []).slice().sort((a, b) => {
            const pa = a.position ?? 0;
            const pb = b.position ?? 0;
            return pa - pb;
        });

        const sync = (list, filter) => {
            syncLiveList({
                localList: list,
                remoteItems: filter ? entries.filter(filter) : entries,
                extractRemoteId: (v) => v.id,
                extractLocalId: (u) => u.id,
                createInstance: (item) => new ShareTubeQueueItem(this.app, item),
                updateInstance: (inst, item) => inst.updateFromRemote(item),
            });
        };

        sync(state.queue);
        sync(state.queueQueued, (i) => i.status === "queued");
        sync(state.queuePlayed, (i) => i.status === "played");
        sync(state.queueSkipped, (i) => i.status === "skipped");
        sync(state.queueDeleted, (i) => i.status === "deleted");
    }

    playerStateChange(priorState, newState) {
        if (priorState === "playing" && newState === "paused") return this.app.youtubePlayer.setDesiredState("paused");
        if (priorState === "paused" && newState === "playing") return this.app.youtubePlayer.setDesiredState("playing");
        if (newState === "playing") return this.app.youtubePlayer.setDesiredState("playing");
        if (newState === "starting" || newState === "paused" || newState === "midroll")
            return this.app.youtubePlayer.setDesiredState("paused");
        console.warn(`playerStateChange: no transition implemented. ${priorState} -> ${newState}`);
        return;
    }

    setRoomState(newState) {
        if (!newState) return;
        const priorState = state.roomState.get();
        state.roomState.set(newState);
        this.app.youtubePlayer.onRoomStateChange(newState);
        this.playerStateChange(priorState, newState);
    }

    updateCurrentPlayingFromEntry(entry) {
        state.currentPlaying.item.set(entry);
        this.updateCurrentPlayingTiming(entry?.playing_since_ms, entry?.progress_ms);
    }

    updateCurrentPlayingTiming(playing_since_ms, progress_ms) {
        state.currentPlaying.playing_since_ms.set(playing_since_ms);
        state.currentPlaying.progress_ms.set(progress_ms);
    }

    isForCurrentRoom(code) {
        if (!code) return false;
        return code === state.roomCode.get();
    }

    updateServerClock({ serverNowMs }) {
        const now = Date.now() + state.fakeTimeOffset.get();
        state.serverNowMs.set(serverNowMs);
        const offset = now - serverNowMs;
        state.serverMsOffset.set(offset);
    }

    applyTimestamp() {
        const { progress_ms } = getCurrentPlayingProgressMs();
        if (progress_ms === null) return;
        setTimeout(() => this.app.youtubePlayer.setDesiredProgressMs(progress_ms), 1);
    }

    gotoVideoIfNotOnVideoPage(current_entry) {
        const videoId = current_entry?.video_id;
        if (!videoId) return;
        if (window.location.href.includes(videoId)) return;
        window.location.href = `https://www.youtube.com/watch?v=${videoId}${this.app.stHash(state.roomCode.get())}`;
    }

    async emitSeek(progressMs) {
        return this.app.socket.emit("room.control.seek", {
            progress_ms: progressMs,
            play: state.roomState.get() === "playing",
        });
    }
}
