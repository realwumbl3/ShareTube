# Bind Gunicorn to a Unix domain socket for local Nginx proxying
bind = "unix:/home/wumbl3wsl/ShareTube/instance/newapp.sock"
# Number of worker processes (SocketIO prefers 1 unless using a message queue)
workers = 1
# Time to gracefully stop workers on restart/shutdown
graceful_timeout = 5
# Use Gevent WebSocket worker to support Flask-SocketIO
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
# Change working directory to the project root before loading app
chdir = "/home/wumbl3wsl/ShareTube"
# WSGI app module path for Gunicorn to load
wsgi_app = "backend.app:app"
# Kill and restart workers that block beyond this many seconds
timeout = 120
# File creation mask for logs and socket to be group-readable/writable
umask = 0o007
# User account under which Gunicorn workers should run
user = "wumbl3wsl"
# Group under which Gunicorn workers should run (matches web server group)
group = "www-data"
# Access log file path
accesslog = "/home/wumbl3wsl/ShareTube/instance/gunicorn.access.log"
# Error log file path
errorlog = "/home/wumbl3wsl/ShareTube/instance/gunicorn.error.log"
# Logging level for Gunicorn
loglevel = "debug"
# Capture stdout/stderr of workers into Gunicorn logs
capture_output = True
# PID file to manage the Gunicorn process
pidfile = "/home/wumbl3wsl/ShareTube/instance/gunicorn.pid"
# Additional log file (legacy compatibility)
logfile = "/home/wumbl3wsl/ShareTube/instance/gunicorn.log"


