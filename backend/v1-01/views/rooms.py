from __future__ import annotations

import time
import logging

from flask import Blueprint, jsonify
from flask_socketio import join_room, leave_room

from ..sockets import emit_function_after_delay, get_user_id_from_socket

from ..app import get_user_id_from_auth_header
from ..extensions import db, socketio
from ..models import Room, RoomMembership, User, Queue


rooms_bp = Blueprint("rooms", __name__, url_prefix="/api")


def emit_presence(room: Room) -> None:
    payload = [
        u.to_dict()
        for u in (
            db.session.query(User)
            .join(RoomMembership, RoomMembership.user_id == User.id)
            .filter(RoomMembership.room_id == room.id, RoomMembership.active.is_(True))
            .all()
        )
    ]
    socketio.emit("presence.update", payload, room=f"room:{room.code}")


@rooms_bp.post("/room.create")
def room_create():
    user_id = get_user_id_from_auth_header()
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401
    # Ensure user exists
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "user_not_found"}), 404
    # Create room using model method
    room = Room.create(owner_id=user_id)
    db.session.commit()

    return jsonify({"code": room.code})


def register_socket_handlers() -> None:
    @socketio.on("room.join")
    def _on_join_room(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            user_id = get_user_id_from_socket()
            if not user_id:
                return
            room = Room.query.filter_by(code=code).first()
            if not room:
                return

            # Join room using model method
            RoomMembership.join_room(room, user_id)
            db.session.commit()

            # Join the Socket.IO room and schedule a delayed presence update
            now_ms = int(time.time() * 1000)
            join_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
            socketio.emit(
                "user.join.result",
                {
                    "ok": True,
                    "code": room.code,
                    "snapshot": room.to_dict(),
                    "serverNowMs": now_ms,
                },
                room=f"room:{room.code}",
            )
        except Exception:
            logging.exception("room.join handler error")

    @socketio.on("room.leave")
    def _on_leave_room(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            user_id = get_user_id_from_socket()
            if not user_id:
                return
            print(f"room.leave: {code}, {user_id}")
            room = Room.query.filter_by(code=code).first()
            if not room:
                return
            membership = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user_id
            ).first()
            if not membership:
                return
            membership.leave()
            db.session.commit()
            leave_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
        except Exception:
            logging.exception("room.leave handler error")
