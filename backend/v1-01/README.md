# ShareTube Backend

Backend API server for ShareTube, a collaborative video watching platform that enables synchronized playback across multiple users in real-time rooms.

## Overview

ShareTube allows users to create and join rooms where they can watch videos together with synchronized playback, manage a shared queue, and chat in real-time. The backend provides RESTful APIs and WebSocket support for real-time synchronization.

## Features

- **Room Management**: Create and join rooms with unique codes
- **Synchronized Playback**: Real-time video player state synchronization via WebSockets
- **Queue System**: Shared video queue management with add, remove, and reorder operations
- **User Presence**: Track active users in each room
- **Chat**: Real-time messaging within rooms
- **Authentication**: Google OAuth integration with JWT token-based authentication
- **YouTube Integration**: Metadata fetching for YouTube videos
- **Room Operators**: Role-based permissions for room management
- **Audit Logging**: Track room events and user actions

## Technology Stack

- **Flask**: Web framework
- **Flask-SocketIO**: Real-time WebSocket communication
- **SQLAlchemy**: Database ORM
- **JWT**: Authentication tokens
- **Gevent**: Async I/O support
- **Redis**: Optional message queue for multi-process deployments

## Project Structure

### Backend

```
.
├── app.py              # Application factory and main entry point
├── config.py           # Configuration management
├── extensions.py       # Flask extensions (db, socketio)
├── sockets.py          # Socket.IO utilities
├── models/             # Database models
│   ├── user.py
│   ├── room.py
│   ├── queue.py
│   └── chat.py
├── views/              # API endpoints and socket handlers
│   ├── auth.py         # Authentication endpoints
│   ├── rooms.py        # Room management
│   ├── player.py       # Player synchronization
│   ├── queue.py        # Queue management
└── .tests/             # Test suite
```

### Extension

```
extension/
├── manifest.json       # Chrome extension manifest (MV3)
├── background.js       # Service worker for background tasks
├── contentScript.js    # Content script injected into YouTube pages
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic
├── options.html        # Options page UI
├── options.js          # Options page logic
└── app/                # Main application code
    ├── app.js          # Application entry point
    ├── state.js        # State management
    ├── socket.js       # WebSocket client
    ├── player.js       # YouTube player integration
    ├── virtualplayer.js # Virtual player controls
    ├── components/      # UI components
    │   ├── Controls.js
    │   ├── Queue.js
    │   ├── QueueItem.js
    │   ├── UserIcons.js
    │   └── ...
    ├── models/         # Data models
    │   ├── user.js
    │   └── queueItem.js
    ├── assets/         # Static assets
    ├── styles/         # CSS stylesheets
    └── dep/            # Dependencies
```

## API Endpoints

### Authentication

- `GET /auth/google/start` - Initiate Google OAuth flow
- `GET /auth/google/callback` - OAuth callback handler

### Rooms

- `POST /api/room.create` - Create a new room

## WebSocket Events

### Client → Server

- `room.join` - Join a room
- `room.leave` - Leave a room
- `player.sync` - Update player state
- `queue.add` - Add video to queue
- `queue.remove` - Remove video from queue
- `queue.reorder` - Reorder queue items

### Server → Client

- `presence.update` - User presence changes
- `player.state` - Player state updates
- `queue.update` - Queue changes
- `chat.message` - New chat messages

## Configuration

The application is configured via environment variables. Key settings include:

- `SECRET_KEY` - Flask secret key
- `JWT_SECRET` - JWT signing secret
- `DATABASE_URL` - Database connection string
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `CORS_ORIGINS` - Allowed CORS origins
- `YOUTUBE_API_KEY` - Optional YouTube Data API key
- `SOCKETIO_MESSAGE_QUEUE` - Redis connection string (optional)

See `config.py` for all available configuration options.

## Database

The application uses SQLAlchemy with support for SQLite (default) and PostgreSQL. Database schema is automatically created on first run, and migrations can be applied via the migrations system.

## Development

The application uses Flask's application factory pattern. The main entry point is `app.py`, which exports a `create_app()` function and an `app` instance for WSGI servers.

## License

[Add license information if applicable]

