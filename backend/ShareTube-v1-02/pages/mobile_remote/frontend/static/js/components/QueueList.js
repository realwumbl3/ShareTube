import { css } from "/extension/app/@dep/zyx.js";

import ShareTubeQueue from "/extension/app/components/Queue.js";
import state from "/extension/app/state.js";
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
`;
