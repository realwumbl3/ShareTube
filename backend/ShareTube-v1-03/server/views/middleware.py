from __future__ import annotations

from typing import Callable, Optional, Any
from functools import wraps

from flask import request

from ..extensions import db    
from ..models import Room, RoomMembership, Queue, QueueEntry, User
from ..helpers.ws import get_user_id_from_socket
import logging


def require_room_by_code(handler: Callable) -> Callable:
    """
    Decorator for socket handlers that require a room identified by code from data.

    Extracts code from data, validates it, queries the room, and passes
    (room, user_id, data) to the handler. Returns early if code is missing or room not found.

    Usage:
        @socketio.on("room.control.pause")
        @require_room_by_code
        def _on_room_control_pause(room, user_id, data):
            # room and user_id are guaranteed to be valid here
            ...
    """
    @wraps(handler)
    def wrapper(data: Optional[dict]) -> None:
        user_id = get_user_id_from_socket()
        code = (data or {}).get("code")
        # Try to capture the socket event name if we are in a Socket.IO request context
        event_name = None
        try:
            if getattr(request, "event", None):
                event_name = request.event.get("message")
        except Exception:
            event_name = None

        if not code:
            logging.warning(
                "require_room_by_code: no code in data "
                "(handler=%s, event=%s, user_id=%s, data_keys=%s)",
                handler.__name__,
                event_name,
                user_id,
                list((data or {}).keys()),
            )
            return None, "require_room_by_code: no code"
        room = Room.query.filter_by(code=code).first()
        if not room:
            logging.warning(
                "require_room_by_code: no room found for code=%s "
                "(handler=%s, event=%s, user_id=%s, data_keys=%s)",
                code,
                handler.__name__,
                event_name,
                user_id,
                list((data or {}).keys()),
            )
            return None, "require_room_by_code: no room found"
        return handler(room, user_id, data)
    return wrapper


def require_room(handler: Callable) -> Callable:
    """
    Decorator for socket handlers that require the user's active room membership.
    
    Gets user_id from socket, validates it, gets active room for user via RoomMembership,
    and passes (room, user_id, data) to the handler. Returns early if user_id is missing
    or user has no active room.
    
    Usage:
        @socketio.on("queue.add")
        @require_user_room
        def _on_enqueue_url(room, user_id, data):
            # room and user_id are guaranteed to be valid here
            ...
    """
    @wraps(handler)
    def wrapper(data: Optional[dict]) -> None:
        user_id = get_user_id_from_socket()
        event_name = None
        try:
            if getattr(request, "event", None):
                event_name = request.event.get("message")
        except Exception:
            event_name = None

        # For some high‑frequency socket events (notably ``user.ready``), it is
        # expected that messages may arrive while the user is in the middle of
        # navigation (old tab unloading / new tab joining the same room). In
        # these cases we silently drop the event instead of emitting noisy
        # warnings, since the server already treats them as no‑ops.
        def _log(level_fn, msg, *args):
            if event_name == "user.ready":
                # Demote to debug to avoid confusing log noise when the client
                # briefly reports readiness before a room join is fully
                # established (or just after a leave).
                logging.debug(msg, *args)
            else:
                level_fn(msg, *args)

        if not user_id:
            _log(
                logging.warning,
                "require_room: no user_id from socket "
                "(handler=%s, event=%s, data_keys=%s)",
                handler.__name__,
                event_name,
                list((data or {}).keys()),
            )
            return None, "require_room: no user_id"
        user = db.session.get(User, user_id)
        if not user or not user.active:
            room = None
        else:
            membership = (
                db.session.query(RoomMembership)
                .filter_by(user_id=user_id)
                .order_by(RoomMembership.joined_at.desc())
                .first()
            )
            room = membership.room if membership else None
        if not room:
            _log(
                logging.warning,
                "require_room: no active room for user=%s "
                "(handler=%s, event=%s, data_keys=%s)",
                user_id,
                handler.__name__,
                event_name,
                list((data or {}).keys()),
            )
            return None, "require_room: no active room"
        return handler(room, user_id, data)
    return wrapper


def require_queue_entry(handler: Callable) -> Callable:
    """
    Decorator for socket handlers that require a room's current queue and current entry.
    
    Validates that room.current_queue exists and has a current_entry, then passes
    (room, user_id, queue, current_entry, data) to the handler. Returns early if
    queue or current_entry is missing.
    
    This decorator should be used after require_user_room or require_room_by_code.
    
    Usage:
        @socketio.on("queue.probe")
        @require_user_room
        @require_queue_entry
        def _on_queue_probe(room, user_id, queue, current_entry, data):
            # room, queue, and current_entry are guaranteed to be valid here
            ...
    """
    @wraps(handler)
    def wrapper(room: Room, user_id: int, data: Optional[dict]) -> None:
        event_name = None
        try:
            if getattr(request, "event", None):
                event_name = request.event.get("message")
        except Exception:
            event_name = None

        if not room.current_queue:
            logging.warning(
                "require_queue_entry: no current queue for room=%s "
                "(handler=%s, event=%s, user_id=%s)",
                room.code,
                handler.__name__,
                event_name,
                user_id,
            )
            return
        queue = room.current_queue
        current_entry = queue.current_entry
        if not current_entry:
            logging.warning(
                "require_queue_entry: no current entry for room=%s, queue_id=%s "
                "(handler=%s, event=%s, user_id=%s)",
                room.code,
                getattr(queue, "id", None),
                handler.__name__,
                event_name,
                user_id,
            )
            return None, "require_queue_entry: no current entry"
        return handler(room, user_id, queue, current_entry, data)
    return wrapper


def ensure_queue(handler: Callable) -> Callable:
    """
    Decorator for socket handlers that require a room's current queue, creating it if missing.
    
    Validates that room.current_queue exists, creating a new Queue if it doesn't, then passes
    (room, user_id, queue, data) to the handler. The queue is created with room_id=room.id
    and created_by_id=user_id.
    
    This decorator should be used after require_room or require_room_by_code.
    
    Usage:
        @socketio.on("queue.add")
        @require_room
        @ensure_queue
        def _on_enqueue_url(room, user_id, queue, data):
            # room and queue are guaranteed to be valid here (queue created if needed)
            ...
    """
    @wraps(handler)
    def wrapper(room: Room, user_id: int, data: Optional[dict]) -> None:
        if not room.current_queue:
            # Create a new queue for the room
            queue = Queue(room_id=room.id, created_by_id=user_id)
            room.current_queue = queue
            db.session.add(queue)
            db.session.flush()  # Ensure queue gets an ID
        else:
            queue = room.current_queue
        return handler(room, user_id, queue, data)
    return wrapper

