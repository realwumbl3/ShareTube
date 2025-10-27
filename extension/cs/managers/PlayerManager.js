import { logger } from "../logger.js";
import { EmitThrottler, buildSignature } from "../utils.js";
// Log module load for diagnostics
console.log("cs/player.js loaded");

// Lightweight observer/controller around the active <video> element on YouTube
export default class YoutubePlayerManager {
    constructor(app) {
        this.app = app;
        // Desired content state enforced by room logic: 'paused' | 'playing'
        this.desiredState = "paused"; // 'paused' | 'playing'
        this.video = null;
        this.originalPlay = null;
        this.boundHandlers = new Map();
        this.scanTimer = null;
        this.allowPlayUntilMs = 0;
        this.isAd = false;
        this._seeking = false;
        this._lastSeekNotifiedAtSec = -1;
        this.suppressSeekUntilMs = 0;
        // If an app reference is provided, wire default handlers that integrate with the app

        // Throttlers for noisy emits
        this.playerStatusThrottler = new EmitThrottler(900);
        this.persistThrottler = new EmitThrottler(700);
    }

    async seekTo(ms, play) {
        try {
            this.app._withSocket((sock, code) => {
                sock.emit("room_seek", { code, progress_ms: Math.max(0, Math.floor(ms || 0)), play: !!play });
            });
        } catch (e) {
            logger.debug("seekTo failed", e);
        }
    }

    emitPlayerStatus(isAdNow, forceImmediate) {
        try {
            const now = Date.now();
            // Report actual player state regardless of room state
            let state = "idle";
            if (this.video) state = this.video.paused ? "paused" : "playing";
            const { current_ms, duration_ms } = this._readVideoTimesMs();
            this.app._withSocket((sock, code) => {
                const payload = { code, state, is_ad: !!isAdNow, ts: now, current_ms, duration_ms };
                const signature = buildSignature(payload, ["state", "is_ad", "current_ms"]);
                if (!forceImmediate && !this.playerStatusThrottler.allow(now, signature)) return;
                sock.emit("player_status", payload);
            });
        } catch (e) {
            logger.debug("emitPlayerStatus failed", e);
        }
    }

    _readVideoTimesMs() {
        let current_ms = 0,
            duration_ms = 0;
        try {
            if (this.video) {
                current_ms = Math.max(0, Math.floor((this.video.currentTime || 0) * 1000));
                duration_ms = Math.max(0, Math.floor((this.video.duration || 0) * 1000));
            }
        } catch (e) {
            logger.debug("read player time failed", e);
        }
        return { current_ms, duration_ms };
    }

    persistProgress() {
        try {
            const rs = this.app.roomState.get();
            if (this.isAd || rs === "starting") return;
            let { current_ms, duration_ms } = this._readVideoTimesMs();
            if (current_ms < 1000) return;
            if (duration_ms > 0 && current_ms > duration_ms) current_ms = duration_ms;
            const now = Date.now();
            const signature = String(current_ms);
            if (!this.persistThrottler.allow(now, signature)) return;
            this.app._withSocket((sock, code) => {
                sock.emit("room_seek", { code, progress_ms: current_ms, play: false });
            });
        } catch (e) {
            logger.debug("persistProgress failed", e);
        }
    }

    // --- Default handlers (used when app is provided) ---
    onTimeUpdate(t, isAd) {
        const app = this.app;
        this.emitPlayerStatus(!!isAd, false);
        app.updateControlButtonLabel();
    }

    onAdChange(isAd) {
        const app = this.app;
        app.adPlaying.set(!!isAd);
        console.log("Ad status changed:", isAd);
        this.emitPlayerStatus(!!isAd, true);
        app._withSocket(function (sock, code) {
            sock.emit(isAd ? "room_ad_start" : "room_ad_end", { code: code });
        });
        if (app.adOverlayManager) app.adOverlayManager.notifyStateChanged();
        app.updateControlButtonLabel();
        if (!isAd) {
            app.roomManager.updatePlaybackEnforcement("local_ad_end");
            app.roomManager.seekAccordingToServer("local_ad_end");
            if (app.adOverlayManager) app.adOverlayManager.notifyStateChanged();
        }
    }

