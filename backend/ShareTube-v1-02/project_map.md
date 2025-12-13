# Project Map

## Frontend (Chrome extension)
- `extension/manifest.json` – MV3 manifest that wires the action popup, content script matches (`youtube.com/*`), permissions, and web-accessible resources.
- `extension/background.js` – long-lived background script that mediates between sockets, the popup, and injected content helpers.
- `extension/contentScript.js` – injected into YouTube pages to forward playback events and respond to playback controls coming from the background or popup.
- `extension/popup.html` / `popup.js` – UI that appears when the user clicks the extension icon; relies on the JavaScript bridge that talks to the background script.
- `extension/app/` – single-page application shell; key areas:
  - `@assets`, `@css`, `@dep` aliased folders for static assets, styles, and dependency shims.
  - `components/`, `managers/`, `models/`, `youtubePlayer/` – feature-focused modules that drive room management, queue controls, and the embedded player UI.
  - `state.js`, `getters.js`, `utils.js` – shared state + helper reducers that keep the extension synchronized with the backend session.

## Backend (Flask + WebSocket)
- `backend/__init__.py` – Flask factory entry point, attaches extensions, registers blueprints, and exposes the WSGI app.
- `backend/config.py` – central configuration (secrets, environment flags, third-party keys).
- `backend/extensions.py` – instantiates Flask extensions such as database, login/session management, etc.
- `backend/models/` – ORM models representing the domain:
  - `room.py`, `queue.py`, `queue_entry.py` – rooms, queues, and entries.
  - `user.py`, `membership.py` – user accounts and room memberships.
  - `youtube_author.py`, `audit.py`, `chat.py` – metadata, telemetry, chat history.
- `backend/views/` – HTTP/WebSocket view handlers split by capability:
  - `auth.py` – login/logout helpers and access guards.
  - `decorators.py` – shared decorators for auth, timing, and request shaping.
  - `stats.py` – monitoring endpoints.
  - `player/` – `play.py`, `pause.py`, `seek.py`, `skip.py`, `restartvideo.py`.
  - `queue/` – queue CRUD and reordering (`add.py`, `remove.py`, `move.py`, `continue_next.py`, `requeue_to_top.py`, `probe.py`, `load_debug_list.py`, `common.py`).
  - `rooms/` – room lifecycle and time synchronization (`join.py`, `leave.py`, `client_pong.py`, `heartbeat.py`, `time_sync.py`, `settings_autoadvance.py`, etc.).
- `backend/sockets.py` – central socket server that routes incoming WebSocket messages to the view handlers.
- `backend/utils.py` – helper utilities (rate limiting, serialization, validation) reused throughout sockets and views.
- `backend/websocket_patch.py` – compatibility patch layer for the WebSocket stack.

## Web UI / Site Pages
- `pages/` – server-rendered/mobile portals with matched frontend/backends:
  - `homepage/`, `dashboard/`, `mobile_remote/` each expose:
    * `backend/` (Flask views servicing dashboard APIs and SSR pages).
    * `frontend/` (client scripts and UI components that hydrate those pages).
    * `shared_imports.py` and `jsconfig.json` to keep imports consistent and enable editor tooling.

## Tooling & Deployment
- `build-template/` – example deployment configs: `gunicorn.conf.py`, `nginx.conf`, and `service.service`.
- `scripts/` – helper scripts such as `render_icons.js` and `render_attempts.js` for automating asset generation.
- Root-level project metadata: `package.json`, `package-lock.json` (npm tooling for the extension), `requirements.txt` (Python dependencies), `RESTART.sh` (restart script for the backend service).

## Supporting Notes
- `TODO.md`, `IDEAS.md` – living documents that capture outstanding work and experimental plans.
- `README`/docs are not present here; rely on this map plus inline comments for orientation.

