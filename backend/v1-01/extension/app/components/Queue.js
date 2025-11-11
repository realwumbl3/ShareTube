import { html, LiveVar, css } from "../dep/zyx.js";
import state from "../state.js";

import { msDurationTimeStamp } from "../utils.js";

import ShareTubeQueueComponent from "./QueueItem.js";

export default class ShareTubeQueue {
    constructor(app) {
        this.app = app;

        html`
            <div
                id="sharetube_queue"
                role="complementary"
                aria-label="ShareTube queue"
                zyx-if=${[state.queueVisible, (v) => v]}
            >
                <div class="queue-header">
                    <span class="queue-title">
                        Queue (<span id="sharetube_queue_count" aria-live="polite"
                            >${state.queue.interp((v) => v.length)}</span
                        >)
                    </span>
                    <button
                        class="rounded_btn"
                        aria-label="Toggle queue visibility"
                        title="Toggle queue visibility"
                        zyx-click=${() => state.queueVisible.set(!state.queueVisible.get())}
                    >
                        ${state.queueVisible.interp((v) => (v ? "Hide" : "Show"))}
                    </button>
                </div>

                <div class="current_playing" zyx-if=${state.currentPlaying.item}>
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
                    <div class="playing_status">
                        <div class="current_playing_progress">
                            Progress: ${state.currentPlaying.progress_ms.interp((v) => msDurationTimeStamp(v || 0))}
                        </div>
                        <div class="current_playing_playing_since">
                            Playing since:
                            ${state.currentPlaying.playing_since_ms.interp((v) => msDurationTimeStamp(v || 0))}
                        </div>
                    </div>
                </div>
                <div class="current_playing_placeholder" zyx-else>
                    <span class="current_playing_placeholder_text">No video playing</span>
                </div>

                <div
                    class="queue-list"
                    id="sharetube_queue_list"
                    zyx-live-list=${{ list: state.queue, compose: ShareTubeQueueComponent }}
                    zyx-if=${[state.queue, (v) => v.length > 0]}
                ></div>
                <div class="queue-empty" zyx-else>
                    <span class="queue-empty-text">Queue is empty</span>
                </div>

                <div class="queue-footer"></div>
            </div>
        `.bind(this);
    }

    toggleQueueVisibility() {
        state.queueVisible.set(!state.queueVisible.get());
    }
}
