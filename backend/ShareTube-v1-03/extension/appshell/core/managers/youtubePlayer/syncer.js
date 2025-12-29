import { getCurrentPlayingProgressMs } from "../../state/getters.js";
import state from "../../state/state.js";

// Optimized constants for faster, more responsive syncing
const PLAYBACK_DRIFT_INTERVAL_MS = 250; // Reduced from 500ms for more responsive checks
const PLAYBACK_DRIFT_THRESHOLD_MS = 20; // Reduced threshold for tighter sync
const PLAYBACK_DRIFT_FULL_ADJUST_MS = 1500; // Reduced from 4000ms for faster corrections
const PLAYBACK_DRIFT_MIN_RATE = 0.85; // More aggressive correction range
const PLAYBACK_DRIFT_MAX_RATE = 1.2;
const PLAYBACK_DRIFT_SEEK_THRESHOLD_MS = 3000; // Reduced from 5000ms for quicker seeks
const RATE_CHANGE_THRESHOLD = 0.002; // Minimum rate change to avoid micro-adjustments

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default class PlaybackSyncer {
    constructor(youtubePlayer) {
        this.youtubePlayer = youtubePlayer;
        this.playback_drift_interval = null;
        this.last_applied_playrate = 1;
        this.verbose = false;
        // Cache state to avoid redundant getter calls
        this._cachedRoomCode = null;
        this._cachedRoomState = null;
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
        // Reset rate when stopping
        this.resetPlaybackRate(true);
        // Reset drift when stopping
        state.currentDriftMs.set(0);
    }

    resetPlaybackRate(force = false) {
        const video = this.youtubePlayer.video;
        if (!video) {
            if (this.last_applied_playrate !== 1) {
                this.last_applied_playrate = 1;
                state.currentPlaybackRate.set(1);
            }
            return;
        }

        const currentRate = typeof video.playbackRate === "number" ? video.playbackRate : 1;
        const needsReset = force || Math.abs(currentRate - 1) > RATE_CHANGE_THRESHOLD;

        if (needsReset) {
            try {
                video.playbackRate = 1;
                this.last_applied_playrate = 1;
                state.currentPlaybackRate.set(1);
            } catch (err) {
                this.verbose && console.warn("resetPlaybackRate failed", err);
            }
        }
    }

    /**
     * Checks if syncing should be active based on current state
     * Returns true if syncing should continue, false if it should be disabled
     */
    _shouldSync() {
        const video = this.youtubePlayer.video;
        if (!video || video.paused) return false;

        // Cache state checks to reduce getter calls
        const roomCode = state.roomCode.get();
        const roomState = state.roomState.get();

        if (!roomCode || roomState !== "playing") return false;
        if (this.youtubePlayer.isAdPlayingNow()) return false;
        if (this.youtubePlayer.isNearContentEnd(1)) return false;

        return true;
    }

    checkDrift() {
        // Early exit if syncing shouldn't be active
        if (!this._shouldSync()) {
            // Only reset if we had a non-1 rate applied
            if (this.last_applied_playrate !== 1) {
                this.resetPlaybackRate();
            }
            // Reset drift when not syncing
            state.currentDriftMs.set(0);
            return;
        }

        const video = this.youtubePlayer.video;
        const { progressMs } = getCurrentPlayingProgressMs();

        // Validate progress data
        if (progressMs == null || !isFinite(progressMs)) {
            if (this.last_applied_playrate !== 1) {
                this.resetPlaybackRate();
            }
            // Reset drift on invalid data
            state.currentDriftMs.set(0);
            return;
        }

        const actualMs = this.youtubePlayer.videoCurrentTimeMs;
        if (!isFinite(actualMs)) {
            if (this.last_applied_playrate !== 1) {
                this.resetPlaybackRate();
            }
            // Reset drift on invalid data
            state.currentDriftMs.set(0);
            return;
        }

        const driftMs = progressMs - actualMs;
        const absDriftMs = Math.abs(driftMs);

        // Update state with current drift
        state.currentDriftMs.set(driftMs.toFixed(2));

        // Large drift: seek immediately
        if (absDriftMs >= PLAYBACK_DRIFT_SEEK_THRESHOLD_MS) {
            this.youtubePlayer.setDesiredProgressMs(progressMs);
            this.resetPlaybackRate(true);
            return;
        }

        // Small drift: reset to normal playback rate
        if (absDriftMs <= PLAYBACK_DRIFT_THRESHOLD_MS) {
            if (this.last_applied_playrate !== 1) {
                this.resetPlaybackRate();
            }
            return;
        }

        // Medium drift: adjust playback rate
        // Use a more responsive calculation with exponential smoothing for smoother transitions
        const rateDelta = driftMs / PLAYBACK_DRIFT_FULL_ADJUST_MS;
        const targetRate = clamp(1 + rateDelta, PLAYBACK_DRIFT_MIN_RATE, PLAYBACK_DRIFT_MAX_RATE);

        // Only update if the change is significant enough
        if (Math.abs(targetRate - this.last_applied_playrate) < RATE_CHANGE_THRESHOLD) {
            return;
        }

        try {
            video.playbackRate = targetRate;
            this.last_applied_playrate = targetRate;
            state.currentPlaybackRate.set(targetRate);
        } catch (err) {
            this.verbose && console.warn("checkDrift: failed to set playbackRate", err);
            // Fallback to reset on error
            this.resetPlaybackRate();
        }
    }
}
