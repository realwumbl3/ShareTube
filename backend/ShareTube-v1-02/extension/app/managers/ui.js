import { extractUrlsFromDataTransfer, isYouTubeUrl } from "../utils.js";

import state from "../state.js";

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

        await this.enqueueUrlsOrCreateRoom(ytUrls);
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

    async enqueueUrlsOrCreateRoom(urls) {
        if (!urls || urls.length === 0) return;

        if (!state.inRoom.get()) {
            const code = await this.app.createRoom();
            if (code) {
                this.app.updateCodeHashInUrl(code);
                await this.app.tryJoinRoomFromUrl();
                // Wait for join to complete
                const start = Date.now();
                while (!state.inRoom.get()) {
                    if (Date.now() - start > 5000) break;
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((r) => setTimeout(r, 100));
                }
            }
        }

        if (state.inRoom.get()) {
            urls.forEach((u) => this.app.enqueueUrl(u));
        }
    }
}
