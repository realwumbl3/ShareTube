# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Backward compatibility: import all models from the new structure
from .models import (
    User,
    Room,
    RoomMembership,
    RoomOperator,
    Queue,
    QueueEntry,
    RoomAudit,
    ChatMessage,
)

__all__ = [
    "User",
    "Room",
    "RoomMembership",
    "RoomOperator",
    "Queue",
    "QueueEntry",
    "RoomAudit",
    "ChatMessage",
]
