import { html, css, LiveVar } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";
import { getCurrentPlayingProgressMs } from "../core/state/getters.js";
import { extractVideoId } from "../core/utils/utils.js";

const YT_API_URL = "https://www.youtube.com/iframe_api";
const SYNC_INTERVAL_MS = 1000;
const SYNC_DRIFT_THRESHOLD_SEC = 2;

const YT_STATE = {
    UNSTARTED: -1,
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5,
};

css`
    .EmbeddedPlayer {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 14px;
        overflow: hidden;
    }

    .embedded-player-container {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    /* Force responsive sizing on YouTube's internal elements */
    .embedded-player-container iframe,
    .embedded-player-container .html5-video-container,
    .embedded-player-container video {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        border: none !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        object-fit: contain !important;
    }

    .embedded-player-placeholder,
    .embedded-player-loading {
        position: absolute;
        inset: 0;
        background: #000;
        color: #fff;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        z-index: 10;
    }

    .embedded-player-loading::after {
        content: "";
        width: 20px;
        height: 20px;
        border: 2px solid #666;
        border-top: 2px solid #fff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;

export default class EmbeddedPlayer {
    constructor(app) {
        this.app = app;
        this.player = null;
        this.currentVideoId = null;
        this.pendingVideoId = null;
        this.syncInterval = null;
        this.apiReady = false;
        this.isLoading = new LiveVar(false);
        this.resizeHandler = null;

        /** @type {HTMLDivElement} */
        this.container = null;
        /** @type {HTMLDivElement} */
        this.player_container = null;

        html`
            <div class="EmbeddedPlayer" this="container" zyx-if=${state.embeddedPlayerVisible}>
                <div this="player_container" class="embedded-player-container"></div>
                <div class="embedded-player-loading" zyx-if=${[this.isLoading, (v) => v]}>
                    Loading player...
                </div>
                <div class="embedded-player-placeholder" zyx-if=${[state.currentPlaying.item, (item) => !item]}>
                    No video playing
                </div>
            </div>
        `.bind(this);

        this.init();
    }

    async init() {
        await this.loadYouTubeAPI();
        this.setupStateListeners();
    }

    loadYouTubeAPI() {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                this.apiReady = true;
                resolve();
                return;
            }

            // Global callback
            const existingCallback = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (existingCallback) existingCallback();
                this.apiReady = true;
                this.processPendingVideo();
                resolve();
            };

            // Inject script if missing
            if (!document.querySelector(`script[src*="youtube.com/iframe_api"]`)) {
                const tag = document.createElement("script");
                tag.src = YT_API_URL;
                tag.onerror = () => console.error("EmbeddedPlayer: Failed to load YouTube API script");
                document.head.appendChild(tag);
            } else {
                // Poll if script exists but API not ready
                this.pollForAPI(resolve);
            }
        });
    }

    pollForAPI(resolve, attempts = 0) {
        if (window.YT && window.YT.Player) {
            this.apiReady = true;
            resolve();
        } else if (attempts < 20) {
            setTimeout(() => this.pollForAPI(resolve, attempts + 1), 100);
        } else {
            console.warn("EmbeddedPlayer: YouTube API load timeout");
            resolve(); // Resolve anyway to avoid blocking
        }
    }

    processPendingVideo() {
        if (this.pendingVideoId) {
            this.loadVideo(this.pendingVideoId);
            this.pendingVideoId = null;
        }
    }

    setupStateListeners() {
        state.currentPlaying.item.subscribe(this.handleVideoChange);
        state.embeddedPlayerVisible.subscribe(this.handleVisibilityChange);
    }

    handleVideoChange = (item) => {
        if (!item) {
            this.destroyPlayer();
            return;
        }

        const videoId = extractVideoId(item.url);
        if (!videoId) {
            this.destroyPlayer();
            return;
        }

        if (videoId !== this.currentVideoId) {
            if (state.embeddedPlayerVisible.get()) {
                this.loadVideo(videoId);
            } else {
                // Just update ID if invisible, will load when visible
                this.currentVideoId = videoId;
            }
        }
    };

    handleVisibilityChange = (visible) => {
        if (!visible) {
            this.destroyPlayer();
            return;
        }

        const item = state.currentPlaying.item.get();
        if (!item) return;

        const videoId = extractVideoId(item.url);
        if (!videoId) return;

        if (videoId !== this.currentVideoId || !this.player) {
            this.loadVideo(videoId);
        } else {
            this.syncPlayback();
        }
    };

    loadVideo(videoId) {
        if (!videoId) return;

        this.currentVideoId = videoId;
        this.isLoading.set(true);

        if (!this.player_container || !document.contains(this.player_container)) {
            // Wait for DOM
            requestAnimationFrame(() => {
                if (this.player_container && document.contains(this.player_container)) {
                    this.loadVideo(videoId);
                }
            });
            return;
        }

        if (!this.apiReady) {
            this.pendingVideoId = videoId;
            return;
        }

        if (this.player) {
            this.player.loadVideoById({ videoId, startSeconds: 0 });
            this.isLoading.set(false);
        } else {
            this.createPlayer(videoId);
        }
    }

    createPlayer(videoId) {
        try {
            this.player = new window.YT.Player(this.player_container, {
                width: "100%",
                height: "100%",
                videoId: videoId,
                playerVars: {
                    autoplay: 0,
                    controls: 1,
                    enablejsapi: 1,
                    modestbranding: 1,
                    rel: 0,
                    iv_load_policy: 3,
                    fs: 1,
                },
                events: {
                    onReady: () => {
                        this.isLoading.set(false);
                        this.startSync();
                    },
                    onError: (e) => {
                        console.error("EmbeddedPlayer: YT error", e.data);
                        this.isLoading.set(false);
                    },
                },
            });
        } catch (e) {
            console.error("EmbeddedPlayer: Create player error", e);
            this.isLoading.set(false);
        }
    }

    startSync() {
        this.stopSync();
        this.syncInterval = setInterval(() => this.syncPlayback(), SYNC_INTERVAL_MS);
    }

    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    syncPlayback() {
        if (!this.player || !state.embeddedPlayerVisible.get() || typeof this.player.getPlayerState !== "function") {
            return;
        }

        const { progress_ms } = getCurrentPlayingProgressMs();
        if (progress_ms === null) return;

        const playingSinceMs = state.currentPlaying.playing_since_ms.get();
        const isPlaying = playingSinceMs > 0;

        try {
            const currentTime = this.player.getCurrentTime();
            const targetTime = progress_ms / 1000;
            const drift = Math.abs(currentTime - targetTime);

            if (drift > SYNC_DRIFT_THRESHOLD_SEC) {
                this.player.seekTo(targetTime, true);
            }

            const playerState = this.player.getPlayerState();
            if (isPlaying && playerState !== YT_STATE.PLAYING && playerState !== YT_STATE.BUFFERING) {
                this.player.playVideo();
            } else if (!isPlaying && playerState !== YT_STATE.PAUSED && playerState !== YT_STATE.UNSTARTED && playerState !== YT_STATE.ENDED) {
                this.player.pauseVideo();
            }
        } catch (e) {
            // Ignore minor sync errors (player might be in transition)
        }
    }

    destroyPlayer() {
        this.stopSync();
        this.isLoading.set(false);

        if (this.player) {
            try {
                this.player.destroy();
            } catch (_) {}
            this.player = null;
        }

        if (this.player_container) {
            this.player_container.innerHTML = "";
        }
        
        // Don't reset currentVideoId here strictly, 
        // as we might want to resume same video if visibility toggles back
        // But logic elsewhere handles "if id changed" well.
        // Actually, if we destroy, we should probably reset to ensure full reload if needed.
        this.currentVideoId = null;
    }
}
