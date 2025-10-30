# Re-export the Flask application instance and factory for WSGI servers and CLIs
from .app import app, create_app  # re-export for wsgi


