import { html, css, LiveVar } from "/extension/app/@dep/zyx.js";

const API_BASE = window.__DASHBOARD_API_BASE__ || "/dashboard";

export default class DebugTab {
    constructor() {
        this.loading = new LiveVar(false);
        this.message = new LiveVar("");
        this.fakeUserCount = new LiveVar(5);

        // Bind methods
        this.createFakeUsers = this.createFakeUsers.bind(this);
        this.removeAllFakeUsers = this.removeAllFakeUsers.bind(this);
        this.showMessage = this.showMessage.bind(this);

        html`
            <div class="debug-tab glass-panel">
                <h2 class="debug-title">🛠️ Debug Tools</h2>
                <p class="debug-description">Use these tools for testing and development purposes only.</p>

                <div class="debug-section">
                    <h3>Fake Users</h3>
                    <p>Create or remove fake users for testing user management features.</p>

                    <div class="debug-controls">
                        <div class="create-users-group">
                            <label for="fake-user-count">Number of fake users to create:</label>
                            <input
                                type="number"
                                id="fake-user-count"
                                min="1"
                                max="50"
                                value=${this.fakeUserCount.interp((v) => v)}
                                zyx-input=${(e) => {
                                    const value = parseInt(e.target.value);
                                    if (value >= 1 && value <= 50) {
                                        this.fakeUserCount.set(value);
                                    }
                                }}
                                class="count-input"
                            />
                            <button
                                class="debug-btn create-btn"
                                zyx-click=${this.createFakeUsers}
                                disabled=${this.loading.interp((v) => v || null)}
                            >
                                Create Fake Users
                            </button>
                        </div>

                        <button
                            class="debug-btn remove-btn"
                            zyx-click=${this.removeAllFakeUsers}
                            disabled=${this.loading.interp((v) => v || null)}
                        >
                            Remove All Fake Users
                        </button>
                    </div>
                </div>

                <div class="debug-message" zyx-if=${[this.message, (v) => v]}>
                    <div class="message-content">${this.message.interp((v) => v)}</div>
                </div>
            </div>
        `.bind(this);
    }

    async createFakeUsers() {
        if (this.loading.get()) return;

        this.loading.set(true);
        this.message.set("");

        try {
            const count = this.fakeUserCount.get();
            const response = await fetch(`${API_BASE}/api/debug/create-fake-users?count=${count}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showMessage(`✅ Successfully created ${result.created_count} fake users!`, "success");
            } else {
                this.showMessage(`❌ Failed to create fake users: ${result.error || "Unknown error"}`, "error");
            }
        } catch (error) {
            console.error("Error creating fake users:", error);
            this.showMessage(`❌ Network error: ${error.message}`, "error");
        } finally {
            console.log("Setting loading to false");
            this.loading.set(false);
        }
    }

    async removeAllFakeUsers() {
        if (this.loading.get()) return;

        const confirmed = confirm("Are you sure you want to remove ALL fake users? This action cannot be undone.");
        if (!confirmed) return;

        this.loading.set(true);
        this.message.set("");

        try {
            const response = await fetch(`${API_BASE}/api/debug/remove-fake-users`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showMessage(`✅ Successfully removed ${result.removed_count} fake users!`, "success");
            } else {
                this.showMessage(`❌ Failed to remove fake users: ${result.error || "Unknown error"}`, "error");
            }
        } catch (error) {
            console.error("Error removing fake users:", error);
            this.showMessage(`❌ Network error: ${error.message}`, "error");
        } finally {
            this.loading.set(false);
        }
    }

    showMessage(text, type = "info") {
        this.message.set(text);
        // Clear message after 5 seconds
        setTimeout(() => {
            this.message.set("");
        }, 5000);
    }
}

css`
    .debug-tab {
        padding: 2rem;
        max-width: 800px;
    }

    .debug-title {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        background: linear-gradient(to right, #fff, #aaa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -1px;
    }

    .debug-description {
        color: var(--text-secondary);
        margin-bottom: 2rem;
        font-size: 1rem;
    }

    .debug-section {
        margin-bottom: 2rem;
        padding: 1.5rem;
        background: rgba(255, 255, 255, 0.02);
        border-radius: var(--radius-md);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .debug-section h3 {
        font-size: 1.3rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: var(--text-primary);
    }

    .debug-section p {
        color: var(--text-secondary);
        margin-bottom: 1.5rem;
        font-size: 0.95rem;
    }

    .debug-controls {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .create-users-group {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .create-users-group label {
        color: var(--text-primary);
        font-weight: 500;
        white-space: nowrap;
    }

    .count-input {
        width: 80px;
        padding: 0.5rem;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        font-size: 0.9rem;
        text-align: center;
    }

    .count-input:focus {
        outline: none;
        border-color: var(--accent-primary);
        box-shadow: 0 0 0 2px rgba(0, 243, 255, 0.2);
    }

    .debug-btn {
        padding: 0.75rem 1.5rem;
        border-radius: var(--radius-md);
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease;
        border: 1px solid transparent;
        min-width: 160px;
    }

    .create-btn {
        background: rgba(34, 197, 94, 0.1);
        color: #86efac;
        border-color: rgba(34, 197, 94, 0.3);
    }

    .create-btn:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.2);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
    }

    .remove-btn {
        background: rgba(239, 68, 68, 0.1);
        color: #fca5a5;
        border-color: rgba(239, 68, 68, 0.3);
        align-self: flex-start;
    }

    .remove-btn:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.2);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }

    .debug-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }

    .debug-message {
        margin-top: 2rem;
        padding: 1rem;
        border-radius: var(--radius-md);
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .message-content {
        color: var(--text-primary);
        font-size: 0.95rem;
        font-weight: 500;
    }

    @media (max-width: 768px) {
        .debug-tab {
            padding: 1rem;
        }

        .create-users-group {
            flex-direction: column;
            align-items: stretch;
        }

        .create-users-group label {
            white-space: normal;
            margin-bottom: 0.5rem;
        }

        .count-input {
            width: 100%;
        }

        .debug-btn {
            width: 100%;
            min-width: auto;
        }
    }
`;
