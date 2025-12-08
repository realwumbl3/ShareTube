import { throttle } from "../utils.js";
import state from "../state.js";
import { getCurrentPlayingProgressMs } from "../getters.js";

const SHARETUBE_ROOT_ID = "sharetube_main";
const PLAYER_CONTAINER_SELECTORS = ["#ytp-player", ".html5-video-player"];

// PlayerControls handles overriding native YouTube controls with room controls
export default class PlayerControls {
    constructor(youtubePlayer) {
        this.verbose = false;
        this.youtubePlayer = youtubePlayer;
        this.seek_key_start_time = 0;
        this.seek_timings = {
            0: 5000,
            2000: 10000,
            5000: 30000,
        };
        this.last_video_click_time = 0;
        this.video_click_timeout = null;
        this.seek_bar_el = null;

        this.doc_listener_specs = [
            ["pointerdown", this.onUserGesture.bind(this)],
            ["pointerup", this.onBodyPointerUpCapture.bind(this)],
            ["keydown", this.onUserGesture.bind(this)],
            ["keydown", this.onControlKeydown.bind(this)],
            ["keyup", this.onControlKeyup.bind(this)],
            ["click", this.onBodyClickCapture.bind(this)],
            ["dblclick", this.onBodyDoubleClickCapture.bind(this)],
        ];
    }

    // Initialize controls when binding to a video
    bindToVideo(video) {
        // Cache the YouTube seek bar element for click proximity detection
        try {
            const playerEl =
                this.youtubePlayer.video.closest(".html5-video-player") ||
                document.querySelector(".html5-video-player");
            this.seek_bar_el = playerEl ? playerEl.querySelector(".ytp-progress-bar") : null;
        } catch {
            this.seek_bar_el = null;
        }
    }

    // Cleanup when unbinding from video
    unbindFromVideo() {
        this.seek_bar_el = null;
        this.last_video_click_time = 0;
        if (this.video_click_timeout) {
            clearTimeout(this.video_click_timeout);
            this.video_click_timeout = null;
        }
    }

    // Enable/disable document listeners
    toggleDocumentListeners(shouldBind) {
        const method = shouldBind ? "addEventListener" : "removeEventListener";
        try {
            this.doc_listener_specs.forEach(([type, handler]) => {
                document[method](type, handler, true);
            });
        } catch {}
    }

    onControlKeyup = () => {
        this.seek_key_start_time = 0;
    };

    // Override native YouTube controls with room controls
    onControlKeydown = (e) => {
        if (e.altKey) return;
        // Ignore when typing in inputs or inside ShareTube UI
        const path = this.getEventPath(e);
        if (this.shouldIgnoreShareTube(path)) return;
        const t = e.target;
        const tag = (t && t.tagName && t.tagName.toLowerCase()) || "";
        const isEditable =
            (t && (t.isContentEditable || tag === "input" || tag === "textarea" || tag === "select")) || false;
        if (isEditable) return;
        switch (e.code) {
            case "Space":
            case "KeyK":
                e.preventDefault();
                e.stopPropagation();
                this.emitToggleRoomPlayPause();
                break;

            case "ArrowLeft":
            case "KeyA":
                e.preventDefault();
                e.stopPropagation();
                this.emitSeekRelative(-1, (e.ctrlKey ? 0.5 : 1) * (e.shiftKey ? 2 : 1));
                break;

            case "ArrowRight":
            case "KeyD":
                e.preventDefault();
                e.stopPropagation();
                this.emitSeekRelative(1, (e.ctrlKey ? 0.5 : 1) * (e.shiftKey ? 2 : 1));
                break;

            case "Comma":
            case "Period":
                // Let YouTube handle native frame-by-frame navigation
                // We'll sync after the seek completes
                if (!state.roomCode.get()) return;
                if (!this.youtubePlayer.video) return;
                const direction = e.code === "Period" ? 1 : -1;
                this.youtubePlayer.pending_frame_step_sync = direction;
                // Don't prevent default - let YouTube handle it natively
                break;

            default:
                if (e.code >= "Digit0" && e.code <= "Digit9") {
                    e.preventDefault();
                    e.stopPropagation();
                    // 0 = 0%, 1 = 10%, 2 = 20%, ..., 9 = 90%
                    const digit = parseInt(e.code.replace("Digit", ""), 10);
                    const percentage = digit / 10;
                    this.emitSeekToPercentage(percentage);
                }
                break;
        }
    };

    onBodyClickCapture = (e) => {
        // Ignore clicks initiated within ShareTube UI
        const path = this.getEventPath(e);
        if (this.shouldIgnoreShareTube(path)) return;
        // Detect clicks on YouTube thumbnails (homepage, sidebar, endscreen, etc.)
        if (this.isThumbnailClick(path, e)) {
            this.onThumbnailClick(e, path);
            return;
        }
        // Find YouTube player container
        const playerEl = this.getPlayerContainer();
        if (!this.isEventWithinPlayer(e, playerEl)) return;
        this.onPlayerClick(e, path);
    };

