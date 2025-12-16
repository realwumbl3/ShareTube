"""
Backend package for the mobile remote page.

This module defines the `mobile_remote_bp` blueprint which owns:
- All HTTP routes under the `/mobile-remote` URL prefix.
- The mobile remote Jinja templates in `frontend/templates/`.

Static assets for this page are served directly by Nginx from
`pages/mobile_remote/frontend/static/`, so this blueprint does not define
its own `static_folder` or `static_url_path`.
"""

# Import Flask primitives to build the API and render the HTML shell.
from flask import Blueprint, jsonify, render_template, request, current_app
import jwt
import secrets
import logging

# Import database models and utilities
from server.models import Room, RoomMembership, User
from server.lib.utils import get_redis_client


# Create the mobile remote blueprint that encapsulates all related routes.
mobile_remote_bp = Blueprint(
    "mobile_remote",  # Blueprint name for `url_for("mobile_remote.*")`.
    __name__,  # Module name; Flask uses this as a base for path resolution.
    url_prefix="/mobile-remote",  # URL prefix for all routes on this page.
    # Templates live under `pages/mobile_remote/frontend/templates/`.
    template_folder="../frontend/templates",
)


# Short token expiration time in seconds (15 minutes)
SHORT_TOKEN_EXPIRY_SECONDS = 15 * 60


def _get_redis_key(short_token: str) -> str:
    """Get Redis key for storing short token mapping."""
    return f"mobile_remote:auth:{short_token}"


def generate_short_token() -> str:
    """Generate a URL-safe short token (10 characters)."""
    # Generate 10 bytes and encode as URL-safe base64, then take first 10 chars
    # This gives us ~60 bits of entropy
    token_bytes = secrets.token_urlsafe(8)
    # Take first 10 characters for shorter URL
    return token_bytes[:10]


def store_short_token(short_token: str, jwt_token: str) -> bool:
    """
    Store short token -> JWT token mapping in Redis.
    Returns True if successful, False otherwise.
    """
    redis_client = get_redis_client()
    if not redis_client:
        logging.warning("Redis not available for short token storage")
        return False
    
    try:
        key = _get_redis_key(short_token)
        redis_client.setex(key, SHORT_TOKEN_EXPIRY_SECONDS, jwt_token)
        return True
    except Exception as e:
        logging.warning(f"Failed to store short token in Redis: {e}")
        return False


def retrieve_jwt_from_short_token(short_token: str) -> str | None:
    """
    Retrieve JWT token from Redis using short token.
    Returns JWT token if found, None otherwise.
    Tokens are single-use and deleted after retrieval.
    """
    redis_client = get_redis_client()
    if not redis_client:
        logging.warning("Redis not available for short token retrieval")
        return None
    
    try:
        key = _get_redis_key(short_token)
        jwt_token = redis_client.get(key)
        if jwt_token:
            # Delete token after use (single-use)
            redis_client.delete(key)
        return jwt_token
    except Exception as e:
        logging.warning(f"Failed to retrieve short token from Redis: {e}")
        return None


