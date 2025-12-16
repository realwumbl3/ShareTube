from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....lib.utils import commit_with_retry, now_ms
from ....models import Room
from ....helpers.ws import get_mobile_remote_session_id, is_mobile_remote_socket
from ...middleware import require_room_by_code
from ..rooms.room_timeouts import cancel_starting_timeout


def register() -> None:
    @socketio.on("room.control.restartvideo")
    @require_room_by_code
    def _on_room_control_restartvideo(room: Room, user_id: int, data: dict):
        res, rej = Room.emit(room.code, trigger="room.control.restartvideo")
        try:
            _now_ms = now_ms()
            error = None
            queue = room.current_queue
            if not queue:
                error = "room.restart_video: no current queue"
            else:
                current_entry = queue.current_entry
                if not current_entry:
                    error = "room.restart_video: no current entry"
                else:
                    current_entry.progress_ms = 0
                    current_entry.playing_since_ms = _now_ms
                    current_entry.paused_at = None
                    room.state = "playing"
            if error:
                rej(error)
                return
            commit_with_retry(db.session)
            if room.state == "starting":
                cancel_starting_timeout(room.code)

            is_remote = is_mobile_remote_socket()
            actor_id = get_mobile_remote_session_id() if is_remote else user_id

            res(
                "room.playback",
                {
                    "state": "playing",
                    "progress_ms": 0,
                    "playing_since_ms": _now_ms,
                    "paused_at": None,
                    "actor_user_id": actor_id,
                    "is_remote": is_remote,
                },
            )
        except Exception as e:
            logging.exception("room.control.restartvideo handler error: %s", e)
            rej(f"room.control.restartvideo handler error: {e}")

