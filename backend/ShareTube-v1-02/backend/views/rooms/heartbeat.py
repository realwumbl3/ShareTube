"""
Heartbeat module for managing user presence and cleanup.
Handles periodic cleanup of inactive users across all rooms.
"""
from __future__ import annotations

import time
import logging
from typing import Any

from flask import Flask

from ...extensions import db, socketio
from ...models import Room, RoomMembership, User
from .common import emit_presence

# Guard to ensure we start only one heartbeat thread
_heartbeat_thread_started: bool = False


def _heartbeat_cleanup_forever(app: Flask) -> None:
    """Background loop that periodically cleans up inactive users across all rooms and emits presence updates."""
    with app.app_context():
        interval = app.config.get("HEARTBEAT_INTERVAL_SECONDS", 20)
        pong_timeout = app.config.get("PONG_TIMEOUT_SECONDS", 20)

    while True:
        try:
            with app.app_context():
                cutoff_time = int(time.time()) - pong_timeout

                inactive_users = (
                    db.session.query(User)
                    .filter(User.active.is_(True))
                    .filter(User.last_seen < cutoff_time)
                    .all()
                )

                if not inactive_users:
                    socketio.sleep(interval)
                    continue

                affected_rooms = set[Any]()

                for user in inactive_users:
                    user_memberships = RoomMembership.query.filter_by(user_id=user.id).all()

                    for membership in user_memberships:
                        room = db.session.get(Room, membership.room_id)
                        if room:
                            affected_rooms.add(room.code)
                            logging.info(
                                "heartbeat: removing inactive user %s from room %s",
                                user.id,
                                room.code,
                            )
                            membership.leave()

                if inactive_users:
                    db.session.commit()
                    logging.info(
                        "heartbeat: cleaned up %s inactive user(s) from %s room(s)",
                        len(inactive_users),
                        len(affected_rooms),
                    )

                for room_code in affected_rooms:
                    room = Room.query.filter_by(code=room_code).first()
                    if room:
                        emit_presence(room)
        except Exception:
            logging.exception("heartbeat: error during cleanup cycle")

        socketio.sleep(interval)


def start_heartbeat_if_needed(app: Flask) -> None:
    """Start the global heartbeat cleanup task if not already running."""
    global _heartbeat_thread_started
    try:
        if _heartbeat_thread_started:
            return

        interval = app.config.get("HEARTBEAT_INTERVAL_SECONDS", 20)
        logging.info("starting global heartbeat cleanup thread (interval=%s seconds)", interval)
        socketio.start_background_task(_heartbeat_cleanup_forever, app)
        _heartbeat_thread_started = True
    except Exception:
        logging.exception("failed to start heartbeat cleanup thread")

