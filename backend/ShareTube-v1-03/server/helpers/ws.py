from __future__ import annotations

from contextvars import ContextVar
from typing import Callable, Optional, TYPE_CHECKING
from flask import Flask

import logging

import jwt
from flask import current_app, request

from ..extensions import socketio
from .redis import (
    get_user_socket_connections,
)

if TYPE_CHECKING:
    from ..models import Room


def get_user_id_from_socket() -> Optional[int]:
    token = request.args.get("token")
    logging.debug(f"get_user_id_from_socket: token present: {token is not None}")
    if token:
        logging.debug(f"get_user_id_from_socket: token length: {len(token)}, starts with: '{token[:50]}...'")
    else:
        logging.debug("get_user_id_from_socket: no token provided")
        return None

    if token.strip() == '':
        logging.debug("get_user_id_from_socket: empty token provided")
        return None

    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        logging.debug(f"get_user_id_from_socket: decoded sub: {sub}")

        # Handle mobile remote tokens (format: "mobile_remote:room_code:unique_id")
        if isinstance(sub, str) and sub.startswith("mobile_remote:"):
            logging.debug("get_user_id_from_socket: mobile remote token detected")
            # For mobile remotes, return None for user_id but allow the connection
            # The room.join handler will need to handle this case
            return None

        return int(sub) if sub is not None else None
    except jwt.exceptions.ExpiredSignatureError:
        logging.warning(f"socket auth token expired for token: '{token[:50]}...'")
        # Emit auth.expired event to notify client to clear sign-in state
        try:
            socketio.emit("auth.expired", {"reason": "token_expired"}, to=request.sid)
        except Exception:
            # If we can't emit (e.g., socket not fully connected), log and continue
            logging.debug("Could not emit auth.expired event (socket may not be ready)")
        return None
    except Exception as e:
        logging.exception(f"socket auth token decode failed for token: '{token}'")
        return None


def is_mobile_remote_socket() -> bool:
    """Check if the current socket connection is from a mobile remote."""
    token = request.args.get("token")
    if not token:
        return False
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        return isinstance(sub, str) and sub.startswith("mobile_remote:")
    except Exception:
        return False


def get_mobile_remote_room_code() -> Optional[str]:
    """Get the room code for a mobile remote connection."""
    token = request.args.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        if isinstance(sub, str) and sub.startswith("mobile_remote:"):
            parts = sub.split(":")
            if len(parts) >= 2:
                return parts[1]
        return payload.get("room_code")
    except Exception:
        return None


def get_mobile_remote_session_id() -> Optional[str]:
    """Get the session identifier for a mobile remote connection."""
    token = request.args.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        if isinstance(sub, str) and sub.startswith("mobile_remote:"):
            parts = sub.split(":")
            if len(parts) >= 3:
                return parts[2]  # The unique session ID part
        return None
    except Exception:
        return None


def emit_function_after_delay(
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


def emit_to_user_sockets(user_id: int, event: str, data: dict = None) -> None:
    """Emit a socket event to all connections of a specific user."""
    socket_ids = get_user_socket_connections(user_id)
    if socket_ids:
        data = data or {}
        for socket_id in socket_ids:
            socketio.emit(event, data, to=socket_id)
        logging.debug(f"emit_to_user_sockets: sent '{event}' to {len(socket_ids)} connections for user {user_id}")

