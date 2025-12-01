# Import `Blueprint` to group related routes, `jsonify` for JSON responses,
# and `render_template` to render Jinja HTML templates.
import logging
import jwt
from functools import wraps
logger = logging.getLogger(__name__)

from flask import Blueprint, current_app, jsonify, render_template, request, make_response, redirect

# Import dependencies directly from the main app
# from ....extensions import db
from ..shared_imports import db, now_ms, User, Room, RoomMembership, Queue, RoomOperator, QueueEntry, RoomAudit, ChatMessage


SECURE_DASHBOARD_UUID = "f4c6c472-3a2b-446e-a9a0-9e3a9f3ebf9e"
SECURE_DASHBOARD_PREFIX = f"/dashboard-{SECURE_DASHBOARD_UUID}"
PUBLIC_DASHBOARD_PREFIX = "/dashboard"


# Import our dashboard modules
from ..analytics import DashboardAnalytics
from ..data import DashboardData

# Whitelist of user IDs allowed to access the dashboard
# ALLOWED_USER_IDS is deprecated; use database roles instead

# Authentication helpers for dashboard routes
def _get_super_admin_from_request(log_failures=True):
    """Return (user, error_response) based on the caller's auth token."""
    auth_token = request.cookies.get('auth_token')
    if not auth_token:
        return None, ("Authentication required", 401)

    try:
        payload = jwt.decode(
            auth_token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        user_id = int(payload.get("sub"))
        user = User.query.get(user_id)
        if not user or user.role != 'super_admin':
            if log_failures:
                logger.warning(
                    "Unauthorized dashboard access attempt user_id=%s role=%s",
                    user_id,
                    getattr(user, "role", "none"),
                )
            return None, ("Unauthorized", 403)

        request.user_id = user_id
        request.user_name = payload.get("name")
        request.user_picture = payload.get("picture")
        return user, None
    except jwt.ExpiredSignatureError:
        return None, ("Token expired", 401)
    except jwt.InvalidTokenError:
        return None, ("Invalid token", 401)
    except Exception as e:
        logger.exception(f"Auth token validation failed: {e}")
        return None, ("Authentication failed", 401)


def require_auth(f):
    """Decorator to require authentication for dashboard routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user, error = _get_super_admin_from_request()
        if not user:
            message, status = error
            return jsonify({"error": message}), status
        return f(*args, **kwargs)

    return decorated_function

# Socket.IO event handlers for real-time dashboard updates
def register_socket_handlers():
    """Register Socket.IO event handlers for dashboard real-time updates."""
    # Import socketio directly from extensions to avoid import issues
    from ....extensions import socketio

    @socketio.on('dashboard.connect')
    def handle_dashboard_connect():
        """Handle dashboard client connection."""
        logger.info("Dashboard client connected")

    @socketio.on('dashboard.disconnect')
    def handle_dashboard_disconnect():
        """Handle dashboard client disconnection."""
        logger.info("Dashboard client disconnected")

# Helper function to emit real-time dashboard updates
def emit_dashboard_update(update_type, data):
    """Emit a real-time update to connected dashboard clients."""
    try:
        # Import socketio directly from extensions to avoid import issues
        from ....extensions import socketio
        socketio.emit('dashboard.update', {
            'type': update_type,
            'data': data,
            'timestamp': now_ms()
        })
    except Exception as e:
        logger.exception(f"Failed to emit dashboard update: {e}")



"""
Backend package for the dashboard page.

This module defines the `dashboard_bp` blueprint which owns:
- All HTTP routes under the `/dashboard` URL prefix.
- The dashboard page's Jinja templates located in `frontend/templates/`.

Static assets for this page are served directly by Nginx from
`pages/dashboard/frontend/static/`, so the blueprint itself does not define
its own `static_folder` or `static_url_path`.
"""


# Create the hidden dashboard blueprint that represents the secured dashboard page.
dashboard_bp = Blueprint(
    "dashboard",  # Blueprint name used for `url_for("dashboard.*")` lookups.
    __name__,  # Module name; Flask uses this to locate templates and static files.
    url_prefix=SECURE_DASHBOARD_PREFIX,  # Hidden URL prefix for secured routes.
    template_folder="../frontend/templates",
)

# Public landing blueprint that only exposes the login experience.
dashboard_entry_bp = Blueprint(
    "dashboard_entry",
    __name__,
    url_prefix=PUBLIC_DASHBOARD_PREFIX,
    template_folder="../frontend/templates",
)


@dashboard_bp.route("/")
def dashboard_home():
    """
    Render the dashboard HTML page.

    The `render_template` call will look for `dashboard.html` inside this
    blueprint's `template_folder`, i.e. `pages/dashboard/frontend/templates/`.
    """
    user, error = _get_super_admin_from_request()
    if not user:
        return redirect(PUBLIC_DASHBOARD_PREFIX)

    response = make_response(
        render_template(
            "dashboard.html",
            secure_prefix=SECURE_DASHBOARD_PREFIX,
        )
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@dashboard_entry_bp.route("/")
def dashboard_entry_home():
    """Public landing page that only performs sign-in checks."""
    response = make_response(
        render_template(
            "dashboard_entry.html",
        )
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@dashboard_entry_bp.route("/api/entry/check")
def dashboard_entry_check():
    """Endpoint used by the landing page to decide whether to redirect."""
    user, _ = _get_super_admin_from_request(log_failures=False)
    if user:
        return jsonify({"redirect": f"{SECURE_DASHBOARD_PREFIX}/"})
    return jsonify({"authenticated": False})


@dashboard_bp.route("/api/auth/status")
def auth_status():
    """
    Check authentication status and return user info if authenticated.
    """
    user, error = _get_super_admin_from_request()
    if not user:
        return jsonify({"authenticated": False}), error[1]

    return jsonify({
        "authenticated": True,
        "user": {
            "id": request.user_id,
            "name": request.user_name,
            "picture": request.user_picture,
            "role": "super_admin"
        }
    })


@dashboard_bp.route("/api/auth/logout")
def auth_logout():
    """
    Handle logout by clearing auth token cookie.
    """
    resp = jsonify({"success": True})
    resp.delete_cookie('auth_token')
    return resp


@dashboard_bp.route("/api/stats")
@require_auth
def get_stats():
    """
    Return comprehensive dashboard statistics as JSON.
    """
    try:
        stats = DashboardAnalytics.get_all_stats()
        # Emit real-time update to all connected dashboard clients
        emit_dashboard_update('stats', stats)
        return jsonify(stats)
    except Exception as e:
        logger.exception("Error getting dashboard stats")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/activity")
@require_auth
def get_activity():
    """
    Return recent activity from RoomAudit logs.
    """
    activity = DashboardData.get_recent_activity()
    # Emit real-time update to all connected dashboard clients
    if activity:
        emit_dashboard_update('activity', activity[0])  # Send latest activity item
    return jsonify(activity)


@dashboard_bp.route("/api/users")
@require_auth
def get_users():
    """
    Return user data for the dashboard.
    """
    return jsonify({"users": DashboardData.get_users_data()})


@dashboard_bp.route("/api/rooms")
@require_auth
def get_rooms():
    """
    Return room data for the dashboard.
    """
    return jsonify({"rooms": DashboardData.get_rooms_data()})


@dashboard_bp.route("/api/queues")
@require_auth
def get_queues():
    """
    Return queue data for the dashboard.
    """
    return jsonify({"queues": DashboardData.get_queues_data()})


@dashboard_bp.route("/api/health")
def get_health():
    """
    Return system health information.
    """
    return jsonify(DashboardData.get_system_health())


@dashboard_bp.route("/api/debug/create-fake-users", methods=["POST", "GET"])
@require_auth
def create_fake_users():
    """
    Create fake users for testing purposes.
    Accepts count as query parameter or JSON body.
    """
    try:
        logger.info("Starting create_fake_users request")

        # Try query parameter first (GET), then JSON body (POST)
        count = request.args.get('count', type=int)
        if count is None:
            # Try JSON body
            try:
                data = request.json or {}
                count = data.get("count", 5)
            except Exception as e:
                logger.warning(f"JSON parsing failed: {e}, using default count")
                count = 5

        logger.info(f"Requested count: {count}")

        if not isinstance(count, int) or count < 1 or count > 50:
            logger.warning(f"Invalid count: {count}")
            return jsonify({"error": "Count must be an integer between 1 and 50"}), 400

        if not isinstance(count, int) or count < 1 or count > 50:
            logger.warning(f"Invalid count: {count}")
            return jsonify({"error": "Count must be an integer between 1 and 50"}), 400

        logger.info("Calling DashboardData.create_fake_users")
        result = DashboardData.create_fake_users(count)
        logger.info(f"DashboardData.create_fake_users returned: {result}")

        if result["success"]:
            # Emit real-time update to refresh user data
            emit_dashboard_update('full_update', {})
            logger.info("Successfully created fake users, emitting update")
            return jsonify(result)
        else:
            logger.error(f"Failed to create fake users: {result}")
            return jsonify(result), 500

    except Exception as e:
        logger.exception("Error in create_fake_users endpoint")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/debug/remove-fake-users", methods=["POST"])
@require_auth
def remove_fake_users():
    """
    Remove all fake users from the database.
    """
    try:
        result = DashboardData.remove_all_fake_users()

        if result["success"]:
            # Emit real-time update to refresh user data
            emit_dashboard_update('full_update', {})
            return jsonify(result)
        else:
            return jsonify(result), 500

    except Exception as e:
        logger.exception("Error in remove_fake_users endpoint")
        return jsonify({"error": str(e)}), 500


