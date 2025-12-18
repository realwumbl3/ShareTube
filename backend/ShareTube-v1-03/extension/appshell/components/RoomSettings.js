import { html, css } from "../../shared/dep/zyx.js";
import { resolveAssetUrl } from "../../shared/urlResolver.js";
import state from "../core/state/state.js";

css`
    @import url(${resolveAssetUrl("shared/css/hub-room-settings.css")});
`;

export default class RoomSettings {
    constructor(app) {
        this.app = app;

        html`
            <div class="room-settings">
                <h1>Room Settings</h1>
                <div class="room-settings-buttons">
                    <div class="room-settings-entry">
                        <span class="room-settings-entry-label"
                            ><span class="labelHead">Auto advance:</span> Automatically advance to the next video when
                            the current one ends</span
                        >
                        <button
                            class="rounded_btn autoadvance-toggle"
                            aria-label="Toggle auto advance"
                            title=${state.roomAutoadvanceOnEnd.interp(
                                (v) => `Auto advance ${v ? "ON" : "OFF"} - Click to toggle`
                            )}
                            state=${state.roomAutoadvanceOnEnd.interp((v) => (v ? "on" : "off"))}
                            zyx-click=${() => this.toggleAutoadvance()}
                        >
                            Auto advance ${state.roomAutoadvanceOnEnd.interp((v) => (v ? "ON" : "OFF"))}
                        </button>
                    </div>
                    <div class="room-settings-entry">
                        <span class="room-settings-entry-label"
                            ><span class="labelHead">Privacy:</span> Make this room private (only invited users can
                            join)</span
                        >
                        <button
                            class="rounded_btn privacy-toggle"
                            aria-label="Toggle room privacy"
                            title=${state.roomIsPrivate.interp(
                                (v) => `Room is ${v ? "PRIVATE" : "PUBLIC"} - Click to toggle`
                            )}
                            state=${state.roomIsPrivate.interp((v) => (v ? "on" : "off"))}
                            zyx-click=${() => this.togglePrivacy()}
                        >
                            ${state.roomIsPrivate.interp((v) => (v ? "Room is PRIVATE" : "Room is PUBLIC"))}
                        </button>
                    </div>
                    <div class="room-settings-entry">
                        <span class="room-settings-entry-label"
                            ><span class="labelHead">Ad sync mode:</span> Control how ads are handled during
                            playback</span
                        >
                        <div
                            class="ad-sync-mode-buttons"
                            this="ad_sync_mode_buttons"
                            zyx-click=${(e) => this.setAdSyncMode(e.target.getAttribute("value"))}
                        >
                            <button class="rounded_btn" value="off">Off</button>
                            <button class="rounded_btn" value="pause_all">Pause All</button>
                            <button class="rounded_btn" value="operators_only">Operators Only</button>
                            <button class="rounded_btn" value="starting_only">Starting Only</button>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);

        state.adSyncMode.subscribe(this.updateAdSyncMode);
    }

    updateAdSyncMode = (newMode) => {
        const buttons = this.ad_sync_mode_buttons.querySelectorAll("button");
        buttons.forEach((button) => {
            button.classList.toggle("active", button.getAttribute("value") === newMode);
        });
    };

    setAdSyncMode(value) {
        this.app.socket.emit("room.settings.set", {
            setting: "ad_sync_mode",
            value: value,
            code: state.roomCode.get(),
        });
    }

    async toggleAutoadvance() {
        const newValue = !state.roomAutoadvanceOnEnd.get();
        try {
            await this.app.socket.emit("room.settings.set", {
                setting: "autoadvance_on_end",
                value: newValue,
                code: state.roomCode.get(),
            });
        } catch (error) {
            console.warn("Failed to toggle autoadvance:", error);
            // Could show a toast or error message here
        }
    }

    async togglePrivacy() {
        const newValue = !state.roomIsPrivate.get();
        try {
            await this.app.socket.emit("room.settings.set", {
                setting: "is_private",
                value: newValue,
                code: state.roomCode.get(),
            });
        } catch (error) {
            console.warn("Failed to toggle privacy:", error);
            // Could show a toast or error message here
        }
    }

    async setAdSyncMode(newMode) {
        try {
            await this.app.socket.emit("room.settings.set", {
                setting: "ad_sync_mode",
                value: newMode,
                code: state.roomCode.get(),
            });
        } catch (error) {
            console.warn("Failed to set ad sync mode:", error);
            // Could show a toast or error message here
        }
    }
}
