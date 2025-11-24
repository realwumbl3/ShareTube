import { LiveVar, html, css } from "./dep/zyx.js";
import { throttle } from "./utils.js";
import state from "./state.js";
import Splash from "./components/Splash.js";
import Intermission from "./components/Intermission.js";
import { currentPlayingProgressMsPercentageToMs, getCurrentPlayingProgressMs } from "./getters.js";

const PLAYBACK_DRIFT_INTERVAL_MS = 500;
const PLAYBACK_DRIFT_THRESHOLD_MS = 20;
const PLAYBACK_DRIFT_FULL_ADJUST_MS = 3000;
const PLAYBACK_DRIFT_MIN_RATE = 0.85;
const PLAYBACK_DRIFT_MAX_RATE = 1.2;
const PLAYBACK_DRIFT_SEEK_THRESHOLD_MS = 6000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
        this.verbose = true;
        this.video = null;
        this.scanTimer = null;
        this.nearEndProbeSent = false;
        this.desired_state = new LiveVar("paused");
        this.ad_playing = new LiveVar(false);
        this.is_enforcing = new LiveVar(false);
        this.is_programmatic_seek = new LiveVar(false);
        this.last_user_gesture_ms = 0;
        this.last_programmatic_media_ms = 0;
        this.lastReportedReadyState = null;
        this.lastAdState = false;
        this.pendingPauseAfterAd = false;
        this.lastVideoClickTime = 0;
        this.videoClickTimeout = null;
        this.seekBarEl = null;

        this.seekKeyStartTime = 0;
        this.seekTimings = {
            0: 5000,
            3000: 10000,
            6000: 30000,
        };

        // Track frame step seeks to sync after native YouTube frame-by-frame navigation
        this.pendingFrameStepSync = null;
        this.pendingFrameStepPosition = null;

        this.splash = new Splash(this.video);
        // this.intermission = new Intermission();

        this.playbackDriftInterval = null;
        this.lastAppliedPlaybackRate = 1;

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
        this.video = video;
        this.nearEndProbeSent = false;
        this.video.after(this.badge.main);
        this.video.parentElement.after(this.splash.main);
        // this.video.parentElement.after(this.intermission.main);
        this.video.addEventListener("play", this.onPlay);
        this.video.addEventListener("playing", this.onPlaying);
        this.video.addEventListener("pause", this.onPause);
        this.video.addEventListener("timeupdate", this.onTimeUpdate);
        this.video.addEventListener("loadeddata", this.onLoadedData);
        this.video.addEventListener("seeking", this.onSeeking);
        this.video.addEventListener("seeked", this.onSeeked);
        this.video.addEventListener("ended", this.onEnded);
        this.enforceDesiredState("bind");
        this.startPlaybackDriftMonitor();

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
        this.stopPlaybackDriftMonitor();
        this.resetPlaybackRate(true);
        this.video = null;
        this.lastAdState = false;
        this.pendingPauseAfterAd = false;
        this.seekBarEl = null;
        this.lastReportedReadyState = null;
    }

    startPlaybackDriftMonitor() {
        this.stopPlaybackDriftMonitor();
        if (!this.video) return;
        this.playbackDriftInterval = setInterval(() => this.checkPlaybackDrift(), PLAYBACK_DRIFT_INTERVAL_MS);
    }

    stopPlaybackDriftMonitor() {
        if (!this.playbackDriftInterval) return;
        clearInterval(this.playbackDriftInterval);
        this.playbackDriftInterval = null;
    }

    resetPlaybackRate(force = false) {
        if (!this.video) {
            this.lastAppliedPlaybackRate = 1;
            return;
        }
        const currentRate = typeof this.video.playbackRate === "number" ? this.video.playbackRate : 1;
        if (force || Math.abs(currentRate - 1) > 0.001) {
            try {
                this.video.playbackRate = 1;
            } catch (err) {
                this.verbose && console.warn("resetPlaybackRate failed", err);
            }
        }
        this.lastAppliedPlaybackRate = 1;
    }

    checkPlaybackDrift() {
        if (!this.video) return;
        if (!state.roomCode.get()) return this.resetPlaybackRate();
        if (state.roomState.get() !== "playing") return this.resetPlaybackRate();
        if (this.video.paused) return this.resetPlaybackRate();
        if (this.ad_playing.get && this.ad_playing.get()) return this.resetPlaybackRate();
        if (this.isAdPlayingNow()) return this.resetPlaybackRate();
        if (this.isNearContentEnd(1)) return this.resetPlaybackRate();
        const { progress_ms } = getCurrentPlayingProgressMs();
        if (progress_ms === null || progress_ms === undefined) {
            return this.resetPlaybackRate();
        }

        const actualMs = Number(this.video.currentTime || 0) * 1000;
        if (!isFinite(actualMs)) {
            return this.resetPlaybackRate();
        }

        const driftMs = progress_ms - actualMs;
        if (Math.abs(driftMs) >= PLAYBACK_DRIFT_SEEK_THRESHOLD_MS) {
            this.setDesiredProgressMs(progress_ms);
            this.resetPlaybackRate(true);
            return;
        }

        if (Math.abs(driftMs) <= PLAYBACK_DRIFT_THRESHOLD_MS) return this.resetPlaybackRate();

        const rateDelta = driftMs / PLAYBACK_DRIFT_FULL_ADJUST_MS;
        const targetRate = clamp(1 + rateDelta, PLAYBACK_DRIFT_MIN_RATE, PLAYBACK_DRIFT_MAX_RATE);

        // console.log("checkPlaybackDrift", {
        //     driftMs,
        //     rateDelta,
        //     targetRate,
        //     lastAppliedPlaybackRate: this.lastAppliedPlaybackRate,
        // });

        try {
            this.video.playbackRate = targetRate;
            this.lastAppliedPlaybackRate = targetRate;
        } catch (err) {
            this.verbose && console.warn("checkPlaybackDrift: failed to set playbackRate", err);
        }
    }

    onPlay = (e) => {
        if (!this.isUserInitiatedMediaEvent(e)) return;
        this.enforceDesiredState("onPlay");
    };

    onPlaying = (e) => {
        this.enforceDesiredState("onPlaying");
    };

    onPause = (e) => {
        this.checkIfVideoFinished();
        if (!this.isUserInitiatedMediaEvent(e)) return;
        this.enforceDesiredState("onPause");
    };

    onTimeUpdate = (e) => {
        this.maybeEmitNearEndProbe();
        this.enforceDesiredState("onTimeUpdate");
    };

    onLoadedData = (e) => {
        this.enforceDesiredState("onLoadedData");
        this.reportReadyState(true);
    };

    onSeeking = (e) => {
        if (this.is_programmatic_seek.get()) return;
        this.enforceDesiredState("onSeeking");
    };

    onSeeked = (e) => {
        if (this.is_programmatic_seek.get()) {
            this.enforceDesiredState("onSeeked");
            return;
        }

        // If this was a frame step, sync it after the native seek completes
        if (this.pendingFrameStepSync !== null) {
            const direction = this.pendingFrameStepSync;
            this.pendingFrameStepSync = null;

            const actualMs = this.video.currentTime * 1000;
            this.pendingFrameStepPosition = Math.floor(actualMs);

            // Throttle the sync emission to avoid spamming rapid frame steps
            throttle(
                this,
                "emitFrameStepSync",
                () => {
                    const positionToSync = this.pendingFrameStepPosition;
                    this.pendingFrameStepPosition = null;

                    if (positionToSync === null) return;

                    // Emit as a seek so the splash shows accordingly
                    this.app.socket.emit("room.control.seek", {
                        progress_ms: positionToSync,
                        play: false, // Always pause for frame-by-frame navigation,
                        frame_step: direction,
                    });
                },
                100 // Throttle delay: 100ms between frame step sync emits
            );
        }

        this.enforceDesiredState("onSeeked");
    };

    onEnded = (e) => {
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
        this.ad_playing.set(true);
        this.resetPlaybackRate(true);
        this.reportReadyState(true);
    }

    onAdEndCb() {
        this.ad_playing.set(false);
        this.resetPlaybackRate(true);
        this.reportReadyState(true);
    }

    getDesiredState() {
        return this.desired_state.get ? this.desired_state.get() : this.desired_state;
    }

    // External API for desired state
    setDesiredState(state) {
        if (state !== "playing" && state !== "paused") return;
        if (this.desired_state.get() === state) return;
        this.desired_state.set(state);
        if (state === "paused" && this.isAdPlayingNow()) this.pendingPauseAfterAd = true;
        this.enforceDesiredState("setDesiredState");
    }

    setDesiredProgressMs(progressMs) {
        const seconds = progressMs / 1000;
        if (!this.video) return;
        // Don't seek during ads - let ads play naturally
        if (this.ad_playing.get && this.ad_playing.get()) return;
        if (this.isAdPlayingNow()) return;
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
            return;
        }

        if (!this.video || this.is_enforcing.get()) return;

        // Suppress auto-play enforcement when video is essentially finished to avoid restarts
        if (this.isNearContentEnd(1) && !isAd) {
            try {
                const dur = Number(this.video.duration || 0);
                const cur = Number(this.video.currentTime || 0);
            } catch {}
            return;
        }

        const desired = this.getDesiredState();
        // Allow ads to **continue** playing when paused is desired, but do not
        // programmatically (re)start them. Repeatedly calling play() on an
        // ended/near-ended ad clip can cause YouTube to loop or restart ad pods.
        if (desired === "paused" && isAd) {
            this.pendingPauseAfterAd = true;
            // Intentionally avoid safePlay("ad-allowed") to prevent ad loops.
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
        // Don't probe if it's an ad
        if (this.ad_playing.get && this.ad_playing.get()) return;
        if (this.isAdPlayingNow()) return;

        // Use authoritative server-side timing to decide when the video is "near end"
        // rather than the raw <video> element, which can still reflect a previous
        // clip or pre‑roll ad (especially around user.ready → room.playback).
        const { progress_ms, duration_ms } = getCurrentPlayingProgressMs();
        if (duration_ms === null || duration_ms === undefined || duration_ms <= 0) return;
        if (progress_ms === null || progress_ms === undefined) return;

        const remainingMs = duration_ms - progress_ms;
        const thresholdMs = 1000; // 1s from real content end

        // Only treat as near-end when the actual room playback is almost finished.
        if (remainingMs <= thresholdMs) {
            this.nearEndProbeSent = true;
            // Prevent restarts while server advances the queue
            this.setDesiredState("paused");
            this.app.socket.emit("queue.probe");
        }
    }

    // Heuristics to detect whether an ad is playing in the active player UI
    isAdPlayingNow() {
        if (!this.video) return false;
        const container = this.video.closest(".html5-video-player") || document.querySelector(".html5-video-player");
        let hasAdClass = false;
        let hasAdElements = false;

        if (container) {
            hasAdClass = container.classList.contains("ad-showing");
            try {
                hasAdElements =
                    container.querySelector(
                        ".ytp-ad-duration-remaining, .ytp-ad-player-overlay, .ytp-ad-skip-button, .ytp-ad-skip-button-modern"
                    ) != null;
            } catch {
                hasAdElements = false;
            }
        }

        const isNearEnd = this.isNearContentEnd(1);
        const adDetected = Boolean((container && hasAdClass) || (container && hasAdElements));

        // Only suppress ad detection near actual content end – never suppress purely
        // based on ad video length (e.g. for 6s ads). We rely on server-side timing
        // for near-end content detection elsewhere.
        if (isNearEnd && !adDetected) return false;

        return adDetected;
    }

    onRoomStateChange(newState) {
        try {
            const roomCode = state.roomCode && state.roomCode.get ? state.roomCode.get() : null;
            const globalRoomState = state.roomState && state.roomState.get ? state.roomState.get() : null;
        } catch {}

        if (newState === "starting") {
            this.lastReportedReadyState = null;
            this.reportReadyState(true);
            return;
        }
        // Leaving starting state, clear cached ready status so next cycle re-sends.
        this.lastReportedReadyState = null;
    }

    reportReadyState(force = false) {
        const roomCode = state.roomCode && state.roomCode.get ? state.roomCode.get() : null;
        const roomState = state.roomState && state.roomState.get ? state.roomState.get() : null;
        const inRoom = state.inRoom && state.inRoom.get ? Boolean(state.inRoom.get()) : false;

        if (!roomCode) {
            this.lastReportedReadyState = null;
            return;
        }
        // If we are not currently joined to any room (e.g. after a leave or
        // socket disconnect), do not emit readiness for stale room codes.
        if (!inRoom) {
            this.lastReportedReadyState = null;
            return;
        }
        if (roomState !== "starting") {
            return;
        }
        if (!this.video) {
            if (!force) this.lastReportedReadyState = null;
            return;
        }

        const haveCurrentData =
            typeof HTMLMediaElement !== "undefined" && HTMLMediaElement ? HTMLMediaElement.HAVE_CURRENT_DATA : 2;
        const canPlay = this.video.readyState >= haveCurrentData;
        const adNow = this.isAdPlayingNow();
        const ready = Boolean(canPlay && !adNow);

        if (!force && this.lastReportedReadyState === ready) return;
        this.lastReportedReadyState = ready;
        if (!state.roomCode.get()) {
            return;
        }

        if (this.app?.socket?.emitUserReady) {
            this.app.socket.emitUserReady(ready);
        } else if (this.app?.socket?.emit) {
            this.app.socket.emit("user.ready", { ready });
        }
    }

    onControlKeyup = () => {
        this.seekKeyStartTime = 0;
    };

    // Override native YouTube controls with room controls
    onControlKeydown = (e) => {
        if (e.altKey) return;
        // Ignore when typing in inputs or inside ShareTube UI
        const path = (e.composedPath && e.composedPath()) || [];
        if (path.some((el) => el && el.id === "sharetube_main")) return;
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
                if (e.ctrlKey) return;
                e.preventDefault();
                e.stopPropagation();
                this.emitSeekRelative(-1);
                break;

            case "ArrowRight":
            case "KeyD":
                if (e.ctrlKey) return;
                e.preventDefault();
                e.stopPropagation();
                this.emitSeekRelative(1);
                break;

            case "Comma":
            case "Period":
                // Let YouTube handle native frame-by-frame navigation
                // We'll sync after the seek completes
                if (!state.roomCode.get()) return;
                if (!this.video) return;
                const direction = e.code === "Period" ? 1 : -1;
                this.pendingFrameStepSync = direction;
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
            // Detect double-click: if two clicks happen within 200ms, skip play/pause toggle
            const now = Date.now();
            const timeSinceLastClick = now - this.lastVideoClickTime;

            if (timeSinceLastClick < 200) {
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
            }, 200);
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
                this.emitSeekToPercentage(progress);
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
            300
        );
    }

    emitSeekRelative(direction) {
        const delay = 500;

        if (this.seekKeyStartTime === 0) {
            this.seekKeyStartTime = Date.now();
        }

        throttle(
            this,
            "emitSeekRelative",
            () => {
                const elapsed = this.seekKeyStartTime > 0 ? Date.now() - this.seekKeyStartTime : 0;

                let increment = 5000;
                const thresholds = Object.keys(this.seekTimings)
                    .map(Number)
                    .sort((a, b) => a - b);

                for (const t of thresholds) {
                    if (elapsed >= t) {
                        increment = this.seekTimings[t];
                    }
                }

                const real_delta = direction * increment;
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
                this.app.socket.emit("room.control.seek", {
                    progress_ms: targetMs,
                    play: state.roomState.get() === "playing",
                });
            },
            300
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
