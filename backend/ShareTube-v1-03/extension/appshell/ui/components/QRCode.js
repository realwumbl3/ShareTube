import { html, css, LiveVar } from "../../../shared/dep/zyx.js";
import state from "../../core/state/state.js";

import QRCode from "../../../shared/dep/qrcode.esm.js";

export default class QRCodeComponent {
    constructor(app) {
        this.app = app;
        this.visible = new LiveVar(false);

        html`
            <div id="sharetube_qr_modal" zyx-if=${this.visible} zyx-click=${(e) => this.handleBackdropClick(e)}>
                <div class="qr-modal-content" zyx-click=${(e) => e.stopPropagation()}>
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
                            <a href="${state.roomCode.interp(() => this.qrUrl())}" target="_blank" class="qr-url">
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

    qrUrl() {
        // For now, use a simple approach. In production, this should call the backend API
        // to generate proper JWT tokens. For development, we'll use base64 encoded tokens.
        const roomCode = state.roomCode.get();
        if (!roomCode) return "#";

        // Create a simple base64 encoded auth token
        const authToken = btoa(
            JSON.stringify({
                room_code: roomCode,
                timestamp: Date.now(),
                type: "mobile_remote_auth",
            })
        );

        return `${state.backendUrl.get()}/mobile-remote/auth/${authToken}`;
    }

    show() {
        const roomCode = state.roomCode.get();
        if (!roomCode) {
            console.warn("No active room to generate QR code for");
            return;
        }

        console.log("QRCode.show() called, QRCode available:", !!window.QRCode);
        this.visible.set(true);

        // QR code library is loaded via manifest.json content scripts
        // Wait for modal to be visible, then generate QR code
        setTimeout(() => {
            this.generateQRCode();
        }, 100);
    }

    hide() {
        this.visible.set(false);
    }

    handleBackdropClick(e) {
        if (e.target.id === "sharetube_qr_modal") {
            this.hide();
        }
    }

    async generateQRCode() {
        console.log("generateQRCode() called");

        const authUrl = this.qrUrl();

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
