import { html, css, LiveVar } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";
import ShareTubeUser from "../core/models/user.js";

export default class UserIcons {
    constructor(app, { showShareButton = false } = {}) {
        this.app = app;

        this.showShareButton = new LiveVar(showShareButton);

        html`
            <div class="room_presence" zyx-if=${state.roomCode}>
                <div
                    class="presence"
                    zyx-if=${[state.users, (v) => v.length > 0]}
                    zyx-live-list=${{
                        list: state.users,
                        compose: UserIcon,
                    }}
                ></div>
                <button
                    zyx-if=${[this.showShareButton, (v) => v]}
                    class="rounded_btn"
                    id="sharetube_plus_button"
                    draggable="true"
                    title="${state.roomCode.interp((v) =>
                        v
                            ? "Clipboard Watchroom link to share."
                            : "Create a new Watchroom and clipboard its link to share."
                    )}"
                    zyx-click=${(z) => {
                        z.e.stopPropagation();
                        this.onPlusClicked();
                    }}
                    zyx-dragstart=${(e) => {
                        e.e.dataTransfer.setData("text/plain", this.app.roomManager.getRoomYoutubeUrl());
                        e.e.dataTransfer.effectAllowed = "copy";
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
                await this.app.roomManager.copyCurrentRoomCodeToClipboard();
                return;
            }
            const code = await this.app.createRoom();
            if (!code) return;
            await this.app.socket.joinRoom(code);
            await this.app.roomManager.copyCurrentRoomCodeToClipboard();
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
                data-ready=${this.user.ready.interp((v) => (v ? "true" : "false"))}
                alt="${this.user.name.interp((v) => v || "")}'s avatar"
                title="${this.user.name.interp((v) => v || "")}'s avatar"
                src=${this.user.avatarUrl.interp((v) => v || "")}
            />
        `.bind(this);
    }
}

css`
    #sharetube_main .room_presence {
        display: inline-flex;
        align-items: center;
        outline: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 999px;
        padding: 3px 7px;
        background: rgba(0, 0, 0, 0.35);
        gap: 3px;
    }

    #sharetube_main .presence {
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }

    #sharetube_main .presence_not_ready {
        border: 1px solid rgba(255, 82, 82, 0.85);
        background: rgba(255, 82, 82, 0.18);
        border-radius: 999px;
        padding: 3px 4px;
        min-height: 24px;
    }

    #sharetube_main .presence_ready {
        border: 1px solid rgba(0, 255, 148, 0.4);
        background: rgba(0, 255, 148, 0.12);
        border-radius: 999px;
        padding: 3px 4px;
        min-height: 24px;
    }

    #sharetube_main .presence_not_ready:empty,
    #sharetube_main .presence_ready:empty {
        display: none;
    }

    #sharetube_main .presence .user_icon_avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
        background: #222;
        border: 2px solid rgba(255, 255, 255, 0.25);

        outline: 0px solid transparent;
        transition: outline-width 200ms ease;

        opacity: 0;
        transition: opacity 200ms ease;
        transition-delay: 50ms;

        &[src] {
            opacity: 1;
        }

        &:hover:not([src]) {
            outline-width: 2px;
            outline-color: rgba(255, 255, 255, 0.5);
        }

        &[data-ready="false"] {
            border-color: rgba(255, 82, 82, 0.95);
            box-shadow: 0 0 6px rgba(255, 82, 82, 0.55);
        }

        &[data-ready="true"] {
            border-color: rgba(0, 255, 148, 0.95);
            box-shadow: 0 0 6px rgba(0, 255, 148, 0.55);
        }
    }
`;
