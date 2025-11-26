"""
Libraries browser page package.

This package simply re-exports the `libraries_browser_bp` blueprint from the
`pages.libraries_browser.backend` subpackage so that other modules can keep
importing it via::

    from app.pages.libraries_browser import libraries_browser_bp

while the actual implementation lives in the `backend/` and `frontend/`
subdirectories under `pages/libraries_browser/`.
"""

# Re-export the libraries browser blueprint from the backend subpackage.
# The noqa comment prevents linters from flagging this as an unused import.
from .backend import libraries_browser_bp  # noqa: F401


