from __future__ import annotations

from contextvars import ContextVar
import traceback
from typing import Callable, Optional
from flask import Flask

import logging

import jwt
from flask import current_app, request

from ..extensions import socketio
from .redis import (
    get_user_socket_connections,
)


def get_user_id_from_socket() -> Optional[int]:
    try:
        token = request.args.get("token")
        if not token:
            return None
        payload = jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
        sub = payload.get("sub")
        return int(sub) if sub is not None else None
    except Exception:
        logging.exception("get_user_id_from_socket: failed to get user id from socket")
        return None


def emit_function_after_delay(
    function: Callable[..., None],
    *args,
    delay_seconds: float = 1.0,
) -> None:
    def background_task(context: ContextVar[Flask]) -> None:
        socketio.sleep(delay_seconds)
        try:
            with context.app_context():
                function(*args)
        except Exception:
            trace = traceback.format_exc()
            logging.error("emit_function_after_delay: delayed function emission failed (function=%s, args=%s, trace=%s)", function, args, trace)

    socketio.start_background_task(background_task, current_app._get_current_object())


def emit_to_user_sockets(user_id: int, event: str, data: dict = None) -> None:
    """Emit a socket event to all connections of a specific user."""
    socket_ids = get_user_socket_connections(user_id)
    if socket_ids:
        data = data or {}
        for socket_id in socket_ids:
            socketio.emit(event, data, to=socket_id)

