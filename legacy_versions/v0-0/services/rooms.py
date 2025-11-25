# Future annotations for forward references and clearer typing
from __future__ import annotations

# Typing helpers for optional values and structured dictionaries
from typing import Optional, Dict, Any, Set
# Traceback printing for debugging unexpected exceptions
import traceback
# Cryptographically secure token generation for room codes
import secrets

# Import shared database/session and socket broadcaster
from ..extensions import db, socketio
# Import ORM models used throughout room services
from ..models import User, Room, RoomMembership, Queue, QueueEntry, RoomAudit
# Utility helpers for time and robust commits
from ..utils import now_ms, commit_with_retry


# Map Socket.IO session id (sid) to user id for quick lookup
sid_to_user_id: Dict[str, int] = {}
# Map sid to a set of room codes the connection has joined
sid_to_room_codes: Dict[str, Set[str]] = {}


# Resolve a User for a given socket session id
def get_user_for_sid(sid: str) -> Optional[User]:
    try:
        # Read mapped user id from in-memory dict
        user_id = sid_to_user_id.get(sid)
        if not user_id:
            return None
        # Load the User from the database by primary key
        return db.session.get(User, int(user_id))
    except Exception:
        # Return None if any error occurs
        return None


# Generate a new random room code using hex encoding
def generate_room_code() -> str:
    return secrets.token_hex(16)


# Build the Socket.IO room name for a given room code
def room_socket_name(code: str) -> str:
    return f"room:{code}"


# Fetch a Room row by its unique code
def get_room_by_code(code: str) -> Optional[Room]:
    return Room.query.filter_by(code=code).first()


# Get the most recent queue for a room, creating a new one if none exists
def get_or_create_room_queue(room: Room) -> Queue:
    # Guard against sessions left in a failed state (e.g., SQLITE_BUSY)
    try:
        q = (
            Queue.query.filter_by(room_id=room.id)
            .order_by(Queue.created_at.desc())
            .first()
        )
    except Exception:
        # Roll back and retry if the session is in an error state
        try:
            db.session.rollback()
        except Exception:
            pass
        q = (
            Queue.query.filter_by(room_id=room.id)
            .order_by(Queue.created_at.desc())
            .first()
        )
    # Create a fresh queue if none exists
    if not q:
        q = Queue(room_id=room.id)
        db.session.add(q)
        commit_with_retry(db.session, retries=5, initial_delay=0.05, backoff=1.8)
    return q


# Get a personal queue owned by a user, creating one if needed
def get_or_create_user_queue(user_id: int) -> Queue:
    try:
        q = (
            Queue.query.filter_by(room_id=None, created_by_id=user_id)
            .order_by(Queue.created_at.desc())
            .first()
        )
    except Exception:
        # If session is invalid, roll back and retry query
        try:
            db.session.rollback()
        except Exception:
            pass
        q = (
            Queue.query.filter_by(room_id=None, created_by_id=user_id)
            .order_by(Queue.created_at.desc())
            .first()
        )
    if not q:
        q = Queue(room_id=None, created_by_id=user_id)
        db.session.add(q)
        commit_with_retry(db.session, retries=5, initial_delay=0.05, backoff=1.8)
    return q


# Emit presence (members and their player states) to the room channel
def emit_room_presence(code: str) -> None:
    room: Optional[Room] = get_room_by_code(code)
    if not room:
        return
    # Fetch active members for the room
    members = (
        db.session.query(RoomMembership)
        .filter(RoomMembership.room_id == room.id, RoomMembership.active == True)
        .all()
    )
    # Build a serializable payload describing members and their player status
    payload = {
        "code": code,
        "members": [
            {
                "id": int(m.user_id),
                "name": m.user.name if m.user else "",
                "picture": m.user.picture if m.user else "",
                "player": {
                    "state": m.player_state or "idle",
                    "is_ad": bool(m.player_is_ad or False),
                    "ts": int(m.player_ts or 0),
                },
            }
            for m in members
        ],
    }
    # Broadcast presence update to all clients subscribed to the room
    socketio.emit("room_presence", payload, room=room_socket_name(code))


# Return user ids that are currently seeing ads in a room
def get_ads_active_user_ids(code: str) -> list[int]:
    room = get_room_by_code(code)
    if not room:
        return []
    rows = (
        db.session.query(RoomMembership.user_id)
        .filter(
            RoomMembership.room_id == room.id,
            RoomMembership.active == True,
            RoomMembership.player_is_ad == True,
        )
        .all()
    )
    try:
        # Normalize to sorted list of ints
        return sorted([int(r[0]) for r in rows])
    except Exception:
        return []


# Emit ad status for a room either to a specific SID or to the whole room
def emit_ad_status(code: str, to_sid: Optional[str] = None) -> None:
    active = get_ads_active_user_ids(code)
    payload = {"code": code, "active_user_ids": active}
    if to_sid:
        socketio.emit("room_ad_status", payload, room=to_sid)
    else:
        socketio.emit("room_ad_status", payload, room=room_socket_name(code))


