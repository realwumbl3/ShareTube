<p align="center">
  <img src="extension/icons/icon.svg" alt="ShareTube Logo" width="128" height="128">
</p>

<h1 align="center">ShareTube</h1>

<p align="center">
  <em>Synchronized YouTube watching for friends and communities</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.8+-blue.svg" alt="Python Version">
  <img src="https://img.shields.io/badge/flask-3.0+-black.svg" alt="Flask Version">
  <img src="https://img.shields.io/badge/chrome-MV3-green.svg" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

---

# ShareTube

ShareTube is a collaborative video watching platform that enables synchronized YouTube playback across multiple users in real-time rooms. It consists of a Flask backend API server with Socket.IO for real-time communication and a Chrome browser extension that integrates directly with YouTube.

## Overview

ShareTube allows users to create and join rooms where they can watch YouTube videos together with synchronized playback controls, manage a shared video queue, and chat in real-time. The backend provides RESTful APIs and WebSocket support for real-time synchronization, while the browser extension provides the user interface directly on YouTube pages.

## Features

### Core Functionality
- **Room Management**: Create and join rooms with unique codes
- **Synchronized Playback**: Real-time video player state synchronization (play, pause, seek, restart)
- **Queue System**: Shared video queue with add, remove, reorder, and skip operations
- **User Presence**: Real-time tracking of active users with heartbeat monitoring
- **Chat System**: Real-time messaging within rooms
- **Ready System**: Coordinate playback start when all users are ready

### User Management & Authentication
- **Google OAuth Integration**: Secure authentication with JWT tokens
- **Role-based Permissions**: Owner, operator, and participant roles
- **User Profiles**: Display names, profile pictures, and presence status

### Advanced Features
- **Control Modes**: Flexible room control (owner-only, operators-only, or anyone)
- **Ad Sync Policies**: Configurable ad synchronization behavior
- **Audit Logging**: Comprehensive tracking of room events and user actions
- **YouTube Metadata**: Rich video information fetching and display
- **Browser Extension**: Seamless integration with YouTube interface

### Technical Features
- **Real-time Communication**: Socket.IO for low-latency synchronization
- **Database Persistence**: SQLite/PostgreSQL with SQLAlchemy ORM
- **Scalable Architecture**: Support for Redis message queues in multi-process deployments
- **Production Ready**: Gunicorn, Nginx, and systemd deployment templates

## Technology Stack

### Backend
- **Flask**: Lightweight WSGI web application framework
- **Flask-SocketIO**: Real-time bidirectional communication via WebSockets
- **SQLAlchemy**: Python SQL toolkit and ORM for database operations
- **Flask-CORS**: Cross-Origin Resource Sharing support
- **PyJWT**: JSON Web Token implementation for authentication
- **python-dotenv**: Environment variable management
- **Gunicorn**: WSGI HTTP Server for production deployment
- **Gevent**: Coroutine-based Python networking library
- **gevent-websocket**: WebSocket support for Gevent
- **psutil**: System and process utilities for diagnostics
- **Redis**: Optional message queue for multi-process deployments

### Frontend (Browser Extension)
- **Chrome Extension Manifest V3**: Modern extension architecture
- **Vanilla JavaScript**: No framework dependencies for lightweight operation
- **HTML/CSS**: Extension UI components
- **Sharp**: Node.js image processing library for icon generation

### Database
- **SQLite**: Default embedded database (development)
- **PostgreSQL**: Production database support
- **SQLAlchemy Migrations**: Database schema versioning

## Project Structure

### Full Project Structure

