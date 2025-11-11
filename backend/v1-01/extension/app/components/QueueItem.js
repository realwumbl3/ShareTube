import { html } from "../dep/zyx.js";
import ShareTubeQueueItem from "../models/queueItem.js";

// UI component representing a queued YouTube item
export default class ShareTubeQueueComponent {
    /**
     * @param {ShareTubeQueueItem} item
     */
    constructor(item) {
        this.item = item;
        // Render queue item DOM structure and bind LiveVars
        html`
            <div class="queue-item" data-id=${this.item.id}>
                <div class="queue-item-thumbnail">
                    <img class="thumb" alt=${this.item.title || ""} src=${this.item.thumbnail_url} loading="lazy" />
                    <div class="queue-item-duration">
                        ${this.item.duration_ms.interp((v) => (v ? new Date(v).toISOString().substr(11, 8) : "") || "")}
                    </div>
                </div>
                <div class="meta">
                    <div class="title">${this.item.title}</div>
                    <div class="url">${this.item.url}</div>
                </div>
                <button
                    class="x-button"
                    type="button"
                    aria-label="Remove from queue"
                    title="Remove from queue"
                    zyx-click=${() => this.removeFromQueue()}
                >
                    X
                </button>
            </div>
        `.bind(this);
    }

    removeFromQueue() {
        this.item.remove();
    }
}
