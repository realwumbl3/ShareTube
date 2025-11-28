import { html, css, LiveVar, LiveList } from "/extension/app/dep/zyx.js";
import AuthManager from "../models/AuthManager.js";

export default class LoginComponent {
    constructor() {
        this.authManager = new AuthManager();
        this.isLoading = new LiveVar(false);
        this.error = new LiveVar(null);
        this.isVisible = new LiveVar(false);

        // Reveal immediately
        requestAnimationFrame(() => {
            this.isVisible.set(true);
            const loader = document.getElementById('app-loader');
            if (loader) {
                loader.classList.add('hidden');
                setTimeout(() => {
                    if (loader.parentNode) loader.parentNode.removeChild(loader);
                }, 500);
            }
        });

        html`
            <div class=${this.isVisible.interp(v => v ? "login-container visible" : "login-container")}>
                <div class="login-card glass-panel">
                    <div class="login-header">
                        <h1>ShareTube</h1>
                        <p class="login-subtitle">Dashboard Access Required</p>
                    </div>

                    <div class="login-content">
                        <p class="login-description">
                            You need to sign in with your Google account to access the ShareTube dashboard.
                        </p>

                        ${this.error.interp((error) =>
                            error ? html`<div class="error-message">${error}</div>` : ''
                        )}

                        <button
                            class="login-button"
                            zyx-click=${() => this.handleLogin()}
                            disabled=${this.isLoading.interp((v) => v ? '' : null)}
                        >
                            ${this.isLoading.interp((loading) =>
                                loading ? 'Signing in...' : 'Sign in with Google'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        `.bind(this);
    }

    handleLogin() {
        console.log('handleLogin called');
        this.isLoading.set(true);
        this.error.set(null);

        try {
            // Start OAuth flow - this will redirect away from the page
            console.log('Calling authManager.startOAuthFlow()');
            this.authManager.startOAuthFlow();
        } catch (e) {
            console.error('Error in handleLogin:', e);
            this.error.set('Login failed: ' + e.message);
            this.isLoading.set(false);
        }
        // Note: Code after this line won't execute due to redirect
    }
}

css`
    @import "/static/dashboard/css/styles.css";

    .login-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        /* Match dashboard background */
        background-color: var(--bg-app);
        background-image:
            radial-gradient(circle at 15% 50%, rgba(188, 19, 254, 0.08), transparent 25%),
            radial-gradient(circle at 85% 30%, rgba(0, 243, 255, 0.08), transparent 25%);
        padding: 2rem;
    }

    .login-card {
        max-width: 400px;
        width: 100%;
        padding: 3rem 2rem;
        /* Use glass-panel variables from styles.css */
        background: var(--bg-queue-panel);
        backdrop-filter: blur(1em) brightness(0.65) contrast(1.05);
        -webkit-backdrop-filter: blur(1em) brightness(0.65) contrast(1.05);
        outline: var(--outline-queue);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-card);
        position: relative;
        overflow: hidden;
    }

    /* Add a subtle glow effect to the card */
    .login-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(0, 243, 255, 0.5), transparent);
    }

    .login-header {
        text-align: center;
        margin-bottom: 2.5rem;
    }

    .login-header h1 {
        font-family: var(--font-main);
        font-size: 2.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -1px;
        display: inline-block;
        background: linear-gradient(135deg, #fff 0%, var(--text-secondary) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .login-subtitle {
        color: var(--accent-primary);
        font-family: var(--font-mono);
        font-size: 0.9rem;
        margin: 0.75rem 0 0 0;
        font-weight: 500;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        opacity: 0.8;
    }

    .login-content {
        text-align: center;
    }

    .login-description {
        color: var(--text-secondary);
        margin-bottom: 2.5rem;
        line-height: 1.6;
        font-size: 1rem;
    }

    .error-message {
        background: rgba(255, 0, 85, 0.1);
        outline: 1px solid rgba(255, 0, 85, 0.3);
        color: #ff4d7d;
        padding: 0.75rem;
        border-radius: var(--radius-sm);
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .login-button {
        width: 100%;
        padding: 1rem 1.5rem;
        /* Glass button style adapted for primary action */
        background: radial-gradient(circle at top, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
        outline: 1px solid rgba(255, 255, 255, 0.2);
        color: var(--text-primary);
        border-radius: var(--radius-md);
        font-family: var(--font-main);
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        position: relative;
        overflow: hidden;
    }

    .login-button::before {
        /* Google Icon placeholder or glow */
        content: '';
        position: absolute;
        left: 1.25rem;
        top: 50%;
        transform: translateY(-50%);
        width: 1.25rem;
        height: 1.25rem;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%23fff' d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'/%3E%3Cpath fill='%23fff' d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6.19c4.51-4.18 7.09-10.36 7.09-17.84z'/%3E%3Cpath fill='%23fff' d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'/%3E%3Cpath fill='%23fff' d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6.19c-2.14 1.44-4.86 2.27-8.16 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'/%3E%3C/svg%3E");
        background-size: contain;
        background-repeat: no-repeat;
        transition: transform 0.3s ease;
    }

    .login-button:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        outline-color: var(--accent-primary);
        box-shadow: 0 0 20px rgba(0, 243, 255, 0.2);
        transform: translateY(-1px);
        color: #fff;
    }

    .login-button:hover:not(:disabled)::before {
        transform: translateY(-50%) scale(1.1);
    }

    .login-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: rgba(255, 255, 255, 0.02);
        outline-color: transparent;
    }
`;

