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
                    zyx-live-list=${{ list: state.queue, compose: ShareTubeQueueItem }}
                ></div>
                <div class="queue-footer"></div>
            </div>
        `.bind(this);
    }

    toggleQueueVisibility() {
        state.queueVisible.set(!state.queueVisible.get());
    }
}

// UI component representing a queued YouTube item
export class ShareTubeQueueItem {
    constructor(url, title = "", thumbnail_url = "") {
        this.url = url;
        this.title = new LiveVar(title);
        this.thumbnail_url = new LiveVar(thumbnail_url);
        this.position = new LiveVar(null);
        // Render queue item DOM structure and bind LiveVars
        html`
            <div class="queue-item">
                <div class="pos" zyx-if=${[this.position, (v) => v != null]}>${this.position.interp((v) => v)}</div>
                <img
                    class="thumb"
                    alt=""
                    src=${this.thumbnail_url.interp((v) => v || "")}
                    zyx-if=${this.thumbnail_url}
                />
                <div class="meta">
                    <div class="title">${this.title.interp((v) => v || url)}</div>
                    <div class="url">${url}</div>
                </div>
                <button class="x-button">X</button>
            </div>
        `.bind(this);
    }
}
