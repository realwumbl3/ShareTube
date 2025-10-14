// Log module load for diagnostics
console.log("cs/player.js loaded");

// Lightweight observer/controller around the active <video> element on YouTube
export default class YoutubePlayerManager {
	constructor(opts = {}) {
        // Desired content state enforced by room logic: 'paused' | 'playing'
        this.desiredState = "paused"; // 'paused' | 'playing'
		this.video = null;
		this.originalPlay = null;
		this.boundHandlers = new Map();
		this.scanTimer = null;
		this.allowPlayUntilMs = 0;
        // Optional callbacks wired by the app layer
        this.onTimeUpdate = typeof opts.onTimeUpdate === 'function' ? opts.onTimeUpdate : null;
        this.onAdChange = typeof opts.onAdChange === 'function' ? opts.onAdChange : null;
        this.onPause = typeof opts.onPause === 'function' ? opts.onPause : null;
        this.onPlay = typeof opts.onPlay === 'function' ? opts.onPlay : null;
        this.onSeek = typeof opts.onSeek === 'function' ? opts.onSeek : null;
		this.isAd = false;
		this._seeking = false;
		this._lastSeekNotifiedAtSec = -1;
		this.suppressSeekUntilMs = 0;
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
		if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null; }
		this.unbindFromVideo();
	}

    // Update desired state and try to enforce it on the bound video
    setDesiredState(state) {
		const s = (state === 'playing') ? 'playing' : 'paused';
		this.desiredState = s;
		if (this.video) {
			if (s === 'paused') {
				// Do not pause if an ad is currently playing
				if (!this.isAdPlayingNow()) {
			try { this.video.pause(); } catch (e) { try { console.debug("[ShareTube] requestPause: pause failed", e); } catch (_) {} }
				}
			} else if (s === 'playing') {
				// If we attach to a new video while desired state is playing, request play
				if (this.video.paused) this.requestPlay();
			}
		}
	}

    // Request playback with a short allow window to bypass some autoplay guards
    requestPlay() {
		if (!this.video) return;
		this.allowPlayUntilMs = performance.now() + 1500;
		try {
			if (this.originalPlay) {
				this.originalPlay.call(this.video);
			} else {
				this.video.play();
			}
		} catch { }
		// Clear the allowance soon after
		setTimeout(() => { this.allowPlayUntilMs = 0; }, 1600);
	}

    // Request a pause on the bound video
    requestPause() {
		if (!this.video) return;
		try { this.video.pause(); } catch { }
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
		let vid = document.querySelector('video.html5-main-video');
		if (vid && this.isElementVisible(vid)) return vid;
		// Shorts/reels
		const shorts = document.querySelector('ytd-reel-video-renderer video');
		if (shorts && this.isElementVisible(shorts)) return shorts;
		// Fallback to first visible video
		const all = Array.from(document.querySelectorAll('video'));
		for (const v of all) {
			if (this.isElementVisible(v)) return v;
		}
		return null;
	}

    // Minimal visibility check for candidate video elements
    isElementVisible(el) {
		try {
			const rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
		} catch { return false; }
	}

    // Hook into a specific <video>: intercept play(), add event listeners, enforce state
    bindToVideo(video) {
		this.video = video;
		this.hookPlayMethod(video);
		this.addEvent(video, 'play', () => { this.onMaybeExternalPlay(); this.handlePlayEvent(); });
		this.addEvent(video, 'playing', () => { this.onMaybeExternalPlay(); this.handlePlayEvent(); });
		this.addEvent(video, 'pause', () => this.handlePauseEvent());
		this.addEvent(video, 'timeupdate', () => this.handleTimeUpdate());
		this.addEvent(video, 'loadeddata', () => this.onLoadedData());
		this.addEvent(video, 'seeking', () => this.onSeeking());
		this.addEvent(video, 'seeked', () => this.onSeeked());
		this.addEvent(video, 'ended', () => this.onEnded());
		// Enforce current state right away
		if (this.desiredState === 'paused') {
			if (!this.isAdPlayingNow()) {
				try { video.pause(); } catch { }
			}
		} else if (this.desiredState === 'playing') {
			this.requestPlay();
		}
	}

    // Restore original play() if it was wrapped
    unhookPlayMethod(video) {
		try {
			if (video && this.originalPlay && video.play !== this.originalPlay) {
				video.play = this.originalPlay;
			}
		} catch { }
		this.originalPlay = null;
	}

    // Wrap HTMLMediaElement.play() to enforce pauses when room requires it
    hookPlayMethod(video) {
		try {
			if (!this.originalPlay) this.originalPlay = video.play.bind(video);
			const self = this;
			video.play = function(...args) {
				// Allow play when an ad is showing
				if (!self.isPlayAllowedNow() && !self.isAdPlayingNow()) {
					// Block external play attempts when paused is enforced
					setTimeout(() => { try { video.pause(); } catch (e) { try { console.debug("[ShareTube] hookPlayMethod pause failed", e); } catch (_) {} } }, 0);
					return Promise.resolve();
				}
				return self.originalPlay.apply(this, args);
			};
		} catch { }
	}

    // Helper to add an event listener and remember it for cleanup
    addEvent(target, type, handler) {
		const bound = handler.bind(this);
		target.addEventListener(type, bound, true);
		this.boundHandlers.set(`${type}:${this.boundHandlers.size}`, { target, type, bound });
	}

    // Temporarily suppress emitting seek callbacks after programmatic seeks
    suppressSeekEmit(ms = 600) {
		try { this.suppressSeekUntilMs = performance.now() + Math.max(0, Number(ms || 0)); } catch { this.suppressSeekUntilMs = Date.now() + Math.max(0, Number(ms || 0)); }
	}

    // Whether seek emissions are still suppressed
    isSeekSuppressed() {
		try { return performance.now() < this.suppressSeekUntilMs; } catch { return Date.now() < this.suppressSeekUntilMs; }
	}

    // Remove all event listeners added by this instance
    removeAllEvents() {
		for (const [, h] of this.boundHandlers) {
			try { h.target.removeEventListener(h.type, h.bound, true); } catch (e) { try { console.debug("[ShareTube] removeAllEvents failed", e); } catch (_) {} }
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
		if (this.desiredState === 'playing') return true;
		return performance.now() < this.allowPlayUntilMs;
	}

	// Expose a minimal player state string for external readers/tests
	getPlayerState() {
		try {
			if (!this.video) return 'idle';
			return this.video.paused ? 'paused' : 'playing';
		} catch { return 'idle'; }
	}

    // Guard against external play when room desires 'paused', except during ads
    onMaybeExternalPlay() {
		if (!this.video) return;
		// Allow ad playback even if desired state is paused
		if (!this.isPlayAllowedNow() && !this.isAdPlayingNow()) {
			try { this.video.pause(); } catch { }
		}
	}

    // Forward pause events to app callback
    handlePauseEvent() {
		if (this.onPause) {
			try { this.onPause(); } catch { }
		}
	}

    // Forward play/playing events to app callback
    handlePlayEvent() {
		if (this.onPlay) {
			try { this.onPlay(); } catch { }
		}
	}

    // Enforce desired state after a new source is loaded
    onLoadedData() {
		// Sync state after source changes
		if (!this.video) return;
		if (this.desiredState === 'paused') {
			if (!this.isAdPlayingNow()) {
				try { this.video.pause(); } catch { }
			}
		} else if (this.desiredState === 'playing') {
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
			} catch { }
		}
	}

    // After seek completes, emit if the position changed significantly
    onSeeked() {
		if (!this.video) return;
		const sec = Number(this.video.currentTime || 0);
		if (this.isSeekSuppressed()) { this._seeking = false; return; }
		if (this.onSeek && Math.abs(sec - this._lastSeekNotifiedAtSec) > 0.2) {
			try { this.onSeek(sec); } catch { }
			this._lastSeekNotifiedAtSec = sec;
		}
		this._seeking = false;
	}

    // Reset ad state on content end and forward a pause notification
    onEnded() {
		// Ensure ad state is cleared at content end
		if (this.isAd) {
			this.isAd = false;
			if (this.onAdChange) { try { this.onAdChange(false); } catch { } }
		}
		if (this.onPause) { try { this.onPause(); } catch { } }
	}

    // Heuristics to detect whether an ad is playing in the active player UI
    isAdPlayingNow() {
		if (!this.video) return false;
		try {
			const container = this.video.closest('.html5-video-player') || document.querySelector('.html5-video-player');
			// If content essentially ended, do not report ad
			try {
				const dur = Number(this.video.duration || 0);
				const cur = Number(this.video.currentTime || 0);
				if (dur > 5 && cur > 0 && cur / dur > 0.985) return false;
			} catch {}
			if (container && container.classList.contains('ad-showing')) return true;
			// Require a strong ad indicator to avoid false positives
			if (container && (container.querySelector('.ytp-ad-duration-remaining, .ytp-ad-player-overlay, .ytp-ad-skip-button, .ytp-ad-skip-button-modern') != null)) return true;
			return false;
		} catch { return false; }
	}

    // Polling handler invoked by the 'timeupdate' event to track ads and timing
    handleTimeUpdate() {
		if (!this.video) return;
		const nowIsAd = this.isAdPlayingNow();
		if (nowIsAd !== this.isAd) {
			this.isAd = nowIsAd;
			if (this.onAdChange) {
				try { this.onAdChange(nowIsAd); } catch { }
			}
		}
		// If ads just finished and we are enforcing paused, ensure content is paused
		if (!nowIsAd && this.desiredState === 'paused') {
			if (!this.video.paused) {
				try { this.video.pause(); } catch { }
			}
		}
		// If room is starting and ads ended, request play once to kick off playback
		if (!nowIsAd && this.desiredState === 'playing' && this.video.paused) {
			// Allow a short window for play() to succeed
			this.allowPlayUntilMs = performance.now() + 1200;
			try { this.video.play(); } catch { }
			setTimeout(() => { this.allowPlayUntilMs = 0; }, 1300);
		}
		if (this.onTimeUpdate) {
			try { this.onTimeUpdate(this.video.currentTime || 0, nowIsAd); } catch { }
		}
	}
}
