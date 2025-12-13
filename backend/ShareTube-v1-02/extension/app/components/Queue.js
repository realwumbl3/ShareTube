import { html, LiveVar, css } from "../@dep/zyx.js";
import state from "../state.js";
import { currentPlayingProgressMsPercentageToMs, getCurrentPlayingProgressMs } from "../getters.js";

import { msDurationTimeStamp } from "../utils.js";

import PlaybackControls from "./PlaybackControls.js";

// Global drag state since dataTransfer doesn't work with zyx framework
export default class ShareTubeQueue {
    constructor(app, { isMobileRemote = false } = {}) {
        this.app = app;

        this.dragState = {
            draggedItemId: null,
            draggedItem: null,
        };

        this.isMobileRemote = isMobileRemote;

        this.playbackControls = isMobileRemote ? new PlaybackControls(app) : null;

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
                    <div class="queue-controls">
                        <button
                            class="rounded_btn autoadvance-toggle"
                            disabled=${state.isOperator.interp((v) => !v || null)}
                            aria-label="Toggle auto advance"
                            title=${state.roomAutoadvanceOnEnd.interp(
                                (v) => `Auto advance ${v ? "ON" : "OFF"} - Click to toggle`
                            )}
                            zyx-click=${() => this.toggleAutoadvance()}
                        >
                            Auto advance ${state.roomAutoadvanceOnEnd.interp((v) => (v ? "ON" : "OFF"))}
                        </button>
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
                </div>

                <div this="current_playing" class="current_playing">
                    <div class="current_playing_bg">
                        <img
                            class="current_playing_background"
                            src=${state.currentPlaying.item.interp((v) => v?.thumbnail_url || null)}
                            loading="lazy"
                        />
                    </div>
                    <div class="current_playing_container" zyx-if=${state.currentPlaying.item}>
                        <div class="current_playing_thumbnail" >
                            <img
                                class="thumb"
                                alt=${state.currentPlaying.item.interp((v) => v?.title || "")}
                                src=${state.currentPlaying.item.interp((v) => v?.thumbnail_url || null)}
                                loading="lazy" draggable="false"
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
                    <div class="no_video_playing_label" zyx-else>
                        <span class="current_playing_placeholder_text">No video playing</span>
                    </div>
                    <div this="current_playing_progress" 
                    class="current_playing_progress" 
                    zyx-if=${state.currentPlaying.item}>
                        <div class="progress_bar">
                            <div class="bar_inner"></div>
                        </div>
                        <div class="current_playing_progress_stamps">
                            <span class="timestamp-current"
                                >${state.currentPlaying.timestamp.interp((v) => msDurationTimeStamp(v || 0))}</span
                            >
                            <span class="timestamp-progress" title="Progress since last pause/start" 
                                >${state.currentPlaying.progress_ms.interp(
                                    (v) => `PROGRESS: ${msDurationTimeStamp(v) || "00:00:00"}`
                                )}</span
                            >
                            <span title="Progress since last pause/start">
                            <span class="timestamp-duration"
                                >${state.currentPlaying.item.interp((v) =>
                                    msDurationTimeStamp(v?.duration_ms || 0)
                                )}</span
                            >
                            <span class="timestamp-playing-since"
                            title="Time when the video started/resumed playing"
                                >${state.currentPlaying.playing_since_ms.interp(
                                    (v) => `PLAYING SINCE: ${msDurationTimeStamp(v) || "Paused..."}`
                                )}</span
                            >
                        </div>
                    </div>
                    ${this.playbackControls || ""}
                </div>


                <div class="queues">
                    <div class="queue_container" zyx-radioview="queues.queued">
                        <div
                            zyx-if=${[state.queueQueued, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-dragstart=${(e) => this.onListDragStart(e)}
                            zyx-dragend=${(e) => this.onListDragEnd(e)}
                            zyx-dragover=${(e) => this.onListDragOver(e)}
                            zyx-dragenter=${(e) => this.onListDragEnter(e)}
                            zyx-dragleave=${(e) => this.onListDragLeave(e)}
                            zyx-drop=${(e) => this.onListDrop(e)}
                            zyx-live-list=${{
                                list: state.queueQueued,
                                compose: (item) => new ShareTubeQueueComponent(item, { draggable: true }),
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

                <div class="queue-footer" this=footer></div>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.current_playing;
        /** zyXSense @type {HTMLDivElement} */
        this.current_playing_progress;
        /** zyXSense @type {HTMLDivElement} */
        this.footer;

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

    findQueueItemAtPosition(clientY) {
        // Find which queue item is at the given Y position
        const queueItems = document.querySelectorAll(".queue-item");
        for (const item of queueItems) {
            const rect = item.getBoundingClientRect();
            if (clientY >= rect.top && clientY <= rect.bottom) {
                return {
                    element: item,
                    id: item.dataset.id,
                    rect: rect,
                };
            }
        }
        return null;
    }

    onListDragStart(e) {
        // Find which queue item we're starting to drag from
        const targetItem = this.findQueueItemAtPosition(e.e.clientY);
        if (!targetItem) return;

        // Store drag state globally
        this.dragState.draggedItemId = targetItem.id;
        this.dragState.draggedItem = state.queue.find((item) => item.id == targetItem.id);

        // Add visual feedback to the dragged item
        targetItem.element.classList.add("dragging");
    }

    onListDragEnd(e) {
        // Clear global drag state
        this.dragState.draggedItemId = null;
        this.dragState.draggedItem = null;

        // Remove all visual feedback
        document
            .querySelectorAll(".queue-item.dragging, .queue-item.drop-target-above, .queue-item.drop-target-below")
            .forEach((el) => {
                el.classList.remove("dragging", "drop-target-above", "drop-target-below");
            });
    }

    onListDragEnter(e) {
        e.e.preventDefault();
    }

    onListDragLeave(e) {
        // Only remove indicators if we're actually leaving the list container
        const rect = e.target.getBoundingClientRect();
        const x = e.e.clientX;
        const y = e.e.clientY;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            this.clearDropTargetIndicators();
        }
    }

    onListDragOver(e) {
        e.e.preventDefault();
        e.e.dataTransfer.dropEffect = "move";

        const draggedItemId = this.dragState.draggedItemId;
        if (!draggedItemId) return;

        // Find target item at mouse position
        const clientY = e.e.clientY;
        const targetItem = this.findQueueItemAtPosition(clientY);
        if (!targetItem || targetItem.id === draggedItemId) {
            // Remove indicators if not over a valid target
            this.clearDropTargetIndicators();
            return;
        }

        // Remove previous indicators
        const midpoint = targetItem.rect.top + targetItem.rect.height / 2;
        this.setDropTargetIndicator(targetItem.element, clientY >= midpoint);
    }

    async onListDrop(e) {
        e.e.preventDefault();

        const draggedItemId = this.dragState.draggedItemId;
        const draggedItem = this.dragState.draggedItem;

        if (!draggedItemId || !draggedItem) {
            return;
        }

        // Find target item at drop position
        const targetItem = this.findQueueItemAtPosition(e.e.clientY);
        if (!targetItem || targetItem.id === draggedItemId) {
            return;
        }

        // Determine position (before/after) based on mouse position
        const midpoint = targetItem.rect.top + targetItem.rect.height / 2;
        const insertBefore = e.e.clientY < midpoint;

        this.clearDropTargetIndicators();

        try {
            await draggedItem.moveToPosition(targetItem.id, insertBefore ? "before" : "after");
        } catch (error) {
            console.error("Failed to move queue item:", error);
        }
    }

    async toggleAutoadvance() {
        const newValue = !state.roomAutoadvanceOnEnd.get();
        try {
            await this.app.socket.emit("room.settings.autoadvance_on_end.set", {
                autoadvance_on_end: newValue,
                code: state.roomCode.get(),
            });
        } catch (error) {
            console.warn("Failed to toggle autoadvance:", error);
            // Could show a toast or error message here
        }
    }

    clearDropTargetIndicators() {
        document.querySelectorAll(".queue-item.drop-target-above, .queue-item.drop-target-below").forEach((el) => {
            el.classList.remove("drop-target-above", "drop-target-below");
        });
    }

    setDropTargetIndicator(targetElement, isBelow) {
        this.clearDropTargetIndicators();
        if (isBelow) {
            targetElement.classList.add("drop-target-below");
        } else {
            targetElement.classList.add("drop-target-above");
        }
    }
}

import { openInNewTabSVG, linkSVG, xSVG, requeueSVG } from "../@assets/svgs.js";

// UI component representing a queued YouTube item
export class ShareTubeQueueComponent {
    /**
     * @param {ShareTubeQueueItem} item
     */
    constructor(item, { draggable = false } = {}) {
        this.item = item;
        this.draggable = new LiveVar(draggable);
        // Render queue item DOM structure and bind LiveVars
        html`
            <div class="queue-item" data-id=${this.item.id}>
                <div zyx-if=${this.draggable} class="queue-item-drag-handle" title="Drag to reorder" draggable="true">
                    ≡
                </div>
                <div class="queue-item-thumbnail">
                    <img
                        class="thumb"
                        alt="${this.item.title || ""}"
                        src="${this.item.thumbnail_url}"
                        loading="lazy"
                        draggable="false"
                    />
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
