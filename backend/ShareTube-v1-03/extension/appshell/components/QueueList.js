import { html, css } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";
import { ShareTubeQueueComponent } from "./QueueEntry.js";
import { ShareTubeQueueDrag } from "./QueueDragging.js";
import { queuedSVG, playSVG, skipSVG, xSVG } from "../../shared/assets/svgs.js";
import { resolveAssetUrl } from "../../shared/urlResolver.js";

css`
    @import url(${resolveAssetUrl("shared/css/queue-selector.css")});
    @import url(${resolveAssetUrl("shared/css/queue-list.css")});
`;

export default class QueueList {
    constructor() {
        this.dragManager = new ShareTubeQueueDrag();

        html`
            <div class="queue_list_container">
                <div class="queue_selector">
                    <div
                        class="queue_selector_item"
                        zyx-radioview="queues.queued.open"
                        title="${state.queueQueued.interp((v) => `${v.length} videos queued`)}"
                    >
                        <img src=${queuedSVG} alt="Queued" class="queue_selector_icon" />
                        <span class="queue_selector_count">${state.queueQueued.interp((v) => v.length)}</span>
                    </div>
                    <div
                        class="queue_selector_item"
                        zyx-radioview="queues.played.open"
                        title="${state.queuePlayed.interp((v) => `${v.length} videos played`)}"
                    >
                        <img src=${playSVG} alt="Played" class="queue_selector_icon" />
                        <span class="queue_selector_count">${state.queuePlayed.interp((v) => v.length)}</span>
                    </div>
                    <div
                        class="queue_selector_item"
                        zyx-radioview="queues.skipped.open"
                        title="${state.queueSkipped.interp((v) => `${v.length} videos skipped`)}"
                    >
                        <img src=${skipSVG} alt="Skipped" class="queue_selector_icon" />
                        <span class="queue_selector_count">${state.queueSkipped.interp((v) => v.length)}</span>
                    </div>
                    <div
                        class="queue_selector_item"
                        zyx-radioview="queues.deleted.open"
                        title="${state.queueDeleted.interp((v) => `${v.length} videos deleted`)}"
                    >
                        <img src=${xSVG} alt="Deleted" class="queue_selector_icon" />
                        <span class="queue_selector_count">${state.queueDeleted.interp((v) => v.length)}</span>
                    </div>
                </div>

                <div class="queues">
                    <div class="queue_container" zyx-radioview="queues.queued">
                        <div
                            zyx-if=${[state.queueQueued, (v) => v.length > 0]}
                            class="queue-list queued"
                            id="sharetube_queue_list"
                            zyx-dragstart=${(e) => this.dragManager.onListDragStart(e)}
                            zyx-dragend=${(e) => this.dragManager.onListDragEnd(e)}
                            zyx-dragover=${(e) => this.dragManager.onListDragOver(e)}
                            zyx-dragenter=${(e) => this.dragManager.onListDragEnter(e)}
                            zyx-dragleave=${(e) => this.dragManager.onListDragLeave(e)}
                            zyx-drop=${(e) => this.dragManager.onListDrop(e)}
                            zyx-live-list=${{
                                list: state.queueQueued,
                                compose: ShareTubeQueueComponent,
                            }}
                        >
                            <div class="queue-list-header">
                                <span class="queue-list-header-title">Queued</span>
                            </div>
                            <div container class="list-container"></div>
                        </div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">Queue is empty</span>
                        </div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.played">
                        <div
                            zyx-if=${[state.queuePlayed, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queuePlayed,
                                compose: ShareTubeQueueComponent,
                            }}
                        >
                            <div class="queue-list-header">
                                <span class="queue-list-header-title">Played</span>
                            </div>
                            <div container></div>
                        </div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">No videos played</span>
                        </div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.skipped">
                        <div
                            zyx-if=${[state.queueSkipped, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queueSkipped,
                                compose: ShareTubeQueueComponent,
                            }}
                        >
                            <div class="queue-list-header">
                                <span class="queue-list-header-title">Skipped</span>
                            </div>
                            <div container></div>
                        </div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">No videos skipped</span>
                        </div>
                    </div>
                    <div class="queue_container" zyx-radioview="queues.deleted">
                        <div
                            zyx-if=${[state.queueDeleted, (v) => v.length > 0]}
                            class="queue-list"
                            id="sharetube_queue_list"
                            zyx-live-list=${{
                                list: state.queueDeleted,
                                compose: ShareTubeQueueComponent,
                            }}
                        >
                            <div class="queue-list-header">
                                <span class="queue-list-header-title">Deleted</span>
                            </div>
                            <div container></div>
                        </div>
                        <div zyx-else class="queue-empty">
                            <span class="queue-empty-text">No videos deleted</span>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
    }
}
