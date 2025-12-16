import { html, css, LiveVar } from "/extension/shared/dep/zyx.js";
import QueueList from "./QueueList.js";

import SocketManager from "/extension/appshell/core/managers/socket.js";
import VirtualPlayer from "/extension/appshell/core/managers/virtualPlayer.js";
import state from "/extension/appshell/core/state/state.js";
import { fullscreenSVG, exitFullscreenSVG } from "/extension/shared/assets/svgs.js";

const noop = () => {};

class MobileRemoteAppVirtualPlayer extends VirtualPlayer {
    gotoVideoIfNotOnVideoPage() {
        // Override navigation when running outside YouTube.
    }
}

export default class MobileRemoteApp {
    constructor() {
        // Local-only status
        this.error = new LiveVar("");
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
    }

    async backEndUrl() {
        const configured = (window.mobileRemoteConfig?.backendUrl || "").trim();
        const base = configured || window.location.origin;
        return base.replace(/\/$/, "");
    }

    async authToken() {
        return (window.mobileRemoteConfig?.token || "").trim();
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
        this.error.set("");

        const token = await this.authToken();

        if (!token || token.trim() === "") {
            // console.error("Mobile Remote: No valid authentication token found");
            this.showError("No authentication token found. Please scan the QR code again.");
            return;
        }

        try {
            const socketInstance = await this.socket.ensureSocket();
            if (!socketInstance) {
                this.showError("Unable to reach ShareTube servers. Please try again.");
                return;
            }

            if (socketInstance.connected) {
                await this.socket.emit("room.join", { code: roomCode, clientTimestamp: Date.now() });
            }
        } catch (err) {
            // console.error("Mobile Remote: Failed to initialize socket connection", err);
            this.showError("Failed to initialize socket connection. Please retry.");
        }
    }

    handleRoomJoined(data = {}) {
        console.log("Mobile Remote: Joined room payload", data);
        const snapshot = data.snapshot || {};

        if (data.code) {
            state.roomCode.set(data.code);
            this.pendingRoomCode = data.code;
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

    handleRoomError(data = {}) {
        // console.error("Mobile Remote: Room error", data);
        this.showError(data.error || "Room connection error");
    }

    updateRoomCodeInUrl(code) {
        if (!code) return;
        state.roomCode.set(code);
        this.cleanAuthFromUrl();
    }

    showError(message) {
        clearTimeout(this.errorClearedTimeout);
        this.error.set(message);
        this.errorClearedTimeout = setTimeout(() => {
            this.error.set("");
        }, 5000);
    }

    cleanAuthFromUrl() {
        const currentUrl = window.location.href;
        const authPathPattern = /\/mobile-remote\/auth\/[^/?#]+/;
        const roomCode = state.roomCode.get();

        if (authPathPattern.test(currentUrl) && roomCode) {
            const cleanUrl = currentUrl.replace(authPathPattern, `/mobile-remote/${roomCode}`);
            window.history.replaceState({}, "", cleanUrl);
            console.log("Mobile Remote: Cleaned auth token from URL, preserved room code");
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
            this.showError("Fullscreen not supported or blocked");
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
