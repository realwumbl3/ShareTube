import { html, css, LiveVar, LiveList } from "/extension/app/dep/zyx.js";
import { io } from "/extension/app/dep/socket.io.min.esm.js";
import PlaybackControls from "./PlaybackControls.js";
import QueueList from "./QueueList.js";

export default class MobileRemoteApp {
    constructor() {
        // Mobile remote state
        this.currentVideo = new LiveVar({ title: "No video playing", duration: 0 });
        this.playbackStatus = new LiveVar({
            is_playing: false,
            current_time: 0,
            duration: 0,
            volume: 75
        });
        this.queue = new LiveList([]);
        this.loading = new LiveVar(false);

        // Create sub-components
        this.playbackControls = new PlaybackControls(this);
        this.queueList = new QueueList(this);

        // Initialize data loading
        this.loadStatus();
        this.loadQueue();
        this.startPolling();

        html`
            <div class="mobile-remote-app">
                <header class="remote-header glass-panel">
                    <h1 class="text-gradient">ShareTube Remote</h1>
                    <div class="current-video">
                        <span class="video-title">${this.currentVideo.interp((v) => v.title)}</span>
                    </div>
                </header>

                <main class="remote-content">
                    <section class="playback-section glass-panel">
                        <h2>Playback Controls</h2>
                        ${this.playbackControls}
                    </section>

                    <section class="queue-section glass-panel">
                        <h2>Queue</h2>
                        ${this.queueList}
                    </section>
                </main>
            </div>
        `.bind(this);
    }

    async loadStatus() {
        try {
            const response = await fetch("/mobile-remote/api/status");
            const status = await response.json();

            this.playbackStatus.set({
                is_playing: status.is_playing || false,
                current_time: status.current_time || 0,
                duration: status.duration || 0,
                volume: status.volume || 75
            });

            if (status.current_video) {
                this.currentVideo.set(status.current_video);
            }
        } catch (error) {
            console.error("Error loading status:", error);
        }
    }

    async loadQueue() {
        try {
            const response = await fetch("/mobile-remote/api/queue");
            const queueData = await response.json();

            this.queue.splice(0, this.queue.length);
            (queueData || []).forEach((item) => this.queue.push(item));
        } catch (error) {
            console.error("Error loading queue:", error);
        }
    }

    startPolling() {
        // Poll for status updates every 5 seconds
        setInterval(() => {
            if (!this.loading.get()) {
                this.loadStatus();
            }
        }, 5000);
    }

    // Methods for controlling playback (called by sub-components)
    async togglePlayPause() {
        try {
            const response = await fetch("/mobile-remote/api/control/play", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "toggle" }),
            });

            if (response.ok) {
                // Update local state optimistically
                const currentStatus = this.playbackStatus.get();
                this.playbackStatus.set({
                    ...currentStatus,
                    is_playing: !currentStatus.is_playing
                });
            }
        } catch (error) {
            console.error("Error toggling playback:", error);
        }
    }

    async previousVideo() {
        try {
            await fetch("/mobile-remote/api/control/play", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "previous" }),
            });
        } catch (error) {
            console.error("Error going to previous video:", error);
        }
    }

    async nextVideo() {
        try {
            await fetch("/mobile-remote/api/control/play", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "next" }),
            });
        } catch (error) {
            console.error("Error going to next video:", error);
        }
    }

    async setVolume(volume) {
        try {
            await fetch("/mobile-remote/api/control/volume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ volume: parseInt(volume, 10) }),
            });

            // Update local state
            const currentStatus = this.playbackStatus.get();
            this.playbackStatus.set({
                ...currentStatus,
                volume: parseInt(volume, 10)
            });
        } catch (error) {
            console.error("Error setting volume:", error);
        }
    }

    async seekToPosition(position) {
        try {
            await fetch("/mobile-remote/api/control/seek", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ position: position }),
            });
        } catch (error) {
            console.error("Error seeking:", error);
        }
    }

    async selectQueueItem(videoId) {
        try {
            await fetch("/mobile-remote/api/control/play", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "select", videoId: videoId }),
            });
        } catch (error) {
            console.error("Error selecting queue item:", error);
        }
    }
}

css`
    .mobile-remote-app {
        min-height: 100vh;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .remote-header {
        text-align: center;
        padding: 1.5rem;
        position: relative;
        overflow: hidden;
    }

    .remote-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at top center, var(--glass-shine), transparent 70%);
        opacity: 0.6;
    }

    .remote-header h1 {
        margin: 0 0 0.5rem 0;
        font-size: 1.5rem;
        font-weight: 700;
        position: relative;
        z-index: 1;
    }

    .current-video {
        position: relative;
        z-index: 1;
    }

    .video-title {
        font-size: 1.1rem;
        color: var(--text-secondary);
        opacity: 0.9;
    }

    .remote-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .playback-section,
    .queue-section {
        position: relative;
    }

    .playback-section::before,
    .queue-section::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at top right, var(--glass-shine), transparent 60%);
        opacity: 0.5;
        pointer-events: none;
        z-index: 0;
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
