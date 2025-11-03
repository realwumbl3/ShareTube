import { html, LiveVar } from "../dep/zyx.js";
import state from "../state.js";

export default class ShareTubeQueue {
    constructor(app) {
        this.app = app;

        html`
            <div id="sharetube_queue" zyx-if=${[state.queueVisible, (v) => v]}>
                <div class="queue-header">
                    <span class="queue-title"
                        >Queue (<span id="sharetube_queue_count">${state.queue.interp((v) => v.length)}</span>)</span
                    >
                    <button class="rounded_btn" zyx-click=${() => state.queueVisible.set(!state.queueVisible.get())}>
                        ${state.queueVisible.interp((v) => (v ? "Hide" : "Show"))}
                    </button>
                </div>
                <div
                    class="queue-list"
                    id="sharetube_queue_list"
                    zyx-live-list=${{ list: state.queue, compose: ShareTubeQueueComponent }}
                ></div>
                <div class="queue-footer"></div>
            </div>
        `.bind(this);
    }

    toggleQueueVisibility() {
        state.queueVisible.set(!state.queueVisible.get());
    }
}

export class ShareTubeQueueItem {
    constructor(item) {
        this.id = item.id;
        this.url = item.url || "";
        this.title = item.title || "";
        this.thumbnail_url = item.thumbnail_url || "";
        this.position = new LiveVar(null);
    }
}

// UI component representing a queued YouTube item
export class ShareTubeQueueComponent {
    constructor(item) {
        this.item = item;
        // Render queue item DOM structure and bind LiveVars
        html`
            <div class="queue-item">
                <div class="pos">${this.item.position.interp((v) => v || "")}</div>
                <img class="thumb" alt="" src=${this.item.thumbnail_url} />
                <div class="meta">
                    <div class="title">${this.item.title}</div>
                    <div class="url">${this.item.url}</div>
                </div>
                <button class="x-button">X</button>
            </div>
        `.bind(this);
    }
}
