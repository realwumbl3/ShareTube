import os
from dotenv import load_dotenv

# Load .env from the backend directory
load_dotenv("&PROJECT_ROOT/backend/&VERSION/.env")

# Bind Gunicorn to a Unix domain socket for local Nginx proxying
bind = "unix:&PROJECT_ROOT/instance/&VERSION/&APP_NAME.sock"
# Number of worker processes (SocketIO requires 1 unless using a message queue like Redis)
workers = int(os.getenv("WEB_WORKERS", "6"))
# Time to gracefully stop workers on restart/shutdown
graceful_timeout = 5
# Use Gevent WebSocket worker to support Flask-SocketIO
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
# Avoid importing the app in the master process (important for gevent monkey-patching order)
preload_app = False
# Change working directory to the project root before loading app
chdir = "&PROJECT_ROOT"

# Add the backend version directory to Python path to handle dashes in directory name
pythonpath = "&PROJECT_ROOT/backend/&VERSION"
# WSGI app module path for Gunicorn to load
wsgi_app = "server:app"

# Kill and restart workers that block beyond this many seconds
timeout = 120
# File creation mask for logs and socket to be group-readable/writable
umask = 0o007
# User account under which Gunicorn workers should run
user = "&USERNAME"
# Group under which Gunicorn workers should run (matches web server group)
group = "www-data"
# Error log file path
errorlog = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.log"
# Logging level for Gunicorn (defaults to INFO, can be overridden via LOG_LEVEL env var)
loglevel = os.getenv("LOG_LEVEL", "info").lower()
# Capture stdout/stderr of workers into Gunicorn logs
capture_output = True
# PID file to manage the Gunicorn process
pidfile = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.pid"
# Enable reload on code changes for development (disabled by default in production)
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
