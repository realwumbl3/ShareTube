# ShareTube-v1-03 Project Map
```
ShareTube-v1-03/
├── extension
│   ├── appshell
│   │   ├── core
│   │   │   ├── managers
│   │   │   │   ├── auth.js
│   │   │   │   ├── room.js
│   │   │   │   ├── socket.js
│   │   │   │   ├── storage.js
│   │   │   │   ├── ui.js
│   │   │   │   └── virtualPlayer.js
│   │   │   ├── models
│   │   │   │   ├── queueItem.js
│   │   │   │   └── user.js
│   │   │   ├── state
│   │   │   │   ├── getters.js
│   │   │   │   └── state.js
│   │   │   └── utils
│   │   │       └── utils.js
│   │   ├── feature
│   │   │   └── youtubePlayer
│   │   │       ├── components
│   │   │       │   ├── ContinueNextOverlay.js
│   │   │       │   └── Splash.js
│   │   │       ├── addToST.js
│   │   │       ├── controls.js
│   │   │       ├── extender.js
│   │   │       ├── manager.js
│   │   │       ├── osdDebug.js
│   │   │       └── syncer.js
│   │   ├── ui
│   │   │   └── components
│   │   │       ├── Controls.js
│   │   │       ├── DebugMenu.js
│   │   │       ├── Intermission.js
│   │   │       ├── Logo.js
│   │   │       ├── PlaybackControls.js
│   │   │       ├── QRCode.js
│   │   │       ├── Queue.js
│   │   │       ├── QueueDragging.js
│   │   │       ├── QueueEntry.js
│   │   │       ├── SearchBox.js
│   │   │       ├── ShareTubePill.js
│   │   │       └── UserIcons.js
│   │   └── app.js
│   ├── popup
│   │   ├── ui.html
│   │   └── ui.js
│   ├── runtime
│   │   ├── background.js
│   │   └── contentScript.js
│   ├── shared
│   │   ├── assets
│   │   │   ├── icons
│   │   │   │   └── icon.svg
│   │   │   │   └── icon-16.png
│   │   │   │   └── icon-32.png
│   │   │   │   └── icon-48.png
│   │   │   │   └── icon-128.png
│   │   │   └── *.svg
│   │   ├── css
│   │   │   └── **.css
│   │   └── dep
│   │       ├── qrcode.esm.js
│   │       ├── socket.io.min.esm.js
│   │       └── zyx.js
│   └── manifest.json
├── server
│   ├── lib
│   │   ├── migrations.py
│   │   ├── utils.py
│   │   └── websocket_patch.py
│   ├── models
│   │   ├── auth
│   │   │   ├── __init__.py
│   │   │   ├── membership.py
│   │   │   ├── user.py
│   │   │   └── youtube_author.py
│   │   ├── meta
│   │   │   ├── __init__.py
│   │   │   └── audit.py
│   │   ├── room
│   │   │   ├── __init__.py
│   │   │   ├── chat.py
│   │   │   ├── queue.py
│   │   │   ├── queue_entry.py
│   │   │   └── room.py
│   │   └── __init__.py
│   ├── views
│   │   ├── api
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   └── stats.py
│   │   ├── ws
│   │   │   ├── player
│   │   │   │   ├── __init__.py
│   │   │   │   ├── pause.py
│   │   │   │   ├── play.py
│   │   │   │   ├── restartvideo.py
│   │   │   │   ├── seek.py
│   │   │   │   └── skip.py
│   │   │   ├── queue
│   │   │   │   ├── __init__.py
│   │   │   │   ├── add.py
│   │   │   │   ├── common.py
│   │   │   │   ├── continue_next.py
│   │   │   │   ├── load_debug_list.py
│   │   │   │   ├── move.py
│   │   │   │   ├── probe.py
│   │   │   │   ├── remove.py
│   │   │   │   └── requeue_to_top.py
│   │   │   ├── rooms
│   │   │   │   ├── __init__.py
│   │   │   │   ├── client_pong.py
│   │   │   │   ├── client_verification.py
│   │   │   │   ├── common.py
│   │   │   │   ├── disconnect.py
│   │   │   │   ├── heartbeat.py
│   │   │   │   ├── join.py
│   │   │   │   ├── leave.py
│   │   │   │   ├── room_timeouts.py
│   │   │   │   ├── settings_autoadvance.py
│   │   │   │   ├── time_sync.py
│   │   │   │   └── user_ready.py
│   │   │   └── __init__.py
│   │   ├── __init__.py
│   │   └── middleware.py
│   ├── ws
│   │   └── server.py
│   ├── __init__.py
│   ├── config.py
│   └── extensions.py
├── tooling
│   ├── build
│   │   ├── gunicorn.conf.py
│   │   ├── nginx.conf
│   │   └── service.service
│   └── scripts
│       ├── render_attempts.js
│       └── render_icons.js
├── ui_portals
│   ├── dashboard
│   │   ├── backend
│   │   │   └── __init__.py
│   │   ├── frontend
│   │   │   ├── static
│   │   │   │   ├── @css
│   │   │   │   │   └── styles.css
│   │   │   │   └── js
│   │   │   │       ├── components
│   │   │   │       │   ├── ActivityFeed.js
│   │   │   │       │   ├── DashboardApp.js
│   │   │   │       │   ├── DebugTab.js
│   │   │   │       │   ├── LoginComponent.js
│   │   │   │       │   ├── QueueTable.js
│   │   │   │       │   ├── RoomTable.js
│   │   │   │       │   ├── StatsCard.js
│   │   │   │       │   ├── StatsGrid.js
│   │   │   │       │   └── UserTable.js
│   │   │   │       ├── models
│   │   │   │       │   ├── Activity.js
│   │   │   │       │   ├── AuthManager.js
│   │   │   │       │   ├── Queue.js
│   │   │   │       │   ├── Room.js
│   │   │   │       │   └── User.js
│   │   │   │       └── main.js
│   │   │   └── templates
│   │   │       ├── dashboard.html
│   │   │       └── dashboard_entry.html
│   │   ├── __init__.py
│   │   ├── analytics.py
│   │   ├── data.py
│   │   └── jsconfig.json
│   ├── homepage
│   │   ├── backend
│   │   │   └── __init__.py
│   │   ├── frontend
│   │   │   ├── static
│   │   │   │   ├── @css
│   │   │   │   │   └── styles.css
│   │   │   │   └── js
│   │   │   │       ├── components
│   │   │   │       │   ├── AboutSection.js
│   │   │   │       │   ├── FeaturesSection.js
│   │   │   │       │   ├── HeroSection.js
│   │   │   │       │   └── HomepageApp.js
│   │   │   │       └── main.js
│   │   │   └── templates
│   │   │       └── homepage.html
│   │   ├── __init__.py
│   │   └── jsconfig.json
│   ├── mobile_remote
│   │   ├── backend
│   │   │   └── __init__.py
│   │   ├── frontend
│   │   │   ├── static
│   │   │   │   ├── @css
│   │   │   │   │   └── styles.css
│   │   │   │   └── js
│   │   │   │       ├── components
│   │   │   │       │   ├── MobileRemoteApp.js
│   │   │   │       │   ├── PlaybackControls.js
│   │   │   │       │   ├── QueueList.js
│   │   │   │       │   └── utils.js
│   │   │   │       └── main.js
│   │   │   └── templates
│   │   │       └── mobile-remote.html
│   │   ├── __init__.py
│   │   └── jsconfig.json
│   └── __init__.py
├── .env
├── RESTART.sh
├── jsconfig.json
├── package-lock.json
├── package.json
└── requirements.txt
```

