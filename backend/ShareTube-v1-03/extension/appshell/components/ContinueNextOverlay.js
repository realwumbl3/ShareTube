import { html, css } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";

export default class ContinueNextOverlay {
    constructor(app) {
        this.app = app;

        html`<div
            class="continue-next-overlay"
            zyx-if=${[
                state.nextUpItem,
                state.currentPlaying.item,
                (nextUpItem, playingItem) =>
                    nextUpItem !== null && (playingItem === null || playingItem.status.get() === "played"),
            ]}
        >
            <div class="continue-next-content">
                <div class="continue-next-thumb">
                    <img
                        class="thumb"
                        src=${state.nextUpItem.interp((v) => v?.thumbnail_url || null)}
                        alt=${state.nextUpItem.interp((v) => v?.title || "")}
                        loading="lazy"
                    />
                </div>
                <div class="continue-next-meta">
                    <div class="continue-next-title">${state.nextUpItem.interp((v) => v?.title)}</div>
                    <div class="continue-next-author">${state.nextUpItem.interp((v) => v?.youtube_author?.title)}</div>
                </div>
                <button zyx-if=${state.isOperator} class="continue-next-btn" zyx-click=${() => this.continueToNext()}>
                    Advance queue
                </button>
                <button disabled zyx-else class="continue-next-btn">Waiting for operator.</button>
            </div>
        </div>`.bind(this);
    }

    async continueToNext() {
        try {
            await this.app.socket.emit("queue.continue_next", {
                code: state.roomCode.get(),
            });
        } catch (error) {
            console.warn("Failed to continue to next:", error);
        }
    }
}

css`
    .continue-next-overlay {
        position: relative;
        pointer-events: auto;
        padding: 8px;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.8));
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        overflow: hidden;
    }

    .continue-next-overlay::before {
        content: "";
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(67deg, transparent, rgb(255 255 255 / 40%), transparent);
        animation: glowSwipe 3s ease-in-out infinite;
        pointer-events: none;
    }

    .continue-next-content {
        display: grid;
        grid-template-columns: auto 1fr auto;
        grid-template-areas: "thumb meta" "thumb btn";
        align-items: stretch;
        gap: 12px;
        min-width: 300px;
        position: relative;
        z-index: 1;
    }

    .continue-next-thumb {
        height: 80px;
        aspect-ratio: 16/9;
        border-radius: 6px;
        overflow: hidden;
        background: rgba(0, 0, 0, 0.3);
        position: relative;
        grid-area: thumb;
    }

    .continue-next-thumb .thumb {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        position: absolute;
    }

    .continue-next-meta {
        grid-area: meta;
        min-width: 0;
    }

    .continue-next-title {
        font-weight: 500;
        font-size: 13px;
        line-height: 1.3;
        margin-bottom: 2px;
        color: var(--text-primary, #fff);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .continue-next-author {
        font-size: 11px;
        color: var(--yt-spec-text-secondary, #aaa);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .continue-next-btn {
        grid-area: btn;
        align-self: center;
        flex-shrink: 0;
        padding: 6px 12px;
        font-size: 12px;
        background: linear-gradient(135deg, rgba(0, 243, 255, 0.8), rgba(0, 160, 255, 0.7));
        border: 1px solid rgba(0, 243, 255, 0.5);
        color: #000;
        border-radius: 20px;
        cursor: pointer;
        font-weight: 500;
        transition: background 140ms ease, border-color 140ms ease, transform 80ms ease;

        &[disabled] {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    .continue-next-btn:hover {
        background: linear-gradient(135deg, rgba(0, 243, 255, 0.9), rgba(0, 160, 255, 0.8));
        border-color: rgba(0, 243, 255, 0.7);
        transform: translateY(-1px);
    }

    .continue-next-btn:active {
        transform: translateY(0);
    }

    @keyframes glowSwipe {
        0% {
            left: -100%;
        }
        50% {
            left: 100%;
        }
        100% {
            left: 100%;
        }
    }
`;
