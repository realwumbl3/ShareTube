#!/bin/bash
clear

# Force unbuffered output for this session
export PYTHONUNBUFFERED=1

# Check new logs - only show logs from after the restart
sudo -E stdbuf -oL journalctl -u ShareTube.v1-01.service --since=now -f &
JOURNAL_PID=$!

# Restart the service
sudo systemctl restart ShareTube.v1-01.service 

# Wait for the journalctl process to complete
wait $JOURNAL_PID
