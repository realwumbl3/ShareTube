# Future annotations for improved typing in this module
from __future__ import annotations

# Standard logging and timing utilities
import logging

import time
from typing import Optional

# JWT for token decoding and Flask/Socket.IO primitives
import jwt
from flask import request, current_app
from flask_socketio import emit, join_room, leave_room

# Shared database and socket objects
from ..extensions import db, socketio
# Models used by socket handlers
from ..models import User, Room, RoomMembership, Queue, QueueEntry
# Utility functions for YouTube and time, and robust commit helper
from ..utils import (
    extract_video_id,
    build_watch_url,
    fetch_video_meta,
    now_ms,
    commit_with_retry,
)

# Import room-level services and state holders
from ..services.rooms import (
    sid_to_user_id,
    sid_to_room_codes,
    get_user_for_sid,
    get_room_by_code,
    get_or_create_room_queue,
    get_or_create_user_queue,
    get_ads_active_user_ids,
    emit_room_state,
    emit_queue_snapshot,
    emit_playback_update,
    room_socket_name,
    emit_room_presence,
    emit_ad_status,
    audit_room_event,
    recalculate_queue_positions,
    generate_room_code,
    maybe_transition_room_to_playing,
)

# Optional background system stats thread launcher
from ..services.stats import start_system_stats_if_needed


# Connection lifecycle: when a client connects via Socket.IO
@socketio.on("connect")
def handle_connect():
    # Log a summary line for connects with basic client context
    logging.info("SOCK connect sid=%s ua=%s qs=%s", request.sid, request.headers.get("User-Agent"), request.query_string.decode(errors="ignore") if request.query_string else "")
    # Token is optional (dashboard clients may connect without auth)
    token = request.args.get("token", "")
    if not token:
        # Allow ops dashboard connections without a token; they only use ops_* events
        try:
            emit("hello", {"user": None, "ops": True})
        except Exception:
            pass
        # Initialize room set for this SID
        sid_to_room_codes.setdefault(request.sid, set())  # type: ignore
        # Start background stats emitter if enabled
        start_system_stats_if_needed()
        return
    try:
        # Decode JWT and look up or provision the user
        claims = jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])  # type: ignore
        user_id = int(claims.get("sub", 0))
        user: Optional[User] = db.session.get(User, user_id)
        if not user:
            # Auto-provision user for fresh databases using token claims
            try:
                name = str(claims.get("name") or f"user:{user_id}")
                picture = str(claims.get("picture") or "")
                user = User(id=user_id, name=name, picture=picture)
                db.session.add(user)
                commit_with_retry(db.session, retries=5, initial_delay=0.05, backoff=1.8)
                logging.info("SOCK connect created user id=%s", user_id)
            except Exception:
                logging.exception("SOCK connect user auto-provision failed sid=%s sub=%s", request.sid, user_id)
                try:
                    db.session.rollback()
                except Exception:
                    pass
                return False
        # Greet user with minimal profile
        emit(
            "hello",
            {"user": {"id": user.id, "name": user.name, "picture": user.picture}},
        )
        # Map this SID to the authenticated user id for future events
        sid_to_user_id[request.sid] = user.id  # type: ignore
        # Ensure we have a room set for this SID
        sid_to_room_codes.setdefault(request.sid, set())  # type: ignore
        # Start background stats emitter if enabled
        start_system_stats_if_needed()
    except Exception:
        logging.exception("SOCK connect failure sid=%s", request.sid)
        return False


# Default Socket.IO error handler to log exceptions uniformly
@socketio.on_error_default
def default_error_handler(e):
    try:
        logging.exception("SOCK error sid=%s path=%s", request.sid, request.path if hasattr(request, "path") else "")
        logging.exception(e)
    except Exception:
        pass


# Ping/Pong keepalive handler for simple latency checks
@socketio.on("ping")
def handle_ping(data):
    logging.debug("SOCK ping sid=%s", request.sid)
    emit("pong", {"ts": int(time.time() * 1000)})


