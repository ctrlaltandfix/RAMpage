# RAMpage 1.6.8 Beta — Hydra Download Manager

This beta adds Hydra-style download-management **interfaces** to RAMpage's Windows desktop application and authenticated remote web library.

## New in 1.6.8

- **Windows desktop:** **Manage Hydra downloads** option in the details of uninstalled Hydra game entries.
- **Remote web library:** **Open download options** and a companion-aware download-management panel for uninstalled Hydra entries.
- Search/select game versions by title and source when a compatible, authorised companion supplies live options; display provider, reported download size and date.
- Choose an available, configured downloader; display storage availability and PC-managed destination, with extraction preferences.
- Display per-game transfer state, progress, downloaded bytes, speed and ETA; pause, resume or cancel when supported.
- Safeguards: authenticated remote access, CSRF and origin checks, loopback-only companion protocol, redaction of credentials, source URLs and local paths, and independent PC-side approval of each queued download.
- Existing **Add a Download**, Hydra's cached index/status search, RAMpage library, updater, Cloudflare remote access and ShadPS4 integrations are preserved.

## Important limitation — read before updating

**Live Hydra downloads and installation are NOT available with a normal, unmodified Hydra Launcher.** Hydra's downloader and source selection use internal Electron IPC, not a supported third-party remote API. RAMpage 1.6.8 provides the integration interface and a guarded *development-only* companion contract, but it does **not** include a working Hydra-side companion or bypass that limitation.

Consequently, the new manager reports the companion as **not connected** by default. It will not display invented download options, start a game download, pause a Hydra transfer or run an installer on a stock Hydra installation. Continue using RAMpage's existing **Open Hydra** handoff and Hydra's own application to download and install authorised games. RAMpage never initiates silent installation from the website.

## Update and integrity

- Windows installer: `RAMpage-Setup-1.6.8.exe`
- SHA-256 checksum: `RAMpage-Setup-1.6.8.exe.sha256`
- Upgrade tested from 1.6.7 to 1.6.8 on Windows, including preservation of both Roaming and Local RAMpage AppData sentinel files.
- Version 1.6.8 is published as the newest GitHub Release for the existing in-app updater feed. Open **Settings → Check for Updates** on v1.6.7 to check for it. Detection and installation on a user's own PC depend on its network/update settings.

Only download games and game content you have the rights to obtain.

Development and technical details: [RAMpage v1.6.8 PR #18](https://github.com/ctrlaltandfix/RAMpage/pull/18).
