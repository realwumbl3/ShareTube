from __future__ import annotations

import logging
import time

from flask import request
from flask_socketio import join_room

from ....extensions import db, socketio
from ....models import Room, RoomMembership, User
from ....helpers.ws import (
    emit_function_after_delay,
    get_mobile_remote_room_code,
    get_user_id_from_socket,
    is_mobile_remote_socket,
)
from ....helpers.redis import track_socket_connection, clear_user_verification
from ....lib.utils import now_ms
from .common import emit_presence


def register() -> None:
    @socketio.on("room.join")
    def _on_join_room(data: dict):
        try:

            client_timestamp = (data or {}).get("clientTimestamp")

            if is_mobile_remote_socket():
                room_code = get_mobile_remote_room_code()
                if not room_code:
                    socketio.emit("room.error", {"error": "Invalid mobile remote token"})
                    return

                room = Room.query.filter_by(code=room_code).first()
                if not room:
                    socketio.emit("room.error", {"error": "Room not found"})
                    return

                join_room(f"room:{room.code}")
                socketio.emit(
                    "room.joined",
                    {
                        "ok": True,
                        "code": room.code,
                        "snapshot": room.to_dict(),
                        "serverNowMs": now_ms(),
                        "clientTimestamp": client_timestamp,
                    },
                    to=request.sid,
                )
                return

            user_id = get_user_id_from_socket()
            if not user_id:
                socketio.emit("room.error", {"error": "Authentication required"})
                return

            code = (data or {}).get("code")
            if not code:
                socketio.emit("room.error", {"error": "Room code required"})
                return

            room = Room.query.filter_by(code=code).first()
            if not room:
                socketio.emit("room.error", {"error": "Room not found"})
                return

            track_socket_connection(user_id, request.sid)
            clear_user_verification(user_id)
            membership = (
                db.session.query(RoomMembership)
                .filter_by(room_id=room.id, user_id=user_id)
                .first()
            )
            now_ts = int(time.time())
            room_in_starting = room.state in ("starting", "midroll")

            user = db.session.get(User, user_id)
            if user:
                user.last_seen = now_ts
                user.active = True

            if not membership:
                membership = RoomMembership(
                    room_id=room.id,
                    user_id=user_id,
                    joined_at=now_ts,
                    ready=False,
                )
                db.session.add(membership)
            elif room_in_starting:
                membership.ready = False
            db.session.commit()

            join_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
            socketio.emit(
                "user.join.result",
                {
                    "ok": True,
                    "code": room.code,
                    "snapshot": room.to_dict(),
                    "serverNowMs": now_ms(),
                    "clientTimestamp": client_timestamp,
                },
                to=request.sid,
            )
        except Exception:
            logging.exception("room.join handler error")
            socketio.emit("room.error", {"error": "Failed to join room"})

