# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time
import secrets

# Provide Optional typing for clarity in relationships or lookups
from typing import Optional

# Import the SQLAlchemy instance from the shared extensions module
from ..extensions import db

from .queue import QueueEntry


# A room represents a collaborative watch session identified by a short code
class Room(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Unique room code string used by clients to join; indexed for queries
    code = db.Column(
        db.String(64), unique=True, index=True, default=lambda: secrets.token_hex(7)
    )
    # Owner (room author) user id
    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Epoch seconds when the room was created
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))
    # Whether room is private (UI-level hint; not enforced here)
    is_private = db.Column(db.Boolean, default=True)
    # Control mode for playback/queue: owner_only | operators | any
    control_mode = db.Column(db.String(16), default="operators")
    # Current controller baton holder identifier (user id or client id string)
    controller_id = db.Column(db.String(64), default="")
    # Ad sync policy: off | pause_all | trigger_and_pause
    ad_sync_mode = db.Column(db.String(24), default="off")
    # Current playback/state machine status for the room
    # idle | starting | playing | paused
    state = db.Column(db.String(16), default="idle")
    # Current queue being played
    current_queue_id = db.Column(
        db.Integer, db.ForeignKey("queue.id"), nullable=True, index=True
    )

    # ORM relationship to memberships, cascade deletion when room is removed
    memberships = db.relationship(
        "RoomMembership", backref="room", lazy=True, cascade="all, delete-orphan"
    )
    # ORM relationship to queues (historical); cascade deletion when room is removed
    queues = db.relationship(
        "Queue",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="Queue.room_id",
        back_populates="room",
    )
    # ORM relationship to current queue; cascade deletion when current queue is removed
    current_queue = db.relationship(
        "Queue",
        foreign_keys=[current_queue_id],
        uselist=False,
    )
    # Operators assigned to the room (separate from membership roles)
    operators = db.relationship(
        "RoomOperator", backref="room", lazy=True, cascade="all, delete-orphan"
    )

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

    def pause_playback(self, now_ms: int) -> Optional[int]:
        """Pause playback and return the paused progress in milliseconds."""
        if not self.current_queue or not self.current_queue.current_entry:
            return None
        paused_progress_ms = self.current_queue.current_entry.pause(now_ms)
        self.state = "paused"
        return paused_progress_ms

    def start_playback(self, now_ms: int) -> Optional[dict]:
        """Start playback. Returns dict with state and entry info if starting new video."""
        if not self.current_queue:
            return None

        # If already in starting state, transition to playing
        if self.state == "starting":
            self.state = "playing"
            current_entry = self.current_queue.current_entry
            if current_entry:
                current_entry.play(now_ms)
            return {"state": "playing", "entry": None}

        # If no current entry, load next and set to starting
        if not self.current_queue.current_entry:
            if len(self.current_queue.entries) == 0:
                return None
            entry, error = self.current_queue.load_next_entry()
            if error:
                return None
            self.state = "starting"
            entry.playing_since_ms = None  # Don't set until transitioning to playing
            entry.paused_at = None
            return {"state": "starting", "entry": entry.to_dict()}

        # Resuming existing video
        current_entry = self.current_queue.current_entry
        self.state = "playing"
        current_entry.play(now_ms)
        return {"state": "playing", "entry": None}

    def restart_video(self, now_ms: int) -> None:
        """Restart the current video from the beginning."""
        if not self.current_queue or not self.current_queue.current_entry:
            return
        self.current_queue.current_entry.restart(now_ms)
        self.state = "playing"

    def seek_video(self, progress_ms: int, now_ms: int, play: bool) -> None:
        """Seek to a specific position in the current video."""
        if not self.current_queue or not self.current_queue.current_entry:
            return
        self.current_queue.current_entry.seek(progress_ms, now_ms, play)
        self.state = "playing" if play else "paused"

    def skip_to_next(self) -> Optional[QueueEntry]:
        """Skip current entry and advance to next."""
        if not self.current_queue:
            return None
        next_entry = self.current_queue.skip_to_next()
        if next_entry:
            self.state = "starting"
        return next_entry

    def complete_and_advance(self) -> Optional[QueueEntry]:
        """Complete current entry and advance to next, setting state to starting."""
        if not self.current_queue:
            return None
        next_entry = self.current_queue.complete_and_advance()
        if next_entry:
            self.state = "starting"
        return next_entry

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
    id = db.Column(db.Integer, primary_key=True)
    # Parent room id; indexed for fast room membership queries
    room_id = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=False, index=True
    )
    # Member user id; indexed for fast user presence lookups
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False, index=True
    )
    # Timestamp of when user joined the room
    joined_at = db.Column(db.Integer, default=lambda: int(time.time()))
    # Last time the user was seen active (heartbeat)
    last_seen = db.Column(db.Integer, default=lambda: int(time.time()))
    # Whether the user is currently active in the room
    active = db.Column(db.Boolean, default=True)

    # Relationship back to the user entity for convenient access
    user = db.relationship("User")

    # Role within the room: owner | operator | participant
    role = db.Column(db.String(16), default="participant")

    # Ad sync fields persisted on membership for TTL/debounce and active set derivation
    ad_active = db.Column(db.Boolean, default=False, index=True)
    ad_last_true_ts = db.Column(db.BigInteger, nullable=True, index=True)
    ad_last_false_ts = db.Column(db.BigInteger, nullable=True, index=True)

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
        if not membership:
            membership = cls(
                room_id=room.id,
                user_id=user_id,
                joined_at=now,
                last_seen=now,
                active=True,
            )
            db.session.add(membership)
        else:
            membership.active = True
            membership.last_seen = now
        return membership

    def leave(self) -> None:
        """Mark this membership as inactive."""
        self.active = False
        self.last_seen = int(time.time())


class RoomOperator(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Parent room id; indexed
    room_id = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=False, index=True
    )
    # Operator user id; indexed
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False, index=True
    )
    # Relationship back to user
    user = db.relationship("User")
    # Ensure each operator is unique per room
    __table_args__ = (
        db.UniqueConstraint("room_id", "user_id", name="uq_room_operator_room_user"),
    )
