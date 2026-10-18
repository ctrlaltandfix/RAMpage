# RAMpage 0.2.5 Beta — manual game persistence fix

This release fixes non-Steam games disappearing from the library after the app closes and restarts.

- Protects manually added games during Steam, Epic, and GOG rescans.
- Keeps an append-only recovery ledger for manual game additions, edits, and intentional removals.
- Recovers missing manual games from both storage locations and the Chromium backup when needed.
- Verifies that manually added games have been saved successfully, reporting save errors instead of silently ignoring them.
- Verifies snapshots before clearing the replay journal.
- Includes 10 automated regression tests covering add, rescan, restart, recovery, editing and deletion.

In RAMpage, open **Settings → Check for updates** to install **build 0.2.5** once the release asset is published. The installer retains library and settings data. Back up the existing RAMpage data directory before updating.
