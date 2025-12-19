import { html } from "../../shared/dep/zyx.js";

import { msDurationTimeStamp } from "../core/utils/utils.js";
import { resolveAssetUrl } from "../../shared/urlResolver.js";

export default class Splash {
    constructor() {
        this.actorAudit = new ActorAudit();
        html`<div class="splash_overlay">
            <div this="badge_zone" class="badge_zone"></div>
            ${this.actorAudit}
        </div>`.bind(this);
        /** @type {HTMLDivElement} */
        this.badge_zone;
    }

    call(playbackData) {
        console.log("Splash: call", playbackData);
        const actor = playbackData.user;
        const action = getActionFromPlaybackData(playbackData);
        const badgeClass = BADGE_BY_ACTION[action];
        if (!badgeClass) {
            console.warn("Splash: unknown action", action);
            return;
        }
        // Add actor to audit trail
        if (actor) this.actorAudit.addActor(playbackData);
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
        /** @type {HTMLDivElement} */
        this.badge;

        this.badge.addEventListener("animationend", () => this.end(), { once: true });
    }

    end() {
        this.main.remove();
    }

    animate() {
        // Ensure the element is in DOM before applying the animation.
        requestAnimationFrame(() => {
            this.badge.style.animation = `${BADGE_ANIMATION_IN} ${BADGE_ANIMATION_IN_DURATION_MS}ms ${BADGE_ANIMATION_IN_EASING} forwards`;
        });
    }
}

class PlayPauseBadge extends BadgeBase {
    constructor(playbackData) {
        super();
        const state = playbackData.trigger === "room.control.pause" ? "pause" : "play";
        html`<div this="large_icon" class="large_icon"></div>`.join(this).appendTo(this.badge);
        const url = ICON_URL_BY_KEY[state];
        if (url) this.large_icon.style.backgroundImage = `url(${url})`;
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
        this.lastEntry = null;
        html`<div this="actor_audit" class="actor_audit"></div>`.bind(this);
        /** @type {HTMLDivElement} */
        this.actor_audit;
    }

    addActor(playbackData) {
        const actor = playbackData.user;
        if (!actor) return;

        this.#pruneDisconnected();
        const last = this.actorAuditTrail.at(-1) || null;
        if (
            last &&
            last.main &&
            last.main.isConnected &&
            last.actor &&
            actor.id != null &&
            last.actor.id === actor.id
        ) {
            last.bump(playbackData);
            this.#setLastEntry(last);
            return;
        }

        const entry = new ActorAuditEntry(playbackData, actor, () => this.#onEntryRemoved(entry));
        entry.prependTo(this.actor_audit);
        this.actorAuditTrail.push(entry);
        this.#setLastEntry(entry);

        // Keep only last 5 entries
        while (this.actorAuditTrail.length > this.#max_entries) {
            const removed = this.actorAuditTrail.shift();
            if (removed === this.lastEntry) this.lastEntry = null;
            removed.remove();
        }
    }

    #setLastEntry(entry) {
        if (this.lastEntry && this.lastEntry !== entry) {
            this.lastEntry.setIsLast(false);
        }
        this.lastEntry = entry;
        if (this.lastEntry) this.lastEntry.setIsLast(true);
    }

    #onEntryRemoved(entry) {
        // Remove from trail when the DOM element is removed.
        const idx = this.actorAuditTrail.indexOf(entry);
        if (idx !== -1) this.actorAuditTrail.splice(idx, 1);
        if (this.lastEntry === entry) this.lastEntry = null;
    }

    #pruneDisconnected() {
        // Prune entries that have been removed from the DOM but are still in our list.
        this.actorAuditTrail = this.actorAuditTrail.filter((e) => e && e.main && e.main.isConnected);
        if (this.lastEntry && (!this.lastEntry.main || !this.lastEntry.main.isConnected)) this.lastEntry = null;
    }
}

