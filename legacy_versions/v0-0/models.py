# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time
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


# A room represents a collaborative watch session identified by a short code
class Room(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Unique room code string used by clients to join; indexed for queries
    code = db.Column(db.String(64), unique=True, index=True, nullable=False)
    # User id of the creator (nullable for system-created rooms)
    created_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Epoch seconds when the room was created
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))
    # Whether room is private (UI-level hint; not enforced here)
    is_private = db.Column(db.Boolean, default=True)
    # Current playback/state machine status for the room
    # idle | starting | playing_ad | playing | paused
    state = db.Column(db.String(16), default="idle")
    # If room enters ad playback, remember previous state to restore after ads
    prev_state_before_ads = db.Column(db.String(16), default="")

    # ORM relationship to memberships, cascade deletion when room is removed
    memberships = db.relationship("RoomMembership", backref="room", lazy=True, cascade="all, delete-orphan")
    # ORM relationship to queues (historical); cascade deletion when room is removed
    queues = db.relationship("Queue", backref="room", lazy=True, cascade="all, delete-orphan")


# Association between a user and a room, with presence and player state
class RoomMembership(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Parent room id; indexed for fast room membership queries
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=False, index=True)
    # Member user id; indexed for fast user presence lookups
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    # Timestamp of when user joined the room
    joined_at = db.Column(db.Integer, default=lambda: int(time.time()))
    # Last time the user was seen active (heartbeat)
    last_seen = db.Column(db.Integer, default=lambda: int(time.time()))
    # Whether the user is currently active in the room
    active = db.Column(db.Boolean, default=True)

    # Relationship back to the user entity for convenient access
    user = db.relationship("User")

    # Last known player state for this member ("idle" | "paused" | "playing")
    player_state = db.Column(db.String(16), default="idle")
    # Whether this member is currently seeing a YouTube ad
    player_is_ad = db.Column(db.Boolean, default=False)
    # Client-reported timestamp of last player update (ms)
    player_ts = db.Column(db.Integer, default=0)

    # Ensure a user can have at most one membership per room
    __table_args__ = (
        db.UniqueConstraint("room_id", "user_id", name="uq_room_membership_room_user"),
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

    # Relationship to queue entries, cascading deletes when the queue is removed
    entries = db.relationship("QueueEntry", backref="queue", lazy=True, cascade="all, delete-orphan")


# An item within a queue representing a single YouTube video
class QueueEntry(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Owning queue id; indexed to support ordered listing by queue
    queue_id = db.Column(db.Integer, db.ForeignKey("queue.id"), nullable=False, index=True)
    # User that added the entry (optional for system adds)
    added_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Canonical video URL
    url = db.Column(db.String(2048), nullable=False)
    # Title fetched from YouTube APIs or oEmbed
    title = db.Column(db.String(512))
    # Best available thumbnail URL
    thumbnail_url = db.Column(db.String(1024))
    # 1-based position within the queue; also indexed for efficiency
    position = db.Column(db.Integer, index=True)
    # Time when the entry was added
    added_at = db.Column(db.Integer, default=lambda: int(time.time()))
    # Lifecycle status: queued | skipped | deleted | watched
    status = db.Column(db.String(32), default="queued")
    # Duration of the video in milliseconds
    duration = db.Column(db.Integer, default=0)
    # Current progress in milliseconds
    progress = db.Column(db.Integer, default=0)
    # When playback started for this entry (ms epoch), or 0 if not playing
    playing_since = db.Column(db.Integer, default=0)


# Audit log of room-related events for observability and debugging
class RoomAudit(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Room the event applies to; indexed for querying event history by room
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=False, index=True)
    # Optional user responsible for the event
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Event name/category (e.g., state_change, queue_add)
    event = db.Column(db.String(64), nullable=False, index=True)
    # JSON-encoded details payload (free-form text)
    details = db.Column(db.Text)
    # Creation timestamp (seconds), indexed for sorting/retrieval
    created_at = db.Column(db.Integer, default=lambda: int(time.time()), index=True)


