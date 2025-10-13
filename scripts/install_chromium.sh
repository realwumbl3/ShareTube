#!/usr/bin/env bash
set -euo pipefail

# Downloads a Chromium build into a repo-local .browsers directory
# using Playwright's installer, and prints the resolved executable path.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BROWSERS_DIR="$PROJECT_ROOT/.browsers"

mkdir -p "$BROWSERS_DIR"

echo "Installing Chromium to $BROWSERS_DIR ..."
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_DIR"

# Prefer running the local Playwright CLI via the Linux node binary to avoid Windows npx/UNC issues under WSL
NODE_BIN="/usr/bin/node"
if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi

if [[ -f "$PROJECT_ROOT/node_modules/playwright/cli.js" && -x "$NODE_BIN" ]]; then
  "$NODE_BIN" "$PROJECT_ROOT/node_modules/playwright/cli.js" install chromium
elif [[ -x "$PROJECT_ROOT/node_modules/.bin/playwright" ]]; then
  "$PROJECT_ROOT/node_modules/.bin/playwright" install chromium
else
  echo "Local Playwright not found. Please run 'npm i' first to install dependencies." >&2
  exit 1
fi

# Try to find the installed chrome executable
echo "Locating chromium executable under $BROWSERS_DIR ..."
if CHROME_PATH="$(find "$BROWSERS_DIR" -type f \( -name chrome -o -name chromium \) -perm -u+x -print -quit)" && [[ -n "$CHROME_PATH" ]]; then
  echo "Chromium installed: $CHROME_PATH"
else
  echo "Warning: Could not automatically locate chromium executable under $BROWSERS_DIR" >&2
  echo "You can inspect the directory to find the exact path." >&2
fi


