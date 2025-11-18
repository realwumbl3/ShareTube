# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time
import logging
from typing import Optional, List, Tuple

# Import the SQLAlchemy instance from the shared extensions module
from ..extensions import db
from ..utils import commit_with_retry


# A logical queue of videos either for a room or a personal queue (if room_id is null)
class Queue(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Optional owning room; null indicates a personal/user queue context
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=True, index=True)
    # Optional creator id for personal queues or attribution
    created_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Creation time of this queue
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))

    # Relationship to the room
    room = db.relationship(
        "Room", foreign_keys=[room_id], uselist=False, back_populates="queues"
    )
    # Relationship to the creator
    creator = db.relationship("User", foreign_keys=[created_by_id], uselist=False)

    # Relationship to queue entries, cascading deletes when the queue is removed
    entries = db.relationship(
        "QueueEntry",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="QueueEntry.queue_id",
        back_populates="queue",
    )

    current_entry_id = db.Column(
        db.Integer, db.ForeignKey("queue_entry.id"), nullable=True, index=True
    )

    current_entry = db.relationship(
        "QueueEntry", foreign_keys=[current_entry_id], uselist=False, post_update=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "room_id": self.room_id,
            "created_by_id": self.created_by_id,
            "creator": self.creator.to_dict() if self.creator else None,
            "created_at": self.created_at,
            "entries": [entry.to_dict() for entry in self.entries],
            "current_entry": (
                self.current_entry.to_dict() if self.current_entry else None
            ),
        }

    def load_next_entry(self):
        """Load the next entry in the queue (first entry by position)."""
        if len(self.entries) == 0:
            return None, "No entries in queue"
        entry = self.entries[0]
        # Set FK directly to avoid relationship circular dependency during flush
        self.current_entry_id = entry.id
        return entry, None

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
        )
        db.session.add(entry)
        commit_with_retry(db.session)
        return entry

    def get_entries_ordered(self) -> List["QueueEntry"]:
        """Get all entries ordered by position."""
        return (
            db.session.query(QueueEntry)
            .filter_by(queue_id=self.id)
            .order_by(QueueEntry.position.asc())
            .all()
        )

    def advance_to_next(self) -> Optional["QueueEntry"]:
        """Advance to the next entry in the queue, wrapping around."""
        entries = self.get_entries_ordered()
        if not entries:
            return None
        
        current_entry = self.current_entry
        if not current_entry:
            return None
        
        cur_idx = next(
            (i for i, e in enumerate[QueueEntry](entries) if e.id == current_entry.id),
            -1,
        )
        if cur_idx < 0:
            return None
        
        next_idx = (cur_idx + 1) % len(entries)
        return entries[next_idx]

    def complete_and_advance(self) -> Optional["QueueEntry"]:
        """Complete current entry (mark as watched and rotate) and advance to next entry."""
        current_entry = self.current_entry
        if not current_entry:
            return None
        
        # Find next entry BEFORE rotating (position changes after rotate)
        next_entry = self.advance_to_next()
        if not next_entry:
            return None
        
        # Mark current as watched and move to tail
        current_entry.complete_and_rotate()
        
        # Advance to next entry
        self.current_entry_id = next_entry.id
        next_entry.progress_ms = 0
        next_entry.playing_since_ms = None  # Don't set playing_since_ms until transitioning to playing
        next_entry.paused_at = None
        
        return next_entry

    def skip_to_next(self) -> Optional["QueueEntry"]:
        """Skip current entry and advance to next, marking current as skipped."""
        current_entry = self.current_entry
        if not current_entry:
            return None
        
        next_entry = self.advance_to_next()
        if not next_entry:
            return None
        
        # Mark current as skipped
        current_entry.status = "skipped"
        current_entry.progress_ms = 0
        current_entry.playing_since_ms = None
        current_entry.paused_at = None
        
        # Advance to next entry
        self.current_entry_id = next_entry.id
        next_entry.progress_ms = 0
        next_entry.playing_since_ms = None
        next_entry.paused_at = None
        
        return next_entry


