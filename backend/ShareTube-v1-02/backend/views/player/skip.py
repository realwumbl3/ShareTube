from __future__ import annotations

import logging

from ...extensions import db, socketio
from ...models import Room
from ...sockets import get_mobile_remote_session_id, is_mobile_remote_socket
from ..decorators import require_room_by_code
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
            skipped_entry = room.current_queue.current_entry if room.current_queue else None
            next_entry, error = room.skip_to_next()
            if error:
                rej(error)
                return
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

