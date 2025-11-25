import { LiveVar, LiveList } from "./zyx.js";

class ShareTubeState {
    constructor() {
        this.avatarUrl = new LiveVar("");
        this.userId = new LiveVar(null);
        this.queue = new LiveList([]);
        this.queueVisible = new LiveVar(false);
        this.userIcons = new LiveList([]);
    }
}

const state = new ShareTubeState();
export default state;