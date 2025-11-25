console.log("cs/app.js loaded");

import state from "./state.js";
import { decodeJwt } from "./utils.js";

import Queue from "./components/Queue.js";
import UserIcons from "./components/UserIcons.js";

import { html } from "./zyx.js";

export default class ShareTubeApp {
    constructor() {
        this.storageListener = null;
        // Components
        this.queue = new Queue(this);
        this.userIcons = new UserIcons(this);

        html`
            <div id="sharetube_main">
                ${this.queue}
                <div id="sharetube_pill">
                    <img alt="Profile" src=${state.avatarUrl.interp((v) => v || "")} />
                    <span id="ShareTubeLabel" zyx-click=${() => this.logSelf()}>ShareTube</span>
                    ${this.userIcons}
                </div>
            </div>
        `.bind(this);
    }

    logSelf() {
        console.log("ShareTubeApp", {app: this, state: state});
    }

    async applyAvatarFromToken() {
        try {
            const res = await chrome.storage.local.get(["newapp_token"]);
            const token = res && res.newapp_token;
            if (!token) {
                state.avatarUrl.set("");
                state.userId.set(null);
                return;
            }
            const claims = decodeJwt(token);
            const picture = claims && claims.picture;
            state.avatarUrl.set(picture || "");
            try {
                state.userId.set(claims && (claims.sub != null ? Number(claims.sub) : null));
            } catch {
                state.userId.set(null);
            }
        } catch (e) {
            console.warn("ShareTube applyAvatarFromToken failed", e);
        }
    }

    attachBrowserListeners() {
        this.storageListener = (changes, area) => {
            if (area === "local" && changes.newapp_token) {
                this.applyAvatarFromToken();
            }
        };
        chrome.storage.onChanged.addListener(this.storageListener);
    }

    detachBrowserListeners() {
        if (this.storageListener) chrome.storage.onChanged.removeListener(this.storageListener);
    }

    start() {
        console.log("ShareTube Init");
        this.appendTo(document.body);
        this.attachBrowserListeners();
        this.applyAvatarFromToken();
    }
    
    navKick() {
        console.log("ShareTube navKick", this);
    }
}
