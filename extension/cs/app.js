console.log("cs/app.js loaded");

import { ShareTubeQueueItem, PresentUser } from "./components.js";
import {
	decodeJwt,
	findOnPageYouTubeMeta,
	fetchMetadataFromBackend,
	extractUrlsFromDataTransfer,
	isYouTubeUrl,
	copyWatchroomUrl
} from "./utils.js";
import { ensureSocket } from "./socket.js";

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
		this.justJoinedCode = null;
		this.storageListener = null;

		html`
			<div id="sharetube_main">
				<div id="sharetube_queue" style=${this.queueVisible.interp(v => v ? "" : "display:none")}>
					<div class="queue-header">
						<span class="queue-title">Queue (<span id="sharetube_queue_count">${this.queue.interp(v => v.length)}</span>)</span>
						<button class="rounded_btn" zyx-click=${() => this.toggleQueueVisibility()}>
							${this.queueVisible.interp(v => v ? "Hide" : "Show")}
						</button>
					</div>
					<div class="queue-list" id="sharetube_queue_list" zyx-live-list=${{ list: this.queue }}></div>
					<div class="queue-footer">
						<button class="rounded_btn" zyx-click=${() => this.clearQueue()}>Clear Queue</button>
						<button class="rounded_btn" zyx-click=${() => console.log("app state", this)}>Log App State</button>
					</div>
				</div>
				<div id="sharetube_pill">
					<span>ShareTube</span>
					<div class="presence" zyx-if=${[this.presence, v => v.length > 0]} zyx-live-list=${{ list: this.presence }}></div>
					<button class="rounded_btn" title="Start or copy Watchroom link" zyx-click=${(z) => { z.e.stopPropagation(); this.handlePlusButton(); }}>+</button>
					<button class="rounded_btn" zyx-click=${(z) => { z.e.stopPropagation(); this.toggleQueueVisibility(); }}>
						${this.queueVisible.interp(v => v ? "Hide" : "Show")}
					</button>
					<img alt="Profile" src=${this.avatarUrl.interp(v => v || "")} />
					<button class="rounded_btn" zyx-if=${[this.queue, (v) => v.length > 0]} zyx-click=${() => this.toggleQueueVisibility()}>
						${this.queue.interp(v => v.length)} queued
						<button class="rounded_btn" title="Play/Pause" zyx-click=${(z) => { z.e.stopPropagation(); this.togglePlayPause(); }}>
							${this.roomState.interp(s => s === 'playing' ? 'Pause' : 'Play')}
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
				return;
			}
			const claims = decodeJwt(token);
			const picture = claims && claims.picture;
			this.avatarUrl.set(picture || "");
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
	}

	toggleQueueVisibility() {
		const now = !this.queueVisible.get();
		this.queueVisible.set(now);
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
		// No need to push queue; server adopts existing personal queue on room creation
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
			const desired = members.slice(0, 6);

			for (let i = 0; i < desired.length; i++) {
				const m = desired[i];
				if (!m || m.id == null) continue;
				let comp = this.presentUsersById.get(m.id);
				if (!comp) {
					comp = new PresentUser(m);
					this.presentUsersById.set(m.id, comp);
				} else {
					comp.name.set(m.name || "");
					comp.picture.set(m.picture || "");
				}
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

			while (this.currentPresenceIds.length > desired.length) {
				const lastIdx = this.currentPresenceIds.length - 1;
				this.presence.splice(lastIdx, 1);
				const removedId = this.currentPresenceIds.pop();
				if (removedId != null) this.presentUsersById.delete(removedId);
			}
			if (this.justJoinedCode && this.justJoinedCode === payload.code) {
				try {
					console.log("Connected to room", payload.code, "with members:", members);
				} catch { }
				this.justJoinedCode = null;
			}
		} catch { }
	}

	serializeQueue() {
		const out = [];
		const list = this.queue && Array.isArray(this.queue) ? this.queue : [];
		const max = list.length;
		for (let i = 0; i < max; i++) {
			const item = this.queue[i];
			if (!item) continue;
			out.push({ url: item.url });
		}
		return out;
	}

	async pushQueueToServer(code) {
		try {
			const sock = await ensureSocket(this);
			if (!sock || !code) return;
			const items = this.serializeQueue();
			sock.emit("queue_replace", { code, items });
		} catch { }
	}

	onQueueSnapshot(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const items = Array.isArray(payload.items) ? payload.items : [];
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
					comp.removeFromServer = () => this.removeQueueItem(comp);
				} else {
					const comp = new ShareTubeQueueItem(it.url || "", it.title || "", it.thumbnail_url || "");
					comp.server_id = it.id != null ? it.id : null;
					comp.removeFromServer = () => this.removeQueueItem(comp);
					this.queue.push(comp);
				}
			}
		} catch { }
	}

	async removeQueueItem(comp) {
		try {
			const code = this.roomCode.get();
			if (!code || comp.server_id == null) return;
			const sock = await ensureSocket(this);
			if (!sock) return;
			sock.emit("queue_remove", { code, id: comp.server_id });
		} catch { }
	}

	async togglePlayPause() {
		const code = this.roomCode.get();
		if (!code) return;
		const current = this.roomState.get();
		const next = current === 'playing' ? 'idle' : 'playing';
		const sock = await ensureSocket(this);
		if (!sock) return;
		sock.emit("room_state_set", { code, state: next });
	}

	onRoomStateChange(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const state = payload.state === 'playing' ? 'playing' : 'idle';
			this.roomState.set(state);
			if (state === 'playing') {
				const first = this.queue[0];
				if (first && first.url) {
					try {
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

	async sendQueueAdd(code, item) {
		try {
			const sock = await ensureSocket(this);
			if (!sock) return;
			const payload = item && item.id ? { id: item.id } : { url: item && item.url };
			sock.emit("queue_add", { code, item: payload });
		} catch { }
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
		} catch { }
	}
}


