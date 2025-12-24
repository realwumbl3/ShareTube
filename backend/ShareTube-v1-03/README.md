# ShareTube v1-03

**ShareTube** is a real-time synchronized video watching platform that allows multiple users to watch YouTube videos together with perfectly synchronized playback controls. Users can create rooms, add videos to shared queues, and enjoy synchronized watching experiences with friends and family.

## Architecture Overview

ShareTube consists of three main components:

### 1. Chrome Extension (MV3)
A browser extension that integrates directly with YouTube's interface, providing synchronized playback controls and queue management overlay.

### 2. Python Flask Backend
A real-time web server using Flask + Socket.IO for WebSocket communication, handling room coordination, user management, and playback synchronization.

### 3. Web UI Portals
Multiple web interfaces including a dashboard for administrators, a public homepage, and a mobile remote control interface.

## Key Features

- **Real-time Synchronization**: Perfectly synchronized video playback across all participants
- **Shared Queues**: Collaborative video queues with drag-and-drop reordering
- **Room Management**: Create private or public rooms with customizable control permissions
- **Multi-device Support**: Watch on desktop, mobile, or any device with a browser
- **Operator Controls**: Room owners and operators can control playback for all participants
- **Ad Synchronization**: Configurable ad sync policies (pause all, operators only, etc.)
- **Chat System**: Real-time chat within rooms
- **Mobile Remote**: Dedicated mobile interface for remote control
- **Admin Dashboard**: Comprehensive admin interface for monitoring and management

## Technology Stack

### Backend
- **Python 3.8+** with **Flask** web framework
- **Flask-SocketIO** for real-time WebSocket communication
- **SQLAlchemy** ORM with SQLite database
- **Gunicorn** WSGI server with gevent workers
- **Redis** for optional message queue clustering
- **JWT** authentication with Google OAuth support

### Frontend
- **Vanilla JavaScript** with custom **Zyx** reactive framework
- **Socket.IO** client for real-time communication
- **CSS3** with custom styling
- **QRCode.js** for mobile remote sharing

### Chrome Extension
- **Manifest V3** compliant
- **Content scripts** for YouTube integration
- **Background service worker**
- **Extension popup** for room management

## Project Structure

```
ShareTube-v1-03/
├── extension/                    # Chrome extension (MV3)
│   ├── appshell/                # Main extension UI
│   │   ├── core/                # Core managers and state
│   │   ├── feature/             # YouTube player integration
│   │   └── ui/                  # Extension UI components
│   ├── popup/                   # Extension popup interface
│   ├── runtime/                 # Background and content scripts
│   └── shared/                  # Shared assets and dependencies
├── server/                      # Python Flask backend
│   ├── models/                  # Database models
│   │   ├── auth/               # User authentication models
│   │   ├── room/               # Room and queue models
│   │   └── meta/               # Audit and metadata models
│   ├── views/                   # API endpoints and WebSocket handlers
│   │   ├── api/                # REST API endpoints
│   │   └── ws/                 # WebSocket message handlers
│   ├── lib/                    # Utility libraries
│   └── config.py               # Application configuration
├── ui_portals/                 # Web UI applications
│   ├── dashboard/              # Admin dashboard
│   ├── homepage/               # Public landing page
│   └── mobile_remote/          # Mobile remote control
├── tooling/                    # Build and deployment tools
│   ├── build/                  # Deployment templates
│   └── scripts/                # Build scripts
└── requirements.txt            # Python dependencies
```

## Database Models

### Core Entities
- **User**: User accounts with Google OAuth integration
- **Room**: Watch rooms with configurable permissions and settings
- **Queue**: Ordered lists of videos for synchronized playback
- **QueueEntry**: Individual video entries with metadata
- **RoomMembership**: User participation in rooms
- **ChatMessage**: Real-time chat messages
- **RoomAudit**: Activity logging and audit trails

### Room Features
- **Control Modes**: `owner_only`, `operators`, `any`
- **Ad Sync Policies**: `off`, `pause_all`, `operators_only`, `starting_only`
- **Playback States**: `idle`, `starting`, `playing`, `paused`, `midroll`
- **Auto-advance**: Automatic progression to next video

