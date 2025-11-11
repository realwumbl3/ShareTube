import { LiveVar, LiveList } from "./dep/zyx.js";

class ShareTubeState {
    constructor() {
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
        this.queueVisible = new LiveVar(false);

        // Current playing
        this.currentPlaying = {
            item: new LiveVar(null),
            playing_since_ms: new LiveVar(0),
            progress_ms: new LiveVar(0),
            duration_ms: new LiveVar(0),
            paused_at: new LiveVar(0),
        };
    }
}

const state = new ShareTubeState();
export default state;
