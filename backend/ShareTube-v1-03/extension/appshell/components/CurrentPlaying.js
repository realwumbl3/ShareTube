import { html, css } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";
import { currentPlayingProgressMsPercentageToMs, getCurrentPlayingProgressMs } from "../core/state/getters.js";
import { msDurationTimeStamp } from "../core/utils/utils.js";
import { requeueSVG as restartSVG, skipSVG, playSVG, pauseSVG } from "../../shared/assets/svgs.js";
import PlaybackControls from "./PlaybackControls.js";
import { resolveAssetUrl } from "../../shared/urlResolver.js";

css`
    @import url(${resolveAssetUrl("shared/css/queue-current-playing.css")});
`;

export default class CurrentPlaying {
    constructor(app, { isMobileRemote = false } = {}) {
        this.app = app;
        this.isMobileRemote = isMobileRemote;

        this.playbackControls = isMobileRemote ? new PlaybackControls(app) : null;

        html`
            <div this="current_playing" class="current_playing">
                <div class="current_playing_bg">
                    <img
                        class="current_playing_background"
                        src=${state.currentPlaying.item.interp((v) => v?.thumbnailUrl("default") || null)}
                        loading="lazy"
                    />
                </div>
                <div class="current_playing_container" zyx-if=${state.currentPlaying.item}>
                    <div class="current_playing_artwork">
                        <div
                            class="current_playing_thumb_click_area"
                            zyx-click=${() => this.app.virtualPlayer.emitToggleRoomPlayPause()}
                        >
                            <img
                                class="thumb"
                                alt=${state.currentPlaying.item.interp((v) => v?.title || "")}
                                src=${state.currentPlaying.item.interp((v) => v?.thumbnailUrl("large") || null)}
                                loading="lazy"
                                draggable="false"
                            />
                            <div class="current_playing_hover_icon">
                                <img src=${state.currentPlaying.playing_since_ms.interp((v) =>
                                    v > 0 ? pauseSVG : playSVG
                                )} alt="Play/Pause" />
                            </div>
                        </div>
                        <div class="current_playing_meta_overlay">
                            <span class="current_playing_title_overlay"
                                >${state.currentPlaying.item.interp((v) => v?.title)}</span
                            >
                            <span class="current_playing_author_overlay">${state.currentPlaying.item.interp(
                                (v) => v?.youtube_author?.title || "Unknown Author"
                            )}</span>
                        </div>
                        <div class="seekbar_container">
                            <div class="seekbar_button">
                                <button aria-label="Restart video" title="Restart video" zyx-click=${() =>
                                    this.app.virtualPlayer.emitRestartVideo()}>
                                    <img src=${restartSVG} alt="Restart" />
                                </button>
                            </div>
                            <div this="current_playing_progress"
                                class="current_playing_progress"
                                zyx-if=${state.currentPlaying.item}>
                                <div class="progress_bar">
                                    <div class="bar_inner"></div>
                                </div>
                                <div class="current_playing_progress_stamps">
                                    <span class="timestamp-current"
                                        >${state.currentPlaying.timestamp.interp((v) =>
                                            msDurationTimeStamp(v || 0)
                                        )}</span
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
                            <div class="seekbar_button">
                                <button aria-label="Skip video" title="Skip video" zyx-click=${() =>
                                    this.app.virtualPlayer.emitSkipVideo()}>
                                    <img src=${skipSVG} alt="Skip" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="no_video_playing_label" zyx-else>
                    <span class="current_playing_placeholder_text">No video playing</span>
                </div>

                ${this.playbackControls || ""}
            </div>
        `.bind(this);

        /** zyXSense @type {HTMLDivElement} */
        this.current_playing;
        /** zyXSense @type {HTMLDivElement} */
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
}
