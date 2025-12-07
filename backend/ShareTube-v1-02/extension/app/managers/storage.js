// StorageManager handles browser storage operations and listeners
export default class StorageManager {
    constructor(app) {
        this.app = app;
        this.storageListener = null;
    }

    getLocalStorage(key, defaultValue) {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                if (result[key] === undefined && defaultValue !== undefined) {
                    chrome.storage.local.set({ [key]: defaultValue }, () => {
                        resolve(defaultValue);
                    });
                } else {
                    resolve(result[key]);
                }
            });
        });
    }

    setLocalStorage(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, () => {
                resolve();
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
