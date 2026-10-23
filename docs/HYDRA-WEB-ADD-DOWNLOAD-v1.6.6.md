# RAMpage 1.6.6 — Add a Download in the remote web library

RAMpage now supports creating Hydra game download placeholders using the **same password-protected remote web interface** used to manage game metadata. It does not download or install anything from the web.

## Enable and use

1. Update the Windows desktop RAMpage application to v1.6.6 through Settings → Check for updates.
2. On the gaming PC, open RAMpage **Settings → Remote library access → Hydra Launcher integration** and explicitly enable Hydra. The web feature is hidden and unavailable otherwise.
3. Enable the existing password-protected RAMpage remote web library and create your temporary HTTPS link as usual.
4. On your phone, tablet or another computer, open the link and sign in with the RAMpage remote library password.
5. The **+ Add a Download** button appears in the game collection header only if Hydra is enabled on the desktop PC.
6. Enter a title and optionally click **Check cached options** to see any already-known new-download counts from the signed-in local Hydra index.
7. Click **Create empty game entry**. The game is durably saved to RAMpage as **Not installed** (no executable, no downloaded game files). Duplicate pending titles reuse the same entry.
8. Click **Copy game title** if useful. To actually download anything, open the **Hydra desktop application on your gaming PC**, search for the title and choose the appropriate available download in Hydra. The website does not launch Hydra or initiate its downloader.
9. Once installed, attach the executable to the placeholder in RAMpage desktop game Properties. Its metadata can also be edited through the remote website.

## Privacy and safety

- Web creation is possible only after RAMpage remote password sign-in **and** separate Hydra integration activation on the desktop PC.
- The game creation endpoint is a POST request protected by a same-origin check and the existing per-session anti-CSRF token.
- Server rejects malformed/oversized titles, rate-limits new placeholders (12 per web session per hour) and checks a bound on Hydra placeholders in the library.
- The unauthenticated web client cannot learn whether Hydra is enabled, browse options, or create entries.
- The remote server exposes no Hydra process launch, filesystem access, account tokens, download-source URLs, torrent magnets, or downloader command.
- Disabling Hydra in RAMpage Settings removes the web Add a Download option on refresh and blocks new creations immediately. Existing user-created entries remain in the library as normal games.
- The new web feature creates the **same normal RAMpage library entry as Add a Game → Download a Game in the desktop application**. There is no separate cloud library.
- The existing Hydra disclaimer applies: this optional alternative-launcher integration doesn't provide pirated or otherwise unauthorised content.

**Limitations:** Hydra has no stable documented third-party command or deep link for specific game download choices. Accordingly RAMpage cannot safely start a Hydra download from another device using the current integration. The only available web action is to manage the game entry and check local cached option counts.

[RAMpage releases](https://github.com/ctrlaltandfix/RAMpage/releases) | [Hydra official project](https://github.com/hydralauncher/hydra)