console.log("cs/app.js loaded");

// components are now used via managers only
import { decodeJwt, EmitThrottler, buildSignature } from "./utils.js";
import SocketManager from "./managers/SocketManager.js";
import { logger } from "./logger.js";
import YoutubePlayerManager from "./managers/PlayerManager.js";
import AdOverlayManager from "./managers/AdOverlayManager.js";
import QueueManager from "./managers/QueueManager.js";
import RoomManager from "./managers/RoomManager.js";
import PresenceManager from "./managers/PresenceManager.js";
import VoteManager from "./managers/VoteManager.js";
import Queue from "./components/Queue.js";
import { html, LiveVar } from "./zyx.js";

export default class ShareTubeApp {
    constructor() {
        this.avatarUrl = new LiveVar("");

        this.socketManager = new SocketManager(this);

        this.roomCode = new LiveVar("");

        this.presentUsersById = new Map();
        this.currentPresenceIds = [];
        this.roomState = new LiveVar("idle");
        this.playback = { duration: 0, progress: 0, playing_since: 0, lastTs: 0 };
        this.justJoinedCode = null;
        this.storageListener = null;

        /** @type {YoutubePlayerManager} */
        this.player = null;
        this.adPlaying = new LiveVar(false);

        /** @type {Set<number>} */
        this.adUserIds = new Set(); // user ids currently known to be in ads (approximate)

        /** @type {AdOverlayManager} */
        this.adOverlayManager = null;
        this.userId = null;
        this.localSeekAuthorityUntil = 0;
        this.hasPlaybackSync = false;
        this.ignorePersistUntil = 0;

        // Managers
        this.queueManager = new QueueManager(this);
        this.roomManager = new RoomManager(this);
        this.presenceManager = new PresenceManager(this);
        this.voteManager = new VoteManager(this);

        // Components
        this.queue = new Queue(this);

        html`
            <div id="sharetube_main">
                ${this.queue}
                <div id="sharetube_pill">
                    <img alt="Profile" src=${this.avatarUrl.interp((v) => v || "")} />
                    <span id="ShareTubeLabel" zyx-click=${() => console.log("app state", this)}>ShareTube</span>
                    ${this.presenceManager.roomPresencePill}
                    <button
                        class="rounded_btn"
                        zyx-if=${[this.queueManager.queue, (v) => v.length > 0]}
                        zyx-click=${() => this.queue.toggleQueueVisibility()}
                    >
                        ${this.queueManager.queue.interp((v) => v.length)} queued
                    </button>
                    <button
                        class="rounded_btn"
                        id="sharetube_control_button"
                        title="Play/Pause"
                        this="control_button"
                        zyx-click=${(z) => {
                            z.e.stopPropagation();
                            this.roomManager.onControlButtonClicked();
                        }}
                    >
                        Play
                    </button>
                </div>
            </div>
        `.bind(this);
    }

    logSelf() {
        console.log("ShareTubeApp", this);
    }

    _withSocket(fn, overrideCode) {
        try {
            const code = overrideCode || this.roomManager.roomCode.get();
            if (!code) return;
            const run = async () => {
                try {
                    const sock = this.socketManager.socket || (await this.socketManager.ensureSocket());
                    if (!sock) return;
                    fn(sock, code);
                } catch {}
            };
            run();
        } catch {}
    }

    async applyAvatarFromToken() {
        try {
            const res = await chrome.storage.local.get(["newapp_token"]);
            const token = res && res.newapp_token;
            if (!token) {
                this.avatarUrl.set("");
                this.userId = null;
                return;
            }
            const claims = decodeJwt(token);
            const picture = claims && claims.picture;
            this.avatarUrl.set(picture || "");
            try {
                this.userId = claims && (claims.sub != null ? Number(claims.sub) : null);
            } catch {
                this.userId = null;
            }
        } catch (e) {}
    }

    attachBrowserListeners() {
        this.storageListener = (changes, area) => {
            if (area === "local" && changes.newapp_token) {
                this.applyAvatarFromToken();
            }
        };
        chrome.storage.onChanged.addListener(this.storageListener);

        window.addEventListener("beforeunload", () => {
            try {
                const code = this.roomCode.get();
                if (this.socketManager.socket && code) {
                    this.socket.emit("room_leave", { code });
                }
            } catch {}
        });
    }

    detachBrowserListeners() {
        if (this.storageListener) chrome.storage.onChanged.removeListener(this.storageListener);
    }

    start() {
        console.log("ShareTube Init");
        this.appendTo(document.body);
        this.applyAvatarFromToken();
        this.attachBrowserListeners();
        this.queueManager.setupDragAndDrop();
        try {
            this.roomManager.tryJoinFromUrlHash();
        } catch {}
        this.initPlayerObserver();
        this.initAdOverlay();
        // Ensure control button label matches initial state
        try {
            this.updateControlButtonLabel();
        } catch {}
        // Compute initial join-sync popup visibility/content
        this.ignorePersistUntil = Date.now() + 2500;
        this.logSelf();
    }

    initPlayerObserver() {
        try {
            this.player = new YoutubePlayerManager(this);
            this.player.start();
            // Respect current room/ad status on init so we don't start playing while others are in ads
            this.roomManager.updatePlaybackEnforcement("init");
        } catch {}
    }

    // Update the control button text based on room and ad states
    updateControlButtonLabel() {
        try {
            const btn = this.control_button;
            if (!btn) return;
            const s = this.roomState.get();
            const inAd =
                s === "playing_ad" ||
                (this.adPlaying && this.adPlaying.get && this.adPlaying.get()) ||
                (this.adUserIds && this.adUserIds.size > 0);
            btn.textContent = inAd ? "Playing AD" : s === "playing" ? "Pause" : "Play";
        } catch {}
    }

    // -----------------
    // Ad overlay UI (delegated to AdOverlayManager)
    // -----------------
    initAdOverlay() {
        try {
            // Lazily construct a manager with state getters that read from app state
            this.adOverlayManager = new AdOverlayManager(this);
            this.adOverlayManager.start();
        } catch (e) {
            logger.debug("initAdOverlay failed", e);
        }
    }
}
