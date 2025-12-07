import { html, css, LiveVar } from "/extension/app/@dep/zyx.js";
import PlaybackControls from "./PlaybackControls.js";
import QueueList from "./QueueList.js";

import SocketManager from "/extension/app/managers/socket.js";
import VirtualPlayer from "/extension/app/managers/virtualPlayer.js";
import state from "/extension/app/state.js";
import { fullscreenSVG, exitFullscreenSVG } from "/extension/app/@assets/svgs.js";

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
                <header class="remote-header glass-panel">
                    <div class="header-row">
                        <h1>ShareTube</h1>
                        <div class="header-actions">
                            <div class="room-status" zyx-if=${state.roomCode}>
                                <span class="room-code">${state.roomCode.interp()}</span>
                                <span class="connection-status" zyx-if=${state.inRoom}>
                                    <span class="status-dot connected"></span>
                                </span>
                                <span class="connection-status" zyx-else>
                                    <span class="status-dot disconnected"></span>
                                </span>
                            </div>
                            <button
                                class="fullscreen-toggle glass-button"
                                zyx-click=${() => this.toggleFullscreen()}
                                title=${this.isFullscreen.interp((fs) => (fs ? "Exit Fullscreen" : "Enter Fullscreen"))}
                            >
                                <img
                                    class="fullscreen-icon"
                                    src=${this.isFullscreen.interp((fs) => (fs ? exitFullscreenSVG : fullscreenSVG))}
                                    alt=${this.isFullscreen.interp((fs) =>
                                        fs ? "Exit Fullscreen" : "Enter Fullscreen"
                                    )}
                                    draggable="false"
                                />
                            </button>
                        </div>
                    </div>
                    <div class="error-message" zyx-if=${this.error}>
                        <span class="error-text">${this.error.interp()}</span>
                    </div>
                </header>

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
                await this.socket.emit("room.join", { code: roomCode });
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
    /* Mobile Remote Specific Styles */

    /* Main Container - Mobile Layout (Vertical Stack) */
    .mobile-remote-app {
        padding: 1rem;
        display: grid;
        grid-template-areas:
            "header"
            "queue";
        grid-template-rows: max-content 1fr;
        gap: 10px;
        max-width: 100%;
        height: 100dvh;
        min-height: 100dvh;

        & {
            /* Fullscreen styles */
            .mobile-remote-app:fullscreen {
                padding: 1rem;
                background-color: var(--bg-app);
            }

            /* Header */
            .remote-header {
                grid-area: header;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                padding: 0.75rem 1rem;
                position: relative;
                overflow: hidden;
                text-align: left;
                max-width: 800px;
                /* Overrides to standard glass panel */
                background: var(--bg-queue-header);
                border-bottom: var(--border-queue-dim);
                user-select: none;
            }

            .header-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .header-actions {
                display: flex;
                align-items: center;
                gap: 0.5rem;
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

            /* Fullscreen Toggle Button */
            .fullscreen-toggle {
                padding: 0.5rem 0.75rem;
                font-size: 1.2rem;
                line-height: 1;
                min-width: 2.5rem;
                height: 2.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                z-index: 1;
            }

            .fullscreen-icon {
                display: inline-block;
                width: 1.2rem;
                height: 1.2rem;
                transition: transform 0.2s ease;
                user-select: none;
            }

            .fullscreen-toggle:hover .fullscreen-icon {
                transform: scale(1.1);
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
                display: contents;
            }

            .playback-section {
                grid-area: controls;
                max-width: 800px;
                position: relative;
                padding: 1rem;
                /* .glass-panel provides background */
            }

            .queue-section {
                grid-area: queue;
                position: relative;
                padding: 0;
                display: grid;
                place-items: stretch;
                overflow: hidden;
                /* .glass-panel provides background */
            }

            .playback-section-unavailable {
                grid-area: controls;
                padding: 1rem;
                text-align: center;
                display: grid;
                place-items: center;
                place-content: center;
                height: 100%;
                width: 100%;
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

            /* Desktop Layout - Header and Controls Side by Side */
            @media (min-aspect-ratio: 1/1) and (min-width: 600px) {
                .mobile-remote-app {
                    grid-template-areas:
                        "header controls"
                        "queue queue";
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: max-content 1fr;
                }

                .playback-section {
                    height: 100%;
                }
            }
        }
    }
    /* Large Desktop Layout - Header and Controls Vertical on Left, Queue on Right */
    @media (min-width: 900px), (min-aspect-ratio: 16/9) {
        .mobile-remote-app {
            grid-template-areas:
                "header queue"
                "controls queue";
            grid-template-columns: minmax(300px, 1fr) 1fr;
            grid-template-rows: max-content 1fr;
            & {
                .playback-section {
                    height: max-content;
                }
            }
        }
    }

    /* Responsive Adjustments */
    @media (max-width: 480px) {
        .mobile-remote-app {
            padding: 0.5rem;
            & {
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
        }
    }
`;
