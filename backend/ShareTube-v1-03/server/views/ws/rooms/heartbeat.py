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
        interval = app.config.get("HEARTBEAT_INTERVAL_SECONDS", 10)
        pong_timeout = app.config.get("PONG_TIMEOUT_SECONDS", 11)

    while True:
        start_time = time.perf_counter_ns()
        logging.debug("heartbeat: cleanup cycle starting")
        try:
            with app.app_context():
                cutoff_time = int(time.time()) - pong_timeout

                # Get all inactive active users
                inactive_users = User.query.filter(
                    User.active == True,
                    User.last_seen < cutoff_time
                ).all()

                affected_room_codes: set[str] = set[str]()

                for user in inactive_users:
                    logging.debug("heartbeat: cleaning up inactive user %s", user.id)

                    # Get all memberships for this user
                    memberships = RoomMembership.query.filter_by(user_id=user.id).all()

                    if not memberships:
                        # User has no memberships, just deactivate
                        user.active = False
                        continue

                    # Collect room codes before deleting memberships
                    room_codes = [membership.room.code for membership in memberships]
                    affected_room_codes.update(room_codes)

                    # Bulk delete all memberships for this user
                    (
                        db.session.query(RoomMembership)
                        .filter_by(user_id=user.id)
                        .delete(synchronize_session=False)
                    )

                    # Deactivate the user since all memberships are removed
                    user.active = False
                    user.last_seen = int(time.time())

                if affected_room_codes:
                    commit_with_retry(db.session)

                    # Emit presence updates for affected rooms
                    for room_code in affected_room_codes:
                        room = Room.query.filter_by(code=room_code).first()
                        if room:
                            logging.debug("heartbeat: emitting presence for room %s", room.code)
                            emit_presence(room.id)
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass
            logging.exception("heartbeat: error during cleanup cycle")

        elapsed_time = time.perf_counter_ns() - start_time
        logging.debug("heartbeat: cleanup cycle completed in %s milliseconds (nanoseconds=%s)", elapsed_time / 1000000, elapsed_time )  

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
                    app.config.get("BACKGROUND_TASK_SLOTS", "BACKGROUND_TASK_SLOTS MISSING FROM CONFIG!"),
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

