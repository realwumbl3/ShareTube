from __future__ import annotations

import time
import logging
from typing import Optional    

from flask import Blueprint, jsonify
from flask_socketio import join_room, leave_room

from ..utils import now_ms
from ..sockets import emit_function_after_delay, get_user_id_from_socket

from ..app import get_user_id_from_auth_header
from ..extensions import db, socketio
from ..models import Room, RoomMembership, User
from .room_timeouts import cancel_starting_timeout

from .decorators import require_room_by_code, require_room
from ..sockets import is_mobile_remote_socket, get_mobile_remote_room_code

rooms_bp = Blueprint("rooms", __name__, url_prefix="/api")


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
    def _on_join_room(data: dict):
        try:
            logging.debug(f"room.join: data={data}, is_mobile_remote={is_mobile_remote_socket()}")

            # Handle mobile remote connections differently
            if is_mobile_remote_socket():
                logging.debug("room.join: handling as mobile remote")
                room_code = get_mobile_remote_room_code()
                logging.debug(f"room.join: mobile remote room_code={room_code}")
                if not room_code:
                    socketio.emit("room.error", {"error": "Invalid mobile remote token"})
                    return

                room = Room.query.filter_by(code=room_code).first()
                if not room:
                    socketio.emit("room.error", {"error": "Room not found"})
                    return

                # For mobile remotes, just join the Socket.IO room without creating membership
                join_room(f"room:{room.code}")
                socketio.emit(
                    "room.joined",
                    {
                        "ok": True,
                        "code": room.code,
                        "snapshot": room.to_dict(),
                        "serverNowMs": now_ms(),
                    },
                    room=f"room:{room.code}",
                )
                return

            # Normal user room join
            logging.debug("room.join: handling as normal user")
            user_id = get_user_id_from_socket()
            logging.debug(f"room.join: user_id={user_id}")
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

            # Join room using model method
            RoomMembership.join_room(room, user_id)

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
                    "serverNowMs": now_ms(),
                },
                room=f"room:{room.code}",
            )
        except Exception:
            logging.exception("room.join handler error")
            socketio.emit("room.error", {"error": "Failed to join room"})

    @socketio.on("room.leave")
    @require_room_by_code
    def _on_leave_room(room: Room, user_id: int, data: dict):
        try:
            logging.info("room.leave: code=%s user_id=%s", room.code, user_id)
            membership = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user_id
            ).first()
            if not membership:
                logging.info("room.leave: no membership found for user %s in room %s", user_id, room.code)
                return
            membership.leave()
            db.session.commit()
            db.session.refresh(room)
            leave_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
        except Exception:
            logging.exception("room.leave handler error")

    @socketio.on("user.ready")
    @require_room
    def _on_user_ready(room: Room, user_id: int, data: dict):
        res, _ = Room.emit(room.code, trigger="user.ready")
        try:

            logging.info(
                "user.ready received: room=%s user_id=%s incoming_ready=%s room.state=%s",
                room.code,
                user_id,
                bool((data or {}).get("ready")),
                room.state,
            )
            membership = (
                db.session.query(RoomMembership)
                .join(User, RoomMembership.user_id == User.id)
                .filter(RoomMembership.room_id == room.id, RoomMembership.user_id == user_id)
                .filter(User.active.is_(True))
                .first()
            )
            if not membership:
                return

            ready = bool((data or {}).get("ready"))

            membership.set_ready(ready)
            db.session.flush()


            socketio.emit(
                "user.ready.update",
                {"user_id": user_id, "ready": ready},
                room=f"room:{room.code}",
            )

            current_entry = (
                room.current_queue.current_entry
                if room.current_queue and room.current_queue.current_entry
                else None
            )

            all_users_ready = room.are_all_users_ready()
            logging.info(
                "user.ready: eval transition -> all_users_ready=%s room.state=%s this_user_ready=%s current_entry_id=%s",
                all_users_ready,
                room.state,
                ready,
                getattr(current_entry, "id", None),
            )

            should_transition = (
                ready
                and room.state == "starting"
                and current_entry is not None
                and all_users_ready
            )
            logging.info("user.ready: should_transition=%s", should_transition)
            playback_payload = None
            if should_transition:
                cancel_starting_timeout(room.code)
                _now_ms = now_ms()
                room.state = "playing"
                current_entry.status = "playing"
                current_entry.playing_since_ms = _now_ms
                current_entry.paused_at = None
                playback_payload = {
                    "state": "playing",
                    "playing_since_ms": _now_ms,
                    "progress_ms": current_entry.progress_ms if current_entry else 0,
                    "current_entry": current_entry.to_dict(),
                    "actor_user_id": user_id,
                }

            db.session.commit()

            if playback_payload:
                res("room.playback", playback_payload)
        except Exception:
            logging.exception("user.ready handler error")

    @socketio.on("client.pong")
    def _on_client_pong(data: Optional[dict]):
        """Handle client heartbeat events to update user last_seen timestamp for health checks."""
        try:
            logging.debug("client.pong: received heartbeat payload=%s", data)
            user_id = get_user_id_from_socket()
            if not user_id:
                return

            # Update last_seen timestamp for the user
            user = db.session.get(User, user_id)
            if user:
                user.last_seen = int(time.time())
                db.session.commit()
                logging.debug("client.pong: updated last_seen for user %s", user_id)
        except Exception:
            logging.exception("client.pong handler error")
