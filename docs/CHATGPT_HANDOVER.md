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

## Verified recovery outcome (2026-10-21)

- [Recovery workflow run #39572599068](https://github.com/ctrlaltandfix/RAMpage/actions/runs/39572599068) **succeeded**. Installer official SHA-256 verified.
- [7-day Actions artifact](https://github.com/ctrlaltandfix/RAMpage/actions/runs/39572599068/artifacts/12332153143) contains the extracted packaged v1.2.27 application (18 files, including 15 packaged app files).
- Confirmed packaged `package.json` version **1.2.27**. Recovered `src/main.js`, `src/preload.js`, `src/renderer/{index.html,app.js,styles.css}`, scanners, storage, updater, SteamGridDB, emulators, platforms and metadata.
- A separate candidate development ZIP was assembled in ChatGPT using **v1.2.27 application code** and **v0.2.5 historic build tooling**. JavaScript syntax checks pass; the historic test suite had **6 passing and 4 failing** tests (two tests depend on older mocks, two use older storage/tombstone assumptions). This is **not release-ready**; the full Windows build and upgrade smoke tests remain outstanding.
- No existing GitHub release or installer was changed. Do not commit recovered source to this public repo without project-owner approval.
\n## Source import checklist

1. **Preferred:** get the complete folder / source ZIP from the Claude development project corresponding to `v1.2.27`. Check the `package.json` version, GitHub update setting, and all application and build files.
2. **Fallback:** use the **official** published v1.2.27 Windows installer to inspect/recover the packaged Electron `resources/app.asar` (for example using 7-Zip and an Electron ASAR unpacking tool). Do not assume this recovered app is a complete reproducible source tree; rebuild assets, scripts, lockfile and signing/installer configuration may be omitted.
3. **Privacy decision first:** this GitHub repository is public and has been used as a releases repository. Do **not** commit unreleased/proprietary source here without the owner's permission. Prefer a separate private GitHub source repository if that is how the owner wants to work. Put recovered source in a new branch of the approved repository, then compare features against the installer, run static/syntax checks and test Windows 10/11 as possible.
4. Validate non-destructive upgrades using a backup of `%APPDATA%\\RAMpage` and `%LOCALAPPDATA%\\RAMpage\\data`.
5. Introduce a reproducible Windows CI workflow: `npm ci`, tests, `npm run dist`, installer smoke checks, SHA-256 checksum and uploaded build artifact. Keep release creation gated on explicit review/approval.
6. For the next release, use a monotonically increasing **installed application version** (for example `1.2.28` only after source is verified) and a matching unique release tag. Preserve whatever installer naming the runtime updater expects.

## Known updater concern

Past RAMpage work reported that an update sometimes did not appear inside the built-in checker. Review `src/updater.js` from the current source, not the old archive. In historic code, GitHub's `releases/latest` endpoint is checked and tags are compared with `app.getVersion()`; a tag/version mismatch, wrong latest-release status, missing/incorrectly named installer or checksum assets, or an incorrect feed can prevent correct discovery. Test a real upgrade on Windows, including resume/relaunch and library preservation.

## Workflow when asking ChatGPT for future changes

Ask for one feature or bug fix, pointing to `ctrlaltandfix/RAMpage`. Expect an implementation branch, tests and a pull request first. After review, ask for the Windows build/release explicitly. ChatGPT should check the repository's current code and release state every time rather than relying on an old ZIP or old version numbers.

**Migration status:** repository and release pipeline verified; handover recorded; v1.2.27 packaged application files **recovered** from the official release as a workflow artifact. Full source-controlled build readiness is still pending. No release or installer has been altered by this process.
