# ShareTube — YouTube watchrooms via Chrome Extension + Flask backend

A minimal yet complete system for sharing YouTube links into a synchronized "watchroom" via a Chrome (MV3) extension and a Flask backend with realtime over Socket.IO, an admin dashboard, and Google OAuth sign-in.

- **Backend**: Flask 3, SQLAlchemy, Socket.IO (gevent), REST endpoints for YouTube metadata + Google OAuth, SSE-powered dashboard
- **Frontend**: Chrome Extension (MV3) with content script UI (using `zyX` micro-UI), popup/options for auth and configuration
- **Storage**: SQLite by default (single-file DB), configurable via `DATABASE_URL`


## Repository layout

```
ShareTube/
  backend/
    app.py                 # Flask app factory, models, REST + Socket.IO
    config.py              # Environment-based configuration
    dashboard.py           # Admin dashboard (HTML + SSE + JSON)
    templates/dashboard/   # Dashboard templates
    requirements.txt       # Python deps
    gunicorn.conf.py       # Example Gunicorn config (unix socket)
  extension/
    manifest.json          # MV3 manifest
    contentScript.js       # Injects ShareTube UI into YouTube
    background.js          # Service worker
    popup.html/js          # Popup UI for auth
    options.html/js        # Options page (backend URL, etc.)
    cs/                    # ES modules for the injected app (zyX-based)
    socket.io.min.js       # Socket.IO client
    styles.css             # Basic styles for injected UI
  deploy/
    systemd/newapp.service # Systemd template (adjust paths/user)
    nginx/newapp.conf      # Nginx template (adjust domain/paths)
  instance/                # Runtime logs, socket, pid (created at runtime)
  SYSTEMDIAGRAM.md         # In-depth architectural overview
  README.md                # This file
```


## Quick start (development)

Prerequisites:
- Python 3.10+
- Chrome/Chromium for loading an unpacked extension

1) Create and activate a virtualenv, install deps

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
```

2) Configure environment

Create a `.env` at repo root (or export env vars in your shell):

```
# Core
BACKEND_BASE_URL=http://localhost:5100
SECRET_KEY=dev-secret-change-me
JWT_SECRET=dev-secret-change-me
DATABASE_URL=sqlite:///newapp.db
CORS_ORIGINS=*

# OAuth (optional for dev; required for sign-in)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# YouTube (optional; improves thumbnails if oEmbed fails)
YOUTUBE_API_KEY=

# Diagnostics (optional)
ENABLE_SYSTEM_STATS=false
```

3) Run the backend (Flask dev server)

```bash
export FLASK_APP="backend.app:app"
flask run --host 0.0.0.0 --port 5100
```

The app auto-creates tables on first run and serves:
- Health: `GET /` → `{ ok: true, app: "NewApp" | APP_NAME }`
- API: under `/api/*`
- OAuth: under `/auth/*`
- Dashboard: under `/dashboard/*`

4) Load the Chrome extension (unpacked)

- Open `chrome://extensions`
- Enable Developer Mode
- Load unpacked → select `ShareTube/extension/`
- In the extension popup or options, set the Backend URL to `http://localhost:5100`

5) Sign in (optional in dev)

- In the popup, click Sign in (launches `GET /auth/google/start`)
- On success, the backend posts a JWT to the opener and it is saved to `chrome.storage.local` as `newapp_token`

6) Use on YouTube

- Open any YouTube page, you will see the ShareTube pill UI
- Drag-and-drop YouTube URLs onto the page to enqueue
- Click `+` to create a room and copy its share URL (hash: `#sharetube:<room_code>`) to clipboard
- Send that URL to friends; when they open it, the content script auto-joins the room


## Configuration reference

Environment variables consumed by `backend/config.py`:
- `SECRET_KEY` — Flask secret
- `JWT_SECRET` — HMAC secret for HS256 JWT; defaults to `SECRET_KEY`
- `DATABASE_URL` — SQLAlchemy URL; default `sqlite:///newapp.db`
- `BACKEND_BASE_URL` — Public base URL of backend (used in OAuth redirects)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth 2.0 credentials
- `ACCESS_TOKEN_EXPIRES_SECONDS` — JWT TTL; default ~14 days
- `CORS_ORIGINS` — `*` for dev; comma-separated list for production
- `YOUTUBE_API_KEY` — Optional YouTube Data API key
- `ENABLE_SYSTEM_STATS` — If `true`, periodic system stats emitted over Socket.IO


## API overview

- `GET /` — health
- `GET /api/youtube/metadata?url=...|id=...` → `{ title, thumbnail_url, id?, channel_title? }`
- `GET /auth/google/start` — begins OAuth code flow
- `GET /auth/google/callback` — exchanges code, upserts user, issues JWT, posts `{type:'newapp_auth', token}` to opener

See `SYSTEMDIAGRAM.md` for full flows and diagrams.


## Socket.IO events (selected)

Client → Server:
- `room_create {}`
- `room_join { code }` / `room_leave { code }`
- `queue_replace { code, items:[{url|id}] }`
- `queue_add { code, item:{url|id} }`
- `queue_remove { code, id }`
- `room_state_set { code, state:'idle'|'playing' }`

Server → Client:
- `room_create_result { ok, code }` / `room_join_result { ok, code }`
- `room_presence { code, members:[{ id, name, picture, active, last_seen }] }`
- `queue_snapshot { code, items:[{ id, url, title, thumbnail_url, position }] }`
- `room_state_change { code, state }`
- `hello { user }`, `pong { ts }`, `system_stats { ... }`


## Admin dashboard

- `GET /dashboard/` — Rooms view (HTML)
- `GET /dashboard/api/snapshot` — JSON room snapshot
- `GET /dashboard/stream` — SSE stream (≈1s cadence)


## Production notes

- Use Gunicorn with gevent-websocket worker and a unix domain socket. Example `backend/gunicorn.conf.py` binds to `instance/newapp.sock` and sets logs/permissions.
- Templates in `deploy/` are starting points. Replace placeholders like `USERNAME`, domain, and paths.
  - Systemd: `deploy/systemd/newapp.service`
  - Nginx: `deploy/nginx/newapp.conf`
- Set `BACKEND_BASE_URL` to the public HTTPS origin of your backend so OAuth redirects work.
- Restrict `CORS_ORIGINS` to trusted origins in production.
- Generate strong secrets for `SECRET_KEY`/`JWT_SECRET`.
- Migrate off SQLite to a managed DB for multi-instance deployments.

Example Gunicorn (unix socket) run:

```bash
. .venv/bin/activate
export BACKEND_BASE_URL=https://newapp.example.com
export SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
export JWT_SECRET=$SECRET_KEY
mkdir -p instance
exec gunicorn --config backend/gunicorn.conf.py backend.app:app
```


## Development tips

- Toggle SQL echo: `SQLALCHEMY_ECHO=true`
- Inspect data via the dashboard DB browser at `/dashboard/db` and related APIs
- Logs are written to `instance/app.log` (configured in `backend/app.py`)


## License

MIT (or specify your preferred license)


