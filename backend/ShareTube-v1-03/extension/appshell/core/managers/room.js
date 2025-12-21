import state from "../state/state.js";
import ShareTubeUser from "../models/user.js";
import { syncLiveList, isYouTubeUrl } from "../utils/utils.js";

// RoomManager handles room creation, joining, URL management, and room-related socket events
export default class RoomManager {
    constructor(app) {
        this.app = app;
    }

    get hashRoomCode() {
        return (new URL(window.location.href).hash || "").replace("#st:", "").trim();
    }

    stHash(code) {
        return `#st:${code}`;
    }

    updateCodeHashInUrl(code) {
        const isYoutube = isYouTubeUrl(window.location.href);
        const url = isYoutube ? new URL(window.location.href) : new URL("https://www.youtube.com/");

        url.hash = this.stHash(code);

        if (isYoutube) {
            history.replaceState(null, "", url.toString());
        } else {
            window.location.href = url.toString();
        }
    }

    async createRoom() {
        try {
            const res = await this.app.post("/api/room.create");
            return res && res.code;
        } catch (e) {
            console.warn("ShareTube createRoom failed", e);
            return null;
        }
    }

    async tryJoinRoomFromUrl() {
        if (!this.hashRoomCode) return;
        await this.app.socket.joinRoom(this.hashRoomCode);
    }

    async copyCurrentRoomCodeToClipboard() {
        const code = state.roomCode.get();
        if (!code) return;
        try {
            const isYoutube = isYouTubeUrl(window.location.href);
            const url = isYoutube ? new URL(window.location.href) : new URL("https://www.youtube.com/");
            url.hash = this.stHash(code);
            await navigator.clipboard.writeText(url.toString());
        } catch (_) {
            console.warn("ShareTube copyCurrentRoomCodeToClipboard failed", _);
        }
    }

    async onSocketPresenceUpdate(presence) {
        if (!Array.isArray(presence)) return;
        syncLiveList({
            localList: state.users,
            remoteItems: presence,
            extractRemoteId: (v) => v.id,
            extractLocalId: (u) => u.id,
            createInstance: (item) => new ShareTubeUser(item),
            updateInstance: (u, item) => u.updateFromRemote(item),
        });
    }

    onSocketUserReadyUpdate(payload) {
        if (!payload || payload.user_id == null) return;
        const user = state.getUserById(payload.user_id);
        if (!user || !user.ready) return;
        user.ready.set(Boolean(payload.ready));
    }

}
