# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time
import secrets

# Provide Optional typing for clarity in relationships or lookups
from typing import Optional, List, TYPE_CHECKING, Callable, Tuple

# SQLAlchemy typing helper for mapped attributes / relationships
from sqlalchemy.orm import Mapped

# Import the SQLAlchemy instance and socketio from the shared extensions module
from ..extensions import db, socketio
from ..utils import commit_with_retry

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
        memberships = (
            db.session.query(RoomMembership.ready)
            .filter(RoomMembership.room_id == self.id, RoomMembership.active.is_(True))
            .all()
        )
        if not memberships:
            return False
        return all(bool(row[0]) for row in memberships)

    def reset_ready_flags(self) -> None:
        """Reset ready flags for all active memberships in this room."""
        (
            db.session.query(RoomMembership)
            .filter(
                RoomMembership.room_id == self.id,
                RoomMembership.active.is_(True),
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
        membership = RoomMembership(
            room_id=room.id,
            user_id=owner_id,
            joined_at=int(time.time()),
            last_seen=int(time.time()),
            active=True,
            role="owner",
        )
        db.session.add(membership)

        return room


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
    # Last time the user was seen active (heartbeat)
    last_seen: Mapped[int] = db.Column(db.Integer, default=lambda: int(time.time()))
    # Whether the user is currently active in the room
    active: Mapped[bool] = db.Column(db.Boolean, default=True)

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
        membership = (
            db.session.query(cls)
            .filter_by(user_id=user_id, active=True)
            .order_by(cls.last_seen.desc())
            .first()
        )
        if not membership:
            return None
        room = db.session.get(Room, membership.room_id)
        return room

    @classmethod
    def join_room(cls, room: Room, user_id: int) -> "RoomMembership":
        """Join a room, creating or updating membership as needed."""
        membership = cls.query.filter_by(room_id=room.id, user_id=user_id).first()
        now = int(time.time())
        room_in_starting = room.state == "starting"
        room_in_playing = room.state == "playing"
        if not membership:
            membership = cls(
                room_id=room.id,
                user_id=user_id,
                joined_at=now,
                last_seen=now,
                active=True,
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
            membership.active = True
            membership.last_seen = now
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
        """Mark this membership as inactive."""
        self.active = False
        self.last_seen = int(time.time())


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
