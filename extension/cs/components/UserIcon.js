const { html, LiveVar } = zyX;

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


