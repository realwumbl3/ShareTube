from __future__ import annotations

import os
import secrets
import time
from typing import Optional, Dict, Any
import json
import threading
import psutil

import logging

import requests
from flask import Flask, jsonify, request, redirect, make_response, current_app
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, disconnect, join_room, leave_room

from .config import Config


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', filename='instance/app.log')
logger = logging.getLogger(__name__)


db = SQLAlchemy()
socketio = SocketIO(async_mode="gevent", cors_allowed_origins="*")


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    origins_cfg = app.config["CORS_ORIGINS"]
    if origins_cfg.strip() == "*":
        allowed_origins = "*"
    else:
        allowed_origins = [o.strip() for o in origins_cfg.split(",") if o.strip()]
    CORS(app, resources={r"/*": {"origins": allowed_origins}})
    socketio.init_app(app, cors_allowed_origins=allowed_origins)

    with app.app_context():
        db.create_all()
        try:
            _maybe_migrate_nullable_queue_room_id()
        except Exception:
            logging.exception("startup migration check failed")

    register_routes(app)
    return app


def _maybe_migrate_nullable_queue_room_id() -> None:
    """Ensure Queue.room_id is nullable in the underlying DB schema.

    - SQLite: detect NOT NULL and rebuild table to drop NOT NULL.
    - Postgres/MySQL: execute ALTER TABLE to drop NOT NULL if needed.
    Safe to run repeatedly.
    """
    eng = db.engine
    dialect = eng.dialect.name
    if dialect == "sqlite":
        # Inspect pragma table_info for NOT NULL
        with eng.connect() as conn:
            res = conn.execute(db.text("PRAGMA table_info('queue')"))
            cols = res.fetchall()
        room_col = None
        for c in cols:
            # PRAGMA table_info: cid, name, type, notnull, dflt_value, pk
            if (c[1] or "").lower() == "room_id":
                room_col = c
                break
        if room_col is None:
            return
        notnull = int(room_col[3] or 0)
        if notnull == 0:
            return
        # Rebuild table without NOT NULL on room_id
        with eng.begin() as conn:
            conn.execute(db.text("PRAGMA foreign_keys=off"))
            # Create new table schema (matches ORM types)
            conn.execute(db.text(
                """
                CREATE TABLE IF NOT EXISTS queue_new (
                    id INTEGER PRIMARY KEY,
                    room_id INTEGER REFERENCES room (id),
                    created_by_id INTEGER REFERENCES user (id),
                    created_at INTEGER
                );
                """
            ))
            # Copy data
            conn.execute(db.text("INSERT INTO queue_new (id, room_id, created_by_id, created_at) SELECT id, room_id, created_by_id, created_at FROM queue"))
            # Swap tables
            conn.execute(db.text("DROP TABLE queue"))
            conn.execute(db.text("ALTER TABLE queue_new RENAME TO queue"))
            conn.execute(db.text("CREATE INDEX IF NOT EXISTS ix_queue_room_id ON queue (room_id)"))
            conn.execute(db.text("PRAGMA foreign_keys=on"))
    else:
        # Attempt generic ALTER to drop NOT NULL if present
        try:
            with eng.begin() as conn:
                conn.execute(db.text("ALTER TABLE queue ALTER COLUMN room_id DROP NOT NULL"))
        except Exception:
            # Ignore if already nullable or unsupported
            pass


class User(db.Model):
    __private__ = ["google_sub", "email"]
    id = db.Column(db.Integer, primary_key=True)
    google_sub = db.Column(db.String(255), unique=True, index=True)
    email = db.Column(db.String(255), unique=True)
    name = db.Column(db.String(255))
    picture = db.Column(db.String(1024))


class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(64), unique=True, index=True, nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))
    is_private = db.Column(db.Boolean, default=True)
    state = db.Column(db.String(16), default="idle")  # idle | playing

    memberships = db.relationship("RoomMembership", backref="room", lazy=True, cascade="all, delete-orphan")
    queues = db.relationship("Queue", backref="room", lazy=True, cascade="all, delete-orphan")


class RoomMembership(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    joined_at = db.Column(db.Integer, default=lambda: int(time.time()))
    last_seen = db.Column(db.Integer, default=lambda: int(time.time()))
    active = db.Column(db.Boolean, default=True)

    user = db.relationship("User")

    __table_args__ = (
        db.UniqueConstraint("room_id", "user_id", name="uq_room_membership_room_user"),
    )


class Queue(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=True, index=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))

    entries = db.relationship("QueueEntry", backref="queue", lazy=True, cascade="all, delete-orphan")


class QueueEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    queue_id = db.Column(db.Integer, db.ForeignKey("queue.id"), nullable=False, index=True)
    added_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    url = db.Column(db.String(2048), nullable=False)
    title = db.Column(db.String(512))
    thumbnail_url = db.Column(db.String(1024))
    position = db.Column(db.Integer, index=True)
    added_at = db.Column(db.Integer, default=lambda: int(time.time()))
    status = db.Column(db.String(32), default="queued")  # queued, playing, done


def _issue_jwt(user: User) -> str:
    import jwt

    payload = {
        "sub": str(user.id),
        "name": user.name,
        "picture": user.picture,
        "exp": int(time.time()) + int(Config.ACCESS_TOKEN_EXPIRES),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm="HS256")


def _require_auth() -> Optional[User]:
    import jwt
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        return None
    token = authz.split(" ", 1)[1]
    try:
        data = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None
    return db.session.get(User, int(data.get("sub", 0)))


def register_routes(app: Flask) -> None:
    # Register dashboard blueprint (HTML + SSE + JSON endpoints)
    try:
        from .dashboard import dashboard_bp
        app.register_blueprint(dashboard_bp)
    except Exception as e:
        logging.exception("dashboard blueprint import failed")
        logger.exception(e)
        # If dashboard cannot be imported, continue without it
        pass
    @app.get("/")
    def health():
        return jsonify({"ok": True, "app": os.getenv("APP_NAME", "NewApp")})

    @app.get("/api/youtube/metadata")
    def youtube_metadata():
        """Fetch basic metadata (title, thumbnails) for a YouTube video URL or id.
        Query params: url or id
        """
        url = request.args.get("url", "").strip()
        vid = request.args.get("id", "").strip()
        if not url and not vid:
            return jsonify({"error": "missing_url_or_id"}), 400
        try:
            if not vid and url:
                # parse id from url
                try:
                    from urllib.parse import urlparse, parse_qs
                    u = urlparse(url)
                    host = (u.hostname or "").replace("www.", "")
                    if host == "youtu.be":
                        vid = u.path.lstrip("/")
                    elif host in ("youtube.com", "m.youtube.com"):
                        q = parse_qs(u.query)
                        vid = (q.get("v") or [""])[0]
                except Exception:
                    pass
            vid = (vid or "").strip()
            if not vid:
                # fallback to oembed with full URL
                oembed_target = url if url else f"https://www.youtube.com/watch?v={vid}"
                meta = _fetch_youtube_oembed(oembed_target)
                if meta is None:
                    return jsonify({"error": "not_found"}), 404
                return jsonify(meta)

            # Prefer oEmbed first
            meta = _fetch_youtube_oembed(f"https://www.youtube.com/watch?v={vid}")
            if meta:
                return jsonify(meta)

            # Fallback to Data API if available
            api_key = app.config.get("YOUTUBE_API_KEY", "")
            if api_key:
                meta = _fetch_youtube_data_api(vid, api_key)
                if meta:
                    return jsonify(meta)

            return jsonify({"error": "not_found"}), 404
        except Exception as e:
            logger.exception("youtube_metadata error")
            return jsonify({"error": "server_error"}), 500

    def _fetch_youtube_data_api(video_id: str, api_key: str):
        try:
            r = requests.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "id": video_id,
                    "part": "snippet",
                    "key": api_key,
                },
                timeout=8,
            )
            if r.status_code != 200:
                return None
            data = r.json()
            items = data.get("items") or []
            if not items:
                return None
            sn = items[0].get("snippet", {})
            thumbs = sn.get("thumbnails", {})
            # Choose best available
            thumb = thumbs.get("maxres") or thumbs.get("standard") or thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}
            return {
                "id": video_id,
                "title": sn.get("title") or "",
                "thumbnail_url": thumb.get("url") or "",
                "channel_title": sn.get("channelTitle") or "",
            }
        except Exception:
            return None

    def _fetch_youtube_oembed(target_url: str):
        try:
            r = requests.get(
                "https://www.youtube.com/oembed",
                params={"url": target_url, "format": "json"},
                timeout=6,
            )
            if r.status_code != 200:
                return None
            j = r.json()
            return {
                "id": "",
                "title": j.get("title") or "",
                "thumbnail_url": j.get("thumbnail_url") or "",
                "author_name": j.get("author_name") or "",
            }
        except Exception:
            return None

    # Minimal Google OAuth dance (Authorization Code flow)
    @app.get("/auth/google/start")
    def google_start():
        client_id = app.config["GOOGLE_CLIENT_ID"]
        if not client_id:
            return jsonify({"error": "google_oauth_not_configured"}), 500
        state = secrets.token_urlsafe(16)
        resp = make_response(redirect(
            "https://accounts.google.com/o/oauth2/v2/auth"
            + "?response_type=code"
            + f"&client_id={client_id}"
            + f"&redirect_uri={app.config['BACKEND_BASE_URL']}/auth/google/callback"
            + "&scope=openid%20email%20profile"
            + f"&state={state}"
        ))
        resp.set_cookie("oauth_state", state, max_age=300, httponly=True, samesite="Lax")
        return resp

    @app.get("/auth/google/callback")
    def google_callback():
        state_cookie = request.cookies.get("oauth_state")
        state = request.args.get("state")
        if not state_cookie or state_cookie != state:
            return jsonify({"error": "invalid_state"}), 400
        code = request.args.get("code")
        if not code:
            return jsonify({"error": "missing_code"}), 400
        token_res = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": app.config["GOOGLE_CLIENT_ID"],
                "client_secret": app.config["GOOGLE_CLIENT_SECRET"],
                "redirect_uri": f"{app.config['BACKEND_BASE_URL']}/auth/google/callback",
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        if token_res.status_code != 200:
            return jsonify({"error": "token_exchange_failed"}), 400
        tokens = token_res.json()
        id_token = tokens.get("id_token")
        try:
            import jwt
            claims = jwt.decode(id_token, options={"verify_signature": False, "verify_aud": False})
        except Exception:
            return jsonify({"error": "invalid_id_token"}), 400

        google_sub = claims.get("sub")
        email = claims.get("email")
        name = claims.get("name")
        picture = claims.get("picture")
        if not google_sub:
            return jsonify({"error": "invalid_profile"}), 400

        user = User.query.filter_by(google_sub=google_sub).first()
        if not user:
            user = User(google_sub=google_sub, email=email, name=name, picture=picture)
            db.session.add(user)
        else:
            user.email = email
            user.name = name
            user.picture = picture
        db.session.commit()

        jwt_token = _issue_jwt(user)
        return (
            "<script>window.opener && window.opener.postMessage({type:'newapp_auth', token:'%s'}, '*');window.close();</script>"
            % jwt_token
        )


