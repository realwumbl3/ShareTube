bind = "unix:/home/wumbl3wsl/ShareTube/instance/newapp.sock"
workers = 2
chdir = "/home/wumbl3wsl/ShareTube"
wsgi_app = "backend.app:app"
timeout = 60
umask = 0o007
user = "wumbl3wsl"
group = "www-data"
accesslog = "/home/wumbl3wsl/ShareTube/instance/gunicorn.access.log"
errorlog = "/home/wumbl3wsl/ShareTube/instance/gunicorn.error.log"
loglevel = "info"
capture_output = True
pidfile = "/home/wumbl3wsl/ShareTube/instance/gunicorn.pid"
logfile = "/home/wumbl3wsl/ShareTube/instance/gunicorn.log"


