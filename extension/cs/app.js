console.log("cs/app.js loaded");

// components are now used via managers only
import {
	decodeJwt,
	extractUrlsFromDataTransfer,
	isYouTubeUrl
} from "./utils.js";
import SocketManager from "./managers/SocketManager.js";
import { logger } from "./logger.js";
import YoutubePlayerManager from "./managers/PlayerManager.js";
import AdOverlayManager from "./managers/AdOverlayManager.js";
import { EmitThrottler, buildSignature } from "./socketUtil.js";
import QueueManager from "./managers/QueueManager.js";
import RoomManager from "./managers/RoomManager.js";
import PresenceManager from "./managers/PresenceManager.js";
import VoteManager from "./managers/VoteManager.js";

const { html, LiveVar, LiveList } = zyX;

export default class ShareTubeApp {
	constructor() {
		this.avatarUrl = new LiveVar("");
		this.queueVisible = new LiveVar(false);

		this.socketManager = new SocketManager(this);

		this.roomCode = new LiveVar("");

		this.presentUsersById = new Map();
		this.currentPresenceIds = [];
		this.roomState = new LiveVar("idle");
		this.playback = { duration: 0, progress: 0, playing_since: 0, lastTs: 0 };
		this.justJoinedCode = null;
		this.storageListener = null;

		/** @type {YoutubePlayerManager} */
		this.player = null;
		this.adPlaying = new LiveVar(false);
		this.voteMenuVisible = new LiveVar(false);

		/** @type {Set<number>} */
		this.adUserIds = new Set(); // user ids currently known to be in ads (approximate)

		/** @type {AdOverlayManager} */
		this.adOverlayManager = null;
		this.userId = null;
		this.localSeekAuthorityUntil = 0;
		this.hasPlaybackSync = false;
		this.ignorePersistUntil = 0;

		// Managers
		this.queueManager = new QueueManager(this);
		this.roomManager = new RoomManager(this);
		this.presenceManager = new PresenceManager(this);
		this.voteManager = new VoteManager(this);

		// Throttlers for noisy emits
		this.playerStatusThrottler = new EmitThrottler(900);
		this.persistThrottler = new EmitThrottler(700);


		html`
			<div id="sharetube_main">
			<div id="sharetube_queue" style=${this.queueVisible.interp(v => v ? "" : "display:none")}>
			<div class="queue-header">
			<span class="queue-title">Queue (<span id="sharetube_queue_count">${this.queueManager.queue.interp(v => v.length)}</span>)</span>
			<button class="rounded_btn" zyx-click=${() => this.toggleQueueVisibility()}>
			${this.queueVisible.interp(v => v ? "Hide" : "Show")}
			</button>
			<div class="vote-menu-wrap">
			<button class="rounded_btn" title="Vote" zyx-click=${(z) => { z.e.stopPropagation(); this.toggleVoteMenu(); }}>Vote</button>
			<div class="vote-menu" zyx-if=${[this.voteMenuVisible, v => v]}>
			<button class="rounded_btn" zyx-click=${(z) => { z.e.stopPropagation(); this.startSkipVote(); }}>Skip current video</button>
			</div>
			</div>
			</div>
			<div class="queue-list" id="sharetube_queue_list" zyx-live-list=${{ list: this.queueManager.queue }}></div>
			<div class="queue-footer">
			</div>
			</div>
			<div id="sharetube_pill">
					<img alt="Profile" src=${this.avatarUrl.interp(v => v || "")} />
					<span id="sharetube_log_self_button" zyx-click=${() => console.log("app state", this)}>ShareTube</span>
					<div class="room_presence">
						<div class="presence" zyx-if=${[this.presenceManager.presence, v => v.length > 0]} zyx-live-list=${{ list: this.presenceManager.presence }}></div>
						<button class="rounded_btn" id="sharetube_plus_button" title="Start or copy Watchroom link" 
							zyx-click=${(z) => { z.e.stopPropagation(); this.roomManager.handlePlusButton(); }}
						>
							+
						</button>
					</div>
					<button class="rounded_btn" zyx-if=${[this.queueManager.queue, (v) => v.length > 0]} zyx-click=${() => this.toggleQueueVisibility()}>
						${this.queueManager.queue.interp(v => v.length)} queued
					<button class="rounded_btn" id="sharetube_control_button" title="Play/Pause" this="control_button" zyx-click=${(z) => { z.e.stopPropagation(); this.roomManager.onControlButtonClicked(); }}>
						Play
					</button>
					</button>
				</div>
			</div>
		`.bind(this);
	}

