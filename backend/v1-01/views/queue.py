from __future__ import annotations

import time
from typing import Optional

import jwt
from flask import current_app, request

from ..extensions import db, socketio
from ..models import Queue as QueueModel, QueueEntry, Room, RoomMembership
from ..utils import (
    build_watch_url,
    commit_with_retry,
    extract_video_id,
    fetch_video_meta,
)


def _get_user_id_from_socket() -> Optional[int]:
    token = request.args.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        sub = payload.get("sub")
        return int(sub) if sub is not None else None
    except Exception:
        current_app.logger.exception("socket auth token decode failed (queue)")
        return None


def _get_active_room_for_user(user_id: int) -> Optional[Room]:
    membership = (
        db.session.query(RoomMembership)
        .filter_by(user_id=user_id, active=True)
        .order_by(RoomMembership.last_seen.desc())
        .first()
    )
    if not membership:
        return None
    room = db.session.get(Room, membership.room_id)
    return room


def _get_or_create_room_queue(room: Room, created_by_id: Optional[int]) -> QueueModel:
    q = db.session.query(QueueModel).filter_by(room_id=room.id).first()
    if q:
        return q
    q = QueueModel(
        room_id=room.id, created_by_id=created_by_id, created_at=int(time.time())
    )
    db.session.add(q)
    commit_with_retry(db.session)
    return q


def _serialize_entry(e: QueueEntry) -> dict:
    return {
        "id": e.id,
        "url": e.url,
        "title": e.title or "",
        "thumbnail_url": e.thumbnail_url or "",
        "position": e.position or 0,
        "status": e.status or "queued",
    }


def emit_queue_update_for_room(room: Room) -> None:
    q = db.session.query(QueueModel).filter_by(room_id=room.id).first()
    entries = []
    if q:
        entries = (
            db.session.query(QueueEntry)
            .filter_by(queue_id=q.id)
            .filter_by(status="queued")
            .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
            .all()
        )
    payload = [_serialize_entry(e) for e in entries]
    socketio.emit("queue_update", payload, room=f"room:{room.code}")


@socketio.on("queue.add")
def _on_enqueue_url(data):
    try:
        user_id = _get_user_id_from_socket()
        if not user_id:
            return
        url = ((data or {}).get("url") or "").strip()
        if not url:
            return
        room = _get_active_room_for_user(user_id)
        if not room:
            return

        # Normalize URL and fetch lightweight metadata
        vid = extract_video_id(url)

        if not vid:
            current_app.logger.warning(
                "queue.add: no video id found in url (url=%s)", url
            )
            return

        canonical_url = build_watch_url(vid) if vid else url
        meta = fetch_video_meta(vid)
        if not meta:
            current_app.logger.warning(
                "queue.add: no metadata found for video (url=%s, video_id=%s)",
                url,
                vid,
            )
            return

        # Ensure queue exists for room
        q = _get_or_create_room_queue(room, created_by_id=user_id)

        # Compute next position
        last = (
            db.session.query(QueueEntry)
            .filter_by(queue_id=q.id)
            .order_by(QueueEntry.position.desc())
            .first()
        )
        next_pos = (last.position if last and last.position else 0) + 1

        entry = QueueEntry(
            queue_id=q.id,
            added_by_id=user_id,
            url=canonical_url,
            title=meta.get("title") or "",
            thumbnail_url=meta.get("thumbnail_url") or "",
            position=next_pos,
            status="queued",
        )
        db.session.add(entry)
        commit_with_retry(db.session)

        # Broadcast updated queue to room participants
        emit_queue_update_for_room(room)
    except Exception:
        current_app.logger.exception("queue.add handler error")


@socketio.on("queue.remove")
def _on_queue_remove(data):
    try:
        user_id = _get_user_id_from_socket()
        if not user_id:
            return
        room = _get_active_room_for_user(user_id)
        if not room:
            return
        id = (data or {}).get("id")
        if not id:
            return
        entry = (
            db.session.query(QueueEntry).filter_by(id=id, added_by_id=user_id).first()
        )
        if not entry:
            current_app.logger.warning(
                "queue.remove: no entry found for id (id=%s) (user_id=%s)", id, user_id
            )
            return
        entry.status = "deleted"
        commit_with_retry(db.session)
        emit_queue_update_for_room(room)
    except Exception:
        current_app.logger.exception(
            "queue.remove handler error (id=%s) (user_id=%s) (room=%s)",
            id,
            user_id,
            room.code,
        )
