from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....lib.utils import commit_with_retry, now_ms
from ....models import Queue, QueueEntry, Room, RoomMembership, User
from ...middleware import require_room
from ..rooms.room_timeouts import schedule_starting_to_playing_timeout


def register() -> None:
    @socketio.on("queue.continue_next")
    @require_room
    def _on_queue_continue_next(room: Room, user_id: int, data: dict):
        """Manually continue to next video (owner/operators only), marking current as completed."""
        res, rej = Room.emit(room.code, trigger="queue.continue_next")
        try:
            is_owner = room.owner_id == user_id
            is_operator = any(operator.user_id == user_id for operator in room.operators)
            if not (is_owner or is_operator):
                return rej("queue.continue_next: insufficient permissions")

            if not room.current_queue:
                return rej("queue.continue_next: no current queue")
            
            queue = room.current_queue
            current_entry = queue.current_entry

            # If there's no current entry, just load the next one.
            #
            # Also handle the case where `queue.probe` (with auto-advance OFF) has already
            # marked the current entry as played and reset its virtual clock state. In that
            # case, we should *not* try to re-validate completion via progress math (it will
            # fail), and we must avoid completing it a second time (double watch_count /
            # position bump). Treat it as "no current entry" and just load the next queued.
            if current_entry and current_entry.status == "played":
                current_entry = None

            if not current_entry:
                next_entry = (
                    db.session.query(QueueEntry)
                    .filter_by(queue_id=queue.id, status="queued")
                    .order_by(QueueEntry.position.asc())
                    .first()
                )
                if not next_entry:
                    logging.warning("queue.continue_next: load_next_entry error: no entries in queue")
                    return rej("queue.continue_next: no entries in queue")

                queue.current_entry_id = next_entry.id
                next_entry.status = "playing"
                next_entry.progress_ms = 0
                next_entry.playing_since_ms = None
                next_entry.paused_at = None
                room.state = "starting"
                active_user_ids = (
                    db.session.query(User.id).filter(User.active.is_(True)).subquery()
                )
                (
                    db.session.query(RoomMembership)
                    .filter(
                        RoomMembership.room_id == room.id,
                        RoomMembership.user_id.in_(db.session.query(active_user_ids.c.id)),
                    )
                    .update({RoomMembership.ready: False}, synchronize_session=False)
                )
                db.session.flush()
                
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
                commit_with_retry(db.session)
                return

            completed_entry = current_entry

            _now_ms = now_ms()
            base_progress_ms = current_entry.progress_ms or 0
            playing_since_ms = current_entry.playing_since_ms or 0
            elapsed_ms = max(0, _now_ms - playing_since_ms) if playing_since_ms else 0
            effective_progress_ms = base_progress_ms + elapsed_ms
            duration_ms = max(0, int(current_entry.duration_ms or 0))
            near_end_ms = max(0, duration_ms - 6000)
            has_completed = duration_ms > 0 and effective_progress_ms >= near_end_ms

            if not has_completed:
                return rej("queue.continue_next: video not completed")

            if not room.current_queue:
                return rej("queue.continue_next: complete_and_advance error: room.complete_and_advance: no current queue")
            current_entry_for_completion = room.current_queue.current_entry
            if not current_entry_for_completion:
                return rej("queue.continue_next: complete_and_advance error: room.complete_and_advance: no current entry")

            q = db.session.query(QueueEntry).filter_by(
                queue_id=room.current_queue.id, status="queued"
            )
            q = q.filter(QueueEntry.id != current_entry_for_completion.id)
            next_entry = q.order_by(QueueEntry.position.asc()).first()

            current_entry_for_completion.watch_count = (current_entry_for_completion.watch_count or 0) + 1
            current_entry_for_completion.progress_ms = 0
            current_entry_for_completion.playing_since_ms = None
            current_entry_for_completion.paused_at = None
            current_entry_for_completion.status = "played"

            queued_entries_for_completion = (
                db.session.query(QueueEntry)
                .filter_by(queue_id=room.current_queue.id, status="queued")
                .order_by(QueueEntry.position.asc())
                .all()
            )
            max_pos_for_completion = (
                max(e.position or 0 for e in queued_entries_for_completion) if queued_entries_for_completion else 0
            )
            current_entry_for_completion.position = max_pos_for_completion + 1

            if next_entry:
                room.current_queue.current_entry_id = next_entry.id
                next_entry.status = "playing"
                next_entry.progress_ms = 0
                next_entry.playing_since_ms = None
                next_entry.paused_at = None
            else:
                room.current_queue.current_entry_id = None

            if next_entry:
                room.state = "starting"
                active_user_ids = (
                    db.session.query(User.id).filter(User.active.is_(True)).subquery()
                )
                (
                    db.session.query(RoomMembership)
                    .filter(
                        RoomMembership.room_id == room.id,
                        RoomMembership.user_id.in_(db.session.query(active_user_ids.c.id)),
                    )
                    .update({RoomMembership.ready: False}, synchronize_session=False)
                )
                db.session.flush()
            else:
                room.state = "paused"
            commit_with_retry(db.session)
            
            # Refresh room and queue after commit to ensure current_entry relationship is updated
            db.session.refresh(room)
            if room.current_queue:
                db.session.refresh(room.current_queue)

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
        except Exception as e:
            logging.exception("queue.continue_next handler error: %s", e)
            rej(f"queue.continue_next handler error: {e}")

