# Enable postponed annotations for forward references
from __future__ import annotations

# Regular expressions for parsing, time utility alias, sqlite error class, HTTP requests, and Flask app access
import re
import time as _time
import sqlite3
import requests
from flask import current_app
from sqlalchemy.exc import OperationalError as SAOperationalError


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


# Return current epoch time in milliseconds
def now_ms() -> int:
    import time

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
            _time.sleep(delay)
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
