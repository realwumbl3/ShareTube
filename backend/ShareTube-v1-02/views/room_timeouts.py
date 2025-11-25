"""
Helper module for managing room state timeout transitions.
Handles scheduling and cancellation of starting -> playing transitions.
Uses Redis to track timeout state across multiple processes/threads.
"""
from __future__ import annotations

import logging
import time
from urllib.parse import urlparse

from flask import Flask, current_app

from ..extensions import db, socketio
from ..models import Room
from ..utils import now_ms


def _get_redis_client():
    """
    Get a Redis client using the same connection as SocketIO message queue.
    Returns None if Redis is not configured.
    """
    try:
        import redis
    except ImportError:
        logging.warning("redis module not available, timeout tracking will not work across processes")
        return None
    
    message_queue_url = current_app.config.get("SOCKETIO_MESSAGE_QUEUE", "")
    if not message_queue_url:
        logging.warning("SOCKETIO_MESSAGE_QUEUE not configured, timeout tracking will not work across processes")
        return None
    
    try:
        # Parse Redis URL (format: redis://host:port/db or redis://:password@host:port/db)
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
        
        redis_client = redis.Redis(
            host=host,
            port=port,
            db=db_num,
            password=password,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        # Test connection
        redis_client.ping()
        return redis_client
    except Exception as e:
        logging.warning(f"Failed to connect to Redis for timeout tracking: {e}")
        return None


def _get_timeout_key(room_code: str) -> str:
    """Get Redis key for tracking timeout state."""
    return f"room:starting_timeout:{room_code}"


def schedule_starting_to_playing_timeout(room_code: str, delay_seconds: float = 30.0) -> None:
    """
    Schedule a background task to transition room from 'starting' to 'playing' after delay.
    Cancels any existing timeout for the same room.
    Uses Redis to track timeout state across processes.
    """
    # Cancel any existing timeout for this room
    cancel_starting_timeout(room_code)
    
    # Set Redis key to track this timeout (with expiration slightly longer than delay)
    redis_client = _get_redis_client()
    timeout_key = _get_timeout_key(room_code)
    if redis_client:
        try:
            # Store timestamp when timeout was scheduled
            redis_client.setex(timeout_key, int(delay_seconds) + 5, str(time.time()))
        except Exception as e:
            logging.warning(f"room_timeout: failed to set Redis key for {room_code}: {e}")
    
    # Capture the app instance for use in the background task
    app = current_app._get_current_object()
    
    def transition_task(app_instance: Flask) -> None:
        """Background task that transitions room from starting to playing."""
        try:
            with app_instance.app_context():
                # Sleep for the delay
                socketio.sleep(delay_seconds)
                
                # Check Redis to see if timeout was cancelled
                # Need to get Redis client within app context
                redis_client = None
                try:
                    message_queue_url = app_instance.config.get("SOCKETIO_MESSAGE_QUEUE", "")
                    if message_queue_url:
                        import redis
                        from urllib.parse import urlparse
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
                        redis_client = redis.Redis(
                            host=host,
                            port=port,
                            db=db_num,
                            password=password,
                            decode_responses=True,
                            socket_connect_timeout=2,
                        )
                        redis_client.ping()
                except Exception as e:
                    logging.warning(f"room_timeout: Redis connection failed in task: {e}")
                
                timeout_key = _get_timeout_key(room_code)
                if redis_client:
                    try:
                        if not redis_client.exists(timeout_key):
                            logging.info(f"room_timeout: timeout for room {room_code} was cancelled (Redis key missing)")
                            return
                        # Delete the key since we're about to execute
                        redis_client.delete(timeout_key)
                    except Exception as e:
                        logging.warning(f"room_timeout: Redis check failed for {room_code}: {e}")
                        # Continue anyway - we'll check room state below
                
                # Check if room is still in starting state
                room = Room.query.filter_by(code=room_code).first()
                if not room:
                    logging.info(f"room_timeout: room {room_code} not found, skipping transition")
                    return
                
                if room.state != "starting":
                    logging.info(
                        f"room_timeout: room {room_code} state is '{room.state}', not 'starting', skipping transition"
                    )
                    return

                # Transition to playing
                _now_ms = now_ms()
                room.state = "playing"
                
                # Set playing_since_ms on current entry
                current_entry = None
                if room.current_queue and room.current_queue.current_entry:
                    current_entry = room.current_queue.current_entry
                    current_entry.playing_since_ms = _now_ms
                    current_entry.paused_at = None
                
                db.session.commit()
                db.session.refresh(room)
                if current_entry:
                    db.session.refresh(current_entry)
                
                # Emit playback event
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
                
                logging.info(f"room_timeout: transitioned room {room_code} from 'starting' to 'playing'")
        except Exception:
            logging.exception(f"room_timeout: error transitioning room {room_code}")
    
    # Start the background task with the app instance
    socketio.start_background_task(transition_task, app)
    logging.info(f"room_timeout: scheduled transition for room {room_code} in {delay_seconds} seconds")


def cancel_starting_timeout(room_code: str) -> None:
    """
    Cancel any pending timeout for the given room.
    Deletes the Redis key so the timeout task will skip execution.
    """
    redis_client = _get_redis_client()
    timeout_key = _get_timeout_key(room_code)
    if redis_client:
        try:
            deleted = redis_client.delete(timeout_key)
            if deleted:
                logging.info(f"room_timeout: cancelled pending timeout for room {room_code}")
        except Exception as e:
            logging.warning(f"room_timeout: failed to cancel timeout for {room_code}: {e}")