```
ShareTube/                          # Project root (/home/wumbl3wsl/ShareTube/)
├── backend/ShareTube-v1-02/       # Backend application
│   ├── app.py                     # Flask application factory and WSGI entry point
│   ├── config.py                  # Configuration management with environment variables
│   ├── extensions.py              # Flask extensions initialization (SQLAlchemy, SocketIO)
│   ├── models.py                  # Legacy models file (being migrated)
│   ├── models/                    # Database models directory
│   │   ├── __init__.py
│   │   ├── user.py                # User accounts and authentication
│   │   ├── room.py                # Rooms, memberships, and operators
│   │   ├── queue.py               # Video queues and entries
│   │   ├── chat.py                # Chat messages
│   │   ├── audit.py               # Audit logging
│   │   └── youtube_author.py      # YouTube content author information
│   ├── views/                     # API endpoints and Socket.IO handlers
│   │   ├── auth.py                # Google OAuth authentication endpoints
│   │   ├── rooms.py               # Room creation, joining, and management
│   │   ├── player.py              # Player synchronization handlers
│   │   ├── queue.py               # Queue management handlers
│   │   ├── heartbeat.py           # User presence and cleanup
│   │   ├── room_timeouts.py       # Room timeout management
│   │   ├── stats.py               # System statistics endpoints
│   │   └── decorators.py          # View decorators and utilities
│   ├── utils.py                   # Utility functions
│   ├── sockets.py                 # Socket.IO connection utilities
│   ├── migrations.py              # Database migration system
│   ├── requirements.txt           # Python dependencies
│   ├── package.json               # Node.js dependencies (for icon generation)
│   ├── scripts/                   # Utility scripts
│   │   ├── render_icons.js        # Icon generation script
│   │   └── render_attempts.js     # Icon rendering attempts log
│   ├── build-template/            # Production deployment templates
│   │   ├── gunicorn.conf.py       # Gunicorn configuration
│   │   ├── nginx.conf             # Nginx reverse proxy configuration
│   │   └── service.service        # Systemd service file
│   ├── extension/                 # Chrome browser extension
│   │   ├── manifest.json          # Chrome Extension Manifest V3
│   │   ├── background.js          # Service worker for background tasks
│   │   ├── contentScript.js       # Content script injected into YouTube
│   │   ├── popup.html             # Extension popup interface
│   │   ├── popup.js               # Popup functionality
│   │   ├── app/                   # Main extension application
│   │   │   ├── app.js             # Application entry point
│   │   │   ├── state.js           # State management
│   │   │   ├── socket.js          # WebSocket client connection
│   │   │   ├── player.js          # YouTube player integration
│   │   │   ├── virtualplayer.js   # Virtual player controls
│   │   │   ├── components/        # UI components
│   │   │   │   ├── Controls.js    # Playback controls
│   │   │   │   ├── Queue.js       # Queue display
│   │   │   │   ├── QueueItem.js   # Individual queue items
│   │   │   │   ├── UserIcons.js   # User presence indicators
│   │   │   │   └── ...            # Additional components
│   │   ├── models/                # Client-side data models
│   │   │   ├── user.js
│   │   │   └── queueItem.js
│   │   ├── assets/                # Static assets
│   │   ├── styles/                # CSS stylesheets
│   │   └── dep/                   # Dependencies
│   └── icons/                     # Extension icons (generated)
│   ├── RESTART.sh                 # Development restart script
│   ├── README.md                  # User documentation
│   └── DEV-README.md              # Developer documentation
│
├── instance/                      # Runtime files and deployment configs
│   ├── ShareTube-nginx.conf       # Nginx configuration
│   ├── ShareTube-v1-02/           # Version-specific runtime files
│   └── v1-01/                     # Previous version runtime files
│
├── scripts/                       # Project-level scripts
│   └── install_chromium.sh        # Chromium installation for testing
│
├── LAUNCH_EXT-README.md           # Extension launch documentation
├── launch_extension.sh            # Browser extension launcher
├── setup_deploy.py                # Deployment configuration generator
├── sshtunnel.ps1                  # SSH tunneling script (PowerShell)
├── package.json                   # E2E testing dependencies (Playwright)
├── package-lock.json
├── node_modules/                  # E2E testing dependencies
└── test-results/                  # E2E test results
```

## Installation & Setup

### Prerequisites

- Python 3.8+
- Node.js 16+ (for icon generation)
- Google OAuth credentials (for authentication)
- SQLite (default) or PostgreSQL (production)

### Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd /home/wumbl3wsl/ShareTube/backend/ShareTube-v1-02
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Node.js dependencies (for icon generation):**
   ```bash
   npm install
   ```

4. **Configure environment variables:**
   Create a `.env` file in the project root:
   ```bash
   # Flask Configuration
   SECRET_KEY=your-secret-key-here
   JWT_SECRET=your-jwt-secret-here

   # Database Configuration
   DATABASE_URL=sqlite:///instance/v1-01/ShareTube.db

   # Google OAuth Configuration
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret

   # Application Configuration
   BACKEND_BASE_URL=https://your-domain.com
   CORS_ORIGINS=https://your-domain.com,https://www.youtube.com

   # Optional: YouTube Data API
   YOUTUBE_API_KEY=your-youtube-api-key

   # Optional: Redis for multi-process deployments
   SOCKETIO_MESSAGE_QUEUE=redis://localhost:6379/0

   # Development Settings
   DEBUG=true
   TEMPLATES_AUTO_RELOAD=true
   ```

5. **Run database migrations:**
   ```bash
   python -c "from app import create_app; app = create_app(); app.app_context().push(); from migrations import run_all_migrations; run_all_migrations(app)"
   ```

6. **Start the development server:**
   ```bash
   python app.py
   ```

### Browser Extension Setup

1. **Navigate to the extension directory:**
   ```bash
   cd /home/wumbl3wsl/ShareTube/backend/ShareTube-v1-02/extension
   ```

2. **Generate icons:**
   ```bash
   npm run icons
   ```

