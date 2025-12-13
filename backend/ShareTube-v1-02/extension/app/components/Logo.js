import { html, css, LiveVar } from "../@dep/zyx.js";

import state from "../state.js";

export default class Logo {
    constructor() {
        this.expanded = new LiveVar(false);
        html`
            <div
                id="sharetube_logo"
                expanded=${this.expanded.interp()}
                zyx-miceenter=${(e) => this.expanded.set(true)}
                zyx-miceleave=${(e) => this.expanded.set(false)}
            >
                <span>S</span>
                <span>hare</span>
                <span>T</span>
                <span>ube</span>
            </div>
        `.bind(this);
    }

    expand() {
        this.expanded.set(true);
    }

    collapse() {
        this.expanded.set(false);
    }
}

css`
    /* Base layout */
    #sharetube_logo {
        display: inline-flex;
        align-items: baseline;
        transition: gap 200ms ease;
        /*transform: translateY(-0.05em);*/
        font-family: "Roboto", sans-serif;
    }

    /*Default (expanded) typography */
    #sharetube_logo > span {
        display: inline-block;
        white-space: nowrap;
        line-height: 1;
    }

    /* Animate core letters S and T scaling */
    #sharetube_logo > span:nth-child(1),
    #sharetube_logo > span:nth-child(3) {
        transition: transform 220ms ease;
        transform-origin: center;
    }

    /* Animate rest segments (hare, ube) fading and width expansion */
    #sharetube_logo > span:nth-child(2),
    #sharetube_logo > span:nth-child(4) {
        transition: opacity 160ms ease, max-width 240ms ease;
        overflow: hidden;
        opacity: 1;
    }

    /* Expanded state - final sizes with slight delay for rest to appear after S/T scale */
    #sharetube_logo[expanded="true"] > span:nth-child(1),
    #sharetube_logo[expanded="true"] > span:nth-child(3) {
        transform: scale(1);
    }
    #sharetube_logo[expanded="true"] > span:nth-child(2) {
        max-width: 4ch; /* 'hare' */
        opacity: 1;
        transition-delay: 120ms, 120ms;
    }
    #sharetube_logo[expanded="true"] > span:nth-child(4) {
        max-width: 3.3ch; /* 'ube' */
        opacity: 1;
        transition-delay: 120ms, 120ms;
    }

    /* Collapsed state - only S and T remain, gap tightens */

    #sharetube_logo:not([expanded="true"]) > span:nth-child(2) {
        max-width: 0ch;
        opacity: 0;
        transition-delay: 0ms, 120ms; /* fade first, then width closes to shrink container */
    }
    #sharetube_logo:not([expanded="true"]) > span:nth-child(4) {
        max-width: 0ch;
        opacity: 0;
        transition-delay: 0ms, 120ms;
    }
`;
