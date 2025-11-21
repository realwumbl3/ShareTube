// Log module load for diagnostics
console.log("cs/player.js loaded");

import { LiveVar, html, css } from "./dep/zyx.js";
import { throttle } from "./utils.js";
import state from "./state.js";
import Splash from "./components/Splash.js";
import Intermission from "./components/Intermission.js";
import { currentPlayingProgressMsPercentageToMs, getCurrentPlayingProgressMs } from "./getters.js";

css`
    .observer_badge {
        position: absolute;
        top: 4px;
        left: 4px;
        backdrop-filter: blur(10px) brightness(0.5) contrast(1.1);
        color: #fff;
        z-index: 1000000000;
        padding: 2px;
        border-radius: 4px;
        font-size: 11px;
        font-family: sans-serif;
        flex-direction: column;
        gap: 1px;
        align-items: center;
        justify-content: center;
        display: none;
        contain: strict;
        &.visible {
            display: flex;
        }
    }
    .debug-list {
        display: flex;
        flex-direction: column;
        gap: 1px;
        align-items: center;
        justify-content: center;
        & > span {
            font-size: 8px;
            font-family: sans-serif;
            color: #fff;
        }
    }
`;

// Lightweight observer/controller around the active <video> element on YouTube
export default class YoutubePlayerManager {
    constructor(app) {
        this.app = app;
        this.verbose = false;
        this.video = null;
        this.scanTimer = null;
        this.nearEndProbeSent = false;
        this.desired_state = new LiveVar("paused");
        this.ad_playing = new LiveVar(false);
        this.is_enforcing = new LiveVar(false);
        this.is_programmatic_seek = new LiveVar(false);
        this.last_user_gesture_ms = 0;
        this.last_programmatic_media_ms = 0;
        this.lastAdState = false;
        this.pendingPauseAfterAd = false;
        this.lastVideoClickTime = 0;
        this.videoClickTimeout = null;
        this.seekBarEl = null;

        this.seek_throttle_accumulator = -1;

        // Frame rate detection for frame-by-frame navigation
        this.detectedFrameRate = null;
        this.frameTimeSamples = [];
        this.frameRateDetectionStartTime = null;
        this.frameRateDetectionRafId = null;

        // Frame step throttling - store latest pending direction
        this.pendingFrameStepDirection = null;

        this.binds = {
            onSeek: new Set(),
            onSeeked: new Set(),
            onSeeking: new Set(),
            onPause: new Set(),
            onPlay: new Set(),
        };

        this.splash = new Splash(this.video);
        this.intermission = new Intermission();

        this.badge = html`<div class="observer_badge">
            Video Observed.
            <div class="debug-list">
                <span>desired_state: ${this.desired_state.interp()}</span>
                <span>ad_playing: ${this.ad_playing.interp()}</span>
                <span>is_enforcing: ${this.is_enforcing.interp()}</span>
                <span>is_programmatic_seek: ${this.is_programmatic_seek.interp()}</span>
            </div>
        </div>`.const();
    }

    on(event, callback) {
        this.binds[event].add(callback);
    }

    // Begin scanning for an active video element and bind to it
    start() {
        if (this.scanTimer) return;
        this.scanTimer = setInterval(() => this.ensureBoundToActiveVideo(), 500);
        // Attempt immediate bind
        this.ensureBoundToActiveVideo();
        // Track recent user gestures to classify media events
        try {
            document.addEventListener("pointerdown", this.onUserGesture, true);
            document.addEventListener("pointerup", this.onBodyPointerUpCapture, true);
            document.addEventListener("keydown", this.onUserGesture, true);
            document.addEventListener("keydown", this.onControlKeydown, true);
            document.addEventListener("keyup", this.onControlKeyup, true);
            document.addEventListener("click", this.onBodyClickCapture, true);
            document.addEventListener("dblclick", this.onBodyDoubleClickCapture, true);
        } catch {}
    }

