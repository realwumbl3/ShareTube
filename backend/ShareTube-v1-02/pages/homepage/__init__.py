"""
Homepage page package.

This package re-exports the `homepage_bp` blueprint from the
`pages.homepage.backend` subpackage to keep imports stable::

    from app.pages.homepage import homepage_bp

while routing logic and templates/static live in the dedicated
`backend/` and `frontend/` subdirectories under `pages/homepage/`.
"""

# Re-export the homepage blueprint from the backend package.
from .backend import homepage_bp  # noqa: F401


