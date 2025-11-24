"""Queue and QueueEntry models for ShareTube.

This module defines a logical queue of YouTube videos with per-entry
virtual clock state used to coordinate playback across clients.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy.orm import Mapped, Query

from ..extensions import db
from ..utils import commit_with_retry, now_ms

if TYPE_CHECKING:
    # Imported only for type checking to avoid runtime circular imports
    from .room import Room
    from .user import User
    from .youtube_author import YouTubeAuthor


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
        """Advance to the next queued entry in the queue, wrapping around.

        Returns (next_entry, error_message).
        """
        current_entry = self.current_entry
        if not current_entry:
            return None, "queue.advance_to_next: no current entry"

        # Find the next queued entry strictly after the current entry's position.
        next_entry = (
            db.session.query(QueueEntry)
            .filter_by(queue_id=self.id, status="queued")
            .filter(QueueEntry.position > (current_entry.position or 0))
            .order_by(QueueEntry.position.asc())
            .first()
        )

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
            next_entry.reset()
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
            entry.reset()
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
        next_entry.reset()
        commit_with_retry(db.session)

        return next_entry, None


class QueueEntry(db.Model):
    """An item within a queue representing a single YouTube video."""

    # Surrogate primary key id
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)

    # Owning queue id; indexed to support ordered listing by queue
    queue_id: Mapped[int] = db.Column(
        db.Integer, db.ForeignKey("queue.id"), nullable=False, index=True
    )

    # Relationship back to owning queue
    queue: Mapped[Optional["Queue"]] = db.relationship(
        "Queue", foreign_keys=[queue_id], back_populates="entries"
    )

    # User that added the entry (optional for system adds)
    added_by_id: Mapped[Optional[int]] = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=True
    )

    # Canonical video URL
    url: Mapped[str] = db.Column(db.String(2048), nullable=False)

    # YouTube video id (canonical)
    video_id: Mapped[Optional[str]] = db.Column(db.String(64))

    youtube_author_id: Mapped[Optional[int]] = db.Column(
        db.Integer, db.ForeignKey("youtube_author.id"), nullable=True, index=True
    )
    youtube_author: Mapped[Optional["YouTubeAuthor"]] = db.relationship(
        "YouTubeAuthor",
        foreign_keys=[youtube_author_id],
        back_populates="entries",
        uselist=False,
    )

    # Title fetched from YouTube APIs or oEmbed
    title: Mapped[Optional[str]] = db.Column(db.String(512))

    # Best available thumbnail URL
    thumbnail_url: Mapped[Optional[str]] = db.Column(db.String(1024))

    # 1-based position within the queue; also indexed for efficiency
    position: Mapped[Optional[int]] = db.Column(db.Integer, index=True)

    # Time when the entry was added
    added_at: Mapped[int] = db.Column(db.Integer, default=lambda: int(time.time()))

    # Lifecycle status: queued | skipped | deleted | watched
    status: Mapped[str] = db.Column(db.String(32), default="queued")

    # Number of times this entry has been completed/rotated
    watch_count: Mapped[int] = db.Column(db.Integer, default=0)

    # Per-entry virtual clock fields (milliseconds)
    duration_ms: Mapped[int] = db.Column(db.Integer, default=0)

    # Unix timestamp (milliseconds) when the video started playing
    playing_since_ms: Mapped[Optional[int]] = db.Column(db.BigInteger, nullable=True)

    # Last known progress in milliseconds when paused (for resume)
    progress_ms: Mapped[int] = db.Column(db.Integer, default=0)

    # Unix timestamp (seconds) when the video was last paused
    paused_at: Mapped[Optional[int]] = db.Column(db.Integer, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "queue_id": self.queue_id,
            "added_by_id": self.added_by_id,
            "url": self.url,
            "video_id": self.video_id,
            "title": self.title,
            "thumbnail_url": self.thumbnail_url,
            "youtube_author_id": self.youtube_author_id,
            "youtube_author": self.youtube_author.to_dict()
            if self.youtube_author
            else None,
            "position": self.position,
            "status": self.status,
            "watch_count": self.watch_count,
            "duration_ms": self.duration_ms,
            "playing_since_ms": self.playing_since_ms,
            "progress_ms": self.progress_ms,
            "paused_at": self.paused_at,
        }

    def reset(self) -> None:
        """Reset the entry to its initial state."""
        self.progress_ms = 0
        self.playing_since_ms = None
        self.paused_at = None
        self.status = "queued"
        commit_with_retry(db.session)

    def skip(self) -> None:
        """Mark this entry as skipped."""
        self.playing_since_ms = None
        self.status = "skipped"
        commit_with_retry(db.session)

    def remove(self) -> None:
        """Mark this entry as deleted, or remove from DB if already marked."""
        if self.status == "deleted":
            db.session.delete(self)
        else:
            self.status = "deleted"
        commit_with_retry(db.session)

    def start(self, now_ms: int) -> None:
        """Mark this entry as actively playing from its current progress.

        This is used when playback first transitions into the playing state (or
        when resuming) so that the entry's lifecycle status reflects that it is
        currently being watched.
        """
        self.status = "playing"
        self.playing_since_ms = now_ms
        self.paused_at = None
        commit_with_retry(db.session)

    def pause(self, now_ms: int) -> int:
        """Pause playback and return the paused progress in milliseconds."""
        initial_progress_ms = self.progress_ms or 0
        paused_progress_ms = (
            max(0, now_ms - (self.playing_since_ms or 0)) + initial_progress_ms
        )
        self.playing_since_ms = None
        self.progress_ms = paused_progress_ms
        self.paused_at = now_ms
        commit_with_retry(db.session)
        return paused_progress_ms

    def play(self, now_ms: int) -> None:
        """Start or resume playback."""
        self.playing_since_ms = now_ms
        self.paused_at = None
        commit_with_retry(db.session)

    def restart(self, now_ms: int) -> None:
        """Restart playback from the beginning."""
        self.progress_ms = 0
        self.playing_since_ms = now_ms
        self.paused_at = None
        commit_with_retry(db.session)

    def seek(self, progress_ms: int, now_ms: int, play: bool) -> None:
        """Seek to a specific progress position."""
        self.progress_ms = progress_ms
        if play:
            self.playing_since_ms = now_ms
        else:
            self.playing_since_ms = None
        commit_with_retry(db.session)

    def check_completion(self, _now_ms: int = None) -> bool:
        """Check if this entry has reached completion (within 2 seconds of end).

        Args:
            _now_ms: The current time in milliseconds. Defaults to the current time.

        Returns:
            True if the entry has reached completion, False otherwise.
        """
        if _now_ms is None:
            _now_ms = now_ms()
        base_progress_ms = self.progress_ms or 0
        elapsed_ms = (
            max(0, _now_ms - int(self.playing_since_ms)) if self.playing_since_ms else 0
        )
        effective_progress_ms = base_progress_ms + elapsed_ms
        duration_ms = max(0, int(self.duration_ms or 0))

        if duration_ms <= 0:
            return False

        near_end = max(0, duration_ms - 2000)
        logging.info("queue.check_completion: effective_progress_ms=%s, near_end=%s", effective_progress_ms, near_end)
        return effective_progress_ms >= near_end

    def complete_and_rotate(self) -> None:
        """Mark entry as watched and move to tail of queue."""
        self.watch_count = (self.watch_count or 0) + 1
        self.progress_ms = 0
        self.playing_since_ms = None
        self.paused_at = None
        self.status = "played"
        commit_with_retry(db.session)

        # Move to tail by setting position to max + 1
        entries = self.queue.query_entries_by_status("queued").all()
        max_pos = max(e.position or 0 for e in entries) if entries else 0
        self.position = max_pos + 1
