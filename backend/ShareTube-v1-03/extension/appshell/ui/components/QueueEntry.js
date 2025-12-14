import { html, LiveVar } from "../../../shared/dep/zyx.js";
import { msDurationTimeStamp } from "../../core/utils/utils.js";
import { openInNewTabSVG, linkSVG, xSVG, requeueSVG } from "../../../shared/assets/svgs.js";

// UI component representing a queued YouTube item
export class ShareTubeQueueComponent {
    /**
     * @param {ShareTubeQueueItem} item
     */
    constructor(item) {
        this.item = item;
        this.isQueued = new LiveVar(item.status.get() === "queued");
        html`
            <div class="queue-item" data-id=${this.item.id}>
                <div zyx-if=${this.isQueued} class="queue-item-drag-handle" title="Drag to reorder" draggable="true">
                    ≡
                </div>
                <div class="queue-item-thumbnail">
                    <img
                        class="thumb"
                        alt="${this.item.title || ""}"
                        src="${this.item.thumbnailUrl("medium")}"
                        loading="lazy"
                        draggable="false"
                    />
                    <div class="queue-item-duration">${msDurationTimeStamp(this.item.duration_ms)}</div>
                </div>
                <div class="meta">
                    <div class="author-row">
                        <span class="up-next-badge">Up next</span>
                        <div class="author" zyx-click=${() => this.item.openYoutubeAuthorUrl()}>
                            ${this.item.youtube_author?.title}
                        </div>
                    </div>
                    <div class="url">
                        <div class="title">${this.item.title}</div>
                        <span
                            class="link-drag-icon"
                            draggable="true"
                            title="Drag link or click to copy to clipboard."
                            zyx-dragstart=${(e) => {
                                e.e.dataTransfer.setData("text/plain", this.item.url);
                                e.e.dataTransfer.effectAllowed = "copyLink";
                            }}
                            zyx-click=${(e) => {
                                e.e.preventDefault();
                                e.e.stopPropagation();
                                navigator.clipboard.writeText(this.item.url);
                            }}
                        >
                            <img src="${linkSVG}" alt="Drag link" />
                        </span>
                        <span class="external-link-icon" title="Open in new tab" zyx-click=${() => this.item.openUrl()}>
                            <img src="${openInNewTabSVG}" alt="Open in new tab" />
                        </span>
                    </div>
                </div>
                <div class="queue-item-actions">
                    <button
                        class="x-button"
                        type="button"
                        aria-label="Remove from queue"
                        title="Remove from queue"
                        zyx-click=${() => this.removeFromQueue()}
                    >
                        <img src="${xSVG}" alt="Remove" />
                    </button>
                    <button
                        zyx-if=${[this.isQueued, (v) => !v]}
                        class="requeue-button"
                        type="button"
                        aria-label="Move back to top of queue"
                        title="Move back to top of queue"
                        zyx-click=${() => this.moveToTop()}
                    >
                        <img src="${requeueSVG}" alt="Requeue" />
                    </button>
                </div>
            </div>
        `.bind(this);
    }

    removeFromQueue() {
        this.item.remove();
    }

    moveToTop() {
        this.item.requeueToTop();
    }
}
