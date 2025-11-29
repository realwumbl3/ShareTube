import { getCurrentPlayingProgressMs } from "./getters.js";
import state from "./state.js";

const PLAYBACK_DRIFT_INTERVAL_MS = 500;
const PLAYBACK_DRIFT_THRESHOLD_MS = 20;
const PLAYBACK_DRIFT_FULL_ADJUST_MS = 3000;
const PLAYBACK_DRIFT_MIN_RATE = 0.85;
const PLAYBACK_DRIFT_MAX_RATE = 1.2;
const PLAYBACK_DRIFT_SEEK_THRESHOLD_MS = 6000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default class PlaybackSyncer {
    constructor(youtubePlayer) {
        this.youtubePlayer = youtubePlayer;
        this.playback_drift_interval = null;
        this.last_applied_playrate = 1;
        this.verbose = false;
        state.currentPlaybackRate.set(1);
    }

    start() {
        this.stop();
        if (!this.youtubePlayer.video) return;
        this.playback_drift_interval = setInterval(() => this.checkDrift(), PLAYBACK_DRIFT_INTERVAL_MS);
    }

    stop() {
        if (this.playback_drift_interval) {
            clearInterval(this.playback_drift_interval);
            this.playback_drift_interval = null;
        }
    }

    resetPlaybackRate(force = false) {
        const video = this.youtubePlayer.video;
        if (!video) {
            this.last_applied_playrate = 1;
            state.currentPlaybackRate.set(1);
            return;
        }
        const currentRate = typeof video.playbackRate === "number" ? video.playbackRate : 1;
        if (force || Math.abs(currentRate - 1) > 0.001) {
            try {
                video.playbackRate = 1;
            } catch (err) {
                this.verbose && console.warn("resetPlaybackRate failed", err);
            }
        }
        this.last_applied_playrate = 1;
        state.currentPlaybackRate.set(1);
    }

    checkDrift() {
        const video = this.youtubePlayer.video;
        if (!video) return;

        if (!state.roomCode.get()) return this.resetPlaybackRate();
        if (state.roomState.get() !== "playing") return this.resetPlaybackRate();
        if (video.paused) return this.resetPlaybackRate();

        // Access manager's properties/methods
        if (this.youtubePlayer.isAdPlayingNow()) return this.resetPlaybackRate();
        if (this.youtubePlayer.isNearContentEnd(1)) return this.resetPlaybackRate();

        const { progress_ms } = getCurrentPlayingProgressMs();
        if (progress_ms === null || progress_ms === undefined) {
            return this.resetPlaybackRate();
        }

        const actualMs = this.youtubePlayer.videoCurrentTimeMs;
        if (!isFinite(actualMs)) {
            return this.resetPlaybackRate();
        }

        const driftMs = progress_ms - actualMs;
        if (Math.abs(driftMs) >= PLAYBACK_DRIFT_SEEK_THRESHOLD_MS) {
            this.youtubePlayer.setDesiredProgressMs(progress_ms);
            this.resetPlaybackRate(true);
            return;
        }

        if (Math.abs(driftMs) <= PLAYBACK_DRIFT_THRESHOLD_MS) return this.resetPlaybackRate();

        const rateDelta = driftMs / PLAYBACK_DRIFT_FULL_ADJUST_MS;
        const targetRate = clamp(1 + rateDelta, PLAYBACK_DRIFT_MIN_RATE, PLAYBACK_DRIFT_MAX_RATE);

        try {
            video.playbackRate = targetRate;
            this.last_applied_playrate = targetRate;
            state.currentPlaybackRate.set(targetRate);
        } catch (err) {
            this.verbose && console.warn("checkDrift: failed to set playbackRate", err);
        }
    }
}
