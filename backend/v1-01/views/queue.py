from __future__ import annotations

from typing import Any
import logging

import json
import os
import time

from flask import current_app

from ..extensions import db, socketio

from ..models import QueueEntry, Room, Queue

from ..utils import (
    now_ms,
    build_watch_url,
    extract_video_id,
    fetch_video_meta,
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
            if not url:
                return rej("queue.add: no url provided")
            vid = extract_video_id(url)

            if not vid:
                logging.warning("queue.add: no video id found in url (url=%s)", url)
                return rej("queue.add: no video id found in url")

            canonical_url = build_watch_url(vid) if vid else url
            meta = fetch_video_meta(vid)
            if not meta:
                return rej("queue.add: no metadata found for video")

            queue.add_entry(
                user_id=user_id,
                url=canonical_url,
                video_id=vid,
                title=meta.get("title") or "",
                thumbnail_url=meta.get("thumbnail_url") or "",
                duration_ms=meta.get("duration_ms") or 0,
            )
            emit_queue_update_for_room(room)
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
            emit_queue_update_for_room(room)
            res("queue.remove.result", {"removed": True})
        except Exception:
            logging.exception(
                "queue.remove handler error (id=%s) (user_id=%s) (room=%s)",
                id,
                user_id,
                room.code,
            )

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
                schedule_starting_to_playing_timeout(room.code, delay_seconds=15)
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
        # get the room and add the entries to the queue
        for i, entry_data in enumerate[Any](debug_queue):
            entry = QueueEntry(
                queue_id=queue.id,
                added_by_id=1,
                url=entry_data["url"],
                video_id=entry_data["video_id"],
                title=entry_data["title"],
                thumbnail_url=entry_data["thumbnail_url"],
                position=i + 1,
                status=entry_data["status"],
                watch_count=entry_data["watch_count"],
                duration_ms=entry_data["duration_ms"],
            )
            db.session.add(entry)
        db.session.commit()
        db.session.refresh(queue)
        emit_queue_update_for_room(room)
