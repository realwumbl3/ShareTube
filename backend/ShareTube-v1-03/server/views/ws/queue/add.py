from __future__ import annotations

import logging

from ....extensions import socketio
from ....models import Queue, Room, YouTubeAuthor
from ....lib.utils import (
    build_watch_url,
    check_url,
    extract_video_id,
    fetch_video_meta,
    is_youtube_url,
)
from ...middleware import ensure_queue, require_room


def register() -> None:
    @socketio.on("queue.add")
    @require_room
    @ensure_queue
    def _on_enqueue_url(room: Room, user_id: int, queue: Queue, data: dict):
        try:
            res, rej = Room.emit(room.code, trigger="queue.add")
            url = ((data or {}).get("url") or "").strip()
            if not check_url(url):
                return rej("queue.add: invalid url")
            if not is_youtube_url(url):
                return rej("queue.add: not a youtube url")
            vid = extract_video_id(url)

            if not vid:
                logging.warning("queue.add: no video id found in url (url=%s)", url)
                return rej("queue.add: no video id found in url")

            canonical_url = build_watch_url(vid) if vid else url
            meta = fetch_video_meta(vid)
            if not meta:
                return rej("queue.add: no metadata found for video")
            author = YouTubeAuthor.get_or_create_from_video_meta(meta)

            entry = queue.add_entry(
                user_id=user_id,
                url=canonical_url,
                video_id=vid,
                title=meta.get("title") or "",
                thumbnail_url=meta.get("thumbnail_url") or "",
                duration_ms=meta.get("duration_ms") or 0,
                youtube_author=author,
            )
            socketio.emit(
                "queue.added",
                {"item": entry.to_dict()},
                room=f"room:{room.code}",
            )
            res("queue.add.result", {"added": True})
        except Exception:
            logging.exception("queue.add handler error")

