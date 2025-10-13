#!/usr/bin/env bash
set -euo pipefail

# Launch a Chromium/Chrome window with the ShareTube extension loaded
# and a persistent profile directory, with sandbox/automation disabled.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
EXT_PATH="$PROJECT_ROOT/extension"

if [[ ! -d "$EXT_PATH" ]]; then
  echo "Error: Could not find extension directory at $EXT_PATH" >&2
  exit 1
fi

# Allow overriding the profile directory and initial URL via args
PROFILE_DIR="${1:-/home/wumbl3wsl/ShareTube/tests/.profiles/A}"
START_URL="${2:-https://www.youtube.com/}"
LOCAL_BROWSERS_DIR="$PROJECT_ROOT/.browsers"

mkdir -p "$PROFILE_DIR"

find_browser() {
  local candidates=(
    google-chrome-stable
    google-chrome
    chromium
    chromium-browser
    microsoft-edge
    brave-browser
  )
  for bin in "${candidates[@]}"; do
    if command -v "$bin" >/dev/null 2>&1; then
      echo "$bin"
      return 0
    fi
  done
  return 1
}

if [[ -n "${CHROME_BIN:-}" ]] && command -v "$CHROME_BIN" >/dev/null 2>&1; then
  BROWSER_BIN="$CHROME_BIN"
elif [[ -d "$LOCAL_BROWSERS_DIR" ]] && LOCAL_CHROME="$(find "$LOCAL_BROWSERS_DIR" -type f \( -name chrome -o -name chromium \) -perm -u+x -print -quit)" && [[ -n "$LOCAL_CHROME" ]]; then
  BROWSER_BIN="$LOCAL_CHROME"
elif ! BROWSER_BIN="$(find_browser)"; then
  echo "No system Chrome/Chromium found. Attempting local install via scripts/install_chromium.sh..." >&2
  if [[ -f "$PROJECT_ROOT/scripts/install_chromium.sh" ]]; then
    PLAYWRIGHT_BROWSERS_PATH="$LOCAL_BROWSERS_DIR" bash "$PROJECT_ROOT/scripts/install_chromium.sh" || true
    if LOCAL_CHROME="$(find "$LOCAL_BROWSERS_DIR" -type f \( -name chrome -o -name chromium \) -perm -u+x -print -quit)" && [[ -n "$LOCAL_CHROME" ]]; then
      BROWSER_BIN="$LOCAL_CHROME"
    else
      echo "Error: Local Chromium install did not produce an executable under $LOCAL_BROWSERS_DIR" >&2
      exit 1
    fi
  else
    echo "Error: Could not find a Linux Chromium/Chrome binary and no installer script present." >&2
    echo "Install Chromium (e.g., 'sudo apt install chromium-browser') or run npm run browsers:install." >&2
    exit 1
  fi
fi

echo "Using browser: $BROWSER_BIN"
echo "Profile dir:   $PROFILE_DIR"
echo "Extension:     $EXT_PATH"

exec "$BROWSER_BIN" \
  "--user-data-dir=$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "--disable-extensions-except=$EXT_PATH" \
  "--load-extension=$EXT_PATH" \
  --no-sandbox \
  --disable-features=IsolateOrigins,site-per-process \
  --disable-blink-features=AutomationControlled \
  "$START_URL"


