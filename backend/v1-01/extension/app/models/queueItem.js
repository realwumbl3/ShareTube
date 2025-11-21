import { LiveVar } from "../dep/zyx.js";

export default class ShareTubeQueueItem {
    constructor(app, item) {
        this.app = app;
        this.id = item.id;
        this.url = item.url || "";
        this.title = item.title || "";
        this.thumbnail_url = item.thumbnail_url || "";
        this.position = new LiveVar(item.position ?? null);
        this.duration_ms = new LiveVar(item.duration_ms || 0);
        this.status = new LiveVar(item.status || "queued");
    }

    async remove() {
        return await this.app.socket.emit("queue.remove", { id: this.id });
    }

    /**
     * Update this instance from a fresh remote queue entry payload.
     * Keeps object identity stable while reflecting latest metadata/position.
     */
    updateFromRemote(item) {
        if (!item) return;
        if (item.position != null) this.position.set(item.position);
        if (item.duration_ms != null) this.duration_ms.set(item.duration_ms);
        if (item.status != null) this.status.set(item.status);
    }
}
