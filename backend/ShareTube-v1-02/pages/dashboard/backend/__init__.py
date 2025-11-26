# Import `Blueprint` to group related routes, `jsonify` for JSON responses,
# and `render_template` to render Jinja HTML templates.

from flask import Blueprint, jsonify, render_template

# Import the core database handle and models directly from the main app package
# instead of via the local package. Importing from "." caused a circular import
# when `pages.dashboard` imported this backend module to access `dashboard_bp`,
# because the symbols were expected to exist in the partially initialised
# `pages.dashboard.backend` package. By importing from the root application
# modules, we avoid that cycle entirely.
from ....extensions import db
from ....models import User, Room, RoomMembership, Queue



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


@dashboard_bp.route("/api/stats")
def get_stats():
    """
    Return basic dashboard statistics as JSON.

    This is currently placeholder data; the structure is kept simple so
    frontend code can easily bind these values into the UI.
    """

    total_users = User.query.count()
    active_sessions = RoomMembership.query.count()

    # Assemble a minimal stats dict; later this can read from the database.
    stats = {
        "total_users": total_users,  # Total number of known users.
        "active_sessions": active_sessions,  # Number of currently active sessions.
        "videos_shared": 0,  # Total count of shared videos.
        "storage_used": 0,  # Human-readable storage usage.
    }

    # Serialize the stats dict as a JSON HTTP response.
    return jsonify(stats)


@dashboard_bp.route("/api/activity")
def get_activity():
    """
    Return a list of recent activity rows as JSON.

    The response is a list of objects with basic activity metadata that
    the frontend can render into the "Recent Activity" section.
    """

    # Placeholder activity events; these will eventually be loaded from the DB.
    activity = [
        {
            "type": "video_shared",  # Event type identifier.
            "user": "User1",  # Which user triggered the event.
            "timestamp": "2024-01-01",  # ISO-ish timestamp for when it happened.
        },
        {
            "type": "session_started",
            "user": "User2",
            "timestamp": "2024-01-01",
        },
    ]

    # Serialize the list of events as JSON for the frontend.
    return jsonify(activity)


