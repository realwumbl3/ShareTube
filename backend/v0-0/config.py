# Import the standard library module used for environment variables and filesystem paths
import os

# Import timedelta to compute durations in seconds for token expiry
from datetime import timedelta

# Import helper to load environment variables from a .env file
from dotenv import load_dotenv


# Load variables from a .env file into process environment if present
load_dotenv()


# Define a configuration holder class for the Flask application
class Config:
    # Secret key used by Flask and extensions (sessions, CSRF, etc.); falls back to a dev value
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")

    VERSION = os.getenv("VERSION", "v1")
    APP_NAME = os.getenv("APP_NAME", "ShareTube")

    print(f"VERSION: {VERSION}")
    print(f"APP_NAME: {APP_NAME}")

    # JWT signing secret; defaults to SECRET_KEY if not explicitly provided
    JWT_SECRET = os.getenv("JWT_SECRET", SECRET_KEY)
    # Prefer absolute DB path under instance/ directory at repo root for SQLite
    _ROOT = os.path.abspath(
        os.path.join(os.path.dirname(__file__), os.pardir, os.pardir)
    )
    # Default SQLAlchemy URI pointing to a sqlite database stored in instance/VERSION/APP_NAME.db
    _DB_DEFAULT = (
        f"sqlite:///{os.path.join(_ROOT, 'instance', VERSION, f'{APP_NAME}.db')}"
    )

    print(f"_DB_DEFAULT: {_DB_DEFAULT}")

    # Database URL taken from env when present, otherwise fallback to default
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", _DB_DEFAULT)
    # When true, echo SQL statements to logs for debugging
    SQLALCHEMY_ECHO = os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true"
    # Public base URL where this backend is reachable (used for OAuth redirects)
    BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "https://sharetube.wumbl3.xyz")

    # Google OAuth client identifier (optional; required for Google login)
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    # Google OAuth client secret (optional; required for Google login)
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # Access token expiry in seconds; defaults to 14 days if not overridden
    ACCESS_TOKEN_EXPIRES = int(
        os.getenv(
            "ACCESS_TOKEN_EXPIRES_SECONDS", str(int(timedelta(days=14).total_seconds()))
        )
    )

    # Comma-separated list of CORS origins; '*' means allow all
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

    # Optional YouTube Data API key to enrich metadata
    YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

    # Socket.IO message queue DSN (e.g., Redis) for multi-process broadcast support (optional)
    SOCKETIO_MESSAGE_QUEUE = os.getenv("SOCKETIO_MESSAGE_QUEUE", "")
    # Socket.IO async mode override (e.g., 'gevent', 'eventlet'); empty means default
    SOCKETIO_ASYNC_MODE = os.getenv("SOCKETIO_ASYNC_MODE", "")

    # Enable periodic system diagnostics emission over sockets when true
    ENABLE_SYSTEM_STATS = os.getenv("ENABLE_SYSTEM_STATS", "false").lower() == "true"

    # Development toggles controlling Flask/Jinja template auto-reload and debug behavior
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    TEMPLATES_AUTO_RELOAD = os.getenv("TEMPLATES_AUTO_RELOAD", "true").lower() == "true"
