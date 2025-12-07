import { LiveVar } from "/extension/app/@dep/zyx.js";

export default class DashboardRoom {
    constructor(roomData) {
        this.id = roomData.id;
        this.code = new LiveVar(roomData.code || "");
        this.name = new LiveVar(roomData.name || "");
        this.owner = new LiveVar(roomData.owner || "");
        this.owner_id = new LiveVar(roomData.owner_id || null);
        this.is_active = new LiveVar(Boolean(roomData.is_active));
        this.is_public = new LiveVar(Boolean(roomData.is_public));
        this.member_count = new LiveVar(roomData.member_count || 0);
        this.queue_count = new LiveVar(roomData.queue_count || 0);
        this.recent_activity = new LiveVar(roomData.recent_activity || 0);
        this.created_at = new LiveVar(roomData.created_at || null);
    }

    updateFromData(roomData) {
        if (roomData.code != null) this.code.set(roomData.code || "");
        if (roomData.name != null) this.name.set(roomData.name || "");
        if (roomData.owner != null) this.owner.set(roomData.owner || "");
        if (roomData.owner_id != null) this.owner_id.set(roomData.owner_id);
        if (roomData.is_active != null) this.is_active.set(Boolean(roomData.is_active));
        if (roomData.is_public != null) this.is_public.set(Boolean(roomData.is_public));
        if (roomData.member_count != null) this.member_count.set(roomData.member_count || 0);
        if (roomData.queue_count != null) this.queue_count.set(roomData.queue_count || 0);
        if (roomData.recent_activity != null) this.recent_activity.set(roomData.recent_activity || 0);
        if (roomData.created_at != null) this.created_at.set(roomData.created_at);
    }
}
