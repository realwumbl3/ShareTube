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
export const seekRewindSVG = resolveAssetUrl("app/assets/seek-rewind.svg");
export const seekForwardSVG = resolveAssetUrl("app/assets/seek-forward.svg");