app = create_app()


# -----------------------------
# Socket.IO helpers and state
# -----------------------------
_sid_to_user_id = {}
_sid_to_room_codes = {}
_room_player_status: Dict[str, Dict[int, Dict[str, Any]]] = {}

def _room_name_from_code(code: str) -> str:
    return f"room:{code}"

def _generate_room_code() -> str:
    import uuid
    return uuid.uuid4().hex

def _get_user_for_current_sid() -> Optional[User]:
    sid = request.sid  # type: ignore
    uid = _sid_to_user_id.get(sid)
    if not uid:
        return None
    return db.session.get(User, int(uid))

def _emit_room_presence(code: str) -> None:
    # Fetch active members with user profile data
    room: Optional[Room] = Room.query.filter_by(code=code).first()
    if not room:
        return
    members = (
        db.session.query(RoomMembership, User)
        .join(User, RoomMembership.user_id == User.id)
        .filter(RoomMembership.room_id == room.id, RoomMembership.active == True)
        .all()
    )
    payload = {
        "code": code,
        "members": [
            {
                "id": u.id,
                "name": u.name,
                "picture": u.picture,
            }
            for (_m, u) in members
        ],
    }
    socketio.emit("room_presence", payload, room=_room_name_from_code(code))


def _get_room_by_code(code: str) -> Optional["Room"]:
    return Room.query.filter_by(code=code).first()


def _get_or_create_room_queue(room: "Room") -> "Queue":
    q = (
        Queue.query.filter_by(room_id=room.id)
        .order_by(Queue.created_at.desc())
        .first()
    )
    if not q:
        q = Queue(room_id=room.id)
        db.session.add(q)
        db.session.commit()
    return q


