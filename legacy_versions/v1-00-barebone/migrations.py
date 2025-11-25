# Future annotations import to support forward references
from __future__ import annotations

# Import Flask application type for typing clarity
from flask import Flask

# Import the SQLAlchemy instance so that future migrations can use it
from .extensions import db


# Run all database migrations required for the current application version
def run_all_migrations(app: Flask) -> None:
    # Ensure we have an application context so SQLAlchemy metadata is bound
    with app.app_context():
        # Currently, there are no explicit migrations beyond create_all at startup.
        # This function exists as an extension point to add SQL DDL or data migrations
        # in the future without changing the application startup sequence.
        # Example (pseudocode):
        # if not column_exists('room', 'new_col'): alter table to add column
        # For now, we intentionally do nothing.
        pass
