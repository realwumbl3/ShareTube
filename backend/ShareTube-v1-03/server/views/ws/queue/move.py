from __future__ import annotations

from server.models.room.queue_entry import QueueEntry

import logging
from typing import Any

from ....extensions import db, socketio
from ....models import Queue, QueueEntry, Room
from ...middleware import ensure_queue, require_room
from .common import can_modify_any_entry
    

def register() -> None:
    @socketio.on("queue.move")
    @require_room
    @ensure_queue
    def _on_queue_move(room: Room, user_id: int, queue: Queue, data: dict):
        """
        Move a queue entry to a new position relative to another entry.

        The entry must belong to the current room's active queue and have been added by
        the current user (same permission model as queue.remove), unless the user is
        owner, operator, admin, or super-admin.
        """
        id = (data or {}).get("id")
        target_id = (data or {}).get("target_id")
        position = (data or {}).get("position")

        res, rej = Room.emit(room.code, trigger="queue.move")

        if not id:
            return rej("queue.move: no id provided")
        if not target_id:
            return rej("queue.move: no target_id provided")
        if position not in ("before", "after"):
            return rej("queue.move: position must be 'before' or 'after'")

        try:
            # Check if user can modify any entry
            can_modify_any = can_modify_any_entry(room, user_id)
            
            # Build query filter: if can modify any, don't filter by added_by_id
            query = db.session.query(QueueEntry).filter_by(id=id, queue_id=queue.id)
            if not can_modify_any:
                query = query.filter_by(added_by_id=user_id)
            
            entry_to_move = query.first()
            if not entry_to_move:
                logging.warning(
                    "queue.move: no entry found for id (id=%s) (user_id=%s)",
                    id,
                    user_id,
                )
                return rej("queue.move: no entry found for id")

            target_entry = (
                db.session.query(QueueEntry)
                .filter_by(id=target_id, queue_id=queue.id)
                .first()
            )
            if not target_entry:
                logging.warning(
                    "queue.move: no target entry found for id (target_id=%s)",
                    target_id,
                )
                return rej("queue.move: no target entry found")

            if entry_to_move.status != "queued" or target_entry.status != "queued":
                return rej("queue.move: can only reorder queued items")

            queued_entries = queue.query_entries_by_status("queued").all()
            queued_entries = list[QueueEntry](queued_entries or [])

            if not any(e.id == entry_to_move.id for e in queued_entries):
                return rej("queue.move: entry_to_move not in queued list")
            if not any(e.id == target_entry.id for e in queued_entries):
                return rej("queue.move: target_entry not in queued list")

            queued_entries = [e for e in queued_entries if e.id != entry_to_move.id]

            target_idx = next(
                (i for i, e in enumerate[QueueEntry](queued_entries) if e.id == target_entry.id), None
            )
            if target_idx is None:
                return rej("queue.move: target index not found")

            insert_idx = target_idx if position == "before" else target_idx + 1
            queued_entries.insert(insert_idx, entry_to_move)

            updates: list[dict[str, Any]] = []
            for idx, e in enumerate[QueueEntry](queued_entries, start=1):
                if e.position != idx:
                    e.position = idx
                    updates.append({"id": e.id, "position": e.position, "status": e.status})

            db.session.commit()
            db.session.refresh(room)
            db.session.refresh(queue)

            socketio.emit(
                "queue.moved",
                {
                    "id": entry_to_move.id,
                    "position": entry_to_move.position,
                    "status": entry_to_move.status,
                    "opts": {"updates": updates},
                },
                room=f"room:{room.code}",
            )
            res("queue.move.result", {"ok": True, "updates": updates})
        except Exception:
            logging.exception(
                "queue.move handler error (id=%s) (target_id=%s) (position=%s) (user_id=%s) (room=%s)",
                id,
                target_id,
                position,
                user_id,
                room.code,
            )
            return rej("queue.move handler error")

