## ShareTube-v1-03 runtime diagram (two-pool)

```text
                          ┌───────────────────────────────────────┐
                          │               Nginx                   │
                          │  listens :5077                        │
                          │  proxies websocket + http             │
                          └───────────────────┬───────────────────┘
                                              │ unix socket
                                              ▼
                          ┌───────────────────────────────────────┐
                          │   Interactive Gunicorn pool           │
                          │   systemd: ShareTube.<V>.service      │
                          │   workers: WEB_WORKERS (e.g. 6)       │
                          │   BACKGROUND_TASK_SLOTS=0             │
                          │   handles: rooms/playback/socketio    │
                          └───────────────────┬───────────────────┘
                                              │ shared infra
                                              │ (DB + Redis)
                                              ▼
                          ┌───────────────────────────────────────┐
                          │   Background Gunicorn pool            │
                          │   systemd: ShareTube.<V>.bg.service   │
                          │   workers: BG_WORKERS (e.g. 2)        │
                          │   BACKGROUND_TASK_SLOTS=2             │
                          │   runs: heartbeat + future jobs       │
                          └───────────────────────────────────────┘

  Control plane:
    ShareTube.<V>.target  -> Wants both services
    restart command       -> systemctl restart ShareTube.<V>.target
```


