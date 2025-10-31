console.log("cs/app.js loaded");
import { html } from "./zyx.js";

import { decodeJwt } from "./utils.js";

import Queue from "./components/Queue.js";
import UserIcons from "./components/UserIcons.js";
import SocketManager from "./socket.js";

import state from "./state.js";

import { extractUrlsFromDataTransfer, findOnPageYouTubeMeta, isYouTubeUrl } from "./utils.js";

export default class ShareTubeApp {
    constructor() {
        this.storageListener = null;
        this.socket = new SocketManager(this);
        this.socket.ensureSocket();

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

        this.setupDragAndDrop();
    }

    logSelf() {
        console.log("ShareTubeApp", { app: this, state: state });
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

    setupDragAndDrop() {
        const onEnter = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.sharetube_main.classList.add("dragover");
        };
        const onOver = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            this.sharetube_main.classList.add("dragover");
        };
        const onLeave = (e) => {
            e.preventDefault();
            this.sharetube_main.classList.remove("dragover");
        };
        const onDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.sharetube_main.classList.remove("dragover");
            const urls = extractUrlsFromDataTransfer(e.dataTransfer);
            const ytUrls = urls.filter(isYouTubeUrl);
            if (ytUrls.length > 0) {
                ytUrls.forEach((u) => this.enqueueUrl(u));
                state.queueVisible.set(true);
            }
        };
        this.sharetube_main.addEventListener("dragenter", onEnter);
        this.sharetube_main.addEventListener("dragover", onOver);
        this.sharetube_main.addEventListener("dragleave", onLeave);
        this.sharetube_main.addEventListener("drop", onDrop);
    }

    enqueueUrl(url) {
        console.log("enqueueUrl", url);
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