	logSelf() {
		console.log("ShareTubeApp", this);
	}

	async applyAvatarFromToken() {
		try {
			const res = await chrome.storage.local.get(["newapp_token"]);
			const token = res && res.newapp_token;
			if (!token) {
				this.avatarUrl.set("");
				this.userId = null;
				return;
			}
			const claims = decodeJwt(token);
			const picture = claims && claims.picture;
			this.avatarUrl.set(picture || "");
			try { this.userId = claims && (claims.sub != null ? Number(claims.sub) : null); } catch { this.userId = null; }
		} catch (e) { }
	}

	attachListeners() {
		this.storageListener = (changes, area) => {
			if (area === "local" && changes.newapp_token) {
				this.applyAvatarFromToken();
			}
		};
		chrome.storage.onChanged.addListener(this.storageListener);

		window.addEventListener("beforeunload", () => {
			try {
				const code = this.roomCode.get();
				if (this.socketManager.socket && code) {
					this.socket.emit("room_leave", { code });
				}
			} catch { }
		});
	}

	detachListeners() {
		if (this.storageListener) chrome.storage.onChanged.removeListener(this.storageListener);
	}

	start() {
		console.log("ShareTube Init");
		this.appendTo(document.body);
		this.applyAvatarFromToken();
		this.attachListeners();
		this.setupDragAndDrop();
		try { this.roomManager.tryJoinFromUrlHash(); } catch { }
		this.initPlayerObserver();
		this.initAdOverlay();
		// Ensure control button label matches initial state
		try { this.updateControlButtonLabel(); } catch { }
		// Compute initial join-sync popup visibility/content
		this.ignorePersistUntil = Date.now() + 2500;
		this.logSelf();
	}

	toggleQueueVisibility() {
		const now = !this.queueVisible.get();
		this.queueVisible.set(now);
	}

	toggleVoteMenu() {
		this.voteManager.toggleVoteMenu();
	}

	async startSkipVote() { return this.voteManager.startSkipVote(); }

