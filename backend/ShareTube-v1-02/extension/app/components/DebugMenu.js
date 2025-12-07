import { html, css, LiveVar } from "../dep/zyx.js";
import state from "../state.js";

function epochToTimeString(epoch) {
    const ms = epoch < 1e12 ? epoch * 1000 : epoch; // if seconds, convert to ms
    return new Date(ms).toISOString();
}

export default class DebugMenu {
    constructor(app) {
        this.app = app;
        // Default visible to preserve previous behavior of always showing the menu
        this.visible = new LiveVar(false);

        html`
            <div id="debug-menu" class="SlideDisplayToggle" zyx-if=${this.visible}>
                <div class="debug-header">
                    <span class="debug-title">Debug Menu</span>
                    <button class="rounded_btn" title="Hide" zyx-click=${() => this.toggleVisibility()}>Hide</button>
                </div>
                <div class="debug-content">
                    <div class="debug-section">
                        <div class="debug-section-header">
                            <span class="debug-section-title">Server</span>
                        </div>
                        <div class="debug-section-table">
                            <div class="debug-row">
                                <span class="debug-label">Server time:</span>
                                <span class="debug-value"
                                    >${state.serverNowMs.interp((v) => epochToTimeString(v))}</span
                                >
                            </div>
                            <div class="debug-row">
                                <span class="debug-label">Server offset:</span>
                                <span class="debug-value"
                                    >${state.serverMsOffset.interp((v) => {
                                        return v > 0 ? `+${v}ms` : `${v}ms`;
                                    })}</span
                                >
                            </div>
                        </div>
                        <div class="debug-actions">
                            <button class="rounded_btn" zyx-click=${() => app.logSelf()}>console state/app</button>
                        </div>
                    </div>
                    <div class="debug-section">
                        <div class="debug-section-header">
                            <span class="debug-section-title">User</span>
                        </div>
                        <div class="debug-section-table">
                            <div class="debug-row">
                                <span class="debug-label">User ID:</span>
                                <span class="debug-value">${state.userId.interp((v) => v)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="debug-section">
                        <div class="debug-section-header">
                            <span class="debug-section-title">Room</span>
                        </div>
                        <div class="debug-section-table">
                            <div class="debug-row">
                                <span class="debug-label">Room code:</span>
                                <span class="debug-value">${state.roomCode.interp((v) => v)}</span>
                            </div>
                            <div class="debug-row">
                                <span class="debug-label">Room state:</span>
                                <span class="debug-value">${state.roomState.interp((v) => v)}</span>
                            </div>
                        </div>
                        <div class="debug-actions">
                            <button
                                class="rounded_btn"
                                zyx-click=${() =>
                                    this.app.socket.emit("queue.load-debug-list", { code: state.roomCode.get() })}
                            >
                                Load debug list
                            </button>
                        </div>
                    </div>
                    <div class="debug-section">
                        <div class="debug-section-header">
                            <span class="debug-section-title">Player Controls</span>
                            <span class="debug-status"
                                >Desired state: ${this.app.youtubePlayer.desired_state.interp((v) => v)}</span
                            >
                            <span class="debug-status"
                                >Enforcing:
                                ${this.app.youtubePlayer.is_enforcing.interp((v) => (v ? "Yes" : "No"))}</span
                            >
                            <span class="debug-status"
                                >Ad playing:
                                ${this.app.youtubePlayer.ad_playing.interp((v) => (v ? "Yes" : "No"))}</span
                            >
                        </div>

                        <div class="debug-actions">
                            <button
                                class="rounded_btn"
                                zyx-click=${() => this.app.youtubePlayer.setDesiredState("playing")}
                            >
                                Set desired state to playing
                            </button>
                            <button
                                class="rounded_btn"
                                zyx-click=${() => this.app.youtubePlayer.setDesiredState("paused")}
                            >
                                Set desired state to paused
                            </button>
                            <button class="rounded_btn" zyx-click=${() => this.app.virtualPlayer.emitRestartVideo()}>
                                Restart video
                            </button>
                            <button
                                class="rounded_btn"
                                zyx-click=${() =>
                                    this.app.youtubePlayer.setDesiredProgressMs(
                                        Math.random() * this.app.youtubePlayer.videoDurationMs
                                    )}
                            >
                                Set desired progress to random position
                            </button>
                        </div>
                    </div>

                    <div class="debug-section">
                        <div class="debug-section-header">
                            <span class="debug-section-title">Misc</span>
                        </div>

                        <div class="debug-actions">
                            <div class="debug-actions-header">Logo</div>
                            <button class="rounded_btn" zyx-click=${() => this.app.logo.expand()}>Expand</button>
                            <button class="rounded_btn" zyx-click=${() => this.app.logo.collapse()}>Collapse</button>
                        </div>
                        <div class="debug-actions">
                            <input
                                this="search_query_input"
                                class="rounded_btn"
                                type="text"
                                id="search-query"
                                placeholder="Search query"
                            />
                            <button
                                class="rounded_btn"
                                zyx-click=${() => this.app.openSearch(this.search_query_input.value)}
                            >
                                Open search
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLInputElement} */
        this.search_query_input;

        /** zyx-sense @type {HTMLInputElement} */
        this.search_query_input;
    }

    toggleVisibility() {
        this.visible.set(!this.visible.get());
    }
}

css`
    #debug-menu {
        min-width: 320px;
        max-width: 520px;
        color: #e5e7eb;
        background: rgba(18, 18, 18, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(1em);
        border-radius: 12px;
        pointer-events: auto;
        overflow: hidden;
        padding: 0; /* let inner rows handle spacing for a cleaner frame */
    }

    #debug-menu .debug-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        gap: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    #debug-menu .debug-title {
        font-weight: 600;
        font-size: 13px;
        user-select: none;
    }

    #debug-menu .debug-section-title {
        font-weight: 600;
        font-size: 13px;
        text-align: center;
        user-select: none;
    }

    #debug-menu .debug-section {
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: center;
        gap: 4px;
        box-shadow: inset 0 0 0 0 rgba(0, 0, 0, 0); /* reduce heavy look */
    }

    #debug-menu .debug-section-table {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: center;
        gap: 4px;
    }

    #debug-menu .debug-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        width: 100%;
    }

    #debug-menu .debug-label {
        font-weight: 600;
        font-size: 12px;
        opacity: 0.85;
    }

    #debug-menu .debug-value {
        font-size: 12px;
        opacity: 0.85;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    #debug-menu .debug-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0 0;
        flex-wrap: wrap;
    }

    /* Ensure buttons inside debug menu remain legible regardless of host vars */
    #debug-menu .rounded_btn {
        color: #e5e7eb !important;
    }

    #debug-menu .debug-content {
        padding: 8px 10px 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    #debug-menu .debug-section-header {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
    }

    #debug-menu .debug-status {
        font-size: 12px;
        opacity: 0.85;
    }
`;