    onBodyPointerUpCapture = (e) => {
        // Ignore pointerups initiated within ShareTube UI
        const path = this.getEventPath(e);
        if (this.shouldIgnoreShareTube(path)) return;
        // Find YouTube player container
        const playerEl = this.getPlayerContainer();
        if (!this.isEventWithinPlayer(e, playerEl)) return;

        // For pointerup we only care about seek-bar interactions; don't interfere with YouTube defaults
        const clickedOnSeekBar = path.some((el) => el && el.classList?.contains("ytp-progress-bar"));
        let clickedNearSeekBar = false;

        if (!clickedOnSeekBar) {
            clickedNearSeekBar = this.isNearSeekBar(e);
        }

        if (clickedOnSeekBar || clickedNearSeekBar) {
            // Mirror seek-bar behavior without cancelling YouTube's drag handling
            this.onSeekBarClick(e, path);
        }
    };

    onBodyDoubleClickCapture = (e) => {
        // Ignore double-clicks initiated within ShareTube UI
        const path = this.getEventPath(e);
        if (this.shouldIgnoreShareTube(path)) return;
        // Find YouTube player container
        const playerEl = this.getPlayerContainer();
        if (!playerEl) return;
        const target = /** @type {Element} */ (e.target);
        if (!target || !playerEl.contains(target)) return;
        // Only cancel play/pause toggle if double-clicking the video element itself
        if (target === this.youtubePlayer.video) {
            // Cancel any pending play/pause toggle from the first click
            if (this.video_click_timeout) {
                clearTimeout(this.video_click_timeout);
                this.video_click_timeout = null;
            }
            this.last_video_click_time = 0;
            // Let YouTube handle the double-click for fullscreen
            this.verbose &&
                console.log("onBodyDoubleClickCapture: double-click detected on video, allowing YouTube fullscreen");
        }
    };

    onPlayerClick(e, path) {
        this.verbose && console.log("onPlayerClick", e);
        if (path.some((el) => el && el.classList?.contains("ytp-chrome-controls"))) {
            this.verbose && console.log("onPlayerClick: chrome controls clicked");
            if (path.some((el) => el && el.classList?.contains("ytp-play-button"))) {
                e.preventDefault();
                e.stopPropagation();
                this.emitToggleRoomPlayPause();
            }
            return;
        } else if (e.target === this.youtubePlayer.video) {
            this.verbose && console.log("onPlayerClick: video clicked");
            // Detect double-click: if two clicks happen within 200ms, skip play/pause toggle
            const now = Date.now();
            const timeSinceLastClick = now - this.last_video_click_time;

            if (timeSinceLastClick < 200) {
                // This is a double-click, cancel pending play/pause toggle and let YouTube handle fullscreen
                this.verbose && console.log("onPlayerClick: double-click detected, skipping play/pause");
                if (this.video_click_timeout) {
                    clearTimeout(this.video_click_timeout);
                    this.video_click_timeout = null;
                }
                this.last_video_click_time = 0; // Reset to prevent triple-click issues
                // Don't prevent default to allow YouTube's double-click handler to work
                return;
            }

            // Cancel any pending timeout from previous click
            if (this.video_click_timeout) {
                clearTimeout(this.video_click_timeout);
            }

            // Prevent default immediately to stop YouTube's single-click handler
            e.preventDefault();
            e.stopPropagation();

            // Delay the play/pause toggle to allow double-click detection
            this.last_video_click_time = now;
            this.video_click_timeout = setTimeout(() => {
                this.video_click_timeout = null;
                this.last_video_click_time = 0;
                this.emitToggleRoomPlayPause();
            }, 200);
        } else {
            this.verbose && console.log("onPlayerClick: other clicked", e);
        }
    }

    onSeekBarClick(e, path) {
        e.preventDefault();
        e.stopPropagation();
        throttle(
            this,
            "onSeekBarClick",
            () => {
                const progressBar =
                    (path && path.find((el) => el && el.classList?.contains("ytp-progress-bar"))) || this.seek_bar_el;
                if (!progressBar) return;
                const bounds = progressBar.getBoundingClientRect();
                const x = e.clientX - bounds.left;
                const progress = Math.max(0, Math.min(1, x / bounds.width));
                this.emitSeekToPercentage(progress);
            },
            1000
        );
    }

    isThumbnailClick(path, e) {
        const targetAnchor =
            (e?.target instanceof Element && e.target.closest("a.yt-lockup-view-model__content-image")) || null;
        if (targetAnchor) return true;

        return path.some((el) => {
            if (!el || !(el instanceof Element)) return false;
            const idMatch = (el.id || "").toLowerCase() === "thumbnail";
            const tagMatch = el.tagName === "YTD-THUMBNAIL" || el.tagName === "YT-LOCKUP-VIEW-MODEL";
            const classMatch =
                el.classList?.contains("ytd-thumbnail") ||
                el.classList?.contains("ytp-videowall-still") ||
                el.classList?.contains("ytp-ce-element") ||
                el.classList?.contains("yt-lockup-view-model__content-image") ||
                el.classList?.contains("yt-lockup-view-model");
            return idMatch || tagMatch || classMatch;
        });
    }

