import { html, css } from "/extension/app/dep/zyx.js";

export default class FeaturesSection {
    constructor() {
        html`
            <div class="features-section">
                <div class="section-header">
                    <h1 class="section-title">Features</h1>
                    <p class="section-subtitle">Everything you need for synchronized video watching</p>
                </div>

                <div class="features-list">
                    <div class="feature-item glass-panel">
                        <div class="feature-content">
                            <div class="feature-number">01</div>
                            <div class="feature-details">
                                <h2>Synchronized Playback</h2>
                                <p>
                                    ShareTube ensures all participants watch videos in perfect synchronization.
                                    When one person pauses, everyone pauses. When someone seeks, everyone seeks.
                                    Experience true synchronized viewing across all devices.
                                </p>
                                <ul class="feature-list">
                                    <li>Real-time sync across all devices</li>
                                    <li>Automatic buffering management</li>
                                    <li>Low-latency WebSocket communication</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="feature-item glass-panel">
                        <div class="feature-content">
                            <div class="feature-number">02</div>
                            <div class="feature-details">
                                <h2>Mobile Remote Control</h2>
                                <p>
                                    Use your smartphone as a remote control for any ShareTube room.
                                    Perfect for presentations, group viewing sessions, or when you want
                                    to control playback from across the room.
                                </p>
                                <ul class="feature-list">
                                    <li>QR code quick access</li>
                                    <li>Full playback controls</li>
                                    <li>Queue management from mobile</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="feature-item glass-panel">
                        <div class="feature-content">
                            <div class="feature-number">03</div>
                            <div class="feature-details">
                                <h2>Real-time Chat</h2>
                                <p>
                                    Chat with friends while watching videos together. Share reactions,
                                    comments, and thoughts in real-time without interrupting playback.
                                </p>
                                <ul class="feature-list">
                                    <li>Instant messaging</li>
                                    <li>Emoji support</li>
                                    <li>Message history</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="feature-item glass-panel">
                        <div class="feature-content">
                            <div class="feature-number">04</div>
                            <div class="feature-details">
                                <h2>Queue Management</h2>
                                <p>
                                    Build playlists together. Everyone in the room can add videos to the queue,
                                    vote on what to watch next, and manage the playlist collaboratively.
                                </p>
                                <ul class="feature-list">
                                    <li>Collaborative queue building</li>
                                    <li>Vote on next video</li>
                                    <li>Queue reordering</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="feature-item glass-panel">
                        <div class="feature-content">
                            <div class="feature-number">05</div>
                            <div class="feature-details">
                                <h2>Room Management</h2>
                                <p>
                                    Create public or private rooms. Invite friends with room codes,
                                    manage permissions, and control who can add videos or control playback.
                                </p>
                                <ul class="feature-list">
                                    <li>Public and private rooms</li>
                                    <li>Room codes for easy sharing</li>
                                    <li>Operator permissions</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="feature-item glass-panel">
                        <div class="feature-content">
                            <div class="feature-number">06</div>
                            <div class="feature-details">
                                <h2>Cross-Platform Support</h2>
                                <p>
                                    ShareTube works everywhere. Use it on desktop browsers, mobile devices,
                                    tablets, and more. All platforms stay in sync.
                                </p>
                                <ul class="feature-list">
                                    <li>Chrome extension</li>
                                    <li>Web interface</li>
                                    <li>Mobile-responsive design</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
    }
}

css`
    .features-section {
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

    .features-list {
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .feature-item {
        padding: 2.5rem;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .feature-item:hover {
        transform: translateX(8px);
        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6);
    }

    .feature-content {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 2rem;
        align-items: start;
    }

    .feature-number {
        font-size: 4rem;
        font-weight: 700;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        opacity: 0.3;
        line-height: 1;
    }

    .feature-details {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .feature-details h2 {
        font-size: 1.75rem;
        font-weight: 600;
        margin: 0;
        color: var(--text-primary);
    }

    .feature-details p {
        font-size: 1.1rem;
        color: var(--text-secondary);
        line-height: 1.7;
        margin: 0;
    }

    .feature-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .feature-list li {
        font-size: 1rem;
        color: var(--text-secondary);
        padding-left: 1.5rem;
        position: relative;
    }

    .feature-list li::before {
        content: "✓";
        position: absolute;
        left: 0;
        color: var(--accent-success);
        font-weight: 600;
    }

    @media (max-width: 768px) {
        .section-title {
            font-size: 2rem;
        }

        .section-subtitle {
            font-size: 1.1rem;
        }

        .feature-content {
            grid-template-columns: 1fr;
            gap: 1rem;
        }

        .feature-number {
            font-size: 3rem;
        }

        .feature-item {
            padding: 1.5rem;
        }
    }
`;


