from __future__ import annotations

import logging
import time

from flask import request

from ....extensions import socketio
from ....helpers.ws import (
    emit_function_after_delay,
    emit_to_user_sockets,
    get_user_id_from_socket,
)
from ....helpers.redis import (
    check_user_other_connections,
    get_user_socket_connections,
    remove_socket_connection,
    clear_user_verification,
)
from .common import (
    handle_user_disconnect,
    handle_user_disconnect_delayed,
)


def register() -> None:
    @socketio.on("disconnect")
    def _on_disconnect(*_args):
        try:
            user_id = get_user_id_from_socket()
            if not user_id:
                logging.warning("disconnect: no user_id found for disconnected socket")
                return
            
            remove_socket_connection(user_id, request.sid)
            has_other_connections = check_user_other_connections(user_id, request.sid)

            if has_other_connections:
                clear_user_verification(user_id)
                emit_to_user_sockets(
                    user_id,
                    "client.verify_connection",
                    {
                        "disconnected_socket_id": request.sid,
                        "timestamp": int(time.time()),
                    },
                )
                emit_function_after_delay(
                    handle_user_disconnect_delayed,
                    user_id,
                    delay_seconds=5.0,
                )
            else:
                handle_user_disconnect(user_id)
        except Exception:
            logging.exception("disconnect handler error")

