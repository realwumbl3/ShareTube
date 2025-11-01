import { LiveVar, LiveList } from "./dep/zyx.js";

class ShareTubeState {
    constructor() {
        this.currentRoomCode = new LiveVar("");
        this.avatarUrl = new LiveVar("");
        this.userId = new LiveVar(null);
        this.queue = new LiveList([]);
        this.queueVisible = new LiveVar(false);
        this.users = new LiveList([]);
    }
}

const state = new ShareTubeState();
export default state;
