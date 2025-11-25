// Log that the content script has been loaded into the page context
console.log("contentScript.js loaded");
(() => {
    // Ensure zyX is available (loaded via manifest before this script)
    if (!window.zyX) {
        console.warn("zyX not found; aborting ShareTube UI render");
        return;
    }

    // Extract css and templating utilities from zyX
    const { css } = window.zyX;

    // Inject our stylesheet exactly once per page
    function injectStylesOnce() {
        try {
            if (window.__ShareTubeCssLoaded) return;
            css`
                @import url(${chrome.runtime.getURL("cs/styles.css")});
            `;
            window.__ShareTubeCssLoaded = true;
        } catch (e) {
            console.warn("injectStylesOnce failed", e);
        }
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
            // Boot logic which also wires SPA navigation events
            const boot = () => {
                try {
                    app.start();
                } catch (e) {
                    console.warn("ShareTube start() failed", e);
                }
                // Hook common YouTube SPA/navigation events to keep UI/player aligned
                const navKick = () => {
                    try {
                        app.navKick();
                    } catch (e) {
                        console.warn("navKick failed", e);
                    }
                };
                window.addEventListener("yt-navigate-start", navKick, true);
                window.addEventListener("yt-navigate-finish", navKick, true);
                window.addEventListener("spfdone", navKick, true);
                window.addEventListener("yt-page-data-updated", navKick, true);
                window.addEventListener("hashchange", navKick, true);
                window.addEventListener("popstate", navKick, true);
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
