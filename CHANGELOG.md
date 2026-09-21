# Changelog

All notable changes to eDIN+ Gateway Control are recorded here.
The version in `package.json` is the source of truth. GitHub Releases are created from `v*` tags.

## [Unreleased]

### Fixed
- Kitchen `?SCNS` polls no longer treat an active **Disable Sensor** / PIR scene as Off and wipe the room
- Sensor and PIR scenes send `$SCNRECALL` instead of `$SCNOFF`
- Scene names decode `&amp;` so captions match the plates

## [1.5.1] - 2026-09-19

### Changed
- Dependabot updates: Electron 44, electron-builder 26, GitHub Actions checkout/setup-node/release v7/v3
- Drop `node-fetch` (v3 is ESM-only); HTTP uses built-in `fetch` with an abort timeout

## [1.5.0] - 2026-09-19

### Added
- **EM Dali** page: eTEST-style fitting tiles, IEC 62386-202 identify / function / duration tests via `$XDALIAPP`, groups 14 and 15
- Working gateway reference for Volumes 1–3 in `docs/gateway-interface.md`
- HTTP `GET /info` names + levels catalog for Control
- Live scene feedback from `!SCNSTATE` / `?SCNS`

### Changed
- HTTP (`POST /gateway?`) is the default path; TCP port 26 is fallback or Setup **TCP only**
- TCP sessions FIN-close so the NPU’s four slots stay free

## [1.4.2] - 2026-09-18

### Fixed
- **Show command log** on Setup now opens the command log immediately at the bottom of the window in the packaged Windows exe
- Log is a fixed panel (no longer clipped below the Setup form)
- Unchecking the box hides the log again

## [1.4.1] - 2026-09-18

### Added
- Visible version on the Control home screen and under the sidebar logo
- Node test suite for gateway parsing (`npm test`)
- GitHub Actions test workflow on push and pull request

## [1.4.0] - 2026-09-18

### Added
- Design Studio look and feel for Control (rooms, scenes, sliders, Flash, nudge)
- eDIN+ sidebar logo
- Command log hidden by default, revealed from Setup

## [1.3.1] - 2026-05-02

Tag only. No GitHub Release assets were published for this version.

## [1.3.0] - 2026-05-02

Tag only. No GitHub Release assets were published for this version.

## [1.2.2] - 2026-05-02

Tag only. No GitHub Release assets were published for this version.

## [1.2.1] - 2026-05-02

Tag only. No GitHub Release assets were published for this version.
