console.log("cs/utils.js loaded");

export function decodeJwt(token) {
	try {
		const payload = token.split(".")[1];
		const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(decodeURIComponent(escape(json)));
	} catch (e) { return null; }
}

export function toAbsoluteUrl(href) {
	try { return new URL(href, location.href).toString(); } catch { return null; }
}

export function extractVideoId(u) {
	try {
		const url = new URL(u, location.href);
		const host = url.hostname.replace(/^www\./, "");
		if (host === 'youtu.be') return url.pathname.replace(/^\//, '');
		if (host.endsWith('youtube.com')) {
			if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || '';
			const v = url.searchParams.get('v');
			if (v) return v;
		}
		const m = u.match(/[a-zA-Z0-9_-]{11}/);
		return m ? m[0] : '';
	} catch { return ''; }
}

export function youtubeThumbFromId(id) {
	if (!id) return '';
	return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function sanitizeTitle(t) {
	if (!t) return '';
	let s = t;
	if (s.includes(' • ')) s = s.split(' • ')[0];
	s = s.replace(/\s*[\-–—•\(\[]?\s*(?:\d{1,2}:)?\d{1,2}:\d{2}[\)\]]?\s*$/u, '');
	s = s.replace(/\s*[•\-–—]\s*\d+[\d,\.]*\s*(?:views?|years?|months?|weeks?|days?)\s*ago?$/iu, '');
	s = s.replace(/\s+/g, ' ').trim();
	return s;
}

export function extractCleanTitle(root) {
	if (!root) return '';
	const selectors = [
		'.yt-lockup-metadata-view-model__title[title]',
		'h3[title]',
		'a.yt-lockup-metadata-view-model__title[title]',
		'.yt-lockup-metadata-view-model__text-container h3[title]',
		'a#video-title-link',
		'#video-title-link',
		'#video-title',
		'h3 a#video-title-link',
		'yt-formatted-string#video-title'
	];
	for (const sel of selectors) {
		const el = root.querySelector(sel);
		if (el) {
			const attr = el.getAttribute('title');
			const raw = (attr && attr.trim()) || (el.textContent || '').trim();
			const cleaned = sanitizeTitle(raw);
			if (cleaned) return cleaned;
		}
	}
	const lockupTitle = root.querySelector('.yt-lockup-metadata-view-model__title, h3 .yt-lockup-metadata-view-model__title, h3 a.yt-lockup-metadata-view-model__title');
	if (lockupTitle) {
		const span = lockupTitle.querySelector('.yt-core-attributed-string') || lockupTitle;
		const txt = (span.textContent || '').trim();
		const cleaned = sanitizeTitle(txt);
		if (cleaned) return cleaned;
	}
	const h = root.querySelector('h3, h4, yt-formatted-string');
	const raw = (h && (h.getAttribute('title') || h.textContent) || '').trim();
	return sanitizeTitle(raw);
}

export function findOnPageYouTubeMeta(url) {
	try {
		const vid = extractVideoId(url);
		if (!vid) return null;
		const anchors = document.querySelectorAll('a[href*="youtu"], a[href*="youtube.com/watch"], a[href*="/shorts/"], a[href*="/watch?v="]');
		for (const a of anchors) {
			const href = a.getAttribute('href') || '';
			if (!href) continue;
			const abs = toAbsoluteUrl(href);
			if (!abs) continue;
			if (abs.includes(vid)) {
				const container = a.closest('yt-lockup-view-model, .yt-lockup-view-model, yt-lockup-metadata-view-model, .yt-lockup-metadata-view-model, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer') || a;
				const img = container.querySelector('img') || a.querySelector('img');
				const title = extractCleanTitle(container) || extractCleanTitle(a);
				const thumb = img && (img.getAttribute('src') || img.getAttribute('data-thumb') || img.getAttribute('data-src'));
				if (title || thumb) {
					return { title, thumbnail_url: thumb || youtubeThumbFromId(vid) };
				}
			}
		}
		const imgs = document.querySelectorAll('img[src*="ytimg.com"], img[src*="i.ytimg.com"]');
		for (const img of imgs) {
			const src = img.getAttribute('src') || '';
			if (src.includes(vid)) {
				const container = img.closest('yt-lockup-view-model, .yt-lockup-view-model, yt-lockup-metadata-view-model, .yt-lockup-metadata-view-model, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer') || img.parentElement;
				const title = extractCleanTitle(container);
				return { title, thumbnail_url: src };
			}
		}
		return null;
	} catch { return null; }
}

export async function fetchMetadataFromBackend(url) {
	try {
		const { newapp_backend } = await chrome.storage.sync.get(["newapp_backend"]);
		const base = newapp_backend || "http://localhost:5100";
		const r = await fetch(`${base}/api/youtube/metadata?url=${encodeURIComponent(url)}`, { method: 'GET' });
		if (!r.ok) return null;
		return await r.json();
	} catch { return null; }
}

export function extractUrlsFromDataTransfer(dt) {
	const urls = [];
	try {
		const uriList = dt.getData && dt.getData("text/uri-list");
		if (uriList) {
			uriList.split(/\r?\n/).forEach(line => {
				if (!line || line.startsWith("#")) return;
				urls.push(line.trim());
			});
		}
	} catch { }
	try {
		const text = dt.getData && dt.getData("text/plain");
		if (text) {
			const regex = /https?:\/\/[^\s)]+/g;
			let m;
			while ((m = regex.exec(text)) !== null) {
				urls.push(m[0]);
			}
		}
	} catch { }
	const seen = new Set();
	const out = [];
	for (const u of urls) {
		if (seen.has(u)) continue;
		seen.add(u);
		out.push(u);
	}
	return out;
}

export function isYouTubeUrl(u) {
	try {
		const url = new URL(u);
		const host = url.hostname.replace(/^www\./, "");
		if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
			return true;
		}
		return false;
	} catch { return false; }
}

export function copyWatchroomUrl(code) {
	const url = `https://www.youtube.com/#sharetube:${code}`;
	console.log("Copying watchroom URL", url);
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(url).then(() => console.log("Copied watchroom URL"));
	} else {
		const ta = document.createElement('textarea');
		ta.value = url; document.body.appendChild(ta); ta.select();
		try { document.execCommand('copy'); } catch { }
		document.body.removeChild(ta);
	}
}


