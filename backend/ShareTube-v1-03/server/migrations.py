# Future annotations import to support forward references
from __future__ import annotations

# Import Flask application type for typing clarity
from flask import Flask

# Import the SQLAlchemy instance so that future migrations can use it
from .extensions import db
from .models import User

# Run all database migrations required for the current application version
def run_all_migrations(app: Flask) -> None:
    # Ensure we have an application context so SQLAlchemy metadata is bound
    with app.app_context():
        with db.engine.begin() as conn:
            # select first suer and make them a super_admin
            pass
            # user = User.query.first()
            # if user:
            #     user.role = 'super_admin'
            #     db.session.commit()

