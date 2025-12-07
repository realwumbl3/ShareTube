import { html, css, LiveList, LiveVar } from "../dep/zyx.js";

import state from "../state.js";

class PlayerOSDDebugItem {
    constructor(label, value) {
        this.label = label;
        this.value = value;
    }
}

export default class PlayerOSDDebug {
    constructor(youtubePlayer) {
        this.youtubePlayer = youtubePlayer;

        this.logList = new LiveList([]);

        html`<div class="player_osd_debug" zyx-if=${state.debug_mode}>
            <div class="debug-list">
                <span>ad_sync_mode: ${state.adSyncMode.interp()}</span>
                <span>in_room: ${state.inRoom.interp()}</span>
                <span>room_state: ${state.roomState.interp()}</span>
                <span>enforced player state: ${this.youtubePlayer.desired_state.interp()}</span>
                <span>ad_playing: ${this.youtubePlayer.ad_playing.interp()}</span>
                <span>current_playback_rate: ${state.currentPlaybackRate.interp()}</span>
            </div>
            <div class="log-header">Log</div>
            <div
                class="log-list"
                zyx-live-list=${{
                    list: this.logList,
                    compose: (item) =>
                        html`<span class="log-item">${item.label}${item.value ? `: ${item.value}` : ""}</span>`,
                    range: [0, 20],
                }}
            ></div>
        </div>`.bind(this);
    }

    log(message, value = null) {
        this.logList.unshift(new PlayerOSDDebugItem(message, value));
        console.log("player.osdDebug.log", message);
    }
}

css`
    .player_osd_debug {
        position: absolute;
        top: 4px;
        left: 4px;
        backdrop-filter: blur(10px) brightness(2) contrast(0.5);
        color: #fff;
        z-index: 1000000000;
        min-width: 200px;
        padding: 2px;
        border-radius: 4px;
        gap: 1px;
        display: flex;
        flex-direction: column;
        outline: 1px solid rgba(255, 255, 255, 0.6);

        font-size: 8px;
        font-family: "Roboto";
        color: #fff;

        & .debug-list {
            display: flex;
            flex-direction: column;
            gap: 1px;
            align-items: start;
            text-align: left;
            width: 100%;
        }
        & .log-header {
            border-left: 3px solid #fff;
            border-bottom: 1px solid #fff;
            padding-left: 4px;
        }
        & .log-list {
            display: flex;
            flex-direction: column;
            gap: 1px;
            align-items: start;
            text-align: left;
            width: 100%;
            max-height: 10ch;
            overflow-y: auto;
        }
        & .log-item {
        }
    }
`;
