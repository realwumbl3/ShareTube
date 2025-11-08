import { LiveVar, LiveList } from "./dep/zyx.js";

class ShareTubeState {
    constructor() {
        this.roomCode = new LiveVar("");
        this.roomState = new LiveVar("");
        this.avatarUrl = new LiveVar("");
        this.userId = new LiveVar(null);
        this.queue = new LiveList([]);
        this.queueVisible = new LiveVar(false);
        this.currentPlaying = new LiveVar(null);
        this.users = new LiveList([]);
    }
}

const state = new ShareTubeState();
export default state;
