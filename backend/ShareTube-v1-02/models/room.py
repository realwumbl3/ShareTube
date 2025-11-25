# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time
import secrets
import logging

# Provide Optional typing for clarity in relationships or lookups
from typing import Optional, List, TYPE_CHECKING, Callable, Tuple

# SQLAlchemy typing helper for mapped attributes / relationships
from sqlalchemy.orm import Mapped

# Import the SQLAlchemy instance and socketio from the shared extensions module
from ..extensions import db, socketio
from ..utils import commit_with_retry
from flask import current_app

if TYPE_CHECKING:
    # Imported only for static type checking to avoid circular imports at runtime
    from .queue import Queue, QueueEntry
    from .user import User


# A room represents a collaborative watch session identified by a short code
class Room(db.Model):
    # Surrogate primary key id
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)
    # Unique room code string used by clients to join; indexed for queries
    code: Mapped[str] = db.Column(
        db.String(64), unique=True, index=True, default=lambda: secrets.token_hex(7)
    )
    # Owner (room author) user id
    owner_id: Mapped[Optional[int]] = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=True
    )
    # Epoch seconds when the room was created
    created_at: Mapped[int] = db.Column(db.Integer, default=lambda: int(time.time()))
    # Whether room is private (UI-level hint; not enforced here)
    is_private: Mapped[bool] = db.Column(db.Boolean, default=True)
    # Control mode for playback/queue: owner_only | operators | any
    control_mode: Mapped[str] = db.Column(db.String(16), default="operators")
    # Current controller baton holder identifier (user id or client id string)
    controller_id: Mapped[str] = db.Column(db.String(64), default="")
    # Ad sync policy: off | pause_all | trigger_and_pause
    ad_sync_mode: Mapped[str] = db.Column(db.String(24), default="off")
    # Current playback/state machine status for the room
    # idle | starting | playing | paused
    state: Mapped[str] = db.Column(db.String(16), default="idle")
    # Current queue being played
    current_queue_id: Mapped[Optional[int]] = db.Column(
        db.Integer, db.ForeignKey("queue.id"), nullable=True, index=True
    )

    # ORM relationship to memberships, cascade deletion when room is removed
    memberships: Mapped[list["RoomMembership"]] = db.relationship(
        "RoomMembership", backref="room", lazy=True, cascade="all, delete-orphan"
    )
    # ORM relationship to queues (historical); cascade deletion when room is removed
    queues: Mapped[list["Queue"]] = db.relationship(
        "Queue",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="Queue.room_id",
        back_populates="room",
    )
    # ORM relationship to current queue; cascade deletion when current queue is removed
    current_queue: Mapped[Optional["Queue"]] = db.relationship(
        "Queue",
        foreign_keys=[current_queue_id],
        uselist=False,
    )
    # Operators assigned to the room (separate from membership roles)
    operators: Mapped[list["RoomOperator"]] = db.relationship(
        "RoomOperator", backref="room", lazy=True, cascade="all, delete-orphan"
    )

    @staticmethod
    def emit(code: str, trigger: str) -> tuple[Callable, Callable]:
        """Return (resolve, reject) helpers for emitting Socket.IO events for this room.

        - resolve(event, payload) -> emits to ``room:{code}`` with ``trigger`` and ``code`` injected.
        - reject(error, state='error', event='room.error') -> emits an error payload to the same room.
        """

        def resolve(event: str, payload: Optional[dict] = None) -> None:
            payload = payload or {}
            socketio.emit(
                event,
                {
                    "trigger": trigger,
                    "code": code,
                    **payload,
                },
                room=f"room:{code}",
            )

        def reject(
            error: str,
            state: str = "error",
            event: str = "room.error",
        ) -> None:
            socketio.emit(
                event,
                {
                    "trigger": trigger,
                    "code": code,
                    "state": state,
                    "error": error,
                },
                room=f"room:{code}",
            )

        return resolve, reject

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "owner_id": self.owner_id,
            "created_at": self.created_at,
            "is_private": self.is_private,
            "control_mode": self.control_mode,
            "state": self.state,
            "current_queue_id": self.current_queue_id,
            "current_queue": (
                self.current_queue.to_dict() if self.current_queue else None
            ),
            "operators": [operator.user_id for operator in self.operators],
            "memberships": [membership.user_id for membership in self.memberships],
        }

    def are_all_users_ready(self) -> bool:
        """Return True if every active membership in this room is ready."""
        from .user import User
        memberships = (
            db.session.query(RoomMembership.ready)
            .join(User, RoomMembership.user_id == User.id)
            .filter(RoomMembership.room_id == self.id, User.active.is_(True))
            .all()
        )
        if not memberships:
            return False
        return all(bool(row[0]) for row in memberships)

    def reset_ready_flags(self) -> None:
        """Reset ready flags for all active memberships in this room."""
        from .user import User
        # Use a subquery to filter by active users, then update memberships
        active_user_ids = db.session.query(User.id).filter(User.active.is_(True)).subquery()
        (
            db.session.query(RoomMembership)
            .filter(
                RoomMembership.room_id == self.id,
                RoomMembership.user_id.in_(db.session.query(active_user_ids.c.id)),
            )
            .update({RoomMembership.ready: False}, synchronize_session=False)
        )
        db.session.flush()

    def pause_playback(self, now_ms: int) -> tuple[Optional[int], Optional[str]]:
        """Pause playback and return (paused_progress_ms, error_message)."""
        if not self.current_queue:
            return None, "room.pause_playback: no current queue"
        if not self.current_queue.current_entry:
            entry, error = self.current_queue.load_next_entry()
            if error:
                return None, f"room.pause_playback: {error}"
            if entry:
                entry.reset()
                self.state = "paused"
                commit_with_retry(db.session)
                return 0, None
            return None, "room.pause_playback: no current entry"
        paused_progress_ms = self.current_queue.current_entry.pause(now_ms)
        self.state = "paused"
        commit_with_retry(db.session)
        return paused_progress_ms, None

    def start_playback(self, now_ms: int) -> tuple[Optional[dict], Optional[str]]:
        """Start playback. Returns tuple with dict with state and entry info if starting new video and error message if there is an error."""
        if not self.current_queue:
            return None, "room.start_playback: no current queue"

        # If no current entry, load next and set to starting
        if not self.current_queue.current_entry:
            if len(self.current_queue.entries) == 0:
                return None, "room.start_playback: no entries in queue"
            entry, error = self.current_queue.load_next_entry()
            if error:
                return None, f"room.start_playback: load_next_entry error: {error}"
            self.state = "starting"
            self.reset_ready_flags()
            entry.reset()
            commit_with_retry(db.session)
            return {"state": "starting", "current_entry": entry.to_dict()}, None

        # If already in starting state, transition to playing
        if self.state == "starting":
            self.state = "playing"
            commit_with_retry(db.session)
            current_entry = self.current_queue.current_entry
            if current_entry:
                current_entry.start(now_ms)
            return {
                "state": "playing",
                "playing_since_ms": now_ms,
                "progress_ms": current_entry.progress_ms,
                "current_entry": current_entry.to_dict(),
            }, None

        # If paused with an active entry, resume playback from stored progress
        if self.state == "paused":
            current_entry = self.current_queue.current_entry
            if not current_entry:
                return None, "room.start_playback: no current entry to resume"
            current_entry.start(now_ms)
            self.state = "playing"
            commit_with_retry(db.session)
            return {
                "state": "playing",
                "progress_ms": current_entry.progress_ms,
                "current_entry": current_entry.to_dict(),
            }, None

        current_entry = self.current_queue.current_entry
        if current_entry:
            return {
                "state": self.state,
                "playing_since_ms": current_entry.playing_since_ms,
                "progress_ms": current_entry.progress_ms,
                "current_entry": current_entry.to_dict(),
            }, None
        return None, "room.start_playback: no current entry"

    def restart_video(self, now_ms: int) -> tuple[Optional[dict], Optional[str]]:
        """Restart the current video from the beginning."""
        if not self.current_queue:
            return None, "room.restart_video: no current queue"
        if not self.current_queue.current_entry:
            return None, "room.restart_video: no current entry"
        self.current_queue.current_entry.restart(now_ms)
        self.state = "playing"
        commit_with_retry(db.session)
        return None, None

    def seek_video(
        self, progress_ms: int, now_ms: int, play: bool
    ) -> tuple[Optional[dict], Optional[str]]:
        """Seek to a specific position in the current video."""
        if not self.current_queue:
            return None, "room.seek_video: no current queue"
        if not self.current_queue.current_entry:
            return None, "room.seek_video: no current entry"
        self.current_queue.current_entry.seek(progress_ms, now_ms, play)
        self.state = "playing" if play else "paused"
        commit_with_retry(db.session)
        return None, None

    def skip_to_next(self) -> tuple[Optional[QueueEntry], Optional[str]]:
        """Skip current entry and advance to next."""
        if not self.current_queue:
            return None, "room.skip_to_next: no current queue"
        # Track whether we had an active entry before skipping so we can
        # distinguish between "no-op" skips and skips that exhaust the queue.
        had_current = self.current_queue.current_entry is not None
        next_entry, error = self.current_queue.skip_to_next()
        if error:
            return None, f"room.skip_to_next: {error}"
        if next_entry:
            self.state = "starting"
            self.reset_ready_flags()
        else:
            # No next entry; try to load the next from queue entries if possible
            load_entry, load_error = self.current_queue.load_next_entry()
            if load_error:
                # Exhausted queue
                if had_current and not self.current_queue.current_entry:
                    self.state = "paused"
                commit_with_retry(db.session)
                return None, f"room.skip_to_next: {load_error}"
            if load_entry:
                self.state = "starting"
                self.current_queue.current_entry = load_entry
                load_entry.reset()
                self.reset_ready_flags()
                next_entry = load_entry
        commit_with_retry(db.session)
        return next_entry, None

    def complete_and_advance(self) -> tuple[Optional[QueueEntry], Optional[str]]:
        """Complete current entry and advance to next, setting state to starting."""
        if not self.current_queue:
            return None, "room.complete_and_advance: no current queue"
        next_entry, error = self.current_queue.complete_and_advance()
        if error:
            return None, f"room.complete_and_advance: {error}"
        if next_entry:
            # We have another entry to play, transition through "starting"
            # so clients can pre-roll before we enter the playing state.
            self.state = "starting"
            self.reset_ready_flags()
        else:
            # No more entries in the queue – leave the room in a non-playing
            # state so clients can unload the video.
            self.state = "paused"
        commit_with_retry(db.session)
        return next_entry, None

    @classmethod
    def create(cls, owner_id: int):
        """Create a new room with an initial queue and owner membership."""
        from .queue import Queue

        room = cls(owner_id=owner_id)
        db.session.add(room)
        db.session.flush()  # get room.id

        # Create initial queue for room
        queue = Queue(room_id=room.id, created_by_id=owner_id)
        room.current_queue = queue
        db.session.add(queue)

        # Add membership for creator
        from .user import User
        owner = db.session.get(User, owner_id)
        if owner:
            owner.last_seen = int(time.time())
            owner.active = True
        membership = RoomMembership(
            room_id=room.id,
            user_id=owner_id,
            joined_at=int(time.time()),
            role="owner",
        )
        db.session.add(membership)

        return room

    @classmethod
    def cleanup_all_inactive_users(cls) -> dict[str, list[int]]:
        """Clean up inactive users across all rooms.

        Returns a dict mapping room codes to lists of removed user IDs.
        """
        rooms = cls.query.all()
        results = {}

        for room in rooms:
            removed_users = room.cleanup_inactive_users()
            if removed_users:
                results[room.code] = removed_users

        return results

    def get_inactive_users(self) -> list["RoomMembership"]:
        """Get list of inactive users in this room based on pong timeout."""
        pong_timeout = current_app.config.get("PONG_TIMEOUT_SECONDS", 20)
        cutoff_time = int(time.time()) - pong_timeout

        return [
            membership for membership in self.memberships
            if membership.user.active and membership.user.last_seen < cutoff_time
        ]

    def cleanup_inactive_users(self) -> list[int]:
        """Remove users who haven't pong'd within the timeout period.

        Returns list of user IDs that were removed from the room.
        """
        inactive_memberships = self.get_inactive_users()
        removed_user_ids = []

        for membership in inactive_memberships:
            logging.info(f"cleanup_inactive_users: removing inactive user {membership.user_id} from room {self.code}")
            membership.leave()
            removed_user_ids.append(membership.user_id)

        if removed_user_ids:
            db.session.commit()

        return removed_user_ids


