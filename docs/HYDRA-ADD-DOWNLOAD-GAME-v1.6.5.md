# RAMpage v1.6.5 — Add a Game > Download a Game (Hydra)

The **Download a Game** choice is visible in RAMpage's desktop Add a Game wizard **only after** the user explicitly enables Hydra Launcher integration under **Settings → Remote library access**. When disabled it remains absent and main-process IPC refuses requests even from a compromised renderer.

## Workflow

1. Enable **Hydra Launcher integration** in RAMpage Settings. Sign into the installed Hydra app if you want to see locally indexed option counts.
2. Open **Add a Game → Download a Game**.
3. Enter a valid game title (2–160 characters) and select **Create empty game entry**.
4. RAMpage saves an uninstalled custom game with no executable, file, download URL or command. Repeating the same title reuses an existing pending entry rather than making duplicates.
5. Optionally see the count of newly indexed Hydra download options already in its local database; the count is not a list of available downloads and may be stale.
6. Click **Open Hydra available downloads**. RAMpage copies the title to the local clipboard and launches/focuses the installed Hydra app through Hydra's registered `hydralauncher://` protocol. Paste the title into Hydra's own search and choose one of its available downloads.
7. Actual download selection, authorisation, execution, progress and installation remain entirely inside the Hydra Launcher app. **The RAMpage button does not start the download.**
8. Return to RAMpage after installation, open your placeholder's **Properties**, select the real game executable (.exe or .lnk), and save. RAMpage marks it installed and can launch the linked game.

From the game details page or its uninstalled Play/Download button, you can reopen Hydra and copy the title again. The placeholder persists across RAMpage restarts in the normal library journal.

## Scope and limitations

Hydra does not expose a documented third-party deep link to an individual game's download selector or external API to start community-sourced downloads. Thus RAMpage **cannot honestly offer a true one-click game download**. This feature performs the safe available action: creates a local placeholder, shows bounded read-only cached new-option counts where available, and hands the user to Hydra for final selection. We do not manipulate its internal Electron IPC, scrape download links, copy its account tokens or open publicly accessible download-control endpoints.

Only choose games and content you are legally entitled to use. The existing Hydra alternative-launcher and unauthorised-content disclaimer stays in Settings and the remote library.

## Privacy and testing

- Hydra enable check runs both when displaying the wizard and again in every create/options/open main-process handler.
- No downloads, filesystem writes outside RAMpage's own existing library journal, executable execution or remote download commands are triggered by the feature.
- Game title is deliberately copied to Windows clipboard only when the user chooses the Hydra handoff.
- Existing Cloudflare one-click web access, authentication, metadata overrides, ShadPS4 Quick Access and updater remain unchanged.
- Windows CI validates packaged source, placeholders, opt-in gating, local URL handoff, saved-data preservation and v1.6.4→v1.6.5 installation.

Hydra project: https://github.com/hydralauncher/hydra