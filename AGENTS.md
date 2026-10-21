# RAMpage — AI development instructions

Project: RAMpage, a Windows 10/11 x64 Electron game launcher with Desktop and controller-oriented Big Picture modes.
GitHub: https://github.com/ctrlaltandfix/RAMpage
Release feed: GitHub Releases for this repository.

## Critical current state (verified 2026-10-21)
- Latest observed release tag: **v1.2.27**, published 2026-10-21, with `RAMpage-Setup-1.2.exe` and its `.sha256` checksum.
- The `main` branch contains project documentation and release workflows, **not the complete current RAMpage application source**.
- `.github/workflows/publish-release.yml` publishes an installer from `release-staging` after reassembling chunks and checking its checksum.
- `.github/workflows/build-and-publish-rampage.yml` is a legacy v0.2.5 recovery build that downloads v0.2.4, patches it and publishes v0.2.5. **Do not run or repurpose it as the current-source build.**
- A historic, separately saved `RAMpage-0.2.5-persistence-fix-source.zip` includes the old Electron `src/`, `build/`, `package.json`, `package-lock.json` and tests. **Do not mistake it for v1.2.27.**
- Shared Claude conversation supplied by the project owner: https://claude.ai/share/ca9027b3-8bb6-465e-be68-ed07b5ea7236 . The shared conversation has not been imported in full, because the link cannot be read by this integration.

## Priorities for the next coding session
1. Import the **actual source tree used to make v1.2.27**, ideally a source archive from the original development environment. If that source is missing, recover the packaged Electron app from the official v1.2.27 installer for inspection, but recognize it may lack build-time scripts and source maps.
2. Verify source version and feature parity with v1.2.27 before modifying or publishing anything.
3. Add a source-controlled Windows GitHub Actions build/test workflow (prefer `windows-latest`) that uses `npm ci`, automated tests, installer build, SHA-256 verification and retention of CI artifacts; make publication a deliberate, guarded step.
4. Resolve existing updater reliability issues only against the current source.
5. Introduce future changes on a feature branch / pull request, with changelog and tests.

## Features and invariants to preserve
- Steam, Epic Games and GOG discovery; manually added programs and shortcuts; store-aware launching.
- Metadata / artwork lookup, game library browsing, Big Picture mode, controller support and play-time tracking.
- Settings / update experience, latest-release lookup, installer naming and SHA-256 checking.
- User data in `%APPDATA%\\RAMpage` and related `%LOCALAPPDATA%\\RAMpage\\data` recovery data. Never delete, reset, or silently overwrite users' libraries, favorites, metadata or play history.
- Historic v0.2.5 introduced `manual-games.ndjson` recovery and persistence regression tests; verify equivalent or newer guarantees in the current source.

## Rules for versions and publishing
- Make the **installed app's actual semantic version** strictly higher than the installed predecessor for an updater-visible release; publishing only a new tag while shipping an old package version may not yield a visible update.
- Never replace a current v1.2.x build with the historic v0.2.5 source.
- Keep the installer asset name compatible with the runtime updater and staged-release workflow; verify the corresponding checksum file.
- Do not remove previous GitHub Releases automatically, rewrite history, or trigger production release publication without a clear, reviewed request.
- Do not embed tokens, local paths, license keys, secrets, or personal game data in committed source.

Read `docs/CHATGPT_HANDOVER.md` before starting a release or migration task.
