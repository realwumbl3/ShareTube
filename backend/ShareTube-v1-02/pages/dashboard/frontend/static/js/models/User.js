import { LiveVar } from "/extension/app/dep/zyx.js";

export default class DashboardUser {
    constructor(userData) {
        this.id = userData.id;
        this.name = new LiveVar(userData.name || "");
        this.email = new LiveVar(userData.email || "");
        this.active = new LiveVar(Boolean(userData.active));
        this.last_seen = new LiveVar(userData.last_seen || null);
        this.created_at = new LiveVar(userData.created_at || null);
        this.room_count = new LiveVar(userData.room_count || 0);
        this.videos_added = new LiveVar(userData.videos_added || 0);
    }

    updateFromData(userData) {
        if (userData.name != null) this.name.set(userData.name || "");
        if (userData.email != null) this.email.set(userData.email || "");
        if (userData.active != null) this.active.set(Boolean(userData.active));
        if (userData.last_seen != null) this.last_seen.set(userData.last_seen);
        if (userData.created_at != null) this.created_at.set(userData.created_at);
        if (userData.room_count != null) this.room_count.set(userData.room_count || 0);
        if (userData.videos_added != null) this.videos_added.set(userData.videos_added || 0);
    }
}
