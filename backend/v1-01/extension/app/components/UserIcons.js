import { html } from "../dep/zyx.js";
import state from "../state.js";

export default class UserIcons {
    constructor(app) {
        this.app = app;
        
        html`
            <div class="room_presence">
                <div
                    class="presence"
                    zyx-if=${[state.userIcons, (v) => v.length > 0]}
                    zyx-live-list=${{ list: state.userIcons, compose: UserIcon }}
                ></div>
                <button
                    class="rounded_btn"
                    id="sharetube_plus_button"
                    title="Start or copy Watchroom link"
                    zyx-click=${(z) => {
                        z.e.stopPropagation();
                        // TODO: handle plus button
                    }}
                >
                    +
                </button>
            </div>
        `.bind(this);
    }
}

// Compact avatar component representing a present user in the room
export class UserIcon {
    constructor(user) {
        const u = user || {};
        this.id = u.id;
        this.name = new LiveVar(u.name || "");
        this.picture = new LiveVar(u.picture || "");
        // Render a single <img> node bound to name/picture LiveVars
        html`
            <img
                alt=${this.name.interp((v) => v || "")}
                title=${this.name.interp((v) => v || "")}
                src=${this.picture.interp((v) => v || "")}
            />
        `.bind(this);
    }
}
