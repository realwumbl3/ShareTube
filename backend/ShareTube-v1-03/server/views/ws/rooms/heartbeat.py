"""
Heartbeat module for managing user presence and cleanup.
Handles periodic cleanup of inactive users across all rooms.
"""
from __future__ import annotations

import time
import logging
from flask import Flask

from ....extensions import db, socketio
from ....lib.utils import commit_with_retry
from ....lib.background_slots import claim_background_slot
from ....models import Room, RoomMembership, User

from .common import emit_presence

# Guard to ensure we start only one heartbeat thread
_heartbeat_thread_started: bool = False


def _heartbeat_cleanup_forever(app: Flask) -> None:
    """Background loop that periodically cleans up inactive users across all rooms and emits presence updates."""
    with app.app_context():
        interval = app.config.get("HEARTBEAT_INTERVAL_SECONDS", 20)
        pong_timeout = app.config.get("PONG_TIMEOUT_SECONDS", 20)

    while True:
        logging.info("heartbeat: cleanup cycle starting")
        try:
            with app.app_context():
                cutoff_time = int(time.time()) - pong_timeout

                rooms = Room.query.all()
                removed_by_room: dict[str, list[int]] = {}

                for room in rooms:
                    inactive_memberships = [
                        membership
                        for membership in room.memberships
                        if membership.user.active and membership.user.last_seen < cutoff_time
                    ]
                    if not inactive_memberships:
                        # logging.info("heartbeat: no inactive memberships found for room %s", room.code)
                        continue

                    removed_user_ids: list[int] = []
                    for membership in inactive_memberships:
                        logging.info("heartbeat: removing user %s from room %s", membership.user_id, room.code)
                        user = db.session.get(User, membership.user_id)
                        if user:
                            user.last_seen = int(time.time())

                        # Use a bulk delete to avoid SAWarning in race conditions where the row
                        # was already removed by another handler/process.
                        (
                            db.session.query(RoomMembership)
                            .filter_by(id=membership.id)
                            .delete(synchronize_session=False)
                        )

                        other_memberships = (
                            db.session.query(RoomMembership)
                            .filter_by(user_id=membership.user_id)
                            .first()
                        )
                        if not other_memberships and user:
                            user.active = False

                        removed_user_ids.append(membership.user_id)

                    if removed_user_ids:
                        removed_by_room[room.code] = removed_user_ids

                if removed_by_room:
                    commit_with_retry(db.session)

                for room_code in removed_by_room.keys():
                    room = Room.query.filter_by(code=room_code).first()
                    if room:
                        logging.info("heartbeat: emitting presence for room %s", room.code)
                        emit_presence(room)
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass
            logging.exception("heartbeat: error during cleanup cycle")

        socketio.sleep(interval)


def start_heartbeat_if_needed(app: Flask) -> None:
    """Start the global heartbeat cleanup task if not already running."""
    global _heartbeat_thread_started
    try:
        if _heartbeat_thread_started:
            return

        # Ensure only a subset of workers run background tasks in multi-worker deployments.
        # Only one worker should run heartbeat even if you run multiple background workers.
        slot = claim_background_slot(app, task="heartbeat", slots=1)
        if not slot:
            try:
                app.logger.info(
                    "heartbeat: background tasks disabled in this worker (no slot claimed; BACKGROUND_TASK_SLOTS=%s)",
                    app.config.get("BACKGROUND_TASK_SLOTS", 2),
                )
            except Exception:
                pass
            return

        socketio.start_background_task(_heartbeat_cleanup_forever, app)
        _heartbeat_thread_started = True
        try:
            app.logger.info("heartbeat: started background cleanup (slot=%s)", slot)
        except Exception:
            pass
    except Exception:
        logging.exception("failed to start heartbeat cleanup thread")

