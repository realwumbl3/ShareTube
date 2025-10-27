import { html } from "../zyx.js";
import ShareTubeApp from "../app.js";

export default class RoomPresencePill {

    get roomManager() {
        return this.app.roomManager;
    }

    /**
     * @param {ShareTubeApp} app
     */
    constructor(presenceManager) {
        this.app = presenceManager.app;
        this.presenceManager = presenceManager;
        html`
            <div class="room_presence">
                <div
                    class="presence"
                    zyx-if=${[this.presenceManager.presence, (v) => v.length > 0]}
                    zyx-live-list=${{ list: this.presenceManager.presence }}
                ></div>
                <button
                    class="rounded_btn"
                    id="sharetube_plus_button"
                    title="Start or copy Watchroom link"
                    zyx-click=${(z) => {
                        z.e.stopPropagation();
                        this.roomManager.handlePlusButton();
                    }}
                >
                    +
                </button>
            </div>
        `.bind(this);
    }
}
