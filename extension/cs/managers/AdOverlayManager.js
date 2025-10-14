// AdOverlayManager encapsulates all DOM, placement, and state logic for the
// small overlay that informs users when ads are active or the room is starting.
//
// This class is intentionally pure in the sense that it does not own the
// application state. Instead, the ShareTube app provides a set of getter
// callbacks that the manager pulls from whenever it needs to render or update.
//
// The manager exposes three main methods:
// - constructor(getters): capture state accessors and light options
// - start(): create DOM, attach to the page, begin periodic placement updates
// - notifyStateChanged(): recompute visibility, avatars, and labels immediately
//
// All functions use defensive try/catch to avoid breaking the host page.

export default class AdOverlayManager {
	// Construct with a bag of lazy getters so we never hold stale references.
	// Expected getters:
	// - getPillElement(): HTMLElement | null
	// - getVideoElement(): HTMLVideoElement | null
	// - getRoomState(): 'idle'|'starting'|'playing'|'playing_ad'
	// - getAdPlaying(): boolean
	// - getAdUserIds(): Set<number>
	// - getPresentUsersById(): Map<number, { name: LiveVar<string>, picture: LiveVar<string> }>
	constructor(getters) {
		// Store the getter bag for on-demand reads
		this.getters = getters || {};
		// Overlay root element (created on start)
		this.el = null;
		// Internal placement mode flags
		this.isFixedMode = false; // true when anchored by absolute rects near the video
		this.isPillMode = false; // true when anchored above the ShareTube pill
		// Periodic placement updater timer id
		this.placementTimer = null;
	}

	// Start the overlay lifecycle: create DOM, attach, and schedule placement updates
	start() {
		try {
			// Create the overlay root if missing so we can attach it
			if (!this.el) {
				const el = document.createElement('div');
				el.id = 'sharetube_ad_overlay';
				// Minimal inner HTML structure used by styles already in the project
				el.innerHTML = `
					<div class="st_ad_content">
						<div class="st_ad_avatars" id="st_ad_avatars"></div>
						<div class="st_ad_label">Currently watching ADs, please wait</div>
					</div>
				`;
				this.el = el;
			}
			// Attach where appropriate and compute initial state
			this.#attachToBestContainer();
			this.notifyStateChanged();
			// Begin periodic placement checks to react to layout changes
			if (!this.placementTimer) {
				this.placementTimer = setInterval(() => {
					try {
						this.#updatePlacement();
						this.#updateFixedBounds();
						this.#updatePillBounds();
					} catch {}
				}, 500);
			}
		} catch {}
	}

	// Stop the overlay lifecycle and clean up DOM/timers
	stop() {
		try {
			if (this.placementTimer) {
				clearInterval(this.placementTimer);
				this.placementTimer = null;
			}
			if (this.el && this.el.parentElement) {
				try { this.el.remove(); } catch {}
			}
		} catch {}
	}

	// Public hook for the host app to signal that state changed and the overlay
	// should re-evaluate visibility, labels, and avatars immediately.
	notifyStateChanged() {
		try {
			this.#updatePlacement();
			this.#recomputeVisibility();
			this.#updateAvatars();
			this.#updateLabel();
		} catch {}
	}

