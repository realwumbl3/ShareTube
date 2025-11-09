## ShareTube TODO (v1-01)

This list reflects the current repository status versus the design in `GAMEPLAN.md` and `STATE-FLOW.md`. It’s split into Completed and Outstanding, grouped by domain.

### Completed

- Backend
  - Flask app factory with CORS and Socket.IO initialization (`app.py`, `extensions.py`).
  - Database models implemented (`models.py`):
    - `User`, `Room` (incl. `owner_id`, `control_mode`, `controller_id`, `ad_sync_mode`, `state`, `current_entry_id`).
    - `RoomMembership` (incl. ad sync fields: `ad_active`, `ad_last_true_ts`, `ad_last_false_ts`).
    - `RoomOperator`, `Queue`, `QueueEntry` (incl. virtual clock fields: `duration_ms`, `playing_since_ms`, `paused_progress_ms`; plus `progress_ms`, `paused_at`).
    - `RoomAudit`, `ChatMessage` (schema present; not yet wired to features).
  - REST endpoints:
    - Google OAuth: `/auth/google/start`, `/auth/google/callback` issuing short-lived JWT (`views/auth.py`).
    - YouTube metadata: `GET /api/youtube/metadata` (`views/youtube.py`).
    - Create room: `POST /api/room.create` (`views/room.create.py`).
  - Socket.IO events:
    - `join_room` / `leave_room` with membership tracking and `presence_update` broadcast (`sockets.py`).
    - `queue.add` to build/fetch metadata and append to queue with `queue_update` broadcast (`views/queue.py`).
  - Utilities: YouTube id extraction, metadata fetch (oEmbed + optional Data API), safe DB commit (`utils.py`); SQLIte pragmas (`app.py`).
  - Dashboard blueprint stub registered (`dashboard.py`) — minimal rendering hook exists.

- Extension (extension/app)
  - MV3 content script bootstraps the app and hooks YouTube SPA signals (`contentScript.js`).
  - UI: pill with avatar and room code, presence avatars, queue panel, debug menu (`app.js`, `components/*`, `styles.css`).
  - Room lifecycle: create via `POST /api/room.create`, join via `join_room`, URL `#st:<CODE>` hash handling, copy link to clipboard (`app.js`, `components/UserIcons.js`).
  - Socket client with JWT in query; listens for `presence_update` and `queue_update` (`app/socket.js`).
  - Drag-and-drop enqueue of YouTube URLs (`app.js`).
  - Player observer with local play/pause enforcement and ad detection heuristic (`player.js`).
  - Local reactive state and list sync helper (`state.js`, `sync.js`).
  - Popup login flow that stores JWT in `chrome.storage.local` (`popup.js`).
  - CSS styles for core UI and an ad overlay (style only; no overlay logic yet) (`styles.css`).

### Outstanding

- Auth & Identity
  - Require an explicit realtime handshake: client `hello { v, clientId, jwt }` → server `welcome { serverNowMs, user, minVersion }`.
  - Include `serverNowMs` on welcome and periodic `pong` messages for drift calibration.
  - Handle JWT expiry/refresh in the extension; re-auth on expiry.
  - Tighten allowed origins for REST/WS (limit WS to extension and site domains).

- Realtime Protocol & Versioning
  - Implement message envelope fields: `v`, `reqId`; add server-side dedupe cache per `(user|guest, reqId)`.
  - Add server broadcasts: `room.snapshot`, `control.echo`, `room.permissions`; and replies for `room.join` results.
  - Add periodic `pong` with timing to estimate RTT/offset.

- Rooms & Virtual Clock State Machine
  - Implement handlers to drive the authoritative virtual clock on control events:
    - `room.state.set { state:'playing'|'paused'|'starting' }` → update `playing_since_ms` / `paused_progress_ms` as specified.
    - `room.seek { progress_ms, play }` → set `paused_progress_ms` and optionally `playing_since_ms` (when `play=true`).
  - Track `Room.current_entry_id` and state transitions: `idle ↔ starting ↔ playing ↔ paused`.
  - Auto-advance/rotate the queue when an entry completes (increment `watch_count`, rotate to tail).

- Queue API & UI
  - Add `queue.remove` and `queue.replace`; wire the UI (the “X” button currently has no handler).
  - Persist and expose `video_id` and `duration_ms` per entry (server payload and UI display).
  - Enforce ordering/renumbering on insert/remove/replace operations.

- Presence, Roles, and Control Authority
  - Emit `room.presence` snapshots periodically (not only on join/leave).
  - Implement roles and controls:
    - Endpoints/events: `room.control_mode.set`, `room.operator.add/remove`, `room.controller.set` (baton transfer/lease).
    - Emit `room.permissions` on any role/mode/baton change.
  - Reflect permissions in the UI (enable/disable controls based on baton/mode).

- Ad Sync
  - Client: emit `ad.report { active }` on ad detector changes (debounced/TTL); render overlay listing users currently in ads.
  - Server: persist membership ad fields with debounce/TTL; derive active set with grace; emit `ad.status` and toggle room play/pause per policy.
  - Add `ad.policy.set` to control `ad_sync_mode` per room.

- Playback Sync & Drift Correction
  - Server: include `serverNowMs` in snapshots and control echoes.
  - Client: compute expected position from `virtual_clock`; snap if `|drift| > threshold` (≈400ms), otherwise smooth; handle seeks on join.
  - On join during `playing/paused/starting`, redirect to canonical watch URL for current entry before syncing playback.

- REST Surface & Health
  - Add `GET /health` endpoint.
  - Optional: room list/detail endpoints for dashboard/ops.

- Security & Hygiene
  - Validate inputs thoroughly (room codes, video URLs/ids, payload shapes).
  - Add rate limiting on mutating events (REST + WS).
  - Sanitize chat inputs when chat is implemented.

- Chat (Later Phase)
  - Implement `chat.send` and broadcast `chat.message`; add minimal chat UI.

- Observability
  - Structured logs with `reqId`, `roomCode`, and `userId` where applicable.
  - Basic metrics (counters/histograms) and drift sampling ingestion.
  - Optional: periodic system stats emitter (config flag exists; implementation not wired).

- Tests & Tooling
  - Align Playwright tests with current UI (e.g., `#sharetube_control_button` does not exist in code).
  - Add unit tests for state-machine transitions and utilities.
  - Lint/type-check setup across Python/JS (ensure consistent CI harness).

- Deployment & Ops
  - Verify and document provided gunicorn/nginx templates; ensure Socket.IO works behind proxy.
  - Configure a Socket.IO message queue (e.g., Redis) for multi-process broadcast.

- Documentation
  - Keep `GAMEPLAN.md` and `STATE-FLOW.md` synchronized with implementation details and any deviations.
  - Document protocol schemas and event contracts as they are implemented.