def _get_or_create_user_queue(user: "User") -> "Queue":
    q = (
        Queue.query.filter_by(room_id=None, created_by_id=user.id)
        .order_by(Queue.created_at.desc())
        .first()
    )
    if not q:
        q = Queue(room_id=None, created_by_id=user.id)
        db.session.add(q)
        db.session.commit()
    return q


def _emit_queue_snapshot(code: str, to_sid: Optional[str] = None) -> None:
    room = _get_room_by_code(code)
    if not room:
        return
    q = _get_or_create_room_queue(room)
    entries = (
        QueueEntry.query.filter(QueueEntry.queue_id == q.id, QueueEntry.status != "deleted")
        .order_by(QueueEntry.position.asc(), QueueEntry.id.asc())
        .all()
    )
    payload = {
        "code": code,
        "items": [
            {
                "id": e.id,
                "url": e.url,
                "title": e.title or "",
                "thumbnail_url": e.thumbnail_url or "",
                "position": e.position or 0,
            }
            for e in entries
        ],
    }
    if to_sid:
        socketio.emit("queue_snapshot", payload, room=to_sid)
    else:
        socketio.emit("queue_snapshot", payload, room=_room_name_from_code(code))


# -----------------------------
# Video ID/metadata helpers
# -----------------------------
def _extract_video_id(value: str) -> str:
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(value)
        host = (u.hostname or "").replace("www.", "")
        if host == "youtu.be":
            vid = u.path.lstrip("/")
            return vid or ""
        if host.endswith("youtube.com"):
            if u.path.startswith("/shorts/"):
                parts = u.path.split("/")
                return (parts[2] if len(parts) > 2 else "") or ""
            q = parse_qs(u.query)
            v = (q.get("v") or [""])[0]
            if v:
                return v
    except Exception:
        pass
    # Fallback: accept raw 11-char ID
    import re
    m = re.search(r"[a-zA-Z0-9_-]{11}", value or "")
    return m.group(0) if m else ""


def _build_watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def _fetch_video_meta(video_id: str) -> dict:
    """Return {title, thumbnail_url}. Prefer oEmbed; optionally Data API if key present."""
    title = ""
    thumb = ""
    # Try oEmbed
    try:
        r = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": _build_watch_url(video_id), "format": "json"},
            timeout=6,
        )
        if r.status_code == 200:
            j = r.json()
            title = j.get("title") or title
            thumb = j.get("thumbnail_url") or thumb
    except Exception:
        pass
    # Optional Data API for better thumbnails
    try:
        api_key = current_app.config.get("YOUTUBE_API_KEY", "")
        if api_key:
            r2 = requests.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={"id": video_id, "part": "snippet", "key": api_key},
                timeout=8,
            )
            if r2.status_code == 200:
                data = r2.json()
                items = data.get("items") or []
                if items:
                    sn = items[0].get("snippet", {})
                    thumbs = sn.get("thumbnails", {})
                    best = thumbs.get("maxres") or thumbs.get("standard") or thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}
                    title = sn.get("title") or title
                    thumb = best.get("url") or thumb
    except Exception:
        pass
    return {"title": title or "", "thumbnail_url": thumb or ""}


@socketio.on("connect")
def handle_connect():
    import jwt
    token = request.args.get("token", "")
    if not token:
        return False
    try:
        claims = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])  # type: ignore
        user_id = int(claims.get("sub", 0))
        user: Optional[User] = db.session.get(User, user_id)
        if not user:
            return False
        emit("hello", {
            "user": {
                "id": user.id,
                "name": user.name,
                "picture": user.picture,
            }
        })
        _sid_to_user_id[request.sid] = user.id  # type: ignore
        _sid_to_room_codes.setdefault(request.sid, set())  # type: ignore
        # Ensure background stats thread is running
        global _stats_thread_started
        if not _stats_thread_started and current_app.config.get("ENABLE_SYSTEM_STATS", False):
            logging.info("starting system stats thread")
            socketio.start_background_task(_emit_system_stats_forever)
            _stats_thread_started = True
    except Exception:
        return False


@socketio.on("ping")
def handle_ping(data):
    emit("pong", {"ts": int(time.time() * 1000)})


## queue_replace removed: adoption/personal queue + incremental adds make it unnecessary


