# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

import time
from typing import Optional, TYPE_CHECKING

from sqlalchemy.orm import Mapped

from ...extensions import db

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



__all__ = ["QueueEntry"]

