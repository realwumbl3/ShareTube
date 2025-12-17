import { html, css, LiveVar } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";

import QueueList from "./QueueList.js";
import CurrentPlaying from "./CurrentPlaying.js";
import EmbeddedPlayer from "./EmbeddedPlayer.js";
import { resolveAssetUrl } from "../../shared/urlResolver.js";

css`
    @import url(${resolveAssetUrl("shared/css/queue-container.css")});
    @import url(${resolveAssetUrl("shared/css/queue-header.css")});
    @import url(${resolveAssetUrl("shared/css/queue-footer.css")});
`;

// Global drag state since dataTransfer doesn't work with zyx framework
export default class ShareTubeQueue {
    constructor(app, { isMobileRemote = false } = {}) {
        this.app = app;

        this.isMobileRemote = new LiveVar(isMobileRemote);

        this.currentPlaying = new CurrentPlaying(app, { isMobileRemote });
        this.queueList = new QueueList();
        this.embeddedPlayer = isMobileRemote ? new EmbeddedPlayer(app) : html`<div></div>`;

        html`
            <div
                id="sharetube_queue"
                class="SlideDisplayToggle"
                role="complementary"
                aria-label="ShareTube queue"
                zyx-if=${[state.queueVisible, (v) => v]}
            >
                <div class="queue-header">
                    <span class="queue-title">Queue (${state.queue.interp((v) => v.length)})</span>
                    <div class="queue-controls">
                        <button
                            class="rounded_btn autoadvance-toggle"
                            disabled=${state.isOperator.interp((v) => !v || null)}
                            aria-label="Toggle auto advance"
                            title=${state.roomAutoadvanceOnEnd.interp(
                                (v) => `Auto advance ${v ? "ON" : "OFF"} - Click to toggle`
                            )}
                            zyx-click=${() => this.toggleAutoadvance()}
                        >
                            Auto advance ${state.roomAutoadvanceOnEnd.interp((v) => (v ? "ON" : "OFF"))}
                        </button>
                        <button
                            class="rounded_btn"
                            zyx-if=${this.isMobileRemote}
                            aria-label="Toggle embedded player"
                            title="Toggle embedded player"
                            zyx-click=${() => state.embeddedPlayerVisible.set(!state.embeddedPlayerVisible.get())}
                        >
                            ${state.embeddedPlayerVisible.interp((v) => (v ? "Hide Player" : "Show Player"))}
                        </button>
                        <button
                            class="rounded_btn"
                            zyx-if=${[this.isMobileRemote, (v) => !v]}
                            aria-label="Toggle queue visibility"
                            title="Toggle queue visibility"
                            zyx-click=${() => state.queueVisible.set(!state.queueVisible.get())}
                        >
                            ${state.queueVisible.interp((v) => (v ? "Hide" : "Show"))}
                        </button>
                    </div>
                </div>
                ${this.embeddedPlayer || ""} ${this.currentPlaying || ""} ${this.queueList || ""}

                <div class="queue-footer" this="footer"></div>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.footer;
    }

    toggleQueueVisibility() {
        state.queueVisible.set(!state.queueVisible.get());
    }

    async toggleAutoadvance() {
        const newValue = !state.roomAutoadvanceOnEnd.get();
        try {
            await this.app.socket.emit("room.settings.autoadvance_on_end.set", {
                autoadvance_on_end: newValue,
                code: state.roomCode.get(),
            });
        } catch (error) {
            console.warn("Failed to toggle autoadvance:", error);
            // Could show a toast or error message here
        }
    }
}