    onPause() {
        const app = this.app;
        this.emitPlayerStatus(!!app.adPlaying.get(), false);
        this.persistProgress();
        app.updateControlButtonLabel();
        const rs = app.roomState.get();
        const seeking = !!this._seeking;
        if (!this.isAd && !seeking && rs !== "idle") {
            this.app._withSocket(function (sock, code) {
                sock.emit("room_state_set", { code: code, state: "idle" });
            });
        }
    }

    onPlay() {
        const app = this.app;
        this.emitPlayerStatus(!!app.adPlaying.get(), false);
        app.updateControlButtonLabel();
        const rs = app.roomState.get();
        if (!this.isAd && rs !== "playing") {
            this.app._withSocket(function (sock, code) {
                sock.emit("room_state_set", { code: code, state: "playing" });
            });
        }
    }

    onSeek(seconds) {
        const app = this.app;
        const isPlaying = !!(this.video && !this.video.paused);
        app.localSeekAuthorityUntil = Date.now() + 1200;
        this.app._withSocket(function (sock, code) {
            sock.emit("room_seek", {
                code: code,
                progress_ms: Math.max(0, Math.floor((seconds || 0) * 1000)),
                play: isPlaying,
            });
        });
        const dur = Number((app.playback && app.playback.duration) || 0);
        app.playback = {
            duration: dur,
            progress: Math.max(0, Math.floor((seconds || 0) * 1000)),
            playing_since: isPlaying ? Date.now() : 0,
            lastTs: Date.now(),
        };
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

    // Update desired state and try to enforce it on the bound video
    setDesiredState(state) {
        const s = state === "playing" ? "playing" : "paused";
        this.desiredState = s;
        if (this.video) {
            if (s === "paused") {
                // Do not pause if an ad is currently playing
                if (!this.isAd) this.video.pause();
            } else if (s === "playing") {
                // If we attach to a new video while desired state is playing, request play
                if (this.video.paused) this.requestPlay();
            }
        }
    }

    // Request playback with a short allow window to bypass some autoplay guards
    requestPlay() {
        if (!this.video) return;
        this.allowPlayUntilMs = performance.now() + 1500;
        if (this.originalPlay) {
            this.originalPlay.call(this.video);
        } else {
            this.video.play();
        }
        // Clear the allowance soon after
        setTimeout(() => {
            this.allowPlayUntilMs = 0;
        }, 1600);
    }

    // Request a pause on the bound video
    requestPause() {
        if (!this.video) return;
        try {
            this.video.pause();
        } catch {}
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
        this.hookPlayMethod(video);
        this.addEvent(video, "play", () => {
            this.onMaybeExternalPlay();
            this.onPlay();
        });
        this.addEvent(video, "playing", () => {
            this.onMaybeExternalPlay();
            this.onPlay();
        });
        this.addEvent(video, "pause", () => this.onPause());
        this.addEvent(video, "timeupdate", () => this.onTimeUpdate());
        this.addEvent(video, "loadeddata", () => this.onLoadedData());
        this.addEvent(video, "seeking", () => this.onSeeking());
        this.addEvent(video, "seeked", () => this.onSeeked());
        this.addEvent(video, "ended", () => this.onEnded());
        // Enforce current state right away
        if (this.desiredState === "paused") {
            if (!this.isAd) {
                try {
                    video.pause();
                } catch {}
            }
        } else if (this.desiredState === "playing") {
            this.requestPlay();
        }
    }

    // Restore original play() if it was wrapped
    unhookPlayMethod(video) {
        if (video && this.originalPlay && video.play !== this.originalPlay) {
            video.play = this.originalPlay;
        }
        this.originalPlay = null;
    }

    // Wrap HTMLMediaElement.play() to enforce pauses when room requires it
    hookPlayMethod(video) {
        if (!this.originalPlay) this.originalPlay = video.play.bind(video);
        const self = this;
        video.play = function (...args) {
            // Allow play when an ad is showing
            if (!self.isPlayAllowedNow() && !self.isAdPlayingNow()) {
                // Block external play attempts when paused is enforced
                setTimeout(() => {
                    video.pause();
                }, 0);
                return Promise.resolve();
            }
            return self.originalPlay.apply(this, args);
        };
    }

    // Helper to add an event listener and remember it for cleanup
    addEvent(target, type, handler) {
        const bound = handler.bind(this);
        target.addEventListener(type, bound, true);
        this.boundHandlers.set(`${type}:${this.boundHandlers.size}`, { target, type, bound });
    }

    // Temporarily suppress emitting seek callbacks after programmatic seeks
    suppressSeekEmit(ms = 600) {
        try {
            this.suppressSeekUntilMs = performance.now() + Math.max(0, Number(ms || 0));
        } catch {
            this.suppressSeekUntilMs = Date.now() + Math.max(0, Number(ms || 0));
        }
    }

    // Whether seek emissions are still suppressed
    isSeekSuppressed() {
        try {
            return performance.now() < this.suppressSeekUntilMs;
        } catch {
            return Date.now() < this.suppressSeekUntilMs;
        }
    }

    // Remove all event listeners added by this instance
    removeAllEvents() {
        for (const [, h] of this.boundHandlers) {
            h.target.removeEventListener(h.type, h.bound, true);
        }
        this.boundHandlers.clear();
    }

    // Detach from current video element and cleanup
    unbindFromVideo() {
        if (!this.video) return;
        this.unhookPlayMethod(this.video);
        this.removeAllEvents();
        this.video = null;
    }

    // Determine whether play() calls should be allowed right now
    isPlayAllowedNow() {
        if (this.desiredState === "playing") return true;
        return performance.now() < this.allowPlayUntilMs;
    }

    // Expose a minimal player state string for external readers/tests
    getPlayerState() {
        try {
            if (!this.video) return "idle";
            return this.video.paused ? "paused" : "playing";
        } catch {
            return "idle";
        }
    }

    // Guard against external play when room desires 'paused', except during ads
    onMaybeExternalPlay() {
        if (!this.video) return;
        // Allow ad playback even if desired state is paused
        if (!this.isPlayAllowedNow() && !this.isAdPlayingNow()) this.video.pause();
    }

    // Enforce desired state after a new source is loaded
    onLoadedData() {
        // Sync state after source changes
        if (!this.video) return;
        if (this.desiredState === "paused") {
            if (!this.isAdPlayingNow()) {
                try {
                    this.video.pause();
                } catch {}
            }
        } else if (this.desiredState === "playing") {
            this.requestPlay();
        }
    }

    // Emit a seek callback when user initiates a seek
    onSeeking() {
        if (!this.video) return;
        this._seeking = true;
        if (this.isSeekSuppressed()) return;
        // Notify immediately so server syncs on first click
        if (this.onSeek) {
            try {
                const sec = Number(this.video.currentTime || 0);
                this._lastSeekNotifiedAtSec = sec;
                this.onSeek(sec);
            } catch {}
        }
    }

    // After seek completes, emit if the position changed significantly
    onSeeked() {
        if (!this.video) return;
        const sec = Number(this.video.currentTime || 0);
        if (this.isSeekSuppressed()) {
            this._seeking = false;
            return;
        }
        if (this.onSeek && Math.abs(sec - this._lastSeekNotifiedAtSec) > 0.2) {
            try {
                this.onSeek(sec);
            } catch {}
            this._lastSeekNotifiedAtSec = sec;
        }
        this._seeking = false;
    }

    // Reset ad state on content end and forward a pause notification
    onEnded() {
        // Ensure ad state is cleared at content end
        if (this.isAd) {
            this.isAd = false;
            this.onAdChange(false);
        }
        this.onPause();
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

    // Polling handler invoked by the 'timeupdate' event to track ads and timing
    handleTimeUpdate() {
        if (!this.video) return;
        const nowIsAd = this.isAdPlayingNow();
        if (nowIsAd !== this.isAd) {
            this.isAd = nowIsAd;
            this.onAdChange(nowIsAd);
        }
        // If ads just finished and we are enforcing paused, ensure content is paused
        if (!nowIsAd && this.desiredState === "paused") {
            if (!this.video.paused) this.video.pause();
        }
        // If room is starting and ads ended, request play once to kick off playback
        if (!nowIsAd && this.desiredState === "playing" && this.video.paused) {
            // Allow a short window for play() to succeed
            this.allowPlayUntilMs = performance.now() + 1200;
            this.video.play();
            setTimeout(() => {
                this.allowPlayUntilMs = 0;
            }, 1300);
        }
        this.onTimeUpdate(this.video.currentTime || 0, nowIsAd);
    }
}
