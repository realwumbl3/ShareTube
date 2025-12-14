"""
Mobile remote page package.

This package re-exports the `mobile_remote_bp` blueprint from the
`pages.mobile_remote.backend` subpackage to keep imports stable::

    from app.pages.mobile_remote import mobile_remote_bp

while routing logic and templates/static live in the dedicated
`backend/` and `frontend/` subdirectories under `pages/mobile_remote/`.
"""

# Re-export the mobile remote blueprint from the backend package.
from .backend import mobile_remote_bp  # noqa: F401


