import { html, css, LiveList, LiveVar } from "../../../../../shared/dep/zyx.js";

import state from "../../../state/state.js";

class PlayerOSDDebugItem {
    constructor(label, value) {
        this.label = label;
        this.value = value;
    }
}

const shortcutIconSVG = html`<svg width="42" height="30" viewBox="0 0 42 30" class="shortcut-icon">
    <defs>
        <mask id="osd-shortcut-mask">
            <rect width="100%" height="100%" fill="white" />

            <!-- Top Row: D -->
            <text
                x="32"
                y="11"
                font-family="Roboto, sans-serif"
                font-weight="700"
                font-size="10"
                text-anchor="middle"
                fill="black"
            >
                D
            </text>

            <!-- Bottom Row: ALT -->
            <text
                x="10"
                y="26"
                font-family="Roboto, sans-serif"
                font-weight="700"
                font-size="8"
                text-anchor="middle"
                fill="black"
            >
                ALT
            </text>
        </mask>
    </defs>
    <g mask="url(#osd-shortcut-mask)">
        <!-- Top Row: D -->
        <rect x="22" y="0" width="20" height="14" rx="3" fill="white" />

        <!-- Bottom Row: ALT -->
        <rect x="0" y="16" width="20" height="14" rx="3" fill="white" />
    </g>
</svg>`;

export default class PlayerOSDDebug {
    constructor(youtubePlayer) {
        this.youtubePlayer = youtubePlayer;

        this.logList = new LiveList([]);
        this.timecode = new LiveVar(this.formatVideoTimecode());
        this.timecodeTickerIntervalId = null;

        state.debug_mode.subscribe(this.visibilityToggled);

        html`<div class="player_osd_debug" zyx-if=${state.debug_mode}>
            <div class="header-row">
                <div class="timecode">${this.timecode.interp()}</div>
                ${shortcutIconSVG}
            </div>
            <div class="debug-list">
                <span>ad_sync_mode: ${state.adSyncMode.interp()}</span>
                <span>in_room: ${state.inRoom.interp()}</span>
                <span>room_state: ${state.roomState.interp()}</span>
                <span>enforced player state: ${this.youtubePlayer.desired_state.interp()}</span>
                <span>ad_playing: ${this.youtubePlayer.ad_playing.interp()}</span>
                <span>current_playback_rate: ${state.currentPlaybackRate.interp()}</span>
                <span>current_drift_ms: ${state.currentDriftMs.interp((v) => (v > 0 ? `+${v}ms` : `${v}ms`))}</span>
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

    visibilityToggled = (newState) => {
        newState ? this.startTimecodeTicker() : this.stopTimecodeTicker();
    };

    stopTimecodeTicker() {
        if (this.timecodeTickerIntervalId) {
            clearInterval(this.timecodeTickerIntervalId);
            this.timecodeTickerIntervalId = null;
        }
    }

    startTimecodeTicker() {
        this.timecodeTickerIntervalId = setInterval(() => {
            this.timecode.set(this.formatVideoTimecode());
        }, 16); // 60fps
    }

    log(message, value = null) {
        this.logList.unshift(new PlayerOSDDebugItem(message, value));
        console.log("player.osdDebug.log", message);
    }

    formatVideoTimecode() {
        const ms = this.youtubePlayer?.videoCurrentTimeMs ?? 0;
        if (!Number.isFinite(ms)) return "--:--:--:----";
        const total = Math.max(0, Math.floor(ms));
        const hh = String(Math.floor(total / 3600000)).padStart(2, "0");
        const mm = String(Math.floor((total % 3600000) / 60000)).padStart(2, "0");
        const ss = String(Math.floor((total % 60000) / 1000)).padStart(2, "0");
        const msss = String(total % 1000).padStart(4, "0"); // hh:mm:ss:msss
        return `${hh}:${mm}:${ss}:${msss}`;
    }
}

css`
    .player_osd_debug {
        position: absolute;
        top: 4px;
        left: 4px;
        background-color: rgba(0, 0, 0, 0.8);
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

        & .header-row {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
        }

        & .timecode {
            font-family: "Roboto Mono", "SFMono-Regular", Menlo, Consolas, monospace;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: 0.03em;
            padding: 4px 6px;
            background: rgba(0, 0, 0, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.7);
            border-radius: 3px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
            width: fit-content;
            min-width: 140px;
        }

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
