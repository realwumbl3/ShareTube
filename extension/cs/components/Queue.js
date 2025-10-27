import { html, LiveVar } from "../zyx.js";

export default class ShareTubeQueue {
    get queueManager() {
        return this.app.queueManager;
    }

    get voteManager() {
        return this.app.voteManager;
    }

    /**

     * @param {ShareTubeApp} app
     */
    constructor(app) {
        this.app = app;

        this.queueVisible = new LiveVar(false);
        this.voteMenuVisible = new LiveVar(false);

        html`
            <div id="sharetube_queue" zyx-if=${[this.queueVisible, (v) => v]}>
                <div class="queue-header">
                    <span class="queue-title"
                        >Queue (<span id="sharetube_queue_count"
                            >${this.queueManager.queue.interp((v) => v.length)}</span
                        >)</span
                    >
                    <button class="rounded_btn" zyx-click=${() => this.toggleQueueVisibility()}>
                        ${this.queueVisible.interp((v) => (v ? "Hide" : "Show"))}
                    </button>
                    <div class="vote-menu-wrap">
                        <button
                            class="rounded_btn"
                            title="Vote"
                            zyx-click=${(z) => {
                                z.e.stopPropagation();
                                this.toggleVoteMenu();
                            }}
                        >
                            Vote
                        </button>
                        <div class="vote-menu" zyx-if=${[this.voteMenuVisible, (v) => v]}>
                            <button
                                class="rounded_btn"
                                zyx-click=${(z) => {
                                    z.e.stopPropagation();
                                    this.voteManager.startSkipVote();
                                }}
                            >
                                Skip current video
                            </button>
                        </div>
                    </div>
                </div>
                <div
                    class="queue-list"
                    id="sharetube_queue_list"
                    zyx-live-list=${{ list: this.queueManager.queue }}
                ></div>
                <div class="queue-footer"></div>
            </div>
        `.bind(this);
    }

    toggleQueueVisibility() {
        this.queueVisible.set(!this.queueVisible.get());
    }

    toggleVoteMenu(visible = null) {
        if (visible !== null) {
            this.voteMenuVisible.set(visible);
        } else {
            this.voteMenuVisible.set(!this.voteMenuVisible.get());
        }
        return this.voteMenuVisible.get();
    }
}
