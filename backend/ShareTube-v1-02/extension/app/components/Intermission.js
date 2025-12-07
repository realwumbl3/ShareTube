import { html, css } from "../@dep/zyx.js";
import state from "../state.js";

export default class Intermission {
    constructor() {
        html`
            <div
                class="intermission_overlay st_reset"
                zyx-if=${[state.roomState, (v) => v === "starting" || v === "midroll"]}
            >
                <div class="intermission_message">
                    ${state.roomState.interp((v) => (v === "midroll" ? "Ad playing... waiting for everyone" : "Starting... please wait"))}
                </div>
            </div>
        `.bind(this);
    }
}

css`
    .intermission_overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        z-index: 1000000002;
        pointer-events: none;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        contain: strict;
    }

    .intermission_message {
        font-size: 2em;
        font-weight: bold;
        color: #fff;
        text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5);
        padding: 1em 2em;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.3);
    }
`;

