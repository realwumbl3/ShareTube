#!/bin/bash
clear

# Force unbuffered output for this session
export PYTHONUNBUFFERED=1

# Check new logs - follow the ShareTube log file
tail -f .instance/ShareTube.log &
LOG_PID=$!

# Restart the service
sudo systemctl restart ShareTube.v1-01.service 

# Wait for the log process to complete
wait $LOG_PID
