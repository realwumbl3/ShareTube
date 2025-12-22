# Future annotations for forward reference typing compatibility
from __future__ import annotations

# NOTE: When running under Gunicorn with gevent workers, we must monkey-patch as early as
# possible (before importing ssl/urllib3/jwt/redis) to avoid runtime warnings and subtle bugs.
# We gate this on SOCKETIO_ASYNC_MODE so local non-gevent runs aren't affected.
import os

if os.getenv("SOCKETIO_ASYNC_MODE") == "gevent":
    try:
        from gevent import monkey  # type: ignore

        monkey.patch_all()
    except Exception:
        # Never prevent the app from starting due to patch failures; Gunicorn/gevent will surface
        # the underlying issue if this is actually misconfigured.
        pass

# Standard lib imports for timing and logging, and SQLAlchemy inspector for schema checks
import time
from typing import Optional
from datetime import datetime
import logging

from sqlalchemy import inspect

# Flask primitives for creating the app and request-scoped utilities
from flask import Flask, request, g, current_app
from werkzeug.exceptions import HTTPException

import jwt

# Enable Cross-Origin Resource Sharing for API and Socket.IO
from flask_cors import CORS

# Import configuration object
from .config import Config, START_DEBUG_CONFIG_DUMP

# Import shared Flask extensions (SQLAlchemy and SocketIO)
from .extensions import db, socketio

# Import migrations runner (currently placeholder)
from .migrations import run_all_migrations


# Custom formatter to match Gunicorn log format with timezone and process ID
class GunicornStyleFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        """Format the record's time with timezone offset to match Gunicorn format."""
        # Get local time with timezone
        dt = datetime.fromtimestamp(record.created)
        # Convert to local timezone-aware datetime
        dt_local = dt.astimezone()
        # Format: YYYY-MM-DD HH:MM:SS -HHMM (strftime('%z') returns -0500 format)
        tz_offset = dt_local.strftime('%z')
        return f"{dt_local.strftime('%Y-%m-%d %H:%M:%S')} {tz_offset}]"

    def format(self, record):
        """Format the log record to match Gunicorn style."""
        # Format: YYYY-MM-DD HH:MM:SS -HHMM] [PID] [LEVEL] [LOGGER] - message
        time_str = self.formatTime(record)
        return f"[{time_str} [{record.process}] [{record.levelname}] [{record.name}] - {record.getMessage()}"


# Configure logging with Gunicorn-style format
# Resolve log level from Config, defaulting to INFO
_log_level_name = Config.LOG_LEVEL
_log_level = getattr(logging, _log_level_name, logging.INFO)
# Initialize base logging. basicConfig handles adding a StreamHandler to the root logger if none are present.
# We'll configure the formatter after basicConfig
logging.basicConfig(level=_log_level)
# Apply custom formatter to root logger's handlers
gunicorn_formatter = GunicornStyleFormatter()
for handler in logging.root.handlers:
    handler.setFormatter(gunicorn_formatter)
# Create a logger specific to this module
logger = logging.getLogger(__name__)

# Note: Boot diagnostics are emitted inside create_app() to ensure they're captured
# by Gunicorn's logging system. Module-level logs may be written before Gunicorn
# has initialized its logging infrastructure.

# Reduce noisy third-party loggers so we only see our explicit logs and exceptions
for _noisy_name in (
    "engineio",
    "engineio.server",
    "socketio",
    "socketio.server",
    "socketio.client",
):
    try:
        logging.getLogger(_noisy_name).setLevel(logging.WARNING)
    except Exception:
        # Logging tweaks should never break app startup
        pass


# Import and apply websocket patches
from .lib.websocket_patch import *  # noqa: F401,F403


