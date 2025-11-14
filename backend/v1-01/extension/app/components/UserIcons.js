import { html } from "../dep/zyx.js";
import state from "../state.js";

import ShareTubeUser from "../models/user.js";

import ShareTubeApp from "../app.js";

export default class UserIcons {
    /**
     * @param {ShareTubeApp} app
     */
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
            if (state.roomCode.get()) {
                await this.app.copyCurrentRoomCodeToClipboard();
                return;
            }
            const code = await this.app.createRoom();
            if (!code) return;
            await this.app.socket.joinRoom(code);
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
                draggable="false"
                class="user_icon_avatar"
                alt="${this.user.name.interp((v) => v || "")}'s avatar"
                title="${this.user.name.interp((v) => v || "")}'s avatar"
                src=${this.user.avatarUrl.interp((v) => v || "")}
            />
        `.bind(this);
    }
}
