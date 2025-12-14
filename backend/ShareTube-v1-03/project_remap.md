# Project Remap (Reimagined Structure)

To match a co-development workflow and improve clarity, this document describes an optimized file hierarchy that keeps all runtime behavior intact while clarifying boundaries between extension, backend, and tooling responsibilities. The changes below are purely structural proposals—implement them when ready to execute renames, moves, and refactors.

## 1. Top-Level Layout
- `extension/` → `extension/` *(same root, reorganized contents below)*.
- `backend/` → `server/` (future rename) to emphasize the Flask+WebSocket service boundary.
- `pages/` → `ui_portals/` (future rename), grouping server-rendered portals.
- `scripts/`, `build-template/`, `TODO.md`, `IDEAS.md`, `requirements.txt`, `package*.json`, `RESTART.sh` remain alongside the server for visibility.

## 2. Chrome Extension Reorganization
- `extension/manifest.json`: keep MV3 manifest at root (Chrome extension requirement - cannot be moved).
- `extension/background.js` → `extension/runtime/background.js`.
- `extension/contentScript.js` → `extension/runtime/contentScript.js`.
- `extension/popup.*` → `extension/popup/ui.*` (`popup.html` → `popup/ui.html`, `popup.js` → `popup/ui.js`).
- `extension/app/` becomes `extension/appshell/` with:
  - `app.js` → `extension/appshell/app.js` (main application entry point).
  - `components/` → `extension/appshell/ui/components/`.
  - `managers/`, `models/`, `youtubePlayer/` reorganized into `core/` vs `feature/` directories:
    - `managers/` → `extension/appshell/core/managers/` (socket.js, room.js, auth.js, ui.js, storage.js, virtualPlayer.js).
    - `models/` → `extension/appshell/core/models/`.
    - `youtubePlayer/` → `extension/appshell/feature/youtubePlayer/` (manager.js, addToST.js).
  - `state.js`, `getters.js`, and `utils.js` split into `state/` (state.js + getters.js) and `utils/`:
    - `state.js` → `extension/appshell/core/state/state.js`.
    - `getters.js` → `extension/appshell/core/state/getters.js`.
    - `utils.js` → `extension/appshell/core/utils/utils.js`.
  - `assets/` → `extension/appshell/assets/` (if separate from `@assets`).
- Introduce `extension/shared/` for shims (formerly `@assets`, `@css`, `@dep`), each prefixed with `shared/`:
  - `@assets/` → `extension/shared/assets/`.
  - `@css/` → `extension/shared/css/`.
  - `@dep/` → `extension/shared/dep/`.
- Add `extension/README.md` describing how the popup, background, and injected scripts coordinate with messaging channels (WebSocket). Cross-link to server API docs in `server/README.md`.

## 3. Server (Flask + WebSocket)
- `backend/__init__.py` + `backend/config.py` + `backend/extensions.py` → `server/app/__init__.py`, `server/config.py`, `server/extensions.py`.
- `backend/migrations.py` → `server/lib/migrations.py` (database migration runner).
- `backend/models/` → `server/models/` with subdirectories grouping domain modules:
  - `server/models/auth/` (`user.py`, `membership.py`, `youtube_author.py`).
  - `server/models/room/` (`room.py`, `queue.py`, `queue_entry.py`, `chat.py`).
  - `server/models/meta/` (`audit.py`).
- `backend/views/` → `server/views/` with folder breakdown by protocol:
  - `server/views/api/` for RESTful endpoints:
    - `stats.py` → `server/views/api/stats.py`.
    - `auth.py` → `server/views/api/auth.py` (login/logout helpers and access guards).
  - `server/views/ws/` for WebSocket handlers, each with `__init__.py` re-exporting:
    - `server/views/ws/rooms/` (`join.py`, `leave.py`, `client_pong.py`, `client_verification.py`, `disconnect.py`, `heartbeat.py`, `room_timeouts.py`, `settings_autoadvance.py`, `time_sync.py`, `user_ready.py`, `common.py`).
    - `server/views/ws/queue/` (`add.py`, `remove.py`, `move.py`, `continue_next.py`, `requeue_to_top.py`, `probe.py`, `load_debug_list.py`, `common.py`).
    - `server/views/ws/player/` (`play.py`, `pause.py`, `seek.py`, `skip.py`, `restartvideo.py`).
  - `server/views/middleware.py` consolidating decorators/shared hooks (`decorators.py` → `middleware.py`).
- `backend/sockets.py` → `server/ws/server.py`; wrap WebSocket dispatch logic behind a single `WebSocketRouter` class.
- `backend/utils.py` → `server/lib/utils.py` with clear export surface (e.g., `throttle`, `serialize_room`).
- `backend/websocket_patch.py` → `server/lib/websocket_patch.py`.
- Add `server/README.md` summarizing the WebSocket protocol, event schemas, and how to run `RESTART.sh`.

## 4. UI Portals (`pages/`)
- Rename to `ui_portals/`, each portal retains `backend/`, `frontend/`, `shared_imports.py`, `jsconfig.json`.
- Add portal-level `README.md` describing data flow between server-rendered templates and client hydration.
- Keep existing `dashboard/`, `homepage/`, `mobile_remote/` but namespace them as `ui_portals/<portal>/backend/` etc.

## 5. Tooling & Deployment
- `scripts/` → `tooling/scripts/`.
- `build-template/` → `tooling/build/`.
- If desired, add `tooling/README.md` describing `render_icons.js` and `render_attempts.js`.

## 6. Supporting Docs
- Keep `TODO.md`, `IDEAS.md`.
- Add `docs/` or `notes/` folder later for process docs (not detailed here).

## Implementation Notes
1. Apply this map incrementally: rename folders via `mv`, update import paths, and refactor `__init__.py` exports for each module.
2. Update `package.json` scripts and Flask entry points to reference new `server/` package names and new manifest paths.
3. Keep the extension MV3 API interactions intact by mirroring file-level moves inside `manifest.json`, `popup.js`, and `background.js` messaging.
4. Update all import statements in:
   - Extension files (`app.js`, `popup.js`, `background.js`, `contentScript.js`, and all files in `app/`).
   - Backend files (`__init__.py`, all view handlers, models, and utilities).
   - Portal files (update imports in `backend/` and `frontend/` directories).
5. Update `manifest.json` paths for web-accessible resources (CSS files, assets) to reflect new `shared/` structure.
6. Update Flask blueprint registrations in `server/app/__init__.py` to reference new view module paths.
7. Update WebSocket route registrations in `server/ws/server.py` to reference new handler module paths.
8. Document each rename in `CHANGELOG.md` or commit message to preserve reviewability.

## Additional Considerations
- Test extension loading after reorganization (manifest.json remains at extension root).
- Verify all Chrome extension API calls (e.g., `chrome.runtime.getURL()`) work with new asset paths.
- Ensure database migrations continue to work after moving `migrations.py` to `server/lib/`.
- Update any build scripts that reference old paths.
- Consider adding path aliases in `jsconfig.json` files for portal frontends to simplify imports.

This remap keeps the existing functionality but clarifies purpose, groups by responsibility, and lays the groundwork for seamless collaboration.

