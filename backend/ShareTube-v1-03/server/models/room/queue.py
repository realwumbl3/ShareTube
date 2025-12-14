"""Queue and QueueEntry models for ShareTube.

This module defines a logical queue of YouTube videos with per-entry
virtual clock state used to coordinate playback across clients.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy.orm import Mapped, Query

from ...extensions import db
from ...lib.utils import commit_with_retry, now_ms
from .queue_entry import QueueEntry

if TYPE_CHECKING:
    # Imported only for type checking to avoid runtime circular imports
    from .room import Room
    from ...models.auth.user import User
    from ...models.auth.youtube_author import YouTubeAuthor


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
        return {
            "id": self.id,
            "room_id": self.room_id,
            "created_by_id": self.created_by_id,
            "creator": self.creator.to_dict() if self.creator else None,
            "created_at": self.created_at,
            "entries": [entry.to_dict() for entry in ordered_entries],
            "current_entry": (
                self.current_entry.to_dict() if self.current_entry else None
            ),
        }

    def get_next_position(self) -> int:
        """Calculate the next position for a new entry in this queue."""
        last = (
            db.session.query(QueueEntry)
            .filter_by(queue_id=self.id)
            .order_by(QueueEntry.position.desc())
            .first()
        )
        if last and last.position:
            return last.position + 1
        return 1

    def add_entry(
        self,
        user_id: int,
        url: str,
        video_id: str,
        title: str,
        thumbnail_url: str,
        duration_ms: int,
        youtube_author: Optional["YouTubeAuthor"] = None,
    ) -> "QueueEntry":
        """Add a new entry to this queue."""
        position = self.get_next_position()
        entry = QueueEntry(
            queue_id=self.id,
            added_by_id=user_id,
            url=url,
            video_id=video_id,
            title=title,
            thumbnail_url=thumbnail_url,
            position=position,
            status="queued",
            duration_ms=duration_ms,
            youtube_author=youtube_author,
        )
        db.session.add(entry)
        commit_with_retry(db.session)
        return entry

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

    def load_next_entry(self):
        """Load the next queued entry in the queue (first entry by position)."""
        entry = self.query_entries_by_status("queued").first()
        if not entry:
            return None, "queue.load_next_entry: no entries in queue"

        # Keep model state in sync with the selected entry
        self.current_entry_id = entry.id
        commit_with_retry(db.session)
        return entry, None

    def advance_to_next(self) -> tuple[Optional["QueueEntry"], Optional[str]]:
        """Advance to the next queued entry in the queue.

        Returns (next_entry, error_message).
        """
        current_entry = self.current_entry
        if not current_entry:
            return None, "queue.advance_to_next: no current entry"

        # IMPORTANT:
        # Queue reordering renumbers *queued* entries to 1..N, but the current
        # playing entry may have a position outside that range (or may not be in
        # the queued list at all). Using "position > current.position" can
        # therefore skip the real top-of-queue entry.
        #
        # The desired behavior is: the next entry is always the top queued entry
        # (lowest position). Exclude the current entry if it is still marked as
        # queued for any reason.
        q = db.session.query(QueueEntry).filter_by(queue_id=self.id, status="queued")
        q = q.filter(QueueEntry.id != current_entry.id)
        next_entry = q.order_by(QueueEntry.position.asc()).first()

        # If there is no queued entry after the current one, signal exhaustion
        # without treating it as a hard error so callers can decide how to
        # handle end-of-queue semantics.
        if not next_entry:
            return None, None

        return next_entry, None

    def complete_and_advance(self) -> tuple[Optional["QueueEntry"], Optional[str]]:
        """Complete current entry (mark as watched and rotate) and advance to next.

        Returns (next_entry, error_message).
        """
        current_entry = self.current_entry
        if not current_entry:
            return None, "queue.complete_and_advance: no current entry"

        # Find next entry BEFORE rotating (position changes after rotate)
        next_entry, error = self.advance_to_next()
        if error:
            return None, f"queue.complete_and_advance: {error}"

        # Mark current as watched and move to tail
        current_entry.complete_and_rotate()

        # Advance to next entry if one exists, otherwise clear current entry to
        # indicate that the queue has been exhausted.
        if next_entry:
            self.current_entry_id = next_entry.id
            next_entry.mark_as_playing()
        else:
            self.current_entry_id = None

        commit_with_retry(db.session)
        db.session.refresh(self)

        return next_entry, None

    def skip_to_next(self) -> tuple[Optional["QueueEntry"], Optional[str]]:
        """Skip current entry and advance to next, marking current as skipped."""
        current_entry = self.current_entry
        if not current_entry:
            # No active entry; attempt to load the next queued item instead of failing.
            entry, error = self.load_next_entry()
            if error:
                return None, f"queue.skip_to_next: {error}"
            if not entry:
                return None, "queue.skip_to_next: no entries in queue"
            # Mark entry as playing immediately when loaded for playback
            entry.mark_as_playing()
            return entry, None

        next_entry, error = self.advance_to_next()
        if error:
            return None, f"queue.skip_to_next: {error}"
        if not next_entry:
            # No next entry available – mark the current one as skipped and
            # clear the queue's current entry so that the room can end up
            # with no active video.
            current_entry.skip()
            self.current_entry_id = None
            commit_with_retry(db.session)
            return None, "queue.skip_to_next: no next entry"

        # Mark current as skipped
        current_entry.skip()

        # Advance to next entry
        self.current_entry_id = next_entry.id
        next_entry.mark_as_playing()
        commit_with_retry(db.session)

        return next_entry, None
