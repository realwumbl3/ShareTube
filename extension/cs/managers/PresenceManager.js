// Log module load for diagnostics
console.log("cs/managers/PresenceManager.js loaded");

import { PresentUser } from "../components/UserIcon.js";
import { logger } from "../logger.js";
import ShareTubeApp from "../app.js";	

const { LiveList } = zyX;

export default class PresenceManager {
	/**
	 * @param {ShareTubeApp} app
	 */
	constructor(app) {
		/** @type {ShareTubeApp} */
		this.app = app;
		/** @type {LiveList} */
		this.presence = new LiveList([]);
	}

	get roomCode() { return this.app.roomCode; }

	onRoomPresence(payload) {
		try {
			const code = this.roomCode.get();
			if (!payload || payload.code !== code) return;
			const members = Array.isArray(payload.members) ? payload.members : [];
			const pillMembers = members.slice(0, 6);
			const incomingIds = new Set(members.map(function(m) { return m && m.id != null ? Number(m.id) : null; }).filter(function(v) { return v != null; }));

			for (const m of members) {
				if (!m || m.id == null) continue;
				let comp = this.app.presentUsersById.get(m.id);
				if (!comp) {
					comp = new PresentUser(m);
					this.app.presentUsersById.set(m.id, comp);
				} else {
					comp.name.set(m.name || "");
					comp.picture.set(m.picture || "");
				}
			}

			for (let i = 0; i < pillMembers.length; i++) {
				const m = pillMembers[i];
				if (!m || m.id == null) continue;
				const comp = this.app.presentUsersById.get(m.id);
				const curIdx = this.app.currentPresenceIds.indexOf(m.id);
				if (curIdx === -1) {
					this.presence.splice(i, 0, comp);
					this.app.currentPresenceIds.splice(i, 0, m.id);
				} else if (curIdx !== i) {
					const removed = this.presence.splice(curIdx, 1);
					this.app.currentPresenceIds.splice(curIdx, 1);
					this.presence.splice(i, 0, removed && removed[0] ? removed[0] : comp);
					this.app.currentPresenceIds.splice(i, 0, m.id);
				}
			}

			while (this.app.currentPresenceIds.length > pillMembers.length) {
				const lastIdx = this.app.currentPresenceIds.length - 1;
				this.presence.splice(lastIdx, 1);
				this.app.currentPresenceIds.splice(lastIdx, 1);
			}

			for (const [uid] of Array.from(this.app.presentUsersById.entries())) {
				if (!incomingIds.has(Number(uid))) {
					this.app.presentUsersById.delete(uid);
					try { this.app.adUserIds.delete(Number(uid)); } catch (e) { logger.debug("adUserIds delete failed", e); }
				}
			}
			if (this.app.justJoinedCode && this.app.justJoinedCode === payload.code) {
				try { console.log("Connected to room", payload.code, "with members:", members); } catch (e) { logger.debug("presence log failed", e); }
				this.app.justJoinedCode = null;
			}
			try { if (this.app.adOverlayManager) this.app.adOverlayManager.notifyStateChanged(); } catch { }
		} catch (e) { logger.debug("onRoomPresence failed", e); }
	}
}


