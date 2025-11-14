from __future__ import annotations

from typing import Any, Optional
import logging

import json
import os
import time

from flask import current_app

from ..extensions import db, socketio

from ..models import Queue, QueueEntry, Room, RoomMembership

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
    if q := db.session.query(Queue).filter_by(room_id=room.id).first():
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

    @socketio.on("queue.probe")
    def _on_queue_probe(_data):
        try:
            logging.info("[[[[[[queue.probe]]]]]]")
            user_id = get_user_id_from_socket()
            if not user_id:
                return
            room = _get_active_room_for_user(user_id)
            if not room or not room.current_queue:
                return
            queue = room.current_queue
            current_entry = queue.current_entry
            if not current_entry:
                return

            now_ms = int(time.time() * 1000)
            base_progress_ms = current_entry.progress_ms or 0
            elapsed_ms = (
                max(0, now_ms - int(current_entry.playing_since_ms))
                if current_entry.playing_since_ms
                else 0
            )
            effective_progress_ms = base_progress_ms + elapsed_ms
            duration_ms = max(0, int(current_entry.duration_ms or 0))

            if duration_ms <= 0:
                return

            near_end = max(0, duration_ms - 2000)

            is_complete = effective_progress_ms >= near_end

            logging.info(f"near_end: {near_end}")
            logging.info(f"effective_progress_ms: {effective_progress_ms}")
            logging.info(f"is_complete: {is_complete}")

            if not is_complete:
                return

            entries = (
                db.session.query(QueueEntry)
                .filter_by(queue_id=queue.id)
                .order_by(QueueEntry.position.asc())
                .all()
            )
            if not entries:
                logging.info("[[[[[[queue.probe: no entries]]]]]]")
                return

            cur_idx = next(
                (
                    i
                    for i, e in enumerate[QueueEntry](entries)
                    if e.id == current_entry.id
                ),
                -1,
            )
            if cur_idx < 0:
                logging.info("[[[[[[queue.probe: no current entry]]]]]]")
                return

            next_idx = (cur_idx + 1) % len(entries)
            next_entry = entries[next_idx]
            
            logging.info(f"current_entry: {current_entry.to_dict()}")
            logging.info(f"next_entry: {next_entry.to_dict()}")

            # Mark current as watched and move to tail
            current_entry.watch_count = (current_entry.watch_count or 0) + 1
            current_entry.progress_ms = 0
            current_entry.playing_since_ms = None
            current_entry.paused_at = None
            max_pos = max(e.position or 0 for e in entries)
            current_entry.position = (max_pos or 0) + 1

            # Advance to next entry
            queue.current_entry_id = next_entry.id
            room.state = "playing"
            next_entry.progress_ms = 0
            next_entry.playing_since_ms = now_ms
            next_entry.paused_at = None

            db.session.commit()
            db.session.refresh(room)
            db.session.refresh(queue)
            db.session.refresh(next_entry)

            socketio.emit(
                "room.playback",
                {
                    "code": room.code,
                    "state": "playing",
                    "playing_since_ms": next_entry.playing_since_ms,
                    "progress_ms": next_entry.progress_ms,
                    "current_entry": next_entry.to_dict(),
                    "actor_user_id": user_id,
                },
                room=f"room:{room.code}",
            )
            emit_queue_update_for_room(room)
        except Exception:
            logging.exception("queue.probe handler error")

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
