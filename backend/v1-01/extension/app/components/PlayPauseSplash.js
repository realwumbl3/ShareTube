import { html, css } from "../dep/zyx.js";

import { msDurationTimeStamp } from "../utils.js";

export default class PlayPauseSplash {
    constructor(video) {
        this.video = video;
        html`<div class="play_pause_overlay"></div>`.bind(this);
    }

    call(playbackData, actor) {
        const trigger = playbackData.trigger;
        const badgeClass = TRIGGERMAP[trigger];
        if (!badgeClass) {
            console.warn("PlayPauseSplash: unknown trigger", trigger);
            return;
        }
        this.animate(badgeClass, playbackData, actor);
    }

    animate(badgeClass, playbackData, actor) {
        const badge = new badgeClass(playbackData, actor);
        badge.appendTo(this.main);
        badge.animate();
        return badge;
    }
}

class BadgeBase {
    constructor(actor) {
        this.actor = actor;
        html`<div class="badge_container">
            <div this="badge" class="badge"></div>
            <div class="actor">
                <img src="${actor.avatarUrl.interp()}" />
                <span>${actor.name.interp()}</span>
            </div>
        </div>`.bind(this);
        this.badge.addEventListener("animationend", () => this.end());
    }

    end() {
        this.main.remove();
    }

    animate() {
        setTimeout(() => (this.badge.style.animation = "spring_in 500ms ease-in-out forwards"), 1);
    }
}

css`
    .play_pause_overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        gap: 10px;
        z-index: 1000000001;
        pointer-events: none;

        & > .badge_container {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            gap: 10px;

            & > .actor {
                position: absolute;
                display: flex;
                flex-direction: column;
                gap: 2px;
                align-items: center;
                justify-content: center;
                bottom: 30%;

                & > img {
                    width: 2em;
                    height: 2em;
                    object-fit: cover;
                    border-radius: 50%;
                    border: 1px solid rgba(255, 255, 255, 0.25);
                }
                & > span {
                    font-size: 1em;
                    font-weight: bold;
                    color: #fff;
                    text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5);
                }
            }

            & > .badge {
                position: absolute;
                height: 6em;
                aspect-ratio: 1 / 1;
                backdrop-filter: blur(10px) brightness(0.5) contrast(1.1);
                border-radius: 999px;
                display: grid;
                place-items: center;
                font-size: 2em;
                font-weight: bold;
                opacity: 0;
                scale: 0.8;
                & > .large_icon {
                    position: absolute;
                    inset: 0;
                    background-size: contain;
                    background-position: center;
                    background-repeat: no-repeat;
                }
                & > .label {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: grid;
                    place-items: center;
                }
                & > .label > img {
                    width: 2em;
                    height: 2em;
                    object-fit: cover;
                    border-radius: 50%;
                    border: 1px solid rgba(255, 255, 255, 0.25);
                }
                & > .label > span {
                    font-size: 1em;
                    font-weight: bold;
                    color: #fff;
                    text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5);
                }
            }
        }
    }

    @keyframes spring_in {
        0% {
            opacity: 0;
            scale: 0.8;
        }
        80% {
            opacity: 1;
            scale: 1;
        }
        100% {
            opacity: 0;
            scale: 1.5;
        }
    }
`;

class PlayPauseBadge extends BadgeBase {
    constructor(playbackData, actor) {
        super(actor);
        const state = playbackData.trigger === "room.control.pause" ? "pause" : "play";
        html`<div this="large_icon" class="large_icon"></div>`.join(this).appendTo(this.badge);
        const badgeSvg = chrome.runtime.getURL(`app/assets/${state}.svg`);
        this.large_icon.style.backgroundImage = `url(${badgeSvg})`;
    }
}

class SeekBadge extends BadgeBase {
    constructor(playbackData, actor) {
        super(actor);
        html`<div this="label" class="label"></div>`.join(this).appendTo(this.badge);
        this.updateLabel(playbackData);
    }

    updateLabel(playbackData) {
        if (playbackData.delta_ms !== null) {
            this.label.textContent = `${playbackData.delta_ms / 1000}s ${playbackData.delta_ms > 0 ? ">>" : "<<"}`;
        } else {
            this.label.textContent = msDurationTimeStamp(playbackData.progress_ms);
        }
    }
}

const TRIGGERMAP = {
    "room.control.pause": PlayPauseBadge,
    "room.control.play": PlayPauseBadge,
    "room.control.restartvideo": PlayPauseBadge,
    "room.control.seek": SeekBadge,
};