# Seek the current playing item in a room and optionally start playback
@socketio.on("room_seek")
def handle_room_seek(data):
    # Resolve the authenticated user by SID
    user = get_user_for_sid(request.sid)
    if not user:
        return
    # Extract payload fields safely
    code = (data or {}).get("code") if isinstance(data, dict) else None
    logging.debug("SOCK room_seek sid=%s user=%s code=%s data=%s", request.sid, getattr(user, "id", None), code, {k: (data or {}).get(k) for k in ("progress_ms", "play")})
    try:
        progress_ms = int((data or {}).get("progress_ms") or 0)
    except Exception:
        progress_ms = 0
    play = bool((data or {}).get("play")) if isinstance(data, dict) else False
    if not code:
        return
    room = get_room_by_code(code)
    if not room:
        return
    q = get_or_create_room_queue(room)
    # Identify the current head-of-queue entry
    current = (
        db.session.query(QueueEntry)
        .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
        .first()
    )
    if not current:
        return
    # Dedupe: if incoming progress is effectively the same as current, ignore to avoid loops
    try:
        if abs(int(current.progress or 0) - int(progress_ms or 0)) <= 200:
            # Still broadcast minimal playback update to acks if needed
            emit_playback_update(code)
            return
    except Exception:
        pass
    # Clamp to sane bounds
    if progress_ms < 0:
        progress_ms = 0
    if int(current.duration or 0) > 0 and progress_ms > int(current.duration or 0):
        progress_ms = int(current.duration or 0)
    # Only advance progress when not in ads or starting
    if room.state not in ("playing_ad", "starting"):
        current.progress = int(progress_ms)
        current.playing_since = now_ms() if play else 0
    prev = room.state
    # If play requested, move to playing unless ads are active
    if play:
        ads_active = len(get_ads_active_user_ids(code)) > 0
        room.state = "playing_ad" if ads_active else "playing"
        if ads_active:
            room.prev_state_before_ads = str(prev)
    # Persist and broadcast
    db.session.commit()
    emit_room_state(code)
    emit_queue_snapshot(code)
    try:
        socketio.emit(
            "room_seek",
            {"code": code, "progress_ms": int(progress_ms), "play": bool(play)},
            room=room_socket_name(code),
        )
    except Exception:
        pass
    emit_playback_update(code)
    try:
        # Record seek in the room audit log
        audit_room_event(
            room,
            "seek",
            user_id=user.id,
            details={"to_ms": int(progress_ms), "play": bool(play)},
        )
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
        logging.exception("seek audit/commit failed")


