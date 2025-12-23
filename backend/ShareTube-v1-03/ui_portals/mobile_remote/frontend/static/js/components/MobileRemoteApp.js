import { html, css, LiveVar } from "/extension/shared/dep/zyx.js";
import QueueList from "./QueueList.js";

import SocketManager from "/extension/appshell/core/managers/socket.js";
import VirtualPlayer from "/extension/appshell/core/managers/virtualPlayer.js";
import RoomManager from "/extension/appshell/core/managers/room.js";
import AuthManager from "/extension/appshell/core/managers/auth.js";
import StorageManager from "/extension/appshell/core/managers/storage.js";
import state from "/extension/appshell/core/state/state.js";
import { fullscreenSVG, exitFullscreenSVG } from "/extension/shared/assets/svgs.js";
import { extractUrlsFromDataTransfer, isYouTubeUrl } from "/extension/appshell/core/utils/utils.js";

const noop = () => {};

class MobileRemoteAppVirtualPlayer extends VirtualPlayer {
    gotoVideoIfNotOnVideoPage() {
        // Override navigation when running outside YouTube.
    }
}

export default class MobileRemoteApp {
    async backEndUrl() {
        const backend_url = await this.storageManager.get("backend_url", "https://sharetube.wumbl3.xyz", "sync");
        return backend_url.replace(/\/+$/, "");
    }

    resetRoomState() {
        state.resetRoomState();
        this.youtubePlayer?.stop();
        this.youtubePlayer?.onRoomStateChange("");
    }

