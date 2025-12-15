"""YouTube author metadata tracked for queued videos."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy.orm import Mapped

from ...extensions import db
from ...lib.utils import now_ms

if TYPE_CHECKING:
    from ...models.room.queue_entry import QueueEntry


class YouTubeAuthor(db.Model):
    """Metadata about a YouTube channel/author."""

    __tablename__ = "youtube_author"

    id: Mapped[int] = db.Column(db.Integer, primary_key=True)
    channel_id: Mapped[str] = db.Column(
        db.String(64), nullable=False, unique=True, index=True
    )
    title: Mapped[str] = db.Column(db.String(512), nullable=False)
    description: Mapped[Optional[str]] = db.Column(db.Text, nullable=True)
    custom_url: Mapped[Optional[str]] = db.Column(db.String(256), nullable=True)
    country: Mapped[Optional[str]] = db.Column(db.String(64), nullable=True)
    thumbnail_url: Mapped[Optional[str]] = db.Column(db.String(1024), nullable=True)
    published_at: Mapped[Optional[str]] = db.Column(db.String(64), nullable=True)
    subscriber_count: Mapped[Optional[int]] = db.Column(
        db.BigInteger, nullable=True
    )
    view_count: Mapped[Optional[int]] = db.Column(db.BigInteger, nullable=True)
    video_count: Mapped[Optional[int]] = db.Column(db.BigInteger, nullable=True)
    raw_response: Mapped[Optional[dict]] = db.Column(db.JSON, nullable=True)
    last_seen_ms: Mapped[int] = db.Column(db.BigInteger, nullable=False, default=now_ms)

    entries: Mapped[list["QueueEntry"]] = db.relationship(
        "QueueEntry",
        back_populates="youtube_author",
        lazy=True,
        foreign_keys="QueueEntry.youtube_author_id",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "channel_id": self.channel_id,
            "title": self.title,
            "description": self.description,
            "custom_url": self.custom_url,
            "country": self.country,
            "thumbnail_url": self.thumbnail_url,
            "published_at": self.published_at,
            "subscriber_count": self.subscriber_count,
            "view_count": self.view_count,
            "video_count": self.video_count,
            "last_seen_ms": self.last_seen_ms,
        }


