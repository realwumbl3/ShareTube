#!/usr/bin/env bash
set -euo pipefail

# Launch a Chromium/Chrome window with the ShareTube extension loaded
# and a persistent profile directory, with sandbox/automation disabled.
#
# This script supports:
#  - Single or double window launch ("--double").
#  - Profile directory selection ("--profile=<dir>"), with sensible A/B defaults.
#  - Start URL selection ("--url=<url>").
#  - Initial window geometry hints ("--pos=X,Y" and "--size=W,H").
#  - Enforced vertical margins: 64px from top and bottom across all windows.
#
# Detailed, line-by-line comments explain data flow and logic throughout.

VERSION="v1-01"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"  # Absolute path to this script's directory
PROJECT_ROOT="$SCRIPT_DIR"                                   # Define project root relative to script
EXT_PATH="$PROJECT_ROOT/backend/$VERSION/extension/"        # Path to the Chrome extension directory
EXTENSIONS_DIR="$PROJECT_ROOT/.browsers/extensions"         # Root for auto-discovered unpacked extensions

# Validate the extension directory exists; exit early if missing
if [[ ! -d "$EXT_PATH" ]]; then
  echo "Error: Could not find extension directory at $EXT_PATH" >&2
  exit 1
fi

# Build the full list of unpacked extensions to load:
#  - Always include the primary extension at EXT_PATH
#  - Auto-discover any additional extensions under EXTENSIONS_DIR (any dir with manifest.json)
#  - Join into a comma-separated list for Chrome flags
EXT_PATHS=()                                                # Array to accumulate extension directories
EXT_PATHS+=("$EXT_PATH")                                    # Ensure primary extension is first

# Discover additional extension directories if the container directory exists
if [[ -d "$EXTENSIONS_DIR" ]]; then
  # Iterate over immediate subdirectories of EXTENSIONS_DIR
  # Use -print0/-d '' to safely handle any special chars (spaces, etc.)
  while IFS= read -r -d '' candidate_dir; do
    # Only include directories that look like valid unpacked extensions (must contain manifest.json)
    if [[ -f "$candidate_dir/manifest.json" ]]; then
      EXT_PATHS+=("$candidate_dir")
    fi
  done < <(find "$EXTENSIONS_DIR" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)
fi

# Join the array into a comma-separated string EXTENSION_FLAG_LIST (order preserved)
if ((${#EXT_PATHS[@]} > 0)); then
  EXTENSION_FLAG_LIST="$(printf "%s," "${EXT_PATHS[@]}")"
  EXTENSION_FLAG_LIST="${EXTENSION_FLAG_LIST%,}"
else
  # Safety fallback; should not happen because EXT_PATH is guaranteed above
  EXTENSION_FLAG_LIST="$EXT_PATH"
fi

# Print usage text and exit. Designed to be concise but complete.
print_usage() {
  echo "Usage: $(basename "$0") [--double] [--profile=<dir>] [--url=<url>] [--pos=X,Y] [--size=W,H]" >&2
  echo "       $(basename "$0") [PROFILE_DIR] [START_URL] [POS] [SIZE]" >&2
  echo
  echo "Flags:" >&2
  echo "  --double           Launch a second window on the right using the B profile" >&2
  echo "  --profile=<dir>    Set the profile directory for the primary window (default: A)" >&2
  echo "  --url=<url>        Start URL (default: https://www.youtube.com/)" >&2
  echo "  --pos=X,Y          Initial X,Y (X only is honored; Y is forced to 64)" >&2
  echo "  --size=W,H         Requested window width/height (height is clamped to screen-128)" >&2
  echo "  --help             Show this help and exit" >&2
}

# Defaults for behavior and inputs
DOUBLE=false                                              # Whether to launch a second window
DEFAULT_PROFILE_A="/home/wumbl3wsl/ShareTube/.browser-profiles/A"  # Default A profile path
DEFAULT_PROFILE_B="/home/wumbl3wsl/ShareTube/.browser-profiles/B"  # Default B profile path
PROFILE_DIR="$DEFAULT_PROFILE_A"                         # Primary profile default
START_URL="https://www.youtube.com/#st:613a9ad4ce69b4"                     # Default start URL
WINDOW_POSITION="0,0"                                    # Default requested position (X honored)
WINDOW_SIZE="1280,1400"                                  # Default requested size (H adjusted later)
SHOWING_DEVTOOLS=false                                     # Whether to show devtools
BROWSER_BIN="/home/wumbl3wsl/ShareTube/.browsers/chromium-123/chrome"

# Determine if we are in a WSL-like environment for compatibility adjustments
detect_wsl() {
  if [[ -f /proc/version ]] && grep -qi "microsoft" /proc/version; then
    return 0
  fi
  return 1
}

# Extra Chrome arguments applied in environments where sandbox/crashpad can fail (e.g., WSL)
EXTRA_CHROME_ARGS=()
if detect_wsl; then
  # Disable setuid sandbox and zygote to prevent posix_spawn and userns issues on WSL
  EXTRA_CHROME_ARGS+=(--no-sandbox)
  EXTRA_CHROME_ARGS+=(--disable-setuid-sandbox)
  EXTRA_CHROME_ARGS+=(--no-zygote)
  # Disable crash reporter (crashpad/breakpad) to avoid spawning its handler
  EXTRA_CHROME_ARGS+=(--disable-breakpad)
fi


# Collect positional arguments separately for backward compatibility
POSITIONAL_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --help|-h)
      print_usage
      exit 0
      ;;
    --double)
      DOUBLE=true
      ;;
    --profile=*)
      PROFILE_DIR="${arg#*=}"
      ;;
    --url=*)
      START_URL="${arg#*=}"
      ;;
    --pos=*)
      WINDOW_POSITION="${arg#*=}"
      ;;
    --size=*)
      WINDOW_SIZE="${arg#*=}"
      ;;
    *)
      POSITIONAL_ARGS+=("$arg")
      ;;
  esac
