from __future__ import annotations

import logging

from flask import request

from ....extensions import db, socketio
from ....models import Room
from ...middleware import require_room_by_code


def register() -> None:
    @socketio.on("room.settings.autoadvance_on_end.set")
    @require_room_by_code
    def _on_room_settings_autoadvance_on_end_set(room: Room, user_id: int, data: dict):
        try:
            is_owner = room.owner_id == user_id
            is_operator = any(operator.user_id == user_id for operator in room.operators)
            if not (is_owner or is_operator):
                socketio.emit(
                    "room.error",
                    {
                        "error": "room.settings.autoadvance_on_end.set: insufficient permissions",
                        "code": room.code,
                    },
                    to=request.sid,
                )
                return

            autoadvance_value = (data or {}).get("autoadvance_on_end")
            if not isinstance(autoadvance_value, bool):
                socketio.emit(
                    "room.error",
                    {
                        "error": "room.settings.autoadvance_on_end.set: autoadvance_on_end must be a boolean",
                        "code": room.code,
                    },
                    to=request.sid,
                )
                return

            room.autoadvance_on_end = autoadvance_value
            db.session.commit()

            socketio.emit(
                "room.settings.update",
                {"autoadvance_on_end": autoadvance_value, "code": room.code},
                room=f"room:{room.code}",
            )
        except Exception:
            logging.exception("room.settings.autoadvance_on_end.set handler error")

