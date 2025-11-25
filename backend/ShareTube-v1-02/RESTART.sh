#!/bin/bash
clear

# Force unbuffered output for this session
export PYTHONUNBUFFERED=1

LOG_FILE=".instance/ShareTube.error.log"

# cleanup background tails from previous runs to prevent duplicates/confusion
pkill -f "tail -f $LOG_FILE" 2>/dev/null

# Clear the log file to start fresh
> "$LOG_FILE"

# Check new logs - follow the ShareTube log file
# awk filters consecutive duplicates and flushes immediately
tail -f "$LOG_FILE" | awk '$0 != last { print; last = $0; fflush() }' &
LOG_PID=$!

# Ensure the background process is killed when this script exits
trap "kill $LOG_PID 2>/dev/null" EXIT

# Restart the service
sudo systemctl restart ShareTube.ShareTube-v1-02.service 

# Wait for the log process to complete
wait $LOG_PID