done

# Backward-compatible positional overrides (PROFILE_DIR, START_URL, POS, SIZE)
if (( ${#POSITIONAL_ARGS[@]} >= 1 )); then PROFILE_DIR="${POSITIONAL_ARGS[0]}"; fi
if (( ${#POSITIONAL_ARGS[@]} >= 2 )); then START_URL="${POSITIONAL_ARGS[1]}"; fi
if (( ${#POSITIONAL_ARGS[@]} >= 3 )); then WINDOW_POSITION="${POSITIONAL_ARGS[2]}"; fi
if (( ${#POSITIONAL_ARGS[@]} >= 4 )); then WINDOW_SIZE="${POSITIONAL_ARGS[3]}"; fi

# Directory to store locally installed browsers if system chromium/chrome is missing
LOCAL_BROWSERS_DIR="$PROJECT_ROOT/.browsers"

# Derive the B profile path from the A profile if possible; otherwise default
PROFILE_DIR_TRIMMED="${PROFILE_DIR%/}"
if [[ "$PROFILE_DIR_TRIMMED" == */A ]]; then
  PROFILE_DIR_B="${PROFILE_DIR_TRIMMED%/A}/B"
else
  PROFILE_DIR_B="$DEFAULT_PROFILE_B"
fi

# Locate an installed Chromium/Chrome-like browser and print its path
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

# Determine screen resolution and set SCREEN_W and SCREEN_H globals
detect_screen_resolution() {
  # Attempt via xrandr first (common for X11); fallback to xdpyinfo; else empty
  local res
  if command -v xrandr >/dev/null 2>&1; then
    res="$(xrandr | awk '/\*/{print $1; exit}')"  # e.g., 1920x1080
  elif command -v xdpyinfo >/dev/null 2>&1; then
    res="$(xdpyinfo | awk '/dimensions:/{print $2}')"  # e.g., 1920x1080
  else
    res=""
  fi

  SCREEN_W=""
  SCREEN_H=""
  if [[ "$res" =~ ^([0-9]+)x([0-9]+)$ ]]; then
    SCREEN_W="${BASH_REMATCH[1]}"
    SCREEN_H="${BASH_REMATCH[2]}"
  fi
}

# Compute geometry while enforcing 64px top/bottom margins globally
compute_geometry() {
  # Split requested size W,H; WIN_W is honored as width; height is adjusted later
  WIN_W="${WINDOW_SIZE%%,*}"
  WIN_H="${WINDOW_SIZE#*,}"

  # Apply enforced margins; if screen height is unknown, fallback to requested H
  local buffer=32
  if [[ "$SCREEN_H" =~ ^[0-9]+$ ]]; then
    EFFECTIVE_H=$(( SCREEN_H - (buffer * 3) ))
    if (( EFFECTIVE_H <= 0 )); then EFFECTIVE_H="$WIN_H"; fi
  else
    EFFECTIVE_H="$WIN_H"
  fi

  # Derive the X component from requested position; Y is forced to 64 (top offset)
  local pos_x_raw="${WINDOW_POSITION%%,*}"
  if [[ "$pos_x_raw" =~ ^[0-9]+$ ]]; then
    PRIMARY_X="$pos_x_raw"
  else
    PRIMARY_X=0
  fi
  PRIMARY_Y="$buffer"
  PRIMARY_POSITION="$PRIMARY_X,$PRIMARY_Y"

  # Compute the right-hand window position for double mode
  RIGHT_POSITION="1280,$PRIMARY_Y"
  if [[ -n "$SCREEN_W" && "$WIN_W" =~ ^[0-9]+$ ]]; then
    local right_x=$(( SCREEN_W - WIN_W ))
    if (( right_x < 0 )); then right_x=0; fi
    RIGHT_POSITION="$right_x,$PRIMARY_Y"
  fi
}

# Launch a browser window with the provided parameters
launch_window() {
  local mode="$1"            # Either "exec" to replace shell or "run" to spawn
  shift                       # Shift to access the rest of the parameters
  local user_profile="$1"    # Path to profile directory
  local position="$2"        # "X,Y"
  local width="$3"           # integer width
  local height="$4"          # integer height
  local url="$5"             # URL to open

  # Build and run the browser command; use exec when mode requests replacement
  if [[ "$mode" == "exec" ]]; then
    exec "$BROWSER_BIN" \
      "--user-data-dir=$user_profile" \
      --no-first-run \
      --no-default-browser-check \
      --test-type \
      --disable-session-crashed-bubble \
      --noerrdialogs \
      "--window-position=$position" \
      "--window-size=$width,$height" \
      "--disable-extensions-except=$EXTENSION_FLAG_LIST" \
      "--load-extension=$EXTENSION_FLAG_LIST" \
      --disable-features=IsolateOrigins,site-per-process \
      --disable-blink-features=AutomationControlled \
      "${EXTRA_CHROME_ARGS[@]}" \
      --auto-open-devtools-for-tabs \
      "$url"
  else
    "$BROWSER_BIN" \
      "--user-data-dir=$user_profile" \
      --no-first-run \
      --no-default-browser-check \
      --test-type \
      --disable-session-crashed-bubble \
      --noerrdialogs \
      "--window-position=$position" \
      "--window-size=$width,$height" \
      "--disable-extensions-except=$EXTENSION_FLAG_LIST" \
      "--load-extension=$EXTENSION_FLAG_LIST" \
      --disable-features=IsolateOrigins,site-per-process \
      --disable-blink-features=AutomationControlled \
      "${EXTRA_CHROME_ARGS[@]}" \
      --auto-open-devtools-for-tabs \
      "$url"
  fi
}

# If the hard-coded browser path is missing or not executable, attempt discovery/fallbacks
if [[ ! -x "$BROWSER_BIN" ]]; then
  if [[ -n "${CHROME_BIN:-}" ]] && command -v "$CHROME_BIN" >/dev/null 2>&1; then
    BROWSER_BIN="$CHROME_BIN"
  elif [[ -d "$LOCAL_BROWSERS_DIR" ]] && LOCAL_CHROME="$(find "$LOCAL_BROWSERS_DIR" -type f \( -name chrome -o -name chromium \) -perm -u+x -print -quit)" && [[ -n "$LOCAL_CHROME" ]]; then
    BROWSER_BIN="$LOCAL_CHROME"
  elif BROWSER_BIN_FOUND="$(find_browser)"; then
    BROWSER_BIN="$BROWSER_BIN_FOUND"
  else
    echo "Error: Could not find an executable Chromium/Chrome binary." >&2
    echo "Install Chromium (e.g., 'sudo apt install chromium-browser') or provide CHROME_BIN." >&2
    exit 1
  fi
fi

# Preflight: make crashpad handler executable if present to prevent posix_spawn permission errors
BIN_DIR="$(dirname "$BROWSER_BIN")"
for handler in "crashpad_handler" "chrome_crashpad_handler"; do
  if [[ -f "$BIN_DIR/$handler" && ! -x "$BIN_DIR/$handler" ]]; then
    chmod u+x "$BIN_DIR/$handler" || true
  fi
done

echo "Using browser: $BROWSER_BIN"
echo "Profile dir:   $PROFILE_DIR"
echo "Extensions:    $EXTENSION_FLAG_LIST"
if ((${#EXT_PATHS[@]} > 1)); then
  echo "Additional unpacked extensions discovered under $EXTENSIONS_DIR:"
  for extra_ext in "${EXT_PATHS[@]:1}"; do
    echo "  - $extra_ext"
  done
fi

# Provide dummy Google API keys to silence Chromium's missing-keys infobar
export GOOGLE_API_KEY="${GOOGLE_API_KEY:-dummy}"
export GOOGLE_DEFAULT_CLIENT_ID="${GOOGLE_DEFAULT_CLIENT_ID:-dummy}"
export GOOGLE_DEFAULT_CLIENT_SECRET="${GOOGLE_DEFAULT_CLIENT_SECRET:-dummy}"

# Detect screen size and compute geometry/positions with enforced margins
detect_screen_resolution
compute_geometry

if [[ "$DOUBLE" == false ]]; then
  # Single-window mode: launch the primary window and replace the shell with the browser process
  launch_window exec "$PROFILE_DIR" "$PRIMARY_POSITION" "$WIN_W" "$EFFECTIVE_H" "$START_URL"
else
  # Launch primary window (left or as-specified)
  launch_window run "$PROFILE_DIR" "$PRIMARY_POSITION" "$WIN_W" "$EFFECTIVE_H" "$START_URL" &

  # RIGHT_POSITION was computed earlier in compute_geometry

  echo "Second profile: $PROFILE_DIR_B"

  launch_window exec "$PROFILE_DIR_B" "$RIGHT_POSITION" "$WIN_W" "$EFFECTIVE_H" "$START_URL"
fi


