import { html, css, LiveVar } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";

import QRCode from "../../shared/dep/qrcode.esm.js";

export default class QRCodeComponent {
    constructor(app) {
        this.app = app;
        this.visible = new LiveVar(false);
        this.authUrl = new LiveVar("#");
        this.qrGenerated = false;

        html`
            <div id="sharetube_qr_modal" zyx-if=${this.visible} zyx-click=${(e) => this.handleBackdropClick(e)}>
                <div class="qr-modal-content" zyx-click=${(e) => e.e.stopPropagation()}>
                    <div class="qr-header">
                        <h3>Mobile Remote</h3>
                        <button class="qr-close-btn" zyx-click=${() => this.hide()}>
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="qr-body">
                        <p class="qr-instructions">
                            Scan this QR code with your mobile device to control playback remotely.
                        </p>
                        <div id="qr-code-container" class="qr-code-container" this="qr_code_container"></div>
                        <div class="qr-url-link">
                            <a
                                href=${this.authUrl.interp((url) => url)}
                                title=${this.authUrl.interp((url) => url)}
                                target="_blank"
                                class="qr-url"
                            >
                                sharetube.wumbl3.xyz/mobile-remote
                            </a>
                        </div>
                        <div class="qr-room-info">
                            Room: <span class="room-code">${state.roomCode.interp((code) => code || "No room")}</span>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.qr_code_container;

        }

    async _fallbackAuthUrl(roomCode) {
        if (!roomCode) return "#";
        const backendUrl = await this.app.backEndUrl();
        return `${backendUrl}/mobile-remote/${encodeURIComponent(roomCode)}`;
    }

    async requestAuthUrl(roomCode) {
        const baseUrl = await this.app.backEndUrl();
        const authToken = await this.app.authManager.authToken();
        if (!authToken) {
            throw new Error("No auth token available for mobile remote");
        }

        const response = await fetch(
            `${baseUrl}/mobile-remote/api/generate-auth-url/${encodeURIComponent(roomCode)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    Accept: "application/json",
                },
            }
        );

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(
                `Mobile remote auth URL request failed (${response.status}): ${body}`
            );
        }

        const payload = await response.json();
        if (!payload?.auth_url) {
            throw new Error("Mobile remote auth URL response missing auth_url");
        }

        this.authUrl.set(payload.auth_url);
        return payload.auth_url;
    }

    show() {
        const roomCode = state.roomCode.get();
        if (!roomCode) {
            console.warn("No active room to generate QR code for");
            return;
        }

        // Reset generation flag when showing
        this.qrGenerated = false;

        console.log("QRCode.show() called, QRCode available:", !!window.QRCode);
        this.visible.set(true);

        const fallbackUrl = this._fallbackAuthUrl(roomCode);
        
        // Fetch auth URL first, then generate QR code once with the final URL
        this.requestAuthUrl(roomCode)
            .then((authUrl) => {
                // Only generate if modal is still visible and not already generated
                if (this.visible.get() && !this.qrGenerated) {
                    this.authUrl.set(authUrl);
                    setTimeout(() => {
                        this.generateQRCode();
                        this.qrGenerated = true;
                    }, 100);
                }
            })
            .catch((error) => {
                console.warn("Failed to build authenticated mobile remote URL", error);
                // Only generate if modal is still visible and not already generated
                if (this.visible.get() && !this.qrGenerated) {
                    this.authUrl.set(fallbackUrl);
                    setTimeout(() => {
                        this.generateQRCode();
                        this.qrGenerated = true;
                    }, 100);
                }
            });
    }

    hide() {
        this.visible.set(false);
        this.qrGenerated = false;
    }

    handleBackdropClick(e) {
        if (e.e.target.id === "sharetube_qr_modal") {
            this.hide();
        }
    }

    async generateQRCode() {
        console.log("generateQRCode() called");
        const fallbackUrl = await this._fallbackAuthUrl(state.roomCode.get());
        const authUrl = this.authUrl.get() || fallbackUrl;

        // Clear any existing QR code
        this.qr_code_container.innerHTML = "";

        try {
            // Generate QR code using the qrcode-generator-es6 library
            // 0 = auto-detect type number, 'M' = medium error correction
            const qr = new QRCode(0, "M");
            qr.addData(authUrl);
            qr.make();

            // Create SVG element
            const svgString = qr.createSvgTag({
                cellSize: 4,
                margin: 4,
                cellColor: () => "#ffffff",
                bg: { enabled: true, fill: "#18181b" },
            });

            // Insert SVG into container
            this.qr_code_container.innerHTML = svgString;

            // Ensure SVG has proper dimensions
            const svgElement = this.qr_code_container.querySelector("svg");
            if (svgElement) {
                svgElement.style.width = "180px";
                svgElement.style.height = "180px";
                svgElement.style.maxWidth = "100%";
            }

            console.log("QR code generated successfully");
        } catch (e) {
            console.error("Failed to generate QR code:", e);
            this.qr_code_container.innerHTML =
                '<div style="color: red; padding: 20px;">Failed to generate QR code</div>';
        }
    }
}

css`
    #sharetube_qr_modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(4px);
    }

    .qr-modal-content {
        background: var(--bg-card, #18181b);
        border-radius: 12px;
        border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        max-width: 400px;
        width: 90%;
        max-height: 90vh;
        overflow: hidden;
        animation: qr-modal-appear 0.2s ease-out;
    }

    @keyframes qr-modal-appear {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    .qr-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px 16px;
        border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    }

    .qr-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary, #f4f4f5);
    }

    .qr-close-btn {
        background: none;
        border: none;
        color: var(--text-secondary, #a1a1aa);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: background 0.2s ease, color 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .qr-close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-primary, #f4f4f5);
    }

    .qr-body {
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
    }

    .qr-instructions {
        text-align: center;
        color: var(--text-secondary, #a1a1aa);
        font-size: 14px;
        line-height: 1.5;
        margin: 0;
    }

    .qr-code-container {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: var(--bg-dark, #09090b);
        border-radius: 8px;
        border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
        min-height: 200px;
        min-width: 200px;
    }

    .qr-code-container canvas,
    .qr-code-container svg {
        border-radius: 4px;
        max-width: 100%;
        height: auto;
    }

    .qr-url-link {
        margin-top: 8px;
    }

    .qr-url {
        color: var(--accent-primary, #6366f1);
        text-decoration: none;
        font-size: 12px;
        font-family: monospace;
        word-break: break-all;
        text-align: center;
        display: block;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
        transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }

    .qr-url:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--accent-hover, #4f46e5);
        border-color: var(--accent-primary, #6366f1);
    }

    .qr-room-info {
        text-align: center;
        color: var(--text-secondary, #a1a1aa);
        font-size: 12px;
    }

    .room-code {
        color: var(--accent-primary, #6366f1);
        font-weight: 500;
        font-family: monospace;
    }
`;
