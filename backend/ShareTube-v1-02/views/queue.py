from __future__ import annotations

from typing import Any
import logging

import json
import os
import time

from flask import current_app

from ..extensions import db, socketio

from ..models import QueueEntry, Room, Queue, YouTubeAuthor

from ..utils import (
    now_ms,
    build_watch_url,
    extract_video_id,
    fetch_video_meta,
    check_url,
    is_youtube_url,
)

from .decorators import require_room, require_queue_entry, ensure_queue
from .room_timeouts import schedule_starting_to_playing_timeout


def emit_queue_update_for_room(room: Room) -> None:
    if room.current_queue:
        socketio.emit(
            "queue.update", room.current_queue.to_dict(), room=f"room:{room.code}"
        )


def register_socket_handlers():
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

    @socketio.on("queue.remove")
    @require_room
    def _on_queue_remove(room: Room, user_id: int, data: dict):
        try:
            res, rej = Room.emit(room.code, trigger="queue.remove")
            id = (data or {}).get("id")
            if not id:
                return rej("queue.remove: no id provided")
            entry = (
                db.session.query(QueueEntry)
                .filter_by(id=id, added_by_id=user_id)
                .first()
            )
            if not entry:
                logging.warning(
                    "queue.remove: no entry found for id (id=%s) (user_id=%s)",
                    id,
                    user_id,
                )
                return rej("queue.remove: no entry found for id")
            entry.remove()
            db.session.refresh(room)
            socketio.emit(
                "queue.removed",
                {"id": id},
                room=f"room:{room.code}",
            )
            res("queue.remove.result", {"removed": True})
        except Exception:
            logging.exception(
                "queue.remove handler error (id=%s) (user_id=%s) (room=%s)",
                id,
                user_id,
                room.code,
            )

    @socketio.on("queue.requeue_to_top")
    @require_room
    @ensure_queue
    def _on_queue_requeue_to_top(room: Room, user_id: int, queue: Queue, data: dict):
        """
        Move a queue entry back to the front of the queue and reset its status to queued.

        The entry must belong to the current room's active queue and have been added by
        the current user (same permission model as queue.remove).
        """
        id = (data or {}).get("id")
        res, rej = Room.emit(room.code, trigger="queue.requeue_to_top")
        if not id:
            return rej("queue.requeue_to_top: no id provided")

        try:
            entry = (
                db.session.query(QueueEntry)
                .filter_by(id=id, queue_id=queue.id, added_by_id=user_id)
                .first()
            )
            if not entry:
                logging.warning(
                    "queue.requeue_to_top: no entry found for id (id=%s) (user_id=%s)",
                    id,
                    user_id,
                )
                return rej("queue.requeue_to_top: no entry found for id")

            # Determine a position that will sort before any existing queued entries.
            queued_entries = queue.query_entries_by_status("queued").all()
            if queued_entries:
                min_pos = min((e.position or 0) for e in queued_entries)
                new_pos = min_pos - 1
                if new_pos < 1:
                    new_pos = 1
            else:
                new_pos = 1

            entry.position = new_pos
            entry.status = "queued"
            db.session.commit()
            db.session.refresh(room)
            db.session.refresh(queue)
            socketio.emit(
                "queue.moved",
                {"id": entry.id, "position": entry.position, "status": entry.status},
                room=f"room:{room.code}",
            )
            res("queue.requeue_to_top.result", {"ok": True})
        except Exception:
            logging.exception(
                "queue.requeue_to_top handler error (id=%s) (user_id=%s) (room=%s)",
                id,
                user_id,
                room.code,
            )
            return rej("queue.requeue_to_top handler error")

    @socketio.on("queue.probe")
    @require_room
    @require_queue_entry
    def _on_queue_probe(
        room: Room, user_id: int, queue: Queue, current_entry: QueueEntry, data: dict
    ):
        res, rej = Room.emit(room.code, trigger="queue.probe")
        try:
            logging.info("[[[[[[queue.probe]]]]]]")

            if room.state == "starting":
                return rej("queue.probe: room.state is starting")

            if not current_entry.check_completion():
                return rej("queue.probe: video not completed")

            next_entry, error = room.complete_and_advance()
            if error:
                logging.warning("queue.probe: complete_and_advance error: %s", error)
                return rej(f"queue.probe: complete_and_advance error: {error}")
            if next_entry:
                res(
                    "room.playback",
                    {
                        "state": "starting",
                        "playing_since_ms": None,
                        "progress_ms": next_entry.progress_ms,
                        "current_entry": next_entry.to_dict(),
                        "actor_user_id": user_id,
                    },
                )
                # Fallback: if clients don't all report ready, auto-transition after 30s
                schedule_starting_to_playing_timeout(room.code, delay_seconds=30)
            else:
                res(
                    "room.playback",
                    {
                        "state": room.state,
                        "playing_since_ms": None,
                        "progress_ms": 0,
                        "current_entry": None,
                        "actor_user_id": user_id,
                        "queue_empty": True,
                    },
                )
            db.session.commit()
        except Exception as e:
            logging.exception("queue.probe handler error: %s", e)
            rej(f"queue.probe handler error: {e}")

    @socketio.on("queue.load-debug-list")
    @require_room
    @ensure_queue
    def _on_queue_load_debug_list(room: Room, user_id: int, queue: Queue, data: dict):
        # load the debug list from the testdata/queue.json file
        with open(
            os.path.join(current_app.root_path, ".test-data", "queue.json"), "r"
        ) as f:
            debug_queue = json.load(f)
        
        # Author fields to sync from JSON
        author_fields = [
            "title", "description", "custom_url", "country", "thumbnail_url",
            "published_at", "subscriber_count", "view_count", "video_count", "last_seen_ms"
        ]
        
        # Optional playback state fields
        playback_fields = ["playing_since_ms", "progress_ms", "paused_at"]
        
        # get the room and add the entries to the queue
        for i, entry_data in enumerate(debug_queue):
            # Handle youtube_author if present
            youtube_author = None
            if entry_data.get("youtube_author"):
                author_data = entry_data["youtube_author"]
                channel_id = author_data.get("channel_id")
                if channel_id:
                    # Get or create YouTubeAuthor
                    author = (
                        db.session.query(YouTubeAuthor)
                        .filter_by(channel_id=channel_id)
                        .first()
                    )
                    if not author:
                        author = YouTubeAuthor(
                            channel_id=channel_id,
                            title=author_data.get("title", "Unknown")
                        )
                        db.session.add(author)
                    
                    # Update author fields from JSON
                    for field in author_fields:
                        value = author_data.get(field)
                        if value is not None:
                            setattr(author, field, value)
                    if author_data.get("last_seen_ms") is None:
                        author.last_seen_ms = now_ms()
                    youtube_author = author
            
            entry = QueueEntry(
                queue_id=queue.id,
                added_by_id=entry_data.get("added_by_id", 1),
                url=entry_data["url"],
                video_id=entry_data["video_id"],
                title=entry_data["title"],
                thumbnail_url=entry_data["thumbnail_url"],
                position=entry_data.get("position", i + 1),
                status=entry_data.get("status", "queued"),
                watch_count=entry_data.get("watch_count", 0),
                duration_ms=entry_data["duration_ms"],
                youtube_author=youtube_author,
            )
            # Set optional playback state fields if present
            for field in playback_fields:
                if field in entry_data:
                    setattr(entry, field, entry_data[field])
            db.session.add(entry)
        db.session.commit()
        db.session.refresh(queue)
        emit_queue_update_for_room(room)