	setupDragAndDrop() {
		const onEnter = (e) => { e.preventDefault(); e.stopPropagation(); this.sharetube_main.classList.add("dragover"); };
		const onOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; this.sharetube_main.classList.add("dragover"); };
		const onLeave = (e) => { e.preventDefault(); this.sharetube_main.classList.remove("dragover"); };
		const onDrop = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.sharetube_main.classList.remove("dragover");
			const urls = extractUrlsFromDataTransfer(e.dataTransfer);
			const ytUrls = urls.filter(isYouTubeUrl);
			if (ytUrls.length > 0) {
				ytUrls.forEach(u => this.queueManager.enqueueWithMetadata(u));
				this.queueVisible.set(true);
				console.log("enqueued", this.queueManager.queue, "with", ytUrls);
			}
		};
		this.sharetube_main.addEventListener("dragenter", onEnter);
		this.sharetube_main.addEventListener("dragover", onOver);
		this.sharetube_main.addEventListener("dragleave", onLeave);
		this.sharetube_main.addEventListener("drop", onDrop);
	}

	// Compatibility wrappers delegating to RoomManager (no duplicated logic)
	async tryJoinFromUrlHash() { return this.roomManager.tryJoinFromUrlHash(); }

	initPlayerObserver() {
		try {
			this.player = new YoutubePlayerManager({
				onTimeUpdate: (t, isAd) => { this.emitPlayerStatus(isAd, false); try { this.updateControlButtonLabel(); } catch { } },
				onAdChange: (isAd) => {
					this.adPlaying.set(!!isAd);
					try { console.log("Ad status changed:", isAd); } catch { }
					this.emitPlayerStatus(isAd, true);
					this._withSocket((sock, code) => { sock.emit(isAd ? 'room_ad_start' : 'room_ad_end', { code }); });
					// Update local overlay visibility immediately
					try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch { }
					try { this.updateControlButtonLabel(); } catch { }
					if (!isAd) {
						// Local ad ended while others may still be in ads or room might still be starting
						// Re-evaluate after local ad ends
						this.updatePlaybackEnforcement("local_ad_end");
						// Nudge seek to server baseline in case time drifted during ads
						this.seekAccordingToServer("local_ad_end");
						// Ensure UI updates fast
						try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch { }
					}
				},
				onPause: () => {
					// Respect throttle & dedupe in emitPlayerStatus
					this.emitPlayerStatus(this.adPlaying.get(), false);
					this.persistProgress();
					try { this.updateControlButtonLabel(); } catch { }
					// Map YouTube pause to room idle when not in ad
					try {
						const rs = this.roomState.get();
						const seeking = !!(this.player && this.player._seeking);
						if (!this._isInAd() && !seeking && rs !== 'idle') {
							this._withSocket((sock, code) => { sock.emit('room_state_set', { code, state: 'idle' }); });
						}
					} catch { }
				},
				onPlay: () => {
					// Respect throttle & dedupe in emitPlayerStatus
					this.emitPlayerStatus(this.adPlaying.get(), false);
					try { this.updateControlButtonLabel(); } catch { }
					// Map YouTube play to room playing when not in ad
					try {
						const rs = this.roomState.get();
						if (!this._isInAd() && rs !== 'playing') {
							this._withSocket((sock, code) => { sock.emit('room_state_set', { code, state: 'playing' }); });
						}
					} catch { }
				},
				onSeek: (seconds) => {
					// Send immediate seek to server on first seek gesture
					try {
						const isPlaying = !!(this.player && this.player.video && !this.player.video.paused);
						this.localSeekAuthorityUntil = Date.now() + 1200;
						this._withSocket((sock, code) => {
							sock.emit('room_seek', { code, progress_ms: Math.max(0, Math.floor((seconds || 0) * 1000)), play: isPlaying });
						});
						// Also update our local baseline so enforcement won't snap back
						const dur = Number(this.playback && this.playback.duration || 0);
						this.playback = { duration: dur, progress: Math.max(0, Math.floor((seconds || 0) * 1000)), playing_since: isPlaying ? Date.now() : 0, lastTs: Date.now() };
					} catch { }
				}
			});
			this.player.start();
			// Respect current room/ad status on init so we don't start playing while others are in ads
			this.updatePlaybackEnforcement("init");
		} catch { }
	}

	// Centralized pause/play enforcement based on room/ad status
	updatePlaybackEnforcement(reason) {
		try {
			// Read the current room state from reactive var
			const rs = this.roomState.get();
			// Determine if our local player is currently in an advertisement
			const localInAd = this._isInAd();
			// Determine if anyone in the room is in ads (based on room broadcast)
			const anyoneInAds = !!(this.adUserIds && this.adUserIds.size > 0);
			// Compute whether content should be actively playing under current conditions
			const shouldPlay = this.shouldPlayContent(rs, localInAd, anyoneInAds);
			// If we have an attached player controller, enforce the desired state
			if (this.player) {
				// Hint the observer about our target so it can smooth out transitions
				this.player.setDesiredState(shouldPlay ? 'playing' : 'paused');
				// If we should not play content and we are not in a local ad, request a pause
				if (!shouldPlay && !localInAd) {
					try { this.player.requestPause(); } catch { }
					// While the room is transitioning to a new video, clamp content to t=0 when server
					// baseline is effectively zero, to avoid accidental early starts.
					if (rs === 'starting' && this.player.video) {
						// Ask the server-derived baseline for the correct position
						const posMs = this.getServerSuggestedPositionMs();
						// Consider "near zero" if position <=1.5s, local stored progress <=1s, and not playing
						const nearZero = posMs <= 1500 && (Number(this.playback && this.playback.progress || 0) <= 1000) && (Number(this.playback && this.playback.playing_since || 0) <= 0);
						// If we drifted away from zero in this state, snap back to the start
						if (nearZero && this.player.video.currentTime > 0.05) {
							try { this.player.video.currentTime = 0; } catch (e) { logger.debug('set currentTime 0 failed', e); }
						}
					}
				} else if (shouldPlay) {
					// If we should be playing, request play (observer will avoid touching ads)
					try { this.player.requestPlay(); } catch (e) { logger.debug('requestPlay failed', e); }
				}
				// Emit immediate status so backend can observe readiness transitions precisely
				this.emitPlayerStatus(this.adPlaying.get(), true);
			} else if (!shouldPlay) {
				// Player not yet ready but we must be paused; re-check shortly to avoid race
				setTimeout(() => { try { this.updatePlaybackEnforcement('retry:' + String(reason || '')); } catch (e) { logger.debug('retry updatePlaybackEnforcement failed', e); } }, 300);
			}
			// Keep overlay visuals and counts in sync with the latest state
			try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch { }
			// Also keep the control button label synced with state/ads
			try { this.updateControlButtonLabel(); } catch { }
		} catch (e) { logger.debug('updatePlaybackEnforcement failed', e); }
	}

	// Update the control button text based on room and ad states
	updateControlButtonLabel() {
		try {
			const btn = this.control_button;
			if (!btn) return;
			const s = this.roomState.get();
			const inAd = s === 'playing_ad' || (this.adPlaying && this.adPlaying.get && this.adPlaying.get()) || (this.adUserIds && this.adUserIds.size > 0);
			btn.textContent = inAd ? 'Playing AD' : (s === 'playing' ? 'Pause' : 'Play');
		} catch { }
	}

	emitPlayerStatus(isAdNow, forceImmediate) {
		try {
			const now = Date.now();
			// Report actual player state regardless of room state
			let state = 'idle';
			if (this.player && this.player.video) state = this.player.video.paused ? 'paused' : 'playing';
			const { current_ms, duration_ms } = this._readVideoTimesMs();
			this._withSocket((sock, code) => {
				const payload = { code, state, is_ad: !!isAdNow, ts: now, current_ms, duration_ms };
				const signature = buildSignature(payload, ['state', 'is_ad', 'current_ms']);
				if (!forceImmediate && !this.playerStatusThrottler.allow(now, signature)) return;
				sock.emit('player_status', payload);
			});
		} catch (e) { logger.debug('emitPlayerStatus failed', e); }
	}

	persistProgress() {
		try {
			const rs = this.roomState.get();
			if (this._isInAd() || rs === 'starting') return;
			let { current_ms, duration_ms } = this._readVideoTimesMs();
			if (current_ms < 1000) return;
			if (duration_ms > 0 && current_ms > duration_ms) current_ms = duration_ms;
			const now = Date.now();
			const signature = String(current_ms);
			if (!this.persistThrottler.allow(now, signature)) return;
			this._withSocket((sock, code) => { sock.emit('room_seek', { code, progress_ms: current_ms, play: false }); });
		} catch (e) { logger.debug('persistProgress failed', e); }
	}

	async seekTo(ms, play) {
		try {
			this._withSocket((sock, code) => { sock.emit('room_seek', { code, progress_ms: Math.max(0, Math.floor(ms || 0)), play: !!play }); });
		} catch (e) { logger.debug("seekTo failed", e); }
	}

	async sendQueueAdd(code, item) {
		try {
			const payload = item && item.id ? { id: item.id } : { url: item && item.url };
			this._withSocket((sock) => { sock.emit("queue_add", { code, item: payload }); });
		} catch (e) { logger.debug("sendQueueAdd failed", e); }
	}

	// moved to RoomManager

	// ----------
	// Helper utilities
	// ----------

	_isInAd() { try { return !!(this.adPlaying && this.adPlaying.get && this.adPlaying.get()); } catch { return false; } }

	_readVideoTimesMs() {
		let current_ms = 0, duration_ms = 0;
		try {
			if (this.player && this.player.video) {
				current_ms = Math.max(0, Math.floor((this.player.video.currentTime || 0) * 1000));
				duration_ms = Math.max(0, Math.floor((this.player.video.duration || 0) * 1000));
			}
		} catch (e) { logger.debug('read player time failed', e); }
		return { current_ms, duration_ms };
	}
	_withSocket(fn, overrideCode) {
		try {
			const code = overrideCode || this.roomManager.roomCode.get();
			if (!code) return;
			const run = async () => {
				try {
					const sock = this.socketManager.socket || await this.socketManager.ensureSocket();
					if (!sock) return;
					fn(sock, code);
				} catch { }
			};
			run();
		} catch { }
	}

	// -----------------
	// Ad overlay UI (delegated to AdOverlayManager)
	// -----------------
	initAdOverlay() {
		try {
			// Lazily construct a manager with state getters that read from app state
			this.adOverlayManager = new AdOverlayManager({
				getPillElement: () => { try { return this.sharetube_pill; } catch { return null; } },
				getVideoElement: () => { try { return this.player && this.player.video; } catch { return null; } },
				getRoomState: () => { try { return this.roomState.get(); } catch { return 'idle'; } },
				getAdPlaying: () => { try { return !!(this.adPlaying && this.adPlaying.get && this.adPlaying.get()); } catch { return false; } },
				getAdUserIds: () => { try { return this.adUserIds; } catch { return new Set(); } },
				getPresentUsersById: () => { try { return this.presentUsersById; } catch { return new Map(); } },
			});
			this.adOverlayManager.start();
		} catch (e) { logger.debug("initAdOverlay failed", e); }
	}

	// Receive authoritative playback snapshot from server and seek accordingly
	onRoomPlayback(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const e = payload.entry || {};
			// Update room state immediately from payload to ensure correct elapsed calc
			try {
				const st = String(payload.state || '').toLowerCase();
				if (st === 'playing' || st === 'starting' || st === 'idle' || st === 'playing_ad') {
					this.roomState.set(st);
				}
			} catch { }
			const dur = Number(e.duration || 0);
			const prog = Number(e.progress || 0);
			const ps = Number(e.playing_since || 0);
			this.playback = { duration: dur, progress: prog, playing_since: ps, lastTs: Date.now() };
			this.seekAccordingToServer("room_playback");
			this.hasPlaybackSync = true;
		} catch (e) { logger.debug("onRoomPlayback failed", e); }
	}

	getServerSuggestedPositionMs() {
		const { duration, progress, playing_since } = this.playback || {};
		if (!duration && !progress && !playing_since) return 0;
		if (playing_since > 0) {
			const elapsed = Math.max(0, Date.now() - playing_since);
			return Math.min((progress || 0) + elapsed, duration || Infinity);
		}
		return progress || 0;
	}

	seekAccordingToServer(reason) {
		try {
			const posMs = this.getServerSuggestedPositionMs();
			const posSec = posMs / 1000;
			if (this.player && this.player.video) {
				const v = this.player.video;
				const diff = Math.abs((v.currentTime || 0) - posSec);
				if (isFinite(posSec) && diff > 0.25) {
					// Suppress seek callbacks caused by programmatic adjustments
					try { if (this.player.suppressSeekEmit) this.player.suppressSeekEmit(800); } catch { }
					try { v.currentTime = posSec; } catch (e) { logger.debug("seekAccordingToServer set currentTime failed", e); }
				}
			}
		} catch (e) { logger.debug("seekAccordingToServer failed", e); }
	}

	onRoomSeek(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const ms = Number(payload.progress_ms || 0);
			const play = !!payload.play;
			// If this client initiated a seek very recently, treat it as authoritative and ignore echoes
			if (Date.now() < (this.localSeekAuthorityUntil || 0)) {
				return;
			}
			// Update baseline immediately; let room_playback refresh confirm
			const dur = Number(this.playback && this.playback.duration || 0);
			this.playback = { duration: dur, progress: Math.max(0, ms), playing_since: play ? Date.now() : 0, lastTs: Date.now() };
			// Prevent feedback by suppressing seek events before applying
			try { if (this.player && this.player.suppressSeekEmit) this.player.suppressSeekEmit(800); } catch { }
			this.seekAccordingToServer("room_seek_event");
			this.updatePlaybackEnforcement("room_seek_event");
		} catch (e) { logger.debug("onRoomSeek failed", e); }
	}

}




