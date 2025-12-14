from __future__ import annotations

import logging

from ...extensions import db, socketio
from ...models import Queue, QueueEntry, Room
from ..decorators import require_queue_entry, require_room
from ..rooms.room_timeouts import schedule_starting_to_playing_timeout


def register() -> None:
    @socketio.on("queue.probe")
    @require_room
    @require_queue_entry
    def _on_queue_probe(
        room: Room, user_id: int, queue: Queue, current_entry: QueueEntry, data: dict
    ):
        res, rej = Room.emit(room.code, trigger="queue.probe")
        try:
            logging.info("[[[[[[queue.probe]]]]]]")

            if room.state in ("starting", "midroll"):
                return rej("queue.probe: room.state is starting or midroll")

            completed_entry = current_entry

            if not current_entry.check_completion():
                return rej("queue.probe: video not completed")

            if not room.autoadvance_on_end:
                # When auto_advance is off, mark current video as completed and set room to idle
                # Keep current_entry_id pointing to the completed video until manually advanced
                next_entry_query = db.session.query(QueueEntry).filter_by(
                    queue_id=queue.id, status="queued"
                ).filter(QueueEntry.id != current_entry.id).order_by(QueueEntry.position.asc()).first()
                has_next_entry = next_entry_query is not None
                
                completed_entry.complete_and_rotate()
                # Keep current_entry_id set to the completed entry (don't clear it)
                room.state = "idle"
                
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
                res(
                    "room.playback",
                    {
                        "state": "idle",
                        "show_continue_prompt": has_next_entry,
                    },
                )
                db.session.commit()
                return

            next_entry, error = room.complete_and_advance()
            if error:
                logging.warning("queue.probe: complete_and_advance error: %s", error)
                return rej(f"queue.probe: complete_and_advance error: {error}")

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
            logging.exception("queue.probe handler error: %s", e)
            rej(f"queue.probe handler error: {e}")

