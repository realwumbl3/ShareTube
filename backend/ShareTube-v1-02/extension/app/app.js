console.log("app/app.js loaded");
import { html, css, LiveVar, ZyXInput } from "./dep/zyx.js";

import state from "./state.js";

import SocketManager from "./socket.js";
import DebugMenu from "./DebugMenu.js";
import YoutubePlayerManager from "./youtubePlayer.js";
import VirtualPlayer from "./virtualPlayer.js";
import RoomManager from "./roomManager.js";
import AuthManager from "./authManager.js";
import UIManager from "./uiManager.js";
import StorageManager from "./storageManager.js";

import Queue from "./components/Queue.js";
import UserIcons from "./components/UserIcons.js";
import Controls from "./components/Controls.js";
import Logo from "./components/Logo.js";
import SearchBox from "./components/SearchBox.js";
import QRCodeComponent from "./components/QRCode.js";

export const zyxInput = new ZyXInput();

import { googleSVG, lockSVG } from "./assets/svgs.js";

css`
    @import url("https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&display=swap");
    @import url(${chrome.runtime.getURL("app/css/styles-base.css")});
    @import url(${chrome.runtime.getURL("app/css/styles-popup.css")});
    @import url(${chrome.runtime.getURL("app/css/styles-forms.css")});
    @import url(${chrome.runtime.getURL("app/css/styles-components.css")});
    @import url(${chrome.runtime.getURL("app/css/styles-main.css")});
    @import url(${chrome.runtime.getURL("app/css/styles-animations.css")});
    @import url(${chrome.runtime.getURL("app/css/pill.css")});
    @import url(${chrome.runtime.getURL("app/css/adOverlay.css")});
    @import url(${chrome.runtime.getURL("app/css/queue-container.css")});
    @import url(${chrome.runtime.getURL("app/css/queue-header.css")});
    @import url(${chrome.runtime.getURL("app/css/queue-current-playing.css")});
    @import url(${chrome.runtime.getURL("app/css/queue-selector.css")});
    @import url(${chrome.runtime.getURL("app/css/queue-list.css")});
    @import url(${chrome.runtime.getURL("app/css/queue-footer.css")});
    @import url(${chrome.runtime.getURL("app/css/firstParty.css")});
    @import url(${chrome.runtime.getURL("app/css/splash.css")});
`;

export default class ShareTubeApp {
    logSelf() {
        console.log("ShareTubeApp", { app: this, state: state });
    }

    async backEndUrl() {
        return await this.authManager.backEndUrl();
    }

    async authToken() {
        return await this.authManager.authToken();
    }

    get hashRoomCode() {
        return this.roomManager.hashRoomCode;
    }

    stHash(code) {
        return this.roomManager.stHash(code);
    }

    updateCodeHashInUrl(code) {
        return this.roomManager.updateCodeHashInUrl(code);
    }

    resetRoomState() {
        state.resetRoomState();
        this.youtubePlayer.onRoomStateChange("");
    }

    constructor() {
        this.socket = new SocketManager(this);
        this.youtubePlayer = new YoutubePlayerManager(this);
        this.virtualPlayer = new VirtualPlayer(this);
        this.roomManager = new RoomManager(this);
        this.authManager = new AuthManager(this);
        this.uiManager = new UIManager(this);
        this.storageManager = new StorageManager(this);

        // Components
        this.queue = new Queue(this);
        this.userIcons = new UserIcons(this);
        this.debugMenu = new DebugMenu(this);
        this.controls = new Controls(this);
        this.logo = new Logo(this);
        this.qrCode = new QRCodeComponent(this);

        this.storageManager.getLocalStorage("locked", false).then((locked) => state.pillLocked.set(locked));
        this.storageManager.getLocalStorage("debug_mode", false).then((debug_mode) => state.debug_mode.set(debug_mode));

        html`
            <div id="sharetube_main" class="st_reset" is_locked=${state.pillLocked.interp()}>
                ${this.queue} ${this.debugMenu}
                <div id="sharetube_pill">
                    <button
                        zyx-if=${state.pillLocked}
                        id="sharetube_lock_btn"
                        class="lock_btn"
                        zyx-click=${() => this.uiManager.setLock(false)}
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
                        zyx-click=${() => this.authManager.openSignInWithGooglePopup()}
                    >
                        Sign in with <img src=${googleSVG} alt="Google" />
                    </div>
                    ${this.logo}
                    <span zyx-if=${state.userId}>
                        ${this.userIcons}
                        <div
                            zyx-if=${state.roomCode}
                            id="sharetube_toggle_queue"
                            class="rounded_btn"
                            zyx-click=${() => this.queue.toggleQueueVisibility()}
                        >
                            ${state.queueQueued.interp((v) => (v.length > 0 ? `Queue (${v.length})` : "Queue empty."))}
                        </div>
                        ${this.controls}
                    </span>
                    <button
                        zyx-if=${state.debug_mode}
                        class="rounded_btn"
                        zyx-click=${() => this.debugMenu.toggleVisibility()}
                    >
                        dbg
                    </button>
                </div>
            </div>
            ${this.qrCode}
        `.bind(this);

        this.setupKeypressListeners();

        this.uiManager.setupDragAndDrop();
        this.uiManager.setupRevealBehavior();
        this.uiManager.setupPillLockBehavior();
        this.bindSocketListeners();
        this.virtualPlayer.bindListeners(this.socket);

        this.youtubePlayer.start();
    }

    bindSocketListeners() {
        this.socket.on("presence.update", this.roomManager.onSocketPresenceUpdate.bind(this.roomManager));
        this.socket.on("user.ready.update", this.roomManager.onSocketUserReadyUpdate.bind(this.roomManager));
        this.socket.setupBeforeUnloadHandler();
    }

    setupKeypressListeners() {
        document.addEventListener("keydown", (e) => {
            if (e.key.toLowerCase() === "d" && e.ctrlKey && e.altKey) {
                state.debug_mode.set(!state.debug_mode.get());
                this.storageManager.setLocalStorage("debug_mode", state.debug_mode.get());
                return;
            }
        });
    }

    openSearch(query) {
        new SearchBox(this, query);
    }

    async post(url, options = {}) {
        return await this.authManager.post(url, options);
    }

    async createRoom() {
        return await this.roomManager.createRoom();
    }

    async tryJoinRoomFromUrl() {
        return await this.roomManager.tryJoinRoomFromUrl();
    }

    async copyCurrentRoomCodeToClipboard() {
        return await this.roomManager.copyCurrentRoomCodeToClipboard();
    }

    async enqueueUrl(url) {
        return await this.socket.emit("queue.add", { url });
    }

    async applyAvatarFromToken() {
        return await this.authManager.applyAvatarFromToken();
    }

    attachBrowserListeners() {
        return this.storageManager.attachBrowserListeners();
    }

    detachBrowserListeners() {
        return this.storageManager.detachBrowserListeners();
    }

    start() {
        console.log("ShareTube Init");
        this.appendTo(document.body);
        this.attachBrowserListeners();
        this.applyAvatarFromToken();
        this.tryJoinRoomFromUrl();
        setTimeout(() => this.sharetube_main.classList.add("visible"), 1);
    }

    navKick() {
        console.log("ShareTube navKick", this);
    }
}
