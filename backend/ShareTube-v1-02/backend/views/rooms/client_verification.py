from __future__ import annotations

import logging

from ...extensions import socketio
from ...sockets import get_user_id_from_socket, set_user_verification_received


def register() -> None:
    @socketio.on("client.verification_response")
    def _on_client_verification_response(data: dict | None):
        try:
            logging.info("client.verification_response: received payload=%s", data)
            user_id = get_user_id_from_socket()
            logging.info("client.verification_response: extracted user_id=%s", user_id)
            if not user_id:
                logging.warning("client.verification_response: no user_id found")
                return

            logging.info(
                "client.verification_response: VERIFICATION RESPONSE from user %s for disconnected socket %s",
                user_id,
                data.get("disconnected_socket_id") if data else "unknown",
            )
            set_user_verification_received(user_id)
            logging.info(
                "client.verification_response: verification flag set for user %s",
                user_id,
            )
        except Exception:
            logging.exception("client.verification_response handler error")

