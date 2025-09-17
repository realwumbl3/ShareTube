console.log("cs/socket.js loaded");

// io is globally available from socket.io.min.js loaded by manifest

export async function ensureSocket(app) {
	if (app.socket) return app.socket;
	const { newapp_backend } = await chrome.storage.sync.get(["newapp_backend"]);
	const base = newapp_backend || "http://localhost:5100";
	const { newapp_token } = await chrome.storage.local.get(["newapp_token"]);
	if (!newapp_token) return null;
	try {
		app.socket = io(base, { transports: ["websocket"], query: { token: newapp_token } });
		app.socket.on("connect", () => console.log("socket.io connected"));
		app.socket.on("disconnect", () => console.log("socket.io disconnected"));
		app.socket.on("hello", (payload) => console.log("socket.io hello", payload));
		app.socket.on("pong", (payload) => console.log("socket.io pong", payload));
		// app.socket.on("system_stats", (payload) => console.log("socket.io system_stats", payload));
		app.socket.on("room_create_result", (res) => app.onRoomCreateResult(res));
		app.socket.on("room_join_result", (res) => app.onRoomJoinResult(res));
		app.socket.on("room_presence", (payload) => app.onRoomPresence(payload));
		app.socket.on("queue_snapshot", (payload) => app.onQueueSnapshot(payload));
		app.socket.on("room_state_change", (payload) => app.onRoomStateChange(payload));
		app.socket._lastPlayerEmit = 0;
	} catch (e) {
		console.warn("socket.io connect failed", e);
		app.socket = null;
	}
	return app.socket;
}


