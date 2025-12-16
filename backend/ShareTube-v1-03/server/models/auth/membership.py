# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

import time
from typing import TYPE_CHECKING

from sqlalchemy.orm import Mapped

from ...extensions import db

if TYPE_CHECKING:
    from ...models.auth.user import User


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

