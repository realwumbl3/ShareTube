from __future__ import annotations

import logging

from ....extensions import socketio
from ....helpers.ws import get_user_id_from_socket
from ....helpers.redis import set_user_verification_received


def register() -> None:
    @socketio.on("client.verification_response")
    def _on_client_verification_response(data: dict | None):
        try:
            user_id = get_user_id_from_socket()
            if not user_id:
                return
            set_user_verification_received(user_id)
        except Exception:
            logging.exception("client.verification_response handler error")

