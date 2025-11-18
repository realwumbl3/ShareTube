from __future__ import annotations

from typing import Any
import logging

import json
import os
import time

from flask import current_app

from ..extensions import db, socketio

from ..models import QueueEntry, Room

from ..utils import (
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
    def _on_enqueue_url(room, user_id, queue, data):
        try:
            url = ((data or {}).get("url") or "").strip()
            if not url:
                return

            # Normalize URL and fetch lightweight metadata
            vid = extract_video_id(url)

            if not vid:
                logging.warning("queue.add: no video id found in url (url=%s)", url)
                return

            canonical_url = build_watch_url(vid) if vid else url
            meta = fetch_video_meta(vid)
            if not meta:
                logging.warning(
                    "queue.add: no metadata found for video (url=%s, video_id=%s)",
                    url,
                    vid,
                )
                return

            # Add entry using model method
            queue.add_entry(
                user_id=user_id,
                url=canonical_url,
                video_id=vid,
                title=meta.get("title") or "",
                thumbnail_url=meta.get("thumbnail_url") or "",
                duration_ms=meta.get("duration_ms") or 0,
            )

            # Broadcast updated queue to room participants
            emit_queue_update_for_room(room)
        except Exception:
            logging.exception("queue.add handler error")

    @socketio.on("queue.remove")
    @require_room
    def _on_queue_remove(room, user_id, data):
        try:
            id = (data or {}).get("id")
            if not id:
                return
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
                return
            entry.remove()
            emit_queue_update_for_room(room)
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
    def _on_queue_probe(room, user_id, queue, current_entry, data):
        try:
            logging.info("[[[[[[queue.probe]]]]]]")

            # Skip completion check if room is in "starting" state - video hasn't started playing yet
            if room.state == "starting":
                logging.info(
                    "[[[[[[queue.probe: room in starting state, skipping completion check]]]]]]"
                )
                return

            now_ms = int(time.time() * 1000)

            # Check completion using model method
            if not current_entry.check_completion(now_ms):
                return

            # Complete current entry and advance to next using model method
            next_entry = room.complete_and_advance()
            if not next_entry:
                logging.info("[[[[[[queue.probe: no next entry]]]]]]")
                return

            logging.info(f"current_entry: {current_entry.to_dict()}")
            logging.info(f"next_entry: {next_entry.to_dict()}")

            db.session.commit()
            db.session.refresh(room)
            db.session.refresh(queue)
            db.session.refresh(next_entry)

            socketio.emit(
                "room.playback",
                {
                    "code": room.code,
                    "state": "starting",
                    "playing_since_ms": None,
                    "progress_ms": next_entry.progress_ms,
                    "current_entry": next_entry.to_dict(),
                    "actor_user_id": user_id,
                },
                room=f"room:{room.code}",
            )
            emit_queue_update_for_room(room)

            # Schedule timeout to transition from starting to playing after 15 seconds
            schedule_starting_to_playing_timeout(room.code, delay_seconds=15)
        except Exception:
            logging.exception("queue.probe handler error")

    @socketio.on("queue.load-debug-list")
    @require_room
    @ensure_queue
    def _on_queue_load_debug_list(room, user_id, queue, data):
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
