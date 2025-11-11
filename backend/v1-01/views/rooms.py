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
    # Create room
    room = Room(owner_id=user_id)
    db.session.add(room)
    db.session.flush()  # get room.id
    # Create initial queue for room
    queue = Queue(room_id=room.id, created_by_id=user_id)
    room.current_queue = queue
    db.session.add(room)
    db.session.add(queue)
    # Add membership for creator
    membership = RoomMembership(
        room_id=room.id,
        user_id=user_id,
        joined_at=int(time.time()),
        last_seen=int(time.time()),
        active=True,
        role="owner",
    )
    db.session.add(membership)
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

            # Add/refresh membership
            membership = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user_id
            ).first()
            now = int(time.time() * 1000)
            if not membership:
                membership = RoomMembership(
                    room_id=room.id,
                    user_id=user_id,
                    joined_at=now,
                    last_seen=now,
                    active=True,
                )
                db.session.add(membership)
            else:
                membership.active = True
                membership.last_seen = now
            db.session.commit()

            # Join the Socket.IO room and schedule a delayed presence update
            join_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
            socketio.emit(
                "user.join.result",
                {
                    "ok": True,
                    "code": room.code,
                    "snapshot": room.to_dict(),
                    "serverNowMs": now,
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
            membership.active = False
            membership.last_seen = int(time.time())
            db.session.commit()
            leave_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
        except Exception:
            logging.exception("room.leave handler error")
