from __future__ import annotations

import logging

from flask import request
from flask_socketio import leave_room

from ....extensions import db, socketio
from ....models import RoomMembership, Room
from ....ws.server import (
    emit_function_after_delay,
    check_user_other_connections,
    remove_socket_connection,
)
from .common import emit_presence
from ...middleware import require_room_by_code


def register() -> None:
    @socketio.on("room.leave")
    @require_room_by_code
    def _on_leave_room(room: Room, user_id: int, data: dict):
        try:
            logging.info("room.leave: code=%s user_id=%s", room.code, user_id)
            remove_socket_connection(user_id, request.sid)
            has_other_connections = check_user_other_connections(user_id, request.sid)
            if has_other_connections:
                logging.info(
                    "room.leave: user %s has other active connections, keeping membership",
                    user_id,
                )
                leave_room(f"room:{room.code}")
                return

            membership = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user_id
            ).first()
            if not membership:
                logging.info(
                    "room.leave: no membership found for user %s in room %s",
                    user_id,
                    room.code,
                )
                return

            membership.leave()
            db.session.commit()
            db.session.refresh(room)
            leave_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
        except Exception:
            logging.exception("room.leave handler error")