    // Stop scanning and unbind from any current video element
    stop() {
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
            this.scanTimer = null;
        }
        try {
            document.removeEventListener("pointerdown", this.onUserGesture, true);
            document.removeEventListener("pointerup", this.onBodyPointerUpCapture, true);
            document.removeEventListener("keydown", this.onUserGesture, true);
            document.removeEventListener("keydown", this.onControlKeydown, true);
            document.removeEventListener("keyup", this.onControlKeyup, true);
            document.removeEventListener("click", this.onBodyClickCapture, true);
            document.removeEventListener("dblclick", this.onBodyDoubleClickCapture, true);
        } catch {}
        this.unbindFromVideo();
    }

    // Find and bind to the currently active/visible YouTube video element
    ensureBoundToActiveVideo() {
        const vid = this.findActiveVideoElement();
        if (!vid) {
            this.unbindFromVideo();
            return;
        }
        if (this.video !== vid) {
            this.unbindFromVideo();
            this.bindToVideo(vid);
        }
    }

    // Heuristics to locate the main video, shorts, or any visible <video>
    findActiveVideoElement() {
        // Prefer main watch video
        let vid = document.querySelector("video.html5-main-video");
        if (vid && this.isElementVisible(vid)) return vid;
        // Shorts/reels
        const shorts = document.querySelector("ytd-reel-video-renderer video");
        if (shorts && this.isElementVisible(shorts)) return shorts;
        // Fallback to first visible video
        const all = Array.from(document.querySelectorAll("video"));
        for (const v of all) {
            if (this.isElementVisible(v)) return v;
        }
        return null;
    }

    // Minimal visibility check for candidate video elements
    isElementVisible(el) {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
    }

    // Hook into a specific <video>: intercept play(), add event listeners, enforce state
    bindToVideo(video) {
        this.verbose && console.log("bindToVideo", video);
        this.video = video;
        this.nearEndProbeSent = false;
        this.video.after(this.badge.main);
        this.video.parentElement.after(this.splash.main);
        this.video.parentElement.after(this.intermission.main);
        this.video.addEventListener("play", this.onPlay);
        this.video.addEventListener("playing", this.onPlaying);
        this.video.addEventListener("pause", this.onPause);
        this.video.addEventListener("timeupdate", this.onTimeUpdate);
        this.video.addEventListener("loadeddata", this.onLoadedData);
        this.video.addEventListener("seeking", this.onSeeking);
        this.video.addEventListener("seeked", this.onSeeked);
        this.video.addEventListener("ended", this.onEnded);
        this.startFrameRateDetection();
        this.enforceDesiredState("bind");

        // Cache the YouTube seek bar element for click proximity detection
        try {
            const playerEl = this.video.closest(".html5-video-player") || document.querySelector(".html5-video-player");
            this.seekBarEl = playerEl ? playerEl.querySelector(".ytp-progress-bar") : null;
        } catch {
            this.seekBarEl = null;
        }
    }

    // Detach from current video element and cleanup
    unbindFromVideo() {
        if (!this.video) return;
        this.video.removeEventListener("play", this.onPlay);
        this.video.removeEventListener("playing", this.onPlaying);
        this.video.removeEventListener("pause", this.onPause);
        this.video.removeEventListener("timeupdate", this.onTimeUpdate);
        this.video.removeEventListener("loadeddata", this.onLoadedData);
        this.video.removeEventListener("seeking", this.onSeeking);
        this.video.removeEventListener("seeked", this.onSeeked);
        this.video.removeEventListener("ended", this.onEnded);
        this.stopFrameRateDetection();
        this.video = null;
        this.lastAdState = false;
        this.pendingPauseAfterAd = false;
        this.seekBarEl = null;
    }

    onPlay = (e) => {
        this.verbose && console.log("onPlay");
        if (!this.isUserInitiatedMediaEvent(e)) return this.verbose && console.log("onPlay return: programmatic");
        this.binds.onPlay.forEach((callback) => callback(e));
        this.enforceDesiredState("onPlay");
    };

    onPlaying = (e) => {
        this.verbose && console.log("onPlaying");
        this.enforceDesiredState("onPlaying");
    };

    onPause = (e) => {
        this.verbose && console.log("onPause");
        this.checkIfVideoFinished();
        if (!this.isUserInitiatedMediaEvent(e)) return this.verbose && console.log("onPause return: programmatic");
        this.binds.onPause.forEach((callback) => callback(e));
        this.enforceDesiredState("onPause");
    };

    onTimeUpdate = (e) => {
        this.maybeEmitNearEndProbe();
        this.enforceDesiredState("onTimeUpdate");
    };

    onLoadedData = (e) => {
        this.verbose && console.log("onLoadedData");
        this.enforceDesiredState("onLoadedData");
    };

    onSeeking = (e) => {
        this.verbose && console.log("onSeeking");
        if (this.is_programmatic_seek.get()) return this.verbose && console.log("onSeeking return: programmatic seek");
        this.binds.onSeeking.forEach((callback) => callback(e));
        this.enforceDesiredState("onSeeking");
    };

    onSeeked = (e) => {
        this.verbose && console.log("onSeeked");
        if (this.is_programmatic_seek.get()) return this.verbose && console.log("onSeeked return: programmatic seek");
        this.binds.onSeeked.forEach((callback) => callback(e));
        this.enforceDesiredState("onSeeked");
    };

    onEnded = (e) => {
        this.verbose && console.log("onEnded");
        this.nearEndProbeSent = true;
        this.app.socket.emit("queue.probe");
        this.setDesiredState("paused", "onEnded");
    };

    checkIfVideoFinished() {
        if (!this.video) return;
        if (this.video.currentTime < this.video.duration - 1) return;
        this.app.socket.emit("queue.probe");
    }

    getPlayerState() {
        try {
            if (!this.video) return "idle";
            return this.video.paused ? "paused" : "playing";
        } catch {
            return "idle";
        }
    }

    // Helper: true when within thresholdSeconds of video end (ignores very short/invalid durations)
    isNearContentEnd(thresholdSeconds = 1) {
        try {
            if (!this.video) return false;
            const dur = Number(this.video.duration || 0);
            const cur = Number(this.video.currentTime || 0);
            if (!isFinite(dur) || !isFinite(cur)) return false;
            return dur > 5 && cur > 0 && dur - cur <= thresholdSeconds;
        } catch {
            return false;
        }
    }

    onAdStartCb() {
        this.verbose && console.log("onAdStart");
        this.ad_playing.set(true);
    }

    onAdEndCb() {
        this.verbose && console.log("onAdEnd");
        this.ad_playing.set(false);
    }

    getDesiredState() {
        return this.desired_state.get ? this.desired_state.get() : this.desired_state;
    }

    // External API for desired state
    setDesiredState(state) {
        this.verbose && console.log("setDesiredState", state);
        if (state !== "playing" && state !== "paused") return;
        if (this.desired_state.get() === state) return;
        this.desired_state.set(state);
        if (state === "paused" && this.isAdPlayingNow()) this.pendingPauseAfterAd = true;
        this.enforceDesiredState("setDesiredState");
    }

    setDesiredProgressMs(progressMs) {
        const seconds = progressMs / 1000;
        this.verbose && console.log("setDesiredProgressMs", seconds, "on video", this.video);
        if (!this.video) return;
        // Suppress our seeking/seeked handlers during programmatic seek
        this.is_programmatic_seek.set(true);
        this.video.addEventListener(
            "seeked",
            () => {
                this.is_programmatic_seek.set(false);
            },
            { once: true }
        );
        try {
            this.video.currentTime = seconds;
        } catch {}
        this.enforceDesiredState("setDesiredProgressMs");
    }

    safePlay(reason) {
        if (!this.video) return;
        if (!this.video.paused) return;
        this.last_programmatic_media_ms = Date.now();
        this.is_enforcing.set(true);
        const p = this.video.play();
        if (p && typeof p.catch === "function") {
            p.catch(() => {}).finally(() => this.is_enforcing.set(false));
        } else {
            this.is_enforcing.set(false);
        }
        this.verbose && console.log("enforce: play", reason);
    }

    safePause(reason) {
        if (!this.video) return;
        if (this.video.paused) return;
        this.last_programmatic_media_ms = Date.now();
        this.is_enforcing.set(true);
        try {
            this.video.pause();
        } catch {}
        this.is_enforcing.set(false);
        this.verbose && console.log("enforce: pause", reason);
    }

    enforceDesiredState(reason = "") {
        const isAd = this.isAdPlayingNow();
        const wasAd = this.lastAdState;
        this.lastAdState = isAd;

        // Emit ad transition callbacks
        if (!wasAd && isAd) {
            this.onAdStartCb();
        } else if (wasAd && !isAd) {
            this.onAdEndCb();
        }

        // Don't enforce state if not in a room
        if (!state.roomCode.get()) {
            this.verbose && console.log("enforceDesiredState: not enforcing - not in a room", reason);
            return;
        }

        if (!this.video || this.is_enforcing.get()) {
            this.verbose && console.log("enforceDesiredState: not enforcing", reason, this);
            return;
        }

        // Suppress auto-play enforcement when video is essentially finished to avoid restarts
        if (this.isNearContentEnd(1)) {
            try {
                const dur = Number(this.video.duration || 0);
                const cur = Number(this.video.currentTime || 0);
                this.verbose && console.log("enforceDesiredState: suppress near end", { cur, dur, reason });
            } catch {}
            return;
        }

        const desired = this.getDesiredState();
        // this.verbose && console.log("enforceDesiredState", reason, { desired, isAd, wasAd });

        // Allow ads to play when paused is desired
        if (desired === "paused" && isAd) {
            this.pendingPauseAfterAd = true;
            if (this.video.paused) this.safePlay("ad-allowed");
            return;
        }

        // Pause immediately after ad if we were waiting
        if (desired === "paused" && wasAd && !isAd && this.pendingPauseAfterAd) {
            this.pendingPauseAfterAd = false;
            this.safePause("post-ad");
            return;
        }

        // General enforcement for content
        if (desired === "playing") {
            if (this.video.paused && !isAd) this.safePlay("desired-playing");
            return;
        }
        if (desired === "paused") {
            if (!this.video.paused && !isAd) this.safePause("desired-paused");
            return;
        }
    }

    maybeEmitNearEndProbe() {
        if (!this.video || this.nearEndProbeSent) return;
        if (this.isNearContentEnd(1)) {
            this.nearEndProbeSent = true;
            this.verbose && console.log("nearEnd: emitting queue.probe");
            // Prevent restarts while server advances the queue
            this.setDesiredState("paused");
            this.app.socket.emit("queue.probe");
        }
    }

    // Heuristics to detect whether an ad is playing in the active player UI
    isAdPlayingNow() {
        if (!this.video) return false;
        const container = this.video.closest(".html5-video-player") || document.querySelector(".html5-video-player");
        // If content essentially ended, do not report ad
        if (this.isNearContentEnd(1)) return false;
        if (container && container.classList.contains("ad-showing")) return true;
        // Require a strong ad indicator to avoid false positives
        if (
            container &&
            container.querySelector(
                ".ytp-ad-duration-remaining, .ytp-ad-player-overlay, .ytp-ad-skip-button, .ytp-ad-skip-button-modern"
            ) != null
        )
            return true;
        return false;
    }

    onControlKeyup = () => {
        this.seek_throttle_accumulator = -1;
    };

    // Override native YouTube controls with room controls
    onControlKeydown = (e) => {
        // Ignore when typing in inputs or inside ShareTube UI
        const path = (e.composedPath && e.composedPath()) || [];
        if (path.some((el) => el && el.id === "sharetube_main")) return;
        const t = e.target;
        const tag = (t && t.tagName && t.tagName.toLowerCase()) || "";
        const isEditable =
            (t && (t.isContentEditable || tag === "input" || tag === "textarea" || tag === "select")) || false;
        if (isEditable) return;
        if (e.code === "Space" || e.code === "KeyK") {
            e.preventDefault();
            e.stopPropagation();
            this.emitToggleRoomPlayPause();
        } else if (e.code === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            this.emitSeekRelative(-5000);
        } else if (e.code === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            this.emitSeekRelative(5000);
        } else if (e.code === "Comma") {
            e.preventDefault();
            e.stopPropagation();
            this.emitFrameStep(-1);
        } else if (e.code === "Period") {
            e.preventDefault();
            e.stopPropagation();
            this.emitFrameStep(1);
        }
    };

    onBodyClickCapture = (e) => {
        // Ignore clicks initiated within ShareTube UI
        const path = (e.composedPath && e.composedPath()) || [];
        if (path.some((el) => el && el.id === "sharetube_main")) return;
        // Find YouTube player container
        const playerEl = document.querySelector("#ytp-player") || document.querySelector(".html5-video-player");
        if (!playerEl) return;
        const target = /** @type {Element} */ (e.target);
        if (!target) return;

        // If the event target is not inside the player DOM (e.g. YouTube overlays/pseudo-handles),
        // fall back to a geometric hit test against the player rect so clicks visually on the
        // player area still count.
        if (!playerEl.contains(target) && typeof e.clientX === "number" && typeof e.clientY === "number") {
            const bounds = playerEl.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;
            if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
        } else if (!playerEl.contains(target)) {
            return;
        }
        this.onPlayerClick(e, path);
    };

    onBodyPointerUpCapture = (e) => {
        // Ignore pointerups initiated within ShareTube UI
        const path = (e.composedPath && e.composedPath()) || [];
        if (path.some((el) => el && el.id === "sharetube_main")) return;
        // Find YouTube player container
        const playerEl = document.querySelector("#ytp-player") || document.querySelector(".html5-video-player");
        if (!playerEl) return;
        const target = /** @type {Element} */ (e.target);
        if (!target) return;

        // Same geometric fallback as click handler so pointerup on overlays above the player
        // (like YouTube's drawer swipe handle) are still recognized when visually on the player.
        if (!playerEl.contains(target) && typeof e.clientX === "number" && typeof e.clientY === "number") {
            const bounds = playerEl.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;
            if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
        } else if (!playerEl.contains(target)) {
            return;
        }

        // For pointerup we only care about seek-bar interactions; don't interfere with YouTube defaults
        const clickedOnSeekBar = path.some((el) => el && el.classList?.contains("ytp-progress-bar"));
        let clickedNearSeekBar = false;

        if (!clickedOnSeekBar && this.seekBarEl && typeof e.clientX === "number" && typeof e.clientY === "number") {
            try {
                const paddingXPx = 30;
                const paddingYPx = 8;
                const bounds = this.seekBarEl.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;
                if (
                    x >= bounds.left - paddingXPx &&
                    x <= bounds.right + paddingXPx &&
                    y >= bounds.top - paddingYPx &&
                    y <= bounds.bottom + paddingYPx
                ) {
                    clickedNearSeekBar = true;
                }
            } catch {}
        }

        if (clickedOnSeekBar || clickedNearSeekBar) {
            // Mirror seek-bar behavior without cancelling YouTube's drag handling
            this.onSeekBarClick(e, path);
        }
    };

    onBodyDoubleClickCapture = (e) => {
        // Ignore double-clicks initiated within ShareTube UI
        const path = (e.composedPath && e.composedPath()) || [];
        if (path.some((el) => el && el.id === "sharetube_main")) return;
        // Find YouTube player container
        const playerEl = document.querySelector("#ytp-player") || document.querySelector(".html5-video-player");
        if (!playerEl) return;
        const target = /** @type {Element} */ (e.target);
        if (!target || !playerEl.contains(target)) return;
        // Only cancel play/pause toggle if double-clicking the video element itself
        if (target === this.video) {
            // Cancel any pending play/pause toggle from the first click
            if (this.videoClickTimeout) {
                clearTimeout(this.videoClickTimeout);
                this.videoClickTimeout = null;
            }
            this.lastVideoClickTime = 0;
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
        } else if (e.target === this.video) {
            this.verbose && console.log("onPlayerClick: video clicked");
            // Detect double-click: if two clicks happen within 300ms, skip play/pause toggle
            const now = Date.now();
            const timeSinceLastClick = now - this.lastVideoClickTime;

            if (timeSinceLastClick < 300) {
                // This is a double-click, cancel pending play/pause toggle and let YouTube handle fullscreen
                this.verbose && console.log("onPlayerClick: double-click detected, skipping play/pause");
                if (this.videoClickTimeout) {
                    clearTimeout(this.videoClickTimeout);
                    this.videoClickTimeout = null;
                }
                this.lastVideoClickTime = 0; // Reset to prevent triple-click issues
                // Don't prevent default to allow YouTube's double-click handler to work
                return;
            }

            // Cancel any pending timeout from previous click
            if (this.videoClickTimeout) {
                clearTimeout(this.videoClickTimeout);
            }

            // Prevent default immediately to stop YouTube's single-click handler
            e.preventDefault();
            e.stopPropagation();

            // Delay the play/pause toggle to allow double-click detection
            this.lastVideoClickTime = now;
            this.videoClickTimeout = setTimeout(() => {
                this.videoClickTimeout = null;
                this.lastVideoClickTime = 0;
                this.emitToggleRoomPlayPause();
            }, 300);
        } else {
            this.verbose && console.log("onPlayerClick: other clicked", e);
        }
    }

    onSeekBarClick(e, path) {
        console.log("onSeekBarClick: clicked", e);
        e.preventDefault();
        e.stopPropagation();
        throttle(
            this,
            "onSeekBarClick",
            () => {
                const progressBar =
                    (path && path.find((el) => el && el.classList?.contains("ytp-progress-bar"))) || this.seekBarEl;
                if (!progressBar) return;
                const bounds = progressBar.getBoundingClientRect();
                const x = e.clientX - bounds.left;
                const progress = Math.max(0, Math.min(1, x / bounds.width));
                const progressMs = Math.floor(progress * this.video.duration * 1000);

                const currentPlayingProgressMs = currentPlayingProgressMsPercentageToMs(progress);
                this.verbose &&
                    console.log("onPlayerClick: progress bar clicked", {
                        progress,
                        progressMs,
                        currentPlayingProgressMs,
                        videoDuration: this.video.duration,
                    });
                this.binds.onSeek.forEach((callback) => callback(currentPlayingProgressMs));
            },
            1000
        );
    }

    emitToggleRoomPlayPause() {
        const roomState = state.roomState.get();
        throttle(
            this,
            "emitToggleRoomPlayPause",
            () => {
                this.app.socket.emit(roomState === "playing" ? "room.control.pause" : "room.control.play");
            },
            1000
        );
    }

    emitSeekRelative(deltaMs) {
        const delay = 500;
        const boost_ms = 20000;
        this.seek_throttle_accumulator += 1;
        throttle(
            this,
            "emitSeekRelative",
            () => {
                const seek_throttle_accumulator = this.seek_throttle_accumulator;
                this.seek_throttle_accumulator = -1;
                const devided = seek_throttle_accumulator / 40;
                const boosted_ms = boost_ms * devided;
                const real_delta = deltaMs + (deltaMs > 0 ? boosted_ms : -boosted_ms);
                const durMs = this.video ? Math.max(0, Number(this.video.duration || 0) * 1000) : 0;
                const curMs = this.video ? Math.max(0, Number(this.video.currentTime || 0) * 1000) : 0;
                let target = curMs + real_delta;
                if (durMs > 0) target = Math.min(Math.max(0, target), durMs);
                this.app.socket.emit("room.control.seek", {
                    delta_ms: real_delta,
                    progress_ms: Math.floor(target),
                    play: state.roomState.get() === "playing",
                });
            },
            delay
        );
    }

    startFrameRateDetection() {
        this.stopFrameRateDetection();
        this.frameTimeSamples = [];
        this.frameRateDetectionStartTime = null;
        this.detectedFrameRate = null;

        const detectFrame = () => {
            if (!this.video) {
                this.stopFrameRateDetection();
                return;
            }

            // Only detect when video is playing
            if (!this.video.paused && !this.video.ended) {
                const now = performance.now();
                const currentTime = this.video.currentTime;

                if (this.frameRateDetectionStartTime === null) {
                    this.frameRateDetectionStartTime = now;
                    this.frameTimeSamples = [{ time: now, videoTime: currentTime }];
                } else {
                    // Sample frame timing
                    this.frameTimeSamples.push({ time: now, videoTime: currentTime });

                    // Keep only recent samples (last 2 seconds)
                    const sampleWindow = 2000;
                    const cutoff = now - sampleWindow;
                    this.frameTimeSamples = this.frameTimeSamples.filter((s) => s.time >= cutoff);

                    // Need at least 30 samples for accurate detection
                    if (this.frameTimeSamples.length >= 30) {
                        // Calculate time deltas between consecutive samples
                        const timeDeltas = [];
                        for (let i = 1; i < this.frameTimeSamples.length; i++) {
                            const delta = this.frameTimeSamples[i].videoTime - this.frameTimeSamples[i - 1].videoTime;
                            if (delta > 0 && delta < 0.1) {
                                // Filter out large jumps (seeks)
                                timeDeltas.push(delta);
                            }
                        }

                        if (timeDeltas.length >= 20) {
                            // Calculate median delta to avoid outliers
                            timeDeltas.sort((a, b) => a - b);
                            const medianDelta = timeDeltas[Math.floor(timeDeltas.length / 2)];

                            if (medianDelta > 0) {
                                const estimatedFps = 1 / medianDelta;

                                // Round to common frame rates: 23.976, 24, 25, 29.97, 30, 50, 50.24, 60, 120
                                const commonRates = [23.976, 24, 25, 29.97, 30, 50, 50.24, 60, 120];
                                let closestRate = commonRates[0];
                                let minDiff = Math.abs(estimatedFps - closestRate);

                                for (const rate of commonRates) {
                                    const diff = Math.abs(estimatedFps - rate);
                                    if (diff < minDiff) {
                                        minDiff = diff;
                                        closestRate = rate;
                                    }
                                }

                                // Only update if we're reasonably confident (within 15% of a common rate)
                                if (minDiff / closestRate < 0.15) {
                                    this.detectedFrameRate = closestRate;
                                }
                            }
                        }
                    }
                }
            }

            this.frameRateDetectionRafId = requestAnimationFrame(detectFrame);
        };

        this.frameRateDetectionRafId = requestAnimationFrame(detectFrame);
    }

    stopFrameRateDetection() {
        if (this.frameRateDetectionRafId !== null) {
            cancelAnimationFrame(this.frameRateDetectionRafId);
            this.frameRateDetectionRafId = null;
        }
        this.frameTimeSamples = [];
        this.frameRateDetectionStartTime = null;
    }

    getFrameDurationMs() {
        // Use detected frame rate if available, otherwise use a small increment for high frame rates
        if (this.detectedFrameRate) {
            return 1000 / this.detectedFrameRate;
        }
        // Default to 1/120 second (8.33ms) which works for up to 120fps
        // For lower frame rates, this just means more precise navigation
        return 1000 / 120;
    }

    emitFrameStep(direction) {
        // Don't do frame-by-frame if not in a room
        if (!state.roomCode.get()) {
            this.verbose && console.log("emitFrameStep: not in a room");
            return;
        }

        // Store the latest direction (will be used when throttle executes)
        this.pendingFrameStepDirection = direction;

        // Throttle frame step emits, but always send the latest one
        throttle(
            this,
            "emitFrameStep",
            () => {
                // Use the latest pending direction
                const latestDirection = this.pendingFrameStepDirection;
                this.pendingFrameStepDirection = null;

                // Get current progress (may have changed since the request)
                const { progress_ms, duration_ms } = getCurrentPlayingProgressMs();
                if (progress_ms === null || duration_ms === null) {
                    this.verbose && console.log("emitFrameStep: no current playing item");
                    return;
                }

                // Get frame duration based on detected frame rate
                const FRAME_DURATION_MS = this.getFrameDurationMs();

                // Calculate target position based on current progress and latest direction
                let targetMs = progress_ms + latestDirection * FRAME_DURATION_MS;

                // Clamp to video bounds
                targetMs = Math.max(0, Math.min(targetMs, duration_ms));

                // Seek to the exact frame position with play=false (frame-by-frame always pauses)
                this.verbose &&
                    console.log("emitFrameStep", {
                        direction: latestDirection,
                        progress_ms,
                        targetMs,
                        frameDurationMs: FRAME_DURATION_MS,
                        detectedFps: this.detectedFrameRate,
                    });
                this.app.socket.emit("room.control.seek", {
                    progress_ms: Math.floor(targetMs),
                    play: false, // Always pause for frame-by-frame navigation
                    frame_step: latestDirection, // Indicate this is a frame step navigation
                });
            },
            100 // Throttle delay: 100ms between frame step emits
        );
    }

    onUserGesture = (e) => {
        if (e.composedPath().some((el) => el.id === "sharetube_main"))
            return this.verbose && console.log("onUserGesture return: sharetube_main found in path");
        this.last_user_gesture_ms = Date.now();
    };

    isUserInitiatedMediaEvent(e) {
        const now = Date.now();
        const USER_WINDOW_MS = 1200;
        const PROGRAMMATIC_WINDOW_MS = 1200;
        if (now - this.last_user_gesture_ms < USER_WINDOW_MS) return true;
        if (now - this.last_programmatic_media_ms < PROGRAMMATIC_WINDOW_MS) return false;
        if (e && e.isTrusted === false) return false;
        return true;
    }
}
