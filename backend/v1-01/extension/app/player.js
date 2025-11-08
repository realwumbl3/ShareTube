// Log module load for diagnostics
console.log("cs/player.js loaded");

import { LiveVar, html, css } from "./dep/zyx.js";

css`
    .observer_badge {
        position: absolute;
        top: 0;
        left: 0;
        background-color: #000;
        color: #fff;
        z-index: 1000000000;
    }
`;

// Lightweight observer/controller around the active <video> element on YouTube
export default class YoutubePlayerManager {
    constructor(app) {
        this.app = app;
        this.video = null;
        this.scanTimer = null;
        this.desired_state = new LiveVar("paused");
        this.ad_playing = new LiveVar(false);
        this.is_enforcing = new LiveVar(false);
        this.lastAdState = false;
        this.pendingPauseAfterAd = false;

        this.badge = html`<div class="observer_badge">
            Video Observed, state: ${this.desired_state.interp()}
        </div>`.const();
    }

    // Begin scanning for an active video element and bind to it
    start() {
        if (this.scanTimer) return;
        this.scanTimer = setInterval(() => this.ensureBoundToActiveVideo(), 500);
        // Attempt immediate bind
        this.ensureBoundToActiveVideo();
    }

    // Stop scanning and unbind from any current video element
    stop() {
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
            this.scanTimer = null;
        }
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
        console.log("bindToVideo", video);
        this.video = video;
        this.video.before(this.badge.main);
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
        console.log("onPlay");
        this.enforceDesiredState("onPlay");
    };

    onPlaying = (e) => {
        console.log("onPlaying");
        this.enforceDesiredState("onPlaying");
    };

    onPause = (e) => {
        console.log("onPause");
        this.enforceDesiredState("onPause");
    };

    onTimeUpdate = (e) => {
        this.enforceDesiredState("onTimeUpdate");
    };

    onLoadedData = (e) => {
        console.log("onLoadedData");
        this.enforceDesiredState("onLoadedData");
    };

    onSeeking = (e) => {
        console.log("onSeeking");
        this.enforceDesiredState("onSeeking");
    };

    onSeeked = (e) => {
        console.log("onSeeked");
        this.enforceDesiredState("onSeeked");
    };

    onEnded = (e) => {
        console.log("onEnded");
    };

    getPlayerState() {
        try {
            if (!this.video) return "idle";
            return this.video.paused ? "paused" : "playing";
        } catch {
            return "idle";
        }
    }

    onAdStartCb() {
        console.log("onAdStart");
        this.ad_playing.set(true);
    }

    onAdEndCb() {
        console.log("onAdEnd");
        this.ad_playing.set(false);
    }

    // External API for desired state
    setDesiredState(state) {
        console.log("setDesiredState", state);
        if (state !== "playing" && state !== "paused") return;
        if (this.desired_state.get() === state) return;
        this.desired_state.set(state);
        if (state === "paused" && this.isAdPlayingNow()) this.pendingPauseAfterAd = true;
        this.enforceDesiredState("setDesiredState");
    }

    getDesiredState() {
        return this.desired_state.get ? this.desired_state.get() : this.desired_state;
    }

    safePlay(reason) {
        if (!this.video) return;
        if (!this.video.paused) return;
        console.log("safePlay", reason);
        this.is_enforcing.set(true);
        const p = this.video.play();
        if (p && typeof p.catch === "function") {
            p.catch(() => {}).finally(() => this.is_enforcing.set(false));
        } else {
            this.is_enforcing.set(false);
        }
        console.log("enforce: play", reason);
    }

    safePause(reason) {
        if (!this.video) return;
        if (this.video.paused) return;
        console.log("safePause", reason);
        this.is_enforcing.set(true);
        try {
            this.video.pause();
        } catch {}
        this.is_enforcing.set(false);
        console.log("enforce: pause", reason);
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
            console.log("enforceDesiredState: not enforcing", reason, this);
            return;
        }

        const desired = this.getDesiredState();
        // console.log("enforceDesiredState", reason, { desired, isAd, wasAd });

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

    // Heuristics to detect whether an ad is playing in the active player UI
    isAdPlayingNow() {
        if (!this.video) return false;
        const container = this.video.closest(".html5-video-player") || document.querySelector(".html5-video-player");
        // If content essentially ended, do not report ad
        const dur = Number(this.video.duration || 0);
        const cur = Number(this.video.currentTime || 0);
        if (dur > 5 && cur > 0 && cur / dur > 0.985) return false;
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
}