# Add one or multiple items to either a room queue or a personal queue
@socketio.on("queue_add")
def handle_queue_add(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return emit("queue_add_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    item = (data or {}).get("item") if isinstance(data, dict) else None
    items = (data or {}).get("items") if isinstance(data, dict) else None
    logging.info("SOCK queue_add sid=%s user=%s code=%s items_count=%s", request.sid, getattr(user, "id", None), code, len(items) if isinstance(items, list) else (1 if item else 0))
    # Resolve target queue (room or personal)
    if code:
        room = get_room_by_code(code)
        if not room:
            return emit("queue_add_result", {"ok": False, "error": "not_found"})
        q = get_or_create_room_queue(room)
    else:
        q = get_or_create_user_queue(user.id)
    # Compute next position at the end of the current queue
    next_pos = (
        db.session.query(db.func.count(QueueEntry.id))
        .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
        .scalar()
        or 0
    ) + 1

    # Helper to validate and add a single item
    def _add_one(it, pos):
        raw = (it or {}).get("url") or (it or {}).get("id") or ""
        vid = extract_video_id(raw)
        if not vid:
            return None
        url = build_watch_url(vid)
        meta = fetch_video_meta(vid)
        e = QueueEntry(
            queue_id=q.id,
            added_by_id=user.id,
            url=url,
            title=meta.get("title") or "",
            thumbnail_url=meta.get("thumbnail_url") or "",
            position=pos,
            duration=int((meta.get("duration_ms") or 0)),
        )
        db.session.add(e)
        return e

    added = []
    if isinstance(items, list):
        for it in items:
            e = _add_one(it, next_pos)
            if e is not None:
                added.append(e)
                next_pos += 1
    else:
        e = _add_one(item, next_pos)
        if e is not None:
            added.append(e)
            next_pos += 1
    if added:
        if code and "room" in locals() and room:
            for e in added:
                audit_room_event(
                    room,
                    "queue_add",
                    user_id=user.id,
                    details={
                        "entry_id": int(e.id or 0),
                        "url": e.url,
                        "title": e.title or "",
                        "position": int(e.position or 0),
                    },
                )
        db.session.commit()
        if code:
            emit_queue_snapshot(code)
            emit_playback_update(code)
    emit("queue_add_result", {"ok": True, "added": len(added)})


# Remove a queue entry by id, validating scope (room vs personal queue)
@socketio.on("queue_remove")
def handle_queue_remove(data):
    # Ops dashboards may connect without a user; permit removal if they have no token
    user = sid_to_user_id.get(request.sid)
    ops_ok = False
    try:
        ops_ok = (user is None) and (not bool(request.args.get("token", "")))
    except Exception:
        ops_ok = False
    if not user and not ops_ok:
        return emit("queue_remove_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    entry_id = (data or {}).get("id") if isinstance(data, dict) else None
    if not entry_id:
        return emit("queue_remove_result", {"ok": False, "error": "invalid_payload"})
    # Find the entry by id first; then validate scope (room/user)
    e: Optional[QueueEntry] = QueueEntry.query.filter_by(id=int(entry_id)).first()
    if not e:
        return emit("queue_remove_result", {"ok": False, "error": "entry_not_found"})
    # Resolve queue and validate it belongs to the specified scope
    q: Optional[Queue] = db.session.get(Queue, int(e.queue_id)) if e and e.queue_id else None
    if code:
        room = get_room_by_code(code)
        if not room or not q or int(q.room_id or 0) != int(room.id):
            return emit("queue_remove_result", {"ok": False, "error": "wrong_room_or_queue"})
    else:
        # Personal queue path
        if not q or (not ops_ok and int(q.created_by_id or 0) != int(user)):
            return emit("queue_remove_result", {"ok": False, "error": "wrong_owner"})
    # Soft-delete the entry and renumber positions
    e.status = "deleted"
    recalculate_queue_positions(q)
    if code and "room" in locals() and room:
        audit_room_event(
            room,
            "queue_remove",
            user_id=(user if isinstance(user, int) else None),
            details={
                "entry_id": int(e.id),
                "url": e.url,
                "title": e.title or "",
            },
        )
    db.session.commit()
    if code:
        try:
            emit_queue_snapshot(code)
            emit_playback_update(code)
        except Exception:
            pass
    emit("queue_remove_result", {"ok": True})


# Skip the current head-of-queue item and move to the next
@socketio.on("vote_skip")
def handle_vote_skip(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return emit("vote_skip_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    if not code:
        return emit("vote_skip_result", {"ok": False, "error": "missing_code"})
    room = get_room_by_code(code)
    if not room:
        return emit("vote_skip_result", {"ok": False, "error": "not_found"})
    q = get_or_create_room_queue(room)
    first: Optional[QueueEntry] = (
        QueueEntry.query.filter(
            QueueEntry.queue_id == q.id, QueueEntry.status == "queued"
        )
        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
        .first()
    )
    if not first:
        return emit("vote_skip_result", {"ok": False, "error": "empty_queue"})
    # Mark as skipped and clear timing
    first.status = "skipped"
    try:
        first.progress = 0
        first.playing_since = 0
    except Exception:
        pass
    # Renumber remaining entries
    recalculate_queue_positions(q)
    try:
        # Audit the skip action
        audit_room_event(
            room,
            "queue_skip",
            user_id=user.id,
            details={
                "entry_id": int(first.id),
                "url": first.url,
                "title": first.title or "",
            },
        )
    except Exception:
        pass
    # Determine if there are more items
    next_exists = (
        db.session.query(db.func.count(QueueEntry.id))
        .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
        .scalar()
        or 0
    ) > 0
    if next_exists:
        # Move to starting to allow clients to ready-up
        room.state = "starting"
        audit_room_event(
            room,
            "state_change",
            user_id=user.id,
            details={"to": "starting", "reason": "vote_skip"},
        )
        db.session.commit()
        emit_room_state(code)
        emit_queue_snapshot(code)
        emit_playback_update(code)
    else:
        # No more items: go idle
        room.state = "idle"
        audit_room_event(
            room,
            "state_change",
            user_id=user.id,
            details={"to": "idle", "reason": "vote_skip_end"},
        )
        db.session.commit()
        emit_room_state(code)
        emit_queue_snapshot(code)
        emit_playback_update(code)
    emit("vote_skip_result", {"ok": True})


# Persist player status heartbeats and trigger state transitions
@socketio.on("player_status")
def handle_player_status(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return
    code = (data or {}).get("code") if isinstance(data, dict) else None
    state = (data or {}).get("state") if isinstance(data, dict) else None
    logging.debug("SOCK player_status sid=%s user=%s code=%s state=%s", request.sid, getattr(user, "id", None), code, state)
    is_ad = bool((data or {}).get("is_ad")) if isinstance(data, dict) else False
    try:
        current_ms = int((data or {}).get("current_ms") or 0)
    except Exception:
        current_ms = 0
    try:
        duration_ms = int((data or {}).get("duration_ms") or 0)
    except Exception:
        duration_ms = 0
    ts = int((data or {}).get("ts") or int(time.time() * 1000))
    if not code or state not in ("playing", "paused", "idle"):
        return
    room = get_room_by_code(code)
    prev_state = None
    prev_is_ad = None
    memb = None
    try:
        # Find membership record for this user in the room
        rm = get_room_by_code(code)
        if rm is not None:
            memb = RoomMembership.query.filter_by(
                room_id=rm.id, user_id=user.id
            ).first()
    except Exception:
        memb = None
    # Capture previous values for auditing
    if memb is not None:
        prev_state = memb.player_state or None
        prev_is_ad = bool(memb.player_is_ad) if memb.player_is_ad is not None else None
    try:
        # Create membership if missing and mark presence
        if memb is None and rm is not None:
            memb = RoomMembership(room_id=rm.id, user_id=user.id, active=True)
            db.session.add(memb)
        if memb is not None:
            # Update heartbeat fields
            memb.player_state = state
            memb.player_is_ad = bool(is_ad)
            memb.player_ts = int(ts)
            memb.last_seen = int(time.time())
            commit_with_retry(db.session, retries=6, initial_delay=0.05, backoff=1.8)
    except Exception:
        logging.exception("persist member player state failed")
    logged = False
    try:
        # Audit state changes and ad start/stop
        if room is not None and prev_state is not None and prev_state != state:
            audit_room_event(
                room,
                "player_state",
                user_id=int(user.id),
                details={"from": str(prev_state), "to": str(state)},
            )
            logged = True
        if (
            room is not None
            and prev_is_ad is not None
            and bool(prev_is_ad) != bool(is_ad)
        ):
            audit_room_event(
                room, "ad_start" if is_ad else "ad_end", user_id=int(user.id)
            )
            logged = True
        if logged:
            db.session.commit()
            # Notify room presence so dashboards get real-time player state changes
            try:
                emit_room_presence(code)
            except Exception:
                pass
    except Exception:
        logging.exception("player_status audit error")
        try:
            db.session.rollback()
        except Exception:
            pass
    try:
        # If paused (and not in ads/starting), update the persisted head-of-queue position
        if (
            room is not None
            and state == "paused"
            and not is_ad
            and room.state not in ("playing_ad", "starting")
            and (current_ms > 0 or duration_ms > 0)
        ):
            q = get_or_create_room_queue(room)
            current = (
                db.session.query(QueueEntry)
                .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
                .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
                .first()
            )
            if current:
                # Update duration if the client reported a longer duration
                if duration_ms > 0 and (
                    int(current.duration or 0) == 0
                    or duration_ms > int(current.duration or 0)
                ):
                    current.duration = int(duration_ms)
                # Avoid regressing progress to 0 or a much earlier time due to new clients joining
                try:
                    old_ms = int(current.progress or 0)
                except Exception:
                    old_ms = 0
                # Only accept meaningful positions (>1s) and reject large backward jumps (>1.5s)
                if current_ms >= 1000 and (int(current_ms) + 1500 >= old_ms):
                    current.progress = int(current_ms)
                    current.playing_since = 0
                commit_with_retry(db.session, retries=5, initial_delay=0.05, backoff=1.8)
                emit_playback_update(code)
    except Exception:
        logging.exception("player_status timing persist error")
        try:
            db.session.rollback()
        except Exception:
            pass
    # After updating, check whether the room can transition to playing state
    maybe_transition_room_to_playing(code)


# Mark ad start and enforce room playback state accordingly
@socketio.on("room_ad_start")
def handle_room_ad_start(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return
    code = (data or {}).get("code") if isinstance(data, dict) else None
    if not code:
        return
    room = get_room_by_code(code)
    if not room:
        return
    try:
        # Persist the member ad flag
        memb = None
        if room:
            memb = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user.id
            ).first()
            if memb:
                memb.player_is_ad = True
                memb.player_ts = now_ms()
                db.session.commit()
    except Exception:
        logging.exception("room_ad_start persist error")
        try:
            db.session.rollback()
        except Exception:
            pass
    try:
        # Transition room to playing_ad if it was playing/starting
        prev_state = room.state
        if prev_state in ("playing", "starting") and prev_state != "playing_ad":
            room.prev_state_before_ads = str(prev_state)
            room.state = "playing_ad"
            commit_with_retry(db.session, retries=5, initial_delay=0.05, backoff=1.8)
            emit_room_state(code)
            try:
                audit_room_event(
                    room,
                    "state_change",
                    user_id=user.id,
                    details={
                        "from": str(prev_state),
                        "to": "playing_ad",
                        "reason": "ad_start",
                    },
                )
                db.session.commit()
            except Exception:
                pass
    except Exception:
        logging.exception("error transitioning room to playing_ad")
        try:
            db.session.rollback()
        except Exception:
            pass
    # Notify all clients to pause due to ad start
    socketio.emit(
        "room_ad_pause",
        {"code": code, "by_user_id": int(user.id)},
        room=room_socket_name(code),
    )
    audit_room_event(room, "ad_start", user_id=user.id)
    emit_ad_status(code)


# Mark ad end and restore room playback state as appropriate
@socketio.on("room_ad_end")
def handle_room_ad_end(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return
    code = (data or {}).get("code") if isinstance(data, dict) else None
    if not code:
        return
    room = get_room_by_code(code)
    if not room:
        return
    try:
        # Clear member ad flag
        if room:
            memb = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user.id
            ).first()
        else:
            memb = None
        if memb and memb.player_is_ad:
            memb.player_is_ad = False
            memb.player_ts = now_ms()
            db.session.commit()
        # If no more ads are active, restore room state
        active = get_ads_active_user_ids(code)
        if not active:
            prev_before_ads = room.prev_state_before_ads if room else None
            target_state = None
            if prev_before_ads in ("playing", "starting"):
                target_state = prev_before_ads
            elif room.state == "playing_ad":
                # If ads end but the room was paused during ads, do not auto-resume
                # Default to previous or idle; only auto-play if previous was playing
                target_state = "playing" if prev_before_ads == "playing" else "idle"
            if target_state and room.state != target_state:
                prev_state = room.state
                room.state = target_state
                room.prev_state_before_ads = ""
                # If transitioning to actual playing, set playing_since baseline without changing progress
                try:
                    if target_state == "playing":
                        q = get_or_create_room_queue(room)
                        current = (
                            db.session.query(QueueEntry)
                            .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
                            .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
                            .first()
                        )
                        if current:
                            current.playing_since = now_ms()
                except Exception:
                    pass
                db.session.commit()
                emit_room_state(code)
                # After ads clear, also emit playback snapshot so clients resync position
                try:
                    emit_playback_update(code)
                except Exception:
                    pass
                try:
                    audit_room_event(
                        room,
                        "state_change",
                        user_id=user.id,
                        details={
                            "from": str(prev_state),
                            "to": str(target_state),
                            "reason": "ads_cleared",
                        },
                    )
                    db.session.commit()
                except Exception:
                    pass
            # Inform clients ads are over and playback may resume
            socketio.emit("room_ad_resume", {"code": code}, room=room_socket_name(code))
            audit_room_event(room, "ad_end", user_id=user.id)
    except Exception:
        logging.exception("room_ad_end persist error")
        try:
            db.session.rollback()
        except Exception:
            pass
    emit_ad_status(code)


# Admin/control API via sockets to set room state directly
@socketio.on("room_state_set")
def handle_room_state_set(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return emit("room_state_set_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    state = (data or {}).get("state") if isinstance(data, dict) else None
    if not code or state not in ("idle", "starting", "playing", "playing_ad"):
        return emit("room_state_set_result", {"ok": False, "error": "invalid_payload"})
    room = get_room_by_code(code)
    if not room:
        return emit("room_state_set_result", {"ok": False, "error": "not_found"})
    # If ads are active and target is playing, use playing_ad instead
    ads_active = len(get_ads_active_user_ids(code)) > 0
    prev = room.state
    if state == "playing" and ads_active:
        room.prev_state_before_ads = str(prev)
        room.state = "playing_ad"
    else:
        room.state = state
    # Adjust head-of-queue timing depending on target state
    try:
        if state == "playing":
            q = get_or_create_room_queue(room)
            current = (
                db.session.query(QueueEntry)
                .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
                .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
                .first()
            )
            if current:
                current.playing_since = now_ms()
        elif state in ("idle", "starting"):
            q = get_or_create_room_queue(room)
            current = (
                db.session.query(QueueEntry)
                .filter(QueueEntry.queue_id == q.id, QueueEntry.status == "queued")
                .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
                .first()
            )
            if current:
                # Persist current progress when pausing via controls
                if state == "idle":
                    # If client didn't send an explicit progress, keep existing progress as-is
                    # but ensure we mark not playing forward in time
                    current.playing_since = 0
                else:
                    current.playing_since = 0
    except Exception:
        pass
    db.session.commit()
    # Notify clients and audit
    emit_room_state(code)
    emit_playback_update(code)
    if prev != state:
        audit_room_event(
            room, "state_change", user_id=user.id, details={"from": prev, "to": state}
        )
    emit("room_state_set_result", {"ok": True})


# Create a new room and attach the creator to it
@socketio.on("room_create")
def handle_room_create(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return emit("room_create_result", {"ok": False, "error": "unauthorized"})
    # Generate a unique code and create room record
    code = generate_room_code()
    room = Room(code=code, created_by_id=user.id)
    db.session.add(room)
    db.session.commit()
    # Attach latest personal queue to the room if one exists
    q = (
        Queue.query.filter_by(room_id=None, created_by_id=user.id)
        .order_by(Queue.created_at.desc())
        .first()
    )
    if q:
        q.room_id = room.id
        db.session.commit()
    else:
        q = Queue(room_id=room.id, created_by_id=user.id)
        db.session.add(q)
        db.session.commit()
    # Join the Socket.IO room and record presence
    join_room(room_socket_name(code))
    sid_to_room_codes.setdefault(request.sid, set()).add(code)  # type: ignore
    memb = RoomMembership.query.filter_by(room_id=room.id, user_id=user.id).first()
    if not memb:
        memb = RoomMembership(room_id=room.id, user_id=user.id, active=True)
        db.session.add(memb)
    else:
        memb.active = True
        memb.last_seen = int(time.time())
    db.session.commit()
    emit_room_presence(code)
    emit("room_create_result", {"ok": True, "code": code})
    # Send initial snapshots to only the creator's connection
    emit_queue_snapshot(code, to_sid=request.sid)  # type: ignore
    try:
        audit_room_event(room, "room_create", user_id=user.id)
        db.session.commit()
    except Exception:
        pass


# Join an existing room by code and mark the user active
@socketio.on("room_join")
def handle_room_join(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return emit("room_join_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    if not code:
        return emit("room_join_result", {"ok": False, "error": "missing_code"})
    room: Optional[Room] = Room.query.filter_by(code=code).first()
    if not room:
        return emit("room_join_result", {"ok": False, "error": "not_found"})
    # Attach socket to the room
    join_room(room_socket_name(code))
    sid_to_room_codes.setdefault(request.sid, set()).add(code)  # type: ignore
    # Upsert membership and mark active
    memb = RoomMembership.query.filter_by(room_id=room.id, user_id=user.id).first()
    if not memb:
        memb = RoomMembership(room_id=room.id, user_id=user.id, active=True)
        db.session.add(memb)
    else:
        memb.active = True
        memb.last_seen = int(time.time())
    db.session.commit()
    emit_room_presence(code)
    emit("room_join_result", {"ok": True, "code": code})
    try:
        audit_room_event(room, "room_join", user_id=user.id)
        db.session.commit()
    except Exception:
        pass
    # Send state and snapshots only to the joining client
    emit_room_state(code, to_sid=request.sid)  # type: ignore
    emit_queue_snapshot(code, to_sid=request.sid)  # type: ignore
    emit_ad_status(code, to_sid=request.sid)
    emit_playback_update(code, to_sid=request.sid)


# Leave a room and mark the user inactive in that room
@socketio.on("room_leave")
def handle_room_leave(data):
    user = get_user_for_sid(request.sid)
    if not user:
        return
    code = (data or {}).get("code") if isinstance(data, dict) else None
    if not code:
        return
    room: Optional[Room] = Room.query.filter_by(code=code).first()
    if not room:
        return
    # Detach from the Socket.IO room and update in-memory set
    leave_room(room_socket_name(code))
    srooms = sid_to_room_codes.get(request.sid)  # type: ignore
    if srooms and code in srooms:
        srooms.remove(code)
    # Mark membership inactive and update last_seen
    memb = RoomMembership.query.filter_by(room_id=room.id, user_id=user.id).first()
    if memb:
        memb.active = False
        memb.last_seen = int(time.time())
        db.session.commit()
    emit_room_presence(code)
    try:
        audit_room_event(room, "room_leave", user_id=user.id)
        db.session.commit()
    except Exception:
        pass


# On disconnect, mark user inactive in all rooms they were in and broadcast presence updates
@socketio.on("disconnect")
def handle_disconnect(*args, **kwargs):
    try:
        reason = None
        if args:
            reason = args[0]
        elif "reason" in kwargs:
            reason = kwargs.get("reason")
        logging.info("SOCK disconnect sid=%s reason=%s", request.sid, reason)
    except Exception:
        logging.info("SOCK disconnect sid=%s", request.sid)
    sid = request.sid  # type: ignore
    user_id = sid_to_user_id.pop(sid, None)
    codes = sid_to_room_codes.pop(sid, set())
    if user_id:
        # For each room, mark membership inactive and update presence
        for code in list(codes):
            room: Optional[Room] = Room.query.filter_by(code=code).first()
            if not room:
                continue
            memb = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user_id
            ).first()
            if memb:
                memb.active = False
                memb.last_seen = int(time.time())
        db.session.commit()
        for code in list(codes):
            emit_room_presence(code)


# Ops dashboard: list rooms with active members for sidebar
@socketio.on("ops_rooms_list")
def handle_ops_rooms_list(data):
    """Emit a lightweight list of active rooms for ops dashboard sidebar."""
    try:
        # Rooms with at least one active member
        rows = (
            db.session.query(
                Room,
                db.func.count(RoomMembership.id).label("active_count"),
            )
            .join(RoomMembership, RoomMembership.room_id == Room.id)
            .filter(RoomMembership.active == True)
            .group_by(Room.id)
            .order_by(Room.created_at.desc())
            .limit(200)
            .all()
        )
        rooms = []
        for r, c in rows:
            rooms.append(
                {
                    "code": r.code,
                    "state": r.state,
                    "active_count": int(c or 0),
                    "created_at": int(r.created_at or 0),
                }
            )
        emit("ops_rooms_list", {"rooms": rooms})
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
        try:
            emit("ops_rooms_list", {"rooms": []})
        except Exception:
            pass


# Ops dashboard: subscribe to a room feed without affecting membership
@socketio.on("ops_room_subscribe")
def handle_ops_room_subscribe(data):
    """Allow dashboard to subscribe to a room's updates without affecting membership."""
    try:
        code = (data or {}).get("code") if isinstance(data, dict) else None
        if not code:
            return
        room = get_room_by_code(code)
        if not room:
            return
        # Join the socket room so subsequent broadcasts are received
        join_room(room_socket_name(code))
        # Send current snapshots directly to this SID
        emit_room_state(code, to_sid=request.sid)  # type: ignore
        emit_queue_snapshot(code, to_sid=request.sid)  # type: ignore
        emit_ad_status(code, to_sid=request.sid)  # type: ignore
        emit_playback_update(code, to_sid=request.sid)  # type: ignore
        # Also broadcast presence so the subscriber gets a presence payload immediately as part of room feed
        emit_room_presence(code)
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
