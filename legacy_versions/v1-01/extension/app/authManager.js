import state from "./state.js";
import { decodeJwt } from "./utils.js";

// AuthManager handles authentication tokens, backend URL management, and API calls
export default class AuthManager {
    constructor(app) {
        this.app = app;
    }

    async backEndUrl() {
        const { backend_url } = await chrome.storage.sync.get(["backend_url"]);
        return (backend_url || "https://sharetube.wumbl3.xyz").replace(/\/+$/, "");
    }

    async authToken() {
        const { auth_token } = await chrome.storage.local.get(["auth_token"]);
        if (!auth_token) {
            console.warn("ShareTube: missing auth token");
            return null;
        }
        return auth_token;
    }

    async post(url, options = {}) {
        const base = await this.backEndUrl();
        const auth_token = await this.authToken();
        const res = await fetch(`${base}${url}`, {
            method: options.method || "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${auth_token}`,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        if (!res.ok) {
            console.warn("ShareTube: post failed", { status: res.status, url, options });
            return null;
        }
        return await res.json();
    }

    async applyAvatarFromToken() {
        try {
            const auth_token = await this.authToken();
            if (!auth_token) {
                state.avatarUrl.set("");
                state.userId.set(null);
                return;
            }
            const claims = decodeJwt(auth_token);
            const picture = claims && claims.picture;
            state.avatarUrl.set(picture || "");
            try {
                state.userId.set(claims && (claims.sub != null ? Number(claims.sub) : null));
            } catch {
                state.userId.set(null);
            }
        } catch (e) {
            console.warn("ShareTube applyAvatarFromToken failed", e);
        }
    }
}
