from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....lib.utils import commit_with_retry
from ....models import QueueEntry, Room, RoomMembership, User
from ....helpers.ws import get_mobile_remote_session_id, is_mobile_remote_socket
from ...middleware import require_room_by_code
from ..rooms.room_timeouts import (
    cancel_starting_timeout,
    schedule_starting_to_playing_timeout,
)


def register() -> None:
    @socketio.on("room.control.skip")
    @require_room_by_code
    def _on_room_control_skip(room: Room, user_id: int, data: dict):
        try:
            res, rej = Room.emit(room.code, trigger="room.control.skip")
            queue = room.current_queue
            if not queue:
                rej("room.skip_to_next: no current queue")
                return

            skipped_entry = queue.current_entry
            had_current = skipped_entry is not None

            next_entry = None
            queue_error = None

            if not queue.current_entry:
                next_entry = (
                    db.session.query(QueueEntry)
                    .filter_by(queue_id=queue.id, status="queued")
                    .order_by(QueueEntry.position.asc())
                    .first()
                )
                if not next_entry:
                    queue_error = "queue.skip_to_next: no entries in queue"
                else:
                    queue.current_entry_id = next_entry.id
                    next_entry.status = "playing"
                    next_entry.progress_ms = 0
                    next_entry.playing_since_ms = None
                    next_entry.paused_at = None
            else:
                q = db.session.query(QueueEntry).filter_by(queue_id=queue.id, status="queued")
                q = q.filter(QueueEntry.id != queue.current_entry.id)
                next_entry = q.order_by(QueueEntry.position.asc()).first()
                if not next_entry:
                    skipped_entry = queue.current_entry
                    skipped_entry.playing_since_ms = None
                    skipped_entry.status = "skipped"
                    queue.current_entry_id = None
                    queue_error = "queue.skip_to_next: no next entry"
                else:
                    skipped_entry = queue.current_entry
                    skipped_entry.playing_since_ms = None
                    skipped_entry.status = "skipped"
                    queue.current_entry_id = next_entry.id
                    next_entry.status = "playing"
                    next_entry.progress_ms = 0
                    next_entry.playing_since_ms = None
                    next_entry.paused_at = None

            if queue_error:
                if had_current and not queue.current_entry:
                    room.state = "paused"
                commit_with_retry(db.session)
                rej(f"room.skip_to_next: {queue_error}")
                return

            if next_entry:
                room.state = "starting"
                active_user_ids = (
                    db.session.query(User.id).filter(User.active.is_(True)).subquery()
                )
                (
                    db.session.query(RoomMembership)
                    .filter(
                        RoomMembership.room_id == room.id,
                        RoomMembership.user_id.in_(db.session.query(active_user_ids.c.id)),
                    )
                    .update({RoomMembership.ready: False}, synchronize_session=False)
                )
                db.session.flush()
            else:
                load_entry = (
                    db.session.query(QueueEntry)
                    .filter_by(queue_id=queue.id, status="queued")
                    .order_by(QueueEntry.position.asc())
                    .first()
                )
                if not load_entry:
                    if had_current and not queue.current_entry:
                        room.state = "paused"
                    commit_with_retry(db.session)
                    rej("room.skip_to_next: queue.load_next_entry: no entries in queue")
                    return
                queue.current_entry_id = load_entry.id
                load_entry.status = "playing"
                load_entry.progress_ms = 0
                load_entry.playing_since_ms = None
                load_entry.paused_at = None
                room.state = "starting"
                queue.current_entry = load_entry
                active_user_ids = (
                    db.session.query(User.id).filter(User.active.is_(True)).subquery()
                )
                (
                    db.session.query(RoomMembership)
                    .filter(
                        RoomMembership.room_id == room.id,
                        RoomMembership.user_id.in_(db.session.query(active_user_ids.c.id)),
                    )
                    .update({RoomMembership.ready: False}, synchronize_session=False)
                )
                db.session.flush()
                next_entry = load_entry

            commit_with_retry(db.session)
            if room.state == "starting":
                cancel_starting_timeout(room.code)
            db.session.refresh(room)

            try:
                if skipped_entry:
                    db.session.refresh(skipped_entry)
                    socketio.emit(
                        "queue.moved",
                        {
                            "id": skipped_entry.id,
                            "position": skipped_entry.position,
                            "status": skipped_entry.status,
                        },
                        room=f"room:{room.code}",
                    )
                if next_entry:
                    db.session.refresh(next_entry)
                    socketio.emit(
                        "queue.moved",
                        {
                            "id": next_entry.id,
                            "position": next_entry.position,
                            "status": next_entry.status,
                        },
                        room=f"room:{room.code}",
                    )
            except Exception:
                logging.exception("room.control.skip queue broadcast error")

            is_remote = is_mobile_remote_socket()
            actor_id = get_mobile_remote_session_id() if is_remote else user_id

            if next_entry:
                db.session.refresh(next_entry)
                res(
                    "room.playback",
                    {
                        "state": "starting",
                        "playing_since_ms": None,
                        "progress_ms": next_entry.progress_ms,
                        "current_entry": next_entry.to_dict(),
                        "actor_user_id": actor_id,
                        "is_remote": is_remote,
                    },
                )
                schedule_starting_to_playing_timeout(room.code, delay_seconds=30)
            else:
                res(
                    "room.playback",
                    {
                        "state": room.state,
                        "playing_since_ms": None,
                        "progress_ms": 0,
                        "current_entry": None,
                        "actor_user_id": actor_id,
                        "is_remote": is_remote,
                    },
                )
        except Exception:
            logging.exception("room.control.skip handler error")

