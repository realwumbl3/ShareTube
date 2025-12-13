from __future__ import annotations

from flask import request

import logging

from ...extensions import socketio
from ...utils import now_ms


def register() -> None:
    @socketio.on("time.sync")
    def _on_time_sync(data: dict | None):
        try:
            payload = data or {}
            client_timestamp = payload.get("clientTimestamp")
            sample_id = payload.get("sampleId")
            socketio.emit(
                "time.sync.response",
                {
                    "serverNowMs": now_ms(),
                    "clientTimestamp": client_timestamp,
                    "sampleId": sample_id,
                },
                to=request.sid,
            )
        except Exception:
            logging.exception("time.sync handler error")

