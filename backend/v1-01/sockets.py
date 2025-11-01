from __future__ import annotations

import time
from typing import Optional

import jwt
from flask import current_app, request
from flask_socketio import join_room, leave_room

from .extensions import db, socketio
from .models import Room, RoomMembership, User


def _get_user_id_from_socket() -> Optional[int]:
    token = request.args.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        return int(sub) if sub is not None else None
    except Exception:
        current_app.logger.exception("socket auth token decode failed")
        return None


def _emit_presence(room: Room) -> None:
    # Query active memberships and include basic profile fields
    memberships = (
        db.session.query(RoomMembership).filter_by(room_id=room.id, active=True).all()
    )
    user_ids = [m.user_id for m in memberships]
    users = (
        db.session.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    )
    user_by_id = {u.id: u for u in users}
    payload = [
        {
            "id": uid,
            "name": (user_by_id.get(uid).name if user_by_id.get(uid) else ""),
            "picture": (user_by_id.get(uid).picture if user_by_id.get(uid) else ""),
        }
        for uid in user_ids
    ]
    socketio.emit("presence_update", payload, room=f"room:{room.code}")


def register_socket_handlers() -> None:
    @socketio.on("join_room")
    def _on_join_room(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            user_id = _get_user_id_from_socket()
            if not user_id:
                return
            room = Room.query.filter_by(code=code).first()
            if not room:
                return

            # Add/refresh membership
            membership = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user_id
            ).first()
            now = int(time.time())
            print(f"join_room: {code}, {user_id}, {now}")
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

            # Join the Socket.IO room and emit updated presence
            join_room(f"room:{room.code}")
            _emit_presence(room)
        except Exception:
            current_app.logger.exception("join_room handler error")

    @socketio.on("leave_room")
    def _on_leave_room(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            user_id = _get_user_id_from_socket()
            if not user_id:
                return
            print(f"leave_room: {code}, {user_id}")
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
            _emit_presence(room)
        except Exception:
            current_app.logger.exception("leave_room handler error")
