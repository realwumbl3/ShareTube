## ShareTube TODO (v1-01)

This list reflects the current repository status versus the design in `GAMEPLAN.md` and `STATE-FLOW.md`. It’s split into Completed and Outstanding, grouped by domain.

-   ❌ - Not Started
-   🟡 - In Progress
-   ✅ - Completed

### Completed

-   ✅ Backend

    -   Flask app factory with CORS and Socket.IO initialization (`app.py`, `extensions.py`).
    -   Database models implemented (`models.py`):
        -   `User`, `Room` (incl. `owner_id`, `control_mode`, `controller_id`, `ad_sync_mode`, `state`, `current_entry_id`).
        -   `RoomMembership` (incl. ad sync fields: `ad_active`, `ad_last_true_ts`, `ad_last_false_ts`).
        -   `RoomOperator`, `Queue`, `QueueEntry` (incl. virtual clock fields: `duration_ms`, `playing_since_ms`, `paused_progress_ms`; plus `progress_ms`, `paused_at`).
        -   `RoomAudit`, `ChatMessage` (schema present; not yet wired to features).
    -   ✅ REST endpoints:
        -   Google OAuth: `/auth/google/start`, `/auth/google/callback` issuing short-lived JWT (`views/auth.py`).
        -   YouTube metadata: `GET /api/youtube/metadata` (`views/youtube.py`).
        -   Create room: `POST /api/room.create` (`views/room.create.py`).
    -   ✅ Socket.IO events:
        -   `room.join` / `room.leave` with membership tracking and `presence.update` broadcast (`sockets.py`).
        -   `queue.add` to build/fetch metadata and append to queue with `queue_update` broadcast (`views/queue.py`).
    -   ✅ Utilities: YouTube id extraction, metadata fetch (oEmbed + optional Data API), safe DB commit (`utils.py`); SQLIte pragmas (`app.py`).
    -   ✅ Dashboard blueprint stub registered (`dashboard.py`) — minimal rendering hook exists.

-   ✅ Extension (extension/app)
    -   MV3 content script bootstraps the app and hooks YouTube SPA signals (`contentScript.js`).
    -   ✅ UI: pill with avatar and room code, presence avatars, queue panel, debug menu (`app.js`, `components/*`, `styles.css`).
    -   ✅ Room lifecycle: create via `POST /api/room.create`, join via `room.join`, URL `#st:<CODE>` hash handling, copy link to clipboard (`app.js`, `components/UserIcons.js`).
    -   ✅ Socket client with JWT in query; listens for `presence.update` and `queue_update` (`app/socket.js`).
    -   ✅ Drag-and-drop enqueue of YouTube URLs (`app.js`).
    -   ✅ Player observer with local play/pause enforcement and ad detection heuristic (`player.js`).
    -   ✅ Local reactive state and list sync helper (`state.js`, `sync.js`).
    -   ✅ Popup login flow that stores JWT in `chrome.storage.local` (`popup.js`).
    -   ✅ CSS styles for core UI and an ad overlay (style only; no overlay logic yet) (`styles.css`).

### Outstanding

-   ❌ Auth & Identity

    -   ❌ Realtime handshake: client `hello { v, clientId, jwt }` → server `welcome { serverNowMs, user, minVersion }`
        -   ❌ Server `hello/welcome` handlers and payloads
        -   ✅ Include `serverNowMs` on welcome
    -   ❌ Heartbeats: periodic `pong` with timing for drift
    -   ❌ JWT expiry/refresh handling in extension
    -   Tighten allowed origins (REST/WS)
        -   ✅ Config support via `CORS_ORIGINS` and `cors_allowed_origins`
        -   ❌ Restricted origin list not applied in env/defaults

-   ❌ Realtime Protocol & Versioning

    -   Envelope + idempotency
        -   ❌ Client/server message envelope fields: `v`, `reqId`
        -   ❌ Server dedupe cache per `(user|guest, reqId)`
    -   Server broadcasts
        -   ❌ `room.snapshot`
        -   ❌ `control.echo`
        -   ❌ `room.permissions`
        -   ✅ Replies for join: `user.join.result { ok, code, snapshot, serverNowMs }`
    -   ❌ Periodic `pong` with timing for RTT/offset

