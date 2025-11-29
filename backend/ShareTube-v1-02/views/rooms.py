from __future__ import annotations

import time
import logging
from typing import Optional    

from flask import Blueprint, jsonify, request
from flask_socketio import join_room, leave_room

from ..utils import now_ms
from ..sockets import (
    emit_function_after_delay,
    get_user_id_from_socket,
    track_socket_connection,
    remove_socket_connection,
    emit_to_user_sockets,
    check_user_other_connections,
    get_user_socket_connections,
    set_user_verification_received,
    clear_user_verification,
    has_user_been_verified
)

from ..app import get_user_id_from_auth_header
from ..extensions import db, socketio
from ..models import Room, RoomMembership, User
from .room_timeouts import cancel_starting_timeout

from .decorators import require_room_by_code, require_room
from ..sockets import is_mobile_remote_socket, get_mobile_remote_room_code

rooms_bp = Blueprint("rooms", __name__, url_prefix="/api")


def emit_presence(room: Room) -> None:
    rows = (
        db.session.query(User, RoomMembership.ready)
        .join(RoomMembership, RoomMembership.user_id == User.id)
        .filter(RoomMembership.room_id == room.id, User.active.is_(True))
        .all()
    )
    payload = [
        {
            "id": user.id,
            "name": user.name,
            "picture": user.picture,
            "ready": bool(ready),
        }
        for user, ready in rows
    ]
    socketio.emit("presence.update", payload, room=f"room:{room.code}")


@rooms_bp.post("/room.create")
def room_create():
    user_id = get_user_id_from_auth_header()
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401
    # Ensure user exists
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "user_not_found"}), 404
    # Create room using model method
    room = Room.create(owner_id=user_id)
    db.session.commit()

    return jsonify({"code": room.code})