## Deployment Architecture

ShareTube uses a **two-pool Gunicorn deployment** to separate interactive and background workloads:

### Interactive Pool
- **Service**: `ShareTube.<VERSION>.service`
- **Purpose**: Handles HTTP requests and WebSocket connections
- **Workers**: Configurable via `WEB_WORKERS` environment variable
- **Background Tasks**: Disabled (`BACKGROUND_TASK_SLOTS=0`)

### Background Pool
- **Service**: `ShareTube.<VERSION>.bg.service`
- **Purpose**: Runs periodic cleanup and maintenance tasks
- **Workers**: Configurable via `BG_WORKERS` environment variable
- **Background Tasks**: Enabled (`BACKGROUND_TASK_SLOTS=2`)

### Control Plane
- **Target**: `ShareTube.<VERSION>.target`
- **Purpose**: Manages both pools as a single unit
- **Restart Command**: `systemctl restart ShareTube.<VERSION>.target`

## Configuration

ShareTube supports extensive configuration via environment variables:

### Core Settings
- `SECRET_KEY`: Flask application secret key
- `VERSION`: Application version identifier
- `APP_NAME`: Application name (default: "ShareTube")

### Database
- `DATABASE_URL`: SQLAlchemy database URL (defaults to SQLite)
- `SQLALCHEMY_ECHO`: Enable SQL debugging (default: false)

### Authentication
- `JWT_SECRET`: JWT signing secret
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `ACCESS_TOKEN_EXPIRES_SECONDS`: JWT token expiry (default: 14 days)

### Networking
- `BACKEND_BASE_URL`: Public backend URL for OAuth redirects
- `CORS_ORIGINS`: Allowed CORS origins (default: "*")
- `SOCKETIO_MESSAGE_QUEUE`: Redis URL for multi-process message queue
- `SOCKETIO_ASYNC_MODE`: Socket.IO async mode (default: gevent)

### Real-time Features
- `PONG_TIMEOUT_SECONDS`: User health check timeout (default: 20)
- `HEARTBEAT_INTERVAL_SECONDS`: Cleanup interval (default: 20)
- `PLAYBACK_START_BUFFER_MS`: Playback start buffer (default: 200)

### Background Tasks
- `BACKGROUND_TASK_SLOTS`: Number of background worker slots (default: 2)
- `BACKGROUND_TASK_LOCK_DIR`: Lock file directory
- `BACKGROUND_TASK_LEASE_SECONDS`: Redis lease duration (default: 60)

### Development
- `DEBUG`: Enable Flask debug mode
- `TEMPLATES_AUTO_RELOAD`: Enable template auto-reload
- `LOG_LEVEL`: Logging level (default: INFO)
- `ENABLE_SYSTEM_STATS`: Enable system statistics emission

## Setup and Development

### Prerequisites
- Python 3.8+
- Node.js 16+
- Chrome browser for extension testing
- Redis (optional, for multi-process deployments)

### Installation

1. **Clone and navigate to the project**:
   ```bash
   cd /home/wumbl3wsl/ShareTube/backend/ShareTube-v1-03
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

4. **Set up environment variables**:
   ```bash
   # Create .env file with required configuration
   cp .env.example .env  # If example exists, otherwise create manually
   ```

### Running Locally

ShareTube is designed to run with the restart script that manages the two-pool architecture:

```bash
./RESTART.sh
```

This script:
- Stops existing services
- Truncates log files
- Starts both Gunicorn pools
- Follows logs in real-time

### Development Mode

For local development with auto-reload:

```bash
export DEBUG=true
export TEMPLATES_AUTO_RELOAD=true
export LOG_LEVEL=DEBUG
./RESTART.sh
```

## Chrome Extension Setup

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `extension/` directory from the project root

### Extension Features

- **Content Script**: Integrates with YouTube pages
- **Popup Interface**: Room management and controls
- **Background Service**: Handles extension lifecycle
- **Web Accessible Resources**: Shared assets for content scripts

## API Reference

### REST Endpoints

#### Authentication
- `GET /api/health` - Health check endpoint
- `POST /auth/google` - Google OAuth initiation
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/me` - Current user info
- `POST /auth/logout` - User logout

