## ShareTube backend (ShareTube-v1-03)

This directory is the **working backend version**: `backend/ShareTube-v1-03/`.

### Two-pool worker model (recommended)

To keep long-running background loops from competing with interactive socket traffic, we deploy **two Gunicorn pools**:

- **Interactive pool** (`ShareTube.<VERSION>.service`)
  - Serves HTTP + Socket.IO traffic (rooms, playback, etc.)
  - Background loops disabled via `BACKGROUND_TASK_SLOTS=0`
- **Background pool** (`ShareTube.<VERSION>.bg.service`)
  - Runs background tasks (heartbeat cleanup today; more later)
  - Background loops enabled via `BACKGROUND_TASK_SLOTS=2`
- **Target** (`ShareTube.<VERSION>.target`)
  - Lets you restart both pools with one command:
    - `systemctl restart ShareTube.<VERSION>.target`

### Background slot claiming (how we avoid duplicate loops)

Every worker loads the app, but only workers that **claim a slot** may start background loops.

- Slot claiming code lives in `server/lib/background_slots.py`
- Heartbeat uses a **single slot** explicitly:
  - `claim_background_slot(..., task="heartbeat", slots=1)`

### Deployment file generation

**Do not edit** generated deploy files in `.instance/deploy/`.

Instead, generate deploy files from templates in `tooling/build/`:

- Templates:
  - `tooling/build/service.service`
  - `tooling/build/service.bg.service`
  - `tooling/build/service.target`
  - `tooling/build/gunicorn.conf.py`
  - `tooling/build/gunicorn.bg.conf.py`
  - `tooling/build/nginx.conf`

- Generator:
  - `.root/setup_deploy.py`

Example:

```bash
sudo python3 .root/setup_deploy.py --this --version ShareTube-v1-03 --output-dir instance
```

### Restart

Use `RESTART.sh` to restart the whole stack (interactive + background) and follow logs:

```bash
./RESTART.sh
```


