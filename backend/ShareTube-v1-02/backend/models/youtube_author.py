"""YouTube author metadata tracked for queued videos."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy.orm import Mapped

from ..extensions import db
from ..utils import fetch_youtube_channel_meta, now_ms

if TYPE_CHECKING:
    from .queue_entry import QueueEntry


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

    @classmethod
    def get_or_create_from_video_meta(cls, meta: dict) -> Optional["YouTubeAuthor"]:
        """Ensure we have an author record whenever we can derive a channel_id."""

        channel_id = meta.get("channel_id")
        if not channel_id:
            return None

        channel_title = meta.get("channel_title") or "Unknown"
        author = (
            db.session.query(cls)
            .filter_by(channel_id=channel_id)
            .first()
        )

        if not author:
            author = cls(channel_id=channel_id, title=channel_title)
            db.session.add(author)

        author.update_from_video_meta(meta)
        channel_meta = fetch_youtube_channel_meta(channel_id)
        if channel_meta:
            author.update_from_channel_meta(channel_meta)

        author.last_seen_ms = now_ms()
        return author

    def update_from_video_meta(self, meta: dict) -> None:
        """Fill in runtime fields that come from video metadata."""

        channel_title = meta.get("channel_title")
        if channel_title and channel_title != self.title:
            self.title = channel_title

    def update_from_channel_meta(self, channel_meta: dict) -> None:
        """Merge channel API response data into this model."""

        title = channel_meta.get("title")
        if title:
            self.title = title

        self.description = channel_meta.get("description") or self.description
        self.custom_url = channel_meta.get("custom_url") or self.custom_url
        self.country = channel_meta.get("country") or self.country
        self.thumbnail_url = channel_meta.get("thumbnail_url") or self.thumbnail_url
        self.published_at = channel_meta.get("published_at") or self.published_at

        stats = {
            "subscriber_count": channel_meta.get("subscriber_count"),
            "view_count": channel_meta.get("view_count"),
            "video_count": channel_meta.get("video_count"),
        }

        for attr, value in stats.items():
            if value is not None:
                setattr(self, attr, value)

        raw_response = channel_meta.get("raw_response")
        if raw_response:
            self.raw_response = raw_response

