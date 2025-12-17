from __future__ import annotations

import logging
import time

from ....extensions import db, socketio
from ....models import User
from ....helpers.ws import get_user_id_from_socket


def register() -> None:
    @socketio.on("client.pong")
    def _on_client_pong(data: dict | None):
        try:
            user_id = get_user_id_from_socket()
            if not user_id:
                return

            user = db.session.get(User, user_id)
            if user:
                user.last_seen = int(time.time())
                db.session.commit()
        except Exception:
            logging.exception("client.pong handler error")

