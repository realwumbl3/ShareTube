import { html, css } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";
import { currentPlayingProgressMsPercentageToMs, getCurrentPlayingProgressMs } from "../core/state/getters.js";
import { msDurationTimeStamp } from "../core/utils/utils.js";
import {
    requeueSVG as restartSVG,
    skipSVG,
    playSVG,
    pauseSVG,
    seekBackwardSVG,
    seekForwardSimpleSVG,
} from "../../shared/assets/svgs.js";
import PlaybackControls from "./PlaybackControls.js";
import { resolveAssetUrl } from "../../shared/urlResolver.js";
import ContinueNextOverlay from "./ContinueNextOverlay.js";
import Splash from "./Splash.js";

css`
    @import url(${resolveAssetUrl("shared/css/hub-current-playing.css")});

    .current_playing_thumb_container {
        position: relative;
        width: 100%;
        height: 100%;
    }

    .seek-back-btn,
    .seek-forward-btn {
        all: unset;
        background: rgba(0, 0, 0, 0.8);
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        cursor: pointer;
        border-radius: 50%;
        padding: 4px;
    }

    .seek-back-btn {
        left: 12px;
    }

    .seek-forward-btn {
        right: 12px;
    }

    .seek-back-btn img,
    .seek-forward-btn img {
        width: 14px;
        height: 14px;
        filter: brightness(0) invert(1);
    }

    .current_playing_thumb_container:hover .seek-back-btn,
    .current_playing_thumb_container:hover .seek-forward-btn {
        opacity: 1;
    }

    .seek-back-btn:hover,
    .seek-forward-btn:hover {
        background: rgba(0, 0, 0, 0.9);
        transform: translateY(-50%) scale(1.1);
    }

    .seek-back-btn:active,
    .seek-forward-btn:active {
        transform: translateY(-50%) scale(0.95);
    }
`;

export default class CurrentPlaying {
    constructor(app, { isMobileRemote }) {
        this.app = app;

        // this.playbackControls = isMobileRemote ? new PlaybackControls(app) : null;

        this.continueNextOverlay = new ContinueNextOverlay(app);
        this.splash = new Splash();

        this.app.virtualPlayer.on("virtualplayer.user-event", (data) => {
            this.splash.call(data);
        });

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
                    <div class="currently_playing_header">
                        <div class="current_playing_meta_overlay">
                            <span class="current_playing_title_overlay"
                                >${state.currentPlaying.item.interp((v) => v?.title)}</span
                            >
                            <span class="current_playing_author_overlay"
                                >${state.currentPlaying.item.interp(
                                    (v) => v?.youtube_author?.title || "Unknown Author"
                                )}</span
                            >
                        </div>
                        <button
                            class="rounded_btn toggle-embedded-player-btn"
                            zyx-if=${isMobileRemote}
                            aria-label="Toggle embedded player"
                            title="Toggle embedded player"
                            zyx-click=${() => state.embeddedPlayerVisible.set(!state.embeddedPlayerVisible.get())}
                        >
                            ${state.embeddedPlayerVisible.interp((v) => (v ? "Hide Player" : "Show Player"))}
                        </button>
                    </div>
                    <div class="current_playing_artwork">
                        <div class="current_playing_thumb_container">
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
                                    <img
                                        title="Seek back 10 seconds"
                                        zyx-click=${(e) => this.handleSeek(e, -10000)}
                                        src=${seekBackwardSVG}
                                        alt="Seek back"
                                        draggable="false"
                                    />
                                    <img
                                        src=${state.currentPlaying.playing_since_ms.interp((v) =>
                                            v > 0 ? pauseSVG : playSVG
                                        )}
                                        alt="Play/Pause"
                                        draggable="false"
                                    />
                                    <img
                                        title="Seek forward 10 seconds"
                                        zyx-click=${(e) => this.handleSeek(e, 10000)}
                                        src=${seekForwardSimpleSVG}
                                        alt="Seek forward"
                                        draggable="false"
                                    />
                                </div>
                            </div>
                        </div>
                        <div class="seekbar_container">
                            <div class="seekbar_button">
                                <button
                                    aria-label="Restart video"
                                    title="Restart video"
                                    zyx-click=${() => this.app.virtualPlayer.emitRestartVideo()}
                                >
                                    <img src=${restartSVG} alt="Restart" />
                                </button>
                            </div>
                            <div
                                this="current_playing_progress"
                                class="current_playing_progress" 
                                zyx-if=${state.currentPlaying.item}
                            >
                                <div class="progress_bar">
                                    <div class="bar_inner"></div>
                                </div>
                                <div class="current_playing_progress_stamps">
                                    <span class="timestamp-current"
                                        >${state.currentPlayingTimestamp.interp((v) =>
                                            msDurationTimeStamp(v || 0)
                                        )}</span
                                    >
                                    <span class="timestamp-duration"
                                        >${state.currentPlaying.item.interp((v) =>
                                            msDurationTimeStamp(v?.duration_ms || 0)
                                        )}</span
                                    >
                                </div>
                            </div>
                            <div class="seekbar_button">
                                <button
                                    aria-label="Skip video"
                                    title="Skip video"
                                    zyx-click=${() => this.app.virtualPlayer.emitSkipVideo()}
                                >
                                    <img src=${skipSVG} alt="Skip" />
                                </button>
                            </div>
                        </div>
                    </div>
                    ${this.continueNextOverlay} ${this.splash}
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

    handleSeek(e, delta) {
        console.log("handleSeek", e, delta);
        e.e.stopPropagation();
        e.e.stopImmediatePropagation();
        if (this.app.virtualPlayer) {
            this.app.virtualPlayer.emitRelativeSeek(delta);
        }
    }

    startSecondTimer() {
        this.secondTimerInterval = setInterval(this.updateTimeSeek.bind(this), 500);
    }

    updateTimeSeek() {
        const { progress_ms, duration_ms } = getCurrentPlayingProgressMs();
        if (progress_ms === null) return;
        const percent = progress_ms / duration_ms;
        state.currentPlayingTimestamp.set(progress_ms);
        this.current_playing_progress.style.setProperty("--progress-int", percent);
    }
}
