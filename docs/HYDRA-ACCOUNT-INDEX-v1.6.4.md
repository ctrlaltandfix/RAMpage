# RAMpage v1.6.4 — Hydra signed-in local search and download index

RAMpage's optional Hydra integration now includes an **authenticated, read-only Hydra account/index panel** in the same password-protected remote library URL. It does not replace Hydra's downloader.

## Requirements and activation

1. Update RAMpage to **v1.6.4** via Settings → Check for updates.
2. Sign in to the **installed Hydra Launcher desktop application** on the gaming PC.
3. In RAMpage desktop Settings → Remote library access → Hydra Launcher integration, enable Hydra integration and click **Refresh Hydra games**.
4. Enable the password-protected RAMpage web library and click **Create HTTPS link**.
5. Sign into the RAMpage remote web URL on another device. A **Hydra account & download index** section appears only if opted-in Hydra game records are present.
6. Search the cached Hydra game index; see existing Hydra downloads' statuses/progress, local download-source count and game-specific new-option counts.

## What a detected signed-in state means

RAMpage checks **only whether Hydra's locally stored authentication record contains an access-token value**. RAMpage's helper returns a BOOLEAN; the token, refresh token and the remaining authentication record are **never returned, copied into RAMpage's persistent settings, shown in the UI or forwarded over HTTP**. A locally stored record does not guarantee that Hydra's server currently considers that session valid. If Hydra is signed out or no stored session exists, the download index remains unavailable.

## What is deliberately not supported

Hydra's own game catalogue search and new-download execution operate through its internal Electron IPC and application-level downloader. The installed Hydra release does **not document a stable third-party remote command interface** for searching its full online catalogue or scheduling downloads through its live account. RAMpage therefore **does not duplicate, inject or extract Hydra account tokens**, scrape private API routes, execute community download links, send torrent/magnet URIs, initiate downloads or install files. For actual downloads, open Hydra and use its own download controls, ensuring you have the rights to the content.

The downloaded/indexed listing displayed in RAMpage is from **Hydra's cached local game records and pre-existing download queue**, not all possible remote download options across the internet. Download-source URLs, credentials, filesystem paths and game executable locations are filtered out. This is a foundation for a fuller integration if Hydra later provides an officially supported external API.

## Security

- Disabled by default and available only after desktop opt-in.
- Remote index endpoint requires RAMpage's existing authenticated web-library session, is read-only, and accepts bounded search strings.
- The account record is examined only in Hydra's short-lived local LevelDB snapshot. No persistent copy of that credential is created by the integration.
- The web library still requires its own strong password and should be shared only with trusted users. The optional Cloudflare Quick Tunnel is a public HTTPS sign-in page.
- The existing disclaimer applies: RAMpage's integration is for library metadata and does not provide pirated or otherwise unauthorised games or content.

[Hydra project](https://github.com/hydralauncher/hydra) · [RAMpage v1.6.4](https://github.com/ctrlaltandfix/RAMpage/releases/tag/v1.6.4)