    constructor() {
        // Local-only status
        this.isReady = new LiveVar(false);
        this.isFullscreen = new LiveVar(false);

        this.pendingRoomCode = "";
        this.socketHandlersInitialized = false;

        this.socket = new SocketManager(this);
        this.storageManager = new StorageManager(this);
        this.authManager = new AuthManager(this);
        this.roomManager = new RoomManager(this);

        // Extension compatibility layer
        this.virtualPlayer = new MobileRemoteAppVirtualPlayer(this);
        this.virtualPlayer.bindListeners(this.socket);
        this.setupSocketHandlers();

        this.virtualPlayer.on("virtualplayer.room-join-result", (data) => {
            this.cleanAuthFromUrl();
        });

        // Create sub-components
        this.queueList = new QueueList(this);

        html`
            <div
                this="main"
                id="sharetube_main"
                ready=${this.isReady.interp((r) => r || null)}
                class="mobile-remote-app st_reset"
            >
                <main class="remote-content" zyx-if=${state.inRoom}>
                    <section class="queue-section">${this.queueList}</section>
                </main>
                <main class="remote-content" zyx-else>
                    <section class="playback-section-unavailable glass-panel">
                        <p>Not connected to a room. Please scan the QR code again.</p>
                    </section>
                </main>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.main;

        this.setupDragAndDrop();
        this.bindSocketListeners();
    }

    bindSocketListeners() {
        this.socket.on("presence.update", this.roomManager.onSocketPresenceUpdate.bind(this.roomManager));
        this.socket.on("user.ready.update", this.roomManager.onSocketUserReadyUpdate.bind(this.roomManager));
        this.socket.on("client.verify_connection", this.onClientVerifyConnection.bind(this));
        this.socket.setupBeforeUnloadHandler();
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

    async initializeAuth(token) {
        console.log("Mobile Remote: Initializing auth", { token });
        if (token && token.trim() !== "") {
            console.log("Mobile Remote: Initializing auth with provided token");
            await this.storageManager.set("auth_token", token);
        } else {
            console.log("Mobile Remote: No token provided, checking storage");
        }
        await this.authManager.applyAvatarFromToken();
    }

    setupDragAndDrop() {
        this.main.addEventListener("dragenter", this.onEnter.bind(this));
        this.main.addEventListener("dragover", this.onOver.bind(this));
        this.main.addEventListener("dragleave", this.onLeave.bind(this));
        this.main.addEventListener("drop", this.onDrop.bind(this));
    }

    onEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this.main.classList.add("dragover");
    }

    onOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        this.main.classList.add("dragover");
    }

    onLeave(e) {
        e.preventDefault();
        this.main.classList.remove("dragover");
    }

    onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.main.classList.remove("dragover");
        const urls = extractUrlsFromDataTransfer(e.dataTransfer);
        const ytUrls = urls.filter(isYouTubeUrl);
        if (ytUrls.length === 0) return;
        for (const url of ytUrls) {
            this.enqueueUrl(url);
        }
    }

    async post(url, options = {}) {
        return await this.authManager.post(url, options);
    }

    async enqueueUrl(url) {
        return await this.socket.emit("queue.add", { url });
    }

    setupSocketHandlers() {
        if (this.socketHandlersInitialized) return;
        this.socketHandlersInitialized = true;

        this.socket.on("connect", () => {
            console.log("Mobile Remote: Socket connected");
            if (this.pendingRoomCode) {
                this.socket.emit("room.join", { code: this.pendingRoomCode, clientTimestamp: Date.now() });
            }
        });

        this.socket.on("disconnect", () => {
            console.log("Mobile Remote: Socket disconnected");
        });

        this.socket.on("room.joined", (data) => this.handleRoomJoined(data));
        this.socket.on("room.error", (data) => this.handleRoomError(data));
    }

    async connectToRoom(roomCode) {
        state.roomCode.set(roomCode);
        this.pendingRoomCode = roomCode;

        const token = await this.authManager.authToken();

        if (!token || token.trim() === "") {
            this.handleRoomError("No authentication token found. Please scan the QR code again.");
            return;
        }

        try {
            const socketInstance = await this.socket.ensureSocket();
            if (!socketInstance) {
                this.handleRoomError("Unable to reach ShareTube servers. Please try again.");
                return;
            }

            if (socketInstance.connected) {
                await this.socket.emit("room.join", { code: roomCode, clientTimestamp: Date.now() });
            }
        } catch (err) {
            this.handleRoomError(err);
        }
    }

    handleRoomError(error) {
        console.error("Mobile Remote: Room error", { error });
    }

    updateRoomCodeInUrl(code) {
        if (!code) return;
        state.roomCode.set(code);
        this.cleanAuthFromUrl();
    }

    cleanAuthFromUrl() {
        const currentUrl = window.location.href;
        const roomCode = state.roomCode.get();
        // Only clean if we're on an auth URL and have a valid room code
        console.log("Mobile Remote: Cleaning auth from URL", { currentUrl, roomCode });
        if (currentUrl.includes("/mobile-remote/auth/") && roomCode && !roomCode.includes("/")) {
            console.log("Mobile Remote: Cleaning auth from URL", { currentUrl, roomCode });
            try {
                const url = new URL(currentUrl);
                const oldPathname = url.pathname;
                url.pathname = `/mobile-remote/${roomCode}`;
                const newUrl = url.toString();
                console.log("Mobile Remote: New URL", { newUrl });
                window.history.replaceState({}, "", newUrl);
            } catch (e) {
                console.error("Mobile Remote: Failed to clean URL", e);
            }
        }
    }

    selectQueueItem(videoId) {
        console.log("Mobile Remote: Queue item selection not implemented", videoId);
    }

    revealApp() {
        this.isReady.set(true);
        const loader = document.getElementById("app-loader");
        if (loader) {
            loader.classList.add("hidden");
            // Remove loader from DOM after transition
            setTimeout(() => {
                if (loader.parentNode) loader.parentNode.removeChild(loader);
            }, 500);
        }

        // Set up fullscreen change listeners
        this.setupFullscreenListeners();
    }

    setupFullscreenListeners() {
        const handleFullscreenChange = () => {
            this.isFullscreen.set(!!document.fullscreenElement);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
    }

    async toggleFullscreen() {
        const main = this.main;
        if (!main) return;

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await main.requestFullscreen();
            }
        } catch (err) {
            console.error("Fullscreen toggle error:", err);
        }
    }
}

css`
    .mobile-remote-app {
        min-height: 100dvh;
        height: 100dvh;
        width: 100%;
        display: flex;
        flex-direction: column;
        background: var(--bg-app);
    }

    .remote-content {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .queue-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        background: var(--bg-app);
        justify-content: center;
        align-items: center;
    }

    .queue-section > * {
        flex: 1;
        position: relative;
        z-index: 1;
    }

    .playback-section-unavailable {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        padding: 20px;
    }
`;
