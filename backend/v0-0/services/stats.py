# Future annotations for cleaner typing across Python versions
from __future__ import annotations

# Standard time and logging utilities
import time
import logging
# Access the active Flask application to read config
from flask import current_app

# SocketIO instance to emit events to connected clients
from ..extensions import socketio

# Guard to ensure we start only one background thread
_stats_thread_started: bool = False


# Background loop that periodically emits CPU and memory stats
def _emit_system_stats_forever() -> None:
    # Import psutil lazily to avoid mandatory dependency unless feature enabled
    import psutil

    while True:
        try:
            # Snapshot CPU percentage without blocking interval (SocketIO sleep controls loop)
            cpu_percent = psutil.cpu_percent(interval=None)
            # Snapshot virtual memory usage
            vm = psutil.virtual_memory()
            # Build payload with current metrics and timestamp
            payload = {
                "cpu_percent": cpu_percent,
                "mem_total": vm.total,
                "mem_available": vm.available,
                "mem_percent": vm.percent,
                "ts": int(time.time() * 1000),
            }
            # Emit to all subscribers on the 'system_stats' channel
            socketio.emit("system_stats", payload)
        except Exception as e:
            # Log and continue on any error to keep the background thread alive
            logging.exception("error emitting system stats")
            logging.exception(e)
        # Yield control back to the SocketIO event loop between emissions
        socketio.sleep(10)


# Public entrypoint to start the stats loop if configured and not already running
def start_system_stats_if_needed() -> None:
    global _stats_thread_started
    try:
        # Avoid starting multiple background loops
        if _stats_thread_started:
            return
        # Only start if the feature is enabled in configuration
        if not current_app or not current_app.config.get("ENABLE_SYSTEM_STATS", False):
            return
        # Log start and launch background task via SocketIO helper
        logging.info("starting system stats thread")
        socketio.start_background_task(_emit_system_stats_forever)
        _stats_thread_started = True
    except Exception:
        # Never crash callers due to stats issues
        logging.exception("failed to start system stats thread")
        return


