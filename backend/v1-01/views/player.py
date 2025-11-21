import logging
import time

from ..extensions import db, socketio
from .room_timeouts import schedule_starting_to_playing_timeout, cancel_starting_timeout
from .decorators import require_room_by_code
from ..utils import now_ms

from ..models import Room


def register_socket_handlers():
    @socketio.on("room.control.pause")
    @require_room_by_code
    def _on_room_control_pause(room: Room, user_id: int, data: dict):
        res, rej = Room.emit(room.code, trigger="room.control.pause")
        try:
            _now_ms = now_ms()
            paused_progress_ms, error = room.pause_playback(_now_ms)
            if error:
                rej(error)
                return
            if room.state == "starting":
                cancel_starting_timeout(room.code)
            res(
                "room.playback",
                {
                    "state": "paused",
                    "playing_since_ms": None,
                    "progress_ms": paused_progress_ms,
                    "actor_user_id": user_id,
                },
            )
        except Exception as e:
            logging.exception("room.control.pause handler error: %s", e)
            rej(f"room.control.pause handler error: {e}")

    @socketio.on("room.control.play")
    @require_room_by_code
    def _on_room_control_play(room: Room, user_id: int, data: dict):
        res, rej = Room.emit(room.code, trigger="room.control.play")
        try:
            _now_ms = now_ms()
            result, error = room.start_playback(_now_ms)
            if result is None or error:
                rej(error)
                return
            if room.state == "starting":
                cancel_starting_timeout(room.code)
            if result["state"] == "starting":
                schedule_starting_to_playing_timeout(room.code, delay_seconds=15)
            res("room.playback", {"actor_user_id": user_id, **result})
        except Exception as e:
            logging.exception("room.control.play handler error")
            rej(f"room.control.play handler error: {e}")

    @socketio.on("room.control.restartvideo")
    @require_room_by_code
    def _on_room_control_restartvideo(room: Room, user_id: int, data: dict):
        res, rej = Room.emit(room.code, trigger="room.control.restartvideo")
        try:
            _now_ms = now_ms()
            _, error = room.restart_video(_now_ms)
            if error:
                rej(error)
                return
            if room.state == "starting":
                cancel_starting_timeout(room.code)
            res(
                "room.playback",
                {
                    "state": "playing",
                    "progress_ms": 0,
                    "playing_since_ms": _now_ms,
                    "paused_at": None,
                    "actor_user_id": user_id,
                },
            )
        except Exception as e:
            logging.exception("room.control.restartvideo handler error: %s", e)
            rej(f"room.control.restartvideo handler error: {e}")

    @socketio.on("room.control.seek")
    @require_room_by_code
    def _on_room_control_seek(room: Room, user_id: int, data: dict):
        res, rej = Room.emit(room.code, trigger="room.control.seek")
        try:
            progress_ms = (data or {}).get("progress_ms")
            delta_ms = (data or {}).get("delta_ms")
            play = (data or {}).get("play")
            frame_step = (data or {}).get("frame_step")
            _now_ms = now_ms()
            _, error = room.seek_video(progress_ms, _now_ms, play)
            if error:
                rej(error)
                return
            db.session.refresh(room)
            current_entry = None
            if room.current_queue and room.current_queue.current_entry:
                db.session.refresh(room.current_queue.current_entry)
                current_entry = room.current_queue.current_entry
            res(
                "room.playback",
                {
                    "state": room.state,
                    "delta_ms": delta_ms,
                    "progress_ms": progress_ms,
                    "frame_step": frame_step,
                    "playing_since_ms": (
                        current_entry.playing_since_ms if current_entry else None
                    ),
                    "actor_user_id": user_id,
                },
            )
        except Exception:
            logging.exception("room.control.seek handler error")

    @socketio.on("room.control.skip")
    @require_room_by_code
    def _on_room_control_skip(room: Room, user_id: int, data: dict):
        try:
            res, rej = Room.emit(room.code, trigger="room.control.skip")
            next_entry, error = room.skip_to_next()
            if error:
                rej(error)
                return
            if room.state == "starting":
                cancel_starting_timeout(room.code)
            db.session.refresh(room)
            if next_entry:
                db.session.refresh(next_entry)
                res(
                    "room.playback",
                    {
                        "state": "starting",
                        "playing_since_ms": None,
                        "progress_ms": next_entry.progress_ms,
                        "current_entry": next_entry.to_dict(),
                        "actor_user_id": user_id,
                    },
                )
                schedule_starting_to_playing_timeout(room.code, delay_seconds=15)
            else:
                res(
                    "room.playback",
                    {
                        "state": room.state,
                        "playing_since_ms": None,
                        "progress_ms": 0,
                        "current_entry": None,
                        "actor_user_id": user_id,
                    },
                )
        except Exception:
            logging.exception("room.control.skip handler error")
