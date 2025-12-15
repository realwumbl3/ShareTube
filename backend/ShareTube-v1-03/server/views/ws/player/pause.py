from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....lib.utils import commit_with_retry, now_ms
from ....models import QueueEntry, Room
from ....ws.server import get_mobile_remote_session_id, is_mobile_remote_socket
from ...middleware import require_room_by_code
from ..rooms.room_timeouts import cancel_starting_timeout


def register() -> None:
    @socketio.on("room.control.pause")
    @require_room_by_code
    def _on_room_control_pause(room: Room, user_id: int, data: dict):
        res, rej = Room.emit(room.code, trigger="room.control.pause")
        try:
            _now_ms = now_ms()
            paused_progress_ms = None
            error = None
            queue = room.current_queue

            if not queue:
                error = "room.pause_playback: no current queue"
            elif not queue.current_entry:
                next_entry = (
                    db.session.query(QueueEntry)
                    .filter_by(queue_id=queue.id, status="queued")
                    .order_by(QueueEntry.position.asc())
                    .first()
                )
                if not next_entry:
                    error = "room.pause_playback: queue.load_next_entry: no entries in queue"
                else:
                    queue.current_entry_id = next_entry.id
                    next_entry.progress_ms = 0
                    next_entry.playing_since_ms = None
                    next_entry.paused_at = None
                    next_entry.status = "queued"
                    room.state = "paused"
                    paused_progress_ms = 0
            else:
                current_entry = queue.current_entry
                initial_progress_ms = current_entry.progress_ms or 0
                paused_progress_ms = (
                    max(0, _now_ms - (current_entry.playing_since_ms or 0)) + initial_progress_ms
                )
                current_entry.playing_since_ms = None
                current_entry.progress_ms = paused_progress_ms
                current_entry.paused_at = _now_ms
                room.state = "paused"

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
                    "state": "paused",
                    "playing_since_ms": None,
                    "progress_ms": paused_progress_ms,
                    "actor_user_id": actor_id,
                    "is_remote": is_remote,
                },
            )
        except Exception as e:
            logging.exception("room.control.pause handler error: %s", e)
            rej(f"room.control.pause handler error: {e}")

