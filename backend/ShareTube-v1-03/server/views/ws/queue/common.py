from __future__ import annotations

from ....extensions import db, socketio
from ....models import Room, RoomMembership, User


def emit_queue_update_for_room(room: Room) -> None:
    if room.current_queue:
        socketio.emit(
            "queue.update",
            room.current_queue.to_dict(),
            room=f"room:{room.code}",
        )


def can_modify_any_entry(room: Room, user_id: int) -> bool:
    """
    Check if a user can modify any entry in the queue (not just their own).
    
    Returns True if user is:
    - Room owner (room.owner_id == user_id)
    - Room operator (in room.operators OR RoomMembership.role == 'operator')
    - Admin or super-admin (User.role in ['admin', 'super_admin'])
    
    Otherwise returns False.
    """
    # Check if user is room owner
    if room.owner_id and room.owner_id == user_id:
        return True
    
    # Check if user is room operator (via RoomOperator table)
    if any(operator.user_id == user_id for operator in room.operators):
        return True
    
    # Check if user has operator role in RoomMembership
    membership = (
        db.session.query(RoomMembership)
        .filter_by(room_id=room.id, user_id=user_id)
        .first()
    )
    if membership and membership.role == "operator":
        return True
    
    # Check if user has admin or super-admin role
    user = db.session.get(User, user_id)
    if user and user.role in ("admin", "super_admin"):
        return True
    
    return False

