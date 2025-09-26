# Enable future annotations for cleaner typing
from __future__ import annotations

# Typing helpers for clarity in API payloads
from typing import Any, List

# Flask constructs for blueprints, JSON responses, request parsing, and templates
from flask import (
    Blueprint,
    jsonify,
    request,
    render_template,
)

# Import models and db from app module
from .app import db

# Import ORM models used by the dashboard
from .models import User, Room, RoomMembership, Queue, QueueEntry

# Create the dashboard blueprint with a URL prefix for routing
dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")


# Render the main dashboard landing page listing rooms
@dashboard_bp.get("/")
def dashboard_page():
    # Render Jinja template and mark active nav tab
    return render_template("dashboard/rooms.html", active_page="rooms")


# -----------------------------
# Simple DB browser (read-only)
# -----------------------------

# Map model names to their SQLAlchemy classes for dynamic browsing
_MODEL_MAP = {
    "User": User,
    "Room": Room,
    "RoomMembership": RoomMembership,
    "Queue": Queue,
    "QueueEntry": QueueEntry,
}

# Default privacy blocklist of column names we never show in the dashboard
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


# Helper to list column names for a model
def _model_columns(model):
    return [c.name for c in model.__table__.columns]


# Convert a SQLAlchemy row to a dict with simple int normalization
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


# Render the DB browser page container (client fetches data via API below)
@dashboard_bp.get("/db")
def db_browser_page():
    return render_template("dashboard/db.html", active_page="db")


# List available models for the DB browser
@dashboard_bp.get("/api/db/models")
def db_models():
    return jsonify({"models": list(_MODEL_MAP.keys())})


# List rows for a specified model with simple ordering and pagination
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


# Return queue entries for a specific queue id (read-only)
@dashboard_bp.get("/api/db/queue_entries")
def db_queue_entries():
    """List entries for a specific queue id (read-only, dashboard use)."""
    try:
        qid = int(request.args.get("queue_id", "0"))
    except Exception:
        qid = 0
    if qid <= 0:
        return jsonify({"error": "invalid_queue_id"}), 400
    # Only select relevant, non-private columns
    entries: List[QueueEntry] = (
        db.session.query(QueueEntry)
        .filter(QueueEntry.queue_id == qid)
        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
        .all()
    )

    def _entry_to_dict(e: QueueEntry) -> Dict[str, Any]:
        return {
            "id": int(e.id),
            "queue_id": int(e.queue_id),
            "added_by_id": int(e.added_by_id or 0),
            "url": e.url,
            "title": e.title or "",
            "thumbnail_url": e.thumbnail_url or "",
            "position": int(e.position or 0),
            "added_at": int(e.added_at or 0),
            "status": e.status or "",
        }

    return jsonify(
        {
            "queue_id": int(qid),
            "entries": [_entry_to_dict(e) for e in entries],
            "total": int(len(entries)),
        }
    )


# Provide combined room details used by the dashboard room inspector
@dashboard_bp.get("/api/db/room_details")
def db_room_details():
    """Return room members and the most recent queue's entries for a room."""
    try:
        rid = int(request.args.get("room_id", "0"))
    except Exception:
        rid = 0
    if rid <= 0:
        return jsonify({"error": "invalid_room_id"}), 400
    room: Room | None = db.session.get(Room, rid)
    if not room:
        return jsonify({"error": "not_found"}), 404
    # Members (include inactive, ordered by joined time)
    member_rows = (
        db.session.query(RoomMembership, User)
        .join(User, RoomMembership.user_id == User.id)
        .filter(RoomMembership.room_id == room.id)
        .order_by(RoomMembership.joined_at.asc())
        .all()
    )
    members = [
        {
            "id": int(u.id),
            "name": u.name,
            "picture": u.picture,
            "active": bool(m.active),
            "last_seen": int(m.last_seen or 0),
        }
        for (m, u) in member_rows
    ]
    # Most recent queue and its entries (if any)
    q = (
        db.session.query(Queue)
        .filter(Queue.room_id == room.id)
        .order_by(Queue.created_at.desc())
        .first()
    )
    entries: list[dict[str, Any]] = []
    if q:
        q_entries: List[QueueEntry] = (
            db.session.query(QueueEntry)
            .filter(QueueEntry.queue_id == q.id)
            .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
            .all()
        )
        for e in q_entries:
            entries.append(
                {
                    "id": int(e.id),
                    "queue_id": int(e.queue_id),
                    "added_by_id": int(e.added_by_id or 0),
                    "url": e.url,
                    "title": e.title or "",
                    "thumbnail_url": e.thumbnail_url or "",
                    "position": int(e.position or 0),
                    "added_at": int(e.added_at or 0),
                    "status": e.status or "",
                }
            )
    return jsonify(
        {
            "room": {
                "id": int(room.id),
                "code": room.code,
                "state": room.state,
                "created_at": int(room.created_at or 0),
                "is_private": bool(room.is_private),
            },
            "members": members,
            "queue": {"id": int(q.id)} if q else None,
            "entries": entries,
        }
    )
