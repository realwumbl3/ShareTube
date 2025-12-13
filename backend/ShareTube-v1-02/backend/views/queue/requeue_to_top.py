from __future__ import annotations

import logging
from typing import Any

from ...extensions import db, socketio
from ...models import Queue, QueueEntry, Room
from ..decorators import ensure_queue, require_room


def register() -> None:
    @socketio.on("queue.requeue_to_top")
    @require_room
    @ensure_queue
    def _on_queue_requeue_to_top(
        room: Room, user_id: int, queue: Queue, data: dict
    ):
        """
        Move a queue entry back to the front of the queue and reset its status to queued.

        The entry must belong to the current room's active queue and have been added by
        the current user (same permission model as queue.remove).
        """
        id = (data or {}).get("id")
        res, rej = Room.emit(room.code, trigger="queue.requeue_to_top")
        if not id:
            return rej("queue.requeue_to_top: no id provided")

        try:
            entry = (
                db.session.query(QueueEntry)
                .filter_by(id=id, queue_id=queue.id, added_by_id=user_id)
                .first()
            )
            if not entry:
                logging.warning(
                    "queue.requeue_to_top: no entry found for id (id=%s) (user_id=%s)",
                    id,
                    user_id,
                )
                return rej("queue.requeue_to_top: no entry found for id")

            entry.status = "queued"
            queued_entries = queue.query_entries_by_status("queued").all()
            queued_entries = list(queued_entries or [])

            if not any(e.id == entry.id for e in queued_entries):
                queued_entries.append(entry)

            queued_entries = [e for e in queued_entries if e.id != entry.id]
            queued_entries.insert(0, entry)

            updates: list[dict[str, Any]] = []
            for idx, e in enumerate(queued_entries, start=1):
                if e.position != idx or e.status != "queued":
                    e.position = idx
                    e.status = "queued"
                    updates.append({"id": e.id, "position": e.position, "status": e.status})

            db.session.commit()
            db.session.refresh(room)
            db.session.refresh(queue)
            socketio.emit(
                "queue.moved",
                {
                    "id": entry.id,
                    "position": entry.position,
                    "status": entry.status,
                    "opts": {"updates": updates},
                },
                room=f"room:{room.code}",
            )
            res("queue.requeue_to_top.result", {"ok": True, "updates": updates})
        except Exception:
            logging.exception(
                "queue.requeue_to_top handler error (id=%s) (user_id=%s) (room=%s)",
                id,
                user_id,
                room.code,
            )
            return rej("queue.requeue_to_top handler error")

