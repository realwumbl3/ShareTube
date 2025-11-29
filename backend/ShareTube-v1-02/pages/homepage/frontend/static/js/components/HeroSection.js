import { html, css, LiveVar } from "/extension/app/dep/zyx.js";

import { googleSVG, chromiumSVG } from "/extension/app/assets/svgs.js";

export default class HeroSection {
    constructor() {
        this.stats = new LiveVar({});
        this.displayedStats = new LiveVar({ rooms: 0, queues: 0 });

        this.loadStats();

        html`
            <div class="hero-section">
                <div class="hero-content glass-panel">
                    <div class="hero-text">
                        <h1 class="hero-title">Watch Together, <span class="text-gradient">Anywhere</span></h1>
                        <p class="hero-subtitle">
                            ShareTube synchronizes YouTube videos across all devices. Install the extension to create
                            rooms, invite friends, and enjoy synchronized playback in real-time.
                        </p>

                        <div class="hero-actions-container">
                            <div class="cta-primary-wrapper">
                                <a
                                    href="https://chrome.google.com/webstore/detail/sharetube"
                                    target="_blank"
                                    class="cta-button cta-primary"
                                >
                                    <span class="button-content">
                                        <img src="${chromiumSVG}" class="chromium-icon" alt="Chromium" />
                                        <span class="button-text">
                                            <span class="button-main-text">Install Extension</span>
                                            <span class="button-sub-text">Free • 30 seconds</span>
                                        </span>
                                    </span>
                                    <span class="button-glow"></span>
                                </a>
                                <p class="action-helper">
                                    <span class="helper-icon">✓</span>
                                    Works with Chrome, Edge, and Brave
                                </p>
                            </div>
                            <div class="cta-secondary-wrapper">
                                <a
                                    href="https://github.com/realwumbl3/sharetube"
                                    target="_blank"
                                    class="cta-button cta-secondary"
                                >
                                    <span class="icon">💻</span>
                                    <span>View Source</span>
                                    <span class="external-icon">↗</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    <div class="hero-stats glass-panel">
                        <div class="stat-item">
                            <div class="stat-value">${this.displayedStats.interp((s) => s.rooms.toLocaleString())}</div>
                            <div class="stat-label">Active Rooms</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">
                                ${this.displayedStats.interp((s) => s.queues.toLocaleString())}
                            </div>
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
            this.animateStats(data);
        } catch (error) {
            console.error("Failed to load stats:", error);
        }
    }

    animateStats(data) {
        const targetRooms = data.rooms?.total || 0;
        const targetQueues = data.queues?.total || 0;
        const duration = 2000; // 2 seconds
        const start = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);

            this.displayedStats.set({
                rooms: Math.floor(targetRooms * ease),
                queues: Math.floor(targetQueues * ease),
            });

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
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
        gap: 4rem;
        align-items: center;
        padding: 4rem;
        position: relative;
        overflow: hidden;
    }

    /* Add subtle glow to hero content */
    .hero-content::before {
        content: "";
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle at center, rgba(0, 243, 255, 0.03), transparent 70%);
        pointer-events: none;
    }

    .hero-text {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        z-index: 1;
    }

    .hero-title {
        font-size: 4rem;
        font-weight: 800;
        line-height: 1.1;
        margin: 0;
        letter-spacing: -1.5px;
    }

    .hero-subtitle {
        font-size: 1.35rem;
        color: var(--text-secondary);
        line-height: 1.6;
        margin: 0;
        max-width: 650px;
        font-weight: 300;
    }

    .hero-actions-container {
        display: flex;
        flex-direction: row;
        gap: 1.5rem;
        align-items: flex-start;
        margin-top: 1.5rem;
        flex-wrap: wrap;
    }

    .hero-stats {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        padding: 2.5rem;
        min-width: 240px;
        background: rgba(0, 0, 0, 0.4) !important; /* Darker for contrast */
    }

    .hero-features-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 2rem;
        padding: 1rem;
    }

    @media (max-width: 1024px) {
        .hero-content {
            grid-template-columns: 1fr;
            gap: 3rem;
            padding: 2rem;
            text-align: center;
        }

        .hero-text {
            align-items: center;
        }

        .hero-actions-container {
            align-items: center;
            justify-content: center;
        }

        .cta-primary-wrapper,
        .cta-secondary-wrapper {
            width: 100%;
            max-width: 400px;
        }

        .cta-secondary {
            width: 100%;
        }

        .hero-stats {
            flex-direction: row;
            justify-content: space-around;
            width: 100%;
        }
    }

    @media (max-width: 768px) {
        .hero-title {
            font-size: 2.75rem;
        }

        .hero-stats {
            flex-direction: column;
            gap: 2rem;
        }
    }
`;