# An item within a queue representing a single YouTube video
class QueueEntry(db.Model):
    # Surrogate primary key id
    id = db.Column(db.Integer, primary_key=True)
    # Owning queue id; indexed to support ordered listing by queue
    queue_id = db.Column(
        db.Integer, db.ForeignKey("queue.id"), nullable=False, index=True
    )
    # Relationship back to owning queue
    queue = db.relationship("Queue", foreign_keys=[queue_id], back_populates="entries")
    # User that added the entry (optional for system adds)
    added_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    # Canonical video URL
    url = db.Column(db.String(2048), nullable=False)
    # YouTube video id (canonical)
    video_id = db.Column(db.String(64))
    # Title fetched from YouTube APIs or oEmbed
    title = db.Column(db.String(512))
    # Best available thumbnail URL
    thumbnail_url = db.Column(db.String(1024))
    # 1-based position within the queue; also indexed for efficiency
    position = db.Column(db.Integer, index=True)
    # Time when the entry was added
    added_at = db.Column(db.Integer, default=lambda: int(time.time()))
    # Lifecycle status: queued | skipped | deleted (watched is derived from watch_count > 0)
    status = db.Column(db.String(32), default="queued")
    # Number of times this entry has been completed/rotated
    watch_count = db.Column(db.Integer, default=0)
    # Per-entry virtual clock fields (milliseconds)
    duration_ms = db.Column(db.Integer, default=0)
    # Unix timestamp (milliseconds) when the video started playing
    playing_since_ms = db.Column(db.BigInteger, nullable=True)
    # Last known progress in milliseconds when paused (for resume)
    progress_ms = db.Column(db.Integer, default=0)
    # Unix timestamp (seconds) when the video was last paused
    paused_at = db.Column(db.Integer, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "queue_id": self.queue_id,
            "added_by_id": self.added_by_id,
            "url": self.url,
            "video_id": self.video_id,
            "title": self.title,
            "thumbnail_url": self.thumbnail_url,
            "position": self.position,
            "status": self.status,
            "watch_count": self.watch_count,
            "duration_ms": self.duration_ms,
            "playing_since_ms": self.playing_since_ms,
            "progress_ms": self.progress_ms,
            "paused_at": self.paused_at,
        }

    def remove(self) -> None:
        """Mark this entry as deleted."""
        self.status = "deleted"
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
        return paused_progress_ms

    def play(self, now_ms: int) -> None:
        """Start or resume playback."""
        self.playing_since_ms = now_ms
        self.paused_at = None

    def restart(self, now_ms: int) -> None:
        """Restart playback from the beginning."""
        self.progress_ms = 0
        self.playing_since_ms = now_ms
        self.paused_at = None

    def seek(self, progress_ms: int, now_ms: int, play: bool) -> None:
        """Seek to a specific progress position."""
        self.progress_ms = progress_ms
        if play:
            self.playing_since_ms = now_ms
        else:
            self.playing_since_ms = None

    def check_completion(self, now_ms: int) -> bool:
        """Check if this entry has reached completion (within 2 seconds of end)."""
        base_progress_ms = self.progress_ms or 0
        elapsed_ms = (
            max(0, now_ms - int(self.playing_since_ms))
            if self.playing_since_ms
            else 0
        )
        effective_progress_ms = base_progress_ms + elapsed_ms
        duration_ms = max(0, int(self.duration_ms or 0))

        if duration_ms <= 0:
            return False

        near_end = max(0, duration_ms - 2000)
        return effective_progress_ms >= near_end

    def complete_and_rotate(self) -> None:
        """Mark entry as watched and move to tail of queue."""
        self.watch_count = (self.watch_count or 0) + 1
        self.progress_ms = 0
        self.playing_since_ms = None
        self.paused_at = None
        
        # Move to tail by setting position to max + 1
        entries = self.queue.get_entries_ordered()
        max_pos = max(e.position or 0 for e in entries) if entries else 0
        self.position = max_pos + 1

