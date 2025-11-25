// StorageManager handles browser storage operations and listeners
export default class StorageManager {
    constructor(app) {
        this.app = app;
        this.storageListener = null;
    }

    getLocalStorage(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                resolve(result[key]);
            });
        });
    }

    attachBrowserListeners() {
        this.storageListener = (changes, area) => {
            if (area === "local" && changes.auth_token) this.app.applyAvatarFromToken();
        };
        chrome.storage.onChanged.addListener(this.storageListener);
    }

    detachBrowserListeners() {
        if (this.storageListener) chrome.storage.onChanged.removeListener(this.storageListener);
    }
}
