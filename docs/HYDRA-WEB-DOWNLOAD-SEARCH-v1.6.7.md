# RAMpage 1.6.7 — Hydra Download Search and Installer Status in the Web Library

After using **+ Add a Download** in RAMpage's password-protected web library, the newly created **Not installed** Hydra game now has a download-management section in its game editor.

## Controls

- **Search for Downloads** — searches Hydra's existing locally cached game records for matching titles. It displays the names and any counts of new download options recorded by Hydra. This is NOT a live search of Hydra's online catalogue or complete list of download-source links.
- **Download / Installer Status** — reads the locally cached Hydra download index, showing any matching items' queue status and progress. It shows the last Hydra synchronisation time and does not claim to verify completed Windows installation.
- **Install Using Hydra** — shows the next steps for opening Hydra Launcher on your gaming PC, searching the title, selecting an authorised download, installing it in Hydra, then linking the installed game executable in RAMpage Properties.
- **Copy Title** — copies that game's title to the device's clipboard so it can be searched inside Hydra.

The **Search for Downloads** action also appears immediately after creating a Hydra placeholder via the web's **+ Add a Download** dialog.

## Visibility and authentication

These controls are visible **only** when (a) Hydra integration was explicitly enabled on the gaming PC in RAMpage Settings, (b) the web visitor is logged in to RAMpage's password-protected remote library, and (c) the selected library entry is a user-created, uninstalled Hydra download placeholder. An ordinary installed game does not show these controls.

Search/status queries use the existing authenticated read-only `/api/hydra/index` service. No new public download-related API endpoints are added. The existing anti-CSRF protection for game creation/metadata editing, sign-in gate, login throttling, Cloudflare HTTPS link and local game persistence remain unchanged.

## Why the browser does not run a Hydra installer

Hydra's download and installation workflow currently lives within the installed Hydra Electron app. The public project does **not** document a supported cross-process RPC/deep link for initiating a named game's download or installer. Hydra's internal `startGameDownload` call requires a downloader, URI, target path and other user-selected options. RAMpage does not read Hydra access tokens, fetch community magnet/repack URLs, spawn installers or issue arbitrary download commands from its public web endpoint.

The browser reports only **locally cached search matches and known progress**. The actual download/install must be selected inside Hydra on the PC. This release is a partial integration; fully remote download and installation control would require an officially supported Hydra-side API with user-authorised source selection, approvals, validation and progress callbacks.

Only use downloads and game files you are legally entitled to access. The original Hydra alternative-launcher and unauthorised-content disclaimer remains.

See [Hydra source](https://github.com/hydralauncher/hydra) and [RAMpage releases](https://github.com/ctrlaltandfix/RAMpage/releases).