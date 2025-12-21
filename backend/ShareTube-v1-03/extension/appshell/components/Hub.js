import { html, css, LiveVar } from "../../shared/dep/zyx.js";
import state from "../core/state/state.js";

import QueueListsComponent from "./QueueLists.js";
import CurrentPlaying from "./CurrentPlaying.js";
import EmbeddedPlayer from "./EmbeddedPlayer.js";
import RoomSettings from "./RoomSettings.js";
import UserIcons from "./UserIcons.js";
import { resolveAssetUrl } from "../../shared/urlResolver.js";

css`
    @import url(${resolveAssetUrl("shared/css/hub-container.css")});
`;

// Global drag state since dataTransfer doesn't work with zyx framework
export default class ShareTubeHub {
    constructor(app, { isMobileRemote = false } = {}) {
        this.app = app;

        this.isMobileRemote = new LiveVar(isMobileRemote);

        this.currentPlaying = new CurrentPlaying(app, { isMobileRemote: this.isMobileRemote });

        this.queueList = new QueueListsComponent();
        this.roomSettings = new RoomSettings(app);

        this.userIcons = new UserIcons(app, { showShareButton: isMobileRemote });

        html`
            <div
                id="sharetube_hub"
                class="SlideDisplayToggle"
                role="complementary"
                aria-label="ShareTube Hub"
                zyx-if=${[state.hubVisible, (v) => v]}
            >
                ${this.currentPlaying || ""}
                <div class="hub-pages">
                    <div class="hub-view">
                        <div class="hub-page" zyx-radioview="pages.queueList">${this.queueList || ""}</div>
                        <div class="hub-page" zyx-radioview="pages.roomSettings">${this.roomSettings || ""}</div>
                    </div>
                    <div class="hub-footer">
                        <div class="hub-page-selector">
                            ${this.userIcons}
                            <div class="hub-page-selector-item" zyx-radioview="pages.queueList.open">Queues</div>
                            <div
                                class="hub-page-selector-item"
                                zyx-radioview="pages.roomSettings.open"
                                zyx-if=${state.isOperator}
                            >
                                Settings
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.footer;
    }

    toggleHubVisibility() {
        state.hubVisible.set(!state.hubVisible.get());
    }
}

css`
    #sharetube_hub .toggle-embedded-player-btn {
        z-index: 1;
        margin: 8px;
        padding: 4px 10px;
        height: max-content;
        font-size: 11px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: radial-gradient(circle at top, rgba(255, 255, 255, 0.12), rgba(54, 54, 54, 0.9));
        color: var(--text-primary, #fff);
        cursor: pointer;
        white-space: nowrap;
        transition: background 140ms ease, border-color 140ms ease, transform 80ms ease;
    }

    #sharetube_hub .toggle-embedded-player-btn:hover {
        background: radial-gradient(circle at top, rgba(255, 255, 255, 0.18), rgba(68, 68, 68, 0.95));
        border-color: rgba(255, 255, 255, 0.32);
    }
`;
