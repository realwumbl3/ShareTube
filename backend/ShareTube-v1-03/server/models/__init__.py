# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import all models for backward compatibility from reorganized subdirectories
from .auth.user import User
from .auth.membership import RoomMembership, RoomOperator
from .auth.youtube_author import YouTubeAuthor
from .room.room import Room
from .room.queue import Queue
from .room.queue_entry import QueueEntry
from .room.chat import ChatMessage
from .meta.audit import RoomAudit

__all__ = [
    "User",
    "Room",
    "RoomMembership",
    "RoomOperator",
    "Queue",
    "QueueEntry",
    "RoomAudit",
    "ChatMessage",
    "YouTubeAuthor",
]

