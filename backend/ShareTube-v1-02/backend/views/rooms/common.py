from __future__ import annotations

import logging
import time

from typing import Optional

from ...extensions import db, socketio
from ...models import Room, RoomMembership, User
from ...sockets import (
    emit_function_after_delay,
    get_user_socket_connections,
    has_user_been_verified,
)


def emit_presence(room: Room) -> None:
    rows = (
        db.session.query(User, RoomMembership.ready)
        .join(RoomMembership, RoomMembership.user_id == User.id)
        .filter(RoomMembership.room_id == room.id, User.active.is_(True))
        .all()
    )
    payload = [
        {
            "id": user.id,
            "name": user.name,
            "picture": user.picture,
            "ready": bool(ready),
        }
        for user, ready in rows
    ]
    socketio.emit("presence.update", payload, room=f"room:{room.code}")


def handle_user_disconnect(user_id: int) -> None:
    try:
        membership = RoomMembership.query.filter_by(user_id=user_id).first()
        if not membership:
            logging.debug("_handle_user_disconnect: no active membership for user %s", user_id)
            return

        room = membership.room
        logging.info("_handle_user_disconnect: removing user %s from room %s", user_id, room.code)
        membership.leave()
        db.session.commit()
        emit_function_after_delay(emit_presence, room, 0.1)
    except Exception:
        logging.exception("_handle_user_disconnect error")


def handle_user_disconnect_delayed(user_id: int) -> None:
    try:
        logging.debug("_handle_user_disconnect_delayed: checking user %s after verification delay", user_id)
        is_verified = has_user_been_verified(user_id)
        logging.info("_handle_user_disconnect_delayed: user %s verification check: %s", user_id, is_verified)
        if is_verified:
            logging.info("_handle_user_disconnect_delayed: user %s was verified by other connections, keeping in room", user_id)
            return

        active_connections = get_user_socket_connections(user_id)
        if active_connections:
            logging.info("_handle_user_disconnect_delayed: user %s now has %d active connections, skipping removal", user_id, len(active_connections))
            return

        membership = RoomMembership.query.filter_by(user_id=user_id).first()
        if not membership:
            logging.debug("_handle_user_disconnect_delayed: no active membership for user %s", user_id)
            return

        room = membership.room
        logging.info("_handle_user_disconnect_delayed: removing user %s from room %s after verification timeout", user_id, room.code)
        membership.leave()
        db.session.commit()
        emit_function_after_delay(emit_presence, room, 0.1)
    except Exception:
        logging.exception("_handle_user_disconnect_delayed error")

