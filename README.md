# ShareTube — Synchronized YouTube Watchrooms

ShareTube is a Chrome (MV3) extension plus a Flask backend that lets people watch YouTube together in real time. The extension injects a minimal UI into YouTube pages; the backend provides REST, Socket.IO realtime rooms, Google OAuth, and an admin dashboard. Storage defaults to SQLite via SQLAlchemy.

See `SYSTEMDIAGRAM.md` for sequence diagrams and a detailed architecture overview.

## Highlights

- Chrome Extension UI (pill + queue) on YouTube pages
- Room-based watch-together with presence and queue
- Server-authoritative playback with drift correction and seeks
- Ad-aware state with a subtle waiting overlay during ads/starting
- Skip vote, play/pause, and next controls
- Admin dashboard with live room snapshots

## Layout

- `backend/` Flask app, models, Socket.IO handlers, views, dashboard templates
- `extension/` MV3 manifest, content script, background, popup, options, modules in `cs/`
  - `cs/adOverlay.js` encapsulates ad overlay UI and placement
  - `cs/socketUtil.js` centralizes emit throttling and dedupe
- `SYSTEMDIAGRAM.md` system diagrams and flows
- `README.md` legacy readme; `README_NEW.md` this document

## Quick Start

1) Python venv and install deps
2) Configure `.env` (see config list in this file)
3) Run backend: `FLASK_APP=backend.app:app flask run --host 0.0.0.0 --port 5100`
4) Load unpacked extension from `extension/` in Chrome; set Backend URL in options
5) Optional: sign in via popup (Google OAuth) to store `newapp_token`

## Configuration

Environment variables (see `backend/config.py`): `SECRET_KEY`, `JWT_SECRET`, `DATABASE_URL`, `BACKEND_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ACCESS_TOKEN_EXPIRES_SECONDS`, `CORS_ORIGINS`, `YOUTUBE_API_KEY`, `SOCKETIO_MESSAGE_QUEUE`, `SOCKETIO_ASYNC_MODE`, `ENABLE_SYSTEM_STATS`.

## Data Model (selected)

- `User(id, google_sub, email, name, picture)`
- `Room(id, code, created_by_id, created_at, is_private, state: 'idle'|'starting'|'playing_ad'|'playing', prev_state_before_ads)`
- `RoomMembership(..., active, player_state, player_is_ad, player_ts)`
- `Queue(id, room_id, created_by_id, created_at)`
- `QueueEntry(..., url, title, thumbnail_url, position, status, duration, progress, playing_since)`

## REST (highlights)

- `GET /` health
- `GET /api/youtube/metadata?url|id`
- `GET /auth/google/start` / `GET /auth/google/callback` → issues JWT to extension
- Controls: `POST /api/room/state`, `POST /api/room/seek`, `POST /api/room/next`
- Dashboard: `GET /dashboard/`, `/dashboard/api/snapshot`, `/dashboard/stream` (SSE)

## Socket.IO (selected)

Client→Server: `ping`, `room_create`, `room_join`, `room_leave`, `queue_add`, `queue_remove`, `queue_replace`, `room_state_set`, `room_seek`, `player_status`, `vote_skip`, ops events.

Server→Client: `hello`, `pong`, `room_create_result`, `room_join_result`, `room_presence`, `queue_snapshot`, `room_state_change`, `room_seek`, `room_playback`, ad events (`room_ad_pause`, `room_ad_resume`, `room_ad_status`), `system_stats`.

## Behavior: Playback, Sync, Ads

- Server maintains `(duration, progress, playing_since)` for current entry
- Clients throttle/dedupe `player_status` and locally enforce play/pause per room state
- `starting` → prepare at t=0; transition to `playing` when room does
- Ads: room may enter `playing_ad`; clients show overlay and pause content; when clear, restore prior state or idle
- Seeks propagate via `room_seek` and resnap clients, avoiding feedback loops

## Production Notes

- Gunicorn + gevent-websocket; restrict `CORS_ORIGINS`; strong secrets
- Consider Postgres + Redis (Socket.IO message queue) for scaling

## Deployment (setup_deploy.py)

This repo includes a helper script to render deploy templates and print the exact server commands to enable the service and Nginx site.

Usage options:

- Use current user and this repo path (convenient local render):

```bash
python setup_deploy.py --this --output-dir build
```

- Specify explicit username and target project path (typical for a Linux server):

```bash
python setup_deploy.py --username alice \
  --project-path /home/alice/Dev/NewApp \
  --output-dir build
```

What it does:

- Reads templates:
  - `deploy/nginx/newapp.conf`
  - `deploy/systemd/newapp.service`
  - `backend/gunicorn.conf.py`
- Replaces placeholders `USERNAME`, `%i`, and the canonical `/home/USERNAME/Dev/NewApp` with your provided path
- Writes rendered files under `build/`
- Prints follow-up commands to run on the server, e.g.:

```bash
export PROJECT_ROOT="/home/USERNAME/Dev/NewApp"
sudo systemctl link "$PROJECT_ROOT/build/deploy/systemd/newapp.service"
sudo systemctl daemon-reload
sudo systemctl enable --now newapp.service
sudo chown USERNAME:www-data "$PROJECT_ROOT/instance/newapp.sock" || true
sudo chmod 770 "$PROJECT_ROOT/instance/newapp.sock" || true
sudo ln -sf "$PROJECT_ROOT/build/deploy/nginx/newapp.conf" /etc/nginx/sites-enabled/newapp.conf
sudo nginx -t && sudo systemctl reload nginx
```

Notes:

- The script forces LF newlines for Linux deployment.
- Ensure your service user has permission to create `instance/newapp.sock`.
- Update domain, paths, and TLS in the Nginx template as needed.


