# NewApp — barebones MV3 extension + Flask backend skeleton

This is a minimal scaffold modeled after `WeComment`'s structure. It gives you:

- Flask backend with health check and Google OAuth endpoints that return a short‑lived JWT
- Basic SQLAlchemy `User` model only
- Chrome Extension (MV3) with popup, options, background, and a placeholder content script
- Deployment templates for systemd + Gunicorn + Nginx (edit USERNAME/paths)

## Layout

```
NewApp/
  backend/
    app.py
    config.py
    gunicorn.conf.py
    requirements.txt
  extension/
    manifest.json
    background.js
    contentScript.js
    popup.html
    popup.js
    options.html
    options.js
    styles.css
  deploy/
    systemd/newapp.service
    nginx/newapp.conf
```

## Backend setup (dev)

```bash
python3 -m venv .venv
. .venv/bin/activate    # Windows: .venv\\Scripts\\activate
pip install -r NewApp/backend/requirements.txt

export FLASK_APP="backend.app:app"
export BACKEND_BASE_URL="http://localhost:5100"
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
flask run --host 0.0.0.0 --port 5100
```

Environment variables read by `backend/config.py`:

- `BACKEND_BASE_URL` (default `http://localhost:5100`)
- `SECRET_KEY`, `JWT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL` (default `sqlite:///newapp.db`)
- `CORS_ORIGINS` (default `*`)

## Extension (dev)

Load `NewApp/extension/` as an unpacked extension in Chrome. Set the Backend URL in popup/options to your dev server, e.g. `http://localhost:5100`.

## Production (templates)

Edit placeholders `USERNAME` and paths in:

- `deploy/systemd/newapp.service`
- `backend/gunicorn.conf.py`
- `deploy/nginx/newapp.conf`

Then provision an instance directory and enable the service similar to WeComment.

## Security notes

- Signature and audience verification for `id_token` is skipped in dev for simplicity. Enable proper verification in production.
- Restrict `CORS_ORIGINS` in production.


