from __future__ import annotations

from typing import Any, Optional
import logging

import json
import os

from flask import current_app

from ..extensions import db, socketio
from ..models import Queue as QueueModel, QueueEntry, Room, RoomMembership
from ..utils import (
    build_watch_url,
    commit_with_retry,
    extract_video_id,
    fetch_video_meta,
)
from ..sockets import get_user_id_from_socket


def _get_active_room_for_user(user_id: int) -> Optional[Room]:
    membership = (
        db.session.query(RoomMembership)
        .filter_by(user_id=user_id, active=True)
        .order_by(RoomMembership.last_seen.desc())
        .first()
    )
    if not membership:
        return None
    room = db.session.get(Room, membership.room_id)
    return room


def emit_queue_update_for_room(room: Room) -> None:
    if q := db.session.query(QueueModel).filter_by(room_id=room.id).first():
        socketio.emit("queue.update", q.to_dict(), room=f"room:{room.code}")


def register_socket_handlers():
    @socketio.on("queue.add")
    def _on_enqueue_url(data):
        try:
            user_id = get_user_id_from_socket()
            if not user_id:
                return
            url = ((data or {}).get("url") or "").strip()
            if not url:
                return
            room = _get_active_room_for_user(user_id)
            if not room:
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

            queue = room.current_queue

            # Compute next position
            last = (
                db.session.query(QueueEntry)
                .filter_by(queue_id=queue.id)
                .order_by(QueueEntry.position.desc())
                .first()
            )
            next_pos = (
                (last.position if last and last.position else 0) + 1 if last else 1
            )

            entry = QueueEntry(
                queue_id=queue.id,
                added_by_id=user_id,
                url=canonical_url,
                video_id=vid,
                title=meta.get("title") or "",
                thumbnail_url=meta.get("thumbnail_url") or "",
                position=next_pos,
                status="queued",
                duration_ms=meta.get("duration_ms") or 0,
            )
            db.session.add(entry)
            commit_with_retry(db.session)

            # Broadcast updated queue to room participants
            emit_queue_update_for_room(room)
        except Exception:
            logging.exception("queue.add handler error")

    @socketio.on("queue.remove")
    def _on_queue_remove(data):
        try:
            user_id = get_user_id_from_socket()
            if not user_id:
                return
            room = _get_active_room_for_user(user_id)
            if not room:
                return
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
            entry.status = "deleted"
            commit_with_retry(db.session)
            emit_queue_update_for_room(room)
        except Exception:
            logging.exception(
                "queue.remove handler error (id=%s) (user_id=%s) (room=%s)",
                id,
                user_id,
                room.code,
            )

    @socketio.on("queue.load-debug-list")
    def _on_queue_load_debug_list(data):
        # load the debug list from the testdata/queue.json file
        with open(
            os.path.join(current_app.root_path, "testdata", "queue.json"), "r"
        ) as f:
            debug_queue = json.load(f)
        # get the room and add the entries to the queue
        user_id = get_user_id_from_socket()
        if not user_id:
            return
        room = _get_active_room_for_user(user_id)
        if not room:
            return
        queue = room.current_queue
        for i, entry in enumerate[Any](debug_queue):
            entry = QueueEntry(
                queue_id=queue.id,
                added_by_id=1,
                url=entry["url"],
                video_id=entry["video_id"],
                title=entry["title"],
                thumbnail_url=entry["thumbnail_url"],
                position=i + 1,
                status=entry["status"],
                watch_count=entry["watch_count"],
                duration_ms=entry["duration_ms"],
            )
            db.session.add(entry)
        db.session.commit()
        db.session.refresh(queue)
        emit_queue_update_for_room(room)
