# Future annotations to simplify typing across versions
from __future__ import annotations

# Flask constructs for routing, responses, and request data access
from flask import Blueprint, jsonify, request

# Helpers to parse YouTube IDs and fetch metadata
from ..utils import extract_video_id, fetch_video_meta


# Create the YouTube blueprint
youtube_bp = Blueprint("youtube", __name__)


# HTTP GET endpoint to fetch metadata for a given YouTube URL or id
@youtube_bp.get("/api/youtube/metadata")
def youtube_metadata():
    # Accept either a full URL or a raw video id
    url = request.args.get("url", "").strip()
    vid = request.args.get("id", "").strip()
    if not url and not vid:
        return jsonify({"error": "missing_url_or_id"}), 400
    try:
        # If id not provided, try to extract it from the given URL
        if not vid and url:
            v = extract_video_id(url)
            vid = v or ""
        vid = (vid or "").strip()
        # If we still have no id, try a metadata fetch using best-effort extraction
        if not vid:
            meta = fetch_video_meta(extract_video_id(url) or "")
            if not meta:
                return jsonify({"error": "not_found"}), 404
            return jsonify(meta)
        # Lookup metadata for the explicit video id
        meta = fetch_video_meta(vid)
        if meta:
            return jsonify(meta)
        # Not found or empty response
        return jsonify({"error": "not_found"}), 404
    except Exception:
        # Return generic server error for unexpected failures
        return jsonify({"error": "server_error"}), 500


