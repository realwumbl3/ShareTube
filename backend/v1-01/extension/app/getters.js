import state from "./state.js";

export function getCurrentPlayingProgressMs() {
    const item = state.currentPlaying.item.get();
    if (!item) return { progress_ms: null, duration_ms: null, item: null };
    const progress_ms = state.currentPlaying.progress_ms.get();
    const playing_since_ms = state.currentPlaying.playing_since_ms.get();
    const realProgressMs = calculateRealProgressMs(progress_ms, playing_since_ms);
    return { progress_ms: realProgressMs, duration_ms: item.duration_ms, item };
}

export function getCurrentPlayingLengthMs() {
    const item = state.currentPlaying.item.get();
    if (!item) return;
    return item.duration_ms;
}

export function calculateRealProgressMs(progress_ms, playing_since_ms) {
    return progress_ms + (playing_since_ms ? state.serverDateNow() - playing_since_ms : 0);
}

export function currentPlayingProgressMsPercentageToMs(percentage) {
    const duration_ms = getCurrentPlayingLengthMs();
    if (!duration_ms) return;
    return Math.floor(percentage * duration_ms);
}
