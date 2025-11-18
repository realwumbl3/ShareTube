console.log("app/app.js loaded");
import { html, css, LiveVar, ZyXInput } from "./dep/zyx.js";

import { extractUrlsFromDataTransfer, isYouTubeUrl, decodeJwt, syncLiveList } from "./utils.js";

import state from "./state.js";

import SocketManager from "./socket.js";
import DebugMenu from "./DebugMenu.js";
import YoutubePlayerManager from "./player.js";
import VirtualPlayer from "./virtualplayer.js";

import ShareTubeUser from "./models/user.js";

import Queue from "./components/Queue.js";
import UserIcons from "./components/UserIcons.js";
import Controls from "./components/Controls.js";
import Logo from "./components/Logo.js";
import SearchBox from "./components/SearchBox.js";

export const zyxInput = new ZyXInput();

css`
    @import url(${chrome.runtime.getURL("app/styles/styles.css")});
    @import url(${chrome.runtime.getURL("app/styles/pill.css")});
    @import url(${chrome.runtime.getURL("app/styles/adOverlay.css")});
    @import url(${chrome.runtime.getURL("app/styles/queue.css")});
    @import url(${chrome.runtime.getURL("app/styles/firstParty.css")});
    @import url(${chrome.runtime.getURL("app/styles/splash.css")});
`;

export default class ShareTubeApp {
    logSelf() {
        console.log("ShareTubeApp", { app: this, state: state });
    }

    async backEndUrl() {
        const { backend_url } = await chrome.storage.sync.get(["backend_url"]);
        return (backend_url || "https://sharetube.wumbl3.xyz").replace(/\/+$/, "");
    }

    async authToken() {
        const { auth_token } = await chrome.storage.local.get(["auth_token"]);
        if (!auth_token) {
            console.warn("ShareTube: missing auth token");
            return null;
        }
        return auth_token;
    }

    get hashRoomCode() {
        return (new URL(window.location.href).hash || "").replace("#st:", "").trim();
    }

    stHash(code) {
        return `#st:${code}`;
    }

    updateCodeHashInUrl(code) {
        const url = new URL(window.location.href);
        url.hash = this.stHash(code);
        history.replaceState(null, "", url.toString());
    }

    constructor() {
        this.storageListener = null;
        this.socket = new SocketManager(this);
        this.player = new YoutubePlayerManager(this);
        this.virtualPlayer = new VirtualPlayer(this);

        // Components
        this.queue = new Queue(this);
        this.userIcons = new UserIcons(this);
        this.debugMenu = new DebugMenu(this);
        this.controls = new Controls(this);
        this.logo = new Logo(this);

        this.debugButtonVisible = new LiveVar(false);

        html`
            <div id="sharetube_main" class="st_reset">
                ${this.queue} ${this.debugMenu}
                <div id="sharetube_pill">
                    <img draggable="false" alt="Profile" src=${state.avatarUrl.interp((v) => v || "")} />
                    ${this.logo} ${this.userIcons}
                    <div
                        id="sharetube_toggle_queue"
                        class="rounded_btn"
                        zyx-click=${() => this.queue.toggleQueueVisibility()}
                    >
                        Queue ${state.queue.interp((v) => (v.length > 0 ? `(${v.length})` : ""))}
                    </div>
                    ${this.controls}
                    <button
                        class="rounded_btn"
                        zyx-if=${this.debugButtonVisible}
                        zyx-click=${() => this.debugMenu.toggleVisibility()}
                    >
                        dbg
                    </button>
                </div>
            </div>
        `.bind(this);

        this.setupKeypressListeners();

        this.setupDragAndDrop();
        this.bindSocketListeners();
        this.bindPlayerListeners();
        this.virtualPlayer.bindListeners(this.socket);

        this.player.start();
    }

    bindSocketListeners() {
        this.socket.on("presence.update", this.onSocketPresenceUpdate.bind(this));
        this.socket.setupBeforeUnloadHandler();
    }

    bindPlayerListeners() {
        this.player.on("onSeek", this.virtualPlayer.emitSeek.bind(this.virtualPlayer));
    }

    setupKeypressListeners() {
        document.addEventListener("keydown", (e) => {
            if (e.key.toLowerCase() === "d" && e.ctrlKey && e.altKey)
                this.debugButtonVisible.set(!this.debugButtonVisible.get());
        });
    }

    openSearch(query) {
        new SearchBox(this, query);
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

    async createRoom() {
        try {
            const res = await this.post("/api/room.create");
            return res && res.code;
        } catch (e) {
            console.warn("ShareTube createRoom failed", e);
            return null;
        }
    }

    async tryJoinRoomFromUrl() {
        if (!this.hashRoomCode) return;
        await this.socket.joinRoom(this.hashRoomCode);
    }

    async copyCurrentRoomCodeToClipboard() {
        const code = state.roomCode.get();
        if (!code) return;
        try {
            await navigator.clipboard.writeText(`${window.location.origin}#st:${code}`);
        } catch (_) {
            console.warn("ShareTube copyCurrentRoomCodeToClipboard failed", _);
        }
    }

    async onSocketPresenceUpdate(presence) {
        if (!Array.isArray(presence)) return;
        syncLiveList({
            localList: state.users,
            remoteItems: presence,
            extractRemoteId: (v) => v.id,
            extractLocalId: (u) => u.id,
            createInstance: (item) => new ShareTubeUser(item),
            updateInstance: (u, item) => u.updateFromRemote(item),
        });
    }

    async enqueueUrl(url) {
        return await this.socket.emit("queue.add", { url });
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
            if (ytUrls.length === 0) return;
            ytUrls.forEach((u) => this.enqueueUrl(u));
            state.queueVisible.set(true);
        };
        this.sharetube_main.addEventListener("dragenter", onEnter);
        this.sharetube_main.addEventListener("dragover", onOver);
        this.sharetube_main.addEventListener("dragleave", onLeave);
        this.sharetube_main.addEventListener("drop", onDrop);
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
        setTimeout(() => this.sharetube_main.classList.add("visible"), 100);
    }

    navKick() {
        console.log("ShareTube navKick", this);
    }
}
