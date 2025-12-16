from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....lib.utils import commit_with_retry, now_ms, playing_since_ms_with_buffer
from ....models import QueueEntry, Room, RoomMembership, User
from ...middleware import require_room_by_code
from ..rooms.room_timeouts import (
    cancel_starting_timeout,
    schedule_starting_to_playing_timeout,
)


def register() -> None:
    @socketio.on("room.control.play")
    @require_room_by_code
    def _on_room_control_play(room: Room, user_id: int, data: dict):
        res, rej = Room.emit(room.code, trigger="room.control.play")
        try:
            _now_ms = now_ms()
            result = None
            error = None
            queue = room.current_queue

            if not queue:
                error = "room.start_playback: no current queue"
            elif not queue.current_entry:
                if len(queue.entries) == 0:
                    error = "room.start_playback: no entries in queue"
                else:
                    next_entry = (
                        db.session.query(QueueEntry)
                        .filter_by(queue_id=queue.id, status="queued")
                        .order_by(QueueEntry.position.asc())
                        .first()
                    )
                    if not next_entry:
                        error = "room.start_playback: load_next_entry error: queue.load_next_entry: no entries in queue"
                    else:
                        queue.current_entry_id = next_entry.id
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
                        next_entry.status = "playing"
                        next_entry.progress_ms = 0
                        next_entry.playing_since_ms = None
                        next_entry.paused_at = None
                        result = {"state": "starting", "current_entry": next_entry.to_dict()}
            elif room.state in ("starting", "midroll"):
                room.state = "playing"
                current_entry = queue.current_entry
                playing_since_ms = None
                if current_entry:
                    current_entry.status = "playing"
                    playing_since_ms = playing_since_ms_with_buffer()
                    current_entry.playing_since_ms = playing_since_ms
                    current_entry.paused_at = None
                result = {
                    "state": "playing",
                    "playing_since_ms": playing_since_ms,
                    "progress_ms": current_entry.progress_ms if current_entry else 0,
                    "current_entry": current_entry.to_dict() if current_entry else None,
                }
            elif room.state == "paused":
                current_entry = queue.current_entry if queue else None
                if not current_entry:
                    error = "room.start_playback: no current entry to resume"
                else:
                    current_entry.status = "playing"
                    playing_since_ms = playing_since_ms_with_buffer()
                    current_entry.playing_since_ms = playing_since_ms
                    current_entry.paused_at = None
                    room.state = "playing"
                    result = {
                        "state": "playing",
                        "playing_since_ms": playing_since_ms,
                        "progress_ms": current_entry.progress_ms,
                        "current_entry": current_entry.to_dict(),
                    }
            else:
                current_entry = queue.current_entry if queue else None
                if current_entry:
                    result = {
                        "state": room.state,
                        "playing_since_ms": current_entry.playing_since_ms,
                        "progress_ms": current_entry.progress_ms,
                        "current_entry": current_entry.to_dict(),
                    }
                else:
                    error = "room.start_playback: no current entry"

            if result is None or error:
                rej(error)
                return
            commit_with_retry(db.session)
            if room.state == "starting":
                cancel_starting_timeout(room.code)
            if result["state"] == "starting":
                schedule_starting_to_playing_timeout(room.code, delay_seconds=30)

            try:
                if room.current_queue and room.current_queue.current_entry:
                    db.session.refresh(room.current_queue.current_entry)
                    socketio.emit(
                        "queue.moved",
                        {
                            "id": room.current_queue.current_entry.id,
                            "position": room.current_queue.current_entry.position,
                            "status": room.current_queue.current_entry.status,
                        },
                        room=f"room:{room.code}",
                    )
            except Exception:
                logging.exception("room.control.play queue broadcast error")

            payload = {"actor_user_id": user_id, **result}

            res("room.playback", payload)
        except Exception as e:
            logging.exception("room.control.play handler error")
            rej(f"room.control.play handler error: {e}")

