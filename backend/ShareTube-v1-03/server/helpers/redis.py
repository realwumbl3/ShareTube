from __future__ import annotations

import logging

from ..lib.utils import get_redis_client


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
        except Exception:
            logging.exception("set_user_verification_received: failed to set verification flag in Redis")


def clear_user_verification(user_id: int) -> None:
    """Clear user's verification status."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_verification_key(user_id)
        try:
            redis_client.delete(key)
        except Exception:
            logging.exception("clear_user_verification: failed to clear verification flag in Redis")


def has_user_been_verified(user_id: int) -> bool:
    """Check if user has been verified (responded to verification request)."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_verification_key(user_id)
        try:
            result = redis_client.exists(key)
            verified = bool(result)
            return verified
        except Exception:
            logging.exception("has_user_been_verified: failed to check verification flag in Redis")
            return False
    return False


def track_socket_connection(user_id: int, socket_id: str) -> None:
    """Track a socket connection for a user using Redis."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_connections_key(user_id)
        try:
            # Add socket_id to the set and set expiration to 24 hours
            redis_client.sadd(key, socket_id)
            redis_client.expire(key, 86400)  # 24 hours
        except Exception:
            logging.exception("track_socket_connection: failed to track socket connection in Redis")
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
        except Exception:
            logging.exception("remove_socket_connection: failed to remove socket connection from Redis")
    else:
        logging.warning("remove_socket_connection: Redis not available, socket connection tracking disabled")


def get_user_socket_connections(user_id: int) -> set[str]:
    """Get all active socket IDs for a user from Redis."""
    redis_client = get_redis_client()
    if redis_client:
        key = _get_user_connections_key(user_id)
        try:
            return redis_client.smembers(key)
        except Exception:
            logging.exception("get_user_socket_connections: failed to get socket connections from Redis")
            return set[str]()
    else:
        logging.warning("get_user_socket_connections: Redis not available, socket tracking disabled")
        return set[str]()


def check_user_other_connections(user_id: int, disconnecting_socket_id: str) -> bool:
    """Check if user has other active connections besides the disconnecting one."""
    connections = get_user_socket_connections(user_id)
    # Remove the disconnecting socket from consideration
    connections.discard(disconnecting_socket_id)
    return len(connections) > 0

