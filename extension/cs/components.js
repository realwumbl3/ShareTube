// Log module load for diagnostics
console.log("cs/components.js loaded");

// Pull templating helpers from the zyX micro-framework
const { html, LiveVar } = zyX;

// UI component representing a queued YouTube item
export class ShareTubeQueueItem {
	constructor(url, title = "", thumbnail_url = "") {
		this.url = url;
		this.title = new LiveVar(title);
		this.thumbnail_url = new LiveVar(thumbnail_url);
		this.position = new LiveVar(null);
		this.server_id = null;
        // Render queue item DOM structure and bind LiveVars
		html`
			<div class="queue-item">
				<div class="pos" zyx-if=${[this.position, v => v != null]}>${this.position.interp(v => v)}</div>
				<img class="thumb" alt="" src=${this.thumbnail_url.interp(v => v || "")} zyx-if=${this.thumbnail_url} />
				<div class="meta">
					<div class="title">${this.title.interp(v => v || url)}</div>
					<div class="url">${url}</div>
				</div>
				<button class="x-button" zyx-click=${() => this.removeFromServer && this.removeFromServer()}>X</button>
			</div>
		`.bind(this);
	}
}

// Compact avatar component representing a present user in the room
export class PresentUser {
	constructor(user) {
		const u = user || {};
		this.id = u.id;
		this.name = new LiveVar(u.name || "");
		this.picture = new LiveVar(u.picture || "");
        // Render a single <img> node bound to name/picture LiveVars
		html`
			<img alt=${this.name.interp(v => v || "")} title=${this.name.interp(v => v || "")} src=${this.picture.interp(v => v || "")} />
		`.bind(this);
	}
}


