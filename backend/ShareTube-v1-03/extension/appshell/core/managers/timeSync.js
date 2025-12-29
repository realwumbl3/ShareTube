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
        this._lastRttMs = null;
        this._lastSyncSource = null;
    }

    // Raw client clock (no fake offset)
    clientNowRawMs() {
        return Date.now();
    }

    // Client clock
    clientNowMs() {
        return Date.now();
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
        setTimeout(() => this.syncOnce().catch(() => {}), 2000);
        this._interval = setInterval(() => this.syncOnce().catch(() => {}), intervalMs);
    }

    /**
     * Apply a time sample from any source that provides echoed client timestamp.
     * @param {{clientTimestamp?:number}} payload
     * @param {{source?:string}} opts
     */
    updateFromServerPayload(payload, opts = {}) {
        const receiveMs = Date.now();

        const rawClientTs = payload?.clientTimestamp;
        const sendMs = Number.isFinite(rawClientTs) ? rawClientTs : null;

        this._applySample({
            clientSendMs: sendMs,
            clientReceiveMs: receiveMs,
            source: opts.source || "unknown",
        });
    }

    /**
     * Fetch current server time via HTTP.
     * Uses `/api/time` which returns `{clientTimestamp}`.
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

    _applySample({ clientSendMs, clientReceiveMs, source }) {
        let rttMs = null;

        if (Number.isFinite(clientSendMs)) {
            rttMs = clientReceiveMs - clientSendMs;
            if (!Number.isFinite(rttMs) || rttMs < 0) return;
        }

        // Reject extremely laggy samples (they add more noise than value).
        if (Number.isFinite(rttMs) && rttMs > 5000) return;

        this._lastRttMs = Number.isFinite(rttMs) ? Math.round(rttMs) : null;
        this._lastSyncSource = source;

        // Expose diagnostics for DebugMenu
        state.serverRttMs.set(this._lastRttMs);
        state.serverTimeSyncSource.set(this._lastSyncSource || "");
    }
}
