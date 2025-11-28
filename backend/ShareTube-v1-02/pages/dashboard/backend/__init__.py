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


# Import our dashboard modules
from ..analytics import DashboardAnalytics
from ..data import DashboardData

# Whitelist of user IDs allowed to access the dashboard
# ALLOWED_USER_IDS is deprecated; use database roles instead

# Authentication middleware for dashboard routes
def require_auth(f):
    """Decorator to require authentication for dashboard routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check for auth token in cookies (set by frontend)
        auth_token = request.cookies.get('auth_token')
        if not auth_token:
            return jsonify({"error": "Authentication required"}), 401

        try:
            # Decode and validate JWT token
            payload = jwt.decode(
                auth_token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
            )
            # Store user info in request context for use in handlers
            user_id = int(payload.get("sub"))
            
            # Check if user is authorized via database role
            user = User.query.get(user_id)
            if not user or user.role != 'super_admin':
                logger.warning(f"Unauthorized access attempt by user_id={user_id} role={getattr(user, 'role', 'none')}")
                return jsonify({"error": "Unauthorized"}), 403
                
            request.user_id = user_id
            request.user_name = payload.get("name")
            request.user_picture = payload.get("picture")
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        except Exception as e:
            logger.exception(f"Auth token validation failed: {e}")
            return jsonify({"error": "Authentication failed"}), 401

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


# Create the dashboard blueprint that represents the entire dashboard "page".
dashboard_bp = Blueprint(
    "dashboard",  # Blueprint name used for `url_for("dashboard.*")` lookups.
    __name__,  # Module name; Flask uses this to locate templates and static files.
    url_prefix="/dashboard",  # URL prefix for all routes in this blueprint.
    # The template folder path is resolved relative to this package's root path.
    # `../frontend/templates` -> `pages/dashboard/frontend/templates`
    template_folder="../frontend/templates",

)


@dashboard_bp.route("/")
def dashboard_home():
    """
    Render the dashboard HTML page.

    The `render_template` call will look for `dashboard.html` inside this
    blueprint's `template_folder`, i.e. `pages/dashboard/frontend/templates/`.
    """

    # Render the main dashboard template for the browser.
    return render_template("dashboard.html")


@dashboard_bp.route("/api/auth/status")
def auth_status():
    """
    Check authentication status and return user info if authenticated.
    """
    auth_token = request.cookies.get('auth_token')
    if not auth_token:
        return jsonify({"authenticated": False})

    try:
        payload = jwt.decode(
            auth_token, current_app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        
        # Check role for authenticated user
        user_id = int(payload.get("sub"))
        user = User.query.get(user_id)
        role = getattr(user, 'role', 'user') if user else 'user'
        
        return jsonify({
            "authenticated": True,
            "user": {
                "id": user_id,
                "name": payload.get("name"),
                "picture": payload.get("picture"),
                "role": role
            }
        })
    except Exception as e:
        logger.exception(f"Auth status check failed: {e}")
        return jsonify({"authenticated": False})


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


