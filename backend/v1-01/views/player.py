import logging
from ..extensions import db, socketio
from .room_timeouts import schedule_starting_to_playing_timeout, cancel_starting_timeout
from .decorators import require_room_by_code
import time


def register_socket_handlers():
    @socketio.on("room.control.pause")
    @require_room_by_code
    def _on_room_control_pause(room, user_id, data):
        try:
            now_ms = int(time.time() * 1000)
            # Cancel any pending starting timeout if transitioning from starting
            if room.state == "starting":
                cancel_starting_timeout(room.code)
            paused_progress_ms = room.pause_playback(now_ms)
            if paused_progress_ms is None:
                return
            db.session.commit()
            db.session.refresh(room)
            socketio.emit(
                "room.playback",
                {
                    "trigger": "room.control.pause",
                    "server_now_ms": now_ms,
                    "code": room.code,
                    "state": "paused",
                    "playing_since_ms": None,
                    "progress_ms": paused_progress_ms,
                    "actor_user_id": user_id,
                },
            )
        except Exception:
            logging.exception("room.control.pause handler error")

    @socketio.on("room.control.play")
    @require_room_by_code
    def _on_room_control_play(room, user_id, data):
        try:
            now_ms = int(time.time() * 1000)

            # Cancel timeout if transitioning from starting state
            if room.state == "starting":
                cancel_starting_timeout(room.code)

            # Start playback (handles all cases: starting->playing, new entry, resume)
            result = room.start_playback(now_ms)
            if not result:
                return

            db.session.commit()
            db.session.refresh(room)

            # Build payload - use result entry when starting, otherwise get current entry
            if result["state"] == "starting":
                entry_dict = result["entry"]
                progress_ms = entry_dict.get("progress_ms", 0)
                schedule_starting_to_playing_timeout(room.code, delay_seconds=15)
            else:
                db.session.refresh(room.current_queue.current_entry)
                entry_dict = None
                progress_ms = room.current_queue.current_entry.progress_ms

            socketio.emit(
                "room.playback",
                {
                    "trigger": "room.control.play",
                    "code": room.code,
                    "state": result["state"],
                    "playing_since_ms": (
                        now_ms if result["state"] == "playing" else None
                    ),
                    "progress_ms": progress_ms,
                    "current_entry": entry_dict,
                    "actor_user_id": user_id,
                },
            )
        except Exception:
            logging.exception("room.control.play handler error")

    @socketio.on("room.control.restartvideo")
    @require_room_by_code
    def _on_room_control_restartvideo(room, user_id, data):
        try:
            now_ms = int(time.time() * 1000)
            room.restart_video(now_ms)
            db.session.commit()
            db.session.refresh(room)
            socketio.emit(
                "room.playback",
                {
                    "trigger": "room.control.restartvideo",
                    "code": room.code,
                    "state": "playing",
                    "progress_ms": 0,
                    "playing_since_ms": now_ms,
                    "paused_at": None,
                    "actor_user_id": user_id,
                },
            )
        except Exception:
            logging.exception("room.control.restartvideo handler error")

    @socketio.on("room.control.seek")
    @require_room_by_code
    def _on_room_control_seek(room, user_id, data):
        try:
            progress_ms = (data or {}).get("progress_ms")
            delta_ms = (data or {}).get("delta_ms")
            play = (data or {}).get("play")
            frame_step = (data or {}).get("frame_step")
            now_ms = int(time.time() * 1000)
            room.seek_video(progress_ms, now_ms, play)
            db.session.commit()
            db.session.refresh(room)
            current_entry = None
            if room.current_queue and room.current_queue.current_entry:
                db.session.refresh(room.current_queue.current_entry)
                current_entry = room.current_queue.current_entry
            socketio.emit(
                "room.playback",
                {
                    "trigger": "room.control.seek",
                    "code": room.code,
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
    def _on_room_control_skip(room, user_id, data):
        try:
            if not room.current_queue:
                return

            if not room.current_queue.current_entry:
                return

            # Cancel any pending starting timeout
            if room.state == "starting":
                cancel_starting_timeout(room.code)

            # Skip to next using model method
            next_entry = room.skip_to_next()
            if not next_entry:
                return

            db.session.commit()
            db.session.refresh(room)
            db.session.refresh(room.current_queue)
            db.session.refresh(next_entry)

            socketio.emit(
                "room.playback",
                {
                    "trigger": "room.control.skip",
                    "code": room.code,
                    "state": "starting",
                    "playing_since_ms": None,
                    "progress_ms": next_entry.progress_ms,
                    "current_entry": next_entry.to_dict(),
                    "actor_user_id": user_id,
                },
            )

            # Emit queue update
            queue_dict = room.current_queue.to_dict()
            socketio.emit("queue.update", queue_dict, room=f"room:{room.code}")

            # Schedule timeout to transition from starting to playing
            schedule_starting_to_playing_timeout(room.code, delay_seconds=15)
        except Exception:
            logging.exception("room.control.skip handler error")
