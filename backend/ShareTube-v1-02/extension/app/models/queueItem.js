import { LiveVar } from "../@dep/zyx.js";

export default class ShareTubeQueueItem {
    constructor(app, item) {
        this.app = app;
        this.id = item.id;
        this.url = item.url || "";
        this.title = item.title || "";
        this.duration_ms = item.duration_ms;
        this.thumbnail_url = item.thumbnail_url || "";
        this.position = new LiveVar(item.position ?? null);
        this.status = new LiveVar(item.status || "queued");
        this.youtube_author = item.youtube_author || null;
    }

    async remove() {
        return await this.app.socket.emit("queue.remove", { id: this.id });
    }

    async requeueToTop() {
        return await this.app.socket.emit("queue.requeue_to_top", { id: this.id });
    }

    async moveToPosition(targetId, position) {
        return await this.app.socket.emit("queue.move", {
            id: this.id,
            target_id: targetId,
            position: position
        });
    }

    /**
     * Update this instance from a fresh remote queue entry payload.
     * Keeps object identity stable while reflecting latest metadata/position.
     */
    updateFromRemote(item) {
        if (!item) return;
        if (item.position != null) this.position.set(item.position);
        if (item.status != null) this.status.set(item.status);
    }

    openUrl() {
        window.open(this.url, "_blank");
    }

    openYoutubeAuthorUrl() {
        window.open(
            `https://www.youtube.com/${
                this.youtube_author?.custom_url || `channel/${this.youtube_author?.channel_id}`
            }`,
            "_blank"
        );
    }
}
