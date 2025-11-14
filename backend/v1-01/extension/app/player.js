// Log module load for diagnostics
console.log("cs/player.js loaded");

import { LiveVar, html, css, throttle } from "./dep/zyx.js";
import state from "./state.js";
import PlayPauseSplash from "./components/PlayPauseSplash.js";

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
        this.lastAdState = false;
        this.pendingPauseAfterAd = false;

        this.seek_throttle_accumulator = -1;

        this.binds = {
            onSeek: new Set(),
            onSeeked: new Set(),
            onSeeking: new Set(),
            onPause: new Set(),
            onPlay: new Set(),
        };

        this.playPauseSplash = new PlayPauseSplash(this.video);

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
            document.addEventListener("keydown", this.onUserGesture, true);
            document.addEventListener("keydown", this.onControlKeydown, true);
            document.addEventListener("keyup", this.onControlKeyup, true);
            document.addEventListener("click", this.onBodyClickCapture, true);
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
            document.removeEventListener("keydown", this.onUserGesture, true);
            document.removeEventListener("keydown", this.onControlKeydown, true);
            document.removeEventListener("keyup", this.onControlKeyup, true);
            document.removeEventListener("click", this.onBodyClickCapture, true);
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
        this.video.before(this.badge.main);
        this.video.parentElement.after(this.playPauseSplash.main);
        this.video.addEventListener("play", this.onPlay);
        this.video.addEventListener("playing", this.onPlaying);
        this.video.addEventListener("pause", this.onPause);
        this.video.addEventListener("timeupdate", this.onTimeUpdate);
        this.video.addEventListener("loadeddata", this.onLoadedData);
        this.video.addEventListener("seeking", this.onSeeking);
        this.video.addEventListener("seeked", this.onSeeked);
        this.video.addEventListener("ended", this.onEnded);
        this.enforceDesiredState("bind");
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
        this.video = null;
        this.lastAdState = false;
        this.pendingPauseAfterAd = false;
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
        if (this.video.currentTime < this.video.duration - 1)
            return console.log("Video not finished", {
                currentTime: this.video.currentTime,
                duration: this.video.duration,
            });
        console.log("Video onEnded");
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
            return dur > 5 && cur > 0 && (dur - cur) <= thresholdSeconds;
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

    onControlKeyup = (e) => {
        console.log("onControlKeyup", e);
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
        if (!target || !playerEl.contains(target)) return;
        this.onPlayerClick(e, path);
    };

    onPlayerClick(e, path) {
        this.verbose && console.log("onPlayerClick", e);
        if (path.some((el) => el && el.classList?.contains("ytp-progress-bar"))) {
            e.preventDefault();
            e.stopPropagation();
            this.onSeekBarClick(e, path);
            return;
        } else if (path.some((el) => el && el.classList?.contains("ytp-chrome-controls"))) {
            this.verbose && console.log("onPlayerClick: chrome controls clicked");
            if (path.some((el) => el && el.classList?.contains("ytp-play-button"))) {
                e.preventDefault();
                e.stopPropagation();
                this.emitToggleRoomPlayPause();
            }
            return;
        } else if (e.target === this.video) {
            this.verbose && console.log("onPlayerClick: video clicked");
            e.preventDefault();
            e.stopPropagation();
            this.emitToggleRoomPlayPause();
        } else {
            this.verbose && console.log("onPlayerClick: other clicked", e);
        }
    }

    onSeekBarClick(e, path) {
        throttle(
            this,
            "onSeekBarClick",
            () => {
                const progressBar = path.find((el) => el && el.classList?.contains("ytp-progress-bar"));
                if (!progressBar) return;
                const bounds = progressBar.getBoundingClientRect();
                const x = e.clientX - bounds.left;
                const progress = Math.max(0, Math.min(1, x / bounds.width));
                const progressMs = Math.floor(progress * this.video.duration * 1000);
                this.verbose && console.log("onPlayerClick: progress bar clicked", { progress, progressMs });
                this.binds.onSeek.forEach((callback) => callback(progressMs));
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
                console.log("emitToggleRoomPlayPause");
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
