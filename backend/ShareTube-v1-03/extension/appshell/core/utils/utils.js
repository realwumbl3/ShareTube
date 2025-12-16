// Log module load for diagnostics
console.log("cs/utils.js loaded");

// Decode a JWT payload into an object without verification (for avatar display)
export function decodeJwt(token) {
    try {
        const payload = token.split(".")[1];
        const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(b64);
        let jsonStr;
        if (typeof TextDecoder !== "undefined") {
            const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
            jsonStr = new TextDecoder("utf-8").decode(bytes);
        } else {
            const percentEncoded = Array.prototype.map
                .call(binary, (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
                .join("");
            jsonStr = decodeURIComponent(percentEncoded);
        }
        return JSON.parse(jsonStr);
    } catch (e) {
        try {
            console.debug("[ShareTube] decodeJwt failed", e);
        } catch (_) {}
        return null;
    }
}

// Extract URLs from a drag-and-drop DataTransfer payload
export function extractUrlsFromDataTransfer(dt) {
    const urls = [];
    try {
        const uriList = dt.getData && dt.getData("text/uri-list");
        if (uriList) {
            uriList.split(/\r?\n/).forEach((line) => {
                if (!line || line.startsWith("#")) return;
                urls.push(line.trim());
            });
        }
    } catch (e) {
        try {
            console.debug("[ShareTube] extractUrlsFromDataTransfer uri-list failed", e);
        } catch (_) {}
    }
    try {
        const text = dt.getData && dt.getData("text/plain");
        if (text) {
            const regex = /https?:\/\/[^\s)]+/g;
            let m;
            while ((m = regex.exec(text)) !== null) {
                urls.push(m[0]);
            }
        }
    } catch (e) {
        try {
            console.debug("[ShareTube] extractUrlsFromDataTransfer text failed", e);
        } catch (_) {}
    }
    const seen = new Set();
    const out = [];
    for (const u of urls) {
        if (seen.has(u)) continue;
        seen.add(u);
        out.push(u);
    }
    return out;
}

// Check whether a URL belongs to YouTube properties
export function isYouTubeUrl(u) {
    try {
        const url = new URL(u);
        const host = url.hostname.replace(/^www\./, "");
        if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function msDurationTimeStamp(ms) {
    return ms ? new Date(ms).toISOString().substr(11, 8) : "00:00:00";
}

/**
 * Extract YouTube video ID from a URL or raw ID string
 * Handles formats: youtube.com/watch?v=, youtu.be/, /shorts/
 * @param {string} value - URL or video ID string
 * @returns {string} - Video ID or empty string if not found
 */
export function extractVideoId(value) {
    if (!value) return "";
    
    try {
        const url = new URL(value);
        const host = url.hostname.replace(/^www\./, "");
        
        // Short youtu.be links
        if (host === "youtu.be") {
            const vid = url.pathname.replace(/^\//, "");
            return vid || "";
        }
        
        // Full youtube.com links
        if (host === "youtube.com" || host.endsWith(".youtube.com")) {
            // Shorts URLs: /shorts/{id}
            if (url.pathname.startsWith("/shorts/")) {
                const parts = url.pathname.split("/");
                return parts[2] || "";
            }
            // Standard watch URLs: ?v={id}
            const v = url.searchParams.get("v");
            if (v) return v;
        }
    } catch (e) {
        // If URL parsing fails, try regex fallback
    }
    
    // Fallback: find any 11-char YouTube id-like token
    const match = value.match(/[a-zA-Z0-9_-]{11}/);
    return match ? match[0] : "";
}

// Generic helper to synchronize a local observable list with a remote list
// of items identified by an id. It creates missing instances, optionally
// updates existing ones, and removes instances no longer present remotely
// by replacing the list contents in one operation.

/**
 * Synchronize a local LiveList of class instances with a remote list.
 *
 * @param {Object} opts
 * @param {any} opts.localList - LiveList-like object with get() and set(newArray)
 * @param {Array<any>} opts.remoteItems - Array of remote items (objects or ids)
 * @param {(remoteItem:any) => any} opts.extractRemoteId - Extract id from remote item
 * @param {(localInst:any) => any} opts.extractLocalId - Extract id from local instance
 * @param {(remoteItem:any) => any} opts.createInstance - Create a new local instance from remote item
 * @param {(localInst:any, remoteItem:any) => void} [opts.updateInstance] - Optional updater for existing instances
 * @returns {{created:number, updated:number, total:number}}
 */
export function syncLiveList(opts) {
    const { localList, remoteItems = [], extractRemoteId, extractLocalId, createInstance, updateInstance } = opts;

    const getArray = () => {
        if (Array.isArray(localList)) return localList;
        if (localList && typeof localList.get === "function") return localList.get();
        return [];
    };

    const splice = (start, deleteCount, ...items) => {
        if (localList && typeof localList.splice === "function") {
            return localList.splice(start, deleteCount, ...items);
        } else if (Array.isArray(localList)) {
            return localList.splice(start, deleteCount, ...items);
        } else if (localList && typeof localList.set === "function") {
            // Fallback for objects that only support set()
            // We perform the splice on the array copy and set it back
            const arr = getArray().slice();
            const res = arr.splice(start, deleteCount, ...items);
            localList.set(arr);
            return res;
        }
        return [];
    };

    let created = 0;
    let updated = 0;

    // 1. Remove items that are not in remoteItems
    const remoteIds = new Set();
    for (const item of remoteItems) {
        try {
            remoteIds.add(extractRemoteId(item));
        } catch (e) {
            console.error("syncLiveList extractRemoteId error", e, item);
        }
    }

    let currentArr = getArray();
    // Iterate backwards to safely remove
    for (let i = currentArr.length - 1; i >= 0; i--) {
        const localItem = currentArr[i];
        try {
            const id = extractLocalId(localItem);
            if (!remoteIds.has(id)) {
                splice(i, 1);
                // Refresh array reference if needed (depends on implementation, safe to assume we might need to)
                currentArr = getArray();
            }
        } catch (e) {
            console.error("syncLiveList extractLocalId error", e, localItem);
        }
    }

    // 2. Insert, Update, and Reorder
    for (let i = 0; i < remoteItems.length; i++) {
        const remoteItem = remoteItems[i];
        let remoteId;
        try {
            remoteId = extractRemoteId(remoteItem);
        } catch (e) {
            console.error("syncLiveList extractRemoteId loop error", e);
            continue;
        }

        currentArr = getArray();
        const localItem = currentArr[i];
        const localId = localItem ? extractLocalId(localItem) : null;

        if (localItem && localId === remoteId) {
            // Match in place
            if (updateInstance) {
                try {
                    updateInstance(localItem, remoteItem);
                    updated++;
                } catch (e) {
                    console.error("syncLiveList updateInstance error", e);
                }
            }
        } else {
            // Mismatch
            // Check if the item exists later in the list
            let foundIndex = -1;
            for (let j = i + 1; j < currentArr.length; j++) {
                try {
                    if (extractLocalId(currentArr[j]) === remoteId) {
                        foundIndex = j;
                        break;
                    }
                } catch (_) {}
            }

            if (foundIndex !== -1) {
                // Found later, move it here
                const foundItem = currentArr[foundIndex];
                splice(foundIndex, 1);
                splice(i, 0, foundItem);
                if (updateInstance) {
                    try {
                        updateInstance(foundItem, remoteItem);
                        updated++;
                    } catch (e) {
                        console.error("syncLiveList updateInstance move error", e);
                    }
                }
            } else {
                // Not found, create new
                try {
                    const newItem = createInstance(remoteItem);
                    splice(i, 0, newItem);
                    created++;
                } catch (e) {
                    console.error("syncLiveList createInstance error", e);
                }
            }
        }
    }

    return { created, updated, total: remoteItems.length };
}

/**
 * Throttles a function call, ensuring it is called at most once in a specified time frame.
 * Supports trailing execution to ensure the latest call is eventually executed.
 * @param {Object} that - The context in which the throttle is applied.
 * @param {string} keyname - The key name for the throttle.
 * @param {Function} func - The function to throttle.
 * @param {number} ms - The throttle duration in milliseconds.
 */
export function throttle(that, keyname, func, ms) {
    // Polyfill for GlobalGet(that, "throttlers")
    if (!that._throttlers) {
        Object.defineProperty(that, "_throttlers", {
            value: {},
            enumerable: false,
            writable: true,
        });
    }
    const map = that._throttlers;

    if (keyname in map) {
        const now = Date.now();
        const entry = map[keyname];

        // Always update the function to the latest one
        entry.func = func;

        if (now - entry.lastRun >= ms) {
            // Time has passed, run immediately
            entry.lastRun = now;
            if (entry.timeout) {
                clearTimeout(entry.timeout);
                entry.timeout = null;
            }
            try {
                entry.func();
            } catch (e) {
                throw new Error(e);
            }
        } else {
            // Throttled, ensure a trailing call is scheduled
            if (!entry.timeout) {
                const remaining = ms - (now - entry.lastRun);
                entry.timeout = setTimeout(() => {
                    entry.timeout = null;
                    entry.lastRun = Date.now();
                    try {
                        entry.func();
                    } catch (e) {
                        console.error(e);
                    }
                }, remaining);
            }
        }
    } else {
        // First call
        try {
            func();
        } catch (e) {
            throw new Error(e);
        }
        map[keyname] = {
            lastRun: Date.now(),
            func,
            timeout: null,
        };
    }
}
