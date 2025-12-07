import { LiveVar } from "/extension/app/@dep/zyx.js";

export default class DashboardQueue {
    constructor(queueData) {
        this.id = queueData.id;
        this.room_id = new LiveVar(queueData.room_id || null);
        this.room_code = new LiveVar(queueData.room_code || "");
        this.entry_count = new LiveVar(queueData.entry_count || 0);
        this.entries = new LiveVar(queueData.entries || []);
    }

    updateFromData(queueData) {
        if (queueData.room_id != null) this.room_id.set(queueData.room_id);
        if (queueData.room_code != null) this.room_code.set(queueData.room_code || "");
        if (queueData.entry_count != null) this.entry_count.set(queueData.entry_count || 0);
        if (queueData.entries != null) this.entries.set(queueData.entries || []);
    }
}
