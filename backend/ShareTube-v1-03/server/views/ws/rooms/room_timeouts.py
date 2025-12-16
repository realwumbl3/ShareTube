"""
Helper module for managing room state timeout transitions.
Handles scheduling and cancellation of starting -> playing transitions.
Uses Redis to track timeout state across multiple processes/threads.
"""
from __future__ import annotations

import logging
import time
import redis
from urllib.parse import urlparse

from flask import Flask, current_app

from ....extensions import db, socketio
from ....lib.utils import get_redis_client, now_ms
from ....models import Room


def _get_timeout_key(room_code: str) -> str:
    """Get Redis key for tracking timeout state."""
    return f"room:starting_timeout:{room_code}"


def schedule_starting_to_playing_timeout(room_code: str, delay_seconds: float = 30.0) -> None:
    """
    Schedule a background task to transition room from 'starting' to 'playing' after delay.
    Cancels any existing timeout for the same room.
    Uses Redis to track timeout state across processes.
    """
    cancel_starting_timeout(room_code)

    redis_client = get_redis_client()
    timeout_key = _get_timeout_key(room_code)
    if redis_client:
        try:
            redis_client.setex(timeout_key, int(delay_seconds) + 5, str(time.time()))
        except Exception as e:
            logging.warning(f"room_timeout: failed to set Redis key for {room_code}: {e}")

    app = current_app._get_current_object()

    def transition_task(app_instance: Flask) -> None:
        """Background task that transitions room from starting to playing."""
        try:
            with app_instance.app_context():
                socketio.sleep(delay_seconds)

                redis_client_inner = None
                try:
                    message_queue_url = app_instance.config.get("SOCKETIO_MESSAGE_QUEUE", "")
                    if message_queue_url:
                        parsed = urlparse(message_queue_url)
                        host = parsed.hostname or "localhost"
                        port = parsed.port or 6379
                        db_num = 0
                        if parsed.path:
                            try:
                                db_num = int(parsed.path.lstrip("/"))
                            except ValueError:
                                pass
                        password = parsed.password if parsed.password else None
                        redis_client_inner = redis.Redis(
                            host=host,
                            port=port,
                            db=db_num,
                            password=password,
                            decode_responses=True,
                            socket_connect_timeout=2,
                        )
                        redis_client_inner.ping()
                except Exception as e:
                    logging.warning(f"room_timeout: Redis connection failed in task: {e}")

                timeout_key_inner = _get_timeout_key(room_code)
                if redis_client_inner:
                    try:
                        if not redis_client_inner.exists(timeout_key_inner):
                            return
                        redis_client_inner.delete(timeout_key_inner)
                    except Exception as e:
                        logging.warning(
                            f"room_timeout: Redis check failed for {room_code}: {e}"
                        )

                room = Room.query.filter_by(code=room_code).first()
                if not room:
                    return

                if room.state != "starting":
                    return

                _now_ms = now_ms()
                room.state = "playing"

                current_entry = (
                    room.current_queue.current_entry
                    if room.current_queue and room.current_queue.current_entry
                    else None
                )
                if current_entry:
                    current_entry.playing_since_ms = _now_ms
                    current_entry.paused_at = None

                db.session.commit()
                db.session.refresh(room)
                if current_entry:
                    db.session.refresh(current_entry)

                socketio.emit(
                    "room.playback",
                    {
                        "trigger": "starting_timeout",
                        "code": room_code,
                        "state": "playing",
                        "playing_since_ms": _now_ms,
                        "progress_ms": current_entry.progress_ms if current_entry else 0,
                        "actor_user_id": None,
                    },
                    room=f"room:{room_code}",
                )

        except Exception:
            logging.exception(f"room_timeout: error transitioning room {room_code}")

    socketio.start_background_task(transition_task, app)


def cancel_starting_timeout(room_code: str) -> None:
    """
    Cancel any pending timeout for the given room.
    Deletes the Redis key so the timeout task will skip execution.
    """
    redis_client = get_redis_client()
    timeout_key = _get_timeout_key(room_code)
    if redis_client:
        try:
            redis_client.delete(timeout_key)
        except Exception as e:
            logging.warning(
                f"room_timeout: failed to cancel timeout for {room_code}: {e}"
            )

