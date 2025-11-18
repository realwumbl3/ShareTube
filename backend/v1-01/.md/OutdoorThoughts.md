Single user, remote use youtube on other client (not another user ((self))) ShareTube Remote.

Each other room member has 1 vote to up or down the queue your submission.

AI powered webcam reaction focus and highlight.

Lower programmatically the quality on hitch to keep up asap.

Speed up or down video +-0.15% to keep videos in sync seamlessly.

Castable votes:
    - Skip video
    - 3 minute pause
    - Restart video

Reflect other user actions:
    - Other users make a Comment on the current video.
    - Up or down thumb the current video.
    - Subscribe to the author.
    - Currently reading comments (perhaps make enhancement to view comments without unfocusing video)
    - Currently browsing videos*a*

Minigames
    - Tik tac Toe
    - UNO ripoff

Video games
    - Shorts against humanity
    - Tier list 
    - Video hunting Challenges (vote based ellimination game)
        - Dank
    - What happens next in compilation videos timestamps with answers hehehehe.

*a* Turning the current video to be loaded into an iframe and substituting the player with it:
    - PWA features should still work while the room's playing video is secured in the iframe.
        - Allows user to browse videos/ use th rest of the app/ read comments.

Autohide Pill with peak and auto-show on proximity.
    - From behind under-modal popup.


More big‑hit feature ideas

Second-screen and remote control
    - Use phone as a remote for desktop YouTube (QR to pair into room; minimal PWA remote UI)
    - Handoff between devices; seamlessly move control from desktop→mobile→TV
    - Shared seek bar with haptic ticks on mobile when crossing important timestamps

Ultra-tight sync and resilience
    - PID/PLL-based drift correction: ±0.10–0.25% playback rate nudge with bounded catch-up
    - Low-bandwidth mode: drop video quality proactively per client based on measured RTT/Jitter
    - Graceful rejoin: late joiners fast-seek to server baseline, then micro-correct

Ad handling upgrades
    - Distributed ad detection consensus: confirm ads via quorum to avoid false positives
    - “Pause room during ads” tokens: any member can temporarily freeze progress without affecting ad playback
    - Post-ad safety seek: auto-resnap to authoritative time with a gentle fade-in indicator

Social presence and reactions
    - Emoji bursts + inline text reactions pinned to timestamps
    - AI face/emotion highlights with opt-in blur/consent and per-room privacy guardrails
    - Live polls and quick takes that anchor to the current timestamp; results overlay

Queue and voting systems
    - Weighted votes (DJ/Host gets tie-break), anti-spam cooldowns, veto credits
    - Smart queue suggestions based on watch history and current vibe (rapid feedback loop)
    - Batch add from playlists/shorts with dedupe and auto-ordering by momentum

Discovery and collaboration
    - “Video hunt” rounds: timed search where players race to add the best next clip
    - Collaborative clipper: mark in/out segments to watch highlights; export as a list
    - Room highlights reel auto-generated from spikes in reactions and chat

Audio/voice and captions
    - Optional in-room voice chat via WebRTC with spatial ducking during loud moments
    - Live captions + multilingual translation overlay; per-user language settings
    - Push-to-talk soundboard for meme SFX gated by cooldown/votes

Cross-platform and integrations
    - Support for Twitch, Vimeo, direct MP4/HLS where feasible (room-type scoped)
    - Discord/Slack bots: “/queue <url>” to feed the room; presence mirroring
    - Calendar/RSVP for scheduled watch parties; ICS invites and reminders

Moderation and safety
    - Role-based controls: Host, DJ, Member, Spectator; per-role capabilities
    - Content gates: blur/confirm on potentially sensitive content; community filter presets
    - Soft-lock room with invite-only joining and short-lived QR codes

Mini-games and party modes
    - Guess-the-next-clip; bingo cards driven by common tropes in compilations
    - UNO-style action cards that affect queue order, skip, reverse, wildcards
    - Timestamp trivia: predict “what happens next” with wagered points

Analytics and memory
    - Room history with searchable timeline: who added what, when, and how it landed
    - Personal recap: top clips, most-liked adds, and shared vibe score
    - Export/share moment links with overlay of live reactions

UX polish
    - Pill autohide with proximity wake and peek-preview of current queue
    - Compact overlay for small screens; accessibility-first focus/keyboard flows
    - Non-intrusive to native YouTube UI; respects theater/fullscreen modes

Developer/ops enhancements
    - Dashboard: live presence graph, ad-status map, and drift histograms
    - Room recording (events only) for debugging sync issues; one-click bug report
    - Chaos toggle for simulated packet loss/latency to test sync resilience
