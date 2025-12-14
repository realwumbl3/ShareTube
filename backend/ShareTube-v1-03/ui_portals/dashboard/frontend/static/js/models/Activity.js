import { LiveVar } from "/extension/shared/dep/zyx.js";

export default class DashboardActivity {
    constructor(activityData) {
        this.id = activityData.id;
        this.type = new LiveVar(activityData.type || "");
        this.user = new LiveVar(activityData.user || "");
        this.user_id = new LiveVar(activityData.user_id || null);
        this.room = new LiveVar(activityData.room || "");
        this.room_id = new LiveVar(activityData.room_id || null);
        this.details = new LiveVar(activityData.details || null);
        this.timestamp = new LiveVar(activityData.timestamp || null);
    }

    updateFromData(activityData) {
        if (activityData.type != null) this.type.set(activityData.type || "");
        if (activityData.user != null) this.user.set(activityData.user || "");
        if (activityData.user_id != null) this.user_id.set(activityData.user_id);
        if (activityData.room != null) this.room.set(activityData.room || "");
        if (activityData.room_id != null) this.room_id.set(activityData.room_id);
        if (activityData.details != null) this.details.set(activityData.details);
        if (activityData.timestamp != null) this.timestamp.set(activityData.timestamp);
    }
}
