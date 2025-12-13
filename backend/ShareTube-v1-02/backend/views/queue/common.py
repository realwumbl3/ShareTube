from __future__ import annotations

from ...extensions import socketio
from ...models import Room


def emit_queue_update_for_room(room: Room) -> None:
    if room.current_queue:
        socketio.emit(
            "queue.update",
            room.current_queue.to_dict(),
            room=f"room:{room.code}",
        )

