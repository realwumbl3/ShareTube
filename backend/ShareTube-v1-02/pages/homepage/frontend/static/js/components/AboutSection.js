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
                            ShareTube is a Chrome extension that enables synchronized video watching across multiple
                            devices. Whether you're watching YouTube videos with friends, hosting a watch party, or
                            presenting content to a group, ShareTube keeps everyone in perfect sync.
                        </p>
                        <p>
                            As a browser extension, ShareTube integrates seamlessly with YouTube, providing a seamless
                            experience for creating rooms, inviting participants, and enjoying synchronized playback
                            with real-time chat and queue management.
                        </p>
                    </div>

                    <div class="about-grid">
                        <div class="about-card glass-panel">
                            <h3>🎯 Mission</h3>
                            <p>
                                To make synchronized video watching accessible, easy, and enjoyable for everyone. We
                                believe that watching videos together should be as simple as sharing a link.
                            </p>
                        </div>

                        <div class="about-card glass-panel">
                            <h3>⚡ Technology</h3>
                            <p>
                                Built with Flask, Socket.IO, and modern JavaScript. Real-time synchronization powered by
                                WebSockets ensures low-latency playback control across all devices.
                            </p>
                        </div>

                        <div class="about-card glass-panel">
                            <h3>🔒 Privacy</h3>
                            <p>
                                Your data is yours. ShareTube respects your privacy and gives you control over your
                                rooms and content. Private rooms stay private.
                            </p>
                        </div>

                        <div class="about-card glass-panel">
                            <h3>🚀 Open Source</h3>
                            <p>
                                ShareTube is built with open-source technologies and follows best practices for
                                security, performance, and user experience.
                            </p>
                        </div>
                    </div>

                    <div class="about-cta glass-panel">
                        <h2>Ready to get started?</h2>
                        <p>Install the extension today and start watching videos together with friends.</p>
                        <div class="cta-actions">
                            <a
                                href="https://chrome.google.com/webstore/detail/sharetube"
                                target="_blank"
                                class="cta-button glass-button"
                            >
                                <span>🚀</span> Install Extension
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
    }
}

css`
    /* Section Header Styles */
    .section-header {
        text-align: center;
        margin-bottom: 2rem;
    }

    .section-title {
        font-size: 3.5rem;
        font-weight: 800;
        margin: 0 0 1rem 0;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -1px;
    }

    .section-subtitle {
        font-size: 1.3rem;
        color: var(--text-secondary);
        margin: 0;
        font-weight: 300;
    }

    @media (max-width: 768px) {
        .section-title {
            font-size: 2.5rem;
        }
    }

    .about-section {
        display: flex;
        flex-direction: column;
        gap: 4rem;
        padding: 2rem 0;
    }

    .about-content {
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .about-main {
        padding: 3rem;
        background: rgba(0, 0, 0, 0.3) !important;
    }

    .about-main h2 {
        font-size: 2.2rem;
        font-weight: 700;
        margin: 0 0 1.5rem 0;
        color: var(--text-primary);
        letter-spacing: -0.5px;
    }

    .about-main p {
        font-size: 1.1rem;
        color: var(--text-secondary);
        line-height: 1.8;
        margin: 0 0 1.5rem 0;
        max-width: 900px;
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
        padding: 2.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid transparent;
        background: rgba(0, 0, 0, 0.3) !important;
    }

    .about-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
        border-color: rgba(0, 243, 255, 0.2);
        background: rgba(0, 0, 0, 0.6) !important;
    }

    .about-card h3 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
        color: var(--text-primary);
    }

    .about-card p {
        font-size: 1.05rem;
        color: var(--text-secondary);
        line-height: 1.6;
        margin: 0;
    }

    .about-cta {
        padding: 4rem 2rem;
        text-align: center;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.4), rgba(0, 243, 255, 0.05)) !important;
        border: 1px solid rgba(0, 243, 255, 0.1);
    }

    .about-cta h2 {
        font-size: 2.5rem;
        font-weight: 800;
        margin: 0 0 1rem 0;
        color: var(--text-primary);
    }

    .about-cta p {
        font-size: 1.2rem;
        color: var(--text-secondary);
        margin: 0 0 2.5rem 0;
    }

    /* About Section CTA Styles */
    .cta-actions {
        display: flex;
        gap: 1.5rem;
        justify-content: center;
        flex-wrap: wrap;
    }

    @media (max-width: 768px) {
        .about-main {
            padding: 2rem;
        }

        .about-grid {
            grid-template-columns: 1fr;
        }

        .about-cta {
            padding: 3rem 1.5rem;
        }

        .cta-actions {
            flex-direction: column;
            gap: 1rem;
        }
    }
`;