    onThumbnailClick(e, path) {
        if (!state.roomCode.get()) return;
        const anchor =
            path.find((el) => el instanceof Element && el.tagName === "A") ||
            (e.target instanceof Element ? e.target.closest("a") : null);
        const href = anchor?.getAttribute?.("href") || null;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (href) window.open(href, "_blank");
    }

    emitToggleRoomPlayPause() {
        const roomState = state.roomState.get();
        throttle(
            this,
            "emitToggleRoomPlayPause",
            () => {
                this.youtubePlayer.app.socket.emit(
                    roomState === "playing" ? "room.control.pause" : "room.control.play"
                );
            },
            300
        );
    }

    emitSeekRelative(direction, multiplier = 1) {
        const delay = 500;

        if (this.seek_key_start_time === 0) {
            this.seek_key_start_time = Date.now();
        }

        throttle(
            this,
            "emitSeekRelative",
            () => {
                const elapsed = this.seek_key_start_time > 0 ? Date.now() - this.seek_key_start_time : 0;

                let increment = 5000;
                const thresholds = Object.keys(this.seek_timings)
                    .map(Number)
                    .sort((a, b) => a - b);

                for (const t of thresholds) {
                    if (elapsed >= t) {
                        increment = this.seek_timings[t];
                    }
                }

                const real_delta = direction * increment * multiplier;
                const durMs = this.youtubePlayer.videoDurationMs;
                const curMs = this.youtubePlayer.videoCurrentTimeMs;
                let target = curMs + real_delta;
                if (durMs > 0) target = Math.min(Math.max(0, target), durMs);
                this.youtubePlayer.app.socket.emit("room.control.seek", {
                    delta_ms: real_delta,
                    progress_ms: Math.floor(target),
                    play: state.roomState.get() === "playing",
                });
            },
            delay
        );
    }

    emitSeekToPercentage(percentage) {
        // percentage should be between 0 and 1 (0 = 0%, 1 = 100%)
        throttle(
            this,
            "emitSeekToPercentage",
            () => {
                const { duration_ms } = getCurrentPlayingProgressMs();
                if (!duration_ms || duration_ms <= 0) {
                    this.verbose && console.log("emitSeekToPercentage: no valid duration");
                    return;
                }
                const targetMs = Math.floor(Math.max(0, Math.min(1, percentage)) * duration_ms);
                this.verbose &&
                    console.log("emitSeekToPercentage", {
                        percentage,
                        targetMs,
                        duration_ms,
                    });
                this.youtubePlayer.app.socket.emit("room.control.seek", {
                    progress_ms: targetMs,
                    play: state.roomState.get() === "playing",
                });
            },
            300
        );
    }

    getEventPath(e) {
        if (!e) return [];
        if (typeof e.composedPath === "function") {
            const path = e.composedPath();
            if (path && path.length) return path;
        }
        const path = [];
        let node = e.target || null;
        while (node) {
            path.push(node);
            node = node.parentNode || null;
        }
        return path;
    }

    shouldIgnoreShareTube(path) {
        return path.some((el) => el && el.id === SHARETUBE_ROOT_ID);
    }

    getPlayerContainer() {
        for (const selector of PLAYER_CONTAINER_SELECTORS) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    isEventWithinPlayer(e, playerEl) {
        if (!playerEl || !e) return false;
        const target = /** @type {Element} */ (e.target);
        if (target && playerEl.contains(target)) return true;
        const { clientX, clientY } = e;
        if (typeof clientX !== "number" || typeof clientY !== "number") return false;
        try {
            const bounds = playerEl.getBoundingClientRect();
            return (
                clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom
            );
        } catch {
            return false;
        }
    }

    isNearSeekBar(e) {
        if (!this.seek_bar_el || !e) return false;
        const { clientX, clientY } = e;
        if (typeof clientX !== "number" || typeof clientY !== "number") return false;
        try {
            const paddingXPx = 30;
            const paddingYPx = 8;
            const bounds = this.seek_bar_el.getBoundingClientRect();
            return (
                clientX >= bounds.left - paddingXPx &&
                clientX <= bounds.right + paddingXPx &&
                clientY >= bounds.top - paddingYPx &&
                clientY <= bounds.bottom + paddingYPx
            );
        } catch {
            return false;
        }
    }

    onUserGesture = (e) => {
        const path = this.getEventPath(e);
        if (this.shouldIgnoreShareTube(path)) {
            if (this.verbose) console.log("onUserGesture return: sharetube_main found in path");
            return;
        }
        this.youtubePlayer.last_user_gesture_ms = Date.now();
    };

    isUserInitiatedMediaEvent(e) {
        const now = Date.now();
        const USER_WINDOW_MS = 1200;
        const PROGRAMMATIC_WINDOW_MS = 1200;
        if (now - this.youtubePlayer.last_user_gesture_ms < USER_WINDOW_MS) return true;
        if (now - this.youtubePlayer.last_programmatic_media_ms < PROGRAMMATIC_WINDOW_MS) return false;
        if (e && e.isTrusted === false) return false;
        return true;
    }
}
