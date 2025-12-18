from __future__ import annotations

import time

from flask import Blueprint, jsonify, request

from .common import emit_presence
from .heartbeat import start_heartbeat_if_needed
from .... import get_user_id_from_auth_header
from ....extensions import db
from ....models import Queue, Room, RoomMembership, User

rooms_bp = Blueprint("rooms", __name__, url_prefix="/api")


@rooms_bp.route("/room.create", methods=["POST", "OPTIONS"])
def room_create():
    if request.method == "OPTIONS":
        # Handle CORS preflight request
        return "", 200

    user_id = get_user_id_from_auth_header()
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "user_not_found"}), 404
    room = Room(owner_id=user_id)
    db.session.add(room)
    db.session.flush()

    queue = Queue(room_id=room.id, created_by_id=user_id)
    room.current_queue = queue
    db.session.add(queue)

    user.last_seen = int(time.time())
    user.active = True

    membership = RoomMembership(
        room_id=room.id,
        user_id=user_id,
        joined_at=int(time.time()),
        role="owner",
    )
    db.session.add(membership)
    db.session.commit()
    return jsonify({"code": room.code})


from .join import register as register_room_join
from .leave import register as register_room_leave
from .user_ready import register as register_user_ready
from .client_verification import register as register_client_verification
from .client_pong import register as register_client_pong
from .settings import register as register_settings
from .disconnect import register as register_disconnect

__all__ = [
    "rooms_bp",
    "register_socket_handlers",
    "emit_presence",
    "start_heartbeat_if_needed",
]


def register_socket_handlers() -> None:
    register_room_join()
    register_room_leave()
    register_user_ready()
    register_client_verification()
    register_client_pong()
    register_settings()
    register_disconnect()