3. **Load the extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension` directory

### Alternative: Use Project Launch Script

From the project root, you can use the provided launch script:

```bash
cd /home/wumbl3wsl/ShareTube
./launch_extension.sh
```

This script automatically:
- Locates the extension in `backend/ShareTube-v1-02/extension/`
- Launches Chrome/Chromium with persistent profiles
- Loads the extension with proper sandbox settings
- Supports dual-window testing configurations

See `LAUNCH_EXT-README.md` for detailed usage options.

## API Endpoints

### Authentication

- `GET /auth/google/start` - Initiate Google OAuth flow (redirects to Google)
- `GET /auth/google/callback` - OAuth callback handler (exchanges code for JWT token)

### Rooms

- `POST /api/room.create` - Create a new room (requires authentication)
  - Returns room code and initial membership information

### Health Check

- `GET /api/health` - Basic health check endpoint

## WebSocket Events

### Client → Server Events

#### Room Management
- `room.join` - Join a room with authentication token
  - Parameters: `code` (room code), `token` (JWT auth token)
- `room.leave` - Leave current room
- `user.ready` - Mark user as ready for playback coordination
  - Parameters: `ready` (boolean)
- `client.pong` - Heartbeat response to keep user active

#### Player Control
- `room.control.pause` - Pause playback for all users
- `room.control.play` - Start/resume playback for all users
- `room.control.restartvideo` - Restart current video from beginning
- `room.control.seek` - Seek to specific position in current video
  - Parameters: `progress_ms` (target position), `play` (start playing after seek)
- `room.control.skip` - Skip to next video in queue

#### Queue Management
- `queue.add` - Add video to room queue
  - Parameters: `url` (YouTube URL), `title` (optional)
- `queue.remove` - Remove video from queue
  - Parameters: `queue_entry_id`
- `queue.requeue_to_top` - Move queue item to top
  - Parameters: `queue_entry_id`
- `queue.probe` - Check if URL is valid YouTube video
  - Parameters: `url`
- `queue.load-debug-list` - Load debug video list (development only)

### Server → Client Events

#### Room & Presence
- `presence.update` - User presence changes in room
  - Data: `users` (array of user objects), `action` (join/leave/update)
- `room.error` - Room operation errors
  - Data: `error` (error message), `state` (error state)

#### Player Synchronization
- `player.state` - Player state updates
  - Data: `state` (idle/starting/playing/paused), `current_entry`, `progress_ms`, etc.
- `player.sync` - Player synchronization data
  - Data: `trigger`, `code`, `state`, `current_entry`, etc.

#### Queue Updates
- `queue.update` - Queue changes
  - Data: `entries` (queue entries), `current_entry`, `action` (add/remove/reorder)
- `queue.probe_result` - URL probe results
  - Data: `url`, `valid` (boolean), `title`, `duration`, etc.

#### System Events
- `chat.message` - New chat messages
  - Data: `message`, `user`, `timestamp`
- `system.stats` - System diagnostic information (when enabled)
- `client.ping` - Heartbeat ping to check client connectivity

## Configuration

The application is configured via environment variables loaded from a `.env` file. All configuration options are defined in `config.py`.

### Core Configuration

- `SECRET_KEY` - Flask secret key for sessions and CSRF protection
- `JWT_SECRET` - Secret key for signing JWT authentication tokens
- `VERSION` - Application version identifier (default: "v1-01")
- `APP_NAME` - Application name (default: "ShareTube")

### Database Configuration

- `DATABASE_URL` - Database connection string (SQLite default, PostgreSQL supported)
- `SQLALCHEMY_ECHO` - Enable SQL query logging (default: false)

### Authentication & Security

- `GOOGLE_CLIENT_ID` - Google OAuth 2.0 client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth 2.0 client secret
- `ACCESS_TOKEN_EXPIRES_SECONDS` - JWT token expiration time (default: 14 days)
- `BACKEND_BASE_URL` - Public URL where the backend is accessible

### Networking & CORS

- `CORS_ORIGINS` - Comma-separated list of allowed CORS origins
- `SOCKETIO_MESSAGE_QUEUE` - Redis URL for multi-process Socket.IO broadcasting
- `SOCKETIO_ASYNC_MODE` - Socket.IO async mode override (gevent/eventlet)

### YouTube Integration

- `YOUTUBE_API_KEY` - YouTube Data API v3 key for enhanced metadata

### System Settings

- `DEBUG` - Enable Flask debug mode and development features
- `TEMPLATES_AUTO_RELOAD` - Auto-reload Jinja templates on change
- `PONG_TIMEOUT_SECONDS` - User inactivity timeout (default: 20s)
- `HEARTBEAT_INTERVAL_SECONDS` - User cleanup interval (default: 20s)
- `ENABLE_SYSTEM_STATS` - Emit system diagnostics over Socket.IO

## Database

The application uses SQLAlchemy ORM with support for SQLite (default, development) and PostgreSQL (production).

### Schema Management

- Database schema is automatically created on first run via `db.create_all()`
- Custom migrations are handled through the `migrations.py` system
- SQLite-specific optimizations are applied automatically (WAL mode, busy timeout)
- Models are defined in the `models/` directory with proper relationships

### Key Models

- **User**: User accounts with Google OAuth integration
- **Room**: Collaborative watch sessions with configurable permissions
- **RoomMembership**: User participation in rooms with roles (owner/operator/participant)
- **Queue/QueueEntry**: Video queue management with ordering
- **Chat**: Real-time messaging within rooms
- **Audit**: Comprehensive event logging for room activities

## Development

### Application Architecture

The application follows Flask's application factory pattern:

- `app.py`: Main application factory (`create_app()`) and WSGI entry point
- `config.py`: Environment-based configuration management
- `extensions.py`: Flask extension initialization (SQLAlchemy, SocketIO)
- `sockets.py`: Socket.IO connection utilities

### Development Workflow

1. **Environment Setup**: Copy `.env.example` to `.env` and configure
2. **Database Initialization**: Run migrations on first setup
3. **Development Server**: Use `python app.py` for local development
4. **Extension Development**: Load unpacked extension in Chrome for testing

### Development Scripts

- `RESTART.sh`: Restart systemd service with log tailing
- `build-template/`: Production deployment templates

### Testing

The application includes comprehensive error handling and logging. Key testing areas:

- Socket.IO real-time synchronization
- OAuth authentication flow
- Room creation and user management
- Queue operations and player controls
- Cross-browser extension compatibility

## Deployment

### Production Stack

- **Web Server**: Nginx (reverse proxy)
- **WSGI Server**: Gunicorn with Gevent workers
- **Process Manager**: systemd
- **Database**: PostgreSQL (recommended) or SQLite
- **Cache/Queue**: Redis (optional, for multi-process deployments)

### Using Deployment Templates

The project includes automated deployment configuration generation:

#### Deployment Script (`setup_deploy.py`)

Located in the project root, this Python script generates customized deployment files:

```bash
# For local development deployment
python3 setup_deploy.py --this

