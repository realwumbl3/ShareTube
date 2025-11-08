from __future__ import annotations

import time
import secrets
import string
from typing import Optional

import jwt
from flask import Blueprint, current_app, jsonify, request

from ..extensions import db, socketio
from ..models import Room, RoomMembership, User


rooms_bp = Blueprint("rooms", __name__, url_prefix="/api")


def _get_user_id_from_auth_header() -> Optional[int]:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(
                token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
            )
            sub = payload.get("sub")
            return int(sub) if sub is not None else None
        except Exception:
            return None
    return None


def _generate_room_code(length: int = 6) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


# codemeta[1]
def emit_presence(room: Room) -> None:
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


def emit_room_state_update(room: Room) -> None:
    socketio.emit(
        "room.state.update",
        {"state": room.state},
        room=f"room:{room.code}",
    )


@rooms_bp.post("/create_room")
def create_room():
    user_id = _get_user_id_from_auth_header()
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401

    # Ensure user exists
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "user_not_found"}), 404

    # Generate unique code
    code = _generate_room_code()
    for _ in range(5):
        if not Room.query.filter_by(code=code).first():
            break
        code = _generate_room_code()

    room = Room(code=code, owner_id=user_id)
    db.session.add(room)
    db.session.flush()  # get room.id

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
