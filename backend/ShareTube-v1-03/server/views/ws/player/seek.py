from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....models import Room
from ....ws.server import get_mobile_remote_session_id, is_mobile_remote_socket
from ....lib.utils import now_ms
from ...middleware import require_room_by_code


def register() -> None:
    @socketio.on("room.control.seek")
    @require_room_by_code
    def _on_room_control_seek(room: Room, user_id: int, data: dict):
        res, rej = Room.emit(room.code, trigger="room.control.seek")
        try:
            progress_ms = (data or {}).get("progress_ms")
            delta_ms = (data or {}).get("delta_ms")
            play = (data or {}).get("play")
            frame_step = (data or {}).get("frame_step")
            _now_ms = now_ms()
            if delta_ms is not None:
                _, error = room.relative_seek(delta_ms, _now_ms, play)
            elif progress_ms is not None:
                _, error = room.seek_video(progress_ms, _now_ms, play)
            else:
                rej("room.control.seek: no progress_ms or delta_ms")
                return
            if error:
                rej(error)
                return
            db.session.refresh(room)
            current_entry = None
            if room.current_queue and room.current_queue.current_entry:
                db.session.refresh(room.current_queue.current_entry)
                current_entry = room.current_queue.current_entry

            is_remote = is_mobile_remote_socket()
            actor_id = get_mobile_remote_session_id() if is_remote else user_id

            actual_progress_ms = (
                current_entry.progress_ms if current_entry else None
            )

            res(
                "room.playback",
                {
                    "state": room.state,
                    "delta_ms": delta_ms,
                    "progress_ms": actual_progress_ms,
                    "frame_step": frame_step,
                    "playing_since_ms": (
                        current_entry.playing_since_ms if current_entry else None
                    ),
                    "actor_user_id": actor_id,
                    "is_remote": is_remote,
                },
            )
        except Exception:
            logging.exception("room.control.seek handler error")

