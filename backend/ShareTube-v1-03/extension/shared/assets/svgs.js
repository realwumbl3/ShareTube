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

export const openInNewTabSVG = resolveAssetUrl("shared/assets/open-in-new-tab.svg");
export const linkSVG = resolveAssetUrl("shared/assets/link.svg");
export const xSVG = resolveAssetUrl("shared/assets/x.svg");
export const requeueSVG = resolveAssetUrl("shared/assets/requeue.svg");
export const playSVG = resolveAssetUrl("shared/assets/play.svg");
export const pauseSVG = resolveAssetUrl("shared/assets/pause.svg");
export const skipSVG = resolveAssetUrl("shared/assets/skip.svg");
export const idleSVG = resolveAssetUrl("shared/assets/idle.svg");
export const startingSVG = resolveAssetUrl("shared/assets/starting.svg");
export const remoteSVG = resolveAssetUrl("shared/assets/remote.svg");
export const errorSVG = resolveAssetUrl("shared/assets/error.svg");
export const googleSVG = resolveAssetUrl("shared/assets/google.svg");
export const chromiumSVG = resolveAssetUrl("shared/assets/chromium.svg");
export const lockSVG = resolveAssetUrl("shared/assets/lock.svg");
export const fullscreenSVG = resolveAssetUrl("shared/assets/fullscreen.svg");
export const exitFullscreenSVG = resolveAssetUrl("shared/assets/exit-fullscreen.svg");
export const seekRewindSVG = resolveAssetUrl("shared/assets/seek-rewind.svg");
export const seekForwardSVG = resolveAssetUrl("shared/assets/seek-forward.svg");
