import { html, css, LiveVar } from "/extension/app/dep/zyx.js";

export default class HeroSection {
    constructor() {
        this.stats = new LiveVar({});
        this.loadStats();

        html`
            <div class="hero-section">
                <div class="hero-content glass-panel">
                    <div class="hero-text">
                        <h1 class="hero-title">
                            Watch Together, <span class="text-gradient">Anywhere</span>
                        </h1>
                        <p class="hero-subtitle">
                            ShareTube synchronizes YouTube videos across all devices. Create rooms, invite friends,
                            and enjoy synchronized playback in real-time.
                        </p>
                        <div class="hero-actions">
                            <a href="/auth/google" class="cta-button glass-button">
                                <span>🚀</span> Get Started
                            </a>
                            <a href="/dashboard" class="secondary-button glass-button">
                                <span>📊</span> Dashboard
                            </a>
                        </div>
                    </div>
                    <div class="hero-stats glass-panel">
                        <div class="stat-item">
                            <div class="stat-value">${this.stats.interp(s => s.rooms?.total || 0)}</div>
                            <div class="stat-label">Active Rooms</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${this.stats.interp(s => s.queues?.total || 0)}</div>
                            <div class="stat-label">Video Queues</div>
                        </div>
                    </div>
                </div>

                <div class="hero-features-grid">
                    <div class="feature-card glass-panel">
                        <div class="feature-icon">🎬</div>
                        <h3>Synchronized Playback</h3>
                        <p>All participants watch videos in perfect sync, no matter where they are.</p>
                    </div>
                    <div class="feature-card glass-panel">
                        <div class="feature-icon">📱</div>
                        <h3>Mobile Remote</h3>
                        <p>Control playback from your phone. Perfect for presentations and group viewing.</p>
                    </div>
                    <div class="feature-card glass-panel">
                        <div class="feature-icon">👥</div>
                        <h3>Real-time Chat</h3>
                        <p>Chat with friends while watching. Share reactions and comments instantly.</p>
                    </div>
                    <div class="feature-card glass-panel">
                        <div class="feature-icon">🎯</div>
                        <h3>Queue Management</h3>
                        <p>Build playlists together. Everyone can add videos to the queue.</p>
                    </div>
                </div>
            </div>
        `.bind(this);
    }

    async loadStats() {
        try {
            const response = await fetch("/api/stats");
            const data = await response.json();
            this.stats.set(data);
        } catch (error) {
            console.error("Failed to load stats:", error);
        }
    }
}

css`
    .hero-section {
        display: flex;
        flex-direction: column;
        gap: 3rem;
        padding: 2rem 0;
    }

    .hero-content {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 3rem;
        align-items: center;
        padding: 3rem;
    }

    .hero-text {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .hero-title {
        font-size: 3.5rem;
        font-weight: 700;
        line-height: 1.1;
        margin: 0;
        letter-spacing: -1px;
    }

    .hero-subtitle {
        font-size: 1.25rem;
        color: var(--text-secondary);
        line-height: 1.6;
        margin: 0;
        max-width: 600px;
    }

    .hero-actions {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .cta-button,
    .secondary-button {
        padding: 0.875rem 2rem;
        font-size: 1rem;
        font-weight: 600;
        border-radius: var(--radius-md);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        transition: all 0.3s ease;
    }

    .cta-button {
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        color: #000;
        box-shadow: 0 0 20px rgba(0, 243, 255, 0.4);
    }

    .cta-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 0 30px rgba(0, 243, 255, 0.6);
    }

    .secondary-button {
        color: var(--text-primary);
    }

    .hero-stats {
        display: flex;
        gap: 2rem;
        padding: 1.5rem 2rem;
        min-width: 280px;
    }

    .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }

    .stat-value {
        font-size: 2.5rem;
        font-weight: 700;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .stat-label {
        font-size: 0.85rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .hero-features-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
    }

    .feature-card {
        padding: 2rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .feature-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6);
    }

    .feature-icon {
        font-size: 3rem;
        margin-bottom: 0.5rem;
    }

    .feature-card h3 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
        color: var(--text-primary);
    }

    .feature-card p {
        font-size: 1rem;
        color: var(--text-secondary);
        line-height: 1.6;
        margin: 0;
    }

    @media (max-width: 768px) {
        .hero-content {
            grid-template-columns: 1fr;
            gap: 2rem;
            padding: 2rem;
        }

        .hero-title {
            font-size: 2.5rem;
        }

        .hero-subtitle {
            font-size: 1.1rem;
        }

        .hero-stats {
            flex-direction: row;
            justify-content: space-around;
            min-width: auto;
        }

        .hero-features-grid {
            grid-template-columns: 1fr;
        }
    }
`;


