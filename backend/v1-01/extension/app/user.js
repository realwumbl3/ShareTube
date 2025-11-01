import { LiveVar, LiveList } from "./dep/zyx.js";

export default class ShareTubeUser {
    constructor(item) {
        this.id = item.id;
        this.name = new LiveVar(item.name || "");
        this.avatarUrl = new LiveVar(item.picture || "");
    }

    updateFromRemote(item) {
        if (item.name != null) this.name.set(item.name || "");
        if (item.picture != null) this.avatarUrl.set(item.picture || "");
    }
}
