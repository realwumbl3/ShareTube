import { LiveVar, LiveList } from "./dep/zyx.js";

class ShareTubeState {
    constructor() {
        this.fakeTimeOffset = new LiveVar(1000 * 60 * 60 * 0); // 0 hours

        // Room
        this.roomCode = new LiveVar("");
        this.roomState = new LiveVar("");

        // User
        this.avatarUrl = new LiveVar("");
        this.userId = new LiveVar(null);

        // Server
        this.serverNowMs = new LiveVar(0);
        this.serverMsOffset = new LiveVar(0);

        // Users
        this.users = new LiveList([]);

        // Queue
        this.queue = new LiveList([]);
        this.queueQueued = new LiveList([]);
        this.queuePlayed = new LiveList([]);
        this.queueSkipped = new LiveList([]);
        this.queueDeleted = new LiveList([]);

        this.queueVisible = new LiveVar(false);

        // Current playing
        this.currentPlaying = {
            item: new LiveVar(null),
            playing_since_ms: new LiveVar(0),
            progress_ms: new LiveVar(0),
            timestamp: new LiveVar(0),
        };
    }

    serverDateNow() {
        return Date.now() + this.serverMsOffset.get() + this.fakeTimeOffset.get();
    }

    getUserById(userId) {
        return this.users.find((u) => u && u.id === userId) || null;
    }
}

const state = new ShareTubeState();
export default state;
