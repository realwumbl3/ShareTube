// Log that the content script has been loaded into the page context
console.log("contentScript.js loaded");
(() => {
    /**
     * @typedef {import("./cs/app.js").default} ShareTubeApp
     */
    // Keep a reference to a logger module if available
    let _logger = null;
    // Safe debug wrapper using either our logger or console
    function ldebug(...args) { try { (_logger ? _logger.debug : console.debug).apply(console, args); } catch (e) { } }
    function lwarn(...args) { try { (_logger ? _logger.warn : console.warn).apply(console, args); } catch (e) { } }
    // Asynchronously import the logger module via extension URL and cache it
    (async () => {
        try {
            const mod = await import(chrome.runtime.getURL("cs/logger.js"));
            _logger = mod && (mod.logger || null);
        } catch (e) { /* ignore */ }
    })();
    // Ensure zyX is available (loaded via manifest before this script)
    if (!window.zyX) {
        console.warn("zyX not found; aborting ShareTube UI render");
        return;
    }

    // Prevent duplicate bootstraps across SPA navigations or reinjections
    if (window.__ShareTubeBooted) {
        try {
            // Nudge existing app to re-evaluate after navigation
            const existing = window.__ShareTubeApp;
            if (existing && typeof existing.updatePlaybackEnforcement === 'function') {
                existing.attachOverlayToPlayerContainer && existing.attachOverlayToPlayerContainer();
                existing.updateOverlayFixedBounds && existing.updateOverlayFixedBounds();
                existing.recomputeOverlayVisibility && existing.recomputeOverlayVisibility();
                existing.updatePlaybackEnforcement("contentscript:rebroadcast");
                existing.tryJoinFromUrlHash && existing.tryJoinFromUrlHash();
            }
        } catch (e) { ldebug("rebroadcast after SPA nav failed", e); }
        return;
    }
    // Mark initialized to avoid double-initialization
    window.__ShareTubeBooted = true;

    // Extract css and templating utilities from zyX
    const { css } = window.zyX;

    // Inject our stylesheet exactly once per page
    function injectStylesOnce() {
        try {
            if (window.__ShareTubeCssLoaded) return;
            css`@import url(${chrome.runtime.getURL("cs/styles.css")});`;
            window.__ShareTubeCssLoaded = true;
        } catch (e) { ldebug("injectStylesOnce failed", e); }
    }

    // Main bootstrap that lazy-loads the app module and starts it
    async function start() {
        try {
            injectStylesOnce();
            const mod = await import(chrome.runtime.getURL("cs/app.js"));
            const ShareTubeApp = mod && (mod.default || mod.ShareTubeApp);
            if (!ShareTubeApp) {
                console.warn("Failed to load ShareTube app module");
                return;
            }
            // Create and cache a single app instance on the window for reuse
            /** @type {ShareTubeApp} */
            const app = new ShareTubeApp();
            window.__ShareTubeApp = app;
            // Lightweight test/debug bridge to interact from page context/tests
            try {
                if (!window.__ShareTubeTestBridgeReady) {
                    window.__ShareTubeTestBridgeReady = true;
                    const serialize = (value, seen, depth) => {
                        try {
                            if (value === null || value === undefined) return value;
                            const t = typeof value;
                            if (t === "string" || t === "number" || t === "boolean") return value;
                            if (t === "function") return undefined;
                            if (seen.has(value)) return "[Circular]";
                            if (depth > 3) return "[MaxDepth]";
                            if (typeof Element !== "undefined" && value instanceof Element) {
                                return { $el: true, tag: value.tagName, id: value.id || "", class: value.className || "" };
                            }
                            if (Array.isArray(value)) {
                                seen.add(value);
                                return value.map((v) => serialize(v, seen, depth + 1));
                            }
                            if (typeof Map !== "undefined" && value instanceof Map) {
                                seen.add(value);
                                const obj = {};
                                for (const [k, v] of value.entries()) obj[String(k)] = serialize(v, seen, depth + 1);
                                return obj;
                            }
                            if (typeof Set !== "undefined" && value instanceof Set) {
                                seen.add(value);
                                return Array.from(value.values()).map((v) => serialize(v, seen, depth + 1));
                            }
                            if (t === "object") {
                                seen.add(value);
                                const out = {};
                                for (const key of Object.keys(value)) {
                                    try { out[key] = serialize(value[key], seen, depth + 1); } catch { }
                                }
                                return out;
                            }
                            return undefined;
                        } catch { return undefined; }
                    };
                    /**
                     * @param {ShareTubeApp} appInstance
                     * @returns {Object}
                     */
                    const snapshotApp = (appInstance) => {
                        try {
                            const base = serialize(appInstance, new WeakSet(), 0) || {};
                            try {
                                // Prefer explicit debug field if provided by refactored app
                                if (typeof appInstance._lastQueueLength === 'number') {
                                    base.queueLength = appInstance._lastQueueLength;
                                } else {
                                    base.queueLength = Array.isArray(appInstance.queue) ? appInstance.queue.length : (typeof appInstance.queue?.length === "number" ? appInstance.queue.length : undefined);
                                }
                            } catch { }
                            try {
                                if (!(typeof base.queueLength === 'number' && isFinite(base.queueLength))) {
                                    const container = document.querySelector('#sharetube_queue_list');
                                    base.queueLength = container ? container.children.length : 0;
                                }
                            } catch { }
                            try {
                                // Prefer new socketService if present, fall back to legacy app.socket
                                const svc = appInstance.socketService;
                                const sock = (svc && typeof svc.getSocket === 'function') ? svc.getSocket() : (appInstance.socket || null);
                                base.socketConnected = !!(sock && sock.connected);
                            } catch { }
                            try { base.userId = appInstance.userId != null ? appInstance.userId : base.userId; } catch { }
                            try { base.roomState = (appInstance.roomState && appInstance.roomState.get && appInstance.roomState.get()) || base.roomState; } catch { }
                            try { base.roomCode = (appInstance.roomCode && appInstance.roomCode.get && appInstance.roomCode.get()) || base.roomCode; } catch { }
                            try { base.adPlaying = !!(appInstance.adPlaying && appInstance.adPlaying.get && appInstance.adPlaying.get()); } catch { }
                            try { base.playerState = (appInstance.player && appInstance.player.getPlayerState && appInstance.player.getPlayerState()) || base.playerState; } catch { }
                            return base;
                        } catch { return {}; }
                    };
                    // Resolve a nested method path like "roomManager.togglePlayPause" on the app
                    function resolveCallable(root, path) {
                        try {
                            const segs = String(path || '').split('.').filter(Boolean);
                            let ctx = root;
                            for (let i = 0; i < segs.length - 1; i++) {
                                if (!ctx) break;
                                ctx = ctx[segs[i]];
                            }
                            const last = segs.length > 0 ? segs[segs.length - 1] : '';
                            const fn = last ? (ctx && ctx[last]) : (root && root[path]);
                            return { ctx: segs.length > 1 ? ctx : root, fn };
                        } catch { return { ctx: root, fn: null }; }
                    }

                    window.addEventListener('sharetube:test', async (ev) => {
                        try {
                            const detail = ev && ev.detail || {};
                            const id = detail && detail.id;
                            let ok = true;
                            let result = null;
                            let error = null;
                            const a = String(detail && detail.action || '');
                            if (a === 'ping') {
                                result = 'pong';
                            } else if (a === 'getState') {
                                result = snapshotApp(window.__ShareTubeApp);
                            } else if (a === 'call') {
                                const method = detail && detail.method;
                                const args = (detail && detail.args) || [];
                                const target = window.__ShareTubeApp;
                                if (!target) throw new Error('App not ready');
                                const { ctx, fn } = resolveCallable(target, method);
                                if (typeof fn !== 'function') throw new Error('No such method: ' + String(method));
                                result = await fn.apply(ctx || target, args);
                            } else {
                                throw new Error('Unknown action: ' + a);
                            }
                            window.dispatchEvent(new CustomEvent('sharetube:test:resp', { detail: { id, ok, result, error } }));
                        } catch (e) {
                            try {
                                const id = ev && ev.detail && ev.detail.id;
                                window.dispatchEvent(new CustomEvent('sharetube:test:resp', { detail: { id, ok: false, result: null, error: String(e && e.message || e) } }));
                            } catch { }
                        }
                    }, true);
                }
            } catch { }
            // Boot logic which also wires SPA navigation events
            const boot = () => {
                try { app.start(); } catch (e) { console.warn("ShareTube start() failed", e); }
                // Hook common YouTube SPA/navigation events to keep UI/player aligned
                const navKick = () => {
                    try {
                        app.attachOverlayToPlayerContainer && app.attachOverlayToPlayerContainer();
                        app.updateOverlayFixedBounds && app.updateOverlayFixedBounds();
                        app.recomputeOverlayVisibility && app.recomputeOverlayVisibility();
                        app.updatePlaybackEnforcement && app.updatePlaybackEnforcement("nav");
                        app.tryJoinFromUrlHash && app.tryJoinFromUrlHash();
                    } catch (e) { ldebug("navKick failed", e); }
                };
                window.addEventListener('yt-navigate-start', navKick, true);
                window.addEventListener('yt-navigate-finish', navKick, true);
                window.addEventListener('spfdone', navKick, true);
                window.addEventListener('yt-page-data-updated', navKick, true);
                window.addEventListener('hashchange', navKick, true);
                window.addEventListener('popstate', navKick, true);
            };
            // Run after DOM ready if still loading
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", boot, { once: true });
            } else {
                boot();
            }
            console.log("ShareTube Init", { zyX });
        } catch (e) {
            console.warn("Error bootstrapping ShareTube app", e);
        }
    }

    // Kick off bootstrap
    start();
})();
