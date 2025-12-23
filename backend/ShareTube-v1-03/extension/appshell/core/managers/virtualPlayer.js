import state from "../state/state.js";
import { getCurrentPlayingProgressMs } from "../state/getters.js";
import { syncLiveList } from "../utils/utils.js";
import ShareTubeQueueItem from "../models/queueItem.js";

// Virtual room player: coordinates backend room state, local state, and the YouTube player
export default class VirtualPlayer {
    /**
     * @param {import("../app.js").default} app
     */
    constructor(app) {
        this.app = app;
        this.verbose = false;
        this.eventHandlers = {
            "virtualplayer.user-event": [],
            "virtualplayer.room-join-result": [],
        };
    }

    on(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].push(handler);
        }
    }

    emit(event, ...args) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach((handler) => handler(...args));
        }
    }

    bindListeners(socket) {
        socket.on("queue.added", this.onQueueAdded.bind(this));
        socket.on("queue.removed", this.onQueueRemoved.bind(this));
        socket.on("queue.moved", this.onQueueMoved.bind(this));
        socket.on("user.join.result", this.onRoomJoinResult.bind(this));
        socket.on("room.playback", this.onRoomPlayback.bind(this));
        socket.on("room.settings.update", this.onRoomSettingsUpdate.bind(this));
        socket.on("room.error", this.onRoomError.bind(this));
    }

    async onQueueAdded(data) {
        if (!data.item) return;
        const item = new ShareTubeQueueItem(this.app, data.item);
        state.queue.push(item);
        if (item.status.get() === "queued") state.queueQueued.push(item);
        if (item.status.get() === "played") state.queuePlayed.push(item);
        if (item.status.get() === "skipped") state.queueSkipped.push(item);
        if (item.status.get() === "deleted") state.queueDeleted.push(item);
        this.updateNextUpItem();
    }

    async onQueueRemoved(data) {
        if (!data.id) return;
        if (data.remove) {
            const remove = (list) => {
                const idx = list.findIndex((i) => i.id === data.id);
                if (idx !== -1) list.splice(idx, 1);
            };
            remove(state.queue);
            remove(state.queueQueued);
            remove(state.queuePlayed);
            remove(state.queueSkipped);
            remove(state.queueDeleted);
            this.updateNextUpItem();
            return;
        }

        const item = state.queue.find((i) => i.id === data.id);
        if (item) {
            if (data.position !== undefined) item.position.set(data.position);
            item.status.set(data.status || "deleted");
            this.refreshQueueLists();
            this.updateNextUpItem();
            return;
        }

        this.updateNextUpItem();
    }

    async onQueueMoved(data) {
        if (!data.id) return;
        // Apply bulk updates when provided (used by reorder operations that renumber positions)
        const updates = data?.opts?.updates;
        if (Array.isArray(updates) && updates.length) {
            for (const u of updates) {
                if (!u?.id) continue;
                const it = state.queue.find((i) => i.id === u.id);
                if (!it) continue;
                if (u.position !== undefined) it.position.set(u.position);
                if (u.status !== undefined) it.status.set(u.status);
            }
        } else {
            const item = state.queue.find((i) => i.id === data.id);
            if (!item) return;
            if (data.position !== undefined) item.position.set(data.position);
            if (data.status !== undefined) item.status.set(data.status);
        }

        this.refreshQueueLists();
        this.updateNextUpItem();
    }

    refreshQueueLists() {
        // LiveList behaves like an array; use get() if provided, else treat as array
        const base = typeof state.queue.get === "function" ? state.queue.get() : state.queue;
        const all = (base || []).slice().sort((a, b) => (a.position.get() || 0) - (b.position.get() || 0));

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

    async loadQueueEntries(queue) {
        if (!queue || !queue.entries) return;
        // Clear the queue before populating to prevent duplicates when rejoining
        state.queue.clear();
        for (const entry of queue.entries) {
            const item = new ShareTubeQueueItem(this.app, entry);
            state.queue.push(item);
        }
        this.refreshQueueLists();
        this.updateNextUpItem();
    }

    updateNextUpItem() {
        const currentPlayingId = state.currentPlaying.item.get()?.id;
        const nextUpEntry = state.queueQueued.find(
            (entry) => entry.id !== currentPlayingId && entry.status.get() === "queued"
        );
        state.nextUpItem.set(!nextUpEntry ? null : new ShareTubeQueueItem(this.app, nextUpEntry));
    }

    async onRoomSettingsUpdate(data) {
        const setting = data.setting;
        const value = data.value;

        if (setting === "autoadvance_on_end") {
            state.roomAutoadvanceOnEnd.set(value);
        } else if (setting === "is_private") {
            state.roomIsPrivate.set(value);
        } else if (setting === "ad_sync_mode") {
            state.adSyncMode.set(value);
        }
    }

    async onRoomError(data) {
        // Handle authentication errors - clear auth state so user knows to re-sign in
        if (data.error === "Authentication required") {
            console.warn("ShareTube: Authentication required error, clearing sign-in state");
            try {
                await this.app.clearAuthState();
            } catch (e) {
                console.warn("ShareTube: failed to clear auth state on room error", e);
            }
        }
    }

    async onRoomJoinResult(result) {
        if (!result.ok) return;

        this.updateServerClock(result);
        state.roomCode.set(result.code);
        state.inRoom.set(true);
        this.app.youtubePlayer?.start();

        const snapshot = result.snapshot;
        state.adSyncMode.set(snapshot.ad_sync_mode);
        state.roomAutoadvanceOnEnd.set(snapshot.autoadvance_on_end ?? true);
        state.roomIsPrivate.set(snapshot.is_private ?? true);

        // Calculate if current user is an operator
        const userId = state.userId.get();
        const isOwner = snapshot.owner_id === userId;
        const isOperatorListed = (snapshot.operators || []).includes(userId);
        state.isOperator.set(isOwner || isOperatorListed);

        const currentQueue = snapshot.current_queue;
        const currentEntry = currentQueue?.current_entry;
        if (currentEntry) {
            this.updateCurrentPlayingFromEntry(currentEntry);
            this.gotoVideoIfNotOnVideoPage(currentEntry);
        }

        this.setRoomState(snapshot.state);
        this.loadQueueEntries(currentQueue);

        this.applyTimestamp();
        this.emit("virtualplayer.room-join-result", result);
    }

    async emitSkipVideo() {
        return await this.app.socket.emit("room.control.skip");
    }

    async emitRestartVideo() {
        return await this.app.socket.emit("room.control.restartvideo");
    }

    async emitToggleRoomPlayPause() {
        return await this.app.socket.emit(
            state.roomState.get() === "playing" ? "room.control.pause" : "room.control.play"
        );
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
            const user = state.getUserById(data.actor_user_id);
            this.emit("virtualplayer.user-event", {
                ...data,
                user: user,
            });
        }

        if (data.current_entry !== undefined) {
            this.updateCurrentPlayingFromEntry(data.current_entry);
            this.gotoVideoIfNotOnVideoPage(data.current_entry);
            // Hide continue prompt when a new video starts playing
            state.showContinueNextPrompt.set(false);
        } else {
            this.updateCurrentPlayingTiming(data.playing_since_ms, data.progress_ms);
        }

        if (data.state) {
            this.setRoomState(data.state);
        }

        // Show continue prompt when playback event indicates it and there's a next item
        if (data.show_continue_prompt && state.nextUpItem.get()) {
            state.showContinueNextPrompt.set(true);
        }

        if (data.trigger === "room.control.seek" && !this.shouldSuppressTimestampUpdate(data)) this.applyTimestamp();
    }

    playerStateChange(priorState, newState) {
        if (priorState === "playing" && newState === "paused") return this.app.youtubePlayer?.setDesiredState("paused");
        if (priorState === "paused" && newState === "playing") return this.app.youtubePlayer?.setDesiredState("playing");
        if (newState === "playing") return this.app.youtubePlayer?.setDesiredState("playing");
        if (newState === "starting" || newState === "paused" || newState === "midroll")
            return this.app.youtubePlayer?.setDesiredState("paused");
        console.warn(`playerStateChange: no transition implemented. ${priorState} -> ${newState}`);
        return;
    }

    setRoomState(newState) {
        if (!newState) return;
        const priorState = state.roomState.get();
        state.roomState.set(newState);
        this.app.youtubePlayer?.onRoomStateChange(newState);
        this.playerStateChange(priorState, newState);
    }

    updateCurrentPlayingFromEntry(entry) {
        if (entry === null) {
            state.currentPlaying.item.set(null);
            return;
        }
        state.currentPlaying.item.set(new ShareTubeQueueItem(this.app, entry));
        this.updateCurrentPlayingTiming(entry?.playing_since_ms, entry?.progress_ms);
    }

    updateCurrentPlayingTiming(playing_since_ms, progress_ms) {
        state.currentPlaying.playingSinceMs.set(playing_since_ms);
        state.currentPlaying.progressMs.set(progress_ms);
    }

    isForCurrentRoom(code) {
        if (!code) return false;
        return code === state.roomCode.get();
    }

    updateServerClock({ serverNowMs, clientTimestamp }) {
        const receiveTime = Date.now() + state.fakeTimeOffset.get();
        state.serverNowMs.set(serverNowMs);

        const MS_PER_HOUR = 1000 * 60 * 60;

        // If we have the originating client timestamp, compute NTP-style offset:
        // offset = serverTimeAtSend - (clientSendTime + RTT/2)
        if (Number.isFinite(clientTimestamp)) {
            const rtt = receiveTime - clientTimestamp;
            const offset = serverNowMs - (clientTimestamp + rtt / 2);
            // Round to nearest hour for timezone compensation
            const offsetHours = Math.round(offset / MS_PER_HOUR);
            state.serverMsOffset.set(offsetHours * MS_PER_HOUR);
            return;
        }

        // Fallback to naive offset when client timestamp is unavailable
        const offset = receiveTime - serverNowMs;
        // Round to nearest hour for timezone compensation
        const offsetHours = Math.round(offset / MS_PER_HOUR);
        state.serverMsOffset.set(offsetHours * MS_PER_HOUR);
    }

    applyTimestamp() {
        console.log("applyTimestamp");
        const { progressMs } = getCurrentPlayingProgressMs();
        if (progressMs === null) return;
        console.log("applyTimestamp: progressMs", progressMs);
        setTimeout(() => this.app.youtubePlayer?.setDesiredProgressMs(progressMs), 1);
    }

    gotoVideoIfNotOnVideoPage(current_entry) {
        const videoId = current_entry?.video_id;
        if (!videoId) return;
        if (window.location.href.includes(videoId)) return;
        window.location.href = `https://www.youtube.com/watch?v=${videoId}${this.app.roomManager.stHash(
            state.roomCode.get()
        )}`;
    }

    async emitSeek(progressMs) {
        return this.app.socket.emit("room.control.seek", {
            progress_ms: progressMs,
            play: state.roomState.get() === "playing",
        });
    }

    async emitRelativeSeek(deltaMs) {
        const { progressMs, durationMs } = getCurrentPlayingProgressMs();
        let target = progressMs + deltaMs;
        if (durationMs > 0) target = Math.min(Math.max(0, target), durationMs);
        this.app.socket.emit("room.control.seek", {
            delta_ms: deltaMs,
            progress_ms: target,
            play: state.roomState.get() === "playing",
        });
    }

    async enqueueUrlsOrCreateRoom(urls) {
        if (!urls) return;
        const urlList = Array.isArray(urls) ? urls : [urls];
        if (urlList.length === 0) return;

        if (!state.inRoom.get()) {
            const code = await this.app.createRoom();
            if (code) {
                this.app.roomManager.updateCodeHashInUrl(code);
                await this.app.roomManager.tryJoinRoomFromUrl();
                // Wait for join to complete
                const start = Date.now();
                while (!state.inRoom.get()) {
                    if (Date.now() - start > 5000) break;
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((r) => setTimeout(r, 100));
                }
            }
        }

        if (state.inRoom.get()) {
            urlList.forEach((u) => this.app.enqueueUrl(u));
        }
    }
}
