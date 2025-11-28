import { html, css, LiveVar } from "/extension/app/dep/zyx.js";
import HeroSection from "./HeroSection.js";
import FeaturesSection from "./FeaturesSection.js";
import AboutSection from "./AboutSection.js";

export default class HomepageApp {
    constructor() {
        // Homepage state
        this.currentTab = new LiveVar("home"); // home, features, about
        this.isReady = new LiveVar(false);

        // Initialize
        this.init();

        html`
            <div class=${this.isReady.interp((r) => (r ? "homepage-app visible" : "homepage-app"))}>
                <header class="homepage-header glass-panel">
                    <div class="header-brand">
                        <h1>ShareTube <span class="brand-accent">/ Home</span></h1>
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
                    <div class="view" zyx-if=${[this.currentTab, (v) => v === "home"]}>
                        ${new HeroSection()}
                    </div>

                    <!-- Features Tab -->
                    <div class="view" zyx-if=${[this.currentTab, (v) => v === "features"]}>
                        ${new FeaturesSection()}
                    </div>

                    <!-- About Tab -->
                    <div class="view" zyx-if=${[this.currentTab, (v) => v === "about"]}>
                        ${new AboutSection()}
                    </div>
                </main>
            </div>
        `.bind(this);
    }

    setTab(tab) {
        this.currentTab.set(tab);
        // Smooth scroll to top when switching tabs
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
    }

    .homepage-header {
        margin: 1rem 2rem;
        padding: 1rem 1.5rem;
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        column-gap: 2rem;
        outline: 1px solid var(--glass-border);
        border-radius: 100px;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        position: sticky;
        top: 1rem;
        z-index: 100;
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

    .homepage-nav {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        background: radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.08), transparent 60%),
            rgba(255, 255, 255, 0.02);
        padding: 1rem;
        border-radius: 999px;
        outline: 1px solid var(--glass-border);
        box-shadow: var(--glow-primary);
        margin-left: auto;
    }

    .nav-btn {
        position: relative;
        padding: 0.5rem 1.4rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 500;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        outline: none;
        outline: 0;
        -webkit-appearance: none;
        appearance: none;
        transition: background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease, transform 0.15s ease;
    }

    .nav-btn:hover {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.08);
        box-shadow: 0 0 12px rgba(0, 243, 255, 0.3);
        transform: translateY(-1px);
    }

    .nav-btn[active="true"] {
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        color: #000;
        font-weight: 600;
        box-shadow: 0 0 18px rgba(0, 243, 255, 0.6);
    }

    .homepage-content {
        flex: 1;
        padding: 2rem;
        max-width: 1400px;
        margin: 0 auto;
        width: 100%;
    }

    .view {
        animation: slideUpFade 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    @keyframes slideUpFade {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
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
            justify-content: flex-start;
            overflow-x: auto;
            white-space: nowrap;
            padding: 0.5rem;
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


