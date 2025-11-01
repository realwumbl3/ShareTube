## ShareTube Backend v1-01 – Dev Utilities

### Launching the Browser Extension

Use `.root/launch_extension.sh` to open Chromium/Chrome with the ShareTube extension loaded into a persistent profile. The script disables sandbox/automation infobars and enforces clean, repeatable dev launches.

Basic usage:

```
.root/launch_extension.sh [--double] [--profile=<dir>] [--url=<url>] [--pos=X,Y] [--size=W,H]
.root/launch_extension.sh [PROFILE_DIR] [START_URL] [POS] [SIZE]
```

Flags:
- **--double**: Launch a second window on the right using the B profile.
- **--profile=<dir>**: Profile directory for the primary window. Defaults to `~/.browser-profiles/A` inside the repo.
- **--url=<url>**: Start URL. Defaults to `https://www.youtube.com/`.
- **--pos=X,Y**: Requested initial position. Only X is honored; Y is forced to `64`.
- **--size=W,H**: Requested size. Height is clamped to `screenHeight - 128` to keep a 64px margin at top and bottom.
- **--help**: Show usage.

Notes:
- The script enforces a 64px margin from the top and bottom of the screen for all windows.
- When `--double` is used, the second window is placed flush to the right of the screen based on the requested width.
- If `PROFILE_DIR` ends with `/A`, the B profile is inferred from the same parent folder; otherwise it defaults to `~/.browser-profiles/B` inside the repo.

Examples:

```
# Single window with defaults (profile A, YouTube)
.root/launch_extension.sh

# Two windows (A left, B right), both honoring the 64px vertical margins
.root/launch_extension.sh --double

# Custom profile and URL
.root/launch_extension.sh --profile=/tmp/st-profile --url=https://youtube.com/@ShareTube

# Requested geometry (X honored; height adjusted to screen-128)
.root/launch_extension.sh --pos=200,0 --size=1400,1200
```