# Association between a user and a room, with presence and player state
class RoomMembership(db.Model):
    # Surrogate primary key id
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)
    # Parent room id; indexed for fast room membership queries
    room_id: Mapped[int] = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=False, index=True
    )
    # Member user id; indexed for fast user presence lookups
    user_id: Mapped[int] = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False, index=True
    )
    # Timestamp of when user joined the room
    joined_at: Mapped[int] = db.Column(db.Integer, default=lambda: int(time.time()))

    # Relationship back to the user entity for convenient access
    user: Mapped["User"] = db.relationship("User")

    # Role within the room: owner | operator | participant
    role: Mapped[str] = db.Column(db.String(16), default="participant")

    # Ready flag to coordinate playback when the room is in "starting"
    ready: Mapped[bool] = db.Column(
        db.Boolean, default=False, nullable=False, index=True
    )

    # Ensure a user can have at most one membership per room
    __table_args__ = (
        db.UniqueConstraint("room_id", "user_id", name="uq_room_membership_room_user"),
    )

    @classmethod
    def get_active_room_for_user(cls, user_id: int) -> Optional[Room]:
        """Get the active room for a user based on their most recent active membership."""
        from .user import User
        user = db.session.get(User, user_id)
        if not user or not user.active:
            return None
        membership = (
            db.session.query(cls)
            .filter_by(user_id=user_id)
            .order_by(cls.joined_at.desc())
            .first()
        )
        if not membership:
            return None
        room = db.session.get(Room, membership.room_id)
        return room

    @classmethod
    def join_room(cls, room: Room, user_id: int) -> "RoomMembership":
        """Join a room, creating or updating membership as needed."""
        from .user import User
        membership = cls.query.filter_by(room_id=room.id, user_id=user_id).first()
        now = int(time.time())
        room_in_starting = room.state == "starting"
        
        # Update user's last_seen timestamp and mark as active
        user = db.session.get(User, user_id)
        if user:
            user.last_seen = now
            user.active = True
        
        if not membership:
            membership = cls(
                room_id=room.id,
                user_id=user_id,
                joined_at=now,
                # Never auto-mark a new membership as ready based solely on room state.
                # Ready flags are only meaningful during the "starting" phase and are
                # explicitly reset via Room.reset_ready_flags() when a new video cycle
                # begins. For a user joining an already-playing room, the readiness
                # handshake for the *next* video will be handled when the room next
                # enters "starting".
                ready=False,
            )
            db.session.add(membership)
        else:
            # When the room is in "starting", force membership.ready to False so that
            # all users must explicitly report readiness for the new video. For any
            # other room state, keep the existing ready flag; it will be reset when
            # the room next transitions into "starting".
            if room_in_starting:
                membership.ready = False
        return membership

    def set_ready(self, ready: bool) -> None:
        """Update the ready flag for this membership."""
        self.ready = bool(ready)

    def leave(self) -> None:
        """Mark this membership as inactive and update user's active status if needed."""
        from .user import User
        # Update user's last_seen timestamp when leaving
        user = db.session.get(User, self.user_id)
        if user:
            user.last_seen = int(time.time())
            # Check if user has any other room memberships
            other_memberships = RoomMembership.query.filter_by(user_id=self.user_id).filter(RoomMembership.room_id != self.room_id).first()
            if not other_memberships:
                # No other memberships, mark user as inactive
                user.active = False


class RoomOperator(db.Model):
    # Surrogate primary key id
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)
    # Parent room id; indexed
    room_id: Mapped[int] = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=False, index=True
    )
    # Operator user id; indexed
    user_id: Mapped[int] = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False, index=True
    )
    # Relationship back to user
    user: Mapped["User"] = db.relationship("User")
    # Ensure each operator is unique per room
    __table_args__ = (
        db.UniqueConstraint("room_id", "user_id", name="uq_room_operator_room_user"),
    )
