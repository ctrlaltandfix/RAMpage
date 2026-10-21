# RAMpage — transition from Claude to ChatGPT

**Handover date:** 2026-10-21 (Australia/Sydney)  
**Repository:** https://github.com/ctrlaltandfix/RAMpage  
**Original shared Claude chat:** https://claude.ai/share/ca9027b3-8bb6-465e-be68-ed07b5ea7236

This is a checked, source-aware handover. The Claude share link could not be read through the available web integration; it is **not** represented as a full transcript import.

## Verified repository state

| Item | Status |
|---|---|
| Default branch | `main` |
| Latest verified release | `v1.2.27`, published 2026-10-21 |
| Windows installer | `RAMpage-Setup-1.2.exe` |
| Release integrity file | `RAMpage-Setup-1.2.exe.sha256` |
| Latest publish job | `Publish RAMpage release`, successful |
| Editable application source at main | **Not present** |
| Release publishing workflow | `.github/workflows/publish-release.yml` |
| Historic v0.2.5 patch workflow | `.github/workflows/build-and-publish-rampage.yml` (not suitable for building 1.2.x) |

The project owner has previously shared `rampage-source.zip` (v0.2.4) and `RAMpage-0.2.5-persistence-fix-source.zip` (v0.2.5) in ChatGPT. These are historic snapshots, **not** current v1.2.27 source.

### Existing publishing process

The historic 0.2.5 source tree includes:
- `src/main.js`, `src/storage.js`, `src/scanners.js`, `src/metadata.js`, `src/updater.js`, `src/preload.js` and `src/renderer/`
- `build/installer.nsi`, `build/make-installer.js`, `build/publish-release.js`, installer graphics and an icon
- `package.json`, `package-lock.json`, persistence regression tests

In that historical source, `npm ci` installs dependencies, `npm test` runs regression tests, `npm run dist` builds a Windows installer, and `npm run publish` stages the installer through the `release-staging` Git branch. The publishing workflow checks the checksum and creates/updates a GitHub Release. **Re-check these scripts against imported 1.2.27 source; historic commands are not proof that current builds work unchanged.**

The existing staged-release GitHub Action automatically processes a completed `staging/release.json` on `release-staging` and may delete releases listed in `remove`. Do not stage unreviewed releases.

### What changed during the transition

Confirmed recent v1.2.2x release notes mention Big Screen cover-art layout, Windows startup behavior, Xbox-button / Quick Access handling, improved stopping of games, and multiple controller-input fixes. Older source archives do **not** contain all these features.

## Source import checklist

1. **Preferred:** get the complete folder / source ZIP from the Claude development project corresponding to `v1.2.27`. Check the `package.json` version, GitHub update setting, and all application and build files.
2. **Fallback:** use the **official** published v1.2.27 Windows installer to inspect/recover the packaged Electron `resources/app.asar` (for example using 7-Zip and an Electron ASAR unpacking tool). Do not assume this recovered app is a complete reproducible source tree; rebuild assets, scripts, lockfile and signing/installer configuration may be omitted.
3. Put recovered source in a new branch, not directly into production `main`. Compare features against the installer, run static/syntax checks and test Windows 10/11 as possible.
4. Validate non-destructive upgrades using a backup of `%APPDATA%\\RAMpage` and `%LOCALAPPDATA%\\RAMpage\\data`.
5. Introduce a reproducible Windows CI workflow: `npm ci`, tests, `npm run dist`, installer smoke checks, SHA-256 checksum and uploaded build artifact. Keep release creation gated on explicit review/approval.
6. For the next release, use a monotonically increasing **installed application version** (for example `1.2.28` only after source is verified) and a matching unique release tag. Preserve whatever installer naming the runtime updater expects.

## Known updater concern

Past RAMpage work reported that an update sometimes did not appear inside the built-in checker. Review `src/updater.js` from the current source, not the old archive. In historic code, GitHub's `releases/latest` endpoint is checked and tags are compared with `app.getVersion()`; a tag/version mismatch, wrong latest-release status, missing/incorrectly named installer or checksum assets, or an incorrect feed can prevent correct discovery. Test a real upgrade on Windows, including resume/relaunch and library preservation.

## Workflow when asking ChatGPT for future changes

Ask for one feature or bug fix, pointing to `ctrlaltandfix/RAMpage`. Expect an implementation branch, tests and a pull request first. After review, ask for the Windows build/release explicitly. ChatGPT should check the repository's current code and release state every time rather than relying on an old ZIP or old version numbers.

**Migration status:** repository and release pipeline verified; handover recorded; **current v1.2.27 editable source still needs importing or recovery.** No release or installer has been altered as part of this documentation handover.
