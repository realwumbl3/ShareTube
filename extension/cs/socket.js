// Log module load for diagnostics in the page console
console.log("cs/socket.js loaded");

// io is globally available from socket.io.min.js loaded by the extension manifest

// Ensure a single connected Socket.IO client on the provided app instance
export async function ensureSocket(app) {
    // Reuse existing socket if already connected/created
    if (app.socket) return app.socket;
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
        app.socket = io(base, { transports: ["websocket"], path: "/socket.io", query: { token: newapp_token } });
        // Basic connection lifecycle logs
        app.socket.on("connect", () => console.log("socket.io connected"));
        app.socket.on("disconnect", () => console.log("socket.io disconnected"));
        // Low-level channel diagnostics/ping
        app.socket.on("hello", (payload) => console.log("socket.io hello", payload));
        app.socket.on("pong", (payload) => console.log("socket.io pong", payload));
        // app.socket.on("system_stats", (payload) => console.log("socket.io system_stats", payload));
        // Room lifecycle and state events wired to corresponding app handlers
        app.socket.on("room_create_result", (res) => app.onRoomCreateResult(res));
        app.socket.on("room_join_result", (res) => app.onRoomJoinResult(res));
        app.socket.on("room_presence", (payload) => app.onRoomPresence(payload));
        app.socket.on("queue_snapshot", (payload) => app.onQueueSnapshot(payload));
        app.socket.on("room_state_change", (payload) => app.onRoomStateChange(payload));
        app.socket.on("room_playback", (payload) => app.onRoomPlayback && app.onRoomPlayback(payload));
        app.socket.on("room_seek", (payload) => app.onRoomSeek && app.onRoomSeek(payload));
        app.socket.on("room_ad_pause", (payload) => app.onRoomAdPause && app.onRoomAdPause(payload));
        app.socket.on("room_ad_resume", (payload) => app.onRoomAdResume && app.onRoomAdResume(payload));
        app.socket.on("room_ad_status", (payload) => app.onRoomAdStatus && app.onRoomAdStatus(payload));
        app.socket.on("vote_skip_result", (res) => app.onVoteSkipResult && app.onVoteSkipResult(res));
        // Throttle helper for player_status emissions maintained on the socket object
        app.socket._lastPlayerEmit = 0;
    } catch (e) {
        // If connection fails, reset socket and warn
        console.warn("socket.io connect failed", e);
        app.socket = null;
    }
    // Return the (possibly null) socket reference
    return app.socket;
}