class ActorAuditEntry {
    #fade_out_duration_ms = 100;
    #fade_in_duration_ms = 200;
    #remove_timeout_ms = 3000;
    constructor(playbackData, actor, onRemoved) {
        this.actor = actor;
        this.is_last = true;
        this.actionHistory = [];
        this.removeTimeout = null;
        this.removeFadeTimeout = null;
        this.isRemoving = false;
        this.didRemove = false;
        this.onRemoved = typeof onRemoved === "function" ? onRemoved : null;

        html`
            <div this="main" class="actor_entry">
                <img class="actor_avatar" src="${actor.avatarUrl.interp()}" />
                <div class="actor_details">
                    <span>
                        <span class="actor_name">${actor.name.interp()}</span>&nbsp;—&nbsp;
                        <span this="action_label" class="action_label"></span>
                    </span>
                    <div this="action_history" class="action_history" aria-hidden="true"></div>
                </div>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLDivElement} */
        this.main;
        /** zyXSense @type {HTMLSpanElement} */
        this.action_label;
        /** zyXSense @type {HTMLDivElement} */
        this.action_history;

        this.updateFromPlaybackData(playbackData);
        this.main.style.animation = `actor_fade_in ${this.#fade_in_duration_ms}ms ease-out forwards`;

        // Auto-remove after a short delay (refreshed on consecutive actions)
        this.refreshRemoveTimeout();
    }

    setIsLast(isLast) {
        this.is_last = Boolean(isLast);
    }

    bump(playbackData) {
        this.updateFromPlaybackData(playbackData);

        // If we were fading out, revive the entry instead of letting it disappear.
        if (this.isRemoving) {
            this.isRemoving = false;
            if (this.removeFadeTimeout) {
                clearTimeout(this.removeFadeTimeout);
                this.removeFadeTimeout = null;
            }
            this.main.style.animation = `actor_fade_in ${this.#fade_in_duration_ms}ms ease-out forwards`;
        }

        this.refreshRemoveTimeout();
    }

    refreshRemoveTimeout() {
        this.#clearTimeout("removeTimeout");
        this.removeTimeout = setTimeout(() => this.remove(), this.#remove_timeout_ms);
    }

    updateFromPlaybackData(playbackData) {
        const actionClass = getActionFromPlaybackData(playbackData);
        const actionLabel = getActionLabel(actionClass);
        const seek = actionClass === "action-seek" ? ` to ${msDurationTimeStamp(playbackData.progress_ms)}` : "";

        // Keep the base class and swap the action-* class.
        for (const c of [...this.main.classList]) {
            if (c.startsWith("action-")) this.main.classList.remove(c);
        }
        if (actionClass) this.main.classList.add(actionClass);

        this.action_label.textContent = `${actionLabel}${seek}`;
        this.recordAction(actionClass);
    }

    recordAction(actionClass) {
        const key = actionClassToIconKey(actionClass);
        if (!key) return;
        this.actionHistory.push(key);
        if (this.actionHistory.length > 7) this.actionHistory.splice(0, this.actionHistory.length - 7);
        this.renderActionHistory();
    }

    renderActionHistory() {
        if (!this.action_history) return;
        const len = this.actionHistory.length;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < len; i++) {
            const key = this.actionHistory[i];
            const el = document.createElement("span");
            el.className = `action_hist_icon action_hist_icon_${key}`;
            const url = ICON_URL_BY_KEY[key];
            if (url) el.style.backgroundImage = `url(${url})`;

            // Opacity fades left (older) → right (newer)
            // newest (rightmost): 1.0
            // 2nd-5th newest: 0.5
            // 6th-7th newest: 0.2
            const ageFromRight = len - 1 - i;
            el.style.opacity = ageFromRight === 0 ? "1" : ageFromRight <= 4 ? "0.5" : "0.2";

            frag.appendChild(el);
        }
        this.action_history.replaceChildren(frag);
    }

    remove() {
        this.#clearTimeout("removeTimeout");
        if (this.isRemoving) return;
        this.isRemoving = true;
        this.main.style.animation = `actor_fade_out ${this.#fade_out_duration_ms}ms ease-in forwards`;
        this.removeFadeTimeout = setTimeout(() => {
            try {
                this.main.remove();
            } finally {
                if (!this.didRemove) {
                    this.didRemove = true;
                    try {
                        this.onRemoved && this.onRemoved();
                    } catch {}
                }
            }
        }, this.#fade_out_duration_ms);
    }

    #clearTimeout(field) {
        if (this[field]) {
            clearTimeout(this[field]);
            this[field] = null;
        }
    }
}

const BADGE_ANIMATION_IN = "spring_in";
const BADGE_ANIMATION_IN_DURATION_MS = 600;
const BADGE_ANIMATION_IN_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const BADGE_BY_ACTION = {
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
    if (playbackData?.frame_step != null) {
        return playbackData.frame_step > 0 ? "action-frame-forward" : "action-frame-backward";
    }

    const mapped = TRIGGER_TO_ACTION[playbackData?.trigger];
    return typeof mapped === "function" ? mapped(playbackData) : mapped || "action-unknown";
}

function getActionLabel(actionClass) {
    if (!actionClass) return "";
    return actionClass.replace("action-", "").replaceAll("-", " ");
}

function actionClassToIconKey(actionClass) {
    return ICON_KEY_BY_ACTION[actionClass] || null;
}

const TRIGGER_TO_ACTION = {
    "room.control.pause": "action-pause",
    "room.control.play": "action-play",
    "room.control.restartvideo": "action-restart",
    "room.control.seek": (pd) =>
        pd.delta_ms === null ? "action-seek" : pd.delta_ms > 0 ? "action-seek-forward" : "action-seek-backward",
};

const ICON_KEY_BY_ACTION = {
    "action-pause": "pause",
    "action-play": "play",
    "action-restart": "play",
    "action-seek": "seek-forward",
    "action-seek-forward": "seek-forward",
    "action-seek-backward": "seek-rewind",
    "action-frame-forward": "seek-forward",
    "action-frame-backward": "seek-rewind",
};

const ICON_URL_BY_KEY = {
    play: resolveAssetUrl("shared/assets/play.svg"),
    pause: resolveAssetUrl("shared/assets/pause.svg"),
    "seek-forward": resolveAssetUrl("shared/assets/seek-forward.svg"),
    "seek-rewind": resolveAssetUrl("shared/assets/seek-rewind.svg"),
};
