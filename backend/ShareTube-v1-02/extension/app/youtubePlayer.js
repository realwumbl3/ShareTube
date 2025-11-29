import { LiveVar, html, css } from "./dep/zyx.js";
import { throttle } from "./utils.js";
import state from "./state.js";
import Splash from "./components/Splash.js";
import { getCurrentPlayingProgressMs } from "./getters.js";
import PlaybackSyncer from "./playbackSync.js";
import PlayerControls from "./playerControls.js";
import PlayerExtender from "./components/playerExtender.js";

import PlayerOSDDebug from "./playerosddebug.js";

// Lightweight observer/controller around the active <video> element on YouTube
export default class YoutubePlayerManager {
    constructor(app) {
        this.app = app;
        this.verbose = false;
        this.video = null;
        this.scan_timer = null;
        this.near_end_probe_sent = false;
        this.desired_state = new LiveVar("paused");
        this.ad_playing = new LiveVar(false);
        this.is_enforcing = new LiveVar(false);
        this.is_programmatic_seek = new LiveVar(false);
        this.last_user_gesture_ms = 0;
        this.last_programmatic_media_ms = 0;
        this.last_reported_ready_state = null;
        this.last_ad_state = false;
        this.pending_pause_after_ad = false;

        // Track frame step seeks to sync after native YouTube frame-by-frame navigation
        this.pending_frame_step_sync = null;
        this.pending_frame_step_position = null;

        this.playerControls = new PlayerControls(this);
        this.playerExtender = new PlayerExtender(this);

        this.video_listener_specs = [
            ["play", this.onPlay],
            ["playing", this.onPlaying],
            ["pause", this.onPause],
            ["timeupdate", this.onTimeUpdate],
            ["loadeddata", this.onLoadedData],
            ["seeking", this.onSeeking],
            ["seeked", this.onSeeked],
            ["ended", this.onEnded],
        ];

        this.splash = new Splash(this.video);
        // this.intermission = new Intermission();

        this.playbackSyncer = new PlaybackSyncer(this);

        this.osdDebug = new PlayerOSDDebug(this);
    }

    get videoDurationMs() {
        return this.video ? Math.max(0, Number(this.video.duration || 0) * 1000) : 0;
    }

    get videoCurrentTimeMs() {
        return this.video ? Math.max(0, Number(this.video.currentTime || 0) * 1000) : 0;
    }

    // Begin scanning for an active video element and bind to it
    start() {
        if (this.scan_timer) return;
        this.scan_timer = setInterval(() => this.ensureBoundToActiveVideo(), 500);
        // Attempt immediate bind
        this.ensureBoundToActiveVideo();
        // Track recent user gestures to classify media events
        this.playerControls.toggleDocumentListeners(true);
    }

    // Stop scanning and unbind from any current video element
    stop() {
        if (this.scan_timer) {
            clearInterval(this.scan_timer);
            this.scan_timer = null;
        }
        this.playerControls.toggleDocumentListeners(false);
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
        if (vid && this.isElementVisible(vid) && this.isActualVideoPlayer(vid)) return vid;
        // Shorts/reels
        const shorts = document.querySelector("ytd-reel-video-renderer video");
        if (shorts && this.isElementVisible(shorts) && this.isActualVideoPlayer(shorts)) return shorts;
        // Fallback to first visible video that is an actual player (not preview)
        const all = Array.from(document.querySelectorAll("video"));
        for (const v of all) {
            if (this.isElementVisible(v) && this.isActualVideoPlayer(v)) return v;
        }
        return null;
    }

    // Minimal visibility check for candidate video elements
    isElementVisible(el) {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
    }

    // Check if video is an actual player (descendant of ytd-video#ytd-player) and not a preview
    isActualVideoPlayer(videoEl) {
        // Must NOT be a child of ytd-video-preview
        const videoPreview = videoEl.closest("ytd-video-preview");
        if (videoPreview) return false;
        return true;
    }

    // Hook into a specific <video>: intercept play(), add event listeners, enforce state
    bindToVideo(video) {
        this.video = video;
        this.near_end_probe_sent = false;
        this.video.after(this.osdDebug.main);
        this.video.parentElement.after(this.splash.main);
        this.toggleVideoListeners(this.video, true);
        this.enforceDesiredState("bind");
        this.playbackSyncer.start();

        // Initialize player controls
        this.playerControls.bindToVideo(video);
        this.playerExtender.bind();
    }

    // Detach from current video element and cleanup
    unbindFromVideo() {
        if (!this.video) return;
        this.toggleVideoListeners(this.video, false);
        this.playbackSyncer.stop();
        this.playbackSyncer.resetPlaybackRate(true);
        this.osdDebug.main.remove();
        this.playerControls.unbindFromVideo();
        this.playerExtender.unbind();
        this.video = null;
        this.last_ad_state = false;
        this.pending_pause_after_ad = false;
        this.last_reported_ready_state = null;
    }

    onPlay = (e) => {
        this.osdDebug.log("onPlay");
        if (!this.isUserInitiatedMediaEvent(e)) return;
        this.enforceDesiredState("onPlay");
    };

    onPlaying = (e) => {
        this.osdDebug.log("onPlaying");
        this.enforceDesiredState("onPlaying");
        this.reportReadyState();
    };

    onPause = (e) => {
        this.osdDebug.log("onPause");
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
            this.osdDebug.log("onSeeked: programmatic seek");
            this.enforceDesiredState("onSeeked");
            return;
        }
        this.osdDebug.log("onSeeked: native seek");

