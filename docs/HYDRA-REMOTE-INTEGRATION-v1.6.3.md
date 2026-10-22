# Hydra Launcher integration for RAMpage Remote Library (v1.6.3)

RAMpage can optionally include games from the **locally installed Hydra Launcher** in the same password-protected web library as Steam, Epic, GOG, and other RAMpage games. No Hydra account login, internet API or account token is required.

## Enable (desktop only)

1. Update RAMpage using Settings → Check for updates to v1.6.3.
2. Open RAMpage **Settings → Remote library access → Hydra Launcher integration**.
3. Click **Enable Hydra integration**, then **Refresh Hydra games**.
4. The Settings line reports whether Hydra was detected, imported game count and last successful refresh.
5. Enable RAMpage's regular password-protected Web library if not already enabled, then select **Create HTTPS link** to access it from another device.
6. After signing into the RAMpage web URL, the Hydra games appear as a distinct source; the **Hydra Launcher** filter appears only when Hydra games are available.

The integration is **disabled by default** and can only be activated from local desktop Settings, not the public web endpoint. When disabled, Hydra games disappear from the remote catalogue immediately.


## Disclaimer — Hydra Launcher and copyrighted games

**Hydra Launcher is an alternative game launcher. RAMpage's optional Hydra integration only lets you view library information and edit RAMpage metadata. It does not provide, download, distribute, or grant access to pirated or otherwise unauthorised games or content.**

RAMpage's integration is a read-only source connection to locally installed Hydra game records, except that personal metadata changes are stored separately in RAMpage. It does not contain links or functionality for obtaining game files. Use games and content only when you have the necessary rights or permissions.

The same disclaimer is displayed beneath **Hydra Launcher integration** in the desktop Settings and within the authenticated remote library **only when Hydra games are available**. This does not make claims about other features of the third-party Hydra application.

## Security and data integrity

- RAMpage reads a **temporary snapshot** of Hydra's LevelDB game-record sublevel (`games`) via the bundled Node/ClassicLevel helper.
- The reader checks known Windows locations below `%APPDATA%\hydralauncher\hydra-db` and `%APPDATA%\hydra\hydra-db`.
- RAMpage **never writes into Hydra's live database**, modifies its config, downloads games, or accesses Hydra login/API credentials.
- The remote site only receives sanitized game title, source, installed state, non-local HTTPS artwork, platform and playtime. Executable paths, ROM paths, account information, download URLs and private assets are not returned.
- **Remote metadata edits are RAMpage-only overrides**, persisted in `RAMpage`'s own data directory. They don't change the names/covers that Hydra itself shows. Disabling and re-enabling integration preserves those overrides.
- The import has read-only limits (5,000 games, 500MB snapshot, 60-second timeout). Data is only merged into remote results after a successful full read. Failures keep the previous successful snapshot in RAMpage memory and do not change Hydra.
- If the Hydra database is busy or its schema changed, refresh can fail safely. Retry or briefly close Hydra and refresh.
- RAMpage's existing local-only web server, 16+ character password, login throttling, cookies and CSRF protection are unchanged.
- Cloudflare Quick Tunnels still expose a password-protected **public** sign-in URL when explicitly activated. Stop sharing when finished.

## Compatibility

Official Hydra 4.x source uses ClassicLevel with a `games` sublevel, a `hydra-db` database inside Electron `userData`, and `shop`/`objectId`/title fields. Earlier Hydra builds used different storage schemas; compatibility for those builds is not guaranteed.

[Hydra official source](https://github.com/hydralauncher/hydra) · [RAMpage releases](https://github.com/ctrlaltandfix/RAMpage/releases)
