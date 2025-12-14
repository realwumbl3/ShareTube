# Enable postponed annotations for forward references
from __future__ import annotations

# Regular expressions for parsing, time utility alias, sqlite error class, HTTP requests, and Flask app access
import logging
import re
import sqlite3
import requests
from flask import current_app
from sqlalchemy.exc import OperationalError as SAOperationalError
import time



def check_url(url: str) -> bool:
    """Validate that the URL is well-formed and safe to process."""
    if not url or not isinstance(url, str):
        return False
    # Arbitrary reasonable length limit
    if len(url) > 2048:
        return False
    # Reject control characters
    if re.search(r"[\x00-\x1f\x7f]", url):
        return False
    # Must start with http:// or https://
    if not re.match(r"^https?://", url, re.IGNORECASE):
        return False
    return True


def is_youtube_url(url: str) -> bool:
    """Check if the URL belongs to a valid YouTube domain."""
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()

        if host == "youtu.be":
            return True

        if host == "youtube.com" or host.endswith(".youtube.com"):
            return True

        return False
    except Exception:
        return False


# Extract a YouTube video id from either a URL or a raw id-like string
def extract_video_id(value: str) -> str:
    try:
        # Parse the URL to handle various YouTube formats
        from urllib.parse import urlparse, parse_qs

        u = urlparse(value)
        # Normalize host for matching
        host = (u.hostname or "").replace("www.", "")
        # Short youtu.be links carry the id in the path
        if host == "youtu.be":
            vid = u.path.lstrip("/")
            return vid or ""
        # Full youtube.com links
        if host.endswith("youtube.com"):
            # Shorts URLs carry the id in the path like /shorts/{id}
            if u.path.startswith("/shorts/"):
                parts = u.path.split("/")
                return (parts[2] if len(parts) > 2 else "") or ""
            # Standard watch URLs store id in query param v
            q = parse_qs(u.query)
            v = (q.get("v") or [""])[0]
            if v:
                return v
    except Exception:
        # Fall back to regex if URL parsing fails
        pass
    # Last resort: find any 11-char YouTube id-like token
    m = re.search(r"[a-zA-Z0-9_-]{11}", value or "")
    return m.group(0) if m else ""


# Construct a canonical YouTube watch URL from a video id
def build_watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


# Fetch basic metadata for a video using oEmbed, then optionally refine using YouTube Data API
def fetch_video_meta(video_id: str) -> dict:
    # Defaults if lookups fail
    title = ""
    thumb = ""
    duration_ms: int | None = None
    try:
        # Use YouTube Data API for duration and better thumbnails if a key is configured
        api_key = current_app.config.get("YOUTUBE_API_KEY", "")
        if api_key:
            r2 = requests.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "id": video_id,
                    "part": "snippet,contentDetails",
                    "key": api_key,
                },
                timeout=8,
            )
            if r2.status_code == 200:
                data = r2.json()
                for key, value in data.items():
                    print(key, value)
                items = data.get("items") or []
                if len(items) == 0:
                    current_app.logger.warning(
                        "fetch_video_meta: no items found in YouTube Data API response (video_id=%s) (status_code=%s)",
                        video_id,
                        r2.status_code,
                    )
                    return None
                sn = items[0].get("snippet", {})
                thumbs = sn.get("thumbnails", {})
                # Prefer higher-resolution thumbnails when available
                best = (
                    thumbs.get("maxres")
                    or thumbs.get("standard")
                    or thumbs.get("high")
                    or thumbs.get("medium")
                    or thumbs.get("default")
                    or {}
                )
                title = sn.get("title") or title
                thumb = best.get("url") or thumb
                channel_id = sn.get("channelId", "")
                channel_title = sn.get("channelTitle", "")
                try:
                    # Parse ISO 8601 duration to milliseconds
                    cd = items[0].get("contentDetails", {})
                    iso = cd.get("duration") or ""
                    m = re.match(
                        r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$", iso
                    )
                    if m:
                        hours = int(m.group(1) or 0)
                        minutes = int(m.group(2) or 0)
                        seconds = float(m.group(3) or 0)
                        return {
                            "title": title or "",
                            "thumbnail_url": thumb or "",
                            "duration_ms": int(
                                ((hours * 3600) + (minutes * 60) + seconds) * 1000
                            ),
                            "channel_id": channel_id,
                            "channel_title": channel_title,
                            "channel_url": (
                                f"https://www.youtube.com/channel/{channel_id}"
                                if channel_id
                                else ""
                            ),
                            "video_description": sn.get("description") or "",
                            "video_published_at": sn.get("publishedAt"),
                        }
                except Exception:
                    current_app.logger.exception(
                        "fetch_video_meta: error parsing duration (video_id=%s)",
                        video_id,
                    )
                    return None
    except Exception:
        current_app.logger.exception(
            "fetch_video_meta: error getting video metadata (video_id=%s) (status_code=%s)",
            video_id,
            r2.status_code,
        )
        return None


