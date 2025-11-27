import { html, css, LiveVar } from "/extension/app/dep/zyx.js";
import state from "/extension/app/state.js";

import { playSVG, pauseSVG, skipSVG, idleSVG, startingSVG, remoteSVG, errorSVG } from "/extension/app/assets/svgs.js";

export default class PlaybackControls {
    constructor(app) {
        this.app = app;

        html`
            <div class="playback-controls">
                <div class="control-buttons">
                    <button class="control-btn" zyx-click=${() => this.handlePrevious()}>
                        <img src=${skipSVG} alt="Previous" style="transform: rotate(180deg);" />
                    </button>
                    <button class="control-btn play-btn" zyx-click=${() => this.handleTogglePlayPause()}>
                        <img src=${state.roomState.interp((status) => this.stateToButtonLabel(status))} />
                    </button>
                    <button class="control-btn" zyx-click=${() => this.handleNext()}>
                        <img src=${skipSVG} alt="Next" />
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

    handleVolumeChange(e) {
        // Volume control not implemented in main app yet
        const value = Number(e.target.value);
        this.volume.set(Number.isNaN(value) ? 75 : value);
        console.log("Mobile Remote: Volume control not implemented");
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
}

css`
    .playback-controls {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .control-buttons {
        display: flex;
        justify-content: center;
        gap: 1rem;
        align-items: center;
    }

    .control-btn {
        background: radial-gradient(circle at top, rgba(255, 255, 255, 0.12), rgba(54, 54, 54, 0.9));
        border: 1px solid rgba(255, 255, 255, 0.22);
        color: var(--text-primary);
        width: 60px;
        height: 60px;
        border-radius: 50%;
        font-size: 1.5rem;
        cursor: pointer;
        transition: background 140ms ease, border-color 140ms ease, transform 80ms ease;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
    }

    .control-btn::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at center, rgba(0, 243, 255, 0.1), transparent 70%);
        opacity: 0;
        transition: opacity 0.3s;
    }

    .control-btn:hover {
        background: radial-gradient(circle at top, rgba(255, 255, 255, 0.18), rgba(68, 68, 68, 0.95));
        border-color: rgba(255, 255, 255, 0.32);
        transform: translateY(-1px);
    }

    .control-btn:hover::before {
        opacity: 1;
    }

    .control-btn:active {
        transform: scale(0.95);
    }

    .play-btn {
        width: 80px;
        height: 80px;
        font-size: 2rem;
    }
`;
