// Log that the content script has been loaded into the page context
console.log("contentScript.js loaded");
(() => {
    // Keep a reference to a logger module if available
    let _logger = null;
    // Safe debug wrapper using either our logger or console
    function ldebug(...args) { try { (_logger ? _logger.debug : console.debug).apply(console, args); } catch (e) {} }
    function lwarn(...args) { try { (_logger ? _logger.warn : console.warn).apply(console, args); } catch (e) {} }
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
            const app = new ShareTubeApp();
            window.__ShareTubeApp = app;
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
