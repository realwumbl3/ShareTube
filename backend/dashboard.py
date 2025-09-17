from __future__ import annotations

import json
import time
from typing import Dict, Any, List
import logging

from flask import Blueprint, Response, jsonify, request, render_template, stream_with_context

# Import models and db from app module
from .app import db, User, Room, RoomMembership, Queue, QueueEntry


dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")


def _active_rooms_snapshot() -> Dict[str, Any]:
    """Build a snapshot of active rooms, their state, and users with per-user state."""
    # Rooms with at least one active member
    active_room_rows: List[Room] = (
        db.session.query(Room)
        .join(RoomMembership, RoomMembership.room_id == Room.id)
        .filter(RoomMembership.active == True)
        .group_by(Room.id)
        .order_by(Room.created_at.desc())
        .all()
    )

    rooms: List[Dict[str, Any]] = []
    for room in active_room_rows:
        # All users who have ever joined the room, include their current membership state
        memberships = (
            db.session.query(RoomMembership, User)
            .join(User, RoomMembership.user_id == User.id)
            .filter(RoomMembership.room_id == room.id)
            .order_by(RoomMembership.joined_at.asc())
            .all()
        )
        users = [
            {
                "id": u.id,
                "name": u.name,
                "picture": u.picture,
                "active": bool(m.active),
                "last_seen": int(m.last_seen or 0),
            }
            for (m, u) in memberships
        ]
        rooms.append(
            {
                "code": room.code,
                "state": room.state,
                "users": users,
            }
        )

    return {"ts": int(time.time() * 1000), "rooms": rooms}


@dashboard_bp.get("/")
def dashboard_page():
    return render_template("dashboard/rooms.html", active_page="rooms")


@dashboard_bp.get("/api/snapshot")
def dashboard_snapshot():
    return jsonify(_active_rooms_snapshot())


@dashboard_bp.get("/stream")
def dashboard_stream():
    def gen():
        # Initial retry suggestion for EventSource clients
        yield "retry: 1000\n\n"
        # Send initial event immediately
        try:
            yield f"data: {json.dumps(_active_rooms_snapshot())}\n\n"
        except Exception:
            logging.exception("dashboard_stream initial snapshot error")
            yield "data: {}\n\n"
        # Stream periodic updates
        while True:
            try:
                payload = json.dumps(_active_rooms_snapshot())
                yield f"data: {payload}\n\n"
            except Exception:
                logging.exception("dashboard_stream loop error")
                yield "data: {}\n\n"
            # Non-blocking sleep when gevent is available
            try:
                from gevent import sleep as gsleep  # type: ignore
                gsleep(1)
            except Exception:
                time.sleep(1)

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # disable proxy buffering if behind nginx
    }
    return Response(stream_with_context(gen()), mimetype="text/event-stream", headers=headers)


# -----------------------------
# Simple DB browser (read-only)
# -----------------------------

_MODEL_MAP = {
    "User": User,
    "Room": Room,
    "RoomMembership": RoomMembership,
    "Queue": Queue,
    "QueueEntry": QueueEntry,
}

_DEFAULT_PRIVATE_KEYS = {
    # common PII/secret-ish columns we never want to show in the dashboard
    "email",
    "google_sub",
    "password",
    "secret",
    "token",
    "access_token",
    "refresh_token",
}


def _model_columns(model):
    return [c.name for c in model.__table__.columns]


def _row_to_dict(model, row):
    out = {}
    for c in model.__table__.columns:
        v = getattr(row, c.name)
        try:
            out[c.name] = (
                int(v) if isinstance(v, bool) is False and isinstance(v, (int,)) else v
            )
        except Exception:
            out[c.name] = v
    return out


@dashboard_bp.get("/db")
def db_browser_page():
    return render_template("dashboard/db.html", active_page="db")


@dashboard_bp.get("/api/db/models")
def db_models():
    return jsonify({"models": list(_MODEL_MAP.keys())})


@dashboard_bp.get("/api/db/list")
def db_list():
    model_name = request.args.get("model", "User")
    order = request.args.get("order", "-id")
    try:
        limit = max(1, min(500, int(request.args.get("limit", "50"))))
    except Exception:
        limit = 50
    try:
        offset = max(0, int(request.args.get("offset", "0")))
    except Exception:
        offset = 0
    model = _MODEL_MAP.get(model_name)
    if not model:
        return jsonify({"error": "unknown_model"}), 400
    cols = _model_columns(model)
    private_keys = set()
    try:
        pk = getattr(model, "__private__", None)
        if isinstance(pk, (list, tuple)):
            private_keys |= {str(x) for x in pk}
    except Exception:
        pass
    # Always enforce a default privacy blocklist as a safety net
    private_keys |= _DEFAULT_PRIVATE_KEYS
    visible_cols = [c for c in cols if c not in private_keys]
    # Ordering
    desc = False
    col = "id"
    if order:
        if order.startswith("-"):
            desc = True
            col = order[1:] or "id"
        else:
            col = order
        if col not in visible_cols:
            col = "id"
    q = db.session.query(model)
    try:
        col_attr = getattr(model, col)
        q = q.order_by(col_attr.desc() if desc else col_attr.asc())
    except Exception:
        pass
    total = db.session.query(db.func.count()).select_from(model).scalar() or 0
    rows = q.offset(offset).limit(limit).all()
    data = []
    for r in rows:
        d = _row_to_dict(model, r)
        if private_keys:
            for k in list(d.keys()):
                if k in private_keys:
                    del d[k]
        data.append(d)
    return jsonify(
        {
            "model": model_name,
            "columns": visible_cols,
            "rows": data,
            "total": int(total),
            "offset": int(offset),
            "limit": int(limit),
        }
    )
