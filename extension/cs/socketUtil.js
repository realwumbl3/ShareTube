// Socket utility helpers to centralize throttling and deduplication for emits.
//
// The extension previously mixed timing and last-payload guards inline in
// multiple methods. Consolidating the behavior here reduces code duplication
// and makes it easier to tune thresholds.

export class EmitThrottler {
	// Create a throttler with a time window in milliseconds for emit cadence.
	constructor(windowMs) {
		this.windowMs = Math.max(0, Number(windowMs || 800));
		this.lastEmitAt = 0;
		this.lastSignature = null;
	}

	// Attempt to emit; returns true if allowed, false if throttled/deduped.
	// - nowMs: current Date.now() value
	// - signature: string that uniquely represents payload state for dedupe
	allow(nowMs, signature) {
		nowMs = Number(nowMs || Date.now());
		const withinWindow = (nowMs - this.lastEmitAt) < this.windowMs;
		const duplicate = (signature != null && this.lastSignature === signature);
		if (withinWindow && duplicate) return false;
		this.lastEmitAt = nowMs;
		this.lastSignature = signature || null;
		return true;
	}
}

// Utility to build a stable signature from a small payload object. Only uses
// specific fields to keep noise low.
export function buildSignature(obj, keys) {
	try {
		const pick = {};
		for (const k of keys || []) pick[k] = obj && obj[k];
		return JSON.stringify(pick);
	} catch {
		return '';
	}
}


