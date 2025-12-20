import { html, LiveVar } from "../../shared/dep/zyx.js";

import state from "../core/state/state.js";
import { googleSVG, lockSVG } from "../../shared/assets/svgs.js";
import Controls from "./Controls.js";
import UserIcons from "./UserIcons.js";
import Logo from "./Logo.js";

export default class ShareTubePill {
    constructor(app) {
        this.app = app;

        // Pill locked state
        this.pillLocked = new LiveVar(false);

        // Components
        this.controls = new Controls(this.app);
        this.userIcons = new UserIcons(this.app);
        this.logo = new Logo();

        // Load locked state from storage
        this.app.storageManager.get("locked", false).then((locked) => this.pillLocked.set(locked));

        html`
            <div id="sharetube_pill" is_locked=${this.pillLocked.interp()}>
                <button
                    zyx-if=${this.pillLocked}
                    id="sharetube_lock_btn"
                    class="lock_btn"
                    zyx-click=${() => this.setLock(false)}
                >
                    <img src=${lockSVG} alt="Lock" />
                </button>
                <img
                    zyx-if=${state.userId}
                    class="user_icon_avatar"
                    draggable="false"
                    alt="Profile"
                    src=${state.avatarUrl.interp((v) => v || "")}
                    user-ready=${state.userReady.interp()}
                />
                <div
                    zyx-else
                    class="sign_in_button rounded_btn"
                    zyx-click=${() => this.app.authManager.openSignInWithGooglePopup()}
                >
                    Sign in with <img src=${googleSVG} alt="Google" />
                </div>
                ${this.logo}
                <span zyx-if=${state.userId}>
                    ${this.userIcons}
                    <div
                        zyx-if=${state.roomCode}
                        id="sharetube_toggle_hub"
                        class="rounded_btn"
                        zyx-click=${() => this.app.hub.toggleHubVisibility()}
                    >
                        ${state.queueQueued.interp((v) => (v.length > 0 ? `Queue (${v.length})` : "Queue empty."))}
                    </div>
                    ${this.controls}
                </span>
                <button
                    zyx-if=${state.debug_mode}
                    class="rounded_btn"
                    zyx-click=${() => this.app.debugMenu.toggleVisibility()}
                >
                    dbg
                </button>
            </div>
        `.bind(this);
        /** zyx-sense @type {HTMLDivElement} */
        this.sharetube_pill;

        this.app.sharetube_pill = this.sharetube_pill;

        // Setup lock behavior
        this.setupPillLockBehavior();

        // Setup reveal behavior
        this.setupRevealBehavior();
    }

    get isLocked() {
        return this.pillLocked.get();
    }

    setupPillLockBehavior() {
        this.sharetube_pill.addEventListener("click", (e) => {
            if (e.target !== this.sharetube_pill || this.pillLocked.get()) return;
            this.setLock(true);
        });
    }

    setupRevealBehavior() {
        this.sharetube_pill.addEventListener("mouseenter", () => {
            this.sharetube_pill.classList.add("revealed");
        });
        this.sharetube_pill.addEventListener("mouseleave", () => {
            if (this.pillLocked.get()) return;
            this.sharetube_pill.classList.remove("revealed");
        });
    }

    reveal() {
        this.sharetube_pill.classList.add("revealed");
    }

    async setLock(locked) {
        this.pillLocked.set(locked);
        await this.app.storageManager.set("locked", locked);
        if (locked) {
            this.sharetube_pill.classList.add("revealed");
        } else {
            if (!this.app.sharetube_main.matches(":hover")) {
                this.sharetube_pill.classList.remove("revealed");
            }
        }
    }
}
