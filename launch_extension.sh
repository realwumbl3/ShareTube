#!/usr/bin/env bash
set -euo pipefail

# Launch a Chromium/Chrome window with the ShareTube extension loaded
# and a persistent profile directory, with sandbox/automation disabled.

VERSION="v1-01"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
EXT_PATH="$PROJECT_ROOT/backend/$VERSION/extension/"

WINDOW_POSITION="${3:-0,0}"
WINDOW_SIZE="${4:-1280,1400}"  


if [[ ! -d "$EXT_PATH" ]]; then
  echo "Error: Could not find extension directory at $EXT_PATH" >&2
  exit 1
fi

# Parse flags/args. Support --double (launch a second window on the right)
DOUBLE=false
POSITIONAL_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --double)
      DOUBLE=true
      ;;
    *)
      POSITIONAL_ARGS+=("$arg")
      ;;
  esac
done

# Allow overriding the profile directory and initial URL via positional args
DEFAULT_PROFILE_A="/home/wumbl3wsl/ShareTube/.browser-profiles/A"
DEFAULT_PROFILE_B="/home/wumbl3wsl/ShareTube/.browser-profiles/B"
PROFILE_DIR="${POSITIONAL_ARGS[0]:-$DEFAULT_PROFILE_A}"
START_URL="${POSITIONAL_ARGS[1]:-https://www.youtube.com/}"
WINDOW_POSITION="${POSITIONAL_ARGS[2]:-0,0}"
WINDOW_SIZE="${POSITIONAL_ARGS[3]:-1280,1400}"
LOCAL_BROWSERS_DIR="$PROJECT_ROOT/.browsers"

# Derive B profile path sensibly
PROFILE_DIR_TRIMMED="${PROFILE_DIR%/}"
if [[ "$PROFILE_DIR_TRIMMED" == */A ]]; then
  PROFILE_DIR_B="${PROFILE_DIR_TRIMMED%/A}/B"
else
  PROFILE_DIR_B="$DEFAULT_PROFILE_B"
fi

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

# Provide dummy Google API keys to silence Chromium's missing-keys infobar
export GOOGLE_API_KEY="${GOOGLE_API_KEY:-dummy}"
export GOOGLE_DEFAULT_CLIENT_ID="${GOOGLE_DEFAULT_CLIENT_ID:-dummy}"
export GOOGLE_DEFAULT_CLIENT_SECRET="${GOOGLE_DEFAULT_CLIENT_SECRET:-dummy}"

if [[ "$DOUBLE" == false ]]; then
  exec "$BROWSER_BIN" \
    "--user-data-dir=$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --test-type \
    --disable-session-crashed-bubble \
    --noerrdialogs \
    "--window-position=$WINDOW_POSITION" \
    "--window-size=$WINDOW_SIZE" \
    "--disable-extensions-except=$EXT_PATH" \
    "--load-extension=$EXT_PATH" \
    --disable-features=IsolateOrigins,site-per-process \
    --disable-blink-features=AutomationControlled \
    "$START_URL"
else
  # Launch primary window (left or as-specified)
  "$BROWSER_BIN" \
    "--user-data-dir=$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --test-type \
    --disable-session-crashed-bubble \
    --noerrdialogs \
    "--window-position=$WINDOW_POSITION" \
    "--window-size=$WINDOW_SIZE" \
    "--disable-extensions-except=$EXT_PATH" \
    "--load-extension=$EXT_PATH" \
    --disable-features=IsolateOrigins,site-per-process \
    --disable-blink-features=AutomationControlled \
    "$START_URL" &

  # Compute right-side position for the second window
  RIGHT_POSITION="1280,0"
  WIN_W="${WINDOW_SIZE%%,*}"
  WIN_H="${WINDOW_SIZE#*,}"
  if command -v xrandr >/dev/null 2>&1; then
    RES="$(xrandr | awk '/\*/{print $1; exit}')"
  elif command -v xdpyinfo >/dev/null 2>&1; then
    RES="$(xdpyinfo | awk '/dimensions:/{print $2}')"
  else
    RES=""
  fi
  SCREEN_W=""
  if [[ "$RES" =~ ^([0-9]+)x([0-9]+)$ ]]; then
    SCREEN_W="${BASH_REMATCH[1]}"
  fi
  if [[ -n "$SCREEN_W" && "$WIN_W" =~ ^[0-9]+$ ]]; then
    RIGHT_X=$(( SCREEN_W - WIN_W ))
    if (( RIGHT_X < 0 )); then RIGHT_X=0; fi
    RIGHT_POSITION="$RIGHT_X,0"
  fi

  echo "Second profile: $PROFILE_DIR_B"

  exec "$BROWSER_BIN" \
    "--user-data-dir=$PROFILE_DIR_B" \
    --no-first-run \
    --no-default-browser-check \
    --test-type \
    --disable-session-crashed-bubble \
    --noerrdialogs \
    "--window-position=$RIGHT_POSITION" \
    "--window-size=$WIN_W,$WIN_H" \
    "--disable-extensions-except=$EXT_PATH" \
    "--load-extension=$EXT_PATH" \
    --disable-features=IsolateOrigins,site-per-process \
    --disable-blink-features=AutomationControlled \
    "$START_URL"
fi


