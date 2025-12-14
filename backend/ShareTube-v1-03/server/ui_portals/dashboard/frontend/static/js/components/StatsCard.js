import { html, css, LiveVar } from "/extension/shared/dep/zyx.js";

export default class StatsCard {
    constructor(title, value, icon = "bar-chart", color = "var(--accent-primary)") {
        this.title = title;
        this.value = value;
        this.icon = icon;
        this.color = color;

        html`
            <div class="stats-card glass-panel" style="--card-accent: ${this.color}">
                <div class="stats-card-icon">
                    <span class="icon-${this.icon}"></span>
                </div>
                <div class="stats-card-content">
                    <div class="stats-card-value">${this.value}</div>
                    <div class="stats-card-title">${this.title}</div>
                </div>
                <div class="card-glow"></div>
            </div>
        `.bind(this);
    }
}

css`
    .stats-card {
        display: flex;
        align-items: center;
        padding: 1.5rem;
        position: relative;
        overflow: hidden;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        outline: 1px solid var(--glass-border);
    }

    .stats-card:hover {
        transform: translateY(-4px);
        outline-color: var(--card-accent);
        box-shadow: 0 10px 40px -10px var(--card-accent);
    }

    .stats-card:hover .stats-card-icon {
        transform: scale(1.1) rotate(5deg);
        color: var(--card-accent);
        text-shadow: 0 0 20px var(--card-accent);
    }

    .stats-card-icon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.03);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 1.25rem;
        color: var(--text-secondary);
        font-size: 1.5rem;
        transition: transform 0.3s ease, color 0.3s ease, text-shadow 0.3s ease;
        outline: 1px solid rgba(255, 255, 255, 0.05);
    }

    .stats-card-content {
        flex: 1;
        z-index: 1;
    }

    .stats-card-value {
        font-family: var(--font-mono);
        font-size: 2rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 0.25rem;
        letter-spacing: -1px;
    }

    .stats-card-title {
        font-size: 0.75rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 600;
    }

    /* Simple icon placeholders - in a real app you'd use an icon font */
    .icon-users::before { content: "👥"; }
    .icon-user-check::before { content: "✅"; }
    .icon-user-x::before { content: "❌"; }
    .icon-user-plus::before { content: "➕"; }
    .icon-home::before { content: "🏠"; }
    .icon-play-circle::before { content: "▶️"; }
    .icon-globe::before { content: "🌍"; }
    .icon-lock::before { content: "🔒"; }
    .icon-user-group::before { content: "👨‍👩‍👧‍👦"; }
    .icon-bar-chart::before { content: "📊"; }
    .icon-list::before { content: "📝"; }
    .icon-video::before { content: "🎥"; }
    .icon-align-justify::before { content: "📋"; }
    .icon-activity::before { content: "⚡"; }

    @media (max-width: 480px) {
        .stats-card {
            padding: 1rem;
        }

        .stats-card-icon {
            width: 40px;
            height: 40px;
            font-size: 1.2rem;
        }

        .stats-card-value {
            font-size: 1.5rem;
        }
    }
`;
