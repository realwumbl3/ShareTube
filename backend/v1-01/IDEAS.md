## Potential Ideas and Experiments

- **UX and Onboarding**
  - One-click invite link: `https://youtube.com/watch?v=ID#st:CODE` with auto-join + toast.
  - “Quickroom”: auto-create a room when the first control is issued if none exists.
  - Lightweight tour overlay on first use; shows pill, queue, and control hints.

- **Control and Collaboration**
  - Vote-to-skip and vote-to-pause with owner override; thresholds configurable.
  - “Request control” button that pings owner with a one-tap grant dialog.
  - Timed baton leases (e.g., 2 minutes) with visual countdown.

- **Sync Quality and Resilience**
  - Sync indicator (green/amber/red) based on measured drift and RTT.
  - Gentle catch-up: temporary playbackRate 1.05/0.95 instead of hard snap for small drifts.
  - Predictive pre-warm: navigate user to the next entry at t-2s while paused (tab prerender permitting).

- **Ads and Playback Polish**
  - Configurable ad warmup window length; per-room remembered preference.
  - Owner-only “Resume anyway” during ad pause with confirmation.
  - Optional chime when ads finish and playback resumes.

- **Presence, Chat, Social**
  - Reactions/emotes (❤️ 😂 👍 👎) with brief on-screen bursts; throttled.
  - Threaded chat replies or quick polls (“next or skip?”) with timers.
  - Nickname override per room (keeps Google account private name if desired).

- **Queue and Discovery**
  - Drag-and-drop from any tab URL; auto-parse YouTube timestamps (`&t=`) as startAt metadata.
  - Weighted queue: owner can give operators + participants different weights for votes.
  - Saved playlists: export/import room queue to a sharable code.

- **Extensibility and Integrations**
  - Minimal room webhooks (join/leave/queue-change) for bots or logging.
  - Companion mobile page to act as a remote control (play/pause/seek/vote) without the extension.
  - Optional WebRTC voice chat toggle in-room (simple mesh for ≤4 users; fall back to text for more).

- **Privacy and Safety**
  - “Private Room” mode hides membership list and disallows invite link preview.
  - Owner can lock chat or enable slow-mode; profanity filter toggle.
  - Ephemeral rooms auto-expire after N hours of inactivity.

- **Observability and Ops**
  - Client-side metrics sampling for drift and ad incidence; privacy-preserving aggregation.
  - Feature flags in JWT or server config to flip experiments per room.
  - Room snapshot diff logging for debugging bad state transitions (rotated, redacted).

- **Testing and Tooling**
  - Dual-browser harness to assert invariants: drift < 400ms, consistent queue, ad pause/resume timing.
  - Synthetic ad injector in dev (DOM flag toggler) to test ad sync flows.
  - Record/replay of control events to reproduce bugs.

- **Future Platforms**
  - Abstract video provider to support Vimeo/Twitch in the same model.
  - “Local file watch” via a small local companion page (drag a file; all others stream a public copy).
  - Progressive enhancement for mobile browsers via bookmarklet or PWA when extensions aren’t available.

