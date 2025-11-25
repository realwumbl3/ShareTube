import { html, css, LiveVar, throttle } from "../dep/zyx.js";

import state from "../state.js";

const playSVG = chrome.runtime.getURL("app/assets/play.svg");
const pauseSVG = chrome.runtime.getURL("app/assets/pause.svg");
const skipSVG = chrome.runtime.getURL("app/assets/skip.svg");
const idleSVG = chrome.runtime.getURL("app/assets/idle.svg");
const startingSVG = chrome.runtime.getURL("app/assets/starting.svg");

export default class Controls {
    constructor(app) {
        this.app = app;
        html`
            <div id="sharetube_controls" zyx-if=${state.roomCode}>
                <div class="control">
                    <button class="main_btn" zyx-click=${(e) => this.onMainButtonClick(e)}>
                        <img src=${state.roomState.interp((v) => this.stateToButtonLabel(v))} alt="Play" />
                    </button>
                </div>
                <div class="control">
                    <button class="main_btn" zyx-click=${(e) => this.onSkipButtonClick(e)}>
                        <img src=${skipSVG} alt="Skip" />
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
        }
    }

    async onMainButtonClick() {
        throttle(
            this,
            "onMainButtonClick",
            async () => {
                return await this.app.socket.emit(
                    state.roomState.get() === "playing" ? "room.control.pause" : "room.control.play"
                );
            },
            1000
        );
    }

    async onSkipButtonClick() {
        throttle(
            this,
            "onSkipButtonClick",
            async () => {
                return await this.app.socket.emit("room.control.skip");
            },
            10000
        );
    }
}

css`
    #sharetube_controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        pointer-events: auto;
        height: 100%;
    }
    #sharetube_controls .control {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }
    #sharetube_controls .control .main_btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: var(--yt-spec-text-primary, #fff);
        border: 1px solid rgba(255, 255, 255, 0.12);
    }
    #sharetube_controls .control .main_btn img {
        width: 16px;
        height: 16px;
        display: block;
    }
`;
