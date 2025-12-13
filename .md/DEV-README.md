# ShareTube Development Guide

This document provides comprehensive information for developers working on ShareTube, including detailed project structure, development setup, architecture decisions, and contribution guidelines.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Detailed Project Structure](#detailed-project-structure)
- [Development Environment Setup](#development-environment-setup)
- [Database Schema & Models](#database-schema--models)
- [API Design & Socket.IO Events](#api-design--socketio-events)
- [Browser Extension Development](#browser-extension-development)
- [Testing & Debugging](#testing--debugging)
- [Deployment & DevOps](#deployment--devops)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

## Project Overview

ShareTube is a real-time collaborative video watching platform consisting of:

1. **Backend API Server**: Flask-based REST API with Socket.IO for real-time communication
2. **Browser Extension**: Chrome extension that integrates directly with YouTube
3. **Database Layer**: SQLAlchemy ORM with SQLite/PostgreSQL support

### Key Technical Decisions

- **Flask Application Factory**: Modular configuration and testing support
- **Socket.IO**: Real-time bidirectional communication for synchronization
- **Google OAuth**: Secure authentication without storing passwords
- **SQLAlchemy ORM**: Database abstraction with migration support
- **Chrome Extension MV3**: Modern extension architecture with service workers

## Architecture

### Backend Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Flask App     │────│  Socket.IO      │────│  Client Apps    │
│   (REST API)    │    │  (Real-time)    │    │  (Extension)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   SQLAlchemy    │
                    │   (Database)    │
                    └─────────────────┘
```

### Data Flow

1. **Authentication**: Google OAuth → JWT tokens
2. **Room Management**: REST API for room creation
3. **Real-time Sync**: Socket.IO events for player/queue synchronization
4. **Extension Integration**: Content scripts inject UI into YouTube

### State Management

- **Server State**: Room state, user presence, queue management
- **Client State**: Extension manages local YouTube player integration
- **Synchronization**: Server broadcasts state changes to all room members

## Detailed Project Structure

### Full Project Structure

```
ShareTube/                          # Project root (/home/wumbl3wsl/ShareTube/)
├── backend/ShareTube-v1-02/       # Backend application
│   ├── app.py                     # Main application factory & WSGI entry point
│   ├── config.py                  # Environment-based configuration
│   ├── extensions.py              # Flask extensions (db, socketio)
│   ├── models.py                  # Legacy models (being migrated)
│   ├── sockets.py                 # Socket.IO utilities
│   ├── utils.py                   # General utilities
│   ├── migrations.py              # Database migration system
│   ├── requirements.txt           # Python dependencies
│   ├── package.json               # Node.js deps (icon generation)
│   ├── README.md                  # User-facing documentation
│   ├── DEV-README.md              # This file (developer documentation)
│   ├── RESTART.sh                 # Development restart script
│   │
│   ├── models/                    # Database models
│   │   ├── __init__.py
│   │   ├── user.py                # User accounts & OAuth
│   │   ├── room.py                # Rooms, memberships, operators
│   │   ├── queue.py               # Video queues & entries
│   │   ├── chat.py                # Chat messages
│   │   ├── audit.py               # Event logging
│   │   └── youtube_author.py      # Content author info
│   │
│   ├── views/                     # API endpoints & Socket.IO handlers
│   │   ├── __init__.py
│   │   ├── auth.py                # Google OAuth endpoints
│   │   ├── rooms.py               # Room management
│   │   ├── player.py              # Player synchronization
│   │   ├── queue.py               # Queue operations
│   │   ├── heartbeat.py           # User presence monitoring
│   │   ├── decorators.py          # Route decorators & auth
│   │   └── stats.py               # System statistics
│   │
│   ├── extension/                 # Chrome browser extension
│   │   ├── manifest.json          # Extension manifest (MV3)
│   │   ├── background.js          # Service worker
│   │   ├── contentScript.js       # YouTube page injection
│   │   ├── popup.html/js          # Extension popup UI
│   │   ├── app/                   # Extension application code
│   │   │   ├── app.js             # Main extension logic
│   │   │   ├── state.js           # Client-side state management
│   │   │   ├── socket.js          # WebSocket client
│   │   │   ├── player.js          # YouTube player wrapper
│   │   │   ├── virtualplayer.js   # Virtual controls
│   │   │   ├── components/        # UI components
│   │   │   │   ├── Controls.js
│   │   │   │   ├── Queue.js
│   │   │   │   └── UserIcons.js
│   │   │   ├── models/            # Client data models
│   │   │   ├── assets/            # Static assets
│   │   │   ├── styles/            # CSS stylesheets
│   │   │   └── dep/               # Dependencies
│   │   └── icons/                 # Generated extension icons
│   │
│   ├── scripts/                   # Development utilities
│   │   ├── render_icons.js        # Icon generation
│   │   └── render_attempts.js     # Debug logging
│   │
│   ├── build-template/            # Production deployment templates
│   │   ├── gunicorn.conf.py       # WSGI server config
│   │   ├── nginx.conf             # Reverse proxy config
│   │   └── service.service        # Systemd service
│   │
│   └── __pycache__/               # Python bytecode cache
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
├── launch_extension.sh            # Browser extension launcher script
├── setup_deploy.py                # Deployment configuration generator
├── sshtunnel.ps1                  # SSH tunneling script (PowerShell)
├── package.json                   # E2E testing dependencies (Playwright)
├── package-lock.json
├── node_modules/                  # E2E testing dependencies
└── test-results/                  # E2E test results
```

### File Responsibilities

#### Core Application Files

- **`app.py`**: Application factory pattern implementation, route registration, startup logic
- **`config.py`**: Environment variable loading, configuration classes
- **`extensions.py`**: Flask extension initialization (SQLAlchemy, SocketIO, CORS)

#### Models Directory

Each model file contains:
- SQLAlchemy model definitions
- Database relationships
- Business logic methods
- Data serialization methods (`to_dict()`)

#### Views Directory

Each view file handles:
- HTTP route definitions
- Socket.IO event handlers
- Request validation and authentication
- Response formatting

## Development Environment Setup

### Prerequisites

- Python 3.8+
- Node.js 16+ (for extension development)
- Chrome browser (for extension testing)
- Git

### Local Development Setup

1. **Navigate to the Project**:
   ```bash
   cd /home/wumbl3wsl/ShareTube/backend/ShareTube-v1-02
   ```

2. **Python Environment**:
   ```bash
   # Create virtual environment (recommended)
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate

   # Install dependencies
   pip install -r requirements.txt
   ```

3. **Node.js Setup** (for extension):
   ```bash
   npm install
   npm run icons  # Generate extension icons
   ```

4. **Environment Configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Database Setup**:
   ```bash
   # Initialize database
   python -c "from app import create_app; create_app().app_context().push(); from extensions import db; db.create_all()"
   ```

6. **Start Development Server**:
   ```bash
   python app.py
   ```

### Extension Development

1. **Load Extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `backend/ShareTube-v1-02/extension/` directory

2. **Alternative: Use Project Launch Script**:
   ```bash
   cd /home/wumbl3wsl/ShareTube
   ./launch_extension.sh
   ```
   This provides persistent browser profiles and automated extension loading.

3. **Development Workflow**:
   - Make changes to extension files in `backend/ShareTube-v1-02/extension/`
   - Reload extension in Chrome (or restart with launch script)
   - Test on YouTube pages
   - Check console logs for debugging

### Development Scripts

#### Backend Scripts
- **`RESTART.sh`**: Restarts systemd service with log tailing (production-like)
- **`scripts/render_icons.js`**: Generates extension icons using Sharp

#### Project Root Scripts
- **`launch_extension.sh`**: Launches Chrome/Chromium with extension loaded and persistent profiles
- **`setup_deploy.py`**: Generates deployment configuration files from templates (see deployment section)
- **`scripts/install_chromium.sh`**: Installs Chromium for E2E testing

#### Testing Scripts (Project Root)
- **`package.json`**: Contains E2E testing scripts using Playwright
  - `npm run test`: Run tests in headed mode
  - `npm run test:headed`: Run tests with browser visible
  - `npm run browsers:install`: Install test browsers

## Database Schema & Models

### Core Models

#### User Model
```python
class User(db.Model):
    id: int (PK)
    google_sub: str (unique, OAuth identifier)
    email: str (unique)
    name: str
    picture: str (profile image URL)
    last_seen: int (timestamp)
    active: bool
```

#### Room Model
```python
class Room(db.Model):
    id: int (PK)
    code: str (unique room code)
    owner_id: int (FK to User)
    created_at: int (timestamp)
    is_private: bool
    control_mode: str (owner_only/operators/any)
    controller_id: str (current controller)
    ad_sync_mode: str (off/pause_all/trigger_and_pause)
    state: str (idle/starting/playing/paused)
    current_queue_id: int (FK to Queue)
```

#### Queue System
```python
class Queue(db.Model):
    id: int (PK)
    room_id: int (FK to Room)
    created_by_id: int (FK to User)
    created_at: int (timestamp)

class QueueEntry(db.Model):
    id: int (PK)
    queue_id: int (FK to Queue)
    url: str (YouTube URL)
    title: str
    added_by_id: int (FK to User)
    order: int (queue position)
    duration_ms: int
    progress_ms: int
    playing_since_ms: int
```

### Relationships

- **Room ↔ User**: Many-to-many via RoomMembership (with roles)
- **Room → Queue**: One-to-many (historical queues)
- **Room → Queue**: One-to-one (current active queue)
- **Queue → QueueEntry**: One-to-many (ordered entries)
- **User → QueueEntry**: Many-to-one (who added the video)

### Database Operations

- **Automatic Schema Creation**: `db.create_all()` on startup
- **Migrations**: Custom migration system in `migrations.py`
- **SQLite Optimizations**: WAL mode, busy timeout, normal sync
- **Connection Pooling**: SQLAlchemy handles connection management

## API Design & Socket.IO Events

### HTTP API Endpoints

#### Authentication Flow
```
GET  /auth/google/start     → Redirect to Google OAuth
GET  /auth/google/callback  → Handle OAuth callback, return JWT
```

#### Room Management
```
POST /api/room.create       → Create new room, return room code
GET  /api/health           → Health check
```

### Socket.IO Event Flow

#### Connection Lifecycle
1. **Client connects** with JWT token
2. **Server validates** token, associates with user
3. **Client joins room** via `room.join` event
4. **Server manages** presence and synchronization

#### Player Synchronization Protocol

```
Room State Machine:
  idle → starting → playing ↔ paused → idle

Key Events:
- room.control.play    → Transition to playing
- room.control.pause   → Transition to paused
- room.control.seek    → Update progress
- room.control.skip    → Advance to next video
- user.ready           → Coordinate multi-user playback
```

#### Queue Management

```
Add Video Flow:
1. Client: queue.add {url, title}
2. Server: Validate URL, fetch metadata
3. Server: queue.probe_result {valid, title, duration}
4. Server: queue.update {entries, current_entry}
```

### Error Handling

- **Client Errors**: Invalid requests, authentication failures
- **Server Errors**: Database issues, external API failures
- **Network Errors**: Connection drops, timeouts
- **Business Logic**: Room full, invalid operations

## Browser Extension Development

### Extension Architecture

#### Manifest V3 Structure
```json
{
  "manifest_version": 3,
  "permissions": ["storage", "scripting"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": {"service_worker": "background.js"},
  "content_scripts": [{"matches": ["https://www.youtube.com/*"]}],
  "action": {"default_popup": "popup.html"}
}
```

#### Content Script Injection
- Injects into YouTube watch pages
- Communicates with background script
- Manages YouTube player integration
- Renders custom UI overlays

#### Extension Components

- **Background Script**: Service worker for persistent connections
- **Content Script**: YouTube page integration
- **Popup**: Room management and status
- **App Logic**: State management and Socket.IO client

### YouTube Integration

#### Player Control
- **YouTube IFrame API**: Official player control interface
- **State Synchronization**: Mirror server state to local player
- **Event Handling**: Player events trigger Socket.IO updates

#### UI Injection
- **Overlay Components**: Custom controls on YouTube page
- **Queue Display**: Visual queue management
- **User Indicators**: Show room participants
- **Chat Interface**: Real-time messaging

## Testing & Debugging

### Development Testing

#### Manual Testing Checklist
- [ ] OAuth authentication flow
- [ ] Room creation and joining
- [ ] Video queue operations
- [ ] Player synchronization
- [ ] User presence updates
- [ ] Cross-browser compatibility

#### Debug Tools
- **Browser DevTools**: Network, Console, Application tabs
- **Flask Debug Mode**: `DEBUG=true` for detailed error pages
- **Socket.IO Debug**: `engineio_logger=true` in config
- **SQLAlchemy Echo**: `SQLALCHEMY_ECHO=true` for query logging

### Logging

#### Application Logs
- **Structured Logging**: JSON format for production
- **Log Levels**: INFO (normal), WARNING (issues), ERROR (failures)
- **Request Logging**: HTTP requests with timing
- **Audit Logging**: Room events and user actions

#### Log Files
```
instance/v1-01/ShareTube.log      # General application logs
instance/v1-01/ShareTube.error.log # Error logs only
instance/v1-01/ShareTube.access.log # HTTP access logs
```

### Common Issues

#### Database Issues
- **Lock Errors**: SQLite concurrent access → Use WAL mode
- **Migration Failures**: Backup database, manual schema updates
- **Connection Pool**: Monitor connection limits

#### Socket.IO Issues
- **Connection Drops**: Check network, firewall rules
- **Event Loss**: Implement retry logic, sequence numbers
- **Performance**: Monitor event frequency, batch updates

#### Extension Issues
- **Content Script Injection**: Verify manifest matches
- **CORS Errors**: Check extension permissions
- **YouTube API Changes**: Monitor for YouTube updates

## Deployment & DevOps

### Development Deployment

#### Local Production-like Setup
```bash
# Use RESTART.sh for systemd-like restart
./RESTART.sh

# Monitor logs
tail -f instance/v1-01/ShareTube.error.log
```

### Production Deployment

#### Infrastructure Requirements
- **Web Server**: Nginx for static files and reverse proxy
- **Application Server**: Gunicorn with Gevent workers
- **Process Manager**: systemd for service management
- **Database**: PostgreSQL for production
- **Cache/Queue**: Redis for multi-process deployments

#### Deployment Configuration Generation

The `setup_deploy.py` script in the project root automates deployment configuration:

**Usage Examples:**
```bash
# For development/local deployment
python3 setup_deploy.py --this

# For production server deployment
python3 setup_deploy.py --username=deploy --project-path=/home/deploy/ShareTube

# Custom version and port
python3 setup_deploy.py --this --version=v1-02 --port=8000
```

**What it generates:**
- **Gunicorn config**: `instance/{version}/deploy/gunicorn.conf.py`
- **Nginx config**: `instance/{version}/deploy/nginx.conf`
- **Systemd service**: `instance/{version}/deploy/service.service`

**Template Variables:**
- `&USERNAME`: Target server username
- `&PROJECT_ROOT`: Absolute path to project on server
- `&VERSION`: Application version (e.g., v1-02)
- `&APP_NAME`: Application name (ShareTube)
- `&LISTEN_PORT`: Optional port override

The script outputs exact commands to run on your server for complete deployment.

#### Configuration Files

**Gunicorn Config** (`build-template/gunicorn.conf.py`):
```python
bind = "unix:/path/to/socket"
workers = 2  # Socket.IO prefers few workers
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
```

**Nginx Config** (`build-template/nginx.conf`):
```nginx
upstream app {
    server unix:/path/to/socket;
}
server {
    listen 80;
    location /socket.io/ {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### Monitoring & Maintenance

- **Health Checks**: `/api/health` endpoint
- **Log Rotation**: systemd journald or logrotate
- **Backup Strategy**: Database dumps, configuration backup
- **Update Process**: Blue-green deployment, rollback plan

## Contributing

### Code Style

- **Python**: PEP 8, type hints, docstrings
- **JavaScript**: ESLint configuration, modern ES6+
- **Documentation**: Clear comments, README updates

### Pull Request Process

1. **Branch**: `feature/name` or `fix/issue-description`
2. **Tests**: Manual testing, no regressions
3. **Documentation**: Update relevant docs
4. **Review**: Code review, security check

### Commit Messages

```
feat: add new player synchronization feature
fix: resolve Socket.IO connection timeout
docs: update API documentation
refactor: simplify queue management logic
```

## Troubleshooting

### Common Development Issues

#### Flask App Won't Start
```bash
# Check Python path
python -c "import flask; print(flask.__version__)"

# Check configuration
python -c "from config import Config; print(Config.SQLALCHEMY_DATABASE_URI)"

# Check database file permissions
ls -la instance/v1-01/ShareTube.db
```

#### Socket.IO Connection Issues
```bash
# Check CORS configuration
curl -H "Origin: https://www.youtube.com" -v http://localhost:5000/api/health

# Check Socket.IO logs
# Set SOCKETIO_ENGINEIO_LOGGER=true in config
```

#### Extension Not Loading
```bash
# Check manifest syntax
python -c "import json; json.load(open('extension/manifest.json'))"

# Check console for errors
# Open extension popup, check DevTools
```

#### Database Connection Issues
```bash
# Test database connection
python -c "from app import create_app; app = create_app(); app.app_context().push(); from extensions import db; db.engine.execute('SELECT 1')"

# Check SQLite file
file instance/v1-01/ShareTube.db
```

### Performance Issues

#### Memory Usage
- Monitor with `psutil` (built-in)
- Check for connection leaks
- Profile with `memory_profiler`

#### CPU Usage
- Socket.IO event frequency
- Database query optimization
- Background task management

#### Network Issues
- WebSocket connection limits
- Message size and frequency
- CDN for static assets

### Getting Help

1. **Check Logs**: Application and system logs
2. **Reproduce**: Minimal test case
3. **Environment**: Python/Node versions, OS details
4. **Code Review**: Recent changes that might affect the issue

---

This document is maintained alongside the codebase. Please update it when making significant changes to the architecture or development process.
