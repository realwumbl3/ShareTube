# Bind Gunicorn to a Unix domain socket for local Nginx proxying
bind = "unix:&PROJECT_ROOT/instance/&VERSION/&APP_NAME.sock"
# Number of worker processes (SocketIO prefers 1 unless using a message queue)
workers = 2
# Time to gracefully stop workers on restart/shutdown
graceful_timeout = 5
# Use Gevent WebSocket worker to support Flask-SocketIO
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
# Change working directory to the project root before loading app
chdir = "&PROJECT_ROOT"

# Add the backend version directory to Python path to handle dashes in directory name
pythonpath = "&PROJECT_ROOT/backend/&VERSION"
# WSGI app module path for Gunicorn to load
wsgi_app = "server:app"

# Kill and restart workers that block beyond this many seconds
timeout = 120
# File creation mask for logs and socket to be group-readable/writable
umask = 0o007
# User account under which Gunicorn workers should run
user = "&USERNAME"
# Group under which Gunicorn workers should run (matches web server group)
group = "www-data"
# Access log file path
accesslog = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.access.log"
# Error log file path
errorlog = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.log"
# Logging level for Gunicorn
loglevel = "debug"
# Capture stdout/stderr of workers into Gunicorn logs
capture_output = True
# PID file to manage the Gunicorn process
pidfile = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.pid"
# Additional log file (legacy compatibility)
logfile = "&PROJECT_ROOT/instance/&VERSION/&APP_NAME.log"
# Enable reload on code changes for development
reload = True
