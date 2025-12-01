import { html, css, LiveVar, LiveList } from "/extension/app/dep/zyx.js";

class ActivityItem {
    constructor(activity) {
        html`
            <div class="activity-item">
                <div class="timeline-line"></div>
                <div class="activity-icon-wrapper">
                    <div class="activity-icon activity-type-${activity.type.interp((v) => v)}">
                        <span class="icon-dot"></span>
                    </div>
                </div>
                <div class="activity-content glass-panel">
                    <div class="activity-header">
                        <span class="activity-user">${activity.user.interp((v) => v)}</span>
                        <span class="activity-time">${activity.timestamp.interp((v) => this.formatTime(v))}</span>
                    </div>
                    <div class="activity-message">
                        ${activity.type.interp((type) => this.formatActivityMessage(activity, type))}
                    </div>
                </div>
            </div>
        `.bind(this);
    }

    formatActivityMessage(activity, type) {
        const room = activity.room.interp((v) => v);
        const details = activity.details.interp((v) => v);

        switch (type) {
            case "video_shared":
                return `Shared a video${room ? ` in <span class="highlight-room">${room}</span>` : ""}`;
            case "session_started":
                return `Started a session${room ? ` in <span class="highlight-room">${room}</span>` : ""}`;
            case "user_joined":
                return `Joined${room ? ` room <span class="highlight-room">${room}</span>` : ""}`;
            case "user_left":
                return `Left${room ? ` room <span class="highlight-room">${room}</span>` : ""}`;
            case "room_created":
                return `Created room <span class="highlight-room">${room || "Unknown"}</span>`;
            case "queue_updated":
                return `Updated queue${room ? ` in <span class="highlight-room">${room}</span>` : ""}`;
            default:
                return `${type.replace("_", " ")}${room ? ` in <span class="highlight-room">${room}</span>` : ""}`;
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return "";

        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffMins < 1) return "just now";
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;

            return date.toLocaleDateString();
        } catch (e) {
            return "";
        }
    }
}

export default class ActivityFeed {
    constructor(activities) {
        this.activities = activities;
        this.activityItems = new LiveList([]);

        // Update activity items when activities change
        if (this.activities && typeof this.activities.subscribe === "function") {
            this.activities.subscribe(() => this.updateActivityItems());
        }
        this.updateActivityItems();

        html`
            <div
                class="activity-feed"
                zyx-live-list=${{
                    list: this.activityItems,
                    compose: (activityItem) => new ActivityItem(activityItem),
                    filter: () => true,
                }}
            ></div>
        `.bind(this);
    }

    updateActivityItems() {
        // Safely get activities
        let activities = [];
        if (this.activities && typeof this.activities.get === "function") {
            activities = this.activities.get() || [];
        } else if (Array.isArray(this.activities)) {
            activities = this.activities;
        }

        // Clear current items
        this.activityItems.splice(0, this.activityItems.length);

        // Add new activity items
        activities.forEach((activity) => this.activityItems.push(activity));
    }
}

css`
    .activity-feed {
        max-height: 500px;
        overflow-y: auto;
        padding: 0.5rem;
    }

    .activity-item {
        display: flex;
        position: relative;
        padding-bottom: 1.5rem;
    }

    .timeline-line {
        position: absolute;
        left: 19px;
        top: 2rem;
        bottom: -1rem;
        width: 2px;
        background: rgba(255, 255, 255, 0.05);
        z-index: 0;
    }

    .activity-item:last-child .timeline-line {
        display: none;
    }

    .activity-icon-wrapper {
        position: relative;
        z-index: 1;
        margin-right: 1.5rem;
        padding-top: 0.25rem;
    }

    .activity-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.3);
        outline: 1px solid var(--glass-border);
        box-shadow: 0 0 15px rgba(0, 0, 0, 0.3);
        transition: transform 0.3s ease, outline-color 0.3s ease;
    }

    .activity-icon::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 10px currentColor;
    }

    .activity-type-video_shared { color: var(--accent-danger); }
    .activity-type-session_started { color: var(--accent-success); }
    .activity-type-user_joined { color: var(--accent-primary); }
    .activity-type-user_left { color: var(--text-muted); }
    .activity-type-room_created { color: var(--accent-secondary); }
    .activity-type-queue_updated { color: var(--accent-warning); }

    .activity-content {
        flex: 1;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.02);
        outline: 1px solid var(--glass-border);
        transition: background 0.2s, outline-color 0.2s, transform 0.2s;
    }

    .activity-item:hover .activity-content {
        background: rgba(255, 255, 255, 0.05);
        outline-color: rgba(255, 255, 255, 0.1);
        transform: translateX(4px);
    }

    .activity-item:hover .activity-icon {
        transform: scale(1.1);
        outline-color: currentColor;
    }

    .activity-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }

    .activity-user {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.9rem;
    }

    .activity-time {
        font-size: 0.75rem;
        color: var(--text-muted);
        font-family: var(--font-mono);
    }

    .activity-message {
        font-size: 0.9rem;
        color: var(--text-secondary);
        line-height: 1.5;
    }

    .highlight-room {
        color: var(--accent-primary);
        font-weight: 500;
    }

    @media (max-width: 480px) {
        .activity-item {
            padding-bottom: 1rem;
        }
        
        .activity-icon-wrapper {
            margin-right: 1rem;
        }
        
        .timeline-line {
            left: 19px;
        }
    }
`;
