import { html, css, LiveVar } from "/extension/app/dep/zyx.js";
import HeroSection from "./HeroSection.js";
import FeaturesSection from "./FeaturesSection.js";
import AboutSection from "./AboutSection.js";
import AmbientBackground from "/extension/app/background/AmbientBackground.js";

export default class HomepageApp {
    constructor() {
        // Homepage state
        this.currentTab = new LiveVar("home"); // home, features, about
        this.isReady = new LiveVar(false);

        // Initialize
        this.init();

        html`
            <div class=${this.isReady.interp((r) => (r ? "homepage-app visible" : "homepage-app"))}>
                ${new AmbientBackground({
                    fragmentShader: "/extension/app/background/shaders/ps3LiquidGlassFragment.glsl",
                    skipFrame: true,
                    maxResolution: 1080,
                })}

                <header class="homepage-header glass-panel">
                    <div class="header-brand">
                        <h1>ShareTube <span class="brand-accent">/ Home</span></h1>
                        <span class="extension-badge">Chrome Extension</span>
                    </div>
                    <nav class="homepage-nav">
                        <button
                            class="nav-btn glass-button"
                            active=${this.currentTab.interp((v) => v === "home")}
                            zyx-click=${() => this.setTab("home")}
                        >
                            Home
                        </button>
                        <button
                            class="nav-btn glass-button"
                            active=${this.currentTab.interp((v) => v === "features")}
                            zyx-click=${() => this.setTab("features")}
                        >
                            Features
                        </button>
                        <button
                            class="nav-btn glass-button"
                            active=${this.currentTab.interp((v) => v === "about")}
                            zyx-click=${() => this.setTab("about")}
                        >
                            About
                        </button>
                    </nav>
                </header>

                <main class="homepage-content">
                    <!-- Home Tab -->
                    <div class="view" zyx-if=${[this.currentTab, (v) => v === "home"]}>${new HeroSection()}</div>

                    <!-- Features Tab -->
                    <div class="view" zyx-if=${[this.currentTab, (v) => v === "features"]}>
                        ${new FeaturesSection()}
                    </div>

                    <!-- About Tab -->
                    <div class="view" zyx-if=${[this.currentTab, (v) => v === "about"]}>${new AboutSection()}</div>
                </main>

                <footer class="homepage-footer">
                    <p>&copy; ${new Date().getFullYear()} ShareTube. Open Source.</p>
                </footer>
            </div>
        `.bind(this);
    }

    setTab(tab) {
        this.currentTab.set(tab);
        // Smooth scroll to top when switching tabs
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    init() {
        // Reveal app after a brief delay
        setTimeout(() => {
            this.isReady.set(true);
            const loader = document.getElementById("app-loader");
            if (loader) {
                loader.classList.add("hidden");
                setTimeout(() => {
                    if (loader.parentNode) loader.parentNode.removeChild(loader);
                }, 500);
            }
        }, 300);
    }
}

css`
    .homepage-app {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        position: relative;
        z-index: 1;
    }

    .homepage-header {
        margin: 1rem 1.7rem;
        padding: 1rem 1.5rem;
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        column-gap: 2rem;
        outline: 1px solid var(--glass-border);
        border-radius: 100px;
        position: sticky;
        top: 1rem;
        z-index: 100;
        transition: outline-color 0.3s ease;
    }

    .homepage-header:hover {
        outline-color: rgba(255, 255, 255, 0.15);
    }

    .header-brand {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        user-select: none;
    }

    .header-brand h1 {
        margin: 0;
        color: var(--text-primary);
        font-size: 1.2rem;
        font-weight: 700;
        letter-spacing: -0.5px;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .brand-accent {
        color: var(--accent-primary);
        font-weight: 300;
        opacity: 0.8;
    }

    .extension-badge {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--accent-primary);
        background: rgba(0, 243, 255, 0.1);
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        border: 1px solid rgba(0, 243, 255, 0.2);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        align-self: flex-start;
    }

    .homepage-nav {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        background: rgba(255, 255, 255, 0.03);
        padding: 0.5rem 1.5rem;
        border-radius: 999px;
        outline: 1px solid var(--glass-border);
        margin-left: auto;
    }

    .nav-btn {
        position: relative;
        padding: 0.6rem 1.5rem;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 500;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        outline: none;
        outline: 0;
        -webkit-appearance: none;
        appearance: none;
        transition: color 0.3s ease, background 0.3s ease, transform 0.3s ease;
        border: 1px solid transparent;
    }

    .nav-btn:hover {
        color: var(--accent-primary);
        background: rgba(255, 255, 255, 0.08);
        transform: translateY(-1px);
    }

    .nav-btn[active="true"] {
        background: rgb(0 0 0 / 54%);
        color: var(--accent-primary);
        outline-color: rgba(255, 255, 255, 0.8);
        box-shadow: 0 0 15px rgba(0, 243, 255, 0.25);
    }

    .homepage-content {
        flex: 1;
        padding: 2rem;
        max-width: 1400px;
        margin: 0 auto;
        width: 100%;
    }

    .homepage-footer {
        text-align: center;
        padding: 2rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
        margin-top: auto;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
    }

    .view {
        animation: slideUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    @keyframes slideUp {
        from {
            transform: translateY(30px);
        }
        to {
            transform: translateY(0);
        }
    }

    @media (max-width: 1024px) {
        .homepage-header {
            margin: 0.5rem;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            border-radius: var(--radius-md);
            position: sticky;
            top: 0.5rem;
        }

        .homepage-nav {
            width: 100%;
            justify-content: center;
            overflow-x: auto;
            white-space: nowrap;

            scrollbar-width: none;
            -ms-overflow-style: none;
        }

        .homepage-nav::-webkit-scrollbar {
            display: none;
        }

        .homepage-content {
            padding: 1rem;
        }
    }
`;
