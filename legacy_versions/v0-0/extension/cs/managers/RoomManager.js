// Log module load for diagnostics
console.log("cs/managers/RoomManager.js loaded");

import { logger } from "../logger.js";
import { extractVideoId, copyWatchroomUrl } from "../utils.js";
import ShareTubeApp from "../app.js";

export default class RoomManager {
    /**
     * @param {ShareTubeApp} app
     */
    constructor(app) {
        this.app = app;
        /** @type {ShareTubeApp} */
        this.localSeekAuthorityUntil = 0;
    }

    get roomCode() {
        return this.app.roomCode;
    }
    get roomState() {
        return this.app.roomState;
    }

    // --- Public helpers for other managers ---
    isOnVideoUrl(url) {
        return this._isOnVideoUrl(url);
    }
    buildUrlWithRoomHash(url, code) {
        return this._buildUrlWithRoomHash(url, code);
    }

    async togglePlayPause() {
        const code = this.roomCode.get();
        if (!code) return;
        const current = this.roomState.get();
        let next;
        if (current === "idle") next = "starting";
        else if (current === "starting") next = "idle";
        else if (current === "playing") next = "idle";
        else next = "idle";
        const sock = await this.app.socketManager.ensureSocket();
        if (!sock) return;
        // Persist progress immediately when transitioning to idle via UI
        if (next === "idle") {
            this.app.player.persistProgress();
        }
        sock.emit("room_state_set", { code, state: next });
    }

    onControlButtonClicked() {
        try {
            const rs = this.roomState.get();
            const inAd =
                rs === "playing_ad" ||
                (this.app.adPlaying && this.app.adPlaying.get && this.app.adPlaying.get()) ||
                (this.app.adUserIds && this.app.adUserIds.size > 0);
            if (inAd) {
                this.pauseRoomDuringAd();
                return;
            }
            this.togglePlayPause();
        } catch {}
    }

    async pauseRoomDuringAd() {
        try {
            const code = this.roomCode.get();
            if (!code) return;
            const sock = await this.app.socketManager.ensureSocket();
            if (!sock) return;
            sock.emit("room_state_set", { code, state: "idle" });
        } catch {}
    }

    onRoomStateChange(payload) {
        try {
            const code = this.roomCode.get();
            if (!payload || payload.code !== code) return;
            const initial = this.roomState.get();
            let state;
            if (payload.state === "playing_ad") state = "playing_ad";
            else if (payload.state === "playing") state = "playing";
            else if (payload.state === "starting") state = "starting";
            else state = "idle";
            this.roomState.set(state);
            if (this.app.updatePlaybackEnforcement) this.app.updatePlaybackEnforcement("room_state_change");
            try {
                if (this.app.updateControlButtonLabel) this.app.updateControlButtonLabel();
            } catch {}
            if (this._shouldNavigateToActiveVideo(initial, state)) {
                if (!this._ensureRoomHashApplied(code)) this._navigateToActiveVideo(code);
            }
        } catch {}
    }

    _shouldNavigateToActiveVideo(initial, next) {
        try {
            return (
                (initial === "idle" && next === "starting") ||
                (initial === "starting" && next === "playing") ||
                (initial === "idle" && next === "playing")
            );
        } catch {
            return false;
        }
    }

    _isOnVideoUrl(url) {
        try {
            const cur = extractVideoId(location.href);
            const tgt = extractVideoId(url || "");
            return !!(cur && tgt && cur === tgt);
        } catch {
            return false;
        }
    }

    _ensureRoomHashApplied(code) {
        try {
            const first = this.app.queueManager && this.app.queueManager.getFirstQueueItem();
            if (!first || !first.url) return false;
            if (!this._isOnVideoUrl(first.url)) return false;
            const desired = "#sharetube:" + String(code);
            if (location.hash !== desired) location.hash = desired;
            return true;
        } catch {
            return false;
        }
    }

    _buildUrlWithRoomHash(url, code) {
        try {
            const u = new URL(url, location.href);
            u.hash = "sharetube:" + String(code);
            return u.toString();
        } catch {
            return String(url) + "#sharetube:" + String(code);
        }
    }

    _navigateToActiveVideo(code) {
        try {
            const first = this.app.queueManager && this.app.queueManager.getFirstQueueItem();
            if (!first || !first.url) return;
            if (this._isOnVideoUrl(first.url)) return;
            window.location.href = this._buildUrlWithRoomHash(first.url, code);
        } catch {}
    }

