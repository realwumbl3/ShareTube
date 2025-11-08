import { html, LiveVar, css } from "../dep/zyx.js";
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
                <div class="current_playing" zyx-if=${state.currentPlaying}>
                    <span class="current_playing_title">${state.currentPlaying.interp((v) => v.title)}</span>
                    <span class="current_playing_url">${state.currentPlaying.interp((v) => v.url)}</span>
                </div>
                <div class="current_playing_placeholder" zyx-else>
                    <span class="current_playing_placeholder_text">No video playing</span>
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
    constructor(app, item) {
        this.app = app;
        this.id = item.id;
        this.url = item.url || "";
        this.title = item.title || "";
        this.thumbnail_url = item.thumbnail_url || "";
        this.position = new LiveVar(null);
    }

    remove() {
        this.app.socket.withSocket(async (socket) => await socket.emit("queue.remove", { id: this.id }));
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
                <button class="x-button" zyx-click=${() => this.removeFromQueue()}>X</button>
            </div>
        `.bind(this);
    }

    removeFromQueue() {
        this.item.remove();
    }
}

css`
    #sharetube_queue {
        min-width: 320px;
        max-width: 520px;
        max-height: 300px;
        overflow: hidden;
        color: var(--yt-spec-text-primary, #fff);
        background: rgba(18, 18, 18, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(1em);
        border-radius: 12px;
        pointer-events: auto;
    }

    #sharetube_queue.hidden {
        display: none;
    }

    #sharetube_queue .queue-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        gap: 8px;
    }

    #sharetube_queue .queue-title {
        font-weight: 600;
        font-size: 13px;
        opacity: 0.9;
    }

    #sharetube_queue .queue-toggle {
        appearance: none;
        background: rgba(255, 255, 255, 0.08);
        color: var(--yt-spec-text-primary, #fff);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
    }

    #sharetube_queue .queue-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 240px;
        overflow: auto;
        padding: 6px;
    }

    #sharetube_queue .queue-item {
        display: grid;
        grid-template-columns: auto auto 1fr auto;
        grid-template-areas: "pos thumb meta x-button";
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 12px;
        word-break: break-word;
    }

    #sharetube_queue .queue-item .meta {
        grid-area: meta;
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 2px;
    }

    #sharetube_queue .queue-item .meta .title {
        grid-area: title;
        font-weight: 600;
        font-size: 12px;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-box-orient: vertical;
    }

    #sharetube_queue .queue-item .meta .url {
        opacity: 0.7;
        font-size: 11px;
    }

    #sharetube_queue .queue-item img.thumb {
        width: 64px;
        height: 36px;
        object-fit: cover;
        border-radius: 6px;
        background: #111;
        flex: 0 0 auto;
    }

    #sharetube_queue .queue-item .x-button {
        background: rgba(255, 255, 255, 0.08);
        color: var(--yt-spec-text-primary, #fff);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        line-height: 0;
        font-size: 10px;
        padding: 8px;
        cursor: pointer;
        margin-left: 4px;
        font-weight: 600;
        user-select: none;
    }

    #sharetube_queue .queue-footer {
        display: flex;
        justify-content: space-between;
        padding: 6px;
    }
`;
