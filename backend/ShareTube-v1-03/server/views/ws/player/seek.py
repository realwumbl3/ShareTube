from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....lib.utils import commit_with_retry, now_ms
from ....models import Room
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
            queue = room.current_queue
            error = None
            if delta_ms is not None:
                if not queue:
                    error = "room.relative_seek: no current queue"
                elif not queue.current_entry:
                    error = "room.relative_seek: no current entry"
                else:
                    current_entry = queue.current_entry
                    base_progress_ms = current_entry.progress_ms or 0
                    playing_since_ms = current_entry.playing_since_ms or 0
                    elapsed_ms = (
                        max(0, _now_ms - playing_since_ms) if playing_since_ms else 0
                    )
                    effective_progress_ms = base_progress_ms + elapsed_ms
                    duration_ms = max(0, int(current_entry.duration_ms or 0))
                    new_progress_ms = effective_progress_ms + delta_ms
                    current_entry.progress_ms = max(
                        0, min(new_progress_ms, duration_ms)
                    )
                    current_entry.playing_since_ms = _now_ms if play else None
                    room.state = "playing" if play else "paused"
            elif progress_ms is not None:
                if not queue:
                    error = "room.seek_video: no current queue"
                elif not queue.current_entry:
                    error = "room.seek_video: no current entry"
                else:
                    current_entry = queue.current_entry
                    current_entry.progress_ms = progress_ms
                    current_entry.playing_since_ms = _now_ms if play else None
                    room.state = "playing" if play else "paused"
            else:
                rej("room.control.seek: no progress_ms or delta_ms")
                return
            if error:
                rej(error)
                return
            commit_with_retry(db.session)
            db.session.refresh(room)
            current_entry = None
            if room.current_queue and room.current_queue.current_entry:
                db.session.refresh(room.current_queue.current_entry)
                current_entry = room.current_queue.current_entry

            actual_progress_ms = (
                current_entry.progress_ms if current_entry else None
            )

            payload = {
                "state": room.state,
                "delta_ms": delta_ms,
                "progress_ms": actual_progress_ms,
                "frame_step": frame_step,
                "playing_since_ms": (
                    current_entry.playing_since_ms if current_entry else None
                ),
                "actor_user_id": user_id,
            }

            res("room.playback", payload)
        except Exception:
            logging.exception("room.control.seek handler error")

