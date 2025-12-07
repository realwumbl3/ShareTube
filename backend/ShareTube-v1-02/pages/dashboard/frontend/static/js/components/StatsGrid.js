import { html, css, LiveVar } from "/extension/app/@dep/zyx.js";
import StatsCard from "./StatsCard.js";

export default class StatsGrid {
    constructor(stats) {
        this.stats = stats;

        html`
            <div class="stats-grid">
                <!-- User Statistics -->
                <div class="stats-section glass-panel">
                    <h3>Users</h3>
                    <div class="stats-cards">
                        ${new StatsCard("Total Users", stats.interp((s) => s?.users?.total || 0), "users", "#00f3ff")}
                        ${new StatsCard("Active Users", stats.interp((s) => s?.users?.active || 0), "user-check", "#00ff9d")}
                        ${new StatsCard("Inactive Users", stats.interp((s) => s?.users?.inactive || 0), "user-x", "#ff0055")}
                        ${new StatsCard("Recent Registrations", stats.interp((s) => s?.users?.recent_registrations || 0), "user-plus", "#ffb800")}
                    </div>
                </div>

                <!-- Room Statistics -->
                <div class="stats-section glass-panel">
                    <h3>Rooms</h3>
                    <div class="stats-cards">
                        ${new StatsCard("Total Rooms", stats.interp((s) => s?.rooms?.total || 0), "home", "#bc13fe")}
                        ${new StatsCard("Active Rooms", stats.interp((s) => s?.rooms?.active || 0), "play-circle", "#00ff9d")}
                        ${new StatsCard("Public Rooms", stats.interp((s) => s?.rooms?.public || 0), "globe", "#00f3ff")}
                        ${new StatsCard("Private Rooms", stats.interp((s) => s?.rooms?.private || 0), "lock", "#ffb800")}
                    </div>
                </div>

                <!-- Session Statistics -->
                <div class="stats-section glass-panel">
                    <h3>Sessions</h3>
                    <div class="stats-cards">
                        ${new StatsCard("Active Sessions", stats.interp((s) => s?.sessions?.active_sessions || 0), "users", "#00f3ff")}
                        ${new StatsCard("Total Memberships", stats.interp((s) => s?.sessions?.total_memberships || 0), "user-group", "#bc13fe")}
                        ${new StatsCard(
                            "Avg Members/Room",
                            stats.interp((s) => s?.sessions?.avg_members_per_room?.toFixed(1) || 0),
                            "bar-chart",
                            "#00ff9d"
                        )}
                    </div>
                </div>

                <!-- Queue Statistics -->
                <div class="stats-section glass-panel">
                    <h3>Content</h3>
                    <div class="stats-cards">
                        ${new StatsCard("Total Queues", stats.interp((s) => s?.queues?.total_queues || 0), "list", "#bc13fe")}
                        ${new StatsCard("Total Videos", stats.interp((s) => s?.queues?.total_entries || 0), "video", "#ff0055")}
                        ${new StatsCard(
                            "Avg Queue Length",
                            stats.interp((s) => s?.queues?.avg_queue_length?.toFixed(1) || 0),
                            "align-justify",
                            "#ffb800"
                        )}
                        ${new StatsCard("Recent Activity", stats.interp((s) => s?.activity?.total_events || 0), "activity", "#00f3ff")}
                    </div>
                </div>
            </div>
        `.bind(this);
    }
}

css`

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
    }

    .stats-section {
        padding: 1.5rem;
    }

    .stats-section h3 {
        margin: 0 0 1.5rem 0;
        color: var(--text-secondary);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        font-weight: 600;
        border-bottom: 1px solid var(--glass-border);
        padding-bottom: 0.75rem;
    }

    .stats-cards {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
    }

    @media (max-width: 768px) {
        .stats-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
        }
    }
`;
