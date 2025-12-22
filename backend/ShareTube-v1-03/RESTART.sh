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
sudo pkill -f "tail.*-F.*$LOG_FILE" 2>/dev/null || true

# Ensure log files exist (logs are root:www-data, so we need sudo)
sudo touch "$LOG_FILE" "$BG_LOG_FILE"

# Stop services first to ensure clean restart
echo "Restarting ShareTube.$VERSION.target..."
sudo systemctl stop "ShareTube.$VERSION.target" 2>/dev/null || true

# Truncate log files for clean start
sudo truncate -s 0 "$LOG_FILE" "$BG_LOG_FILE"

# Start tail to follow the log files
# Use tail -F (capital F) which retries if files are removed/truncated
# Filter out "file truncated" messages and consecutive duplicates
sudo bash -c "tail -F '$LOG_FILE' '$BG_LOG_FILE' 2>&1" | \
    grep --line-buffered -v "file truncated" | \
    awk '$0 != last { print; last = $0; fflush() }' &
LOG_PID=$!

# Cleanup function to kill tail process
cleanup() {
    echo ""
    echo "Stopping log follower..."
    kill $LOG_PID 2>/dev/null || true
    sudo pkill -f "tail.*-F.*$LOG_FILE" 2>/dev/null || true
}

# Ensure the background process is killed when this script exits
trap cleanup EXIT INT TERM

# Start services - tail is already watching
sudo systemctl start "ShareTube.$VERSION.target"

echo ""
echo "Following logs (Press Ctrl+C to exit)..."
echo "---"
echo ""

# Wait for the log process (will run until interrupted)
wait $LOG_PID
