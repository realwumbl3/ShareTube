from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....models import Room
from ....ws.server import get_mobile_remote_session_id, is_mobile_remote_socket
from ....lib.utils import now_ms
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
            result, error = room.start_playback(_now_ms)
            if result is None or error:
                rej(error)
                return
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

            is_remote = is_mobile_remote_socket()
            actor_id = get_mobile_remote_session_id() if is_remote else user_id

            res("room.playback", {"actor_user_id": actor_id, "is_remote": is_remote, **result})
        except Exception as e:
            logging.exception("room.control.play handler error")
            rej(f"room.control.play handler error: {e}")

