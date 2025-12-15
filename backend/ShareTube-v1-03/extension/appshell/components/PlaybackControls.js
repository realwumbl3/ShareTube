import { html, css, LiveVar } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";
import { playSVG, pauseSVG, skipSVG, idleSVG, startingSVG, remoteSVG, errorSVG } from "../../shared/assets/svgs.js";

export default class PlaybackControls {
    constructor(app) {
        this.app = app;

        html`
            <div class="playback-controls" draggable="false">
                <div class="control-buttons">
                    <button class="control-btn secondary-btn" title="Restart Video" zyx-click=${() => this.handlePrevious()}>
                        <svg
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            draggable="false"
                        >
                            <polygon points="19 20 9 12 19 4 19 20"></polygon>
                            <line x1="5" y1="19" x2="5" y2="5"></line>
                        </svg>
                    </button>

                    <button title="Seek -10s" class="control-btn seek-btn" zyx-click=${() => this.handleSeek(-10)}>
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 17l-5-5 5-5" />
                            <path d="M6 12h9a6 6 0 0 1 6 6v1" />
                        </svg>
                        <span class="seek-text">10</span>
                    </button>

                    <button title="Toggle Play/Pause" class="control-btn play-btn" zyx-click=${() => this.handleTogglePlayPause()}>
                        <div class="play-icon-container">
                            <img src=${state.roomState.interp((status) => this.stateToButtonLabel(status))} draggable="false" />
                        </div>
                    </button>

                    <button title="Seek +10s" class="control-btn seek-btn" zyx-click=${() => this.handleSeek(10)}>
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M13 17l5-5-5-5" />
                            <path d="M18 12H9a6 6 0 0 0-6 6v1" />
                        </svg>
                        <span class="seek-text">10</span>
                    </button>

                    <button title="Skip to Next" class="control-btn secondary-btn" zyx-click=${() => this.handleNext()}>
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="5 4 15 12 5 20 5 4"></polygon>
                            <line x1="19" y1="5" x2="19" y2="19"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `.bind(this);
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
}

css`
    .playback-controls {
        display: grid;
        padding-top: 0.4rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        place-items: stretch;
        align-self: stretch;
        user-select: none;

        & {
            .control-buttons {
                display: grid;
                grid-auto-flow: column;
                grid-auto-columns: 1fr;
                align-items: stretch;
                gap: 0.5rem;
                width: 100%;
                inset: 0;
                justify-items: stretch;
                align-content: stretch;
                height: 5em;
            }

            .control-btn {
                background: transparent;
                border: none;
                color: var(--text-primary, #eee);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }

            /* Secondary buttons (Skip/Prev) slightly smaller/dimmer */
            .secondary-btn {
                color: var(--text-secondary, #aaa);
            }

            .secondary-btn svg {
                width: 18px;
                height: 18px;
            }

            .secondary-btn:hover {
                color: var(--text-primary, #eee);
                transform: translateY(-2px);
            }

            .seek-btn {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0;
            }

            .seek-btn svg {
                width: 18px;
                height: 18px;
                margin-bottom: -4px; /* Pull text closer */
            }

            .seek-text {
                font-size: 8px;
                font-weight: 700;
                font-family: var(--font-mono, monospace);
                opacity: 0.9;
                margin-top: 2px;
                line-height: 1;
            }

            .seek-btn:hover {
                transform: scale(1.05);
            }

            .seek-btn:active {
                transform: scale(0.95);
            }

            .play-btn {
                background: linear-gradient(135deg, var(--accent-primary, #00f3ff), var(--accent-secondary, #00aaff));
                box-shadow: 0 8px 20px rgba(0, 243, 255, 0.3);
                color: #000;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 1em;
            }

            .play-btn img {
                filter: brightness(0) saturate(100%); /* Make SVG black */
                width: 28px;
                height: 28px;
            }

            .play-btn:hover {
                transform: scale(1.05);
                box-shadow: 0 12px 28px rgba(0, 243, 255, 0.4);
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
                    min-width: 44px;
                    min-height: 44px;
                }

                .play-btn {
                    width: 68px;
                    height: 68px;
                }
            }
        }
    }
`;
