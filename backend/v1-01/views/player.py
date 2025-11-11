import logging
from ..extensions import db, socketio
from ..models import Room
import time


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

            now_ms = int(time.time() * 1000)
            current_entry = room.current_queue.current_entry
            initial_progress_ms = current_entry.progress_ms
            paused_progress_ms = (
                max(0, now_ms - current_entry.playing_since_ms) + initial_progress_ms
            )

            logging.info(f"paused_progress_ms: {paused_progress_ms}")
            room.state = "paused"
            current_entry.playing_since_ms = None
            current_entry.progress_ms = paused_progress_ms
            current_entry.paused_at = now_ms
            db.session.commit()
            db.session.refresh(room)
            socketio.emit(
                "room.playback",
                {
                    "server_now_ms": now_ms,
                    "code": code,
                    "state": "paused",
                    "playing_since_ms": None,
                    "progress_ms": paused_progress_ms,
                },
            )
        except Exception:
            logging.exception("room.control.pause handler error")

    @socketio.on("room.control.play")
    def _on_room_control_play(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            room = Room.query.filter_by(code=code).first()
            if not room or not room.current_queue:
                return
            if len(room.current_queue.entries) == 0:
                return
            if not room.current_queue.current_entry:
                entry, error = room.current_queue.load_next_entry()
                if error:
                    return
                db.session.commit()
                db.session.refresh(room)
                current_entry = entry
            else:
                current_entry = room.current_queue.current_entry
            now_ms = int(time.time() * 1000)
            room.state = "playing"
            current_entry.playing_since_ms = now_ms
            current_entry.paused_at = None
            db.session.commit()
            db.session.refresh(room)
            db.session.refresh(current_entry)
            socketio.emit(
                "room.playback",
                {
                    "code": code,
                    "state": "playing",
                    "playing_since_ms": now_ms,
                    "progress_ms": current_entry.progress_ms,
                    "current_entry": current_entry.to_dict(),
                },
            )
        except Exception:
            logging.exception("room.control.play handler error")

    @socketio.on("room.control.restartvideo")
    def _on_room_control_restartvideo(data):
        try:
            code = (data or {}).get("code")
            if not code:
                return
            room = Room.query.filter_by(code=code).first()
            if not room:
                return
            now_ms = int(time.time() * 1000)
            current_entry = room.current_queue.current_entry
            current_entry.progress_ms = 0
            current_entry.playing_since_ms = now_ms
            current_entry.paused_at = None
            room.state = "playing"
            db.session.commit()
            db.session.refresh(room)
            socketio.emit(
                "room.playback",
                {
                    "code": code,
                    "state": "playing",
                    "progress_ms": 0,
                    "playing_since_ms": now_ms,
                    "paused_at": None,
                },
            )
        except Exception:
            logging.exception("room.control.restartvideo handler error")

    @socketio.on("room.control.seek")
    def _on_room_control_seek(data):
        try:
            code = (data or {}).get("code")
            progress_ms = (data or {}).get("progress_ms")
            play = (data or {}).get("play")
            if not code:
                return
            room = Room.query.filter_by(code=code).first()
            if not room:
                return
            now_ms = int(time.time() * 1000)
            current_entry = room.current_queue.current_entry
            current_entry.progress_ms = progress_ms
            if play:
                current_entry.playing_since_ms = now_ms
            else:
                current_entry.playing_since_ms = None
            if play:
                room.state = "playing"
            else:
                room.state = "paused"
            db.session.commit()
            db.session.refresh(room)
            db.session.refresh(current_entry)
            socketio.emit(
                "room.playback",
                {
                    "code": code,
                    "state": room.state,
                    "progress_ms": progress_ms,
                    "playing_since_ms": current_entry.playing_since_ms,
                },
            )
        except Exception:
            logging.exception("room.control.seek handler error")
