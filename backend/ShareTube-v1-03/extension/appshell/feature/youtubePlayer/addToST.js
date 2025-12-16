import { css, html } from "../../../shared/dep/zyx.js";
import state from "../../core/state/state.js";
import { isYouTubeUrl } from "../../core/utils/utils.js";

css`
    .sharetube-thumb-add-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
        margin-right: 6px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        background: rgba(0, 0, 0, 0.55);
        color: var(--yt-spec-text-primary, #fff);
        font-family: "Roboto", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 11px;
        line-height: 18px;
        height: 20px;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
        transition: background 140ms ease, border-color 140ms ease, transform 80ms ease, box-shadow 140ms ease,
            opacity 120ms ease;
        opacity: 0;
        pointer-events: none;
    }

    .sharetube-thumb-add-btn:hover {
        background: rgba(0, 0, 0, 0.7);
        border-color: rgba(255, 255, 255, 0.45);
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
    }

    .sharetube-thumb-add-btn:active {
        transform: scale(0.97);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    }

    /* Reveal the +ST pill only when hovering a thumbnail card that has been enhanced */
    .sharetube-thumb-enhanced:hover .sharetube-thumb-add-btn {
        opacity: 1;
        pointer-events: auto;
    }
`;

// Injects a small "+ST" pill onto YouTube thumbnails that, when clicked,
// enqueues the corresponding video into the current ShareTube room (or
// creates one automatically, mirroring drag-and-drop behavior).
export default class ThumbnailExtAddToQueue {
    /**
     * @param {import("../app.js").default} app
     */
    constructor(app) {
        this.app = app;
        this.observer = null;

        // WeakSet to avoid double-injecting into the same renderer root.
        this.enhanced = new WeakSet();

        // Initial scan plus SPA-friendly observation.
        this.scanAllThumbnails();
        this.startObserving();
    }

    startObserving() {
        if (this.observer) return;
        try {
            this.observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (!(node instanceof HTMLElement)) continue;
                        this.maybeEnhanceContainer(node);
                    }
                }
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        } catch (e) {
            try {
                console.warn("[ShareTube] ThumbnailExtAddToQueue MutationObserver failed", e);
            } catch (_) {}
        }
    }

    stopObserving() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    get rendererSelector() {
        // Primary per-video containers across modern YouTube surfaces:
        // - ytd-rich-item-renderer: home/feed grid items
        // - ytd-video-renderer / ytd-compact-video-renderer / ytd-playlist-video-renderer: classic lists
        // - ytd-grid-video-renderer: horizontal shelves and some carousels
        // - yt-lockup-view-model: new lockup-based layouts inside
        //   yt-horizontal-list-renderer, ytd-watch-next-secondary-results-renderer, etc.
        return [
            "ytd-rich-item-renderer",
            "ytd-video-renderer",
            "ytd-compact-video-renderer",
            "ytd-playlist-video-renderer",
            "ytd-grid-video-renderer",
            "yt-lockup-view-model",
            "ytm-shorts-lockup-view-model",
        ].join(",");
    }

    scanAllThumbnails() {
        document.querySelectorAll(this.rendererSelector).forEach((el) => this.enhanceRenderer(el));
    }

    maybeEnhanceContainer(node) {
        const selector = this.rendererSelector;

        // If the node itself is a renderer, enhance it directly.
        if (node.matches && node.matches(selector)) {
            this.enhanceRenderer(node);
            return;
        }

        // Otherwise, look for any renderers inside this subtree.
        node.querySelectorAll?.(selector).forEach((el) => this.enhanceRenderer(el));
    }

    enhanceRenderer(rendererRoot) {
        if (!(rendererRoot instanceof HTMLElement)) return;
        if (this.enhanced.has(rendererRoot)) return;

        const url = this.getVideoUrlForRenderer(rendererRoot);
        if (!url || !isYouTubeUrl(url)) return;

        const metadataRow = this.getTargetMetadataRow(rendererRoot);
        if (!metadataRow) return;

        // Prevent double-injection into the same row (e.g., if YouTube reuses DOM).
        if (metadataRow.querySelector(".sharetube-thumb-add-btn")) {
            this.enhanced.add(rendererRoot);
            return;
        }

        const { main: btn } = html`
            <button
                type="button"
                zyx-click=${() => this.onClickAddToQueue(url)}
                class="sharetube-thumb-add-btn sharetube-feature"
                title="Add to ShareTube queue"
            >
                +ST
            </button>
        `.const();

        metadataRow.insertBefore(btn, metadataRow.firstChild || null);
        rendererRoot.classList.add("sharetube-thumb-enhanced");
        this.enhanced.add(rendererRoot);
    }

    getVideoUrlForRenderer(rendererRoot) {
        // Prefer content-image / primary watch links, then fall back.
        const link =
            rendererRoot.querySelector('a.yt-lockup-view-model__content-image[href*="/watch"]') ||
            rendererRoot.querySelector('a.yt-lockup-metadata-view-model__title[href*="/watch"]') ||
            rendererRoot.querySelector('a#thumbnail[href*="/watch"]') ||
            rendererRoot.querySelector('a#video-title[href*="/watch"]') ||
            rendererRoot.querySelector('a[href*="/watch"]') ||
            rendererRoot.querySelector('a[href*="/shorts/"]');

        if (!link) return null;

        try {
            // Many YouTube links are already absolute, but normalize just in case.
            const url = new URL(link.href, window.location.origin);
            return url.href;
        } catch {
            return null;
        }
    }

    getTargetMetadataRow(rendererRoot) {
        // New lockup-based homepage/search:
        const rows = rendererRoot.querySelectorAll(".yt-content-metadata-view-model__metadata-row");
        if (rows && rows.length) {
            // Prefer the second row (views / age) if present, otherwise first.
            return rows[1] || rows[0];
        }

        // Shorts lockup layouts on home/search.
        const shortsSubhead = rendererRoot.querySelector(".shortsLockupViewModelHostOutsideMetadataSubhead");
        if (shortsSubhead) return shortsSubhead;

        // Fallbacks for older layouts.
        const simpleMeta = rendererRoot.querySelector("#metadata-line");
        if (simpleMeta) return simpleMeta;

        return null;
    }

    async onClickAddToQueue(url) {
        if (!url) return;

        // Mirror the drag-and-drop behavior from UIManager: if not in a room,
        // create one and join before enqueuing.
        try {
            await this.ensureRoomAndEnqueue(url);
        } catch (e) {
            try {
                console.warn("[ShareTube] failed to enqueue from thumbnail", e);
            } catch (_) {}
        }
    }

    async ensureRoomAndEnqueue(url) {
        if (!state.inRoom.get()) {
            const code = await this.app.createRoom();
            if (code) {
                this.app.updateCodeHashInUrl(code);
                await this.app.tryJoinRoomFromUrl();

                // Wait briefly for join to complete.
                const start = Date.now();
                while (!state.inRoom.get()) {
                    if (Date.now() - start > 5000) break;
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((r) => setTimeout(r, 100));
                }
            }
        }

        if (state.inRoom.get()) {
            await this.app.enqueueUrl(url);
        }
    }
}
