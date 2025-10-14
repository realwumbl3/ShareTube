// Log module load for diagnostics
console.log("cs/managers/VoteManager.js loaded");

import ShareTubeApp from "../app.js";

export default class VoteManager {
	/**
	 * @param {ShareTubeApp} app
	 */
	constructor(app) {
		/** @type {ShareTubeApp} */
		this.app = app;
		this.onVoteSkipResult = null;
	}

	toggleVoteMenu() {
		this.app.voteMenuVisible.set(!this.app.voteMenuVisible.get());
	}

	async startSkipVote() {
		try {
			const code = this.app.roomCode.get();
			if (!code) return;
			const sock = await this.app.socketManager.ensureSocket();
			if (!sock) return;
			sock.emit('vote_skip', { code: code });
			var handled = false;
			this.onVoteSkipResult = function () { handled = true; };
			setTimeout(function () {
				try {
					if (!handled) sock.emit('vote_skip', { code: code });
				} catch { }
			}, 2000);
			this.app.voteMenuVisible.set(false);
		} catch { }
	}
}