# Emit a snapshot of the current queue items for a room
def emit_queue_snapshot(code: str, to_sid: Optional[str] = None) -> None:
    room = get_room_by_code(code)
    if not room:
        return
    q = get_or_create_room_queue(room)
    # Select queued entries in position order (tie break on id)
    entries = (
        QueueEntry.query.filter(
            QueueEntry.queue_id == q.id, QueueEntry.status == "queued"
        )
        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
        .all()
    )
    payload = {
        "code": code,
        "items": [
            {
                "id": e.id,
                "url": e.url,
                "title": e.title or "",
                "thumbnail_url": e.thumbnail_url or "",
                "position": e.position or 0,
                "duration": int(e.duration or 0),
                "progress": int(e.progress or 0),
                "playing_since": int(e.playing_since or 0),
            }
            for e in entries
        ],
    }
    # Send either to a specific client or broadcast to the room
    if to_sid:
        socketio.emit("queue_snapshot", payload, room=to_sid)
    else:
        socketio.emit("queue_snapshot", payload, room=room_socket_name(code))


# Emit the room's high-level state (idle/starting/playing/playing_ad) to clients
def emit_room_state(code: str, to_sid: Optional[str] = None) -> None:
    # Resolve room by code to read current state
    room = get_room_by_code(code)
    if not room:
        return
    # Build the minimal payload for state change notifications
    payload = {"code": code, "state": room.state}
    # Emit either to a single SID (direct) or broadcast to the named room
    if to_sid:
        socketio.emit("room_state_change", payload, room=to_sid)
    else:
        socketio.emit("room_state_change", payload, room=room_socket_name(code))


# Emit a compact playback update for the head of the queue
def emit_playback_update(code: str, to_sid: Optional[str] = None) -> None:
    room = get_room_by_code(code)
    if not room:
        return
    q = get_or_create_room_queue(room)
    current: Optional[QueueEntry] = (
        db.session.query(QueueEntry)
        .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
        .first()
    )
    if not current:
        return
    payload = {
        "code": code,
        "entry": {
            "id": int(current.id),
            "duration": int(current.duration or 0),
            "progress": int(current.progress or 0),
            "playing_since": int(current.playing_since or 0),
        },
        "state": room.state,
        "ts": now_ms(),
    }
    if to_sid:
        socketio.emit("room_playback", payload, room=to_sid)
    else:
        socketio.emit("room_playback", payload, room=room_socket_name(code))


# Normalize queue positions to 1..N with no gaps for queued entries
def recalc_queue_positions(q: Queue) -> None:
    entries = (
        db.session.query(QueueEntry)
        .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
        .all()
    )
    pos = 1
    for e in entries:
        if e.position != pos:
            e.position = pos
        pos += 1


# Write an audit record for a room event
def audit_room_event(
    room: Room,
    event: str,
    user_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    import json

    try:
        # Encode details to JSON string if provided
        payload = json.dumps(details) if details else None
    except Exception:
        payload = None
    try:
        # Enqueue the audit record in the SQLAlchemy session
        rec = RoomAudit(room_id=room.id, user_id=user_id, event=event, details=payload)
        db.session.add(rec)
    except Exception:
        # Non-fatal if audit cannot be added
        pass


# Transition a room from 'starting' to an active state when all members ready
def maybe_transition_room_to_playing(code: str) -> None:
    try:
        room = get_room_by_code(code)
        if not room or room.state != "starting":
            return
        # Active members in the room
        members = (
            db.session.query(RoomMembership)
            .filter(RoomMembership.room_id == room.id, RoomMembership.active == True)
            .all()
        )
        if not members:
            return

        # Helper to decide whether a user is ready (not in ad and player state ok)
        def _is_ready(uid: int) -> bool:
            try:
                m = RoomMembership.query.filter_by(
                    room_id=room.id, user_id=int(uid)
                ).first()
                if not m:
                    return False
                state = (m.player_state or "").lower()
                is_ad = bool(m.player_is_ad or False)
                if not state:
                    return False
                return (state in ("paused", "playing")) and (not is_ad)
            except Exception:
                return False

        # Only if all active members are ready do we change the state
        if all(_is_ready(m.user_id) for m in members):
            # If ads are active for this room, move to playing_ad instead of playing
            ads_active = len(get_ads_active_user_ids(code)) > 0
            target = "playing_ad" if ads_active else "playing"
            if ads_active:
                try:
                    room.prev_state_before_ads = str(room.state)
                except Exception:
                    pass
            prev = room.state
            room.state = target
            # When moving to playing (not ad), set playing_since if current entry exists
            try:
                if target == "playing":
                    q = get_or_create_room_queue(room)
                    current = (
                        db.session.query(QueueEntry)
                        .filter(
                            QueueEntry.queue_id == q.id, QueueEntry.status == "queued"
                        )
                        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
                        .first()
                    )
                    if current:
                        current.playing_since = now_ms()
                        # do not change progress here 
            except Exception:
                pass
            try:
                # Record audit trail for the state change
                audit_room_event(
                    room,
                    "state_change",
                    user_id=None,
                    details={
                        "from": str(prev),
                        "to": str(target),
                        "reason": "all_ready" + ("_ads_active" if ads_active else ""),
                    },
                )
            except Exception:
                pass
            # Commit changes and notify clients
            commit_with_retry(db.session, retries=5, initial_delay=0.05, backoff=1.8)
            emit_room_state(code)
            emit_playback_update(code)
    except Exception:
        # Print full traceback in dev logs for debugging
        print("maybe_transition_room_to_playing error")
        print(traceback.format_exc())


# Duplicate name preserved for compatibility; kept as a thin wrapper
# Prefer 'recalc_queue_positions' in new code
def recalculate_queue_positions(q: Queue) -> None:
    entries = (
        QueueEntry.query.filter(
            QueueEntry.queue_id == q.id, QueueEntry.status == "queued"
        )
        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
        .all()
    )
    pos = 1
    for e in entries:
        if e.position != pos:
            e.position = pos
        pos += 1

