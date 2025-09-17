import os
from datetime import timedelta

from dotenv import load_dotenv


load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    JWT_SECRET = os.getenv("JWT_SECRET", SECRET_KEY)
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///newapp.db")
    SQLALCHEMY_ECHO = os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true"
    BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:5100")

    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # Token settings
    ACCESS_TOKEN_EXPIRES = int(
        os.getenv("ACCESS_TOKEN_EXPIRES_SECONDS", str(int(timedelta(days=14).total_seconds())))
    )

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

    # YouTube
    YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

    # Diagnostics (opt-in)
    ENABLE_SYSTEM_STATS = os.getenv("ENABLE_SYSTEM_STATS", "false").lower() == "true"


