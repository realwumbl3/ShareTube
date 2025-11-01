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
