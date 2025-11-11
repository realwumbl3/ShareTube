# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time
import secrets

# Provide Optional typing for clarity in relationships or lookups
from typing import Optional

# Import the SQLAlchemy instance from the shared extensions module
from .extensions import db


# User accounts persisted in the database
class User(db.Model):
    # Mark fields that are considered sensitive/private for the dashboard view layer
    __private__ = ["google_sub", "email"]
    # Surrogate primary key integer id
    id = db.Column(db.Integer, primary_key=True)
    # Google OpenID subject identifier; unique and indexed for quick lookup
    google_sub = db.Column(db.String(255), unique=True, index=True)
    # Email address; unique to prevent duplicates
    email = db.Column(db.String(255), unique=True)
    # Display name of the user
    name = db.Column(db.String(255))
    # Profile picture URL
    picture = db.Column(db.String(1024))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "picture": self.picture,
        }


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


# A logical queue of videos either for a room or a personal queue (if room_id is null)
class Queue(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Optional owning room; null indicates a personal/user queue context
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=True, index=True)
    # Optional creator id for personal queues or attribution
    created_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Creation time of this queue
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))

    # Relationship to the room
    room = db.relationship(
        "Room", foreign_keys=[room_id], uselist=False, back_populates="queues"
    )
    # Relationship to the creator
    creator = db.relationship("User", foreign_keys=[created_by_id], uselist=False)

    # Relationship to queue entries, cascading deletes when the queue is removed
    entries = db.relationship(
        "QueueEntry",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="QueueEntry.queue_id",
        back_populates="queue",
    )

    current_entry_id = db.Column(
        db.Integer, db.ForeignKey("queue_entry.id"), nullable=True, index=True
    )

    current_entry = db.relationship(
        "QueueEntry", foreign_keys=[current_entry_id], uselist=False, post_update=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "room_id": self.room_id,
            "created_by_id": self.created_by_id,
            "creator": self.creator.to_dict() if self.creator else None,
            "created_at": self.created_at,
            "entries": [entry.to_dict() for entry in self.entries],
            "current_entry": (
                self.current_entry.to_dict() if self.current_entry else None
            ),
        }

    def load_next_entry(self):
        if len(self.entries) == 0:
            return None, "No entries in queue"
        entry = self.entries[0]
        # Set FK directly to avoid relationship circular dependency during flush
        self.current_entry_id = entry.id
        return entry, None


# An item within a queue representing a single YouTube video
class QueueEntry(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Owning queue id; indexed to support ordered listing by queue
    queue_id = db.Column(
        db.Integer, db.ForeignKey("queue.id"), nullable=False, index=True
    )
    # Relationship back to owning queue
    queue = db.relationship("Queue", foreign_keys=[queue_id], back_populates="entries")
    # User that added the entry (optional for system adds)
    added_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Canonical video URL
    url = db.Column(db.String(2048), nullable=False)
    # YouTube video id (canonical)
    video_id = db.Column(db.String(64))
    # Title fetched from YouTube APIs or oEmbed
    title = db.Column(db.String(512))
    # Best available thumbnail URL
    thumbnail_url = db.Column(db.String(1024))
    # 1-based position within the queue; also indexed for efficiency
    position = db.Column(db.Integer, index=True)
    # Time when the entry was added
    added_at = db.Column(db.Integer, default=lambda: int(time.time()))
    # Lifecycle status: queued | skipped | deleted (watched is derived from watch_count > 0)
    status = db.Column(db.String(32), default="queued")
    # Number of times this entry has been completed/rotated
    watch_count = db.Column(db.Integer, default=0)
    # Per-entry virtual clock fields (milliseconds)
    duration_ms = db.Column(db.Integer, default=0)
    # Unix timestamp (milliseconds) when the video started playing
    playing_since_ms = db.Column(db.BigInteger, nullable=True)
    # Last known progress in milliseconds when paused (for resume)
    progress_ms = db.Column(db.Integer, default=0)
    # Unix timestamp (seconds) when the video was last paused
    paused_at = db.Column(db.Integer, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "queue_id": self.queue_id,
            "added_by_id": self.added_by_id,
            "url": self.url,
            "video_id": self.video_id,
            "title": self.title,
            "thumbnail_url": self.thumbnail_url,
            "position": self.position,
            "status": self.status,
            "watch_count": self.watch_count,
            "duration_ms": self.duration_ms,
            "playing_since_ms": self.playing_since_ms,
            "progress_ms": self.progress_ms,
            "paused_at": self.paused_at,
        }


# Audit log of room-related events for observability and debugging
class RoomAudit(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Room the event applies to; indexed for querying event history by room
    room_id = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=False, index=True
    )
    # Optional user responsible for the event
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Event name/category (e.g., state_change, queue_add)
    event = db.Column(db.String(64), nullable=False, index=True)
    # JSON-encoded details payload (free-form text)
    details = db.Column(db.Text)
    # Creation timestamp (seconds), indexed for sorting/retrieval
    created_at = db.Column(db.Integer, default=lambda: int(time.time()), index=True)


class ChatMessage(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Owning room id
    room_id = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=False, index=True
    )
    # Sender user id
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False, index=True
    )
    # Message text content
    text = db.Column(db.Text, nullable=False)
    # Creation timestamp (seconds)
    created_at = db.Column(db.Integer, default=lambda: int(time.time()), index=True)
