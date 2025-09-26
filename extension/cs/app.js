console.log("cs/app.js loaded");

import { ShareTubeQueueItem, PresentUser } from "./components.js";
import {
	decodeJwt,
	findOnPageYouTubeMeta,
	fetchMetadataFromBackend,
	extractUrlsFromDataTransfer,
	isYouTubeUrl,
	copyWatchroomUrl,
	extractVideoId
} from "./utils.js";
import { ensureSocket } from "./socket.js";
import { logger } from "./logger.js";
import YouTubePlayerObserver from "./player.js";
import AdOverlayManager from "./adOverlay.js";
import { EmitThrottler, buildSignature } from "./socketUtil.js";

const { html, LiveVar, LiveList } = zyX;

export default class ShareTubeApp {
	constructor() {
		this.avatarUrl = new LiveVar("");
		this.queueVisible = new LiveVar(false);
		this.queue = new LiveList([]);
		this.roomCode = new LiveVar("");
		this.presence = new LiveList([]);
		this.presentUsersById = new Map();
		this.currentPresenceIds = [];
		this.roomState = new LiveVar("idle");
		this.playback = { duration: 0, progress: 0, playing_since: 0, lastTs: 0 };
		this.justJoinedCode = null;
		this.storageListener = null;
		this.player = null;
		this.adPlaying = new LiveVar(false);
		this.voteMenuVisible = new LiveVar(false);
		// Ad participants tracking (used by overlay + enforcement)
		this.adUserIds = new Set(); // user ids currently known to be in ads (approximate)
		// Dedicated overlay manager (encapsulates DOM and placement logic)
		this.adOverlayManager = null;
		this.userId = null;
		this.localSeekAuthorityUntil = 0;
		this.hasPlaybackSync = false;
		this.ignorePersistUntil = 0;
		// Throttlers for noisy emits
		this.playerStatusThrottler = new EmitThrottler(900);
		this.persistThrottler = new EmitThrottler(700);

		html`
			<div id="sharetube_main">
			<div id="sharetube_queue" style=${this.queueVisible.interp(v => v ? "" : "display:none")}>
			<div class="queue-header">
			<span class="queue-title">Queue (<span id="sharetube_queue_count">${this.queue.interp(v => v.length)}</span>)</span>
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
			<div class="queue-list" id="sharetube_queue_list" zyx-live-list=${{ list: this.queue }}></div>
			<div class="queue-footer">
			</div>
			</div>
			<div id="sharetube_pill">
					<img alt="Profile" src=${this.avatarUrl.interp(v => v || "")} />
					<span zyx-click=${() => console.log("app state", this)}>ShareTube</span>
					<div class="room_presence">
						<div class="presence" zyx-if=${[this.presence, v => v.length > 0]} zyx-live-list=${{ list: this.presence }}></div>
						<button class="rounded_btn" title="Start or copy Watchroom link" zyx-click=${(z) => { z.e.stopPropagation(); this.handlePlusButton(); }}>
							+
						</button>
					</div>
					<button class="rounded_btn" zyx-if=${[this.queue, (v) => v.length > 0]} zyx-click=${() => this.toggleQueueVisibility()}>
						${this.queue.interp(v => v.length)} queued
					<button class="rounded_btn" title="Play/Pause" this="control_button" zyx-click=${(z) => { z.e.stopPropagation(); this.onControlButtonClicked(); }}>
						Play
					</button>
					</button>
				</div>
			</div>
		`.bind(this);
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
				if (this.socket && code) {
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
		this.tryJoinFromUrlHash();
		this.initPlayerObserver();
		this.initAdOverlay();
		// Ensure control button label matches initial state
		try { this.updateControlButtonLabel(); } catch {}
		this.ignorePersistUntil = Date.now() + 2500;
	}

	toggleQueueVisibility() {
		const now = !this.queueVisible.get();
		this.queueVisible.set(now);
	}

	toggleVoteMenu() {
		this.voteMenuVisible.set(!this.voteMenuVisible.get());
	}

	async startSkipVote() {
		try {
			const code = this.roomCode.get();
			if (!code) return;
			const sock = await ensureSocket(this);
			if (!sock) return;
			sock.emit('vote_skip', { code });
			// If no ack within 2s, retry once
			let handled = false;
			this.onVoteSkipResult = (res) => { handled = true; };
			setTimeout(() => {
				try {
					if (!handled) sock.emit('vote_skip', { code });
				} catch { }
			}, 2000);
			this.voteMenuVisible.set(false);
		} catch { }
	}

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
				ytUrls.forEach(u => this.enqueueWithMetadata(u));
				this.queueVisible.set(true);
				console.log("enqueued", this.queue, "with", ytUrls);
			}
		};
		this.sharetube_main.addEventListener("dragenter", onEnter);
		this.sharetube_main.addEventListener("dragover", onOver);
		this.sharetube_main.addEventListener("dragleave", onLeave);
		this.sharetube_main.addEventListener("drop", onDrop);
	}

	enqueueWithMetadata(url) {
		const pageMeta = findOnPageYouTubeMeta(url);
		const item = new ShareTubeQueueItem(url, pageMeta?.title || "", pageMeta?.thumbnail_url || "");
		this.queue.push(item);
		const code = this.roomCode.get();
		// Always persist to backend: if not in a room, it stores into the user's personal queue
		this.sendQueueAdd(code || null, { url });
		if (!pageMeta) {
			fetchMetadataFromBackend(url).then(meta => {
				if (meta) {
					item.title.set(meta.title || "");
					item.thumbnail_url.set(meta.thumbnail_url || "");
				}
			}).catch(() => { });
		}
	}

	clearQueue() {
		this.queue.clear();
	}

	async handlePlusButton() {
		const code = this.roomCode.get();
		if (code) {
			copyWatchroomUrl(code);
			return;
		}
		const sock = await ensureSocket(this);
		if (!sock) {
			console.warn("No socket/auth; cannot create room");
			return;
		}
		sock.emit("room_create", {});
	}

	onRoomCreateResult(res) {
		if (!res || !res.ok) {
			console.warn("room_create failed", res);
			return;
		}
		const code = res.code;
		this.roomCode.set(code || "");
		this.justJoinedCode = code || null;
		copyWatchroomUrl(code);
		// Ensure the room has the queue the user already started.
		// If a personal queue exists, server adoption keeps it.
		// If not (e.g., user queued items before signing in), push local queue now.
		// Server adopts existing personal queue; nothing else to send here
	}

	onRoomJoinResult(res) {
		if (!res || !res.ok) {
			console.warn("room_join failed", res);
			return;
		}
		const code = res.code;
		this.roomCode.set(code || "");
		this.justJoinedCode = code || null;
	}

	onRoomPresence(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const members = Array.isArray(payload.members) ? payload.members : [];
			const pillMembers = members.slice(0, 6);
			const incomingIds = new Set(members.map(m => m && m.id != null ? Number(m.id) : null).filter(v => v != null));

			// Update the full map for ALL members (not just first 6)
			for (const m of members) {
				if (!m || m.id == null) continue;
				let comp = this.presentUsersById.get(m.id);
				if (!comp) {
					comp = new PresentUser(m);
					this.presentUsersById.set(m.id, comp);
				} else {
					comp.name.set(m.name || "");
					comp.picture.set(m.picture || "");
				}
			}

			// Maintain the pill display with up to first 6, but do not delete from map
			for (let i = 0; i < pillMembers.length; i++) {
				const m = pillMembers[i];
				if (!m || m.id == null) continue;
				const comp = this.presentUsersById.get(m.id);
				const curIdx = this.currentPresenceIds.indexOf(m.id);
				if (curIdx === -1) {
					this.presence.splice(i, 0, comp);
					this.currentPresenceIds.splice(i, 0, m.id);
				} else if (curIdx !== i) {
					const removed = this.presence.splice(curIdx, 1);
					this.currentPresenceIds.splice(curIdx, 1);
					this.presence.splice(i, 0, removed && removed[0] ? removed[0] : comp);
					this.currentPresenceIds.splice(i, 0, m.id);
				}
			}

			// Trim pill display to match up to 6 entries without deleting from map
			while (this.currentPresenceIds.length > pillMembers.length) {
				const lastIdx = this.currentPresenceIds.length - 1;
				this.presence.splice(lastIdx, 1);
				this.currentPresenceIds.splice(lastIdx, 1);
			}

			// Remove users that left the room entirely from the map and ad set
			for (const [uid] of Array.from(this.presentUsersById.entries())) {
				if (!incomingIds.has(Number(uid))) {
					this.presentUsersById.delete(uid);
					try { this.adUserIds.delete(Number(uid)); } catch (e) { logger.debug("adUserIds delete failed", e); }
				}
			}
			if (this.justJoinedCode && this.justJoinedCode === payload.code) {
				try {
					console.log("Connected to room", payload.code, "with members:", members);
				} catch (e) { logger.debug("presence log failed", e); }
				this.justJoinedCode = null;
			}
			// Refresh overlay avatars/visibility via manager
			try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch {}
		} catch (e) { logger.debug("onRoomPresence failed", e); }
	}

	onQueueSnapshot(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const items = Array.isArray(payload.items) ? payload.items : [];
			// If server provided timing on first item, update local playback baseline
			if (items.length > 0) {
				const first = items[0] || {};
				const dur = Number(first.duration || 0);
				const prog = Number(first.progress || 0);
				const ps = Number(first.playing_since || 0);
				const changed = (dur !== this.playback.duration) || (prog !== this.playback.progress) || (ps !== this.playback.playing_since);
				if (changed) {
					this.playback = { duration: dur, progress: prog, playing_since: ps, lastTs: Date.now() };
					this.seekAccordingToServer("queue_snapshot");
				}
			}
			while (this.queue.length > items.length) {
				this.queue.splice(this.queue.length - 1, 1);
			}
			for (let i = 0; i < items.length; i++) {
				const it = items[i];
				if (i < this.queue.length) {
					const comp = this.queue[i];
					comp.server_id = it.id != null ? it.id : comp.server_id;
					if (comp.url !== it.url) comp.url = it.url || comp.url;
					if (comp.title && comp.title.set) comp.title.set(it.title || "");
					if (comp.thumbnail_url && comp.thumbnail_url.set) comp.thumbnail_url.set(it.thumbnail_url || "");
					if (comp.position && comp.position.set) comp.position.set(it.position != null ? it.position : null);
					comp.removeFromServer = () => this.removeQueueItem(comp);
				} else {
					const comp = new ShareTubeQueueItem(it.url || "", it.title || "", it.thumbnail_url || "");
					comp.server_id = it.id != null ? it.id : null;
					if (comp.position && comp.position.set) comp.position.set(it.position != null ? it.position : null);
					comp.removeFromServer = () => this.removeQueueItem(comp);
					this.queue.push(comp);
				}
			}
		} catch (e) { logger.debug("onQueueSnapshot failed", e); }
	}

	async removeQueueItem(comp) {
		try {
			const code = this.roomCode.get();
			if (!code || comp.server_id == null) return;
			const sock = await ensureSocket(this);
			if (!sock) return;
			sock.emit("queue_remove", { code, id: comp.server_id });
		} catch (e) { logger.debug("removeQueueItem failed", e); }
	}

	async togglePlayPause() {
		const code = this.roomCode.get();
		if (!code) return;
		const current = this.roomState.get();
		let next;
		if (current === 'idle') next = 'starting';
		else if (current === 'starting') next = 'idle';
		else if (current === 'playing') next = 'idle';
		else next = 'idle';
		const sock = await ensureSocket(this);
		if (!sock) return;
		// Persist progress immediately when transitioning to idle via UI
		if (next === 'idle') {
			try { this.persistProgress(); } catch { }
		}
		sock.emit("room_state_set", { code, state: next });
	}

	onControlButtonClicked() {
		try {
			const rs = this.roomState.get();
			const inAd = rs === 'playing_ad' || (this.adPlaying && this.adPlaying.get && this.adPlaying.get()) || (this.adUserIds && this.adUserIds.size > 0);
			if (inAd) {
				this.pauseRoomDuringAd();
				return;
			}
			this.togglePlayPause();
		} catch { }
	}

	async pauseRoomDuringAd() {
		try {
			const code = this.roomCode.get();
			if (!code) return;
			const sock = await ensureSocket(this);
			if (!sock) return;
			sock.emit('room_state_set', { code, state: 'idle' });
		} catch { }
	}

	onRoomStateChange(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const initial = this.roomState.get();
			let state;
			if (payload.state === 'playing_ad') state = 'playing_ad';
			else if (payload.state === 'playing') state = 'playing';
			else if (payload.state === 'starting') state = 'starting';
			else state = 'idle';
			this.roomState.set(state);
			this.updatePlaybackEnforcement("room_state_change");
			try { this.updateControlButtonLabel(); } catch {}
			if ((initial === 'idle' && state === 'starting') || (initial === 'starting' && state === 'playing')) {
				const first = this.queue[0];
				if (first && first.url) {
					try {
						const currentId = (() => { try { return extractVideoId(location.href); } catch { return ''; } })();
						const targetId = (() => { try { return extractVideoId(first.url); } catch { return ''; } })();
						if (currentId && targetId && currentId === targetId) {
							if (location.hash !== `#sharetube:${code}`) {
								location.hash = `sharetube:${code}`;
							}
							return;
						}
						const u = (() => { try { return new URL(first.url, location.href); } catch { return null; } })();
						if (u) {
							u.hash = `sharetube:${code}`;
							window.location.href = u.toString();
						} else {
							window.location.href = `${first.url}#sharetube:${code}`;
						}
					} catch { }
				}
			}
		} catch { }
	}

	initPlayerObserver() {
		try {
			this.player = new YouTubePlayerObserver({
				onTimeUpdate: (t, isAd) => { this.emitPlayerStatus(isAd, false); try { this.updateControlButtonLabel(); } catch {} },
				onAdChange: (isAd) => {
					this.adPlaying.set(!!isAd);
					try { console.log("Ad status changed:", isAd); } catch { }
					this.emitPlayerStatus(isAd, true);
					const code = this.roomCode.get();
					if (code) {
						const sock = this.socket;
						if (sock) {
							sock.emit(isAd ? 'room_ad_start' : 'room_ad_end', { code });
						}
					}
					// Update local overlay visibility immediately
					try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch {}
					try { this.updateControlButtonLabel(); } catch {}
					if (!isAd) {
						// Local ad ended while others may still be in ads or room might still be starting
						// Re-evaluate after local ad ends
						this.updatePlaybackEnforcement("local_ad_end");
						// Nudge seek to server baseline in case time drifted during ads
						this.seekAccordingToServer("local_ad_end");
						// Ensure UI updates fast
						try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch {}
					}
				},
					onPause: () => {
					// Respect throttle & dedupe in emitPlayerStatus
					this.emitPlayerStatus(this.adPlaying.get(), false);
					this.persistProgress();
						try { this.updateControlButtonLabel(); } catch {}
					// Map YouTube pause to room idle when not in ad
					try {
						const rs = this.roomState.get();
						const inAd = !!(this.adPlaying && this.adPlaying.get && this.adPlaying.get());
						const seeking = !!(this.player && this.player._seeking);
						if (!inAd && !seeking && rs !== 'idle') {
							const code = this.roomCode.get();
							const sock = this.socket;
							if (code && sock) sock.emit('room_state_set', { code, state: 'idle' });
						}
					} catch { }
				},
					onPlay: () => {
					// Respect throttle & dedupe in emitPlayerStatus
					this.emitPlayerStatus(this.adPlaying.get(), false);
						try { this.updateControlButtonLabel(); } catch {}
					// Map YouTube play to room playing when not in ad
					try {
						const rs = this.roomState.get();
						const inAd = !!(this.adPlaying && this.adPlaying.get && this.adPlaying.get());
						if (!inAd && rs !== 'playing') {
							const code = this.roomCode.get();
							const sock = this.socket;
							if (code && sock) sock.emit('room_state_set', { code, state: 'playing' });
						}
					} catch { }
				},
				onSeek: (seconds) => {
					// Send immediate seek to server on first seek gesture
					try {
						const code = this.roomCode.get();
						if (!code) return;
						const sock = this.socket;
						if (!sock) return;
						const isPlaying = !!(this.player && this.player.video && !this.player.video.paused);
						this.localSeekAuthorityUntil = Date.now() + 1200;
						sock.emit('room_seek', { code, progress_ms: Math.max(0, Math.floor((seconds || 0) * 1000)), play: isPlaying });
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
			const localInAd = !!(this.adPlaying && this.adPlaying.get && this.adPlaying.get());
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
					try { this.player.requestPause(); } catch {}
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
			try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch {}
			// Also keep the control button label synced with state/ads
			try { this.updateControlButtonLabel(); } catch {}
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
		} catch {}
	}

	// Compute whether content should be playing based on room state and ad participation
	shouldPlayContent(roomState, localInAd, anyoneInAds) {
		try {
			// Only play content when room is in 'playing' and neither local nor remote ads are active
			return (roomState === 'playing') && !localInAd && !anyoneInAds;
		} catch { return false; }
	}

	onRoomAdPause(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			// Track users known to be in ads and show overlay FIRST
			try {
				const uid = payload && payload.by_user_id;
				if (uid != null) this.adUserIds.add(Number(uid));
			} catch { }
			try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch {}
			// Then enforce paused locally (won't pause ads due to observer guard)
			this.updatePlaybackEnforcement("room_ad_pause");
		} catch (e) { logger.debug("onRoomAdPause failed", e); }
	}

	onRoomAdResume(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			// If room state is playing, resume playback
			this.updatePlaybackEnforcement("room_ad_resume");
			// Also immediately seek according to the server baseline to avoid accidental resets
			this.seekAccordingToServer("room_ad_resume");
			// Clear ad overlay tracking and fade out overlay
			this.adUserIds.clear();
			try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch {}
		} catch (e) { logger.debug("onRoomAdResume failed", e); }
	}

	onRoomAdStatus(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const ids = Array.isArray(payload.active_user_ids) ? payload.active_user_ids : [];
			this.adUserIds = new Set(ids.map((x) => Number(x)));
			try { if (this.adOverlayManager) this.adOverlayManager.notifyStateChanged(); } catch {}
			this.updatePlaybackEnforcement("room_ad_status");
		} catch (e) { logger.debug("onRoomAdStatus failed", e); }
	}

	emitPlayerStatus(isAdNow, forceImmediate) {
			try {
				const sock = this.socket;
				if (!sock) return;
				const code = this.roomCode.get();
				if (!code) return;
				const now = Date.now();
				// Report actual player state regardless of room state
				let state = 'idle';
				if (this.player && this.player.video) state = this.player.video.paused ? 'paused' : 'playing';
				let current_ms = 0, duration_ms = 0;
				try {
					if (this.player && this.player.video) {
						current_ms = Math.max(0, Math.floor((this.player.video.currentTime || 0) * 1000));
						duration_ms = Math.max(0, Math.floor((this.player.video.duration || 0) * 1000));
					}
				} catch (e) { logger.debug('read player time failed', e); }
				const payload = { code, state, is_ad: !!isAdNow, ts: now, current_ms, duration_ms };
				const signature = buildSignature(payload, ['state', 'is_ad', 'current_ms']);
				if (!forceImmediate && !this.playerStatusThrottler.allow(now, signature)) return;
				sock.emit('player_status', payload);
			} catch (e) { logger.debug('emitPlayerStatus failed', e); }
	}

	persistProgress() {
			try {
				const code = this.roomCode.get();
				if (!code) return;
				const sock = this.socket;
				if (!sock) return;
				let current_ms = 0, duration_ms = 0;
				try {
					if (this.player && this.player.video) {
						current_ms = Math.max(0, Math.floor((this.player.video.currentTime || 0) * 1000));
						duration_ms = Math.max(0, Math.floor((this.player.video.duration || 0) * 1000));
					}
				} catch (e) { logger.debug('persistProgress read time failed', e); }
				const rs = this.roomState.get();
				const inAd = !!(this.adPlaying && this.adPlaying.get && this.adPlaying.get());
				if (inAd || rs === 'starting') return;
				if (current_ms < 1000) return;
				if (duration_ms > 0 && current_ms > duration_ms) current_ms = duration_ms;
				const now = Date.now();
				const signature = String(current_ms);
				if (!this.persistThrottler.allow(now, signature)) return;
				sock.emit('room_seek', { code, progress_ms: current_ms, play: false });
			} catch (e) { logger.debug('persistProgress failed', e); }
	}

	async seekTo(ms, play) {
		try {
			const code = this.roomCode.get();
			if (!code) return;
			const sock = await ensureSocket(this);
			if (!sock) return;
			sock.emit('room_seek', { code, progress_ms: Math.max(0, Math.floor(ms || 0)), play: !!play });
		} catch (e) { logger.debug("seekTo failed", e); }
	}

	async sendQueueAdd(code, item) {
		try {
			const sock = await ensureSocket(this);
			if (!sock) return;
			const payload = item && item.id ? { id: item.id } : { url: item && item.url };
			sock.emit("queue_add", { code, item: payload });
		} catch (e) { logger.debug("sendQueueAdd failed", e); }
	}

	async tryJoinFromUrlHash() {
		try {
			const m = (location.hash || '').match(/^#sharetube:([a-f0-9]{32})$/i);
			if (!m) return;
			const code = m[1];
			const sock = await ensureSocket(this);
			if (!sock) return;
			sock.emit("room_join", { code });
			this.roomCode.set(code);
			this.justJoinedCode = code;
		} catch (e) { logger.debug("tryJoinFromUrlHash failed", e); }
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




