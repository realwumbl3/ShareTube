# Enable postponed annotations to avoid runtime import issues and allow future-style typing
from __future__ import annotations

# Import the SQLAlchemy instance from the shared extensions module
from ..extensions import db

from typing import Optional
from sqlalchemy.orm import Mapped


# User accounts persisted in the database
class User(db.Model):
    # Mark fields that are considered sensitive/private for the dashboard view layer
    __private__ = ["google_sub", "email"]
    # Surrogate primary key integer id
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)
    # Google OpenID subject identifier; unique and indexed for quick lookup
    google_sub: Mapped[Optional[str]] = db.Column(
        db.String(255), unique=True, index=True
    )
    # Email address; unique to prevent duplicates
    email: Mapped[Optional[str]] = db.Column(db.String(255), unique=True)
    # Display name of the user
    name: Mapped[Optional[str]] = db.Column(db.String(255))
    # Profile picture URL
    picture: Mapped[Optional[str]] = db.Column(db.String(1024))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "picture": self.picture,
        }

