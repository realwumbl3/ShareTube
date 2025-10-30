// Log module load for diagnostics
console.log("cs/utils.js loaded");

// Decode a JWT payload into an object without verification (for avatar display)
export function decodeJwt(token) {
    try {
        const payload = token.split(".")[1];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
        try {
            console.debug("[ShareTube] decodeJwt failed", e);
        } catch (_) {}
        return null;
    }
}
