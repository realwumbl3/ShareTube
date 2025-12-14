import { html } from "../../../shared/dep/zyx.js";
import state from "../../core/state/state.js";
import { currentPlayingProgressMsPercentageToMs, getCurrentPlayingProgressMs } from "../../core/state/getters.js";
import { msDurationTimeStamp } from "../../core/utils/utils.js";

import PlaybackControls from "./PlaybackControls.js";
import { ShareTubeQueueComponent } from "./QueueEntry.js";
import { ShareTubeQueueDrag } from "./QueueDragging.js";

// Global drag state since dataTransfer doesn't work with zyx framework
export default class ShareTubeQueue {
    constructor(app, { isMobileRemote = false } = {}) {
        this.app = app;

        this.dragManager = new ShareTubeQueueDrag();

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
                            src=${state.currentPlaying.item.interp((v) => v?.thumbnailUrl("default") || null)}
                            loading="lazy"
                        />
                    </div>
                    <div class="current_playing_container" zyx-if=${state.currentPlaying.item}>
                        <div class="current_playing_thumbnail" >
                            <img
                                class="thumb"
                                alt=${state.currentPlaying.item.interp((v) => v?.title || "")}
                                src=${state.currentPlaying.item.interp((v) => v?.thumbnailUrl("default") || null)}
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
                            class="queue-list queued"
                            id="sharetube_queue_list"
                            zyx-dragstart=${(e) => this.dragManager.onListDragStart(e)}
                            zyx-dragend=${(e) => this.dragManager.onListDragEnd(e)}
                            zyx-dragover=${(e) => this.dragManager.onListDragOver(e)}
                            zyx-dragenter=${(e) => this.dragManager.onListDragEnter(e)}
                            zyx-dragleave=${(e) => this.dragManager.onListDragLeave(e)}
                            zyx-drop=${(e) => this.dragManager.onListDrop(e)}
                            zyx-live-list=${{
                                list: state.queueQueued,
                                compose: ShareTubeQueueComponent,
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
}
