import { html, css, LiveVar, throttle } from "../dep/zyx.js";

import state from "../state.js";

export default class Controls {
    constructor(app) {
        this.app = app;
        this.buttonLabel = new LiveVar("Play");
        html`
            <div id="sharetube_controls">
                <button class="main_btn" zyx-click=${(e) => this.onMainButtonClick(e)}>
                    ${state.roomState.interp((v) => this.stateToButtonLabel(v))}
                </button>
                <button class="main_btn" zyx-click=${(e) => this.onSkipButtonClick(e)}>Skip</button>
            </div>
        `.bind(this);
    }

    stateToButtonLabel(state) {
        switch (state) {
            case "playing":
                return "Pause";
            case "paused":
                return "Play";
            case "starting":
                return "Starting...";
            case "idle":
                return "Start";
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
        gap: 8px;
        pointer-events: auto;
    }
    #sharetube_controls .main_btn {
        all: unset;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: var(--yt-spec-text-primary, #fff);
        border: 1px solid rgba(255, 255, 255, 0.12);
        cursor: pointer;
        line-height: 1;
    }
`;
