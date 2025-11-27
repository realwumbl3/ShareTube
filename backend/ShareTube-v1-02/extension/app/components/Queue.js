import { html, LiveVar, css } from "../dep/zyx.js";
import state from "../state.js";
import { currentPlayingProgressMsPercentageToMs, getCurrentPlayingProgressMs } from "../getters.js";

import { msDurationTimeStamp } from "../utils.js";

export default class ShareTubeQueue {
    constructor(app, { isMobileRemote = false } = {}) {
        this.app = app;

        this.isMobileRemote = isMobileRemote;

        html`
            <div
                id="sharetube_queue"
                class="SlideDisplayToggle"
                role="complementary"
                aria-label="ShareTube queue"
                zyx-if=${[state.queueVisible, (v) => v]}
            >
                <div class="queue-header">
                    <span class="queue-title">Queue (${state.queue.interp((v) => v.length)})</span>
                    <button
                        class="rounded_btn"
                        ${this.isMobileRemote ? "style='display: none;'" : ""}
                        aria-label="Toggle queue visibility"
                        title="Toggle queue visibility"
                        zyx-click=${() => state.queueVisible.set(!state.queueVisible.get())}
                    >
                        ${state.queueVisible.interp((v) => (v ? "Hide" : "Show"))}
                    </button>
                </div>

                <div this="current_playing" class="current_playing" zyx-if=${state.currentPlaying.item}>
                    <div class="current_playing_header">
                        <span class="current_playing_header_title">Current playing</span>
                    </div>
                    <div class="current_playing_container">
                        <div class="current_playing_thumbnail">
                            <img
                                class="thumb"
                                alt=${state.currentPlaying.item.interp((v) => v?.title || "")}
                                src=${state.currentPlaying.item.interp((v) => v?.thumbnail_url)}
                                loading="lazy"
                            />
                            <div class="current_playing_duration">
                                ${state.currentPlaying.item.interp((v) => msDurationTimeStamp(v?.duration_ms || 0))}
                            </div>
                        </div>
                        <div class="current_playing_meta">
                            <span class="current_playing_title"
                                >${state.currentPlaying.item.interp((v) => v?.title)}</span
                            >
                            <span class="current_playing_url">${state.currentPlaying.item.interp((v) => v?.url)}</span>
                        </div>
                    </div>
                    <div this="current_playing_progress" class="current_playing_progress">
                        <div class="progress_bar">
                            <div class="bar_inner"></div>
                        </div>
                        <div class="current_playing_progress_stamps">
                            <span class="timestamp-current"
                                >${state.currentPlaying.timestamp.interp((v) => msDurationTimeStamp(v || 0))}</span
                            >
                            <span class="timestamp-progress"
                                >${state.currentPlaying.progress_ms.interp(
                                    (v) => `PROGRESS: ${msDurationTimeStamp(v) || "00:00:00"}`
                                )}</span
                            >
                            <span></span>
                            <span class="timestamp-duration"
                                >${state.currentPlaying.item.interp((v) =>
                                    msDurationTimeStamp(v?.duration_ms || 0)
                                )}</span
                            >
                            <span class="timestamp-playing-since"
                                >${state.currentPlaying.playing_since_ms.interp(
                                    (v) => `PLAYING SINCE: ${msDurationTimeStamp(v) || "Paused..."}`
                                )}</span
                            >
                        </div>
                    </div>
                </div>
                <div class="no_video_playing_label" zyx-else>
                    <span class="current_playing_placeholder_text">No video playing</span>
                </div>

                <div class="queues">
                    <div class="queue_container" zyx-radioview="queues.queued">
                        <div
                            zyx-if=${[state.queueQueued, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queueQueued,
                                compose: ShareTubeQueueComponent,
                                filter: (v) => v.status.get() === "queued",
                            }}
                        ></div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">Queue is empty</span>
                        </div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.played">
                        <div
                            zyx-if=${[state.queuePlayed, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queuePlayed,
                                compose: ShareTubeQueueComponent,
                                filter: (v) => v.status.get() === "played",
                            }}
                        ></div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">No videos played</span>
                        </div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.skipped">
                        <div
                            zyx-if=${[state.queueSkipped, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queueSkipped,
                                compose: ShareTubeQueueComponent,
                                filter: (v) => v.status.get() === "skipped",
                            }}
                        ></div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">No videos skipped</span>
                        </div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.deleted">
                        <div
                            zyx-if=${[state.queueDeleted, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queueDeleted,
                                compose: ShareTubeQueueComponent,
                                filter: (v) => v.status.get() === "deleted",
                            }}
                        ></div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">No videos deleted</span>
                        </div>
                    </div>
                </div>
                <div class="queue_selector">
                    <div class="queue_selector_item" zyx-radioview="queues.queued.open">
                        <span class="queue_selector_item_text"
                            >Queued (${state.queueQueued.interp((v) => v.length)})</span
                        >
                    </div>
                    <div class="queue_selector_item" zyx-radioview="queues.played.open">
                        <span class="queue_selector_item_text"
                            >Played (${state.queuePlayed.interp((v) => v.length)})</span
                        >
                    </div>
                    <div class="queue_selector_item" zyx-radioview="queues.skipped.open">
                        <span class="queue_selector_item_text"
                            >Skipped (${state.queueSkipped.interp((v) => v.length)})</span
                        >
                    </div>
                    <div class="queue_selector_item" zyx-radioview="queues.deleted.open">
                        <span class="queue_selector_item_text"
                            >Deleted (${state.queueDeleted.interp((v) => v.length)})</span
                        >
                    </div>
                </div>
                <div class="queue-footer"></div>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.current_playing;
        /** zyXSense @type {HTMLDivElement} */
        this.current_playing_progress;

        /** zyx-sense @type {HTMLDivElement} */
        this.current_playing;
        /** zyx-sense @type {HTMLDivElement} */
        this.current_playing_progress;

        this.secondTimerInterval = null;
        this.startSecondTimer();

        this.current_playing_progress.addEventListener("click", this.onCurrentPlayingProgressBarClick.bind(this));
    }

    onCurrentPlayingProgressBarClick(e) {
        const progressBar = this.current_playing_progress;
        const bounds = progressBar.getBoundingClientRect();
        const x = e.clientX - bounds.left;
        const progressPercentage = Math.max(0, Math.min(1, x / bounds.width));
        const progressMs = currentPlayingProgressMsPercentageToMs(progressPercentage);
        if (typeof progressMs === "number" && this.app.virtualPlayer) {
            this.app.virtualPlayer.emitSeek(progressMs);
        }
    }

    startSecondTimer() {
        this.secondTimerInterval = setInterval(this.updateTimeSeek.bind(this), 500);
    }

    updateTimeSeek() {
        const { progress_ms, duration_ms } = getCurrentPlayingProgressMs();
        if (progress_ms === null) return;
        const percent = progress_ms / duration_ms;
        state.currentPlaying.timestamp.set(progress_ms);
        this.current_playing_progress.style.setProperty("--progress-int", percent);
    }

    toggleQueueVisibility() {
        state.queueVisible.set(!state.queueVisible.get());
    }
}

import { openInNewTabSVG, linkSVG, xSVG, requeueSVG } from "../assets/svgs.js";

// UI component representing a queued YouTube item
export class ShareTubeQueueComponent {
    /**
     * @param {ShareTubeQueueItem} item
     */
    constructor(item) {
        this.item = item;
        // Render queue item DOM structure and bind LiveVars
        html`
            <div class="queue-item" data-id=${this.item.id}>
                <div class="queue-item-thumbnail">
                    <img class="thumb" alt="${this.item.title || ""}" src="${this.item.thumbnail_url}" loading="lazy" />
                    <div class="queue-item-duration">${msDurationTimeStamp(this.item.duration_ms)}</div>
                </div>
                <div class="meta">
                    <div class="author" zyx-click=${() => this.item.openYoutubeAuthorUrl()}>
                        ${this.item.youtube_author?.title}
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
                                // copy to clipboard
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
                        zyx-if=${[this.item.status, (v) => v !== "queued"]}
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
