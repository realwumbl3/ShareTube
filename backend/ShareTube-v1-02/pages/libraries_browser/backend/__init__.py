"""
Backend package for the libraries browser page.

This module defines the `libraries_browser_bp` blueprint which owns:
- All HTTP routes under the `/libraries-browser` URL prefix.
- The libraries browser Jinja templates in `frontend/templates/`.

Static assets for this page are served directly by Nginx from
`pages/libraries_browser/frontend/static/`, so this blueprint does not
define its own `static_folder` or `static_url_path`.
"""

# Import the Flask primitives needed to build the API and HTML page.
from flask import Blueprint, jsonify, render_template, request

# Create the libraries browser blueprint that groups all related routes.
libraries_browser_bp = Blueprint(
    "libraries_browser",  # Name used by `url_for("libraries_browser.*")`.
    __name__,  # Module name; Flask uses this to resolve paths.
    url_prefix="/libraries-browser",  # URL prefix for all page routes.
    # Templates live under `pages/libraries_browser/frontend/templates/`.
    template_folder="../frontend/templates",
)


@libraries_browser_bp.route("/")
def libraries_browser_home():
    """
    Render the main libraries browser page.

    The corresponding template `libraries-browser.html` resides in this
    blueprint's `template_folder`.
    """

    # Render the primary libraries browser HTML shell.
    return render_template("libraries-browser.html")


@libraries_browser_bp.route("/api/libraries")
def get_libraries():
    """
    Return a JSON list of available libraries.

    This is placeholder data that the frontend uses to render library cards.
    The structure is intentionally simple to ease future replacement with
    database-backed data.
    """

    # Static sample libraries; replace with real data lookups later.
    libraries = [
        {
            "id": 1,
            "name": "My Videos",
            "type": "personal",
            "video_count": 45,
            "total_duration": "12h 30m",
            "last_updated": "2024-01-01",
        },
        {
            "id": 2,
            "name": "Shared Library",
            "type": "shared",
            "video_count": 23,
            "total_duration": "8h 15m",
            "last_updated": "2024-01-01",
        },
        {
            "id": 3,
            "name": "Favorites",
            "type": "favorites",
            "video_count": 12,
            "total_duration": "3h 45m",
            "last_updated": "2024-01-01",
        },
    ]

    # Return the list of libraries as JSON.
    return jsonify(libraries)


@libraries_browser_bp.route("/api/libraries/<int:library_id>")
def get_library(library_id: int):
    """
    Return a JSON list of videos for a specific library.

    The `library_id` path parameter identifies which library's videos
    are being requested. Currently this returns placeholder data.
    """

    # Sample video rows for a single library; replace with DB-backed results.
    videos = [
        {
            "id": 1,
            "title": "Sample Video 1",
            "duration": "3:45",
            "thumbnail": "/libraries-browser/static/thumbnails/sample1.jpg",
            "uploaded_by": "User1",
            "upload_date": "2024-01-01",
            "views": 150,
        },
        {
            "id": 2,
            "title": "Sample Video 2",
            "duration": "5:12",
            "thumbnail": "/libraries-browser/static/thumbnails/sample2.jpg",
            "uploaded_by": "User2",
            "upload_date": "2024-01-01",
            "views": 89,
        },
    ]

    # Serialize the videos list for the caller.
    return jsonify(videos)


@libraries_browser_bp.route("/api/search")
def search_videos():
    """
    Search for videos across libraries.

    Query parameters:
    - q: free text query string.
    - library_id (optional): restrict the search to a specific library.
    """

    # Extract query string parameters from the HTTP request.
    query = request.args.get("q", "")
    library_id = request.args.get("library_id")

    # Example search result list; meant to be replaced by real search logic.
    results = [
        {
            "id": 1,
            "title": f'Search result for "{query}"',
            "duration": "4:20",
            "library_name": "My Videos",
            "thumbnail": "/libraries-browser/static/thumbnails/search1.jpg",
        }
    ]

    # Return the array of search results as JSON.
    return jsonify(results)


@libraries_browser_bp.route("/api/libraries/<int:library_id>/videos/<int:video_id>")
def get_video_details(library_id: int, video_id: int):
    """
    Return detailed information about a specific video.

    Path parameters:
    - library_id: which library the video belongs to.
    - video_id: the ID of the video inside that library.
    """

    # Static placeholder details for a single video; replace with real data.
    video = {
        "id": video_id,
        "title": "Detailed Video Title",
        "description": "This is a detailed description of the video...",
        "duration": "4:20",
        "upload_date": "2024-01-01",
        "uploaded_by": "User1",
        "views": 150,
        "likes": 25,
        "tags": ["tutorial", "educational"],
        "file_size": "45.2 MB",
    }

    # Return the video description as a JSON document.
    return jsonify(video)