# SQLite pragmas
# - This is only used for SQLite, and is not needed for other databases
# - We need this to ensure that the database is always in a consistent state
# - This is not a good solution, but it is a workaround for a known issue with SQLite
# - See https://github.com/wumbl3/ShareTube/issues/105 for more details
def configure_sqlite_pragmas() -> None:
    try:
        # Acquire the SQLAlchemy engine from the bound db
        eng = db.engine
        # Only apply these for sqlite dialect
        if eng.dialect.name != "sqlite":
            return
        # Open a transactional connection
        with eng.begin() as conn:
            try:
                # Enable WAL to improve concurrency
                conn.execute(db.text("PRAGMA journal_mode=WAL"))
            except Exception:
                # Ignore if not supported
                pass
            try:
                # Reduce sync level to NORMAL to balance durability and speed
                conn.execute(db.text("PRAGMA synchronous=NORMAL"))
            except Exception:
                pass
            try:
                # Increase busy timeout to mitigate lock errors
                conn.execute(db.text("PRAGMA busy_timeout=15000"))
            except Exception:
                pass
    except Exception:
        # Swallow all errors since these are best-effort tuning knobs
        pass


def get_user_id_from_auth_header() -> Optional[int]:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(
                token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
            )
            sub = payload.get("sub")
            return int(sub) if sub is not None else None
        except Exception:
            return None
    return None


