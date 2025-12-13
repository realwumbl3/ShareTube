from __future__ import annotations

import logging

from ...extensions import db, socketio
from ...models import Queue, QueueEntry, Room
from ..decorators import require_queue_entry, require_room
from ..rooms.room_timeouts import schedule_starting_to_playing_timeout


def register() -> None:
    @socketio.on("queue.continue_next")
    @require_room
    @require_queue_entry
    def _on_queue_continue_next(
        room: Room, user_id: int, queue: Queue, current_entry: QueueEntry, data: dict
    ):
        """Manually continue to next video (owner/operators only), marking current as completed."""
        res, rej = Room.emit(room.code, trigger="queue.continue_next")
        try:
            is_owner = room.owner_id == user_id
            is_operator = any(operator.user_id == user_id for operator in room.operators)
            if not (is_owner or is_operator):
                return rej("queue.continue_next: insufficient permissions")

            completed_entry = current_entry

            if not current_entry.check_completion():
                return rej("queue.continue_next: video not completed")

            next_entry, error = room.complete_and_advance()
            if error:
                logging.warning("queue.continue_next: complete_and_advance error: %s", error)
                return rej(f"queue.continue_next: complete_and_advance error: {error}")

            try:
                db.session.refresh(completed_entry)
            except Exception:
                completed_entry = None
            if completed_entry:
                socketio.emit(
                    "queue.moved",
                    {
                        "id": completed_entry.id,
                        "position": completed_entry.position,
                        "status": completed_entry.status,
                    },
                    room=f"room:{room.code}",
                )
            if next_entry:
                try:
                    db.session.refresh(next_entry)
                except Exception:
                    pass
                socketio.emit(
                    "queue.moved",
                    {
                        "id": next_entry.id,
                        "position": next_entry.position,
                        "status": next_entry.status,
                    },
                    room=f"room:{room.code}",
                )

            if next_entry:
                res(
                    "room.playback",
                    {
                        "state": "starting",
                        "playing_since_ms": None,
                        "progress_ms": next_entry.progress_ms,
                        "current_entry": next_entry.to_dict(),
                        "actor_user_id": user_id,
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
                        "actor_user_id": user_id,
                        "queue_empty": True,
                    },
                )
            db.session.commit()
        except Exception as e:
            logging.exception("queue.continue_next handler error: %s", e)
            rej(f"queue.continue_next handler error: {e}")

