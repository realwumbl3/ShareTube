import os
from dotenv import load_dotenv

# Load .env from the backend directory
load_dotenv("&PROJECT_ROOT/backend/&VERSION/.env")

# Bind background Gunicorn to a separate Unix domain socket (NOT used by Nginx).
bind = "unix:&PROJECT_ROOT/instance/&VERSION/&APP_NAME.bg.sock"
# Background worker processes (for long-running tasks). Heartbeat itself is gated to 1.
workers = int(os.getenv("BG_WORKERS", "2"))
graceful_timeout = 5
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
# Avoid importing the app in the master process (important for gevent monkey-patching order)
preload_app = False
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
reload = os.getenv("GUNICORN_RELOAD", "false").lower() in ("true", "1", "yes", "on")

# Gunicorn hooks to ensure boot logs are written when workers start
def post_fork(server, worker):
    """Called just after a worker has been forked. Logs boot information."""
    import logging
    import os
    import sys
    # Get Gunicorn's error logger - this writes directly to errorlog
    logger = logging.getLogger('gunicorn.error')
    # Add backend version to Python path to import server.config
    backend_path = "&PROJECT_ROOT/backend/&VERSION"
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
    try:
        from server.config import Config
        # Log reload configuration
        gunicorn_reload_env = os.getenv("GUNICORN_RELOAD", "false")
        reload_check = gunicorn_reload_env.lower() in ("true", "1", "yes", "on")
        logger.info("[worker] boot: reload=GUNICORN_RELOAD='%s' -> %s (config: %s)", gunicorn_reload_env, reload_check, reload)
        logger.info(
            "[worker] boot: version=%s app=%s log_level=%s pid=%s",
            Config.VERSION,
            Config.APP_NAME,
            Config.LOG_LEVEL,
            os.getpid(),
        )
        logger.info("[worker] boot: db=%s", Config.SQLALCHEMY_DATABASE_URI)
        # Force flush to ensure logs are written immediately
        for handler in logger.handlers:
            handler.flush()
    except Exception as e:
        logger.error(f"[worker] Failed to log boot info: {e}")


