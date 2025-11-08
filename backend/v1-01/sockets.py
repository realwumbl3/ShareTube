from __future__ import annotations

import time
from contextvars import ContextVar
from typing import Callable, Optional
from flask import Flask

import logging

import jwt
from flask import current_app, request
from flask_socketio import join_room, leave_room

from .extensions import db, socketio
from .models import Room, RoomMembership, User
from .views.rooms import emit_presence, emit_room_state_update
from .views.queue import emit_queue_update_for_room


def get_user_id_from_socket() -> Optional[int]:
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
        logging.exception("socket auth token decode failed")
        return None


def _emit_function_after_delay(
    function: Callable[[Room], None],
    room: Room,
    delay_seconds: float = 1.0,
) -> None:
    def background_task(context: ContextVar[Flask]) -> None:
        try:
            with context.app_context():
                function(room)
        except Exception:
            logging.exception("delayed function emission failed")
        socketio.sleep(delay_seconds)

    socketio.start_background_task(background_task, current_app._get_current_object())


# codemeta[1]
def register_socket_handlers() -> None:
    @socketio.on("join_room")
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
            now = int(time.time())
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

            _emit_function_after_delay(emit_presence, room, 0.1)
            _emit_function_after_delay(emit_queue_update_for_room, room, 0.1)
            _emit_function_after_delay(emit_room_state_update, room, 0.1)
        except Exception:
            logging.exception("join_room handler error")

    @socketio.on("leave_room")
    def _on_leave_room(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            user_id = get_user_id_from_socket()
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
            _emit_function_after_delay(emit_presence, room, 0.1)
        except Exception:
            logging.exception("leave_room handler error")

    @socketio.on("room.control.pause")
    def _on_room_control_pause(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            room = Room.query.filter_by(code=code).first()
            if not room:
                return
            room.state = "paused"
            db.session.commit()
            db.session.refresh(room)
            _emit_function_after_delay(emit_room_state_update, room, 0.4)
        except Exception:
            logging.exception("room.control.pause handler error")

    @socketio.on("room.control.play")
    def _on_room_control_play(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            room = Room.query.filter_by(code=code).first()
            if not room:
                return
            room.state = "playing"
            db.session.commit()
            db.session.refresh(room)
            _emit_function_after_delay(emit_room_state_update, room, 0.4)
        except Exception:
            logging.exception("room.control.play handler error")
