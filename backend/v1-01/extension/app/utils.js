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
    const { localList, remoteItems, extractRemoteId, extractLocalId, createInstance, updateInstance } = opts;

    const current =
        localList && typeof localList.get === "function" ? localList.get() : Array.isArray(localList) ? localList : [];
    const idToLocal = new Map();
    for (const inst of current) {
        try {
            idToLocal.set(extractLocalId(inst), inst);
        } catch (e) {
            console.error("syncLiveList extractLocalId error", e, inst);
        }
    }

    const next = [];
    let created = 0;
    let updated = 0;
    for (const remoteItem of remoteItems || []) {
        let id;
        try {
            id = extractRemoteId(remoteItem);
        } catch (e) {
            console.error("syncLiveList extractRemoteId error", e, remoteItem);
            continue;
        }
        const existing = idToLocal.get(id);
        if (existing) {
            if (typeof updateInstance === "function") {
                try {
                    updateInstance(existing, remoteItem);
                    updated += 1;
                } catch (e) {
                    console.error("syncLiveList updateInstance error", e);
                    // ignore update errors to keep sync resilient
                }
            }
            next.push(existing);
        } else {
            try {
                const createdInst = createInstance(remoteItem);
                next.push(createdInst);
                created += 1;
            } catch (e) {
                console.error("syncLiveList createInstance error", e);
                // ignore create errors to keep sync resilient
            }
        }
    }

    // Replace the list atomically to reflect creations, updates (in-place), and removals
    if (localList && typeof localList.set === "function") {
        localList.set(next);
    } else if (Array.isArray(localList)) {
        localList.splice(0, localList.length, ...next);
    }

    return { created, updated, total: next.length };
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
