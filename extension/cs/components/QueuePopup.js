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
