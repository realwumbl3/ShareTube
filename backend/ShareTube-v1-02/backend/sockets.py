from __future__ import annotations

from contextvars import ContextVar
from typing import Callable, Optional, TYPE_CHECKING
from flask import Flask
from flask_socketio import disconnect

import logging
import time

import jwt
from flask import current_app, request

from .extensions import socketio
from .utils import get_redis_client

if TYPE_CHECKING:
    from .models import Room

# Redis-based tracking for active socket connections per user


def get_user_id_from_socket() -> Optional[int]:
    token = request.args.get("token")
    logging.debug(f"get_user_id_from_socket: token present: {token is not None}")
    if token:
        logging.debug(f"get_user_id_from_socket: token length: {len(token)}, starts with: '{token[:50]}...'")
    else:
        logging.debug("get_user_id_from_socket: no token provided")
        return None

    if token.strip() == '':
        logging.debug("get_user_id_from_socket: empty token provided")
        return None

    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        logging.debug(f"get_user_id_from_socket: decoded sub: {sub}")

        # Handle mobile remote tokens (format: "mobile_remote:room_code:unique_id")
        if isinstance(sub, str) and sub.startswith("mobile_remote:"):
            logging.debug("get_user_id_from_socket: mobile remote token detected")
            # For mobile remotes, return None for user_id but allow the connection
            # The room.join handler will need to handle this case
            return None

        return int(sub) if sub is not None else None
    except jwt.exceptions.ExpiredSignatureError:
        logging.warning(f"socket auth token expired for token: '{token[:50]}...'")
        # Emit auth.expired event to notify client to clear sign-in state
        try:
            socketio.emit("auth.expired", {"reason": "token_expired"}, to=request.sid)
        except Exception:
            # If we can't emit (e.g., socket not fully connected), log and continue
            logging.debug("Could not emit auth.expired event (socket may not be ready)")
        return None
    except Exception as e:
        logging.exception(f"socket auth token decode failed for token: '{token}'")
        return None


def is_mobile_remote_socket() -> bool:
    """Check if the current socket connection is from a mobile remote."""
    token = request.args.get("token")
    if not token:
        return False
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        return isinstance(sub, str) and sub.startswith("mobile_remote:")
    except Exception:
        return False


def get_mobile_remote_room_code() -> Optional[str]:
    """Get the room code for a mobile remote connection."""
    token = request.args.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        if isinstance(sub, str) and sub.startswith("mobile_remote:"):
            parts = sub.split(":")
            if len(parts) >= 2:
                return parts[1]
        return payload.get("room_code")
    except Exception:
        return None


def get_mobile_remote_session_id() -> Optional[str]:
    """Get the session identifier for a mobile remote connection."""
    token = request.args.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        if isinstance(sub, str) and sub.startswith("mobile_remote:"):
            parts = sub.split(":")
            if len(parts) >= 3:
                return parts[2]  # The unique session ID part
        return None
    except Exception:
        return None


def _get_user_connections_key(user_id: int) -> str:
    """Get Redis key for tracking user socket connections."""
    return f"user:sockets:{user_id}"


def _get_user_verification_key(user_id: int) -> str:
    """Get Redis key for tracking user verification status."""
    return f"user:verification:{user_id}"


def set_user_verification_received(user_id: int) -> None:
    """Mark that user has responded to verification (preventing delayed removal)."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_verification_key(user_id)
        try:
            # Set verification flag with short expiration (longer than disconnect delay)
            redis_client.setex(key, 30, "verified")  # 30 seconds
            logging.debug(f"set_user_verification_received: marked user {user_id} as verified")
        except Exception as e:
            logging.warning(f"Failed to set verification flag in Redis: {e}")


def clear_user_verification(user_id: int) -> None:
    """Clear user's verification status."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_verification_key(user_id)
        try:
            redis_client.delete(key)
            logging.debug(f"clear_user_verification: cleared verification for user {user_id}")
        except Exception as e:
            logging.warning(f"Failed to clear verification flag in Redis: {e}")


def has_user_been_verified(user_id: int) -> bool:
    """Check if user has been verified (responded to verification request)."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_verification_key(user_id)
        try:
            result = redis_client.exists(key)
            verified = bool(result)
            logging.debug(f"has_user_been_verified: user {user_id} verified={verified}")
            return verified
        except Exception as e:
            logging.warning(f"Failed to check verification flag in Redis: {e}")
            return False
    return False


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


def track_socket_connection(user_id: int, socket_id: str) -> None:
    """Track a socket connection for a user using Redis."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_connections_key(user_id)
        try:
            # Add socket_id to the set and set expiration to 24 hours
            redis_client.sadd(key, socket_id)
            redis_client.expire(key, 86400)  # 24 hours
            connection_count = redis_client.scard(key)
            logging.debug(f"track_socket_connection: user {user_id} now has {connection_count} connections")
        except Exception as e:
            logging.warning(f"Failed to track socket connection in Redis: {e}")
    else:
        logging.warning("track_socket_connection: Redis not available, socket tracking disabled")


def remove_socket_connection(user_id: int, socket_id: str) -> None:
    """Remove a socket connection for a user using Redis."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_connections_key(user_id)
        try:
            redis_client.srem(key, socket_id)
            # If set is now empty, delete the key
            if redis_client.scard(key) == 0:
                redis_client.delete(key)
            connection_count = redis_client.scard(key)
            logging.debug(f"remove_socket_connection: user {user_id} now has {connection_count} connections")
        except Exception as e:
            logging.warning(f"Failed to remove socket connection from Redis: {e}")
    else:
        logging.warning("remove_socket_connection: Redis not available, socket tracking disabled")


def get_user_socket_connections(user_id: int) -> set[str]:
    """Get all active socket IDs for a user from Redis."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_connections_key(user_id)
        try:
            return redis_client.smembers(key)
        except Exception as e:
            logging.warning(f"Failed to get socket connections from Redis: {e}")
            return set()
    else:
        logging.warning("get_user_socket_connections: Redis not available, returning empty set")
        return set()


def emit_to_user_sockets(user_id: int, event: str, data: dict = None) -> None:
    """Emit a socket event to all connections of a specific user."""
    socket_ids = get_user_socket_connections(user_id)
    if socket_ids:
        data = data or {}
        for socket_id in socket_ids:
            socketio.emit(event, data, to=socket_id)
        logging.debug(f"emit_to_user_sockets: sent '{event}' to {len(socket_ids)} connections for user {user_id}")


def check_user_other_connections(user_id: int, disconnecting_socket_id: str) -> bool:
    """Check if user has other active connections besides the disconnecting one."""
    connections = get_user_socket_connections(user_id)
    # Remove the disconnecting socket from consideration
    connections.discard(disconnecting_socket_id)
    return len(connections) > 0
