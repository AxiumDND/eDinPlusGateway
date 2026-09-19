# eDIN+ Gateway Control

Electron desktop app for an eDIN+ / Mode lighting NPU. **HTTP is the main path** (`POST /gateway?` and `GET /info`). TCP port 26 is only used if HTTP fails, or if Setup is set to TCP only. Each NPU accepts **four** TCP sessions — this app keeps at most one and FIN-closes it.

**Current version:** 1.5.1 — [changelog](CHANGELOG.md)

## Features

- **Control** — rooms, scenes, live `?SCNS` / `!SCNSTATE` feedback
- **Adjust** — channel sliders, Flash, nudge
- **DALI** — loop identify / BST
- **EM Dali** — eTEST-style emergency commissioning and IEC 62386-202 tests
- **Keypad** — `$BTNSTATE`
- **Setup** — IP, HTTP vs TCP, `/info` catalog, command log

## Download

The Windows portable exe is the supported build. No installer.

- **Releases:** https://github.com/AxiumDND/eDinPlusGateway/releases
- After the Release workflow runs, the file is `eDIN-Plus-Gateway-Control-X.Y.Z.exe`

## Run from source

```bash
git clone https://github.com/AxiumDND/eDinPlusGateway.git
cd eDinPlusGateway
npm install
npm start
```

Preview the UI in a browser (demo rooms, no gateway):

```bash
npx --yes serve -l 8765
# open http://127.0.0.1:8765/index.html?preview=1
```

Requires Node.js 18+ (CI uses 22).

## Tests

```bash
npm test
```

GitHub Actions runs the same suite on every push to `main` and on pull requests.

## Docs

- [docs/gateway-interface.md](docs/gateway-interface.md) — Volumes 1–3 working map (HTTP first, EM Dali, `/info`, scene events)
- Official Mode PDFs in [`GatewayPDFs/`](GatewayPDFs/)
- Long command dump: [`gateway_readme.md`](gateway_readme.md)

## Release a new version

1. Bump **only** `package.json` / `package-lock.json` (the UI reads `app.getVersion()` in the exe).
2. Add a `## [X.Y.Z]` section at the top of `CHANGELOG.md`.
3. Merge to `main` and wait for Tests to pass.
4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "eDIN+ Gateway Control X.Y.Z"
   git push origin vX.Y.Z
   ```

5. The **Release** workflow builds the portable Windows exe, zips, `SHA256SUMS.txt`, and publishes the GitHub Release.

Primary artifact name: `eDIN-Plus-Gateway-Control-X.Y.Z.exe`

## License

MIT — see [LICENSE](LICENSE).