	// Resolve and attach overlay to the most appropriate container on the page
	#attachToBestContainer() {
		try {
			if (!this.el) return;
			this.#updatePlacement();
		} catch {}
	}

	// Choose between pill-mode, video-container, or fixed body fallback; keep flags coherent
	#updatePlacement() {
		try {
			if (!this.el) return;
			const get = this.getters || {};
			const adPlaying = !!(get.getAdPlaying && get.getAdPlaying());
			// When the local user is currently in an ad, anchor above the ShareTube pill
			if (adPlaying) {
				const pill = get.getPillElement ? get.getPillElement() : null;
				if (pill) {
					if (this.el.parentElement !== document.body) {
						try { this.el.remove(); } catch {}
						document.body.appendChild(this.el);
					}
					this.isPillMode = true;
					try { this.el.classList.add('pill-mode'); } catch {}
					this.isFixedMode = false;
					this.#updatePillBounds();
					this.#updateLabel();
					return;
				}
			}
			// Otherwise prefer a YouTube video container if available
			const video = get.getVideoElement ? get.getVideoElement() : null;
			let container = null;
			try {
				container = (video && video.closest && video.closest('.html5-video-player'))
					|| document.querySelector('#movie_player')
					|| document.querySelector('.html5-video-player')
					|| document.querySelector('ytd-player')
					|| document.querySelector('ytd-watch-flexy #player')
					|| document.querySelector('ytd-reel-video-renderer');
			} catch {}
			if (container) {
				if (this.el.parentElement !== container) {
					try { this.el.remove(); } catch {}
					container.appendChild(this.el);
				}
				if (this.isFixedMode || this.isPillMode) {
					this.isFixedMode = false;
					this.isPillMode = false;
					try { this.el.classList.remove('pill-mode'); } catch {}
					Object.assign(this.el.style, { position: '', left: '', top: '', width: '', height: '' });
				}
				this.#updateLabel();
				return;
			}
			// Fallback: attach to body and position over the video rect using fixed coordinates
			if (this.el.parentElement !== document.body) {
				try { this.el.remove(); } catch {}
				document.body.appendChild(this.el);
			}
			this.isFixedMode = true;
			this.isPillMode = false;
			try { this.el.classList.remove('pill-mode'); } catch {}
			this.#updateFixedBounds();
			this.#updateLabel();
		} catch {}
	}

	// In fixed mode, keep the overlay aligned to the video element's client rect
	#updateFixedBounds() {
		try {
			if (!this.el || !this.isFixedMode) return;
			const get = this.getters || {};
			const video = get.getVideoElement ? get.getVideoElement() : null;
			if (!video || !video.getBoundingClientRect) return;
			const r = video.getBoundingClientRect();
			Object.assign(this.el.style, {
				position: 'fixed',
				left: `${Math.max(0, r.left)}px`,
				top: `${Math.max(0, r.top)}px`,
				width: `${Math.max(0, r.width)}px`,
				height: `${Math.max(0, r.height)}px`,
			});
		} catch {}
	}

	// In pill mode, place the overlay box just above the ShareTube pill area
	#updatePillBounds() {
		try {
			if (!this.el || !this.isPillMode) return;
			const get = this.getters || {};
			const pill = get.getPillElement ? get.getPillElement() : null;
			if (!pill || !pill.getBoundingClientRect) return;
			const r = pill.getBoundingClientRect();
			const margin = 8;
			const desiredWidth = Math.max(140, Math.min(280, r.width));
			Object.assign(this.el.style, {
				position: 'fixed',
				left: `${Math.max(0, r.left)}px`,
				top: `${Math.max(0, r.top - (this.el.offsetHeight || 52) - margin)}px`,
				width: `${desiredWidth}px`,
				height: '',
			});
		} catch {}
	}

	// Compute whether the overlay should be visible based on room/ad state
	#recomputeVisibility() {
		try {
			if (!this.el) return;
			const get = this.getters || {};
			const inRoom = true; // The host only instantiates this manager when UI is active in-room
			const rs = get.getRoomState ? get.getRoomState() : 'idle';
			const isAdNow = !!(get.getAdPlaying && get.getAdPlaying());
			const adIds = get.getAdUserIds ? Array.from(get.getAdUserIds() || []) : [];
			const anyoneInAds = adIds.length > 0;
			const waiting = (rs === 'starting' || rs === 'playing_ad');
			const visible = inRoom && (isAdNow || anyoneInAds || waiting);
			if (visible) this.el.classList.add('visible'); else this.el.classList.remove('visible');
		} catch {}
	}

	// Render the avatar strip according to current mode and state
	#updateAvatars() {
		try {
			if (!this.el) return;
			const wrap = this.el.querySelector('#st_ad_avatars');
			if (!wrap) return;
			// Clear existing content
			wrap.innerHTML = '';
			// Determine which users to show
			const get = this.getters || {};
			const rs = get.getRoomState ? get.getRoomState() : 'idle';
			const adIds = get.getAdUserIds ? Array.from(get.getAdUserIds() || []) : [];
			const showWaiting = (adIds.length === 0) && (rs === 'starting' || rs === 'playing_ad');
			const presentMap = get.getPresentUsersById ? (get.getPresentUsersById() || new Map()) : new Map();
			if (this.isPillMode) {
				// Compact pill-mode: up to 4 faces and a "+N" counter
				const ids = showWaiting ? Array.from(presentMap.keys()) : adIds;
				const maxFaces = 4;
				const faces = ids.slice(0, maxFaces);
				for (const uid of faces) {
					const comp = presentMap.get(uid);
					const img = document.createElement('img');
					img.alt = (comp && comp.name && comp.name.get && comp.name.get()) || '';
					img.title = img.alt;
					const pic = (comp && comp.picture && comp.picture.get && comp.picture.get()) || '';
					img.src = pic || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
					wrap.appendChild(img);
				}
				const remaining = Math.max(0, ids.length - faces.length);
				if (remaining > 0) {
					const more = document.createElement('span');
					more.className = 'st_ad_plus';
					more.textContent = `+${remaining}`;
					wrap.appendChild(more);
				}
			} else {
				// Default/container mode: up to 12 avatars, or waiting faces when no ad list
				const idsToShow = showWaiting ? Array.from(presentMap.keys()).slice(0, 6) : adIds.slice(0, 12);
				for (const uid of idsToShow) {
					const comp = presentMap.get(uid);
					const img = document.createElement('img');
					img.alt = (comp && comp.name && comp.name.get && comp.name.get()) || '';
					img.title = img.alt;
					const pic = (comp && comp.picture && comp.picture.get && comp.picture.get()) || '';
					img.src = pic || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
					wrap.appendChild(img);
				}
			}
			// Keep label in sync with avatars
			this.#updateLabel();
		} catch {}
	}

	// Update the textual label to reflect current state
	#updateLabel() {
		try {
			if (!this.el) return;
			const labelEl = this.el.querySelector('.st_ad_label');
			if (!labelEl) return;
			const get = this.getters || {};
			const rs = get.getRoomState ? get.getRoomState() : 'idle';
			const adIds = get.getAdUserIds ? Array.from(get.getAdUserIds() || []) : [];
			const showWaiting = (adIds.length === 0) && (rs === 'starting' || rs === 'playing_ad');
			const presentMap = get.getPresentUsersById ? (get.getPresentUsersById() || new Map()) : new Map();
			if (this.isPillMode) {
				labelEl.textContent = showWaiting ? `Waiting (${presentMap.size})` : `Ads (${adIds.length})`;
			} else {
				labelEl.textContent = 'Currently watching ADs, please wait';
			}
		} catch {}
	}
}


