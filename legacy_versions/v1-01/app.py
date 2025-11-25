# Future annotations for forward reference typing compatibility
from __future__ import annotations

# Standard lib imports for timing and logging, and SQLAlchemy inspector for schema checks
import time
from typing import Optional
from sqlalchemy import inspect
import logging

# Flask primitives for creating the app and request-scoped utilities
from flask import Flask, request, g, current_app

import jwt

# Enable Cross-Origin Resource Sharing for API and Socket.IO
from flask_cors import CORS

# Import configuration object
from .config import Config

# Import shared Flask extensions (SQLAlchemy and SocketIO)
from .extensions import db, socketio

# Import migrations runner (currently placeholder)
from .migrations import run_all_migrations

# Configure a standard log format for file and console handlers
log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
# Initialize base logging with INFO level so our explicit logging.info calls show up
logging.basicConfig(level=logging.INFO, format=log_format)
# Create a logger specific to this module
logger = logging.getLogger(__name__)
# Also emit to console for systemd/journald visibility
try:
    # Create a console handler
    _console = logging.StreamHandler()
    # Set console threshold to INFO
    _console.setLevel(logging.INFO)
    # Apply same formatter to console logs
    _console.setFormatter(logging.Formatter(log_format))
    # Get root logger to attach handler only once
    root = logging.getLogger()
    # Avoid duplicate handlers by checking existing ones
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        root.addHandler(_console)
except Exception:
    # Never fail startup due to logging configuration problems
    pass

# Reduce noisy third-party loggers so we only see our explicit INFO logs and exceptions
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
    # Load configuration from the Config class
    app.config.from_object(Config)
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
    CORS(app, resources={r"/*": {"origins": allowed_origins}})
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
            from . import models  # noqa: F401
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

    # # Before each request, capture start time and log basic request info
    # @app.before_request
    # def _log_request_start():
    #     try:
    #         # Record the request start time in g for duration calculation
    #         g._req_start_ts = time.time()
    #         # Extract select headers for debugging
    #         ua = request.headers.get("User-Agent", "-")
    #         ref = request.headers.get("Referer", "-")
    #         # Decode query string for logging
    #         qs = (
    #             request.query_string.decode("utf-8", errors="ignore")
    #             if request.query_string
    #             else ""
    #         )
    #         # # Log a single-line request summary
    #         logger.info(
    #             "REQ %s %s ip=%s ua=%s ref=%s qs=%s clen=%s",
    #             request.method,
    #             request.path,
    #             request.remote_addr,
    #             ua,
    #             ref,
    #             qs[:512],
    #             request.headers.get("Content-Length", "0"),
    #         )
    #         # One-time schema verification in case app init path was bypassed
    #         try:
    #             if not getattr(g, "_schema_verified_once", False):
    #                 # Inspect engine tables and create if missing
    #                 insp = inspect(db.engine)
    #                 if "room" not in insp.get_table_names():
    #                     logging.info("verifying schema (on request): creating tables")
    #                     db.create_all()
    #                 # Remember we verified once during this process lifetime
    #                 g._schema_verified_once = True
    #         except Exception:
    #             # Avoid breaking requests due to schema verification errors
    #             logging.exception("request-time schema verify failed")
    #     except Exception:
    #         # Never raise from request start hook
    #         pass

    # # After each request, log the response code and duration
    # @app.after_request
    # def _log_request_end(resp):
    #     try:
    #         # Compute duration in milliseconds using start ts stored in g
    #         dur_ms = int(
    #             (time.time() - (getattr(g, "_req_start_ts", time.time()))) * 1000
    #         )
    #         # Log a compact response summary
    #         logger.info(
    #             "RESP %s %s %s %dms",
    #             request.method,
    #             request.path,
    #             resp.status_code,
    #             dur_ms,
    #         )
    #     except Exception:
    #         # Swallow errors from logging
    #         pass
    #     # Always return the original response
    #     return resp

    # Global error handler to ensure stacktraces get logged
    @app.errorhandler(Exception)
    def _log_unhandled_error(e):
        try:
            # Log both method and path for context
            logger.exception("UNHANDLED %s %s", request.method, request.path)
        except Exception:
            # If request context is broken, ignore
            pass
        # Re-raise after logging to let Flask generate the default 500
        raise e

    try:
        # Auth endpoints for Google OAuth flow and JWT issuance
        from .views.auth import auth_bp

        app.register_blueprint(auth_bp)
    except Exception:
        logging.exception("auth blueprint import failed")
        # Auth is optional; log and continue without it
        pass

    try:
        from .views.player import register_socket_handlers

        register_socket_handlers()
    except Exception:
        logging.exception("player socket handlers registration failed")

    try:
        from .views.rooms import rooms_bp, register_socket_handlers

        app.register_blueprint(rooms_bp)
        register_socket_handlers()
    except Exception:
        logging.exception("rooms blueprint import failed")

    try:
        from .views.queue import register_socket_handlers

        register_socket_handlers()
    except Exception:
        logging.exception("queue socket handlers registration failed")


# Instantiate the application at import time for WSGI servers
app = create_app()