def register_socket_handlers() -> None:
    @socketio.on("room.join")
    def _on_join_room(data: dict):
        try:
            logging.debug(f"room.join: data={data}, is_mobile_remote={is_mobile_remote_socket()}")

            # Handle mobile remote connections differently
            if is_mobile_remote_socket():
                logging.debug("room.join: handling as mobile remote")
                room_code = get_mobile_remote_room_code()
                logging.debug(f"room.join: mobile remote room_code={room_code}")
                if not room_code:
                    socketio.emit("room.error", {"error": "Invalid mobile remote token"})
                    return

                room = Room.query.filter_by(code=room_code).first()
                if not room:
                    socketio.emit("room.error", {"error": "Room not found"})
                    return

                # For mobile remotes, just join the Socket.IO room without creating membership
                join_room(f"room:{room.code}")
                socketio.emit(
                    "room.joined",
                    {
                        "ok": True,
                        "code": room.code,
                        "snapshot": room.to_dict(),
                        "serverNowMs": now_ms(),
                    },
                    room=f"room:{room.code}",
                )
                return

            # Normal user room join
            logging.debug("room.join: handling as normal user")
            user_id = get_user_id_from_socket()
            logging.debug(f"room.join: user_id={user_id}")
            if not user_id:
                socketio.emit("room.error", {"error": "Authentication required"})
                return

            code = (data or {}).get("code")
            if not code:
                socketio.emit("room.error", {"error": "Room code required"})
                return

            room = Room.query.filter_by(code=code).first()
            if not room:
                socketio.emit("room.error", {"error": "Room not found"})
                return

            # Track socket connection for this user
            track_socket_connection(user_id, request.sid)

            # Clear any stale verification status from previous disconnects
            clear_user_verification(user_id)

            # Join room using model method
            RoomMembership.join_room(room, user_id)

            db.session.commit()

            # Join the Socket.IO room and schedule a delayed presence update
            join_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
            socketio.emit(
                "user.join.result",
                {
                    "ok": True,
                    "code": room.code,
                    "snapshot": room.to_dict(),
                    "serverNowMs": now_ms(),
                },
                room=f"room:{room.code}",
            )
        except Exception:
            logging.exception("room.join handler error")
            socketio.emit("room.error", {"error": "Failed to join room"})

    @socketio.on("room.leave")
    @require_room_by_code
    def _on_leave_room(room: Room, user_id: int, data: dict):
        try:
            logging.info("room.leave: code=%s user_id=%s", room.code, user_id)
            
            # Remove this socket connection from tracking immediately
            remove_socket_connection(user_id, request.sid)
            
            # Check if user has other active connections
            has_other_connections = check_user_other_connections(user_id, request.sid)
            if has_other_connections:
                logging.info("room.leave: user %s has other active connections, keeping membership", user_id)
                # Don't remove membership, just leave the socket room
                leave_room(f"room:{room.code}")
                return

            membership = RoomMembership.query.filter_by(
                room_id=room.id, user_id=user_id
            ).first()
            if not membership:
                logging.info("room.leave: no membership found for user %s in room %s", user_id, room.code)
                return
            membership.leave()
            db.session.commit()
            db.session.refresh(room)
            leave_room(f"room:{room.code}")
            emit_function_after_delay(emit_presence, room, 0.1)
        except Exception:
            logging.exception("room.leave handler error")

    @socketio.on("user.ready")
    @require_room
    def _on_user_ready(room: Room, user_id: int, data: dict):
        res, _ = Room.emit(room.code, trigger="user.ready")
        try:

            logging.info(
                "user.ready received: room=%s user_id=%s incoming_ready=%s room.state=%s",
                room.code,
                user_id,
                bool((data or {}).get("ready")),
                room.state,
            )
            membership = (
                db.session.query(RoomMembership)
                .join(User, RoomMembership.user_id == User.id)
                .filter(RoomMembership.room_id == room.id, RoomMembership.user_id == user_id)
                .filter(User.active.is_(True))
                .first()
            )
            if not membership:
                return

            ready = bool((data or {}).get("ready"))

            previous_ready = bool(membership.ready)
            membership.set_ready(ready)
            db.session.flush()

            socketio.emit(
                "user.ready.update",
                {"user_id": user_id, "ready": ready},
                room=f"room:{room.code}",
            )

            midroll_payload = None

            def _is_operator(user_id_to_check: int) -> bool:
                if room.owner_id and room.owner_id == user_id_to_check:
                    return True
                return any(operator.user_id == user_id_to_check for operator in room.operators)

            def _should_consider_midroll(mode: str) -> bool:
                if mode == "pause_all":
                    return room.state in ("playing", "starting")
                if mode == "operators_only":
                    return room.state == "playing" and _is_operator(user_id)
                if mode == "starting_only":
                    return room.state == "starting"
                return False

            should_eval_midroll = (
                previous_ready
                and not ready
                and room.state != "midroll"
                and room.current_queue
                and room.current_queue.current_entry
            )

            if should_eval_midroll and _should_consider_midroll(room.ad_sync_mode):
                paused_progress, pause_error = room.pause_playback(now_ms())
                if pause_error:
                    logging.warning(
                        "user.ready: failed to pause playback for midroll (room=%s, user_id=%s, error=%s)",
                        room.code,
                        user_id,
                        pause_error,
                    )
                else:
                    current_entry = room.current_queue.current_entry
                    if current_entry:
                        room.state = "midroll"
                        room.reset_ready_flags()
                        emit_function_after_delay(emit_presence, room, 0.1)
                        progress_ms = (
                            paused_progress
                            if paused_progress is not None
                            else current_entry.progress_ms or 0
                        )
                        midroll_payload = {
                            "state": "midroll",
                            "playing_since_ms": None,
                            "progress_ms": progress_ms,
                            "current_entry": current_entry.to_dict(),
                            "actor_user_id": user_id,
                        }

            current_entry = (
                room.current_queue.current_entry
                if room.current_queue and room.current_queue.current_entry
                else None
            )

            all_users_ready = room.are_all_users_ready()
            logging.info(
                "user.ready: eval transition -> all_users_ready=%s room.state=%s this_user_ready=%s current_entry_id=%s",
                all_users_ready,
                room.state,
                ready,
                getattr(current_entry, "id", None),
            )

            should_transition = (
                ready
                and room.state in ("starting", "midroll")
                and current_entry is not None
                and all_users_ready
            )
            logging.info("user.ready: should_transition=%s", should_transition)
            playback_payload = None
            if should_transition:
                cancel_starting_timeout(room.code)
                _now_ms = now_ms()
                room.state = "playing"
                current_entry.status = "playing"
                current_entry.playing_since_ms = _now_ms
                current_entry.paused_at = None
                playback_payload = {
                    "state": "playing",
                    "playing_since_ms": _now_ms,
                    "progress_ms": current_entry.progress_ms if current_entry else 0,
                    "current_entry": current_entry.to_dict(),
                    "actor_user_id": user_id,
                }

            db.session.commit()

            if midroll_payload:
                res("room.playback", midroll_payload)
            elif playback_payload:
                res("room.playback", playback_payload)
        except Exception:
            logging.exception("user.ready handler error")

    @socketio.on("client.verification_response")
    def _on_client_verification_response(data: Optional[dict]):
        """Handle client verification responses to prevent user removal from room."""
        try:
            logging.info("client.verification_response: received payload=%s", data)
            user_id = get_user_id_from_socket()
            logging.info("client.verification_response: extracted user_id=%s", user_id)
            if not user_id:
                logging.warning("client.verification_response: no user_id found")
                return

            logging.info("client.verification_response: VERIFICATION RESPONSE from user %s for disconnected socket %s",
                       user_id, data.get("disconnected_socket_id") if data else "unknown")
            # Mark user as verified to prevent delayed removal from room
            set_user_verification_received(user_id)
            logging.info("client.verification_response: verification flag set for user %s", user_id)
        except Exception:
            logging.exception("client.verification_response handler error")

    @socketio.on("client.pong")
    def _on_client_pong(data: Optional[dict]):
        """Handle client heartbeat events to update user last_seen timestamp for health checks."""
        try:
            logging.debug("client.pong: received pong payload=%s", data)
            user_id = get_user_id_from_socket()
            if not user_id:
                return

            # Update last_seen timestamp for the user
            user = db.session.get(User, user_id)
            if user:
                user.last_seen = int(time.time())
                db.session.commit()
                logging.debug("client.pong: updated last_seen for user %s", user_id)
        except Exception:
            logging.exception("client.pong handler error")

    @socketio.on("disconnect")
    def _on_disconnect():
        """Handle client disconnection and check for other active connections."""
        try:
            logging.debug("disconnect: client disconnected, sid=%s", request.sid)
            user_id = get_user_id_from_socket()

            if not user_id:
                logging.debug("disconnect: no user_id found for disconnected socket")
                return

            # Remove this socket connection from tracking
            remove_socket_connection(user_id, request.sid)

            # Check if user has other active connections
            has_other_connections = check_user_other_connections(user_id, request.sid)

            if has_other_connections:
                logging.info("disconnect: user %s has other active connections (%d total), sending verification",
                           user_id, len(get_user_socket_connections(user_id)))
                # Clear any previous verification status and send verification message to other connections
                clear_user_verification(user_id)
                emit_to_user_sockets(user_id, "client.verify_connection", {
                    "disconnected_socket_id": request.sid,
                    "timestamp": int(time.time())
                })
                logging.info("disconnect: verification message sent to user %s, scheduling delayed check", user_id)
                # Schedule delayed removal - if other connections respond with verification,
                # they will prevent this removal
                emit_function_after_delay(
                    lambda room=None: _handle_user_disconnect_delayed(user_id),
                    None,  # No room needed for this
                    delay_seconds=5.0  # Wait 5 seconds for verification responses
                )
            else:
                logging.info("disconnect: user %s has no other connections, removing immediately", user_id)
                # No other connections, proceed with normal room leave logic immediately
                _handle_user_disconnect(user_id)

        except Exception:
            logging.exception("disconnect handler error")

    def _handle_user_disconnect(user_id: int) -> None:
        """Handle user disconnection when no other connections exist."""
        try:
            # Find the user's active room membership
            membership = RoomMembership.query.filter_by(user_id=user_id).first()
            if not membership:
                logging.debug("_handle_user_disconnect: no active membership for user %s", user_id)
                return

            room = membership.room
            logging.info("_handle_user_disconnect: removing user %s from room %s", user_id, room.code)

            # Remove membership
            membership.leave()
            db.session.commit()

            # Update presence
            emit_function_after_delay(emit_presence, room, 0.1)

        except Exception:
            logging.exception("_handle_user_disconnect error")

    def _handle_user_disconnect_delayed(user_id: int) -> None:
        """Handle delayed user disconnection after verification period."""
        try:
            logging.debug("_handle_user_disconnect_delayed: checking user %s after verification delay", user_id)

            # Check if user has been verified (other connections responded)
            is_verified = has_user_been_verified(user_id)
            logging.info("_handle_user_disconnect_delayed: user %s verification check: %s", user_id, is_verified)
            if is_verified:
                logging.info("_handle_user_disconnect_delayed: user %s was verified by other connections, keeping in room",
                           user_id)
                return

            # Double-check that user still has no active connections
            # (in case new connections were established during the delay)
            active_connections = get_user_socket_connections(user_id)
            if active_connections:
                logging.info("_handle_user_disconnect_delayed: user %s now has %d active connections, skipping removal",
                           user_id, len(active_connections))
                return

            # Find the user's active room membership
            membership = RoomMembership.query.filter_by(user_id=user_id).first()
            if not membership:
                logging.debug("_handle_user_disconnect_delayed: no active membership for user %s", user_id)
                return

            room = membership.room
            logging.info("_handle_user_disconnect_delayed: removing user %s from room %s after verification timeout",
                        user_id, room.code)

            # Remove membership
            membership.leave()
            db.session.commit()

            # Update presence
            emit_function_after_delay(emit_presence, room, 0.1)

        except Exception:
            logging.exception("_handle_user_disconnect_delayed error")
