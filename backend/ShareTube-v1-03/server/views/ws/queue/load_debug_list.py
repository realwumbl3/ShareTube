from __future__ import annotations

from typing import Any

import json
import os

from flask import current_app

from ....extensions import db, socketio
from ....models import QueueEntry, YouTubeAuthor
from ....lib.utils import now_ms
from ...middleware import ensure_queue, require_room
from .common import emit_queue_update_for_room


def register() -> None:
    @socketio.on("queue.load-debug-list")
    @require_room
    @ensure_queue
    def _on_queue_load_debug_list(room, user_id, queue, data):
        with open(
            os.path.join(current_app.root_path, ".tests", ".test-data", "queue.json"),
            "r",
        ) as f:
            debug_queue = json.load(f)

        author_fields = [
            "title",
            "description",
            "custom_url",
            "country",
            "thumbnail_url",
            "published_at",
            "subscriber_count",
            "view_count",
            "video_count",
            "last_seen_ms",
        ]

        playback_fields = ["playing_since_ms", "progress_ms", "paused_at"]

        for i, entry_data in enumerate[dict[str, Any]](debug_queue):
            youtube_author = None
            if entry_data.get("youtube_author"):
                author_data = entry_data["youtube_author"]
                channel_id = author_data.get("channel_id")
                if channel_id:
                    author = (
                        db.session.query(YouTubeAuthor)
                        .filter_by(channel_id=channel_id)
                        .first()
                    )
                    if not author:
                        author = YouTubeAuthor(
                            channel_id=channel_id,
                            title=author_data.get("title", "Unknown"),
                        )
                        db.session.add(author)

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
            for field in playback_fields:
                if field in entry_data:
                    setattr(entry, field, entry_data[field])
            db.session.add(entry)
        db.session.commit()
        db.session.refresh(queue)
        emit_queue_update_for_room(room)

