"""
Backend package for the homepage.

This module defines the `homepage_bp` blueprint which owns:
- All HTTP routes under the `/` URL prefix (root).
- The homepage Jinja templates in `frontend/templates/`.

Static assets for this page are served directly by Nginx from
`pages/homepage/frontend/static/`, so this blueprint does not define
its own `static_folder` or `static_url_path`.
"""

# Import Flask primitives to build the API and render the HTML shell.
from flask import Blueprint, jsonify, render_template, request

# Import database models and utilities
from server.models import Room, Queue

# Create the homepage blueprint that encapsulates all related routes.
homepage_bp = Blueprint(
    "homepage",  # Blueprint name for `url_for("homepage.*")`.
    __name__,  # Module name; Flask uses this as a base for path resolution.
    url_prefix="/",  # URL prefix for all routes on this page (root).
    # Templates live under `pages/homepage/frontend/templates/`.
    template_folder="../frontend/templates",
)


@homepage_bp.route("/")
def homepage_home():
    """
    Render the main homepage.

    The `homepage.html` template resides in this blueprint's
    `template_folder`, keeping the HTML shell colocated with its JS/CSS.
    """
    return render_template("homepage.html")


@homepage_bp.route("/api/stats")
def get_public_stats():
    """
    Return public statistics for the homepage.
    """
    try:
        # Get basic public stats
        total_rooms = Room.query.count()
        active_rooms = Room.query.filter(Room.is_active == True).count() if hasattr(Room, 'is_active') else total_rooms
        total_queues = Queue.query.count()
        
        return jsonify({
            "rooms": {
                "total": total_rooms,
                "active": active_rooms
            },
            "queues": {
                "total": total_queues
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


