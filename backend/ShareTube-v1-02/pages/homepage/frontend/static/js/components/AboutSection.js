import { html, css } from "/extension/app/dep/zyx.js";

export default class AboutSection {
    constructor() {
        html`
            <div class="about-section">
                <div class="section-header">
                    <h1 class="section-title">About ShareTube</h1>
                    <p class="section-subtitle">Synchronized video watching, reimagined</p>
                </div>

                <div class="about-content">
                    <div class="about-main glass-panel">
                        <h2>What is ShareTube?</h2>
                        <p>
                            ShareTube is a platform that enables synchronized video watching across multiple devices.
                            Whether you're watching YouTube videos with friends, hosting a watch party, or presenting
                            content to a group, ShareTube keeps everyone in perfect sync.
                        </p>
                        <p>
                            Built with modern web technologies, ShareTube provides a seamless experience for creating
                            rooms, inviting participants, and enjoying synchronized playback with real-time chat and
                            queue management.
                        </p>
                    </div>

                    <div class="about-grid">
                        <div class="about-card glass-panel">
                            <h3>🎯 Mission</h3>
                            <p>
                                To make synchronized video watching accessible, easy, and enjoyable for everyone.
                                We believe that watching videos together should be as simple as sharing a link.
                            </p>
                        </div>

                        <div class="about-card glass-panel">
                            <h3>⚡ Technology</h3>
                            <p>
                                Built with Flask, Socket.IO, and modern JavaScript. Real-time synchronization
                                powered by WebSockets ensures low-latency playback control across all devices.
                            </p>
                        </div>

                        <div class="about-card glass-panel">
                            <h3>🔒 Privacy</h3>
                            <p>
                                Your data is yours. ShareTube respects your privacy and gives you control over
                                your rooms and content. Private rooms stay private.
                            </p>
                        </div>

                        <div class="about-card glass-panel">
                            <h3>🚀 Open Source</h3>
                            <p>
                                ShareTube is built with open-source technologies and follows best practices
                                for security, performance, and user experience.
                            </p>
                        </div>
                    </div>

                    <div class="about-cta glass-panel">
                        <h2>Ready to get started?</h2>
                        <p>Join ShareTube today and start watching videos together with friends.</p>
                        <div class="cta-actions">
                            <a href="/auth/google" class="cta-button glass-button">
                                <span>🚀</span> Sign In with Google
                            </a>
                            <a href="/dashboard" class="secondary-button glass-button">
                                <span>📊</span> View Dashboard
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
    }
}

css`
    .about-section {
        display: flex;
        flex-direction: column;
        gap: 3rem;
        padding: 2rem 0;
    }

    .section-header {
        text-align: center;
        margin-bottom: 1rem;
    }

    .section-title {
        font-size: 3rem;
        font-weight: 700;
        margin: 0 0 1rem 0;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .section-subtitle {
        font-size: 1.25rem;
        color: var(--text-secondary);
        margin: 0;
    }

    .about-content {
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .about-main {
        padding: 3rem;
    }

    .about-main h2 {
        font-size: 2rem;
        font-weight: 600;
        margin: 0 0 1.5rem 0;
        color: var(--text-primary);
    }

    .about-main p {
        font-size: 1.1rem;
        color: var(--text-secondary);
        line-height: 1.7;
        margin: 0 0 1.5rem 0;
    }

    .about-main p:last-child {
        margin-bottom: 0;
    }

    .about-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
    }

    .about-card {
        padding: 2rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .about-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6);
    }

    .about-card h3 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
        color: var(--text-primary);
    }

    .about-card p {
        font-size: 1rem;
        color: var(--text-secondary);
        line-height: 1.6;
        margin: 0;
    }

    .about-cta {
        padding: 3rem;
        text-align: center;
    }

    .about-cta h2 {
        font-size: 2rem;
        font-weight: 600;
        margin: 0 0 1rem 0;
        color: var(--text-primary);
    }

    .about-cta p {
        font-size: 1.1rem;
        color: var(--text-secondary);
        margin: 0 0 2rem 0;
    }

    .cta-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
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

    @media (max-width: 768px) {
        .section-title {
            font-size: 2rem;
        }

        .section-subtitle {
            font-size: 1.1rem;
        }

        .about-main {
            padding: 2rem;
        }

        .about-main h2 {
            font-size: 1.5rem;
        }

        .about-grid {
            grid-template-columns: 1fr;
        }

        .about-cta {
            padding: 2rem;
        }

        .cta-actions {
            flex-direction: column;
        }

        .cta-button,
        .secondary-button {
            width: 100%;
            justify-content: center;
        }
    }
`;


