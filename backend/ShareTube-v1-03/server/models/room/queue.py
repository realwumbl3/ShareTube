"""Queue and QueueEntry models for ShareTube.

This module defines a logical queue of YouTube videos with per-entry
virtual clock state used to coordinate playback across clients.
"""

from __future__ import annotations

import time
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy.orm import Mapped, Query

from ...extensions import db
from .queue_entry import QueueEntry

if TYPE_CHECKING:
    # Imported only for type checking to avoid runtime circular imports
    from .room import Room
    from ...models.auth.user import User


class Queue(db.Model):
    """A logical queue of videos either for a room or a personal queue.

    If ``room_id`` is null, this queue is a personal/user queue.
    """

    # Surrogate primary key id
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)

    # Optional owning room; null indicates a personal/user queue context
    room_id: Mapped[Optional[int]] = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=True, index=True
    )

    # Optional creator id for personal queues or attribution
    created_by_id: Mapped[Optional[int]] = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=True
    )

    # Creation time of this queue
    created_at: Mapped[int] = db.Column(db.Integer, default=lambda: int(time.time()))

    # Relationship to the room
    room: Mapped[Optional["Room"]] = db.relationship(
        "Room", foreign_keys=[room_id], uselist=False, back_populates="queues"
    )

    # Relationship to the creator
    creator: Mapped[Optional["User"]] = db.relationship(
        "User", foreign_keys=[created_by_id], uselist=False
    )

    # Relationship to queue entries, cascading deletes when the queue is removed
    entries: Mapped[list["QueueEntry"]] = db.relationship(
        "QueueEntry",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="QueueEntry.queue_id",
        back_populates="queue",
    )

    current_entry_id: Mapped[Optional[int]] = db.Column(
        db.Integer, db.ForeignKey("queue_entry.id"), nullable=True, index=True
    )

    current_entry: Mapped[Optional["QueueEntry"]] = db.relationship(
        "QueueEntry", foreign_keys=[current_entry_id], uselist=False, post_update=True
    )

    def to_dict(self) -> dict:
        """Serialize queue to a dict suitable for clients.

        Entries are always ordered by position so that the frontend can rely on
        stable ordering regardless of how SQLAlchemy returns relationship rows.
        """
        ordered_entries = self.get_all_entries_ordered()
        # Avoid relying on ORM relationship caching for the "current_entry" snapshot.
        # During rapid transitions (auto-advance, navigation, reconnect), clients may
        # re-join and use this snapshot to decide which YouTube URL to load. Using the
        # FK `current_entry_id` as the source of truth prevents stale relationship data
        # from briefly pointing at the previous entry and causing a "snap back".
        current_entry = (
            db.session.get(QueueEntry, self.current_entry_id)
            if self.current_entry_id
            else None
        )
        return {
            "id": self.id,
            "room_id": self.room_id,
            "created_by_id": self.created_by_id,
            "creator": self.creator.to_dict() if self.creator else None,
            "created_at": self.created_at,
            "entries": [entry.to_dict() for entry in ordered_entries],
            "current_entry": current_entry.to_dict() if current_entry else None,
        }

    def get_all_entries_ordered(self) -> List["QueueEntry"]:
        """Get all entries ordered by position."""
        return (
            db.session.query(QueueEntry)
            .filter_by(queue_id=self.id)
            .order_by(QueueEntry.position.asc())
            .all()
        )

    def query_entries_by_status(self, status: str) -> Query["QueueEntry"]:
        """Get a query for all entries by status, ordered by position."""
        return (
            db.session.query(QueueEntry)
            .filter_by(queue_id=self.id)
            .filter_by(status=status)
            .order_by(QueueEntry.position.asc())
        )

