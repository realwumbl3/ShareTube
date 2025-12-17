import { extractUrlsFromDataTransfer, isYouTubeUrl } from "../utils/utils.js";

import state from "../state/state.js";

// UIManager handles UI behaviors like drag/drop, reveal/hide, and pill locking
export default class UIManager {
    constructor(app) {
        this.app = app;
    }

    async onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.app.sharetube_main.classList.remove("dragover");
        const urls = extractUrlsFromDataTransfer(e.dataTransfer);
        const ytUrls = urls.filter(isYouTubeUrl);
        if (ytUrls.length === 0) return;

        await this.app.virtualPlayer.enqueueUrlsOrCreateRoom(ytUrls);
    }

    onEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this.app.sharetube_main.classList.add("dragover");
        this.app.sharetubePill.reveal();
    }

    onOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        this.app.sharetube_main.classList.add("dragover");
    }

    onLeave(e) {
        e.preventDefault();
        this.app.sharetube_main.classList.remove("dragover");
    }

    setupDragAndDrop() {
        this.app.sharetube_main.addEventListener("dragenter", this.onEnter.bind(this));
        this.app.sharetube_main.addEventListener("dragover", this.onOver.bind(this));
        this.app.sharetube_main.addEventListener("dragleave", this.onLeave.bind(this));
        this.app.sharetube_main.addEventListener("drop", this.onDrop.bind(this));
    }
}
