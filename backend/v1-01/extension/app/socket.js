// Log module load for diagnostics in the page console
console.log("cs/socket.js loaded");

import ShareTubeApp from "./app.js";
import state from "./state.js";
import { io } from "./dep/socket.io.min.esm.js";

// Ensure a single connected Socket.IO client on the provided app instance
export default class SocketManager {
    /**
     * @param {ShareTubeApp} app
     */
    constructor(app) {
        this.app = app;
        this.binds = {};
    }

    async withSocket(callback) {
        if (!this.socket) await this.ensureSocket();
        return callback(this.socket);
    }

    async ensureSocket() {
        // Reuse existing socket if already connected/created
        if (this.socket) return this.socket;
        // Read backend base URL from extension synced storage (user-configurable)
        const { backend_url } = await chrome.storage.sync.get(["backend_url"]);
        // Normalize base by trimming trailing slashes; default to hosted backend
        const base = (backend_url || "https://sharetube.wumbl3.xyz").replace(/\/+$/, "");
        // Retrieve JWT token issued by backend, stored locally (per-device)
        const { auth_token } = await chrome.storage.local.get(["auth_token"]);
        // Without a token, we cannot authenticate the websocket
        if (!auth_token) return null;
        try {
            // Create a websocket-only Socket.IO client with auth token in query
            this.socket = io(base, { transports: ["websocket"], path: "/socket.io", query: { token: auth_token } });
            // Basic connection lifecycle logs
            this.socket.on("connect", () => console.log("socket.io connected"));
            this.socket.on("disconnect", () => console.log("socket.io disconnected"));
            // Low-level channel diagnostics/ping
            this.socket.on("hello", (payload) => console.log("socket.io hello", payload));
            this.socket.on("pong", (payload) => console.log("socket.io pong", payload));
            this.bindHandlers();
        } catch (e) {
            // If connection fails, reset socket and warn
            console.warn("socket.io connect failed", e);
            this.socket = null;
        }
        // Return the (possibly null) socket reference
        return this.socket;
    }

    bindHandlers() {
        // Bind any additional event handlers
        for (const [event, callback] of Object.entries(this.binds)) {
            this.socket.on(event, (...args) => this.logSocketEvent(event, ...args) && callback(...args));
        }
    }

    logSocketEvent(...args) {
        console.log("[ShTb] socket.io", ...args);
        return true;
    }

    on(event, callback) {
        if (this.socket) {
            this.socket.on(event, callback);
        } else {
            this.binds[event] = callback;
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    setupBeforeUnloadHandler() {
        window.addEventListener("beforeunload", () => {
            this.withSocket(async (socket) => {
                await socket.emit("leave_room", { code: state.currentRoomCode.get() });
            }); 
        });
    }
}
