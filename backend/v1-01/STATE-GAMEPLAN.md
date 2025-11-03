## ShareTube STATE-GAMEPLAN — Stateless Room and Playback Model

### Goals
- Stateless, thread/process agnostic server: no in-memory room state or caches.
- Deterministic playback derived at read time from persisted minimal fields.
- Low-latency sync using `serverNowMs` provided on every response/broadcast.

### Core Invariants
- Server never stores per-client player telemetry.
- All authoritative state is persisted; current playback position is derived on demand.
- Control events are the only writers to the virtual clock.

### Persisted Entities (minimum)
- Room
  - `code`, `owner_id`, `state: 'idle'|'starting'|'playing'|'paused'`
  - `controller_id`, `control_mode`, `ad_sync_mode`
- Virtual clock (on Room)
  - `duration_ms`
  - `playing_since_ms?` (epoch ms) — present when playing
  - `paused_progress_ms?` — present when paused/starting
- Queue/Entries (id, url/id, title, thumbnail, position, status)
- Roles (operators set) and memberships (optional in early phases)
- Ad reports
  - `AdReport { id, room_id, user_id, active:boolean, ts }` (latest per user authoritative)

### Playback Derivation (read-time)
- Always compute with current `serverNowMs` (epoch ms) sent to clients.
- Expected progress:
  - If `playing_since_ms` is set → `expected_ms = clamp(0, duration_ms, serverNowMs - playing_since_ms)`
  - Else → `expected_ms = clamp(0, duration_ms, paused_progress_ms)`
- Clients snap if `|local - expected_ms| > DRIFT_SNAP_MS` (e.g., 400ms); otherwise smooth.

### Control Event Write Rules (authoritative, persisted)
- Play (from paused or start)
  - `playing_since_ms = serverNowMs - (paused_progress_ms || 0)`
  - `paused_progress_ms = null`
  - `state = 'playing'`
- Pause
  - `paused_progress_ms = max(0, serverNowMs - playing_since_ms)`
  - `playing_since_ms = null`
  - `state = 'paused'`
- Seek `{ progress_ms, play }`
  - `paused_progress_ms = clamp(0, duration_ms, progress_ms)`
  - If `play === true` then `playing_since_ms = serverNowMs - paused_progress_ms` and `paused_progress_ms = null`, `state='playing'`
  - Else `state='paused'`
- Replace video / Next
  - Reset `duration_ms`, set `paused_progress_ms = 0`, `playing_since_ms = null`, `state='starting' | 'paused'` per policy

### Ad Set Derivation (stateless)
- Persist every `ad.report { active, ts }`; latest per `(room_id,user_id)` is authoritative.
- Derived active set at read:
  - TTL: include user if `serverNowMs - lastTrueTs ≤ ACTIVE_TTL_MS` (clears stale trues)
  - Debounce: require `active:true` stability ≥ `MIN_ACTIVE_MS`; require `active:false` stability ≥ `MIN_INACTIVE_MS`
  - Room-level grace: only transition pause/resume when the set crosses empty/non-empty and remains so for ≥ `ROOM_TRANSITION_GRACE_MS`
- Recommended defaults
  - `ACTIVE_TTL_MS = 8000`
  - `MIN_ACTIVE_MS = 700`
  - `MIN_INACTIVE_MS = 900`
  - `ROOM_TRANSITION_GRACE_MS = 300`

### Messaging Requirements
- Include `serverNowMs` on `welcome`, `control.echo`, and `room.snapshot`.
- Envelope includes `v` (schema version) and `reqId` for idempotency.

### Concurrency & Idempotency
- All mutating events carry `reqId`; dedupe in a short-lived persisted cache or by upsert semantics.
- Use transactional updates for clock fields to avoid torn writes.
- No per-process memory means horizontal scale without coordination.

### Client Drift Handling
- Compute expected position from server-provided `virtual_clock` and `serverNowMs`.
- Snap when drift exceeds `DRIFT_SNAP_MS`; otherwise use gentle rate adjustments.

### Edge Cases
- Clamp progress to `[0, duration_ms]`.
- Unknown `duration_ms` → treat as unbounded for calculations; snap on metadata arrival.
- Guard against clock regressions; ignore out-of-order or stale `reqId` updates.

### Test Checklist
- Clock transitions: play→pause→play, seeks (both paused and playing).
- Ad derivation: TTL expiry, debounce stability, room grace transitions.
- Idempotency: duplicate `reqId` for seek/play/pause.
- Snapshot correctness under concurrent writers and multi-worker runs.


