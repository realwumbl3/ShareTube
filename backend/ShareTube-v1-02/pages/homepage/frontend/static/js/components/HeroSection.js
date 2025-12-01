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
                            ShareTube is a Chrome extension that synchronizes YouTube videos across all devices. Install
                            the extension to create rooms, invite friends, and enjoy synchronized playback in real-time.
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
        user-select: none;
    }

    .hero-subtitle {
        font-size: 1.35rem;
        color: var(--text-secondary);
        line-height: 1.6;
        margin: 0;
        max-width: 650px;
        font-weight: 300;
        text-shadow: 0px 2px 4px #000001ab;
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
        user-select: none;
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

        .cta-button {
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

    /* Feature Card Styles (used in hero-features-grid) */
    .feature-card {
        --gradient-angle: 320deg;
        padding: 2.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        transition: box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), background-position 0.4s cubic-bezier(0.4, 0, 0.2, 1), --gradient-angle 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        outline: 1px solid transparent;
        user-select: none;
        background-image: linear-gradient(
            var(--gradient-angle),
            rgba(255, 255, 255, 0.01) 0%,
            rgba(255, 255, 255, 0.2) 50%,
            rgba(228, 228, 228, 0.3) 50.5%,
            rgba(255, 255, 255, 0.05) 100%
        ) !important;
        background-size: 100% 100%;
        background-position: 50% 50%;
    }

    .feature-card:hover {
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        outline-color: rgba(233, 254, 255, 0.37);
        background-position: 50% 100%;
        --gradient-angle: 323deg;
    }

    .feature-icon {
        font-size: 3.5rem;
        margin-bottom: 0.5rem;
        filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.1));
    }

    .feature-card h3 {
        font-size: 1.4rem;
        font-weight: 600;
        margin: 0;
        color: var(--text-primary);
        text-shadow: 0px 2px 4px #000001ab;
    }

    .feature-card p {
        font-size: 1.05rem;
        color: var(--text-secondary);
        line-height: 1.6;
        margin: 0;
        text-shadow: 0px 2px 4px #000001ab;
    }

    /* Stats Styles */
    .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }

    .stat-value {
        font-size: 3.5rem;
        font-weight: 700;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1;
    }

    .stat-label {
        font-size: 0.9rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 1.5px;
        font-weight: 500;
    }

    /* Hero Section CTA Button Styles */
    .cta-primary {
        padding: 1.35rem 2.75rem;
        font-weight: 700;
        box-shadow: 0 6px 25px rgba(0, 243, 255, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
    }

    .cta-primary:hover {
        transform: translateY(-3px) scale(1.02);
        box-shadow: 0 12px 40px rgba(0, 243, 255, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
    }

    .cta-primary:active {
        transform: translateY(-1px) scale(1.01);
    }

    .cta-secondary {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        color: var(--text-primary);
        outline: 1px solid rgba(255, 255, 255, 0.1);
        padding: 1rem 2rem;
        font-weight: 600;
        box-shadow: none;
    }

    .cta-secondary:hover {
        background: rgba(255, 255, 255, 0.08);
        outline-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        transform: translateY(-2px);
    }

    .cta-primary-wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        flex: 0 1 auto;
    }

    .cta-secondary-wrapper {
        display: flex;
        align-items: center;
        flex: 0 1 auto;
    }

    .button-content {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        position: relative;
        z-index: 2;
    }

    .button-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.15rem;
        line-height: 1.2;
    }

    .button-main-text {
        font-size: 1.15rem;
        font-weight: 800;
        letter-spacing: -0.3px;
    }

    .button-sub-text {
        font-size: 0.75rem;
        font-weight: 600;
        opacity: 0.7;
        letter-spacing: 0.2px;
    }

    .button-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.4), transparent 70%);
        transform: translate(-50%, -50%);
        transition: width 0.6s ease, height 0.6s ease;
        pointer-events: none;
        z-index: 1;
    }

    .cta-primary:hover .button-glow {
        width: 300px;
        height: 300px;
    }

    .chromium-icon {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
    }

    .action-helper {
        font-size: 0.875rem;
        color: var(--text-secondary);
        opacity: 0.85;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
        padding-left: 0.25rem;
        user-select: none;
    }

    .helper-icon {
        color: var(--accent-primary);
        font-weight: 700;
        font-size: 0.9rem;
    }

    .external-icon {
        font-size: 0.9em;
        opacity: 0.7;
        transition: opacity 0.3s ease;
    }

    .cta-secondary:hover .external-icon {
        opacity: 1;
    }

    .icon {
        font-size: 1.2em;
    }
`;
