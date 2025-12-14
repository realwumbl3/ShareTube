# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

import time
from typing import Optional, TYPE_CHECKING

from sqlalchemy.orm import Mapped

from ...extensions import db
from ...lib.utils import commit_with_retry, now_ms

if TYPE_CHECKING:
    from .queue import Queue
    from ...models.auth.youtube_author import YouTubeAuthor


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
            "youtube_author": (
                self.youtube_author.to_dict() if self.youtube_author else None
            ),
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

    def mark_as_playing(self) -> None:
        """Mark this entry as playing without setting the playing timestamp.

        This is used when an entry is loaded for immediate playback but hasn't
        actually started playing yet (e.g., during control.play or control.skip).
        """
        self.status = "playing"
        self.progress_ms = 0
        self.playing_since_ms = None
        self.paused_at = None
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

    def seek(self, progress_ms: int, _now_ms: Optional[int], play: bool) -> None:
        """Seek to a specific progress position."""
        if _now_ms is None:
            _now_ms = now_ms()
        self.progress_ms = progress_ms
        if play:
            self.playing_since_ms = _now_ms
        else:
            self.playing_since_ms = None
        commit_with_retry(db.session)

    def relative_seek(self, delta_ms: int, _now_ms: Optional[int], play: bool) -> None:
        """Seek relative to the current position."""
        if _now_ms is None:
            _now_ms = now_ms()
        effective_progress_ms = self.calculate_effective_progress_ms(_now_ms)
        new_progress_ms = effective_progress_ms + delta_ms
        # Clamp to valid bounds (0 to duration_ms)
        self.progress_ms = max(0, min(new_progress_ms, self.duration_ms or 0))
        if play:
            self.playing_since_ms = _now_ms
        else:
            self.playing_since_ms = None
        commit_with_retry(db.session)

    def calculate_effective_progress_ms(self, _now_ms: Optional[int]) -> int:
        """Calculate the effective progress in milliseconds."""
        base_progress_ms = self.progress_ms or 0
        playing_since_ms = self.playing_since_ms or 0
        elapsed_ms = (
            max(0, _now_ms - playing_since_ms) if playing_since_ms else 0
        )
        return base_progress_ms + elapsed_ms

    def check_completion(self, _now_ms: Optional[int] = None) -> bool:
        """Check if this entry has reached completion (within 2 seconds of end).

        Args:
            _now_ms: The current time in milliseconds. Defaults to the current time.

        Returns:
            True if the entry has reached completion, False otherwise.
        """
        if _now_ms is None:
            _now_ms = now_ms()
        effective_progress_ms = self.calculate_effective_progress_ms(_now_ms)
        duration_ms = max(0, int(self.duration_ms or 0))
        if duration_ms <= 0:
            return False
        near_end = max(0, duration_ms - 6000)
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


__all__ = ["QueueEntry"]

