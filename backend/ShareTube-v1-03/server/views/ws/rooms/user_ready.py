from __future__ import annotations

import logging

from ....extensions import db, socketio
from ....models import QueueEntry, Room, RoomMembership, User
from ...middleware import require_room
from .room_timeouts import cancel_starting_timeout
from ....lib.utils import flush_with_retry, commit_with_retry, now_ms
from ....helpers.ws import emit_function_after_delay
from .common import emit_presence


def register() -> None:
    @socketio.on("user.ready")
    @require_room
    def _on_user_ready(room: Room, user_id: int, data: dict):
        res, _rej = Room.emit(room.code, trigger="user.ready")
        try:
            membership = (
                db.session.query(RoomMembership)
                .join(User, RoomMembership.user_id == User.id)
                .filter(RoomMembership.room_id == room.id, RoomMembership.user_id == user_id)
                .filter(User.active.is_(True))
                .first()
            )
            if not membership:
                return

            ready = bool((data or {}).get("ready"))
            previous_ready = bool(membership.ready)
            membership.ready = bool(ready)
            flush_with_retry(db.session)

            socketio.emit(
                "user.ready.update",
                {"user_id": user_id, "ready": ready},
                room=f"room:{room.code}",
            )

            midroll_payload = None

            def _is_operator(user_id_to_check: int) -> bool:
                if room.owner_id and room.owner_id == user_id_to_check:
                    return True
                return any(operator.user_id == user_id_to_check for operator in room.operators)

            def _should_consider_midroll(mode: str) -> bool:
                if mode == "pause_all":
                    return room.state in ("playing", "starting")
                if mode == "operators_only":
                    return room.state == "playing" and _is_operator(user_id)
                if mode == "starting_only":
                    return room.state == "starting"
                return False

            should_eval_midroll = (
                previous_ready
                and not ready
                and room.state != "midroll"
                and room.current_queue
                and room.current_queue.current_entry
            )

            if should_eval_midroll and _should_consider_midroll(room.ad_sync_mode):
                paused_progress = None
                pause_error = None
                queue = room.current_queue
                pause_now_ms = now_ms()
                if not queue:
                    pause_error = "room.pause_playback: no current queue"
                elif not queue.current_entry:
                    next_entry = (
                        db.session.query(QueueEntry)
                        .filter_by(queue_id=queue.id, status="queued")
                        .order_by(QueueEntry.position.asc())
                        .first()
                    )
                    if not next_entry:
                        pause_error = "room.pause_playback: queue.load_next_entry: no entries in queue"
                    else:
                        queue.current_entry_id = next_entry.id
                        next_entry.progress_ms = 0
                        next_entry.playing_since_ms = None
                        next_entry.paused_at = None
                        next_entry.status = "queued"
                        room.state = "paused"
                        paused_progress = 0
                else:
                    current_entry_for_pause = queue.current_entry
                    initial_progress_ms = current_entry_for_pause.progress_ms or 0
                    paused_progress = (
                        max(0, pause_now_ms - (current_entry_for_pause.playing_since_ms or 0))
                        + initial_progress_ms
                    )
                    current_entry_for_pause.playing_since_ms = None
                    current_entry_for_pause.progress_ms = paused_progress
                    current_entry_for_pause.paused_at = pause_now_ms
                    room.state = "paused"
                if pause_error:
                    logging.warning(
                        "user.ready: failed to pause playback for midroll (room=%s, user_id=%s, error=%s)",
                        room.code,
                        user_id,
                        pause_error,
                    )
                else:
                    current_entry = room.current_queue.current_entry
                    if current_entry:
                        room.state = "midroll"
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
                        emit_function_after_delay(emit_presence, room, 0.1)
                        progress_ms = (
                            paused_progress
                            if paused_progress is not None
                            else current_entry.progress_ms or 0
                        )
                        midroll_payload = {
                            "state": "midroll",
                            "playing_since_ms": None,
                            "progress_ms": progress_ms,
                            "current_entry": current_entry.to_dict(),
                            "actor_user_id": user_id,
                        }

            current_entry = (
                room.current_queue.current_entry
                if room.current_queue and room.current_queue.current_entry
                else None
            )

            memberships_ready = (
                db.session.query(RoomMembership.ready)
                .join(User, RoomMembership.user_id == User.id)
                .filter(RoomMembership.room_id == room.id, User.active.is_(True))
                .all()
            )
            all_users_ready = bool(memberships_ready) and all(bool(row[0]) for row in memberships_ready)

            should_transition = (
                ready
                and room.state in ("starting", "midroll")
                and current_entry is not None
                and all_users_ready
            )
            playback_payload = None
            if should_transition:
                cancel_starting_timeout(room.code)
                _now_ms = now_ms()
                room.state = "playing"
                current_entry.status = "playing"
                current_entry.playing_since_ms = _now_ms
                current_entry.paused_at = None
                playback_payload = {
                    "state": "playing",
                    "playing_since_ms": _now_ms,
                    "progress_ms": current_entry.progress_ms if current_entry else 0,
                    "current_entry": current_entry.to_dict(),
                    "actor_user_id": user_id,
                }

            commit_with_retry(db.session)

            if midroll_payload:
                res("room.playback", midroll_payload)
            elif playback_payload:
                res("room.playback", playback_payload)
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass
            logging.exception("user.ready handler error")

