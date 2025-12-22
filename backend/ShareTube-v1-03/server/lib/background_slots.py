"""
Background slot claiming for multi-worker deployments.

Problem:
- In a multi-worker Gunicorn deployment, every worker imports the app and runs init code.
- Some tasks (heartbeat cleanup, future long-running loops) must only run in a subset of workers.

Solution:
- Workers "claim" one of N background slots at startup.
- Only workers that successfully claim a slot should start background tasks.

This avoids needing stable "worker #1/#2" identity; we enforce the *count* of workers that run
background loops instead.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from flask import Flask

from ..config import Config

_claims: dict[str, Optional[str]] = {}
_fds: dict[str, object] = {}


def _default_lock_dir(app: Flask) -> Path:
    configured = (app.config.get("BACKGROUND_TASK_LOCK_DIR") or "").strip()
    if configured:
        base = Path(configured)
        # Keep lockfiles tidy by always placing them under a dedicated subfolder.
        # If the user already points directly at a lock folder, don't nest again.
        return base if base.name in ("lock", "locks") else (base / "locks")

    version = app.config.get("VERSION", getattr(Config, "VERSION", "v1-01"))
    base = Path(getattr(Config, "_ROOT", ".")) / "instance" / str(version)
    return base / "locks"


def claim_background_slot(
    app: Flask, *, task: str = "background", slots: Optional[int] = None
) -> Optional[str]:
    """
    Try to claim one of N background slots.

    Returns a string describing the claim (e.g. "file:/path/lock" or "redis:key") if successful,
    otherwise returns None.

    Backend preference:
    - Local file locks (single host; lock auto-releases when the worker exits)
    - Redis lease (multi-host capable) when Redis is configured/available
    """
    global _claims, _fds

    if task in _claims:
        return _claims[task]

    nslots = int(slots if slots is not None else app.config.get("BACKGROUND_TASK_SLOTS", 2))
    nslots = max(0, nslots)
    if nslots == 0:
        _claims[task] = None
        return None

    # 1) File-lock claim (best when running on a single host).
    try:
        import fcntl

        lock_dir = _default_lock_dir(app)
        lock_dir.mkdir(parents=True, exist_ok=True)
        version = app.config.get("VERSION", getattr(Config, "VERSION", "v1-01"))
        app_name = app.config.get("APP_NAME", getattr(Config, "APP_NAME", "ShareTube"))

        for i in range(1, nslots + 1):
            lock_path = lock_dir / f"{app_name}.{version}.{task}.bgslot.{i}.lock"
            fd = open(lock_path, "a+", encoding="utf-8")
            try:
                fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                fd.close()
                continue

            # Keep fd open for process lifetime to retain the lock.
            try:
                fd.seek(0)
                fd.truncate()
                fd.write(f"pid={os.getpid()} task={task}\n")
                fd.flush()
            except Exception:
                pass

            _fds[task] = fd
            _claims[task] = f"file:{lock_path}"
            return _claims[task]
    except Exception:
        # If fcntl isn't available or the filesystem isn't usable, fall through to Redis.
        pass

    # 2) Redis lease claim (works across hosts, but requires Redis availability).
    try:
        with app.app_context():
            from .utils import get_redis_client

            r = get_redis_client()
        if not r:
            _claims[task] = None
            return None

        lease = int(app.config.get("BACKGROUND_TASK_LEASE_SECONDS", 60))
        lease = max(5, lease)
        version = app.config.get("VERSION", getattr(Config, "VERSION", "v1-01"))
        app_name = app.config.get("APP_NAME", getattr(Config, "APP_NAME", "ShareTube"))
        pid = str(os.getpid())

        for i in range(1, nslots + 1):
            key = f"sharetube:{version}:{app_name}:{task}:bgslot:{i}"
            if r.set(key, pid, nx=True, ex=lease):
                _claims[task] = f"redis:{key}"
                return _claims[task]
    except Exception:
        pass

    _claims[task] = None
    return None


