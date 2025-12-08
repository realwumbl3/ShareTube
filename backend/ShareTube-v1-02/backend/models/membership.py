# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

import time
from typing import Optional, TYPE_CHECKING

from sqlalchemy.orm import Mapped

from ..extensions import db

if TYPE_CHECKING:
    from .room import Room


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
    def get_active_room_for_user(cls, user_id: int) -> Optional["Room"]:
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
        return membership.room

    @classmethod
    def join_room(cls, room: Room, user_id: int) -> "RoomMembership":
        """Join a room, creating or updating membership as needed."""
        from .user import User

        membership = cls.query.filter_by(room_id=room.id, user_id=user_id).first()
        now = int(time.time())
        room_in_starting = room.state in ("starting", "midroll")

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
        """Remove this membership and update user's active status if needed."""
        from .user import User

        # Update user's last_seen timestamp when leaving
        user = db.session.get(User, self.user_id)
        if user:
            user.last_seen = int(time.time())

        # Delete this membership record
        db.session.delete(self)

        # Check if user has any other room memberships after deletion
        other_memberships = RoomMembership.query.filter_by(user_id=self.user_id).first()
        if not other_memberships and user:
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


__all__ = ["RoomMembership", "RoomOperator"]

