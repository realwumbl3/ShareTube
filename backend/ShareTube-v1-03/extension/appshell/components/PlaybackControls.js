import { html, css, LiveVar } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";
import {
    playSVG,
    pauseSVG,
    skipSVG,
    idleSVG,
    startingSVG,
    remoteSVG,
    errorSVG,
    previousSVG,
    seekBackwardSVG,
    seekForwardSimpleSVG,
} from "../../shared/assets/svgs.js";

export default class PlaybackControls {
    constructor(app) {
        this.app = app;

        html`
            <div class="playback-controls" draggable="false">
                <div class="control-buttons">
                    <button
                        class="control-btn secondary-btn"
                        title="Restart Video"
                        zyx-click=${() => this.handlePrevious()}
                    >
                        <img src=${previousSVG} width="18" height="18" draggable="false" />
                    </button>

                    <button title="Seek -10s" class="control-btn seek-btn" zyx-click=${() => this.handleSeek(-10)}>
                        <img src=${seekBackwardSVG} width="18" height="18" draggable="false" />
                        <span class="seek-text">10</span>
                    </button>

                    <button
                        title="Toggle Play/Pause"
                        class="control-btn play-btn"
                        zyx-click=${() => this.handleTogglePlayPause()}
                    >
                        <div class="play-icon-container">
                            <img
                                src=${state.roomState.interp((status) => this.stateToButtonLabel(status))}
                                draggable="false"
                            />
                        </div>
                    </button>

                    <button title="Seek +10s" class="control-btn seek-btn" zyx-click=${() => this.handleSeek(10)}>
                        <img src=${seekForwardSimpleSVG} width="18" height="18" draggable="false" />
                        <span class="seek-text">10</span>
                    </button>

                    <button title="Skip to Next" class="control-btn secondary-btn" zyx-click=${() => this.handleNext()}>
                        <img src=${skipSVG} width="18" height="18" draggable="false" />
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
        padding-top: 4px;
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
                transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                    box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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