def _validate_jwt_and_room(jwt_token: str, room_code: str) -> tuple[dict, Room, User] | tuple[None, None, None]:
    """
    Validate JWT token and room.
    Returns (payload, room, user) if valid, (None, None, None) otherwise.
    """
    try:
        payload = jwt.decode(jwt_token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            raise jwt.InvalidTokenError("No user ID in token")
    except Exception as e:
        logging.warning(f"Mobile remote: token validation failed: {e}")
        return None, None, None
    
    room = Room.query.filter_by(code=room_code).first()
    if not room:
        logging.warning(f"Mobile remote: room not found for code='{room_code}'")
        return None, None, None
    
    user = User.query.get(user_id)
    if not user:
        logging.warning(f"Mobile remote: user not found for user_id='{user_id}'")
        return None, None, None
    
    return payload, room, user


@mobile_remote_bp.route("/")
def mobile_remote_home():
    """
    Render the main mobile remote control page.

    The `mobile-remote.html` template resides in this blueprint's
    `template_folder`, keeping the HTML shell colocated with its JS/CSS.
    """

    # Render the primary mobile remote template.
    return render_template("mobile-remote.html", error="Cannot open directly, use QR code.")


@mobile_remote_bp.route("/<room_code>")
def mobile_remote_with_room_code(room_code):
    """
    Render the mobile remote control page for a specific room.

    Authentication is handled client-side using stored tokens.
    This allows refreshing the page after initial auth.
    """
    logging.info(f"Mobile remote: direct access to room_code='{room_code}'")

    # Validate room exists
    room = Room.query.filter_by(code=room_code).first()
    if not room:
        logging.warning(f"Mobile remote: room not found for code='{room_code}'")
        return render_template("mobile-remote.html", room_code=None, error="Room not found")

    logging.info(f"Mobile remote: rendering template for room_code='{room_code}' (client-side auth)")
    return render_template("mobile-remote.html", room_code=room_code)


@mobile_remote_bp.route("/auth/<short_token>/<room_code>")
def mobile_remote_with_short_token(short_token, room_code):
    """
    Render the mobile remote control page using a short token.
    
    The short token is looked up in Redis to retrieve the full JWT token.
    This route provides shorter URLs for QR codes.
    """
    logging.info(f"Mobile remote: access with short token, room_code='{room_code}'")
    
    # Retrieve JWT token from Redis using short token
    jwt_token = retrieve_jwt_from_short_token(short_token)
    if not jwt_token:
        logging.warning(f"Mobile remote: short token '{short_token}' not found or expired")
        return render_template("mobile-remote.html", room_code=None, error="Invalid or expired authentication token")
    
    # Validate JWT token, room, and user
    payload, room, user = _validate_jwt_and_room(jwt_token, room_code)
    if not payload:
        return render_template("mobile-remote.html", room_code=None, error="Invalid authentication token")
    if not room:
        return render_template("mobile-remote.html", room_code=None, error="Room not found")
    if not user:
        return render_template("mobile-remote.html", room_code=None, error="User not found")
    
    logging.info(f"Mobile remote: rendering template with room_code='{room_code}' and user token (from short token)")
    return render_template("mobile-remote.html", room_code=room_code, token=jwt_token)


@mobile_remote_bp.route("/api/generate-auth-url/<room_code>")
def generate_auth_url(room_code):
    """
    Generate a mobile remote URL with short token for a room.
    This endpoint is called by the extension to get a mobile remote URL for QR codes.
    Uses short tokens stored in Redis to keep URLs short for QR codes.
    Falls back to long URL format if Redis is unavailable.
    """
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1]
    if not token:
        return jsonify({"error": "Authentication required"}), 401

    try:
        payload = jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
        user_id = payload.get("sub")
        user_id = int(user_id) if user_id is not None else None
    except Exception as err:
        logging.warning(f"Mobile remote auth URL: failed to decode user token: {err}")
        return jsonify({"error": "Invalid authentication token"}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 401

    room = Room.query.filter_by(code=room_code).first()
    if not room:
        return jsonify({"error": "Room not found"}), 404

    membership = RoomMembership.query.filter_by(room_id=room.id, user_id=user_id).first()
    if not membership and room.owner_id != user_id:
        return jsonify({"error": "Insufficient permissions"}), 403

    base_url = current_app.config.get('BACKEND_BASE_URL', 'https://sharetube.wumbl3.xyz')
    
    # Try to use short token system
    short_token = generate_short_token()
    if store_short_token(short_token, token):
        # Successfully stored short token, use short URL format
        auth_url = f"{base_url}/mobile-remote/auth/{short_token}/{room_code}"
        logging.info(f"Mobile remote: Generated short auth URL for room {room_code}")
    else:
        # Redis unavailable, fall back to long URL format
        auth_url = f"{base_url}/mobile-remote/{room_code}?token={token}"
        logging.warning(f"Mobile remote: Redis unavailable, using fallback long URL for room {room_code}")
    
    return jsonify({"auth_url": auth_url, "room_code": room_code})