    // --- Room lifecycle ---
    async handlePlusButton() {
        const code = this.app.roomCode.get();
        if (code) {
            try {
                copyWatchroomUrl(code);
            } catch {}
            return;
        }
        const sock = await this.app.socketManager.ensureSocket();
        if (!sock) {
            try {
                console.warn("No socket/auth; cannot create room");
            } catch {}
            return;
        }
        sock.emit("room_create", {});
    }

    onRoomCreateResult(res) {
        console.log("[RoomCreateResult]", res);
        if (!res || !res.ok) {
            try {
                console.warn("room_create failed", res);
            } catch {}
            return;
        }
        const code = res.code;
        this.app.roomCode.set(code || "");
        this.app.justJoinedCode = code || null;
        try {
            copyWatchroomUrl(code);
        } catch {}
    }

    onRoomJoinResult(res) {
        console.log("[RoomJoinResult]", res);
        if (!res || !res.ok) {
            try {
                console.warn("room_join failed", res);
            } catch {}
            return;
        }
        const code = res.code;
        this.app.roomCode.set(code || "");
        this.app.justJoinedCode = code || null;
    }

    async tryJoinFromUrlHash() {
        try {
            const m = (location.hash || "").match(/^#sharetube:([a-f0-9]{32})$/i);
            if (!m) return;
            const code = m[1];
            this.app._withSocket(function (sock) {
                sock.emit("room_join", { code: code });
            }, code);
            this.app.roomCode.set(code);
            this.app.justJoinedCode = code;
        } catch (e) {
            logger.debug("tryJoinFromUrlHash failed", e);
        }
    }

    // --- Room ad events ---
    onRoomAdPause(payload) {
        try {
            const code = this.roomCode.get();
            if (!payload || payload.code !== code) return;
            try {
                const uid = payload && payload.by_user_id;
                if (uid != null) this.app.adUserIds.add(Number(uid));
            } catch {}
            try {
                if (this.app.adOverlayManager) this.app.adOverlayManager.notifyStateChanged();
            } catch {}
            this.updatePlaybackEnforcement("room_ad_pause");
        } catch (e) {
            logger.debug("onRoomAdPause failed", e);
        }
    }

    onRoomAdResume(payload) {
        try {
            const code = this.roomCode.get();
            if (!payload || payload.code !== code) return;
            this.updatePlaybackEnforcement("room_ad_resume");
            this.seekAccordingToServer("room_ad_resume");
            this.app.adUserIds.clear();
            try {
                if (this.app.adOverlayManager) this.app.adOverlayManager.notifyStateChanged();
            } catch {}
        } catch (e) {
            logger.debug("onRoomAdResume failed", e);
        }
    }

    onRoomAdStatus(payload) {
        try {
            const code = this.roomCode.get();
            if (!payload || payload.code !== code) return;
            const ids = Array.isArray(payload.active_user_ids) ? payload.active_user_ids : [];
            this.app.adUserIds = new Set(
                ids.map(function (x) {
                    return Number(x);
                })
            );
            try {
                if (this.app.adOverlayManager) this.app.adOverlayManager.notifyStateChanged();
            } catch {}
            this.updatePlaybackEnforcement("room_ad_status");
        } catch (e) {
            logger.debug("onRoomAdStatus failed", e);
        }
    }

    // --- Playback sync and enforcement ---
    updatePlaybackEnforcement(reason) {
        try {
            const rs = this.roomState.get();
            const localInAd = this.app.player.isAd();
            const anyoneInAds = !!(this.app.adUserIds && this.app.adUserIds.size > 0);
            const shouldPlay = this.shouldPlayContent(rs, localInAd, anyoneInAds);
            if (this.app.player) {
                this.app.player.setDesiredState(shouldPlay ? "playing" : "paused");
                if (!shouldPlay && !localInAd) {
                    try {
                        this.app.player.requestPause();
                    } catch {}
                    if (rs === "starting" && this.app.player.video) {
                        const posMs = this.getServerSuggestedPositionMs();
                        const nearZero =
                            posMs <= 1500 &&
                            Number((this.app.playback && this.app.playback.progress) || 0) <= 1000 &&
                            Number((this.app.playback && this.app.playback.playing_since) || 0) <= 0;
                        if (nearZero && this.app.player.video.currentTime > 0.05) {
                            try {
                                this.app.player.video.currentTime = 0;
                            } catch (e) {
                                logger.debug("set currentTime 0 failed", e);
                            }
                        }
                    }
                } else if (shouldPlay) {
                    try {
                        this.app.player.requestPlay();
                    } catch (e) {
                        logger.debug("requestPlay failed", e);
                    }
                }
                this.app.emitPlayerStatus && this.app.emitPlayerStatus(this.app.adPlaying.get(), true);
            } else if (!shouldPlay) {
                setTimeout(() => {
                    try {
                        this.updatePlaybackEnforcement("retry:" + String(reason || ""));
                    } catch (e) {
                        logger.debug("retry updatePlaybackEnforcement failed", e);
                    }
                }, 300);
            }
            try {
                if (this.app.adOverlayManager) this.app.adOverlayManager.notifyStateChanged();
            } catch {}
            try {
                this.app.updateControlButtonLabel();
            } catch {}
        } catch (e) {
            logger.debug("updatePlaybackEnforcement failed", e);
        }
    }

    updateControlButtonLabel() {
        try {
            const btn = this.app.control_button;
            if (!btn) return;
            const s = this.roomState.get();
            const inAd =
                s === "playing_ad" ||
                (this.app.adPlaying && this.app.adPlaying.get && this.app.adPlaying.get()) ||
                (this.app.adUserIds && this.app.adUserIds.size > 0);
            btn.textContent = inAd ? "Playing AD" : s === "playing" ? "Pause" : "Play";
        } catch {}
    }

    shouldPlayContent(roomState, localInAd, anyoneInAds) {
        try {
            return roomState === "playing" && !localInAd && !anyoneInAds;
        } catch {
            return false;
        }
    }

    onRoomPlayback(payload) {
        try {
            const code = this.roomCode.get();
            if (!payload || payload.code !== code) return;
            const e = payload.entry || {};
            try {
                const st = String(payload.state || "").toLowerCase();
                if (st === "playing" || st === "starting" || st === "idle" || st === "playing_ad") {
                    this.roomState.set(st);
                }
            } catch {}
            const dur = Number(e.duration || 0);
            const prog = Number(e.progress || 0);
            const ps = Number(e.playing_since || 0);
            this.app.playback = { duration: dur, progress: prog, playing_since: ps, lastTs: Date.now() };
            this.seekAccordingToServer("room_playback");
            this.app.hasPlaybackSync = true;
            // Ensure late joiners on non-video pages navigate to the active video
            try {
                const stateNow = this.roomState.get();
                if (stateNow === "starting" || stateNow === "playing") {
                    if (!this._ensureRoomHashApplied(code)) this._navigateToActiveVideo(code);
                }
            } catch {}
        } catch (e) {
            logger.debug("onRoomPlayback failed", e);
        }
    }

    getServerSuggestedPositionMs() {
        const pb = this.app.playback || {};
        const duration = pb.duration,
            progress = pb.progress,
            playing_since = pb.playing_since;
        if (!duration && !progress && !playing_since) return 0;
        if (playing_since > 0) {
            const elapsed = Math.max(0, Date.now() - playing_since);
            return Math.min((progress || 0) + elapsed, duration || Infinity);
        }
        return progress || 0;
    }

    seekAccordingToServer(reason) {
        try {
            const posMs = this.getServerSuggestedPositionMs();
            const posSec = posMs / 1000;
            if (this.app.player && this.app.player.video) {
                const v = this.app.player.video;
                const diff = Math.abs((v.currentTime || 0) - posSec);
                if (isFinite(posSec) && diff > 0.25) {
                    try {
                        if (this.app.player.suppressSeekEmit) this.app.player.suppressSeekEmit(800);
                    } catch {}
                    try {
                        v.currentTime = posSec;
                    } catch (e) {
                        logger.debug("seekAccordingToServer set currentTime failed", e);
                    }
                }
            }
        } catch (e) {
            logger.debug("seekAccordingToServer failed", e);
        }
    }

    onRoomSeek(payload) {
        try {
            const code = this.roomCode.get();
            if (!payload || payload.code !== code) return;
            const ms = Number(payload.progress_ms || 0);
            const play = !!payload.play;
            if (Date.now() < (this.app.localSeekAuthorityUntil || 0)) {
                return;
            }
            const dur = Number((this.app.playback && this.app.playback.duration) || 0);
            this.app.playback = {
                duration: dur,
                progress: Math.max(0, ms),
                playing_since: play ? Date.now() : 0,
                lastTs: Date.now(),
            };
            try {
                if (this.app.player && this.app.player.suppressSeekEmit) this.app.player.suppressSeekEmit(800);
            } catch {}
            this.seekAccordingToServer("room_seek_event");
            this.updatePlaybackEnforcement("room_seek_event");
        } catch (e) {
            logger.debug("onRoomSeek failed", e);
        }
    }
}
