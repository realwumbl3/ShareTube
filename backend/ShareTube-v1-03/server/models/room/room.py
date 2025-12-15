# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time
import secrets

# Provide Optional typing for clarity in relationships or lookups
from typing import Optional, TYPE_CHECKING, Callable

# SQLAlchemy typing helper for mapped attributes / relationships
from sqlalchemy.orm import Mapped

# Import the SQLAlchemy instance and socketio from the shared extensions module
from ...extensions import db, socketio
from ...models.auth.membership import RoomMembership, RoomOperator

if TYPE_CHECKING:
    # Imported only for static type checking to avoid circular imports at runtime
    from .queue import Queue
    from ...models.auth.user import User


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
    # Ad sync policy: off | pause_all | operators_only | starting_only
    ad_sync_mode: Mapped[str] = db.Column(db.String(24), default="pause_all")
    # Whether to auto-advance to next video when current video ends
    autoadvance_on_end: Mapped[bool] = db.Column(db.Boolean, default=True)
    # Current playback/state machine status for the room
    # idle | starting | playing | paused | midroll
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
    # ORM relationship to owner user
    owner: Mapped[Optional["User"]] = db.relationship("User", foreign_keys=[owner_id], lazy=True)

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
            "ad_sync_mode": self.ad_sync_mode,
            "autoadvance_on_end": self.autoadvance_on_end,
            "state": self.state,
            "current_queue_id": self.current_queue_id,
            "current_queue": (
                self.current_queue.to_dict() if self.current_queue else None
            ),
            "operators": [operator.user_id for operator in self.operators],
            "memberships": [membership.user_id for membership in self.memberships],
        }

