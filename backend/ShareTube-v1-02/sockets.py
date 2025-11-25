from __future__ import annotations

from contextvars import ContextVar
from typing import Callable, Optional, TYPE_CHECKING    
from flask import Flask

import logging

import jwt
from flask import current_app, request

from .extensions import socketio

if TYPE_CHECKING:
    from .models import Room


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
