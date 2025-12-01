import { html, css, LiveVar } from "/extension/app/dep/zyx.js";
import state from "/extension/app/state.js";
import { getCurrentPlayingProgressMs, currentPlayingProgressMsPercentageToMs } from "/extension/app/getters.js";

import { playSVG, pauseSVG, skipSVG, idleSVG, startingSVG, remoteSVG, errorSVG } from "/extension/app/assets/svgs.js";
export default class PlaybackControls {
    constructor(app) {
        this.app = app;
        this.currentTime = new LiveVar(0);
        this.duration = new LiveVar(1);
        this.isDragging = false;

        this.startTicker();

        html`
            <div class="remote-playback-controls">
                <div class="progress-container">
                    <div class="time-info">
                        <span class="time-current">${this.currentTime.interp((t) => this.formatTime(t))}</span>
                        <span class="time-duration">${this.duration.interp((t) => this.formatTime(t))}</span>
                    </div>
                    <input
                        this="progressSlider"
                        type="range"
                        class="progress-slider"
                        min="0"
                        max="1"
                        value="0"
                        step="0.001"
                        zyx-input=${(e) => this.handleSeekInput(e)}
                        zyx-change=${(e) => this.handleSeekChange(e)}
                    />
                </div>

                <div class="control-buttons">
                    <button
                        class="control-btn secondary-btn"
                        title="Restart Video"
                        zyx-click=${() => this.handlePrevious()}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <polygon points="19 20 9 12 19 4 19 20"></polygon>
                            <line x1="5" y1="19" x2="5" y2="5"></line>
                        </svg>
                    </button>

                    <button title="Seek -10s" class="control-btn seek-btn" zyx-click=${() => this.handleSeek(-10)}>
                        <svg
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="M11 17l-5-5 5-5" />
                            <path d="M6 12h9a6 6 0 0 1 6 6v1" />
                        </svg>
                        <span class="seek-text">10</span>
                    </button>

                    <button
                        title="Toggle Play/Pause"
                        class="control-btn play-btn"
                        zyx-click=${() => this.handleTogglePlayPause()}
                    >
                        <div class="play-icon-container">
                            <img src=${state.roomState.interp((status) => this.stateToButtonLabel(status))} />
                        </div>
                    </button>

                    <button title="Seek +10s" class="control-btn seek-btn" zyx-click=${() => this.handleSeek(10)}>
                        <svg
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="M13 17l5-5-5-5" />
                            <path d="M18 12H9a6 6 0 0 0-6 6v1" />
                        </svg>
                        <span class="seek-text">10</span>
                    </button>

                    <button title="Skip to Next" class="control-btn secondary-btn" zyx-click=${() => this.handleNext()}>
                        <svg
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <polygon points="5 4 15 12 5 20 5 4"></polygon>
                            <line x1="19" y1="5" x2="19" y2="19"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLInputElement} */
        this.progressSlider;

        }

    startTicker() {
        setInterval(() => {
            const { progress_ms, duration_ms } = getCurrentPlayingProgressMs();

            if (duration_ms && duration_ms > 0) {
                const durationSeconds = duration_ms / 1000;
                this.duration.set(durationSeconds);
            }

            if (!this.isDragging && progress_ms !== null && duration_ms && duration_ms > 0) {
                let t = progress_ms / 1000;
                if (t < 0) t = 0;
                if (t > this.duration.get()) t = this.duration.get();
                this.currentTime.set(t);

                // Update slider value as percentage (0-1)
                if (this.progressSlider) {
                    const percentage = Math.max(0, Math.min(1, progress_ms / duration_ms));
                    this.progressSlider.value = percentage.toString();
                }
            }
        }, 200);
    }

    handleSeekInput(e) {
        this.isDragging = true;
        const percentage = parseFloat(e.target.value);
        const durationSeconds = this.duration.get();
        const time = percentage * durationSeconds;
        this.currentTime.set(time);
    }

    handleSeekChange(e) {
        this.isDragging = false;
        const percentage = parseFloat(e.target.value);
        const progressMs = currentPlayingProgressMsPercentageToMs(percentage);

        if (typeof progressMs === "number" && this.app.virtualPlayer) {
            this.app.virtualPlayer.emitSeek(progressMs);
        }
    }

    stateToButtonLabel(state) {
        switch (state) {
            case "playing":
                return pauseSVG;
            case "paused":
                return playSVG;
            case "starting":
            case "midroll":
                return startingSVG;
            case "idle":
                return idleSVG;
            default:
                return errorSVG;
        }
    }

    handleTogglePlayPause() {
        this.app.togglePlayPause();
    }

    handlePrevious() {
        this.app.restartVideo();
    }

    handleNext() {
        this.app.skipToNext();
    }

    handleSeek(delta) {
        this.app.relativeSeek(delta);
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
}

css`
    .remote-playback-controls {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        width: 100%;
        & {
            .progress-container {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                padding: 0 0.5rem;
            }

            .time-info {
                display: flex;
                justify-content: space-between;
                font-size: 0.85rem;
                color: var(--text-secondary);
                font-family: var(--font-mono, monospace);
                font-weight: 500;
            }

            .progress-slider {
                -webkit-appearance: none;
                width: 100%;
                height: 6px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
                outline: none;
                transition: height 0.2s;
                cursor: pointer;
            }

            .progress-slider:hover {
                height: 8px;
            }

            /* Slider Thumb */
            .progress-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: var(--accent-primary, #00f3ff);
                cursor: pointer;
                box-shadow: 0 0 10px rgba(0, 243, 255, 0.5);
                transition: transform 0.1s;
                margin-top: -6px; /* Center thumb on track */
            }

            .progress-slider::-webkit-slider-thumb:active {
                transform: scale(1.2);
                background: #fff;
            }

            .progress-slider::-moz-range-thumb {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: var(--accent-primary, #00f3ff);
                cursor: pointer;
                box-shadow: 0 0 10px rgba(0, 243, 255, 0.5);
                transition: transform 0.1s;
                border: none;
            }

            .progress-slider::-moz-range-thumb:active {
                transform: scale(1.2);
                background: #fff;
            }

            /* Slider Track */
            .progress-slider::-webkit-slider-runnable-track {
                width: 100%;
                height: 6px;
                cursor: pointer;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
            }

            .progress-slider::-moz-range-track {
                width: 100%;
                height: 6px;
                cursor: pointer;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
            }

            .control-buttons {
                display: flex;
                justify-content: space-between; /* Distribute evenly */
                align-items: center;
                padding: 0 1rem;
            }

            .control-btn {
                background: transparent;
                border: none;
                color: var(--text-primary);
                width: 48px;
                height: 48px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                    box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }

            /* Secondary buttons (Skip/Prev) slightly smaller/dimmer */
            .secondary-btn {
                color: var(--text-secondary);
                width: 42px;
                height: 42px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .secondary-btn svg {
                width: 20px;
                height: 20px;
            }

            .secondary-btn:hover {
                color: var(--text-primary);
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
                transform: translateY(-2px);
            }

            .seek-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0;
            }

            .seek-btn svg {
                width: 20px;
                height: 20px;
                margin-bottom: -4px; /* Pull text closer */
            }

            .seek-text {
                font-size: 9px;
                font-weight: 700;
                font-family: var(--font-mono, monospace);
                opacity: 0.9;
                margin-top: 2px;
                line-height: 1;
            }

            .seek-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
                transform: translateY(-2px);
            }

            .seek-btn:active {
                transform: scale(0.95);
            }

            .play-btn {
                width: 72px;
                height: 72px;
                background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
                border-radius: 50%;
                box-shadow: 0 10px 25px rgba(0, 243, 255, 0.3);
                color: #000; /* Icon color inside bright button */
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .play-btn img {
                filter: brightness(0) saturate(100%); /* Make SVG black */
                width: 32px;
                height: 32px;
            }

            .play-btn:hover {
                transform: scale(1.05);
                box-shadow: 0 15px 35px rgba(0, 243, 255, 0.4);
            }

            .play-btn:active {
                transform: scale(0.95);
            }

            .play-icon-container {
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* Touch Optimizations */
            @media (hover: none) {
                .control-btn {
                    /* Larger tap targets on touch */
                    min-width: 48px;
                    min-height: 48px;
                }

                .play-btn {
                    width: 80px;
                    height: 80px;
                }
            }
        }
    }
`;