# For remote server deployment
python3 setup_deploy.py --username=your-server-user --project-path=/path/on/server

# Custom version and port
python3 setup_deploy.py --this --version=v1-02 --port=8000
```

The script generates:

1. **Gunicorn Configuration** (`instance/{version}/deploy/gunicorn.conf.py`):
   - Unix socket communication with Nginx
   - Gevent workers for Socket.IO support
   - Process management and logging

2. **Nginx Configuration** (`instance/{version}/deploy/nginx.conf`):
   - Reverse proxy to Gunicorn socket
   - Static file serving optimization
   - WebSocket passthrough for Socket.IO

3. **Systemd Service** (`instance/{version}/deploy/service.service`):
   - Automatic startup and restart management
   - User permissions and security
   - Log rotation integration

The script also outputs the exact commands to run on your server for deployment.

### Production Deployment Steps

1. **Server Setup**:
   ```bash
   # Install dependencies
   sudo apt update
   sudo apt install nginx postgresql redis-server python3-pip

   # Create application user
   sudo useradd -m -s /bin/bash sharetube
   sudo usermod -aG www-data sharetube
   ```

2. **Database Setup** (PostgreSQL):
   ```bash
   sudo -u postgres createuser sharetube
   sudo -u postgres createdb -O sharetube sharetube
   ```

3. **Application Deployment**:
   ```bash
   # Deploy application code
   sudo -u sharetube git clone <repository> /home/sharetube/app
   cd /home/sharetube/app/backend/ShareTube-v1-02

   # Install dependencies
   sudo -u sharetube pip3 install -r requirements.txt

   # Configure environment
   sudo -u sharetube cp .env.example .env
   # Edit .env with production values
   ```

4. **Generate Deployment Configuration**:
   ```bash
   # Use the deployment script to generate customized configs
   python3 setup_deploy.py --username=sharetube --project-path=/home/sharetube/app

   # The script will output the exact commands to run on the server
   # Example output includes systemd and nginx setup commands
   ```

5. **Service Configuration** (Alternative Manual Method):
   ```bash
   # If not using setup_deploy.py, manually copy and customize:
   sudo cp build-template/service.service /etc/systemd/system/sharetube.service
   sudo systemctl daemon-reload
   sudo systemctl enable sharetube

   # Copy and customize nginx config
   sudo cp build-template/nginx.conf /etc/nginx/sites-available/sharetube
   sudo ln -s /etc/nginx/sites-available/sharetube /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **SSL/TLS Setup** (recommended):
   ```bash
   # Using certbot for Let's Encrypt
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 ShareTube
https://github.com/realwumbl3/ShareTube

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

