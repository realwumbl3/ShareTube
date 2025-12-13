import { css, html } from "/extension/app/@dep/zyx.js";

import ShareTubeQueue from "/extension/app/components/Queue.js";
import state from "/extension/app/state.js";
import { GyroscopeParallax } from "./utils.js";
/**
 * Thin wrapper around the extension's ShareTubeQueue component so we can reuse
 * the full-featured queue UI inside the mobile remote experience.
 */
export default class QueueList extends ShareTubeQueue {
    constructor(app) {
        // Ensure the queue starts visible on mobile remote; matches previous behaviour.
        if (!state.queueVisible.get()) {
            state.queueVisible.set(true);
        }

        super(app, { isMobileRemote: true });

        // Add debug element temporarily
        // html`<div this="debug" style="font-size: 10px; color: #666; margin-top: 10px;"></div>`.join(this).appendTo(this.footer);

        // Initialize gyroscope parallax effect
        this.parallax = new GyroscopeParallax({
            scale: 0.3,
        });

        this.activateGyroThumbnailParallax();
    }

    async activateGyroThumbnailParallax() {
        // Initialize parallax effect on the current playing container
        await this.parallax.init(this.current_playing);
    }
}

css`
    .remote-content .queue-section #sharetube_queue {
        width: 100%;
        max-width: unset;
        max-height: unset;
        min-width: unset;
        outline: none;
        border: none;
        height: 100%;
    }

    .remote-content .queue-section #sharetube_queue .queue-list {
        max-height: 70vh;
    }

    .current_playing.parallax .current_playing_background {
        transform-origin: center;
        transition: transform 0.1s ease-out;
        transform: translate(var(--parallax-x, 0), var(--parallax-y, 0)) scale(1);
        will-change: transform;
    }
`;