-   ❌ Rooms & Virtual Clock State Machine

    -   Control handlers (authoritative virtual clock)
        -   ✅ `room.control.state.set { state:'playing'|'paused'|'starting' }` updates virtual clock
        -   ✅ `room.control.seek { progress_ms, play }` sets `paused_progress_ms` / `playing_since_ms`
        -   ✅ Basic `room.control.play` / `room.control.pause` update `room.state` and load first entry
    -   State/entry management
        -   ❌ Track transitions: `idle ↔ starting ↔ playing ↔ paused` per spec
        -   ❌ Auto-advance/rotate on entry completion (increment `watch_count`, rotate to tail)

-   ❌ Queue API & UI

    -   Mutations
        -   ✅ `queue.remove` implemented (server + UI “X” hook)
        -   ❌ `queue.replace` not implemented
    -   Data fields
        -   ✅ Persist `video_id`, `duration_ms` on `QueueEntry`
        -   ✅ Expose in server payloads
        -   ✅ Display `duration_ms` in UI
    -   Ordering
        -   ✅ Position assigned on insert
        -   ❌ Renumbering/enforcement on remove/replace

-   ❌ Presence, Roles, and Control Authority

    -   Presence
        -   ✅ `presence.update` on join/leave
        -   ❌ Periodic `room.presence` snapshots
    -   Roles/permissions
        -   ✅ Data model support: `RoomOperator`, membership `role`
        -   ❌ Endpoints/events: `room.control_mode.set`, `room.operator.add/remove`, `room.controller.set`
        -   ❌ Emit `room.permissions` on changes
        -   ❌ UI reflects permissions/baton

-   ❌ Ad Sync

    -   Client
        -   ✅ Ad detection heuristic present
        -   ❌ Emit `ad.report { active }`
        -   ❌ Overlay listing users in ads (CSS stub only)
    -   Server
        -   ✅ Membership fields for ad status persisted in model
        -   ❌ Handlers for debounce/TTL and derived active set
        -   ❌ Emit `ad.status` and toggle room play/pause per policy
    -   ❌ `ad.policy.set` endpoint/event

-   ❌ Playback Sync & Drift Correction

    -   ✅ Server: include `serverNowMs` in snapshots/control echoes
    -   ✅ Client: compute expected vs local, snap/smooth drift; handle seeks on join
    -   ✅ On join, redirect to canonical watch URL for current entry before syncing

-   ❌ REST Surface & Health

    -   ❌ `GET /health` endpoint
    -   Dashboard/ops
        -   ✅ Dashboard blueprint + rooms page route
        -   ❌ Room list/detail JSON endpoints

-   ❌ Security & Hygiene

    -   Validation
        -   ✅ Basic checks on inputs in several handlers
        -   ❌ Thorough validation (codes, URLs/ids, payload schemas)
    -   ❌ Rate limiting on mutating events (REST + WS)
    -   ❌ Sanitize chat inputs when chat is implemented

-   ❌ Chat (Later Phase)

    -   ❌ Implement `chat.send` and broadcast `chat.message`; add minimal chat UI.

-   ❌ Observability

    -   ❌ Structured logs with `reqId`, `roomCode`, and `userId`
    -   ❌ Basic metrics (counters/histograms) and drift sampling
    -   System stats emitter
        -   ✅ Implementation present behind flag
        -   ❌ Not wired/started anywhere

-   ❌ Tests & Tooling

    -   ❌ Align Playwright tests with current UI (e.g., `#sharetube_control_button` does not exist in code).
    -   ❌ Add unit tests for state-machine transitions and utilities.
    -   ❌ Lint/type-check setup across Python/JS (ensure consistent CI harness).

-   ❌ Deployment & Ops

    -   ❌ Verify and document provided gunicorn/nginx templates; ensure Socket.IO works behind proxy.
    -   ✅ Configure a Socket.IO message queue (e.g., Redis) for multi-process broadcast.

-   ❌ Documentation
    -   Authoring
        -   ✅ `GAMEPLAN.md` and `STATE-FLOW.md` drafts present
        -   ❌ Synchronized with implementation (note event/name deviations)
    -   ❌ Document protocol schemas and event contracts as they are implemented
