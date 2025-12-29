import state from "./state.js";

export function getCurrentPlayingProgressMs() {
    const item = state.currentPlaying.item.get();
    if (!item) return { progressMs: null, durationMs: null, item: null };
    const progressMs = state.currentPlaying.progressMs.get();
    const playingSinceMs = state.currentPlaying.playingSinceMs.get();
    const realProgressMs = calculateRealProgressMs(progressMs, playingSinceMs);
    return { progressMs: realProgressMs, durationMs: item.duration_ms, item };
}

export function getCurrentPlayingLengthMs() {
    const item = state.currentPlaying.item.get();
    if (!item) return;
    return item.duration_ms;
}

export function calculateRealProgressMs(progressMs, playingSinceMs) {
    if (!playingSinceMs) return progressMs;

    const clientTime = Date.now();
    const rttMs = state.serverRttMs.get();

    // If we have RTT, use it to compensate for network latency
    // Add half RTT to account for one-way latency in sync messages
    const latencyCompensation = rttMs ? rttMs / 2 : 0;

    return progressMs + (clientTime - playingSinceMs + latencyCompensation);
}

export function currentPlayingProgressMsPercentageToMs(percentage) {
    const durationMs = getCurrentPlayingLengthMs();
    if (!durationMs) return;
    return Math.floor(percentage * durationMs);
}
