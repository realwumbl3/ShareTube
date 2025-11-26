# Data retrieval module for dashboard
# Handles formatting and retrieval of different data types for the dashboard
from datetime import datetime, timezone
from typing import List, Dict, Any

from .backend import logger
from .shared_imports import db, User, Room, RoomMembership, Queue, QueueEntry, RoomAudit, ChatMessage

class DashboardData:
    """Data retrieval and formatting for dashboard."""

    @staticmethod
    def get_recent_activity(limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent activity from audit logs."""
        try:
            audits = RoomAudit.query.order_by(
                RoomAudit.created_at.desc()
            ).limit(limit).all()

            activity = []
            for audit in audits:
                activity.append({
                    "id": audit.id,
                    "type": audit.event,
                    "user": audit.user.name if audit.user else "Unknown",
                    "user_id": audit.user_id,
                    "room": audit.room.code if audit.room else "Unknown",
                    "room_id": audit.room_id,
                    "details": audit.details,
                    "timestamp": audit.created_at,
                })

            return activity
        except Exception as e:
            logger.exception("Error in get_recent_activity")
            return []

    @staticmethod
    def get_users_data(limit: int = 100) -> List[Dict[str, Any]]:
        """Get user data for dashboard display."""
        users = User.query.order_by(User.id.desc()).limit(limit).all()

        user_data = []
        for user in users:
            # Get room count for this user
            room_count = db.session.query(RoomMembership).filter(
                RoomMembership.user_id == user.id
            ).count()

            # Get videos added by this user
            videos_added = db.session.query(QueueEntry).filter(
                QueueEntry.added_by_id == user.id
            ).count()

            user_data.append({
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "active": user.active,
                "last_seen": user.last_seen,
                "created_at": None,  # User model doesn't have created_at
                "room_count": room_count,
                "videos_added": videos_added,
            })

        return user_data

    @staticmethod
    def get_rooms_data(limit: int = 100) -> List[Dict[str, Any]]:
        """Get room data for dashboard display."""
        rooms = Room.query.order_by(Room.id.desc()).limit(limit).all()

        room_data = []
        for room in rooms:
            # Get member count
            member_count = db.session.query(RoomMembership).filter(
                RoomMembership.room_id == room.id
            ).count()

            # Get queue info
            queue_info = db.session.query(Queue).filter(Queue.room_id == room.id).first()
            queue_count = len(queue_info.entries) if queue_info and queue_info.entries else 0

            # Get recent activity count (last 24 hours)
            day_ago = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            day_ago_ts = int(day_ago.timestamp())
            recent_activity = db.session.query(RoomAudit).filter(
                RoomAudit.room_id == room.id,
                RoomAudit.created_at >= day_ago_ts
            ).count()

        room_data.append({
            "id": room.id,
            "code": room.code,
            "name": room.code,  # Use code as name since there's no name field
            "is_active": True,  # Assume rooms are active since no is_active field
            "is_public": not room.is_private,
            "member_count": member_count,
            "queue_count": queue_count,
            "recent_activity": recent_activity,
            "created_at": room.created_at,
            "owner": room.owner.name if room.owner else "Unknown",
            "owner_id": room.owner_id,
        })

        return room_data

    @staticmethod
    def get_queues_data(limit: int = 50) -> List[Dict[str, Any]]:
        """Get queue data for dashboard display."""
        queues = Queue.query.limit(limit).all()

        queue_data = []
        for queue in queues:
            entries = []
            if queue.entries:
                # Sort entries by position or added_at
                sorted_entries = sorted(queue.entries, key=lambda e: e.added_at or datetime.min)
                for entry in sorted_entries[:10]:  # Limit to first 10 entries per queue
                    # Get user info for added_by
                    added_by_user = None
                    if entry.added_by_id:
                        added_by_user = User.query.get(entry.added_by_id)

                    entries.append({
                        "id": entry.id,
                        "title": entry.title,
                        "url": entry.url,
                        "duration_ms": entry.duration_ms,
                        "added_by": added_by_user.name if added_by_user else "Unknown",
                        "added_by_id": entry.added_by_id,
                        "added_at": entry.added_at,
                    })

            queue_data.append({
                "id": queue.id,
                "room_id": queue.room_id,
                "room_code": queue.room.code if queue.room else "Unknown",
                "entry_count": len(queue.entries) if queue.entries else 0,
                "entries": entries,
            })

        return queue_data

    @staticmethod
    def get_system_health() -> Dict[str, Any]:
        """Get system health information."""
        try:
            # Database connectivity check
            db.session.execute(db.text("SELECT 1")).first()
            db_status = "healthy"
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            db_status = "unhealthy"

        return {
            "database": db_status,
            "timestamp": datetime.utcnow().isoformat(),
        }
