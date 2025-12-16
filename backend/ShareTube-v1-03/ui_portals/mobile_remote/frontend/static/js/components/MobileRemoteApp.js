import { html, css, LiveVar } from "/extension/shared/dep/zyx.js";
import QueueList from "./QueueList.js";

import SocketManager from "/extension/appshell/core/managers/socket.js";
import VirtualPlayer from "/extension/appshell/core/managers/virtualPlayer.js";
import state from "/extension/appshell/core/state/state.js";
import { decodeJwt } from "/extension/appshell/core/utils/utils.js";
import { fullscreenSVG, exitFullscreenSVG } from "/extension/shared/assets/svgs.js";
import { extractUrlsFromDataTransfer, isYouTubeUrl } from "/extension/appshell/core/utils/utils.js";

const noop = () => {};

class MobileRemoteAppVirtualPlayer extends VirtualPlayer {
    gotoVideoIfNotOnVideoPage() {
        // Override navigation when running outside YouTube.
    }
}

export default class MobileRemoteApp {
    constructor() {
        // Local-only status
        this.isReady = new LiveVar(false);
        this.isFullscreen = new LiveVar(false);

        this.pendingRoomCode = "";
        this.socketHandlersInitialized = false;

        this.socket = new SocketManager(this);

        this.youtubePlayer = {
            setDesiredState: noop,
            setDesiredProgressMs: noop,
            onRoomStateChange: noop,
            splash: { call: noop },
        };

        this.roomManager = {
            updateCodeHashInUrl: (code) => this.updateRoomCodeInUrl(code),
            stHash: () => "",
        };

        // Extension compatibility layer
        this.virtualPlayer = new MobileRemoteAppVirtualPlayer(this);
        this.virtualPlayer.bindListeners(this.socket);
        this.setupSocketHandlers();

        // Set user ID from JWT token (same as extension)
        this.applyUserIdFromToken();

        // Create sub-components
        this.queueList = new QueueList(this);

        html`
            <div
                this="appElement"
                class=${this.isReady.interp((r) => (r ? "mobile-remote-app visible" : "mobile-remote-app"))}
            >
                <main class="remote-content" zyx-if=${state.inRoom}>
                    <section class="queue-section glass-panel">${this.queueList}</section>
                </main>
                <main class="remote-content" zyx-else>
                    <section class="playback-section-unavailable glass-panel">
                        <p>Not connected to a room. Please scan the QR code again.</p>
                    </section>
                </main>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.appElement;

        this.setupDragAndDrop();
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

    async backEndUrl() {
        const configured = (window.mobileRemoteConfig?.backendUrl || "").trim();
        const base = configured || window.location.origin;
        return base.replace(/\/$/, "");
    }

    async authToken() {
        // First check for token in config (from auth URL)
        const configToken = (window.mobileRemoteConfig?.token || "").trim();
        if (configToken) {
            // Store the token for future refreshes
            localStorage.setItem("mobile_remote_token", configToken);
            return configToken;
        }

        // Fall back to stored token
        return localStorage.getItem("mobile_remote_token") || "";
    }

    async enqueueUrl(url) {
        return await this.socket.emit("queue.add", { url });
    }

    async applyUserIdFromToken() {
        try {
            const auth_token = await this.authToken();
            if (!auth_token) {
                state.userId.set(0);
                state.avatarUrl.set("");
                return;
            }
            const claims = decodeJwt(auth_token);
            const picture = claims && claims.picture;
            state.avatarUrl.set(picture || "");
            try {
                state.userId.set(claims && (claims.sub != null ? Number(claims.sub) : 0));
            } catch {
                state.userId.set(0);
            }
        } catch (e) {
            console.warn("Mobile Remote applyUserIdFromToken failed", e);
        }
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
            state.inRoom.set(false);
        });

        this.socket.on("room.joined", (data) => this.handleRoomJoined(data));
        this.socket.on("room.error", (data) => this.handleRoomError(data));
    }

    async connectToRoom(roomCode) {
        state.roomCode.set(roomCode);
        this.pendingRoomCode = roomCode;

        const token = await this.authToken();

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

    handleRoomJoined(data = {}) {
        console.log("Mobile Remote: handleRoomJoined", { data });

        const snapshot = data.snapshot || {};

        if (data.code) {
            console.log("Mobile Remote: Setting room code", { code: data.code });
            state.roomCode.set(data.code);
            this.pendingRoomCode = data.code;
            // Store room code for future refreshes
            localStorage.setItem("mobile_remote_room_code", data.code);
        }

        this.virtualPlayer.onRoomJoinResult({
            ok: data.ok ?? true,
            code: data.code,
            snapshot,
            serverNowMs: data.serverNowMs,
            clientTimestamp: data.clientTimestamp,
        });

        this.cleanAuthFromUrl();
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
        if (currentUrl.includes("/mobile-remote/auth/") && roomCode && !roomCode.includes("/")) {
            try {
                const url = new URL(currentUrl);
                const oldPathname = url.pathname;
                url.pathname = `/mobile-remote/${roomCode}`;
                const newUrl = url.toString();
                window.history.replaceState({}, "", newUrl);
            } catch (e) {
                console.error("Mobile Remote: Failed to clean URL", e);
            }
        }
    }

    togglePlayPause() {
        if (!this.socket || !state.inRoom.get()) {
            console.warn("Mobile Remote: Not connected to room");
            return;
        }

        const isPlaying = state.roomState.get() === "playing";
        this.socket.emit(isPlaying ? "room.control.pause" : "room.control.play", {});
    }

    skipToNext() {
        if (!this.socket || !state.inRoom.get()) {
            console.warn("Mobile Remote: Not connected to room");
            return;
        }

        this.socket.emit("room.control.skip", {});
    }

    restartVideo() {
        if (!this.socket || !state.inRoom.get()) {
            console.warn("Mobile Remote: Not connected to room");
            return;
        }

        this.socket.emit("room.control.restartvideo", {});
    }

    relativeSeek(delta) {
        if (!this.socket || !state.inRoom.get()) {
            console.warn("Mobile Remote: Not connected to room");
            return;
        }

        this.socket.emit("room.control.seek", {
            delta_ms: delta * 1000,
            play: state.roomState.get() === "playing",
        });
    }

    seekToPosition(positionInSeconds) {
        if (!this.socket || !state.inRoom.get()) {
            console.warn("Mobile Remote: Not connected to room");
            return;
        }

        const progressMs = Math.floor(positionInSeconds * 1000);
        this.virtualPlayer.emitSeek(progressMs);
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
        const appElement = this.appElement;
        if (!appElement) return;

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await appElement.requestFullscreen();
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
