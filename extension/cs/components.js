console.log("cs/components.js loaded");

const { html, LiveVar } = zyX;

export class ShareTubeQueueItem {
	constructor(url, title = "", thumbnail_url = "") {
		this.url = url;
		this.title = new LiveVar(title);
		this.thumbnail_url = new LiveVar(thumbnail_url);
		this.server_id = null;
		html`
			<div class="queue-item">
				<img class="thumb" alt="" src=${this.thumbnail_url.interp(v => v || "")} zyx-if=${this.thumbnail_url} />
				<div class="meta">
					<div class="title">${this.title.interp(v => v || url)}</div>
					<div class="small">${url}</div>
				</div>
				<button class="x-button" zyx-click=${() => this.removeFromServer && this.removeFromServer()}>X</button>
			</div>
		`.bind(this);
	}
}

export class PresentUser {
	constructor(user) {
		const u = user || {};
		this.id = u.id;
		this.name = new LiveVar(u.name || "");
		this.picture = new LiveVar(u.picture || "");
		html`
			<img alt=${this.name.interp(v => v || "")} title=${this.name.interp(v => v || "")} src=${this.picture.interp(v => v || "")} />
		`.bind(this);
	}
}


