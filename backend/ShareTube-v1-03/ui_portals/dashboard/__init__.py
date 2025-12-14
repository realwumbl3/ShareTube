"""
Dashboard page package.

This package now exposes the `dashboard_bp` blueprint from the
`pages.dashboard.backend` subpackage so that other modules can continue to
import it using::

    from app.pages.dashboard import dashboard_bp

while the actual implementation and templates/static assets live in the
`backend/` and `frontend/` subdirectories under `pages/dashboard/`.
"""

# Re-export the dashboard blueprints from the backend subpackage.
# The noqa comment prevents linters from flagging the imported names as unused.
from .backend import dashboard_bp, dashboard_entry_bp  # noqa: F401