## Excluded Directories

-   `.instance/` - Runtime instance data
-   `.extension/` - Extension symlinks

## Directory Structure Overview

### Root Level

-   **`.cursor/`** - Cursor IDE configuration and rules
-   **`.tests/`** - Playwright test files and configurations
-   **`.vscode/`** - VS Code configuration files
-   **`extension/`** - Chrome extension source code (MV3)
-   **`server/`** - Python Flask backend server
-   **`tooling/`** - Build and deployment scripts
-   **`ui_portals/`** - Web UI portals (dashboard, homepage, mobile_remote)

### Extension (`extension/`)

-   **`appshell/`** - Main extension application shell
    -   `core/` - Core managers, models, state, and utilities
    -   `feature/youtubePlayer/` - YouTube player integration
    -   `ui/components/` - UI components
-   **`popup/`** - Extension popup UI
-   **`runtime/`** - Background and content scripts
-   **`shared/`** - Shared assets, CSS, components, and dependencies

### Server (`server/`)

-   **`models/`** - Database models (auth, meta, room)
-   **`views/`** - API endpoints and WebSocket handlers
    -   `api/` - REST API endpoints
    -   `ws/` - WebSocket message handlers (player, queue, rooms)
-   **`lib/`** - Utility libraries and patches
-   **`ws/`** - WebSocket server implementation

### UI Portals (`ui_portals/`)

Each portal follows a similar structure:

-   **`backend/`** - Python backend for the portal
-   **`frontend/`** - Frontend static files and templates
    -   `static/@css/` - Stylesheets
    -   `static/js/` - JavaScript components and models
    -   `templates/` - HTML templates