def fetch_youtube_channel_meta(channel_id: str) -> dict | None:
    """Fetch extra metadata for a YouTube channel using the Data API."""

    def _safe_int(value: str | int | None) -> int | None:
        try:
            if value is None:
                return None
            return int(value)
        except (TypeError, ValueError):
            return None

    api_key = current_app.config.get("YOUTUBE_API_KEY", "")
    if not api_key or not channel_id:
        return None

    try:
        response = requests.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={
                "id": channel_id,
                "part": "snippet,statistics",
                "key": api_key,
            },
            timeout=8,
        )
        if response.status_code != 200:
            current_app.logger.warning(
                "fetch_youtube_channel_meta: "
                "non-200 response for channel_id=%s (status_code=%s)",
                channel_id,
                response.status_code,
            )
            return None

        data = response.json()
        items = data.get("items") or []
        if not items:
            current_app.logger.warning(
                "fetch_youtube_channel_meta: no channel items for channel_id=%s",
                channel_id,
            )
            return None

        item = items[0]
        snippet = item.get("snippet", {})
        stats = item.get("statistics", {})
        thumbnails = snippet.get("thumbnails", {}) or {}
        best_thumb = (
            thumbnails.get("maxres")
            or thumbnails.get("high")
            or thumbnails.get("medium")
            or thumbnails.get("default")
            or {}
        )

        return {
            "channel_id": channel_id,
            "title": snippet.get("title"),
            "description": snippet.get("description"),
            "custom_url": snippet.get("customUrl"),
            "country": snippet.get("country"),
            "published_at": snippet.get("publishedAt"),
            "thumbnail_url": best_thumb.get("url"),
            "subscriber_count": _safe_int(stats.get("subscriberCount")),
            "view_count": _safe_int(stats.get("viewCount")),
            "video_count": _safe_int(stats.get("videoCount")),
            "raw_response": item,
        }
    except Exception:
        current_app.logger.exception(
            "fetch_youtube_channel_meta: error fetching metadata for channel_id=%s",
            channel_id,
        )
        return None


# Return current epoch time in milliseconds
def now_ms() -> int:
    return int(time.time() * 1000)


# Commit a SQLAlchemy session with retries to mitigate SQLite 'database is locked' errors
def commit_with_retry(
    session, retries: int = 5, initial_delay: float = 0.05, backoff: float = 2.0
) -> None:
    """Commit the SQLAlchemy session with retries for SQLite 'database is locked'.

    Rolls back between attempts and uses exponential backoff.
    """
    # Start with the initial delay between attempts
    delay = float(initial_delay)
    # Keep last exception to raise if all retries fail
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            # Attempt to commit
            session.commit()
            return
        except (sqlite3.OperationalError, SAOperationalError) as e:
            # Only retry for lock-related errors
            msg = str(e).lower()
            if "database is locked" not in msg:
                # Not a lock condition; bubble up
                raise
            try:
                # Roll back before retrying
                session.rollback()
            except Exception:
                pass
            # Sleep before next attempt and increase delay exponentially
            time.sleep(delay)
            delay *= backoff
            last_exc = e
        except Exception as e:  # other errors: rollback and re-raise
            try:
                session.rollback()
            except Exception:
                pass
            # Re-raise unexpected exceptions
            raise
    # If we exhausted retries, re-raise the last lock error to the caller
    if last_exc:
        raise last_exc


def flush_with_retry(
    session, retries: int = 5, initial_delay: float = 0.05, backoff: float = 2.0
) -> None:
    """Flush the SQLAlchemy session with retries for SQLite lock contention."""
    delay = float(initial_delay)
    last_exc: Exception | None = None
    for _ in range(retries):
        try:
            session.flush()
            return
        except (sqlite3.OperationalError, SAOperationalError) as e:
            msg = str(e).lower()
            if "database is locked" not in msg:
                raise
            try:
                session.rollback()
            except Exception:
                pass
            time.sleep(delay)
            delay *= backoff
            last_exc = e
        except Exception:
            try:
                session.rollback()
            except Exception:
                pass
            raise
    if last_exc:
        raise last_exc


def get_redis_client():
    """
    Get a Redis client using the same connection as SocketIO message queue.
    Returns None if Redis is not configured.
    """
    try:
        import redis
    except ImportError:
        logging.warning("redis module not available, Redis-based features will not work across processes")
        return None

    message_queue_url = current_app.config.get("SOCKETIO_MESSAGE_QUEUE", "")
    if not message_queue_url:
        logging.warning("SOCKETIO_MESSAGE_QUEUE not configured, Redis-based features will not work across processes")
        return None

    try:
        # Parse Redis URL (format: redis://host:port/db or redis://:password@host:port/db)
        from urllib.parse import urlparse
        parsed = urlparse(message_queue_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        db_num = 0
        if parsed.path:
            try:
                db_num = int(parsed.path.lstrip("/"))
            except ValueError:
                pass

        password = parsed.password if parsed.password else None

        redis_client = redis.Redis(
            host=host,
            port=port,
            db=db_num,
            password=password,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        # Test connection
        redis_client.ping()
        return redis_client
    except Exception as e:
        logging.warning(f"Failed to connect to Redis: {e}")
        return None
