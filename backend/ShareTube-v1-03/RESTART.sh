#!/bin/bash
set -u

clear

# Force unbuffered output for this session
export PYTHONUNBUFFERED=1

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(basename "$SCRIPT_DIR")"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
INSTANCE_DIR="$PROJECT_ROOT/instance/$VERSION"

LOG_FILE="$INSTANCE_DIR/ShareTube.log"
BG_LOG_FILE="$INSTANCE_DIR/ShareTube.bg.log"

# cleanup background tails from previous runs to prevent duplicates/confusion
sudo pkill -f "tail -n 0 -F $LOG_FILE" 2>/dev/null || true

# Ensure log files exist and start fresh (logs are root:www-data, so we need sudo)
sudo touch "$LOG_FILE" "$BG_LOG_FILE"
sudo truncate -s 0 "$LOG_FILE" "$BG_LOG_FILE"

# Check new logs - follow the ShareTube log files
# awk filters consecutive duplicates and flushes immediately
sudo tail -n 0 -F "$LOG_FILE" "$BG_LOG_FILE" | awk '$0 != last { print; last = $0; fflush() }' &
LOG_PID=$!

# Ensure the background process is killed when this script exits
trap "kill $LOG_PID 2>/dev/null" EXIT

# Restart the service
sudo systemctl restart "ShareTube.$VERSION.target"

# Wait for the log process to complete
wait $LOG_PID
