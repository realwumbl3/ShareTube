from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....lib.utils import commit_with_retry, now_ms
from ....models import Queue, QueueEntry, Room, RoomMembership, User
from ...middleware import require_queue_entry, require_room
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
            if room.state in ("starting", "midroll"):
                return rej("queue.probe: room.state is starting or midroll")

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
                return rej("queue.probe: video not completed")

            if not room.autoadvance_on_end:
                # When auto_advance is off, mark current video as completed and set room to idle
                # Keep current_entry_id pointing to the completed video until manually advanced
                next_entry_query = db.session.query(QueueEntry).filter_by(
                    queue_id=queue.id, status="queued"
                ).filter(QueueEntry.id != current_entry.id).order_by(QueueEntry.position.asc()).first()
                has_next_entry = next_entry_query is not None
                
                completed_entry.watch_count = (completed_entry.watch_count or 0) + 1
                completed_entry.progress_ms = 0
                completed_entry.playing_since_ms = None
                completed_entry.paused_at = None
                completed_entry.status = "played"

                queued_entries = (
                    db.session.query(QueueEntry)
                    .filter_by(queue_id=queue.id, status="queued")
                    .order_by(QueueEntry.position.asc())
                    .all()
                )
                max_pos = max(e.position or 0 for e in queued_entries) if queued_entries else 0
                completed_entry.position = max_pos + 1
                # Keep current_entry_id set to the completed entry (don't clear it)
                room.state = "idle"
                
                commit_with_retry(db.session)
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
                return

            if not room.current_queue:
                return rej("queue.probe: complete_and_advance error: room.complete_and_advance: no current queue")
            current_entry_for_completion = room.current_queue.current_entry
            if not current_entry_for_completion:
                return rej("queue.probe: complete_and_advance error: room.complete_and_advance: no current entry")

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
            logging.exception("queue.probe handler error: %s", e)
            rej(f"queue.probe handler error: {e}")

