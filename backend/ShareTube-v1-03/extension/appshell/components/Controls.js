import { html, css, throttle } from "../../shared/dep/zyx.js";

import state from "../core/state/state.js";

import { playSVG, pauseSVG, skipSVG, idleSVG, startingSVG, remoteSVG, errorSVG } from "../../shared/assets/svgs.js";

export default class Controls {
    constructor(app) {
        this.app = app;
        html`
            <div
                id="sharetube_controls"
                zyx-if=${[state.roomCode, state.isOperator, (roomCode, isOperator) => roomCode && isOperator]}
            >
                <div class="control">
                    <button
                        title=${state.roomState.interp((v) => this.stateToButtonTitle(v))}
                        class="main_btn"
                        zyx-click=${(e) => this.onMainButtonClick(e)}
                    >
                        <img
                            src=${state.roomState.interp((v) => this.stateToButtonLabel(v))}
                            alt=${this.stateToButtonTitle(state.roomState.get())}
                        />
                    </button>
                </div>
                <div
                    class="control"
                    zyx-if=${[
                        state.nextUpItem,
                        state.roomState,
                        (nextUpItem, roomState) => nextUpItem !== null && !["idle"].includes(roomState),
                    ]}
                >
                    <button title="Skip to next video" class="main_btn" zyx-click=${(e) => this.onSkipButtonClick(e)}>
                        <img src=${skipSVG} alt="Skip" />
                    </button>
                </div>
                <div class="control">
                    <button
                        title="Open remote control"
                        class="main_btn qr_btn"
                        zyx-click=${(e) => this.onQRButtonClick(e)}
                    >
                        <img src=${remoteSVG} alt="Remote" />
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

    stateToButtonTitle(state) {
        switch (state) {
            case "playing":
                return "Pause playback";
            case "paused":
                return "Play playback";
            case "starting":
            case "midroll":
                return "Starting playback, please wait...";
            case "idle":
                return "Idle, no playback is currently playing";
            default:
                return "Error, unknown playback state";
        }
    }

    async onMainButtonClick() {
        throttle(
            this,
            "onMainButtonClick",
            async () => {
                return await this.app.virtualPlayer.emitToggleRoomPlayPause();
            },
            1000
        );
    }

    async onSkipButtonClick() {
        throttle(
            this,
            "onSkipButtonClick",
            async () => {
                return await this.app.virtualPlayer.emitSkipVideo();
            },
            10000
        );
    }

    onQRButtonClick() {
        this.app.qrCode.show();
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
        cursor: pointer;
        &:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.18);
        }
        &:active {
            transform: translateY(1px);
        }
        transition: background 140ms ease, border-color 140ms ease, transform 80ms ease;
    }
    #sharetube_controls .control .main_btn img {
        width: 16px;
        height: 16px;
        display: block;
    }

    #sharetube_controls .control .main_btn span {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
    }

    #sharetube_controls .control .main_btn span svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
    }
`;
