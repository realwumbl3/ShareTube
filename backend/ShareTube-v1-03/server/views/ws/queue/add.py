from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....models import Queue, QueueEntry, Room, YouTubeAuthor
from ....lib.utils import (
    build_watch_url,
    check_url,
    extract_video_id,
    fetch_video_meta,
    fetch_youtube_channel_meta,
    is_youtube_url,
    commit_with_retry,
    now_ms,
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

            author = None
            channel_id = meta.get("channel_id")
            if channel_id:
                author = (
                    db.session.query(YouTubeAuthor)
                    .filter_by(channel_id=channel_id)
                    .first()
                )
                if not author:
                    author = YouTubeAuthor(
                        channel_id=channel_id,
                        title=meta.get("channel_title") or "Unknown",
                    )
                    db.session.add(author)

                channel_title = meta.get("channel_title")
                if channel_title and channel_title != author.title:
                    author.title = channel_title

                channel_meta = fetch_youtube_channel_meta(channel_id)
                if channel_meta:
                    title = channel_meta.get("title")
                    if title:
                        author.title = title

                    author.description = channel_meta.get("description") or author.description
                    author.custom_url = channel_meta.get("custom_url") or author.custom_url
                    author.country = channel_meta.get("country") or author.country
                    author.thumbnail_url = channel_meta.get("thumbnail_url") or author.thumbnail_url
                    author.published_at = channel_meta.get("published_at") or author.published_at

                    stats = {
                        "subscriber_count": channel_meta.get("subscriber_count"),
                        "view_count": channel_meta.get("view_count"),
                        "video_count": channel_meta.get("video_count"),
                    }
                    for attr, value in stats.items():
                        if value is not None:
                            setattr(author, attr, value)

                    raw_response = channel_meta.get("raw_response")
                    if raw_response:
                        author.raw_response = raw_response

                if author:
                    author.last_seen_ms = now_ms()

            last_entry = (
                db.session.query(QueueEntry)
                .filter_by(queue_id=queue.id)
                .order_by(QueueEntry.position.desc())
                .first()
            )
            next_position = (last_entry.position + 1) if (last_entry and last_entry.position) else 1

            entry = QueueEntry(
                queue_id=queue.id,
                added_by_id=user_id,
                url=canonical_url,
                video_id=vid,
                title=meta.get("title") or "",
                thumbnail_url=meta.get("thumbnail_url") or "",
                position=next_position,
                status="queued",
                duration_ms=meta.get("duration_ms") or 0,
                youtube_author=author,
            )
            db.session.add(entry)
            commit_with_retry(db.session)
            socketio.emit(
                "queue.added",
                {"item": entry.to_dict()},
                room=f"room:{room.code}",
            )
            res("queue.add.result", {"added": True})
        except Exception:
            logging.exception("queue.add handler error")

