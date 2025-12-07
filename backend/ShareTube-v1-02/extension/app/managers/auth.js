import state from "../state.js";
import { decodeJwt } from "../utils.js";

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
        console.log("ShareTube: applyAvatarFromToken");
        try {
            const auth_token = await this.authToken();
            if (!auth_token) {
                state.userId.set(0);
                state.avatarUrl.set("");
                return;
            }
            console.log("ShareTube: applyAvatarFromToken", auth_token);
            const claims = decodeJwt(auth_token);
            const picture = claims && claims.picture;
            state.avatarUrl.set(picture || "");
            try {
                state.userId.set(claims && (claims.sub != null ? Number(claims.sub) : 0));
            } catch {
                state.userId.set(0);
            }
        } catch (e) {
            console.warn("ShareTube applyAvatarFromToken failed", e);
        }
    }

    async openSignInWithGooglePopup() {
        const backendUrl = await this.backEndUrl();

        // Helper to open a centered popup window for OAuth flows
        const openCentered = (url, w, h) => {
            const left = Math.max(0, (screen.width - w) / 2);
            const top = Math.max(0, (screen.height - h) / 2);
            return window.open(url, "sharetube_login", `width=${w},height=${h},left=${left},top=${top}`);
        };

        // Open the OAuth popup
        openCentered(`${backendUrl}/auth/google/start`, 480, 640);

        // Listen for the OAuth callback message
        const handleMessage = async (evt) => {
            const data = evt.data || {};
            if (data.type === "newapp_auth" && data.token) {
                // Store the token
                await chrome.storage.local.set({ auth_token: data.token });

                // Apply avatar from the new token
                await this.applyAvatarFromToken();
                // Remove the message listener
                window.removeEventListener("message", handleMessage);
            }
        };

        // Add the message listener
        window.addEventListener("message", handleMessage);
    }
}
