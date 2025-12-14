from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....models import QueueEntry, Room
from ...middleware import require_room


def register() -> None:
    @socketio.on("queue.remove")
    @require_room
    def _on_queue_remove(room: Room, user_id: int, data: dict):
        try:
            res, rej = Room.emit(room.code, trigger="queue.remove")
            id = (data or {}).get("id")
            if not id:
                return rej("queue.remove: no id provided")
            entry = (
                db.session.query(QueueEntry)
                .filter_by(id=id, added_by_id=user_id)
                .first()
            )
            if not entry:
                logging.warning(
                    "queue.remove: no entry found for id (id=%s) (user_id=%s)",
                    id,
                    user_id,
                )
                return rej("queue.remove: no entry found for id")
            was_deleted = entry.status == "deleted"
            entry.remove()
            db.session.refresh(room)

            payload = {"id": id}
            if was_deleted:
                payload["remove"] = True
            else:
                payload["status"] = "deleted"
                try:
                    db.session.refresh(entry)
                    payload["position"] = entry.position
                except Exception:
                    payload["position"] = None

            socketio.emit("queue.removed", payload, room=f"room:{room.code}")
            res("queue.remove.result", {"removed": True})
        except Exception:
            logging.exception(
                "queue.remove handler error (id=%s) (user_id=%s) (room=%s)",
                id,
                user_id,
                room.code,
            )

