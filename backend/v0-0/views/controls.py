# Future annotations for consistency in typing
from __future__ import annotations

# Logging not required here; import typing for Optional
from typing import Optional

# Flask primitives for blueprints, JSON responses, and request parsing
from flask import Blueprint, jsonify, request

# Database and socket emitter
from ..extensions import db, socketio
# ORM models used by this module
from ..models import QueueEntry, RoomAudit
# Room services to locate rooms/queues and emit state/snapshots
from ..services.rooms import get_room_by_code, get_or_create_room_queue, emit_room_state, emit_queue_snapshot, emit_playback_update, room_socket_name
# Utility to get current time in milliseconds
from ..utils import now_ms

# Create the controls blueprint
controls_bp = Blueprint("controls", __name__)


# API: set the room state explicitly (idle | starting | playing | playing_ad)
@controls_bp.post("/api/room/state")
def api_room_state():
    try:
        # Decode JSON body safely
        data = request.get_json(force=True, silent=True) or {}
        code = (data or {}).get("code") or ""
        state = (data or {}).get("state") or ""
        if not code:
            return jsonify({"error": "missing_code"}), 400
        if state not in ("idle", "starting", "playing", "playing_ad"):
            return jsonify({"error": "invalid_state"}), 400
        # Resolve target room by code
        room = get_room_by_code(code)
        if not room:
            return jsonify({"error": "not_found"}), 404
        # Keep a copy of previous state for auditing
        prev_state = room.state
        # Respect ads
        ads_active = bool(
            db.session.query(RoomAudit.id)
            .filter(RoomAudit.room_id == room.id)
            .first()
        ) and False  # placeholder; state logic lives in socket handlers
        if state == "playing" and ads_active:
            room.state = "playing_ad"
        else:
            room.state = state
        # Persist change
        db.session.commit()
        # Notify clients of new state and snapshots
        emit_room_state(code)
        emit_queue_snapshot(code)
        emit_playback_update(code)
        return jsonify({"ok": True, "code": code, "state": room.state})
    except Exception:
        return jsonify({"error": "server_error"}), 500


# API: seek current video in the room and optionally play/resume
@controls_bp.post("/api/room/seek")
def api_room_seek():
    try:
        # Parse payload and coerce types
        data = request.get_json(force=True, silent=True) or {}
        code = (data or {}).get("code") or ""
        progress_ms = int((data or {}).get("progress_ms") or 0)
        play = bool((data or {}).get("play") or False)
        if not code:
            return jsonify({"error": "missing_code"}), 400
        room = get_room_by_code(code)
        if not room:
            return jsonify({"error": "not_found"}), 404
        # Identify the active queue for the room
        q = get_or_create_room_queue(room)
        # Find the currently playing (first queued) entry
        current = (
            db.session.query(QueueEntry)
            .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
            .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
            .first()
        )
        if not current:
            return jsonify({"error": "empty_queue"}), 400
        # Clamp progress to [0, duration]
        progress_ms = max(0, int(progress_ms))
        if int(current.duration or 0) > 0:
            progress_ms = min(progress_ms, int(current.duration or 0))
        # Do not change progress while room is starting or in ads
        if room.state not in ("playing_ad", "starting"):
            current.progress = int(progress_ms)
            current.playing_since = now_ms() if play else 0
        # Set room state to playing if asked to play
        if play:
            room.state = "playing"
        # Persist changes
        db.session.commit()
        # Notify websocket listeners and HTTP clients
        emit_room_state(code)
        emit_queue_snapshot(code)
        socketio.emit("room_seek", {"code": code, "progress_ms": int(progress_ms), "play": bool(play)}, room=room_socket_name(code))
        emit_playback_update(code)
        return jsonify({"ok": True, "code": code, "progress_ms": int(progress_ms), "play": bool(play)})
    except Exception:
        return jsonify({"error": "server_error"}), 500


# API: skip to next item in the room's queue
@controls_bp.post("/api/room/next")
def api_room_next():
    try:
        # Parse request body
        data = request.get_json(force=True, silent=True) or {}
        code = (data or {}).get("code") or ""
        room = get_room_by_code(code)
        if not room:
            return jsonify({"error": "not_found"}), 404
        # Resolve active queue and first queued entry
        q = get_or_create_room_queue(room)
        first: Optional[QueueEntry] = (
            db.session.query(QueueEntry)
            .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
            .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
            .first()
        )
        if not first:
            return jsonify({"error": "empty_queue"}), 400
        # Mark as skipped and clear timing
        first.status = "skipped"
        first.progress = 0
        first.playing_since = 0
        # Renumber the remaining queue positions to be consecutive
        entries = (
            db.session.query(QueueEntry)
            .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
            .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
            .all()
        )
        pos = 1
        for e in entries:
            if e.position != pos:
                e.position = pos
            pos += 1
        # Transition room to starting for the next item
        room.state = "starting"
        # Persist and notify listeners
        db.session.commit()
        emit_room_state(code)
        emit_queue_snapshot(code)
        emit_playback_update(code)
        return jsonify({"ok": True, "code": code})
    except Exception:
        return jsonify({"error": "server_error"}), 500


# No additional routes in this module


