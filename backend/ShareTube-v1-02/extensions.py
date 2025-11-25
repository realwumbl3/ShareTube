# Enable postponed annotations evaluation for forward references
from __future__ import annotations

# Import the SQLAlchemy and SocketIO extension classes used by Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO


# Shared Flask extensions
# Create a single SQLAlchemy instance to be initialized with the Flask app
db = SQLAlchemy()
# Create a SocketIO instance; default to permissive CORS at the socket layer
socketio = SocketIO(cors_allowed_origins="*")


