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
