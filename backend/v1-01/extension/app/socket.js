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
        return await callback(this.socket);
    }

    async joinRoom(code) {
        return await this.emit("room.join", { code });
    }

    async ensureSocket() {
        // Reuse existing socket if already connected/created
        if (this.socket) return this.socket;
        // Read backend base URL from extension synced storage (user-configurable)
        // Normalize base by trimming trailing slashes; default to hosted backend
        const base = await this.app.backEndUrl();
        const auth_token = await this.app.authToken();
        // Without a token, we cannot authenticate the websocket
        if (!auth_token) return null;
        try {
            // Create a websocket-only Socket.IO client with auth token in query
            this.socket = io(base, { transports: ["websocket"], path: "/socket.io", query: { token: auth_token } });
            // Basic connection lifecycle logs
            this.socket.on("connect", () => {
                console.log("socket.io connected");
            });
            this.socket.on("disconnect", () => {
                console.log("socket.io disconnected");
                // When the underlying socket disconnects, we are no longer in
                // a valid room membership. Clear local room state so that the
                // extension stops emitting user.ready for a room the backend
                // has already torn down.
                try {
                    state.inRoom.set(false);
                    state.roomCode.set("");
                    state.roomState.set("");
                    this.app.player.onRoomStateChange("");
                } catch (e) {
                    console.warn("ShareTube: failed to clear room state on disconnect", e);
                }
            });
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
            this.socket.on(event, (...args) => callback(...args));
        }
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
            // Proactively leave the current room and clear local room flags so
            // that any late user.ready emissions (e.g. from video events
            // during navigation) are suppressed client‑side.
            try {
                state.inRoom.set(false);
                state.roomCode.set("");
                state.roomState.set("");
                this.app.player.onRoomStateChange("");
            } catch (e) {
                console.warn("ShareTube: failed to clear room state on beforeunload", e);
            }
            this.emit("room.leave");
        });
    }

    async emit(event, data) {
        return await this.withSocket(async (socket) => {
            return await socket.emit(event, {
                code: state.roomCode.get(),
                ...data,
            });
        });
    }

    async emitUserReady(ready) {
        return await this.emit("user.ready", { ready });
    }
}