        // If this was a frame step, sync it after the native seek completes
        if (this.pending_frame_step_sync !== null) {
            this.osdDebug.log("onSeeked: pending frame step sync");
            const direction = this.pending_frame_step_sync;
            this.pending_frame_step_sync = null;

            const actualMs = this.videoCurrentTimeMs;
            this.pending_frame_step_position = Math.floor(actualMs);

            // Throttle the sync emission to avoid spamming rapid frame steps
            throttle(
                this,
                "emitFrameStepSync",
                () => {
                    this.osdDebug.log("onSeeked: emitting frame step sync");
                    const positionToSync = this.pending_frame_step_position;
                    this.pending_frame_step_position = null;

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
        this.near_end_probe_sent = true;
        this.setDesiredState("paused", "onEnded");
    };

    checkIfVideoFinished() {
        if (!this.video || this.isAdPlayingNow()) return;
        if (this.videoCurrentTimeMs < this.videoDurationMs - 1000) return;
        this.app.socket.emit("queue.probe");
        this.osdDebug.log("checkIfVideoFinished: queue probe sent");
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
        if (!this.video) return false;
        const durationMs = this.videoDurationMs;
        const currentTimeMs = this.videoCurrentTimeMs;
        return durationMs > 5000 && currentTimeMs > 0 && durationMs - currentTimeMs <= thresholdSeconds * 1000;
    }

    onAdStartCb() {
        this.osdDebug.log("onAdStartCb");
        this.ad_playing.set(true);
        this.playbackSyncer.resetPlaybackRate(true);
        this.reportReadyState(true);
    }

    onAdEndCb() {
        this.osdDebug.log("onAdEndCb");
        this.ad_playing.set(false);
        this.playbackSyncer.resetPlaybackRate(true);
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
        if (state === "paused" && this.isAdPlayingNow()) this.pending_pause_after_ad = true;
        this.enforceDesiredState("setDesiredState");
    }

    setDesiredProgressMs(progressMs) {
        const seconds = progressMs / 1000;
        if (!this.video) return;
        // Don't seek during ads - let ads play naturally
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
        const wasAd = this.last_ad_state;
        this.last_ad_state = isAd;

        // Emit ad transition callbacks
        if (!wasAd && isAd) {
            this.onAdStartCb();
        } else if (wasAd && !isAd) {
            this.onAdEndCb();
        }

        // Don't enforce state if not in a room
        if (!state.roomCode.get()) {
            this.osdDebug.log("enforceDesiredState: not in room");
            return;
        }

        if (!this.video || this.is_enforcing.get()) return;

        // Suppress auto-play enforcement when video is essentially finished to avoid restarts
        if (this.isNearContentEnd(1) && !isAd) {
            this.osdDebug.log("enforceDesiredState: near content end");
            return;
        }

        const desired = this.getDesiredState();
        // Allow ads to **continue** playing when paused is desired, but do not
        // programmatically (re)start them. Repeatedly calling play() on an
        // ended/near-ended ad clip can cause YouTube to loop or restart ad pods.
        if (desired === "paused" && isAd) {
            !this.pending_pause_after_ad && this.osdDebug.log("enforceDesiredState: pending pause after ad");
            this.pending_pause_after_ad = true;
            // Intentionally avoid safePlay("ad-allowed") to prevent ad loops.
            return;
        }

        // Pause immediately after ad if we were waiting
        if (desired === "paused" && wasAd && !isAd && this.pending_pause_after_ad) {
            this.osdDebug.log("enforceDesiredState: post-ad pause");
            this.pending_pause_after_ad = false;
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
        if (!this.video || this.near_end_probe_sent) return;
        // Don't probe if it's an ad
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
            this.near_end_probe_sent = true;
            // Prevent restarts while server advances the queue
            this.setDesiredState("paused");
            this.app.socket.emit("queue.probe");
            this.osdDebug.log("maybeEmitNearEndProbe: near end probe sent");
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
        if (newState === "starting" || newState === "midroll") {
            this.last_reported_ready_state = null;
            this.reportReadyState(true);
            if (newState === "midroll") {
                this.setDesiredState("paused");
            }
            return;
        }
        // Leaving starting/midroll state, clear cached ready status so next cycle re-sends.
        this.last_reported_ready_state = null;
    }

    reportReadyState(force = false) {
        const roomCode = state.roomCode.get();

        if (!roomCode || !state.inRoom.get()) {
            this.last_reported_ready_state = null;
            return;
        }
        if (!this.video) {
            if (!force) this.last_reported_ready_state = null;
            return;
        }

        const haveCurrentData =
            typeof HTMLMediaElement !== "undefined" && HTMLMediaElement ? HTMLMediaElement.HAVE_CURRENT_DATA : 2;
        const canPlay = this.video.readyState >= haveCurrentData;
        const adNow = this.isAdPlayingNow();
        const ready = Boolean(canPlay && !adNow);

        if (!force && this.last_reported_ready_state === ready) return;
        this.last_reported_ready_state = ready;

        state.userReady.set(ready);
        this.osdDebug.log(ready ? "reportReadyState: user ready" : "reportReadyState: user not ready");
        this.app.socket.emit("user.ready", { ready });
    }

    toggleVideoListeners(video, shouldBind) {
        if (!video) return;
        const method = shouldBind ? "addEventListener" : "removeEventListener";
        this.video_listener_specs.forEach(([type, handler]) => {
            try {
                video[method](type, handler);
            } catch {}
        });
    }

    isUserInitiatedMediaEvent(e) {
        return this.playerControls.isUserInitiatedMediaEvent(e);
    }
}
