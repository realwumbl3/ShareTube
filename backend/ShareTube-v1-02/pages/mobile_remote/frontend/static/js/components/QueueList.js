import { html, css, LiveVar } from "/extension/app/dep/zyx.js";

class QueueItem {
    constructor(app, queueData, index) {
        this.app = app;
        this.data = queueData;
        this.index = index;
        this.isActive = index === 0;

        html`
            <div class="queue-item ${this.isActive ? "active" : ""}" zyx-click=${() => this.handleClick()}>
                <div class="title">${queueData.title}</div>
                <div class="duration">${this.formatDuration(queueData.duration)}</div>
            </div>
        `.bind(this);
    }

    handleClick() {
        this.app.selectQueueItem(this.data.id);
    }

    formatDuration(seconds) {
        if (!seconds) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
}

export default class QueueList {
    constructor(app) {
        this.app = app;

        html`
            <div class="queue-list">
                <div
                    zyx-if=${[this.app.queue, (items) => items.length > 0]}
                    zyx-live-list=${{
                        list: this.app.queue,
                        compose: (item, index) => new QueueItem(this.app, item, index),
                    }}
                ></div>
                <div zyx-else class="empty-queue">No videos in queue</div>
            </div>
        `.bind(this);
    }
}

css`
    .queue-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .queue-item {
        padding: 1rem;
        background: var(--bg-panel);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        outline: 1px solid var(--glass-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }

    .queue-item::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at top right, var(--glass-shine), transparent 60%);
        opacity: 0;
        transition: opacity 0.3s;
    }

    .queue-item:hover {
        background: var(--bg-panel-hover);
        outline-color: var(--accent-primary);
        box-shadow: var(--glow-primary);
        transform: translateY(-1px);
    }

    .queue-item:hover::before {
        opacity: 0.7;
    }

    .queue-item.active {
        background: linear-gradient(135deg, rgba(0, 243, 255, 0.1), rgba(188, 19, 254, 0.1));
        outline-color: var(--accent-primary);
        box-shadow: var(--glow-primary);
    }

    .queue-item.active::before {
        opacity: 0.8;
    }

    .queue-item .title {
        font-weight: 500;
        margin-bottom: 0.25rem;
        color: var(--text-primary);
    }

    .queue-item .duration {
        opacity: 0.7;
        font-size: 0.9rem;
        color: var(--text-secondary);
    }

    .empty-queue {
        text-align: center;
        padding: 2rem;
        color: var(--text-muted);
        font-style: italic;
    }
`;
