console.log("cs/player.js loaded");

export default class YouTubePlayerObserver {
	constructor(opts = {}) {
		this.desiredState = "paused"; // 'paused' | 'playing'
		this.video = null;
		this.originalPlay = null;
		this.boundHandlers = new Map();
		this.scanTimer = null;
		this.allowPlayUntilMs = 0;
		this.onTimeUpdate = typeof opts.onTimeUpdate === 'function' ? opts.onTimeUpdate : null;
		this.onAdChange = typeof opts.onAdChange === 'function' ? opts.onAdChange : null;
		this.onPause = typeof opts.onPause === 'function' ? opts.onPause : null;
		this.onPlay = typeof opts.onPlay === 'function' ? opts.onPlay : null;
		this.isAd = false;
	}

	start() {
		if (this.scanTimer) return;
		this.scanTimer = setInterval(() => this.ensureBoundToActiveVideo(), 500);
		// Attempt immediate bind
		this.ensureBoundToActiveVideo();
	}

	stop() {
		if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null; }
		this.unbindFromVideo();
	}

	setDesiredState(state) {
		const s = (state === 'playing') ? 'playing' : 'paused';
		this.desiredState = s;
		if (this.video) {
			if (s === 'paused') {
				try { this.video.pause(); } catch { }
			} else if (s === 'playing') {
				// If we attach to a new video while desired state is playing, request play
				if (this.video.paused) this.requestPlay();
			}
		}
	}

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

	requestPause() {
		if (!this.video) return;
		try { this.video.pause(); } catch { }
	}

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

	isElementVisible(el) {
		try {
			const rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
		} catch { return false; }
	}

	bindToVideo(video) {
		this.video = video;
		this.hookPlayMethod(video);
		this.addEvent(video, 'play', () => { this.onMaybeExternalPlay(); this.handlePlayEvent(); });
		this.addEvent(video, 'playing', () => { this.onMaybeExternalPlay(); this.handlePlayEvent(); });
		this.addEvent(video, 'pause', () => this.handlePauseEvent());
		this.addEvent(video, 'timeupdate', () => this.handleTimeUpdate());
		this.addEvent(video, 'loadeddata', () => this.onLoadedData());
		// Enforce current state right away
		if (this.desiredState === 'paused') {
			try { video.pause(); } catch { }
		} else if (this.desiredState === 'playing') {
			this.requestPlay();
		}
	}

	unhookPlayMethod(video) {
		try {
			if (video && this.originalPlay && video.play !== this.originalPlay) {
				video.play = this.originalPlay;
			}
		} catch { }
		this.originalPlay = null;
	}

	hookPlayMethod(video) {
		try {
			if (!this.originalPlay) this.originalPlay = video.play.bind(video);
			const self = this;
			video.play = function(...args) {
				if (!self.isPlayAllowedNow()) {
					// Block external play attempts when paused is enforced
					setTimeout(() => { try { video.pause(); } catch { } }, 0);
					return Promise.resolve();
				}
				return self.originalPlay.apply(this, args);
			};
		} catch { }
	}

	addEvent(target, type, handler) {
		const bound = handler.bind(this);
		target.addEventListener(type, bound, true);
		this.boundHandlers.set(`${type}:${this.boundHandlers.size}`, { target, type, bound });
	}

	removeAllEvents() {
		for (const [, h] of this.boundHandlers) {
			try { h.target.removeEventListener(h.type, h.bound, true); } catch { }
		}
		this.boundHandlers.clear();
	}

	unbindFromVideo() {
		if (!this.video) return;
		this.unhookPlayMethod(this.video);
		this.removeAllEvents();
		this.video = null;
	}

	isPlayAllowedNow() {
		if (this.desiredState === 'playing') return true;
		return performance.now() < this.allowPlayUntilMs;
	}

	onMaybeExternalPlay() {
		if (!this.video) return;
		if (!this.isPlayAllowedNow()) {
			try { this.video.pause(); } catch { }
		}
	}

	handlePauseEvent() {
		if (this.onPause) {
			try { this.onPause(); } catch { }
		}
	}

	handlePlayEvent() {
		if (this.onPlay) {
			try { this.onPlay(); } catch { }
		}
	}

	onLoadedData() {
		// Sync state after source changes
		if (!this.video) return;
		if (this.desiredState === 'paused') {
			try { this.video.pause(); } catch { }
		} else if (this.desiredState === 'playing') {
			this.requestPlay();
		}
	}

	isAdPlayingNow() {
		if (!this.video) return false;
		try {
			const container = this.video.closest('.html5-video-player') || document.querySelector('.html5-video-player');
			if (container && container.classList.contains('ad-showing')) return true;
			if (container && (container.querySelector('.ytp-ad-player-overlay, .ytp-ad-text, .ytp-ad-skip-button, .ytp-ad-duration-remaining') != null)) return true;
			return false;
		} catch { return false; }
	}

	handleTimeUpdate() {
		if (!this.video) return;
		const nowIsAd = this.isAdPlayingNow();
		if (nowIsAd !== this.isAd) {
			this.isAd = nowIsAd;
			if (this.onAdChange) {
				try { this.onAdChange(nowIsAd); } catch { }
			}
		}
		if (this.onTimeUpdate) {
			try { this.onTimeUpdate(this.video.currentTime || 0, nowIsAd); } catch { }
		}
	}
}
