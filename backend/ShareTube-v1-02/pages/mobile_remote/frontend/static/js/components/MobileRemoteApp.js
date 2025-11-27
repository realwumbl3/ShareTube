import { html, css, LiveVar } from "/extension/app/dep/zyx.js";
import PlaybackControls from "./PlaybackControls.js";
import QueueList from "./QueueList.js";

import SocketManager from "/extension/app/socket.js";
import VirtualPlayer from "/extension/app/virtualPlayer.js";
import state from "/extension/app/state.js";

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
        this.playbackControls = new PlaybackControls(this);
        this.queueList = new QueueList(this);

        html`
            <div class="mobile-remote-app">
                <header class="remote-header glass-panel">
                    <div class="header-row">
                        <h1>ShareTube</h1>
                        <div class="room-status" zyx-if=${state.roomCode}>
                            <span class="room-code">${state.roomCode.interp()}</span>
                            <span class="connection-status" zyx-if=${state.inRoom}>
                                <span class="status-dot connected"></span>
                            </span>
                            <span class="connection-status" zyx-if=${[state.inRoom, (c) => !c]}>
                                <span class="status-dot disconnected"></span>
                            </span>
                        </div>
                    </div>
                    <div class="error-message" zyx-if=${this.error}>
                        <span class="error-text">${this.error.interp()}</span>
                    </div>
                    <div class="current-video">
                        <span class="video-title"
                            >${state.currentPlaying.item.interp((entry) => entry?.title || "No video playing")}</span
                        >
                    </div>
                </header>

                <main class="remote-content">
                    <section class="playback-section glass-panel">${this.playbackControls}</section>
                    <section class="queue-section glass-panel">${this.queueList}</section>
                </main>
            </div>
        `.bind(this);
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
                this.socket.emit("room.join", { code: this.pendingRoomCode });
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
            console.error("Mobile Remote: No valid authentication token found");
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
                await this.socket.emit("room.join", { code: roomCode });
            }
        } catch (err) {
            console.error("Mobile Remote: Failed to initialize socket connection", err);
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
        });

        this.cleanAuthFromUrl();
    }

    handleRoomError(data = {}) {
        console.error("Mobile Remote: Room error", data);
        this.showError(data.error || "Room connection error");
    }

    updateRoomCodeInUrl(code) {
        if (!code) return;
        state.roomCode.set(code);
        this.cleanAuthFromUrl();
    }

    showError(message) {
        this.error.set(message);
        state.inRoom.set(false);
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
}

css`
    /* Mobile Remote Specific Styles */

    /* Main Container */
    .mobile-remote-app {
        min-height: 100dvh;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 100%;
    }

    /* Header */
    .remote-header {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        position: relative;
        overflow: hidden;
        text-align: left;

        /* Overrides to standard glass panel */
        background: var(--bg-queue-header);
        border-bottom: var(--border-queue-dim);
    }

    .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .remote-header h1 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--text-primary);
        position: relative;
        z-index: 1;
    }

    /* Room Status & Connection */
    .room-status {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        position: relative;
        z-index: 1;
        font-size: 0.9rem;
        background: rgba(255, 255, 255, 0.05);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .room-code {
        color: var(--accent-primary, #6366f1);
        font-weight: 600;
        font-family: var(--font-mono, monospace);
        letter-spacing: 0.05em;
    }

    .connection-status {
        display: flex;
        align-items: center;
    }

    .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
    }

    .status-dot.connected {
        background: var(--accent-success, #10b981);
        box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
    }

    .status-dot.disconnected {
        background: var(--accent-danger, #ef4444);
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
    }

    /* Error Handling */
    .error-message {
        position: relative;
        z-index: 1;
        margin-bottom: 0.5rem;
    }

    .error-text {
        display: block;
        color: var(--accent-danger, #ef4444);
        font-size: 0.9rem;
        background: rgba(239, 68, 68, 0.1);
        padding: 0.5rem;
        border-radius: 6px;
        border: 1px solid rgba(239, 68, 68, 0.2);
    }

    /* Content Info */
    .current-video {
        position: relative;
        z-index: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .video-title {
        font-size: 0.9rem;
        color: var(--text-secondary);
        opacity: 0.9;
    }

    /* Layout Sections */
    .remote-content {
        flex: 1;
        display: grid;
        grid-template-rows: max-content minmax(0, 1fr);
        gap: 1rem;
        min-height: 0;
    }

    .playback-section,
    .queue-section {
        position: relative;
        /* .glass-panel provides background */
    }

    .playback-section {
        padding: 1rem;
    }

    .queue-section {
        padding: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .playback-section > *,
    .queue-section > * {
        position: relative;
        z-index: 1;
    }

    .playback-section h2,
    .queue-section h2 {
        margin: 0 0 1rem 0;
        color: var(--text-primary);
        font-size: 1.2rem;
        font-weight: 600;
    }

    /* Responsive Adjustments */
    @media (max-width: 480px) {
        .mobile-remote-app {
            padding: 0.5rem;
        }

        .remote-header {
            padding: 1rem;
        }

        .remote-header h1 {
            font-size: 1.3rem;
        }

        .video-title {
            font-size: 1rem;
        }
    }
`;
