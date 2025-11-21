# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time
from typing import Optional

from sqlalchemy.orm import Mapped

# Import the SQLAlchemy instance from the shared extensions module
from ..extensions import db


# Audit log of room-related events for observability and debugging
class RoomAudit(db.Model):
    # Surrogate primary key id
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)
    # Room the event applies to; indexed for querying event history by room
    room_id: Mapped[int] = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=False, index=True
    )
    # Optional user responsible for the event
    user_id: Mapped[Optional[int]] = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=True
    )
    # Event name/category (e.g., state_change, queue_add)
    event: Mapped[str] = db.Column(db.String(64), nullable=False, index=True)
    # JSON-encoded details payload (free-form text)
    details: Mapped[Optional[str]] = db.Column(db.Text)
    # Creation timestamp (seconds), indexed for sorting/retrieval
    created_at: Mapped[int] = db.Column(
        db.Integer, default=lambda: int(time.time()), index=True
    )