# Application factory returning a configured Flask app
def create_app() -> Flask:
    # Create the Flask app instance
    app = Flask(__name__)
    # Ensure Flask's logger handlers also use our Gunicorn-style formatter
    gunicorn_formatter = GunicornStyleFormatter()
    for handler in app.logger.handlers:
        handler.setFormatter(gunicorn_formatter)
    # Also ensure root logger handlers still have the formatter (in case they were reset)
    for handler in logging.root.handlers:
        if not isinstance(handler.formatter, GunicornStyleFormatter):
            handler.setFormatter(gunicorn_formatter)
    # Load configuration from the Config class
    app.config.from_object(Config)
    # START_DEBUG_CONFIG_DUMP(logger, app)
    # Emit boot diagnostics after Gunicorn logging is fully initialized
    # Use Gunicorn's error logger if available, otherwise use app.logger
    try:
        # Try to use Gunicorn's logger first (it writes directly to errorlog)
        gunicorn_logger = logging.getLogger('gunicorn.error')
        if gunicorn_logger.handlers:
            boot_logger = gunicorn_logger
        else:
            boot_logger = app.logger
        
        boot_logger.info(
            "boot: version=%s app=%s log_level=%s pid=%s",
            Config.VERSION,
            Config.APP_NAME,
            Config.LOG_LEVEL,
            os.getpid(),
        )
        boot_logger.info("boot: db=%s", Config.SQLALCHEMY_DATABASE_URI)
        
        # Force flush all handlers to ensure logs are written immediately
        for handler in boot_logger.handlers:
            handler.flush()
        for handler in app.logger.handlers:
            handler.flush()
        for handler in logging.root.handlers:
            handler.flush()
        # Also flush stderr/stdout
        import sys
        if hasattr(sys.stderr, 'flush'):
            sys.stderr.flush()
        if hasattr(sys.stdout, 'flush'):
            sys.stdout.flush()
    except Exception:
        pass
    # Ensure Jinja picks up template changes without restart
    if app.config.get("TEMPLATES_AUTO_RELOAD", False):
        app.jinja_env.auto_reload = True
        app.config["TEMPLATES_AUTO_RELOAD"] = True
    # Enable Flask debug flag if requested (affects reloader when running via flask/cli)
    if app.config.get("DEBUG", False):
        app.config["DEBUG"] = True

    # Bind SQLAlchemy to the app
    db.init_app(app)
    # Resolve allowed origins from configuration for both Flask and Socket.IO
    origins_cfg = app.config["CORS_ORIGINS"]
    # A single '*' means allow all origins
    if origins_cfg.strip() == "*":
        allowed_origins = "*"
    else:
        # Split comma-separated list into an array of origins
        allowed_origins = [o.strip() for o in origins_cfg.split(",") if o.strip()]
    # Enable CORS for all routes using the allowed origins
    CORS(app, resources={r"/*": {"origins": allowed_origins, "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]}})
    # Initialize Socket.IO with the same CORS policy and optional message queue
    socketio.init_app(
        app,
        cors_allowed_origins=allowed_origins,
        message_queue=app.config.get("SOCKETIO_MESSAGE_QUEUE") or None,
        async_mode=app.config.get("SOCKETIO_ASYNC_MODE") or "gevent",
        logger=True,
        engineio_logger=True,
        ping_timeout=30,
        ping_interval=10,
    )
    try:
        app.logger.info(
            "SocketIO configured: async_mode=%s, message_queue=%s",
            socketio.async_mode,
            app.config.get("SOCKETIO_MESSAGE_QUEUE") or "(none)",
        )
    except Exception:
        pass

    # Perform database setup and migrations inside app context
    with app.app_context():
        # Ensure models are registered before create_all
        try:
            # Import models to register metadata with SQLAlchemy
            from .models import (  # noqa: F401
                User, Room, RoomMembership, RoomOperator, Queue, QueueEntry,
                RoomAudit, ChatMessage, YouTubeAuthor
            )
        except Exception:
            # Log but do not crash on models import failure at startup
            logging.exception("models import failed during startup")
        # Create schema if not present
        try:
            # Inspect current engine to see if core tables exist
            insp = inspect(db.engine)
            if "room" not in insp.get_table_names():
                logging.info("creating database schema (tables missing)")
                db.create_all()
        except Exception:
            # If inspection fails, attempt a blind create_all as a fallback
            logging.exception("schema inspection/create_all failed")
            try:
                db.create_all()
            except Exception:
                # If even that fails, continue; requests will re-verify
                pass
        try:
            # Execute any defined migrations and apply SQLite pragmas
            run_all_migrations(app)
            configure_sqlite_pragmas()
        except Exception:
            # Never prevent app from starting due to migration failure
            logging.exception("startup migration check failed")

    # Register HTTP routes and blueprints
    register_routes(app)

    # Return the fully configured application
    return app


# Helper to bind routes, request hooks, and error handlers
def register_routes(app: Flask) -> None:

    @app.route("/api/health")
    def index():
        return "Hello, World!"

    # Global error handler to ensure stacktraces get logged while preserving
    # the original HTTP status codes for Werkzeug HTTPException instances
    @app.errorhandler(Exception)
    def _log_unhandled_error(e):
        try:
            # Log both method and path for context
            logger.exception("UNHANDLED %s %s", request.method, request.path)
        except Exception:
            # If request context is broken, ignore
            pass

        # For HTTPException (e.g., 404 NotFound), return the original
        # exception so Flask can generate the appropriate response instead
        # of converting it into a 500 Internal Server Error.
        if isinstance(e, HTTPException):
            return e

        # For all other unexpected exceptions, let Flask treat this as a 500.
        # We return a generic 500 response here to avoid recursive error
        # handling while still surfacing an appropriate status code.
        return ("Internal Server Error", 500)

    try:
        # Auth endpoints for Google OAuth flow and JWT issuance
        from .views.api.auth import auth_bp

        app.register_blueprint(auth_bp)
    except Exception:
        logging.exception("auth blueprint import failed")
        # Auth is optional; log and continue without it
        pass

    try:
        from .views.ws.player import register_socket_handlers

        register_socket_handlers()
    except Exception:
        logging.exception("player socket handlers registration failed")

    try:
        from .views.ws.rooms import (
            rooms_bp,
            register_socket_handlers,
            start_heartbeat_if_needed,
        )

        app.register_blueprint(rooms_bp)
        register_socket_handlers()
        start_heartbeat_if_needed(app)
    except Exception:
        logging.exception("rooms blueprint import failed")

    try:
        from .views.ws.queue import register_socket_handlers

        register_socket_handlers()
    except Exception:
        logging.exception("queue socket handlers registration failed")

    # Register page blueprints
    try:
        from ui_portals.dashboard.backend import register_socket_handlers as register_dashboard_socket_handlers
        from ui_portals import dashboard_bp, dashboard_entry_bp, mobile_remote_bp, homepage_bp
        app.register_blueprint(dashboard_bp)
        app.register_blueprint(dashboard_entry_bp)
        app.register_blueprint(mobile_remote_bp)
        app.register_blueprint(homepage_bp)
        register_dashboard_socket_handlers()
        logging.info("Successfully registered page blueprints and dashboard socket handlers")
    except Exception:
        logging.exception("ui_portals registration failed")


# Create the Flask app instance for WSGI servers
app = create_app()
