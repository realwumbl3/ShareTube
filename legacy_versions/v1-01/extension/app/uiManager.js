import { extractUrlsFromDataTransfer, isYouTubeUrl } from "./utils.js";

// UIManager handles UI behaviors like drag/drop, reveal/hide, and pill locking
export default class UIManager {
    constructor(app) {
        this.app = app;
    }

    onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.app.sharetube_main.classList.remove("dragover");
        const urls = extractUrlsFromDataTransfer(e.dataTransfer);
        const ytUrls = urls.filter(isYouTubeUrl);
        if (ytUrls.length === 0) return;
        ytUrls.forEach((u) => this.app.enqueueUrl(u));
    }

    onEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this.app.sharetube_main.classList.add("dragover");
        this.app.sharetube_main.classList.add("revealed");
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

    setupRevealBehavior() {
        this.app.sharetube_main.addEventListener("mouseenter", () => {
            this.app.sharetube_main.classList.add("revealed");
        });
        this.app.sharetube_main.addEventListener("mouseleave", () => {
            if (this.app.locked.get()) return;
            this.app.sharetube_main.classList.remove("revealed");
        });
    }

    setupPillLockBehavior() {
        this.app.sharetube_pill.addEventListener("click", (e) => {
            if (e.target !== this.app.sharetube_pill || this.app.locked.get()) return;
            this.setLock(true);
        });
    }

    async setLock(locked) {
        this.app.locked.set(locked);
        await chrome.storage.local.set({ locked: locked });
        if (locked) {
            this.app.sharetube_main.classList.add("revealed");
        } else {
            if (!this.app.sharetube_main.matches(":hover")) {
                this.app.sharetube_main.classList.remove("revealed");
            }
        }
    }
}
