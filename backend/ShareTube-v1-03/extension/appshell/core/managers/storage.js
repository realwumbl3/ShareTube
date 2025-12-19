// StorageManager handles browser storage operations and listeners
export default class StorageManager {
    constructor(app) {
        this.app = app;
        this.storageListener = null;
        // Detect if we are in an extension context with storage permissions
        this.isExtension = typeof chrome !== "undefined" && !!chrome.storage && !!chrome.storage.local;
    }

    async get(key, defaultValue, area = "local") {
        if (this.isExtension) {
            console.log("StorageManager: Getting local storage in extension", { key, defaultValue, area });
            const storage = area === "sync" ? chrome.storage.sync : chrome.storage.local;
            return new Promise((resolve) => {
                storage.get(key, (result) => {
                    if (result[key] === undefined && defaultValue !== undefined) {
                        storage.set({ [key]: defaultValue }, () => {
                            resolve(defaultValue);
                        });
                    } else {
                        resolve(result[key]);
                    }
                });
            });
        } else {
            console.log("StorageManager: Getting local storage in browser", { key, defaultValue, area });
            const val = localStorage.getItem(key);
            if (val === null && defaultValue !== undefined) {
                localStorage.setItem(key, JSON.stringify(defaultValue));
                return defaultValue;
            }
            try {
                return val !== null ? JSON.parse(val) : undefined;
            } catch (e) {
                return val;
            }
        }
    }

    async set(key, value, area = "local") {
        if (this.isExtension) {
            console.log("StorageManager: Setting local storage in extension", { key, value, area });
            const storage = area === "sync" ? chrome.storage.sync : chrome.storage.local;
            return new Promise((resolve) => {
                storage.set({ [key]: value }, () => {
                    resolve();
                });
            });
        } else {
            console.log("StorageManager: Setting local storage in browser", { key, value, area });
            localStorage.setItem(key, JSON.stringify(value));
            return Promise.resolve();
        }
    }

    async remove(keys, area = "local") {
        if (this.isExtension) {
            console.log("StorageManager: Removing local storage in extension", { keys, area });
            const storage = area === "sync" ? chrome.storage.sync : chrome.storage.local;
            return new Promise((resolve) => {
                storage.remove(keys, () => {
                    resolve();
                });
            });
        } else {
            console.log("StorageManager: Removing local storage in browser", { keys, area });
            if (Array.isArray(keys)) {
                keys.forEach((key) => localStorage.removeItem(key));
            } else {
                localStorage.removeItem(keys);
            }
            return Promise.resolve();
        }
    }

    // Compatibility aliases
    async getLocalStorage(key, defaultValue) {
        return this.get(key, defaultValue, "local");
    }

    async setLocalStorage(key, value) {
        return this.set(key, value, "local");
    }

    async removeLocalStorage(keys) {
        return this.remove(keys, "local");
    }

    attachBrowserListeners() {
        if (this.isExtension) {
            this.storageListener = (changes, area) => {
                if (area === "local" && changes.auth_token) this.app.applyAvatarFromToken();
            };
            chrome.storage.onChanged.addListener(this.storageListener);
        } else {
            this.storageListener = (event) => {
                if (event.key === "auth_token") this.app.applyAvatarFromToken();
            };
            window.addEventListener("storage", this.storageListener);
        }
    }

    detachBrowserListeners() {
        if (this.isExtension) {
            if (this.storageListener) chrome.storage.onChanged.removeListener(this.storageListener);
        } else {
            if (this.storageListener) window.removeEventListener("storage", this.storageListener);
        }
    }
}
