console.log("appshell/app.js loaded");
import { html, css, LiveVar, ZyXInput } from "../shared/dep/zyx.js";

import state from "./core/state/state.js";

import SocketManager from "./core/managers/socket.js";
import DebugMenu from "./components/DebugMenu.js";
import VirtualPlayer from "./core/managers/virtualPlayer.js";
import RoomManager from "./core/managers/room.js";
import AuthManager from "./core/managers/auth.js";
import YoutubePlayerManager from "./core/managers/youtubePlayer/manager.js";
import UIManager from "./core/managers/ui.js";
import StorageManager from "./core/managers/storage.js";

import SearchBox from "./components/SearchBox.js";
import QRCodeComponent from "./components/QRCode.js";

export const zyxInput = new ZyXInput();

import ShareTubePill from "./components/ShareTubePill.js";
import ShareTubeHub from "./components/Hub.js";

import { resolveAssetUrl } from "../shared/urlResolver.js";

css`
    @import url("https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&display=swap");
    @import url(${resolveAssetUrl("shared/css/styles-base.css")});
    @import url(${resolveAssetUrl("shared/css/styles-forms.css")});
    @import url(${resolveAssetUrl("shared/css/styles-components.css")});
    @import url(${resolveAssetUrl("shared/css/styles-main.css")});
    @import url(${resolveAssetUrl("shared/css/styles-animations.css")});
    @import url(${resolveAssetUrl("shared/css/pill.css")});
    @import url(${resolveAssetUrl("shared/css/splash.css")});
`;

export default class ShareTubeApp {
    logSelf() {
        console.log("ShareTubeApp", { app: this, state: state });
    }

    async backEndUrl() {
        const backend_url = await this.storageManager.get("backend_url", "https://sharetube.wumbl3.xyz", "sync");
        return backend_url.replace(/\/+$/, "");
    }

    resetRoomState() {
        state.resetRoomState();
        this.youtubePlayer.stop();
        this.youtubePlayer.onRoomStateChange("");
    }

    constructor() {
        this.socket = new SocketManager(this);
        this.virtualPlayer = new VirtualPlayer(this);
        this.roomManager = new RoomManager(this);
        this.authManager = new AuthManager(this);
        this.uiManager = new UIManager(this);
        this.storageManager = new StorageManager(this);
        this.youtubePlayer = new YoutubePlayerManager(this);

        // Components
        this.hub = new ShareTubeHub(this);
        this.debugMenu = new DebugMenu(this);
        this.sharetubePill = new ShareTubePill(this);
        this.qrCode = new QRCodeComponent(this);

        this.storageManager.get("debug_mode", false).then((debug_mode) => state.debug_mode.set(debug_mode));

        html`
            <div id="sharetube_main" class="extension-ui st_reset">${this.hub} ${this.debugMenu} ${this.sharetubePill}</div>
            ${this.qrCode}
        `.bind(this);

        this.setupKeypressListeners();

        this.uiManager.setupDragAndDrop();
        this.bindSocketListeners();
        this.virtualPlayer.bindListeners(this.socket);
        this.virtualPlayer.on("virtualplayer.room-join-result", (data) => {
            this.roomManager.updateCodeHashInUrl(data.code);
        });
    }

    bindSocketListeners() {
        this.socket.on("presence.update", this.roomManager.onSocketPresenceUpdate.bind(this.roomManager));
        this.socket.on("user.ready.update", this.roomManager.onSocketUserReadyUpdate.bind(this.roomManager));
        this.socket.on("client.verify_connection", this.onClientVerifyConnection.bind(this));
        this.socket.setupBeforeUnloadHandler();
    }

    setupKeypressListeners() {
        document.addEventListener("keydown", (e) => {
            if (e.key.toLowerCase() === "d" && e.altKey) {
                state.debug_mode.set(!state.debug_mode.get());
                this.storageManager.set("debug_mode", state.debug_mode.get());
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

    async copyCurrentRoomCodeToClipboard() {
        return await this.roomManager.copyCurrentRoomCodeToClipboard();
    }

    async enqueueUrl(url) {
        return await this.socket.emit("queue.add", { url });
    }

    async clearAuthState() {
        // Clear auth token from storage
        await this.storageManager.remove(["auth_token"]);
        // Clear user state
        state.userId.set(0);
        state.avatarUrl.set("");
        // Reset room state
        this.resetRoomState();
        // Disconnect socket to prevent further authenticated requests
        this.socket.disconnect();
        console.log("ShareTube: Auth state cleared - user needs to re-sign in");
    }

    attachBrowserListeners() {
        return this.storageManager.attachBrowserListeners();
    }

    detachBrowserListeners() {
        return this.storageManager.detachBrowserListeners();
    }

    onClientVerifyConnection(data) {
        // When we receive this event, it means another client connection for this user
        // has disconnected. We should respond to confirm we're still active.
        // The server will use this to determine whether to keep the user in the room.
        try {
            this.socket.emit("client.verification_response", {
                ts: Date.now(),
                disconnected_socket_id: data.disconnected_socket_id,
            });
        } catch (err) {
            console.warn("ShareTube: failed to emit verification response", err);
        }
    }

    start() {
        console.log("ShareTube Init");
        this.appendTo(document.body);
        this.attachBrowserListeners();
        this.authManager.applyAvatarFromToken();
        this.roomManager.tryJoinRoomFromUrl();
        setTimeout(() => this.sharetube_main.classList.add("visible"), 1);
    }

    navKick() {
        console.log("ShareTube navKick", this);
        // Rebind video player on navigation if needed
        this.youtubePlayer.onNavigation();
    }
}
