from __future__ import annotations

import logging
import time

from typing import Optional

from ....extensions import db, socketio
from ....models import Room, RoomMembership, User
from ....helpers.ws import emit_function_after_delay
from ....helpers.redis import get_user_socket_connections, has_user_been_verified


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
            return

        room = membership.room
        user = db.session.get(User, membership.user_id)
        if user:
            user.last_seen = int(time.time())

        # Bulk delete avoids SAWarning when another code path already removed this membership.
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
        db.session.commit()
        emit_function_after_delay(emit_presence, room, 0.1)
    except Exception:
        logging.exception("_handle_user_disconnect error")


def handle_user_disconnect_delayed(user_id: int) -> None:
    try:
        is_verified = has_user_been_verified(user_id)
        if is_verified:
            return

        active_connections = get_user_socket_connections(user_id)
        if active_connections:
            return

        membership = RoomMembership.query.filter_by(user_id=user_id).first()
        if not membership:
            return

        room = membership.room
        user = db.session.get(User, membership.user_id)
        if user:
            user.last_seen = int(time.time())

        # Bulk delete avoids SAWarning when another code path already removed this membership.
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
        db.session.commit()
        emit_function_after_delay(emit_presence, room, 0.1)
    except Exception:
        logging.exception("_handle_user_disconnect_delayed error")

