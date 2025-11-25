# Enable future annotations for cleaner typing
from __future__ import annotations

# Flask constructs for blueprints, JSON responses, request parsing, and templates
from flask import (
    Blueprint,
    render_template,
)

# Create the dashboard blueprint with a URL prefix for routing
dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")


# Render the main dashboard landing page listing rooms
@dashboard_bp.get("/")
def dashboard_page():
    # Render Jinja template and mark active nav tab
    return render_template("dashboard/rooms.html", active_page="rooms")
