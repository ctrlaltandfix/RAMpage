# RAMpage v1.6.1 — One-click remote library access

This feature replaces the previously recommended Tailscale setup with a simpler **optional temporary HTTPS link** managed directly from RAMpage Settings.

## Set up in RAMpage

1. Update to RAMpage **v1.6.1** using **Settings → Check for updates**.
2. Under **Settings → Remote library access**, enter a password with **at least 16 characters** and select **Enable access**.
3. Select **Create HTTPS link**. RAMpage runs its bundled, checksum-verified Cloudflare Quick Tunnel component on the gaming PC.
4. Copy the `https://<random>.trycloudflare.com` link and open it on any other computer, tablet or phone. Sign in using your RAMpage web-library password.
5. Browse the library and edit supported game metadata; changes update RAMpage's **existing live library and journal**, not a second cloud copy.
6. Click **Stop sharing** in Settings to terminate the tunnel immediately.

### Important privacy distinction

A temporary Cloudflare HTTPS URL is **publicly reachable**, unlike a private Tailscale URL. Someone who obtains the URL can visit RAMpage's password-protected sign-in page. The strong password and existing authentication, CSRF and login-throttling checks protect library content. Do not share the link publicly or use a weak/reused password.

Cloudflare can relay HTTPS requests; your gaming PC remains the data host. RAMpage does not upload a copy of its library into a Cloudflare storage database. The original web service still binds only to `127.0.0.1:43681`. No router port forwarding, DNS setup, Tailscale application, VPN account, or separate Cloudflare installation is required.

### Limitations

- Cloudflare Quick Tunnels are designed for **temporary/testing use**. They have no uptime guarantee; the HTTPS hostname changes whenever a new tunnel is created.
- RAMpage must remain running on your Windows gaming PC and have outbound internet access.
- The link stops when you stop sharing, disable the web library, exit RAMpage or the tunnel process disconnects.
- The Quick Tunnel option does **not** make the application a permanent always-online cloud service.
- Only the existing safe metadata fields can be edited, not executable paths or device control.

### Security and implementation

- One-click tunnel component from official `cloudflare/cloudflared` release `2026.10.1`, Windows amd64 SHA-256:
  `4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6`.
- Child process is launched without a shell with an explicit `--url http://127.0.0.1:43681` target.
- Generated URL is accepted only for a valid `*.trycloudflare.com` HTTPS hostname.
- Existing RAMpage salted-scrypt credentials, password gate, session cookies, CSRF, request throttling, metadata validation and journal persistence remain unchanged.

If you need a **stable private hostname**, Tailscale or an authenticated Cloudflare Tunnel attached to your own domain remains more appropriate.
