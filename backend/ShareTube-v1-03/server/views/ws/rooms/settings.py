from __future__ import annotations

import logging

from flask import request

from ....extensions import db, socketio
from ....models import Room
from ...middleware import require_room_by_code


def register() -> None:
    @socketio.on("room.settings.set")
    @require_room_by_code
    def _on_room_settings_set(room: Room, user_id: int, data: dict):
        try:
            is_owner = room.owner_id == user_id
            is_operator = any(operator.user_id == user_id for operator in room.operators)
            if not (is_owner or is_operator):
                socketio.emit(
                    "room.error",
                    {
                        "error": "room.settings.set: insufficient permissions",
                        "code": room.code,
                    },
                    to=request.sid,
                )
                return

            setting_name = (data or {}).get("setting")
            setting_value = (data or {}).get("value")

            if not setting_name:
                socketio.emit(
                    "room.error",
                    {
                        "error": "room.settings.set: setting name is required",
                        "code": room.code,
                    },
                    to=request.sid,
                )
                return

            # Validate setting based on type
            if setting_name == "autoadvance_on_end":
                if not isinstance(setting_value, bool):
                    socketio.emit(
                        "room.error",
                        {
                            "error": "room.settings.set: autoadvance_on_end must be a boolean",
                            "code": room.code,
                        },
                        to=request.sid,
                    )
                    return
                room.autoadvance_on_end = setting_value

            elif setting_name == "is_private":
                if not isinstance(setting_value, bool):
                    socketio.emit(
                        "room.error",
                        {
                            "error": "room.settings.set: is_private must be a boolean",
                            "code": room.code,
                        },
                        to=request.sid,
                    )
                    return
                room.is_private = setting_value

            elif setting_name == "ad_sync_mode":
                valid_modes = ["off", "pause_all", "operators_only", "starting_only"]
                if setting_value not in valid_modes:
                    socketio.emit(
                        "room.error",
                        {
                            "error": f"room.settings.set: ad_sync_mode must be one of {valid_modes}",
                            "code": room.code,
                        },
                        to=request.sid,
                    )
                    return
                room.ad_sync_mode = setting_value

            else:
                socketio.emit(
                    "room.error",
                    {
                        "error": f"room.settings.set: unknown setting '{setting_name}'",
                        "code": room.code,
                    },
                    to=request.sid,
                )
                return

            db.session.commit()

            socketio.emit(
                "room.settings.update",
                {"setting": setting_name, "value": setting_value, "code": room.code},
                room=f"room:{room.code}",
            )
        except Exception:
            logging.exception("room.settings.set handler error")

