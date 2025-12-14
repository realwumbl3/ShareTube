# Analytics module for dashboard
# Contains statistical calculations and data aggregation logic
from datetime import datetime, timedelta, timezone

from .backend import logger
from server.extensions import db
from server.models import User, Room, RoomMembership, Queue, QueueEntry, RoomAudit


class DashboardAnalytics:
    """Analytics calculations for the dashboard."""

    @staticmethod
    def get_user_stats():
        """Get comprehensive user statistics."""
        try:
            total_users = User.query.count()
            active_users = User.query.filter(User.active.is_(True)).count()
            inactive_users = total_users - active_users

            # Recent activity (users seen in last 7 days)
            week_ago = datetime.now(timezone.utc) - timedelta(days=7)
            week_ago_ts = int(week_ago.timestamp())
            recent_active = User.query.filter(User.last_seen >= week_ago_ts).count()

            return {
                "total": total_users,
                "active": active_users,
                "inactive": inactive_users,
                "recent_active": recent_active,
            }
        except Exception as e:
            logger.exception("Error in get_user_stats")
            return {
                "total": 0,
                "active": 0,
                "inactive": 0,
                "recent_active": 0,
                "error": str(e)
            }

    @staticmethod
    def get_room_stats():
        """Get comprehensive room statistics."""
        try:
            total_rooms = Room.query.count()
            # Rooms are considered "active" if they have recent activity or members
            # For now, just count all rooms as active since there's no explicit is_active field
            active_rooms = total_rooms  # Placeholder - could be improved with activity checks
            public_rooms = Room.query.filter(Room.is_private.is_(False)).count()
            private_rooms = total_rooms - public_rooms

            return {
                "total": total_rooms,
                "active": active_rooms,
                "inactive": 0,  # Placeholder
                "public": public_rooms,
                "private": private_rooms,
            }
        except Exception as e:
            logger.exception("Error in get_room_stats")
            return {
                "total": 0,
                "active": 0,
                "inactive": 0,
                "public": 0,
                "private": 0,
                "error": str(e)
            }

    @staticmethod
    def get_session_stats():
        """Get session and membership statistics."""
        try:
            active_sessions = RoomMembership.query.count()
            total_memberships = RoomMembership.query.count()

            # Average members per room
            total_rooms = Room.query.count()
            avg_members_per_room = active_sessions / total_rooms if total_rooms > 0 else 0

            return {
                "active_sessions": active_sessions,
                "total_memberships": total_memberships,
                "avg_members_per_room": round(avg_members_per_room, 2),
            }
        except Exception as e:
            logger.exception("Error in get_session_stats")
            return {
                "active_sessions": 0,
                "total_memberships": 0,
                "avg_members_per_room": 0,
                "error": str(e)
            }

    @staticmethod
    def get_queue_stats():
        """Get queue and video statistics."""
        try:
            total_queues = Queue.query.count()
            total_entries = QueueEntry.query.count()

            # Get average queue length
            avg_queue_length = total_entries / total_queues if total_queues > 0 else 0

            # Get most popular video domains (basic analysis)
            domain_counts = {}
            entries = QueueEntry.query.limit(1000).all()  # Limit to avoid performance issues
            for entry in entries:
                if entry.url:
                    try:
                        from urllib.parse import urlparse
                        domain = urlparse(entry.url).netloc
                        if domain:
                            domain_counts[domain] = domain_counts.get(domain, 0) + 1
                    except:
                        pass

            top_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)[:5]

            return {
                "total_queues": total_queues,
                "total_entries": total_entries,
                "avg_queue_length": round(avg_queue_length, 2),
                "top_domains": top_domains,
            }
        except Exception as e:
            logger.exception("Error in get_queue_stats")
            return {
                "total_queues": 0,
                "total_entries": 0,
                "avg_queue_length": 0,
                "top_domains": [],
                "error": str(e)
            }

    @staticmethod
    def get_activity_stats(hours=24):
        """Get activity statistics for the last N hours."""
        try:
            since = datetime.now(timezone.utc) - timedelta(hours=hours)
            since_ts = int(since.timestamp())

            total_events = RoomAudit.query.filter(RoomAudit.created_at >= since_ts).count()

            # Events by type
            events_by_type = db.session.query(
                RoomAudit.event,
                db.func.count(RoomAudit.id)
            ).filter(RoomAudit.created_at >= since_ts).group_by(RoomAudit.event).all()

            events_by_type = {event: count for event, count in events_by_type}

            return {
                "total_events": total_events,
                "events_by_type": events_by_type,
                "hours": hours,
            }
        except Exception as e:
            logger.exception("Error in get_activity_stats")
            return {
                "total_events": 0,
                "events_by_type": {},
                "hours": hours,
                "error": str(e)
            }

    @staticmethod
    def get_all_stats():
        """Get all dashboard statistics in one call."""
        return {
            "users": DashboardAnalytics.get_user_stats(),
            "rooms": DashboardAnalytics.get_room_stats(),
            "sessions": DashboardAnalytics.get_session_stats(),
            "queues": DashboardAnalytics.get_queue_stats(),
            "activity": DashboardAnalytics.get_activity_stats(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
