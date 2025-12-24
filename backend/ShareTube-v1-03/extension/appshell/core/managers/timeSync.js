import state from "../state/state.js";

// Centralized time synchronization:
// - Computes server/client clock offset NTP-style using echoed clientTimestamp.
// - Applies simple validation + smoothing to reduce jitter.
// - Optionally resyncs via HTTP endpoint.
export default class TimeSyncManager {
    /**
     * @param {import("../../app.js").default} app
     */
    constructor(app) {
        this.app = app;
        this._interval = null;
        this._emaOffsetMs = null;
        this._lastRttMs = null;
        this._lastSyncSource = null;
    }

    // Raw client clock (no fake offset)
    clientNowRawMs() {
        return Date.now();
    }

    // Client clock including fakeTimeOffset (used for debugging drift scenarios)
    clientNowMs() {
        return Date.now() + state.fakeTimeOffset.get();
    }

    get timeOffsetMs() {
        return state.serverMsOffset.get();
    }

    get lastRttMs() {
        return this._lastRttMs;
    }

    get lastSyncSource() {
        return this._lastSyncSource;
    }

    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
    }

    start({ intervalMs = 60_000 } = {}) {
        this.stop();
        // Fire an initial sync soon, then keep it fresh.
        setTimeout(() => this.syncOnce().catch(() => {}), 1000);
        this._interval = setInterval(() => this.syncOnce().catch(() => {}), intervalMs);
    }

    /**
     * Apply a time sample from any source that provides serverNowMs and echoed client timestamp.
     * @param {{serverNowMs:number, clientTimestamp?:number}} payload
     * @param {{source?:string}} opts
     */
    updateFromServerPayload(payload, opts = {}) {
        const serverNowMs = payload?.serverNowMs;
        if (!Number.isFinite(serverNowMs)) return;

        const fake = state.fakeTimeOffset.get();
        const receiveMs = Date.now() + fake;

        const rawClientTs = payload?.clientTimestamp;
        const sendMs = Number.isFinite(rawClientTs) ? rawClientTs + fake : null;

        this._applySample({
            serverNowMs,
            clientSendMs: sendMs,
            clientReceiveMs: receiveMs,
            source: opts.source || "unknown",
        });
    }

    /**
     * Fetch current server time via HTTP.
     * Uses `/api/time` which returns `{serverNowMs, clientTimestamp}`.
     */
    async syncOnce() {
        const base = await this.app.backEndUrl();
        if (!base) return;

        const clientTimestamp = this.clientNowRawMs();
        let data = null;

        try {
            const res = await fetch(`${base}/api/time?clientTimestamp=${encodeURIComponent(clientTimestamp)}`, {
                method: "GET",
                cache: "no-store",
            });
            if (!res.ok) return;
            data = await res.json();
        } catch (_) {
            return;
        }

        this.updateFromServerPayload(data, { source: "http:/api/time" });
    }

    _applySample({ serverNowMs, clientSendMs, clientReceiveMs, source }) {
        // If we have an originating client timestamp, do NTP-style offset.
        // offset = serverTimeAtSend - (clientSend + RTT/2)
        // where offset is (serverTime - clientTime)
        let offsetSampleMs = null;
        let rttMs = null;

        if (Number.isFinite(clientSendMs)) {
            rttMs = clientReceiveMs - clientSendMs;
            if (!Number.isFinite(rttMs) || rttMs < 0) return;
            offsetSampleMs = serverNowMs - (clientSendMs + rttMs / 2);
        } else {
            // Fallback: naive offset at receive time (still correct sign).
            offsetSampleMs = serverNowMs - clientReceiveMs;
        }

        // Basic sanity checks (avoid wrecking playback on bogus samples).
        if (!Number.isFinite(offsetSampleMs)) return;
        // Reject totally wild offsets (e.g. wrong units) beyond 48h.
        if (Math.abs(offsetSampleMs) > 1000 * 60 * 60 * 48) return;
        // Reject extremely laggy samples (they add more noise than value).
        if (Number.isFinite(rttMs) && rttMs > 5000) return;

        // Approximate server "now" at client receive time for debug display.
        const approxServerNowAtReceive = Number.isFinite(rttMs) ? serverNowMs + rttMs / 2 : serverNowMs;
        state.serverNowMs.set(Math.round(approxServerNowAtReceive));

        // Smoothing: EMA unless it looks like a big jump.
        if (this._emaOffsetMs == null) {
            this._emaOffsetMs = offsetSampleMs;
        } else {
            const delta = offsetSampleMs - this._emaOffsetMs;
            // If the apparent offset jumped a lot, snap (likely system clock correction).
            if (Math.abs(delta) > 1000 * 30) {
                this._emaOffsetMs = offsetSampleMs;
            } else {
                // Weight better RTT samples higher.
                const alpha = !Number.isFinite(rttMs) ? 0.25 : rttMs < 150 ? 0.35 : rttMs < 500 ? 0.2 : 0.12;
                this._emaOffsetMs = this._emaOffsetMs * (1 - alpha) + offsetSampleMs * alpha;
            }
        }

        state.serverMsOffset.set(Math.round(this._emaOffsetMs));
        this._lastRttMs = Number.isFinite(rttMs) ? Math.round(rttMs) : null;
        this._lastSyncSource = source;

        // Expose diagnostics for DebugMenu
        state.serverRttMs.set(this._lastRttMs);
        state.serverTimeSyncSource.set(this._lastSyncSource || "");
    }
}


