import { html, LiveVar, css } from "../dep/zyx.js";
import { zyxInput } from "../app.js";
import state from "../state.js";
import { currentPlayingProgressMsPercentageToMs, getCurrentPlayingProgressMs } from "../getters.js";

import { msDurationTimeStamp } from "../utils.js";

export default class ShareTubeQueue {
    constructor(app) {
        this.app = app;

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
                            <span>${state.currentPlaying.timestamp.interp((v) => msDurationTimeStamp(v || 0))}</span
                            ><span></span>
                            <span
                                >${state.currentPlaying.item.interp((v) =>
                                    msDurationTimeStamp(v?.duration_ms || 0)
                                )}</span
                            >
                        </div>
                    </div>
                    <div class="playing_status">
                        <div class="playing_status_progress">
                            Progress:
                            ${state.currentPlaying.progress_ms.interp((v) => msDurationTimeStamp(v) || "00:00:00")}
                        </div>
                        <div class="playing_status_playing_since">
                            Playing since:
                            ${state.currentPlaying.playing_since_ms.interp(
                                (v) => msDurationTimeStamp(v) || "Paused..."
                            )}
                        </div>
                    </div>
                </div>
                <div class="no_video_playing_label" zyx-else>
                    <span class="current_playing_placeholder_text">No video playing</span>
                </div>

                <div class="queues">
                    <div class="queue_container" zyx-radioview="queues.queued">
                        <div
                            zyx-if=${[state.queue, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queue,
                                compose: ShareTubeQueueComponent,
                                filter: (v) => {
                                    console.log("filter", v);
                                    return v.status.get() === "queued";
                                },
                            }}
                        ></div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">Queue is empty</span>
                        </div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.played">
                        <div
                            zyx-if=${[state.queue, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queue,
                                compose: ShareTubeQueueComponent,
                                filter: (v) => v.status.get() === "played",
                            }}
                        ></div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">Queue is empty</span>
                        </div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.skipped">
                        <div
                            zyx-if=${[state.queue, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queue,
                                compose: ShareTubeQueueComponent,
                                filter: (v) => v.status.get() === "skipped",
                            }}
                        ></div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.deleted">
                        <div
                            zyx-if=${[state.queue, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queue,
                                compose: ShareTubeQueueComponent,
                                filter: (v) => v.status.get() === "deleted",
                            }}
                        ></div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">Queue is empty</span>
                        </div>
                    </div>
                </div>
                <div class="queue_selector">
                    <div class="queue_selector_item" zyx-radioview="queues.queued.open">
                        <span class="queue_selector_item_text">Queued</span>
                    </div>
                    <div class="queue_selector_item" zyx-radioview="queues.played.open">
                        <span class="queue_selector_item_text">Played</span>
                    </div>
                    <div class="queue_selector_item" zyx-radioview="queues.skipped.open">
                        <span class="queue_selector_item_text">Skipped</span>
                    </div>
                    <div class="queue_selector_item" zyx-radioview="queues.deleted.open">
                        <span class="queue_selector_item_text">Deleted</span>
                    </div>
                </div>
                <div class="queue-footer"></div>
            </div>
        `.bind(this);
        /** zyx-sense @type {HTMLDivElement} */
        this.current_playing;
        /** zyx-sense @type {HTMLDivElement} */
        this.current_playing_progress;

        zyxInput.bindMomentumScroll(this.sharetube_queue_list, { direction: "y" });

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
        console.log("onCurrentPlayingProgressBarClick", { progressPercentage, progressMs });
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
