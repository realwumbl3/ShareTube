import logging
from ..extensions import db, socketio
from ..models import Room
from ..sockets import emit_function_after_delay
from ..views.rooms import emit_room_state_update
from ..views.queue import emit_queue_update_for_room


def register_socket_handlers():
    @socketio.on("room.control.pause")
    def _on_room_control_pause(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            room = Room.query.filter_by(code=code).first()
            if not room:
                return
            room.state = "paused"
            db.session.commit()
            db.session.refresh(room)
            emit_function_after_delay(emit_room_state_update, room, 0.4)
        except Exception:
            logging.exception("room.control.pause handler error")

    @socketio.on("room.control.play")
    def _on_room_control_play(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            room = Room.query.filter_by(code=code).first()
            if not room:
                return
            if room.state == "idle":
                if not room.current_queue.current_entry:
                    room.current_queue.load_next_entry()
            room.state = "playing"
            db.session.commit()
            db.session.refresh(room)
            emit_function_after_delay(emit_room_state_update, room, 0.4)
            emit_function_after_delay(emit_queue_update_for_room, room, 0.4)
        except Exception:
            logging.exception("room.control.play handler error")
