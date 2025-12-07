import { html, css } from "../../@dep/zyx.js";

import { msDurationTimeStamp } from "../../utils.js";

export default class Splash {
    constructor(video) {
        this.video = video;
        this.actorAudit = new ActorAudit();
        html`<div class="splash_overlay">
            <div this="badge_zone" class="badge_zone"></div>
            ${this.actorAudit}
        </div>`.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.badge_zone;

        /** zyx-sense @type {HTMLDivElement} */
        this.badge_zone;
    }

    call(playbackData, actor) {
        const action = getActionFromPlaybackData(playbackData);
        const badgeClass = ACTION_TRIGGERMAP[action];
        if (!badgeClass) {
            console.warn("Splash: unknown action", action);
            return;
        }
        // Add actor to audit trail
        if (actor) this.actorAudit.addActor(playbackData, actor);
        this.animate(badgeClass, playbackData);
    }

    animate(badgeClass, playbackData) {
        const badge = new badgeClass(playbackData);
        badge.appendTo(this.badge_zone);
        badge.animate();
        return badge;
    }
}

class BadgeBase {
    constructor() {
        html`<div class="badge_container">
            <div this="badge" class="badge"></div>
        </div>`.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.badge;

        /** zyx-sense @type {HTMLDivElement} */
        this.badge;

        this.badge.addEventListener("animationend", () => this.end());
    }

    end() {
        this.main.remove();
    }

    animate() {
        setTimeout(() => (this.badge.style.animation = "spring_in 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards"), 1);
    }
}

class PlayPauseBadge extends BadgeBase {
    constructor(playbackData) {
        super();
        const state = playbackData.trigger === "room.control.pause" ? "pause" : "play";
        html`<div this="large_icon" class="large_icon"></div>`.join(this).appendTo(this.badge);
        const badgeSvg = chrome.runtime.getURL(`app/@assets/${state}.svg`);
        this.large_icon.style.backgroundImage = `url(${badgeSvg})`;
    }
}

class SeekBadge extends BadgeBase {
    constructor(playbackData) {
        super();
        const direction = playbackData.delta_ms !== null ? (playbackData.delta_ms > 0 ? "forward" : "backward") : "";

        html`<div this="label" class="label frame_step_label ${direction}">
            <div class="frame_step_icon" style="${playbackData.delta_ms === null ? "display:none" : ""}">➤➤</div>
            <span this="text_span"></span>
        </div>`
            .join(this)
            .appendTo(this.badge);

        this.updateLabel(playbackData);
    }

    updateLabel(playbackData) {
        console.log("updateLabel: playbackData", playbackData);
        if (playbackData.delta_ms !== null) {
            this.text_span.textContent = `${Math.abs(playbackData.delta_ms / 1000)}s`;
        } else {
            this.text_span.textContent = msDurationTimeStamp(playbackData.progress_ms);
        }
    }
}

class FrameStepBadge extends BadgeBase {
    constructor(playbackData) {
        super();

        const direction = playbackData.frame_step > 0 ? "forward" : "backward";
        // Create label with frame step styling
        html`<div this="label" class="label frame_step_label ${direction}">
            <div class="frame_step_icon">➤➤</div>
            framestep
        </div>`
            .join(this)
            .appendTo(this.badge);

        this.badge.classList.add(`frame_step_${direction}`);
    }
}

// Audit trail of actors who have performed actions in the room.
class ActorAudit {
    #max_entries = 5;
    constructor() {
        this.actorAuditTrail = [];
        html`<div this="actor_audit" class="actor_audit"></div>`.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.actor_audit;

        /** zyx-sense @type {HTMLDivElement} */
        this.actor_audit;
    }

    addActor(playbackData, actor) {
        const entry = new ActorAuditEntry(playbackData, actor);
        entry.appendTo(this.actor_audit);
        this.actorAuditTrail.push(entry);

        // Keep only last 5 entries
        if (this.actorAuditTrail.length > this.#max_entries) {
            this.actorAuditTrail.shift().remove();
        }
    }
}

class ActorAuditEntry {
    #fade_out_duration_ms = 100;
    #fade_in_duration_ms = 200;
    #remove_timeout_ms = 2000;
    constructor(playbackData, actor) {
        const trigger = playbackData.trigger || "room.control.seek";
        const actionClass = getActionFromPlaybackData(playbackData, trigger);
        const actionLabel = getActionLabel(actionClass);

        const seek = actionClass === "action-seek" ? ` to ${msDurationTimeStamp(playbackData.progress_ms)}` : "";

        html`
            <div class="actor_entry ${actionClass}">
                <img class="actor_avatar" src="${actor.avatarUrl.interp()}" />
                <div class="actor_details">
                    <span class="actor_name">${actor.name.interp()}</span>
                    <span class="action_label">${actionLabel}${seek}</span>
                </div>
            </div>
        `.bind(this);

        this.main.style.animation = `actor_fade_in ${this.#fade_in_duration_ms}ms ease-out forwards`;

        // Auto-remove after 5 seconds
        this.removeTimeout = setTimeout(() => this.remove(), this.#remove_timeout_ms);
    }

    remove() {
        if (this.removeTimeout) {
            clearTimeout(this.removeTimeout);
            this.removeTimeout = null;
        }
        this.main.style.animation = `actor_fade_out ${this.#fade_out_duration_ms}ms ease-in forwards`;
        setTimeout(() => this.main.remove(), this.#fade_out_duration_ms);
    }
}

const ACTION_TRIGGERMAP = {
    "action-pause": PlayPauseBadge,
    "action-play": PlayPauseBadge,
    "action-restart": PlayPauseBadge,
    "action-seek": SeekBadge,
    "action-seek-forward": SeekBadge,
    "action-seek-backward": SeekBadge,
    "action-frame-forward": FrameStepBadge,
    "action-frame-backward": FrameStepBadge,
};

function getActionFromPlaybackData(playbackData) {
    if (playbackData.frame_step !== undefined && playbackData.frame_step !== null) {
        return playbackData.frame_step > 0 ? "action-frame-forward" : "action-frame-backward";
    }

    const actionMap = {
        "room.control.pause": "action-pause",
        "room.control.play": "action-play",
        "room.control.restartvideo": "action-restart",
        "room.control.seek": playbackData.delta_ms === null ? "action-seek" : playbackData.delta_ms > 0 ? "action-seek-forward" : "action-seek-backward",
    };

    return actionMap[playbackData.trigger] || "action-unknown";
}

function getActionLabel(actionClass) {
    return actionClass.replace("action-", "").replace("-", " ");
}
