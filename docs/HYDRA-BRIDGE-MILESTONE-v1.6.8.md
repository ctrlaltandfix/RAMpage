# RAMpage v1.6.8 — Hydra bridge milestone (development, not a release)

This branch introduces `integrations/hydra/bridge.js`, a dependency-free CommonJS boundary for a future supported Hydra-side companion. The existing v1.6.7 browser remains read-only for Hydra download search/status until a real adapter and authenticated server route are connected.

## Current implementation
- Enforces authenticated RAMpage sessions plus locally enabled Hydra integration for reads.
- Enforces explicit manage permission AND previously verified CSRF for any download mutation.
- Validates opaque game, option and download IDs; never accepts a user-supplied downloader URI, filesystem path, executable command, magnet or arbitrary process arguments.
- Projects search and download results to a minimal set of safe fields; does not leak credentials or paths.
- Allows queue/pause/resume/cancel requests only to an explicitly supported adapter; otherwise returns UNAVAILABLE.
- Always requires local approval for installation. Remote installer requests **do not execute any code**.
- Includes six Node built-in test cases (run: `node --test integrations/hydra/bridge.test.js` on Node 18+).

## REQUIRED before any functional remote downloader feature
1. Obtain current editable v1.6.7 **application** source and map the existing authenticated remote service, desktop Hydra opt-in, renderer and build pipeline. This public branch does not replace those modules.
2. Implement or acquire an independently reviewed Hydra-side companion that exposes an explicitly supported protocol and owns its downloader choices, destination selection, permissions and actual progress events. Hydra's renderer-only Electron IPC is NOT an external API; do not inject into the process, copy authentication secrets or write the Hydra DB.
3. Pair the companion locally, authenticate it with scoped ephemeral credentials stored on the gaming PC, bind loopback only, and enforce replay protection, timeouts and rate limiting. Do not expose a companion port to the public network.
4. Adapt bridge methods to the actual protocol; carry the desktop opt-in and authenticated user context from existing RAMpage server middleware (never trust client-provided flags).
5. Expose only whitelisted methods through existing RAMpage remote authenticated routes; ensure server-side CSRF, origin checks, rate limits, concurrency control, audit trails and no direct file/URI input.
6. Add desktop and web UI controls: search choices, confirmation, queue, pause/resume, cancel, errors and status polling/events; don't imply that cached indexed results are a live search.
7. Installer actions must require **independent local confirmation** and platform safety checks; never auto-run unknown binaries from a web command.
8. End-to-end test against an installed compatible Hydra version on Windows, run clean installation and in-place upgrade tests, preserve AppData, and verify independent in-app updater detection before publishing a numbered release.

## Compatibility and status
**Not production ready. No new RAMpage installer has been built or published.** This is an isolated foundation, not a direct Hydra integration. It does not claim to remotely download games, fetch live Hydra sources, or install anything.

Use only content you are authorised to obtain, and keep Hydra credentials and private source links inside Hydra.