#### Statistics
- `GET /api/stats` - System statistics

### WebSocket Events

#### Room Management
- `join` - Join a room
- `leave` - Leave a room
- `room.settings` - Update room settings
- `room.sync` - Synchronize room state

#### Playback Control
- `play` - Start playback
- `pause` - Pause playback
- `seek` - Seek to position
- `skip` - Skip to next video
- `restart` - Restart current video

#### Queue Management
- `queue.add` - Add video to queue
- `queue.remove` - Remove video from queue
- `queue.move` - Reorder queue items
- `queue.load` - Load queue state

#### Chat
- `chat.send` - Send chat message
- `chat.history` - Request chat history

## UI Portals

### Dashboard (`/dashboard`)
Administrative interface for monitoring:
- Active rooms and users
- System statistics
- Queue management
- User activity feeds

### Homepage (`/`)
Public landing page featuring:
- Service introduction
- Feature highlights
- Getting started guide

### Mobile Remote (`/mobile-remote`)
Mobile-optimized interface for:
- Remote playback control
- Queue browsing
- Room management on mobile devices

## Deployment

### Production Setup

ShareTube includes automated deployment tooling:

1. **Generate deployment files**:
   ```bash
   sudo python3 .root/setup_deploy.py --this --version ShareTube-v1-03 --output-dir instance
   ```

2. **Configure systemd services**:
   - Interactive pool: `ShareTube.v1-03.service`
   - Background pool: `ShareTube.v1-03.bg.service`
   - Control target: `ShareTube.v1-03.target`

3. **Configure Nginx** (example configuration provided in `tooling/build/nginx.conf`)

4. **Start services**:
   ```bash
   sudo systemctl start ShareTube.v1-03.target
   ```

### Docker Support

ShareTube can be containerized for deployment. The application is designed to work with:
- Gunicorn as WSGI server
- Redis for optional message queuing
- SQLite or external databases

### Scaling Considerations

- **Horizontal Scaling**: Use Redis message queue for multi-server deployments
- **Database**: Consider PostgreSQL for production workloads
- **Load Balancing**: Nginx handles load balancing across Gunicorn workers
- **Background Tasks**: Scale background pool workers based on cleanup frequency needs

## Contributing

### Development Workflow

1. **Code Style**: Follow existing patterns and use type hints
2. **Testing**: Test extension in Chrome developer mode
3. **Database**: Changes require migration scripts in `server/migrations.py`
4. **Documentation**: Update this README for significant changes

### Extension Development

- Use MV3 APIs only (no deprecated APIs)
- Test content scripts on various YouTube layouts
- Ensure popup works across different screen sizes
- Follow Chrome extension security best practices

### Backend Development

- Use SQLAlchemy ORM for database operations
- Implement WebSocket handlers in `server/views/ws/`
- Add REST endpoints in `server/views/api/`
- Update models in `server/models/` with proper relationships

## Troubleshooting

### Common Issues

**Extension not loading**: Ensure MV3 manifest is valid and all required permissions are granted

**WebSocket connection fails**: Check CORS settings and Socket.IO configuration

**Database errors**: Verify SQLite file permissions and WAL mode configuration

**Background tasks not running**: Check `BACKGROUND_TASK_SLOTS` configuration and slot claiming logic

### Logs

Application logs are written to:
- Interactive pool: `instance/ShareTube-v1-03/ShareTube.log`
- Background pool: `instance/ShareTube-v1-03/ShareTube.bg.log`

Use `./RESTART.sh` to view logs in real-time during development.

## License

[Specify license here]

## Support

For support and questions:
- Check the logs for error messages
- Review configuration settings
- Test in Chrome developer tools
- Check WebSocket connection status

---

**ShareTube v1-03** - Watch together, anywhere.


