import { html } from "../dep/zyx.js";
import state from "../state.js";

import ShareTubeUser from "../user.js";

export default class UserIcons {
    constructor(app) {
        this.app = app;

        html`
            <div class="room_presence">
                <div
                    class="presence"
                    zyx-if=${[state.users, (v) => v.length > 0]}
                    zyx-live-list=${{ list: state.users, compose: UserIcon }}
                ></div>
                <button
                    class="rounded_btn"
                    id="sharetube_plus_button"
                    title="Start or copy Watchroom link"
                    zyx-click=${(z) => {
                        z.e.stopPropagation();
                        this.onPlusClicked();
                    }}
                >
                    +
                </button>
            </div>
        `.bind(this);
    }

    async onPlusClicked() {
        try {
            // Create a room via REST
            const res = await this.app.post("/api/rooms");
            const code = res && res.code;
            if (!code) return;

            this.app.updateCodeHashInUrl(code);

            // Join the room directly without navigating/reloading
            await this.app.socket.withSocket(async (socket) => {
                await socket.emit("join_room", { code });
            });

            state.currentRoomCode.set(code);

            await this.app.copyCurrentRoomCodeToClipboard();
        } catch (e) {
            console.warn("ShareTube onPlusClicked failed", e);
        }
    }
}

// Compact avatar component representing a present user in the room
export class UserIcon {
    /**
     * @param {ShareTubeUser} user
     */
    constructor(user) {
        this.user = user;
        html`
            <img
                class="user_icon_avatar"
                alt="${this.user.name.interp((v) => v || "")}'s avatar"
                title="${this.user.name.interp((v) => v || "")}'s avatar"
                src=${this.user.avatarUrl.interp((v) => v || "")}
            />
        `.bind(this);
    }
}
