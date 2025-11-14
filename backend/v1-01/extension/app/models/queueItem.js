import { LiveVar } from "../dep/zyx.js";

export default class ShareTubeQueueItem {
    constructor(app, item) {
        this.app = app;
        this.id = item.id;
        this.url = item.url || "";
        this.title = item.title || "";
        this.thumbnail_url = item.thumbnail_url || "";
        this.position = new LiveVar(null);
        this.duration_ms = new LiveVar(item.duration_ms || 0);
    }

    async remove() {
        return await this.app.socket.emit("queue.remove", { id: this.id });
    }
}
