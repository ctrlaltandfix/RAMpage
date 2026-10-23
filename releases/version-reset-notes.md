Version numbering restarts at **1.0.0**, retaining the current RAMpage application and its latest improvements.

- Artwork and website are optional; website links may use HTTP or HTTPS.
- Web game details use a dedicated page with navigation and deep links.
- Named Cloudflare tunnels retain their configured public URL across restarts; temporary Quick Tunnels still require a one-time named-tunnel setup for a stable public address.
- The web Add Download and game pages use the existing SteamGridDB integration for optional cover selection, without exposing its API key.
- Existing Hydra bridge and ShadPS4 fixes are retained.

**Moving from an older release numbered above 1.0.0:** download and run `RAMpage-Setup-1.0.0.exe` manually once. The existing updater does not offer lower version numbers. Install over the existing RAMpage installation; library and settings are preserved. Future releases will increment from 1.0.0.

The Windows build tests authenticated web routes, SteamGridDB selection flows, and installation over 1.6.8 with application-data preservation checks. The installer checksum is attached.

Previous GitHub releases and version tags were removed at the project owner's request. Source commit history remains available. Use this release as the packaged source baseline for subsequent builds; older recovery workflows referencing deleted releases are historical.
