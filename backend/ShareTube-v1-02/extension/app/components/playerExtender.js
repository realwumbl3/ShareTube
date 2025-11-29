import { html, css } from "../dep/zyx.js";
import state from "../state.js";
import { seekRewindPath, seekRewindArrow, seekForwardPath, seekForwardArrow } from "../assets/svgs.js";

css`
    .ytp-bezel-text-hide {
        display: none !important;
    }

    .ytp-sharetube-custom-button {
        all: unset;
        display: inline-grid;
        place-items: center;
        width: 51px;
        border: none;
        cursor: pointer;
        background: transparent;
        position: relative;

        &:hover > .ytp-sharetube-extended-button-icon::before {
            content: "";
            border-radius: 999px;
            position: absolute;
            width: calc(100% - 8px);
            height: calc(100% - 8px);
            background: rgba(255, 255, 255, 0.12);
            pointer-events: none;
            z-index: -1;
        }

        .ytp-sharetube-extended-button-icon {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            padding: 4px;
            border-radius: 999px;
            opacity: 0.9;
            position: relative;
            -webkit-backdrop-filter: var(--yt-frosted-glass-backdrop-filter-override, blur(16px));
            backdrop-filter: var(--yt-frosted-glass-backdrop-filter-override, blur(16px));
            background: var(--yt-spec-overlay-background-medium-light, rgba(0, 0, 0, 0.3));
            &:hover {
                opacity: 1;
                background: var(--yt-spec-overlay-background-medium-light, rgba(0, 0, 0, 0.4));
            }
            & > svg {
                fill: white;
                box-sizing: border-box;
                pointer-events: none;
                display: block;
                width: 60%;
                height: 60%;
            }
        }
    }
`;

export default class PlayerExtender {
    constructor(youtubePlayer) {
        this.youtubePlayer = youtubePlayer;
        this.observer = null;

        // Create the button templates
        html`
            <button
                this="left_button"
                class="ytp-sharetube-custom-button"
                aria-label="Seek -5 seconds"
                title="Seek -5 seconds"
                zyx-click=${() => this.seekRelative(-5)}
            >
                <div class="ytp-sharetube-extended-button-icon">
                    <svg height="100%" version="1.1" viewBox="0 0 24 24" width="100%">
                        <path
                            d="${seekRewindPath}"
                            fill="none"
                            stroke="#fff"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="${seekRewindArrow}"
                            fill="none"
                            stroke="#fff"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <text
                            x="12"
                            y="14"
                            text-anchor="middle"
                            dominant-baseline="middle"
                            font-size="10px"
                            font-weight="bold"
                            fill="#fff"
                            stroke="none"
                        >
                            5
                        </text>
                    </svg>
                </div>
            </button>
            <button
                this="right_button"
                class="ytp-sharetube-custom-button"
                aria-label="Seek +5 seconds"
                title="Seek +5 seconds"
                zyx-click=${() => this.seekRelative(5)}
            >
                <div class="ytp-sharetube-extended-button-icon">
                    <svg height="100%" version="1.1" viewBox="0 0 24 24" width="100%">
                        <path
                            d="${seekForwardPath}"
                            fill="none"
                            stroke="#fff"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="${seekForwardArrow}"
                            fill="none"
                            stroke="#fff"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <text
                            x="12"
                            y="14"
                            text-anchor="middle"
                            dominant-baseline="middle"
                            font-size="10px"
                            font-weight="bold"
                            fill="#fff"
                            stroke="none"
                        >
                            5
                        </text>
                    </svg>
                </div>
            </button>
        `.bind(this);
        /** zyXSense @type {HTMLButtonElement} */
        this.left_button;
        /** zyXSense @type {HTMLButtonElement} */
        this.right_button;

        }

    bind() {
        this.injectButtons();
        // Observe mutations in case YouTube re-renders the controls
        this.startObserving();
    }

    unbind() {
        this.removeButtons();
        this.stopObserving();
    }

    startObserving() {
        const controls = document.querySelector(".ytp-chrome-bottom");
        if (!controls) return;

        this.observer = new MutationObserver(() => {
            if (!document.contains(this.left_button) || !document.contains(this.right_button)) {
                this.injectButtons();
            }
        });

        this.observer.observe(controls, { childList: true, subtree: true });
    }

    stopObserving() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    injectButtons() {
        const playButton = document.querySelector(".ytp-play-button");
        if (!playButton || !playButton.parentNode) return;

        // Avoid duplicate injection
        if (playButton.previousElementSibling !== this.left_button) {
            playButton.parentNode.insertBefore(this.left_button, playButton);
        }
        if (playButton.nextElementSibling !== this.right_button) {
            playButton.parentNode.insertBefore(this.right_button, playButton.nextSibling);
        }
    }

    removeButtons() {
        this.left_button.remove();
        this.right_button.remove();
    }

    seekRelative(deltaSeconds) {
        // Don't seek during ads - let ads play naturally
        if (this.youtubePlayer.isAdPlayingNow()) return;

        if (!state.inRoom.get()) {
            // Local seek if not in room (optional, but good UX)
            if (this.youtubePlayer.video) {
                this.youtubePlayer.video.currentTime += deltaSeconds;
            }
            return;
        }

        const videoDurationMs = this.youtubePlayer.videoDurationMs;
        const currentMs = this.youtubePlayer.videoCurrentTimeMs;

        let targetMs = currentMs + deltaSeconds * 1000;
        if (videoDurationMs > 0) {
            targetMs = Math.max(0, Math.min(targetMs, videoDurationMs));
        }

        this.youtubePlayer.app.socket.emit("room.control.seek", {
            delta_ms: deltaSeconds * 1000,
            progress_ms: Math.floor(targetMs),
            play: state.roomState.get() === "playing",
        });
    }
}
