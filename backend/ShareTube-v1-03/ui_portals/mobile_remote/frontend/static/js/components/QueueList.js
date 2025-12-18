import { css, html } from "/extension/shared/dep/zyx.js";

import ShareTubeHub from "/extension/appshell/components/Hub.js";
import state from "/extension/appshell/core/state/state.js";
import { GyroscopeParallax } from "./utils.js";
/**
 * Thin wrapper around the extension's ShareTubeHub component so we can reuse
 * the full-featured hub UI inside the mobile remote experience.
 */
export default class QueueList extends ShareTubeHub {
    constructor(app) {
        // Ensure the hub starts visible on mobile remote; matches previous behaviour.
        if (!state.hubVisible.get()) {
            state.hubVisible.set(true);
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
        await this.parallax.init(this.currentPlaying.current_playing);
    }
}

css`
    .remote-content .queue-section #sharetube_hub {
        width: 100%;
        max-width: unset;
        max-height: unset;
        min-width: unset;
        outline: none;
        border: none;
        height: 100%;
        border-radius: 0;
    }

    .remote-content .queue-section #sharetube_hub .queue-list {
        max-height: 70vh;
    }

    .current_playing.parallax .current_playing_background {
        transform-origin: center;
        transition: transform 0.1s ease-out;
        transform: translate(var(--parallax-x, 0), var(--parallax-y, 0)) scale(1);
        will-change: transform;
    }
`;
