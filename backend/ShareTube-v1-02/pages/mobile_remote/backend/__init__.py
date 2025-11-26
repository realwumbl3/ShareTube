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
from flask import Blueprint, jsonify, render_template, request

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


@mobile_remote_bp.route("/api/control/play", methods=["POST"])
def play_video():
    """
    Toggle playback or perform a specific play-related action.

    Request JSON body:
    - action: which play action to perform (default: "toggle").
    """

    # Pull the `action` value from the incoming JSON payload.
    action = request.json.get("action", "toggle")

    # Respond with a simple success payload; later this can forward to the
    # real playback controller.
    return jsonify({"status": "success", "action": action})


@mobile_remote_bp.route("/api/control/volume", methods=["POST"])
def set_volume():
    """
    Set the playback volume.

    Request JSON body:
    - volume: integer volume level (0–100), defaults to 50 when omitted.
    """

    # Read the requested volume from the JSON body, defaulting to 50.
    volume = request.json.get("volume", 50)

    # Respond with the applied volume so the frontend can confirm the state.
    return jsonify({"status": "success", "volume": volume})


@mobile_remote_bp.route("/api/control/seek", methods=["POST"])
def seek_video():
    """
    Seek to a relative position within the current video.

    Request JSON body:
    - position: float between 0 and 1 representing the target fraction.
    """

    # Extract the desired seek position fraction; default to 0 if missing.
    position = request.json.get("position", 0)

    # Return the requested position; backend can later clamp/validate this.
    return jsonify({"status": "success", "position": position})


@mobile_remote_bp.route("/api/queue")
def get_queue():
    """
    Return the current playback queue as a JSON list.

    Each queue entry contains basic title and duration fields; this endpoint
    is used to populate the queue list in the mobile UI.
    """

    # Static sample queue; replace with real queue state in the future.
    queue = [
        {"id": 1, "title": "Video 1", "duration": "3:45"},
        {"id": 2, "title": "Video 2", "duration": "4:12"},
    ]

    # Serialize the queue for the client.
    return jsonify(queue)


@mobile_remote_bp.route("/api/status")
def get_status():
    """
    Return the current playback status as JSON.

    The response includes play/pause state, timing, volume, and the active
    video title so the mobile UI can stay in sync with the player.
    """

    # Placeholder status snapshot; this will later be driven by real state.
    status = {
        "is_playing": False,  # Whether playback is currently active.
        "current_time": 0,  # Current playback position in seconds.
        "duration": 245,  # Total video duration in seconds.
        "volume": 75,  # Current volume level (0–100).
        "current_video": {"title": "Sample Video", "id": 1},
    }

    # Return the status dict as JSON to the frontend.
    return jsonify(status)


