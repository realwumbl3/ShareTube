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
from flask import Blueprint, jsonify, render_template, request, make_response, redirect, current_app
import jwt
import time
import secrets
import json

# Import database models and utilities
from server.models import Room

def _generate_mobile_remote_auth_token(room_code: str) -> str:
    """Generate a one-time use auth token for mobile remote access to a specific room."""
    payload = {
        "type": "mobile_remote_auth",
        "room_code": room_code,
        "exp": int(time.time()) + (5 * 60),  # 5 minute expiry
        "jti": secrets.token_hex(16),  # Unique token ID
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def _validate_mobile_remote_auth_token(token: str) -> str:
    """Validate a mobile remote auth token and return the room code if valid."""
    try:
        # First try to decode as JWT
        payload = jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
        if payload.get("type") != "mobile_remote_auth":
            raise jwt.InvalidTokenError("Invalid token type")
        room_code = payload.get("room_code")
        if not room_code:
            raise jwt.InvalidTokenError("No room code in token")
        return room_code
    except jwt.InvalidTokenError:
        # If JWT decoding fails, try base64 encoded JSON (for backward compatibility)
        try:
            import base64
            decoded = base64.b64decode(token)
            payload = json.loads(decoded.decode('utf-8'))
            if payload.get("type") != "mobile_remote_auth":
                raise ValueError("Invalid token type")
            room_code = payload.get("room_code")
            if not room_code:
                raise ValueError("No room code in token")

            # Validate timestamp (within 5 minutes)
            timestamp = payload.get("timestamp", 0)
            if abs(time.time() * 1000 - timestamp) > 5 * 60 * 1000:
                raise ValueError("Token expired")

            return room_code
        except Exception:
            raise jwt.InvalidTokenError("Invalid auth token")


def _generate_mobile_remote_jwt_token(room_code: str) -> str:
    """Generate a JWT token for mobile remote WebSocket authentication."""
    payload = {
        "sub": f"mobile_remote:{room_code}:{secrets.token_hex(8)}",  # Unique mobile remote user ID
        "type": "mobile_remote",
        "room_code": room_code,
        "exp": int(time.time()) + (24 * 60 * 60),  # 24 hour expiry
    }
    token = jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")
    print(f"Generated mobile remote JWT token: sub='{payload['sub']}', length={len(token)}")
    return token


# Create the mobile remote blueprint that encapsulates all related routes.
mobile_remote_bp = Blueprint(
    "mobile_remote",  # Blueprint name for `url_for("mobile_remote.*")`.
    __name__,  # Module name; Flask uses this as a base for path resolution.
    url_prefix="/mobile-remote",  # URL prefix for all routes on this page.
    # Templates live under `pages/mobile_remote/frontend/templates/`.
    template_folder="../frontend/templates",
)


@mobile_remote_bp.route("/")
def mobile_remote_home():
    """
    Render the main mobile remote control page.

    The `mobile-remote.html` template resides in this blueprint's
    `template_folder`, keeping the HTML shell colocated with its JS/CSS.
    """

    # Render the primary mobile remote template.
    return render_template("mobile-remote.html")


@mobile_remote_bp.route("/auth/<auth_token>")
def mobile_remote_auth(auth_token):
    """
    Authenticate a mobile remote using a one-time auth token.

    Validates the auth token, generates a JWT token for WebSocket auth,
    and renders the room page with the token embedded.
    """
    print(f"Mobile remote auth: received auth_token='{auth_token}'")

    try:
        room_code = _validate_mobile_remote_auth_token(auth_token)
        print(f"Mobile remote auth: validated room_code='{room_code}'")
    except Exception as e:
        print(f"Mobile remote auth: validation failed: {e}")
        return render_template("mobile-remote.html", room_code=None, error="Invalid or expired auth link")

    # Validate that the room exists
    room = Room.query.filter_by(code=room_code).first()
    if not room:
        print(f"Mobile remote auth: room not found for code='{room_code}'")
        return render_template("mobile-remote.html", room_code=None, error="Room not found")

    # Generate JWT token for WebSocket authentication
    jwt_token = _generate_mobile_remote_jwt_token(room_code)
    print(f"Mobile remote auth: generated JWT token: '{jwt_token[:50]}...', full length={len(jwt_token)}")

    # Verify the token can be decoded
    try:
        decoded = jwt.decode(jwt_token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
        print(f"Mobile remote auth: token verification successful, decoded sub: {decoded.get('sub')}")
    except Exception as e:
        print(f"Mobile remote auth: token verification failed: {e}")
        return render_template("mobile-remote.html", room_code=None, error="Token generation failed")

    # Render the room page with the token embedded in JavaScript
    print(f"Mobile remote auth: rendering template with room_code='{room_code}'")
    return render_template("mobile-remote.html", room_code=room_code, token=jwt_token)


@mobile_remote_bp.route("/<room_code>")
def mobile_remote_with_room(room_code):
    """
    Render the mobile remote control page with a specific room code.

    The room code is validated to ensure the room exists.
    Note: This route should only be accessed after authentication.
    """
    print(f"Mobile remote room: direct access to room_code='{room_code}'")

    # Validate that the room exists
    room = Room.query.filter_by(code=room_code).first()
    if not room:
        print(f"Mobile remote room: room not found for code='{room_code}'")
        return render_template("mobile-remote.html", room_code=None, error="Room not found")

    # For now, generate a token here too (in case someone accesses directly)
    # TODO: In production, this should require proper authentication
    jwt_token = _generate_mobile_remote_jwt_token(room_code)
    print(f"Mobile remote room: generated fallback token, length={len(jwt_token)}")

    # Render the mobile remote template with the room code and token embedded
    return render_template("mobile-remote.html", room_code=room_code, token=jwt_token)


@mobile_remote_bp.route("/api/generate-auth-url/<room_code>")
def generate_auth_url(room_code):
    """
    Generate a one-time auth URL for mobile remote access to a room.
    This endpoint is called by the extension to get a proper auth URL for QR codes.
    """
    room = Room.query.filter_by(code=room_code).first()
    if not room:
        return jsonify({"error": "Room not found"}), 404

    # Generate a proper JWT auth token
    auth_token = _generate_mobile_remote_auth_token(room_code)

    # Return the full auth URL
    auth_url = f"{current_app.config.get('BACKEND_BASE_URL', 'https://sharetube.wumbl3.xyz')}/mobile-remote/auth/{auth_token}"

    return jsonify({"auth_url": auth_url, "room_code": room_code})




