from __future__ import annotations

import logging
import time

from flask import request
from flask_socketio import leave_room

from ....extensions import db, socketio
from ....models import RoomMembership, Room, User
from ....helpers.ws import emit_function_after_delay
from ....helpers.redis import check_user_other_connections, remove_socket_connection
from .common import emit_presence
from ...middleware import require_room_by_code


def register() -> None:
    @socketio.on("room.leave")
    @require_room_by_code
    def _on_leave_room(room: Room, user_id: int, data: dict):
        try:
            remove_socket_connection(user_id, request.sid)
            has_other_connections = check_user_other_connections(user_id, request.sid)
            if has_other_connections:
                leave_room(f"room:{room.code}")
                return

            membership = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user_id
            ).first()
            if not membership:
                return

            user = db.session.get(User, membership.user_id)
            if user:
                user.last_seen = int(time.time())

            db.session.delete(membership)

            other_memberships = (
                db.session.query(RoomMembership)
                .filter_by(user_id=membership.user_id)
                .first()
            )
            if not other_memberships and user:
                user.active = False
            db.session.commit()
            db.session.refresh(room)
            leave_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
        except Exception:
            logging.exception("room.leave handler error")

