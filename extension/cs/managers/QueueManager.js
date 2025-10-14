// Log module load for diagnostics
console.log("cs/managers/QueueManager.js loaded");

import { ShareTubeQueueItem } from "../components/QueuePopup.js";
import { findOnPageYouTubeMeta, fetchMetadataFromBackend } from "../utils.js";
import { logger } from "../logger.js";
import ShareTubeApp from "../app.js";

const { LiveList } = zyX;

export default class QueueManager {
	/**
	 * @param {ShareTubeApp} app
	 */
	constructor(app) {
		/** @type {ShareTubeApp} */
		this.app = app;
		this.queue = new LiveList([]);
	}

	get roomCode() { return this.app.roomCode; }

	enqueueWithMetadata(url) {
		try {
			const pageMeta = findOnPageYouTubeMeta(url);
			const title = pageMeta && pageMeta.title ? pageMeta.title : "";
			const thumb = pageMeta && pageMeta.thumbnail_url ? pageMeta.thumbnail_url : "";
			const item = new ShareTubeQueueItem(url, title, thumb);
			this.queue.push(item);
			const code = this.roomCode.get();
			this.sendQueueAdd(code || null, { url });
			if (!pageMeta) {
				fetchMetadataFromBackend(url).then((meta) => {
					if (meta) {
						item.title.set(meta.title || "");
						item.thumbnail_url.set(meta.thumbnail_url || "");
					}
				}).catch(() => { });
			}
		} catch (e) { logger.debug("enqueueWithMetadata failed", e); }
	}

	getFirstQueueItem() {
		try { return this.queue && this.queue.length > 0 ? this.queue[0] : null; } catch { return null; }
	}


	async removeQueueItem(comp) {
		try {
			const code = this.roomCode.get();
			if (!code || comp.server_id == null) return;
			const sock = await this.app.socketManager.ensureSocket();
			if (!sock) return;
			sock.emit("queue_remove", { code, id: comp.server_id });
		} catch (e) { logger.debug("removeQueueItem failed", e); }
	}

	async sendQueueAdd(code, item) {
		try {
			const payload = (item && item.id) ? { id: item.id } : { url: item && item.url };
			if (!code) return;
			const sock = await this.app.socketManager.ensureSocket();
			if (!sock) return;
			sock.emit("queue_add", { code: code, item: payload });
		} catch (e) { logger.debug("sendQueueAdd failed", e); }
	}

	onQueueSnapshot(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const items = Array.isArray(payload.items) ? payload.items : [];
			if (items.length > 0) {
				const first = items[0] || {};
				const dur = Number(first.duration || 0);
				const prog = Number(first.progress || 0);
				const ps = Number(first.playing_since || 0);
				const changed = (dur !== this.app.playback.duration) || (prog !== this.app.playback.progress) || (ps !== this.app.playback.playing_since);
				if (changed) {
					this.app.playback = { duration: dur, progress: prog, playing_since: ps, lastTs: Date.now() };
					if (this.app.seekAccordingToServer) this.app.seekAccordingToServer("queue_snapshot");
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
			// If we just received a queue with an active first item while the room is
			// starting/playing, ensure navigation occurs on late joins from non-video pages.
			try {
				const stateNow = this.app.roomState && this.app.roomState.get && this.app.roomState.get();
				const code = this.roomCode && this.roomCode.get && this.roomCode.get();
				if ((stateNow === 'starting' || stateNow === 'playing') && code) {
					if (!this.app.roomManager._ensureRoomHashApplied(code)) this.app.roomManager._navigateToActiveVideo(code);
				}
			} catch { }
		} catch (e) { logger.debug("onQueueSnapshot failed", e); }
	}
}


