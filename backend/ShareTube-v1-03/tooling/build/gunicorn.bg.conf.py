import os

# Bind background Gunicorn to a separate Unix domain socket (NOT used by Nginx).
bind = "unix:&PROJECT_ROOT/instance/&VERSION/&APP_NAME.bg.sock"
# Background worker processes (for long-running tasks). Heartbeat itself is gated to 1.
workers = int(os.getenv("BG_WORKERS", "2"))
graceful_timeout = 5
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
chdir = "&PROJECT_ROOT"

pythonpath = "&PROJECT_ROOT/backend/&VERSION"
wsgi_app = "server:app"

timeout = 120
umask = 0o007
user = "&USERNAME"
group = "www-data"

accesslog = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.bg.access.log"
errorlog = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.bg.log"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
capture_output = True
pidfile = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.bg.pid"
reload = True


