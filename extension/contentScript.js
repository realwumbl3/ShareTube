console.log("contentScript.js loaded");

(() => {
    // Ensure zyX is available (loaded via manifest before this script)
    if (!window.zyX) {
        console.warn("zyX not found; aborting ShareTube UI render");
        return;
    }

	const start = async () => {
		try {
			const mod = await import(chrome.runtime.getURL("cs/app.js"));
			const ShareTubeApp = mod && (mod.default || mod.ShareTubeApp);
			if (!ShareTubeApp) {
				console.warn("Failed to load ShareTube app module");
                return;
            }
    const app = new ShareTubeApp();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => app.start());
    } else {
        app.start();
    }
    console.log("ShareTube Init", { zyX });
		} catch (e) {
			console.warn("Error bootstrapping ShareTube app", e);
		}
	};

	start();
})();
