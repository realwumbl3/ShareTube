// Log module load for diagnostics in the page console
console.log("cs/socket.js loaded");

// io is globally available from socket.io.min.js loaded by the extension manifest

import ShareTubeApp from "../app.js";

// Ensure a single connected Socket.IO client on the provided app instance
export default class SocketManager {
    /**
     * @param {ShareTubeApp} app
     */
    constructor(app) {
        this.app = app;
    }

    async ensureSocket() {
        // Reuse existing socket if already connected/created
        if (this.socket) return this.socket;
        // Read backend base URL from extension synced storage (user-configurable)
        const { newapp_backend } = await chrome.storage.sync.get(["newapp_backend"]);
        // Normalize base by trimming trailing slashes; default to hosted backend
        const base = (newapp_backend || "https://sharetube.wumbl3.xyz").replace(/\/+$/, "");
        // Retrieve JWT token issued by backend, stored locally (per-device)
        const { newapp_token } = await chrome.storage.local.get(["newapp_token"]);
        // Without a token, we cannot authenticate the websocket
        if (!newapp_token) return null;
        try {
            // Create a websocket-only Socket.IO client with auth token in query
            this.socket = io(base, { transports: ["websocket"], path: "/socket.io", query: { token: newapp_token } });
            // Basic connection lifecycle logs
            this.socket.on("connect", () => console.log("socket.io connected"));
            this.socket.on("disconnect", () => console.log("socket.io disconnected"));
            // Low-level channel diagnostics/ping
            this.socket.on("hello", (payload) => console.log("socket.io hello", payload));
            this.socket.on("pong", (payload) => console.log("socket.io pong", payload));
            // app.socket.on("system_stats", (payload) => console.log("socket.io system_stats", payload));
            // Room lifecycle and state events wired to separated managers
            this.socket.on("room_create_result", (res) => this.app.roomManager?.onRoomCreateResult(res));
            this.socket.on("room_join_result", (res) => this.app.roomManager?.onRoomJoinResult(res));
            this.socket.on("room_presence", (payload) => this.app.presenceManager?.onRoomPresence(payload));
            this.socket.on("queue_snapshot", (payload) => this.app.queueManager?.onQueueSnapshot(payload));
            this.socket.on("room_state_change", (payload) => this.app.roomManager?.onRoomStateChange(payload));
            this.socket.on("room_playback", (payload) => this.app.roomManager?.onRoomPlayback(payload));
            this.socket.on("room_seek", (payload) => this.app.roomManager?.onRoomSeek(payload));
            this.socket.on("room_ad_pause", (payload) => this.app.roomManager?.onRoomAdPause(payload));
            this.socket.on("room_ad_resume", (payload) => this.app.roomManager?.onRoomAdResume(payload));
            this.socket.on("room_ad_status", (payload) => this.app.roomManager?.onRoomAdStatus(payload));
            this.socket.on("vote_skip_result", (res) => this.app.voteManager?.onVoteSkipResult?.(res));
            // Throttle helper for player_status emissions maintained on the socket object
            this.socket._lastPlayerEmit = 0;
        } catch (e) {
            // If connection fails, reset socket and warn
            console.warn("socket.io connect failed", e);
            this.socket = null;
        }
        // Return the (possibly null) socket reference
        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}   
