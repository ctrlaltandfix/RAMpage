# RAMpage 1.6 — private remote library

This feature is **off by default**. It serves the **actual RAMpage library** from the Windows computer, with no cloud database.

## Enable

1. Use RAMpage **Settings → Remote library access**.
2. Enter a strong password (at least **16 characters**) and choose **Enable access**.
3. Test it on that Windows PC: **http://127.0.0.1:43681/**.
4. For remote access from your own other devices, install and sign in to [Tailscale](https://tailscale.com/download) on both the gaming PC and remote device.
5. On the Windows gaming PC, open PowerShell and run:
   ```powershell
   tailscale serve --bg 43681
   ```
6. Open the private **HTTPS address Tailscale prints** (typically a machine hostname ending in `.ts.net`) on your other device. Enter the RAMpage web-library password.

You can view **every game source** (Steam, Epic Games, GOG, console emulators and manually added titles), filter installed/uninstalled games, search, and edit name, description, genres, developers, publishers, release date, notes, favourite/hidden state, website and HTTPS cover URL. Changes are saved back to the running RAMpage journal and reflected in its normal desktop library.

## Privacy and security

- There is **no public access** when installing. A password is required and the feature must be enabled manually.
- RAMpage only listens on **127.0.0.1:43681**, never on all network interfaces. HTTPS access from remote devices goes through **Tailscale Serve**, restricted to your private Tailscale network. **Do not use Tailscale Funnel or router port forwarding.**
- Authentication uses a salted scrypt password hash, restricted login attempts, a same-origin session cookie and anti-CSRF token. The service does not return ROM paths, executable targets, library settings or API keys.
- Only the supported metadata fields can be changed through the web API. There is no web game launch/stop/system-power capability.
- Passwords and remote-session data remain on the gaming PC. Web edits use the same durable storage as desktop edits, and concurrent changes are protected by per-game revision checking.
- Keep **RAMpage open on the Windows PC** and keep that PC powered on. The private URL will not work otherwise.
- Disable the feature from RAMpage Settings; this stops the local server and invalidates all active web sessions. You can set a new password in Settings to invalidate old sessions.
- To stop Tailscale Serve independently, run `tailscale serve off` on the Windows PC.

This is a locally hosted feature; RAMpage does not create a public cloud service or a globally accessible URL by itself. Once Tailscale Serve is configured, it provides your private hostname automatically.
