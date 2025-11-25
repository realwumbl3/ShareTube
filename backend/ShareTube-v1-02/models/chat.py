# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import time to record timestamps for model defaults
import time

from sqlalchemy.orm import Mapped

# Import the SQLAlchemy instance from the shared extensions module
from ..extensions import db


class ChatMessage(db.Model):
    # Surrogate primary key id
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)
    # Owning room id
    room_id: Mapped[int] = db.Column(
        db.Integer, db.ForeignKey("room.id"), nullable=False, index=True
    )
    # Sender user id
    user_id: Mapped[int] = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False, index=True
    )
    # Message text content
    text: Mapped[str] = db.Column(db.Text, nullable=False)
    # Creation timestamp (seconds)
    created_at: Mapped[int] = db.Column(
        db.Integer, default=lambda: int(time.time()), index=True
    )

