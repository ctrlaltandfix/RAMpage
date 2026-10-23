# RAMpage Hydra download workflow — v1.6.8 development

## From the supplied Hydra screenshots

The requested interface sequence is:

1. Add a game to the RAMpage library (already implemented for desktop and authenticated remote web as a **Not installed** Hydra draft).
2. **Open download options** from the game. Search for a title or filter choices by source. Display version title, source name, publication date, and size.
3. **Download settings** show compatible configured downloaders, reported free disk space, a generic destination label, extract-after-download, and delete-after-successful-extraction choices.
4. **Request download on gaming PC** asks for explicit user confirmation; the PC companion must independently approve the selected content, downloader and destination **for that job**.
5. The game-specific **Downloads** panel displays state, progress, bytes, transfer rate, ETA and pause/resume/cancel, using data returned from the authorised desktop companion.
6. Installation is a separate local process, never silently executed from the browser.

## What this branch implements

- These UI states, selectors and progress controls now exist in `integrations/hydra/web-panel.js`.
- Authenticated, opt-in server endpoints `/api/hydra/bridge/options?gameId=`, `/api/hydra/bridge/downloaders?gameId=&optionId=`, `/api/hydra/bridge/downloads`, and POST `/api/hydra/bridge/command` use a validated JSON contract.
- Limited, safe browser payloads use opaque IDs, name, source, size, date, downloader availability, and progress. No magnet, torrent URI, raw credentials, installation command, or local filesystem path is exposed.
- Per-job local approval is required before `queue` can return success. All bridge actions are hidden if the companion is disconnected; the old cached Hydra index search still works.
- The official verified v1.6.7 packaged app is patched by `scripts/apply-hydra-bridge-v1.6.8.js`; the web game editor includes the new capability-gated panel alongside the prior cached search.
- `scripts/apply-hydra-desktop-panel.js` adds **Manage Hydra downloads** inside both native desktop game-detail views, using Electron's trusted preload/API surface and the shared download manager interface. The pre-existing desktop action to open Hydra Launcher remains the fallback.
- Unit tests cover API authorization, CSRF and origin validation, request redaction, companion authentication, selecting a source/downloader, local-approval rejection, DOM text safety and queue/progress UI.
- Windows CI builds a **development-only** installer and tests a 1.6.7 → development 1.6.8 upgrade without deleting RAMpage user data.

## Critical operational limitation

**A stock Hydra Launcher executable does not expose a documented third-party download start, source-option listing, downloader configuration or installer API.** The screenshot features are implemented as an operational *interface and protocol*, but they are not connected to Hydra's private Electron IPC. This branch cannot fetch Hydra repack listings or actually start them via the installed Hydra executable. The embedded bridge defaults to `createHydraBridge(null)` and `canManageDownloads:false`, so the new action controls stay disabled and no unsupported code is executed.

The companion client `integrations/hydra/companion-client.js` defines a future **127.0.0.1-only**, bearer-authenticated protocol for a properly developed and opt-in Hydra-side component: `/v1/status`, `/v1/games/search`, `/v1/games/options`, `/v1/downloaders`, `/v1/downloads`, `/v1/downloads/command`. These routes are a proposed RAMpage **companion contract**, not currently shipped Hydra endpoints.

Future completion requires a supported Hydra-side provider that can legitimately supply selectable options and control the downloader, PC-side pairing UX, local approval for each job, integration with the current RAMpage desktop window, and hardware/on-device tests. Do not install untrusted custom Hydra components or extract Hydra account secrets to bypass this requirement.

## Release policy

Do not publish a v1.6.8 public release as a working Hydra downloader until the real companion and source compatibility tests pass. Development artifacts are **not** automatic-update releases. Use only content the user is authorised to download.
