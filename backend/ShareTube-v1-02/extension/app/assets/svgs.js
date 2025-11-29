/**
 * Resolve asset URLs whether we're inside the Chrome extension runtime,
 * Firefox extension runtime, or a standalone page (e.g. mobile remote).
 * Falls back to /extension/ when neither extension runtime API is available.
 * @param {string} relativePath
 * @returns {string}
 */
export const resolveAssetUrl = (relativePath) => {
    if (typeof chrome !== "undefined" && chrome?.runtime?.getURL) {
        return chrome.runtime.getURL(relativePath);
    }
    if (typeof browser !== "undefined" && browser?.runtime?.getURL) {
        return browser.runtime.getURL(relativePath);
    }
    const normalized = relativePath.replace(/^\/+/, "");
    return window.location.origin + `/extension/${normalized}`;
};

export const openInNewTabSVG = resolveAssetUrl("app/assets/open-in-new-tab.svg");
export const linkSVG = resolveAssetUrl("app/assets/link.svg");
export const xSVG = resolveAssetUrl("app/assets/x.svg");
export const requeueSVG = resolveAssetUrl("app/assets/requeue.svg");
export const playSVG = resolveAssetUrl("app/assets/play.svg");
export const pauseSVG = resolveAssetUrl("app/assets/pause.svg");
export const skipSVG = resolveAssetUrl("app/assets/skip.svg");
export const idleSVG = resolveAssetUrl("app/assets/idle.svg");
export const startingSVG = resolveAssetUrl("app/assets/starting.svg");
export const remoteSVG = resolveAssetUrl("app/assets/remote.svg");
export const errorSVG = resolveAssetUrl("app/assets/error.svg");
export const googleSVG = resolveAssetUrl("app/assets/google.svg");
export const chromiumSVG = resolveAssetUrl("app/assets/chromium.svg");
export const lockSVG = resolveAssetUrl("app/assets/lock.svg");
export const fullscreenSVG = resolveAssetUrl("app/assets/fullscreen.svg");
export const exitFullscreenSVG = resolveAssetUrl("app/assets/exit-fullscreen.svg");

// Stroke-based paths for smoother look
export const seekRewindPath = "M 3 12 a 9 9 0 1 0 9 -9 9.75 9.75 0 0 0 -6.74 2.74 L 3 8";
export const seekRewindArrow = "M 3 3 l 0 5 l 5 0";
export const seekForwardPath = "M 21 12 a 9 9 0 1 1 -9 -9 9.75 9.75 0 0 1 6.74 2.74 L 21 8";
export const seekForwardArrow = "M 21 3 l 0 5 l -5 0";
