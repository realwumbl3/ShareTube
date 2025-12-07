import { LiveVar, LiveList } from "./@dep/zyx.js";

class ShareTubeState {
    constructor() {
        this.backendUrl = new LiveVar("https://sharetube.wumbl3.xyz");
        this.debug_mode = new LiveVar(false);
        this.fakeTimeOffset = new LiveVar(1000 * 60 * 60 * 0); // 0 hours

        // Room
        this.roomCode = new LiveVar("");
        this.roomState = new LiveVar("");
        this.adSyncMode = new LiveVar("");
        // Whether this client currently considers itself joined to a room
        this.inRoom = new LiveVar(false);

        // User
        this.avatarUrl = new LiveVar("");
        this.userId = new LiveVar(null);
        this.userReady = new LiveVar(false);

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

        this.currentPlaybackRate = new LiveVar(1);

        this.pillLocked = new LiveVar(false);
    }

    resetRoomState() {
        this.inRoom.set(false);
        this.roomCode.set("");
        this.roomState.set("");
        this.adSyncMode.set("");
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
