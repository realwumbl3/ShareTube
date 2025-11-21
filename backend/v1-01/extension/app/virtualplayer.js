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
    }

    bindListeners(socket) {
        socket.on("queue.update", this.onQueueUpdate.bind(this));
        socket.on("room.state.update", this.onRoomStateUpdate.bind(this));
        socket.on("user.join.result", this.onRoomJoinResult.bind(this));
        socket.on("room.playback", this.onRoomPlayback.bind(this));
        socket.on("queue.probe", this.onQueueProbe.bind(this));
    }

    async onQueueProbe(data) {
        console.log("onQueueProbe: data", data);
    }

    async onRoomJoinResult(result) {
        if (!result.ok) return;

        this.updateServerClock(result);
        state.roomCode.set(result.code);

        const currentQueue = result.snapshot.current_queue;
        this.updateCurrentPlayingFromEntry(currentQueue?.current_entry);
        this.gotoVideoIfNotOnVideoPage(currentQueue?.current_entry);

        this.onRoomStateUpdate(result.snapshot);
        this.app.updateCodeHashInUrl(result.code);
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

    async onRoomPlayback(data) {
        console.log("onRoomPlayback: data", data);
        if (!this.isForCurrentRoom(data.code)) return;

        // Show actor avatar if present
        if (data.actor_user_id) {
            this.app.player.splash.call(data, state.getUserById(data.actor_user_id));
        }

        // When a playback event includes a concrete current_entry object,
        // update the currently playing entry and navigate to it if needed.
        if (data.current_entry !== undefined) {
            this.updateCurrentPlayingFromEntry(data.current_entry);
            this.gotoVideoIfNotOnVideoPage(data.current_entry);
        } else {
            this.updateCurrentPlayingTiming(data.playing_since_ms, data.progress_ms);
        }

        if (data.state) {
            this.setRoomState(data.state);
        }

        this.applyTimestamp();
    }

    async onQueueUpdate(queue) {
        if (!queue || !queue.entries) return;
        this.updateCurrentPlayingFromEntry(queue.current_entry);
        syncLiveList({
            localList: state.queue,
            // Keep client ordering in sync with server-side position
            remoteItems: (queue.entries || []).slice().sort((a, b) => {
                const pa = a.position ?? 0;
                const pb = b.position ?? 0;
                return pa - pb;
            }),
            extractRemoteId: (v) => v.id,
            extractLocalId: (u) => u.id,
            createInstance: (item) => new ShareTubeQueueItem(this.app, item),
            updateInstance: (inst, item) => inst.updateFromRemote(item),
        });
    }

    playerStateChange(priorState, newState) {
        if (priorState === "playing" && newState === "paused") return this.app.player.setDesiredState("paused");
        if (priorState === "paused" && newState === "playing") return this.app.player.setDesiredState("playing");
        if (newState === "playing") return this.app.player.setDesiredState("playing");
        if (newState === "starting" || newState === "paused") return this.app.player.setDesiredState("paused");
        console.warn(`playerStateChange: no transition implemented. ${priorState} -> ${newState}`);
        return;
    }

    setRoomState(newState) {
        if (!newState) return;
        const priorState = state.roomState.get();
        state.roomState.set(newState);
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
        setTimeout(() => this.app.player.setDesiredProgressMs(progress_ms), 1);
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
