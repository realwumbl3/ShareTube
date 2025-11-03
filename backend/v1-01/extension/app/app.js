console.log("app/app.js loaded");
import { html, css } from "./dep/zyx.js";

import { decodeJwt } from "./utils.js";

import Queue from "./components/Queue.js";
import UserIcons from "./components/UserIcons.js";
import SocketManager from "./socket.js";

import state from "./state.js";

import { extractUrlsFromDataTransfer, isYouTubeUrl } from "./utils.js";

import ShareTubeUser from "./models/user.js";
import { syncLiveList } from "./sync.js";

css`
    @import url(${chrome.runtime.getURL("app/styles.css")});
`;

import { ShareTubeQueueItem } from "./components/Queue.js";

export default class ShareTubeApp {
    constructor() {
        this.storageListener = null;
        this.socket = new SocketManager(this);

        // Components
        this.queue = new Queue(this);
        this.userIcons = new UserIcons(this);

        html`
            <div id="sharetube_main">
                ${this.queue}
                <div id="sharetube_pill">
                    <img alt="Profile" src=${state.avatarUrl.interp((v) => v || "")} />
                    <span id="ShareTubeLabel" zyx-click=${() => this.logSelf()}
                        >ShareTube ${state.currentRoomCode.interp((v) => (v ? `#${v}` : ""))}</span
                    >
                    ${this.userIcons}
                    <div id="sharetube_toggle_queue" zyx-click=${() => this.queue.toggleQueueVisibility()}>
                        ${state.queueVisible.interp((v) => (v ? "Hide" : "Show"))} Queue
                        ${state.queue.interp((v) => (v.length > 0 ? `(${v.length})` : ""))}
                    </div>
                </div>
            </div>
        `.bind(this);

        this.setupDragAndDrop();
        this.socket.on("presence_update", this.onSocketPresenceUpdate.bind(this));
        this.socket.on("queue_update", this.onQueueUpdate.bind(this));
        this.socket.setupBeforeUnloadHandler();
    }

    async backEndUrl() {
        // Determine backend base URL and JWT
        const { backend_url } = await chrome.storage.sync.get(["backend_url"]);
        const base = (backend_url || "https://sharetube.wumbl3.xyz").replace(/\/+$/, "");
        return base;
    }

    async authToken() {
        const { auth_token } = await chrome.storage.local.get(["auth_token"]);
        if (!auth_token) {
            console.warn("ShareTube: missing auth token");
            return null;
        }
        return auth_token;
    }

    async post(url, options = {}) {
        const base = await this.backEndUrl();
        const auth_token = await this.authToken();
        const res = await fetch(`${base}${url}`, {
            method: options.method || "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${auth_token}`,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        if (!res.ok) {
            console.warn("ShareTube: post failed", { status: res.status, url, options });
            return null;
        }
        return await res.json();
    }

    get hashRoomCode() {
        const url = new URL(window.location.href);
        return url.hash.replace("#st:", "").trim();
    }

    updateCodeHashInUrl(code) {
        const url = new URL(window.location.href);
        url.hash = `#st:${code}`;
        history.replaceState(null, "", url.toString());
    }

    async createRoom() {
        try {
            const res = await this.post("/api/rooms");
            return res && res.code;
        } catch (e) {
            console.warn("ShareTube createRoom failed", e);
            return null;
        }
    }

    async joinRoom(code) {
        await this.socket.withSocket(async (socket) => {
            await socket.emit("join_room", { code });
        });
        state.currentRoomCode.set(code);
        this.updateCodeHashInUrl(code);
    }

    async copyCurrentRoomCodeToClipboard() {
        const code = state.currentRoomCode.get();
        if (!code) return;
        try {
            await navigator.clipboard.writeText(`${window.location.origin}#st:${code}`);
        } catch (_) {
            console.warn("ShareTube copyCurrentRoomCodeToClipboard failed", _);
        }
    }

    async tryJoinRoomFromUrl() {
        if (!this.hashRoomCode) return;
        await this.joinRoom(this.hashRoomCode);
    }

    onSocketPresenceUpdate(presence) {
        if (!Array.isArray(presence)) return;
        syncLiveList({
            localList: state.users,
            remoteItems: presence,
            extractRemoteId: (v) => v.id,
            extractLocalId: (u) => u.userId.get(),
            createInstance: (item) => new ShareTubeUser(item),
            updateInstance: (u, item) => u.updateFromRemote(item),
        });
    }

    onQueueUpdate(queue) {
        if (!Array.isArray(queue)) return;
        syncLiveList({
            localList: state.queue,
            remoteItems: queue,
            extractRemoteId: (v) => v.id,
            extractLocalId: (u) => u.url,
            createInstance: (item) => new ShareTubeQueueItem(item),
        });
    }

    logSelf() {
        console.log("ShareTubeApp", { app: this, state: state });
    }

    async applyAvatarFromToken() {
        try {
            const auth_token = await this.authToken();
            if (!auth_token) {
                state.avatarUrl.set("");
                state.userId.set(null);
                return;
            }
            const claims = decodeJwt(auth_token);
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
        this.socket.withSocket(async (socket) => {
            await socket.emit("enqueue_url", { url });
        });
    }

    attachBrowserListeners() {
        this.storageListener = (changes, area) => {
            if (area === "local" && changes.auth_token) this.applyAvatarFromToken();
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
        this.tryJoinRoomFromUrl();
    }

    navKick() {
        console.log("ShareTube navKick", this);
    }
}