@socketio.on("queue_add")
def handle_queue_add(data):
    user = _get_user_for_current_sid()
    if not user:
        return emit("queue_add_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    item = (data or {}).get("item") if isinstance(data, dict) else None
    items = (data or {}).get("items") if isinstance(data, dict) else None
    if code:
        room = _get_room_by_code(code)
        if not room:
            return emit("queue_add_result", {"ok": False, "error": "not_found"})
        q = _get_or_create_room_queue(room)
    else:
        q = _get_or_create_user_queue(user)
    # Determine next position
    next_pos = (db.session.query(db.func.max(QueueEntry.position)).filter(QueueEntry.queue_id == q.id).scalar() or 0)
    def _add_one(it, pos):
        raw = (it or {}).get("url") or (it or {}).get("id") or ""
        vid = _extract_video_id(raw)
        if not vid:
            return None
        url = _build_watch_url(vid)
        meta = _fetch_video_meta(vid)
        e = QueueEntry(
            queue_id=q.id,
            added_by_id=user.id,
            url=url,
            title=meta.get("title") or "",
            thumbnail_url=meta.get("thumbnail_url") or "",
            position=pos,
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
        db.session.commit()
        if code:
            _emit_queue_snapshot(code)
    emit("queue_add_result", {"ok": True, "added": len(added)})


@socketio.on("queue_remove")
def handle_queue_remove(data):
    user = _get_user_for_current_sid()
    if not user:
        return emit("queue_remove_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    entry_id = (data or {}).get("id") if isinstance(data, dict) else None
    if not entry_id:
        return emit("queue_remove_result", {"ok": False, "error": "invalid_payload"})
    if code:
        room = _get_room_by_code(code)
        if not room:
            return emit("queue_remove_result", {"ok": False, "error": "not_found"})
        q = _get_or_create_room_queue(room)
    else:
        q = _get_or_create_user_queue(user)
    e: Optional[QueueEntry] = QueueEntry.query.filter_by(id=int(entry_id), queue_id=q.id).first()
    if not e:
        return emit("queue_remove_result", {"ok": False, "error": "entry_not_found"})
    # Soft delete
    e.status = "deleted"
    db.session.commit()
    if code:
        _emit_queue_snapshot(code)
    emit("queue_remove_result", {"ok": True})


def _emit_room_state(code: str) -> None:
    room = _get_room_by_code(code)
    if not room:
        return
    socketio.emit("room_state_change", {"code": code, "state": room.state}, room=_room_name_from_code(code))


@socketio.on("player_status")
def handle_player_status(data):
    """Receive per-user player status from clients.
    data: { code, state: 'playing'|'paused'|'idle', is_ad: bool, ts?: ms }
    """
    user = _get_user_for_current_sid()
    if not user:
        return
    code = (data or {}).get("code") if isinstance(data, dict) else None
    state = (data or {}).get("state") if isinstance(data, dict) else None
    is_ad = bool((data or {}).get("is_ad")) if isinstance(data, dict) else False
    ts = int((data or {}).get("ts") or int(time.time() * 1000))
    if not code or state not in ("playing", "paused", "idle"):
        return
    try:
        _room_player_status.setdefault(code, {})[int(user.id)] = {"state": state, "is_ad": bool(is_ad), "ts": ts}
    except Exception:
        pass


@socketio.on("room_state_set")
def handle_room_state_set(data):
    user = _get_user_for_current_sid()
    if not user:
        return emit("room_state_set_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    state = (data or {}).get("state") if isinstance(data, dict) else None
    if not code or state not in ("idle", "playing"):
        return emit("room_state_set_result", {"ok": False, "error": "invalid_payload"})
    room = _get_room_by_code(code)
    if not room:
        return emit("room_state_set_result", {"ok": False, "error": "not_found"})
    room.state = state
    db.session.commit()
    _emit_room_state(code)
    emit("room_state_set_result", {"ok": True})

@socketio.on("room_create")
def handle_room_create(data):
    user = _get_user_for_current_sid()
    if not user:
        return emit("room_create_result", {"ok": False, "error": "unauthorized"})
    code = _generate_room_code()
    room = Room(code=code, created_by_id=user.id)
    db.session.add(room)
    db.session.commit()
    # Adopt user's existing personal queue if present; otherwise create new queue for the room
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
    # Auto-join creator
    join_room(_room_name_from_code(code))
    _sid_to_room_codes.setdefault(request.sid, set()).add(code)  # type: ignore
    # Upsert membership
    memb = RoomMembership.query.filter_by(room_id=room.id, user_id=user.id).first()
    if not memb:
        memb = RoomMembership(room_id=room.id, user_id=user.id, active=True)
        db.session.add(memb)
    else:
        memb.active = True
        memb.last_seen = int(time.time())
    db.session.commit()
    _emit_room_presence(code)
    emit("room_create_result", {"ok": True, "code": code})
    # Creator gets empty snapshot initially (client may push its local queue next)
    _emit_queue_snapshot(code, to_sid=request.sid)  # type: ignore


@socketio.on("room_join")
def handle_room_join(data):
    user = _get_user_for_current_sid()
    if not user:
        return emit("room_join_result", {"ok": False, "error": "unauthorized"})
    code = (data or {}).get("code") if isinstance(data, dict) else None
    if not code:
        return emit("room_join_result", {"ok": False, "error": "missing_code"})
    room: Optional[Room] = Room.query.filter_by(code=code).first()
    if not room:
        return emit("room_join_result", {"ok": False, "error": "not_found"})
    join_room(_room_name_from_code(code))
    _sid_to_room_codes.setdefault(request.sid, set()).add(code)  # type: ignore
    # Upsert membership
    memb = RoomMembership.query.filter_by(room_id=room.id, user_id=user.id).first()
    if not memb:
        memb = RoomMembership(room_id=room.id, user_id=user.id, active=True)
        db.session.add(memb)
    else:
        memb.active = True
        memb.last_seen = int(time.time())
    db.session.commit()
    _emit_room_presence(code)
    emit("room_join_result", {"ok": True, "code": code})
    # Send current queue snapshot to the joining socket only
    _emit_queue_snapshot(code, to_sid=request.sid)  # type: ignore


@socketio.on("room_leave")
def handle_room_leave(data):
    user = _get_user_for_current_sid()
    if not user:
        return
    code = (data or {}).get("code") if isinstance(data, dict) else None
    if not code:
        return
    room: Optional[Room] = Room.query.filter_by(code=code).first()
    if not room:
        return
    leave_room(_room_name_from_code(code))
    srooms = _sid_to_room_codes.get(request.sid)  # type: ignore
    if srooms and code in srooms:
        srooms.remove(code)
    memb = RoomMembership.query.filter_by(room_id=room.id, user_id=user.id).first()
    if memb:
        memb.active = False
        memb.last_seen = int(time.time())
        db.session.commit()
    _emit_room_presence(code)
    # Clear player status for this user in this room
    try:
        if code in _room_player_status and user.id in _room_player_status.get(code, {}):
            _room_player_status[code].pop(user.id, None)
            if not _room_player_status[code]:
                _room_player_status.pop(code, None)
    except Exception:
        pass


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid  # type: ignore
    user_id = _sid_to_user_id.pop(sid, None)
    codes = _sid_to_room_codes.pop(sid, set())
    if user_id:
        for code in list(codes):
            room: Optional[Room] = Room.query.filter_by(code=code).first()
            if not room:
                continue
            memb = RoomMembership.query.filter_by(room_id=room.id, user_id=user_id).first()
            if memb:
                memb.active = False
                memb.last_seen = int(time.time())
        db.session.commit()
        for code in list(codes):
            _emit_room_presence(code)
            try:
                if code in _room_player_status and user_id in _room_player_status.get(code, {}):
                    _room_player_status[code].pop(user_id, None)
                    if not _room_player_status[code]:
                        _room_player_status.pop(code, None)
            except Exception:
                pass



# -----------------------------
# Background system stats emitter (every 10s)
# -----------------------------
_stats_thread_started = False

def _emit_system_stats_forever():
    import psutil
    while True:
        try:
            cpu_percent = psutil.cpu_percent(interval=None)
            vm = psutil.virtual_memory()
            payload = {
                "cpu_percent": cpu_percent,
                "mem_total": vm.total,
                "mem_available": vm.available,
                "mem_percent": vm.percent,
                "ts": int(time.time() * 1000),
            }
            socketio.emit("system_stats", payload)
        except Exception as e:
            logging.exception("error emitting system stats")
            logging.exception(e)
            pass
        # sleep without blocking gevent
        socketio.sleep(10)


# (stats thread started inside authenticated connect handler above)

