# eDIN+ Gateway Control

Desktop app (Electron) for talking to an eDIN+ / Mode lighting gateway over HTTP or TCP port 26: rooms, scenes, channels, DALI, and keypad.

**Current version:** 1.4.2 — [release notes](CHANGELOG.md)

## Download

The Windows portable exe is the supported build. No installer.

- **Latest:** https://github.com/AxiumDND/eDinPlusGateway/releases/latest
- **Windows exe:** [eDIN-Plus-Gateway-Control-1.4.2.exe](https://github.com/AxiumDND/eDinPlusGateway/releases/download/v1.4.2/eDIN-Plus-Gateway-Control-1.4.2.exe)

Unpacked Windows/Linux zips and source are attached on the same release page.

## Run from source

```bash
git clone https://github.com/AxiumDND/eDinPlusGateway.git
cd eDinPlusGateway
npm install
npm start
```

Preview the UI in a browser (no gateway, demo rooms):

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

## Release a new version

1. Bump **only** `package.json` / `package-lock.json` (the UI reads `app.getVersion()` in the exe, or `package.json` in preview).
2. Add a `## [X.Y.Z]` section at the top of `CHANGELOG.md`.
3. Merge to `main` and wait for Tests to pass.
4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "eDIN+ Gateway Control X.Y.Z"
   git push origin vX.Y.Z
   ```

5. The **Release** workflow builds the portable Windows exe, zips, `SHA256SUMS.txt`, and publishes the GitHub Release.

Do not attach hand-built binaries unless CI cannot run. The primary artifact name is:

`eDIN-Plus-Gateway-Control-X.Y.Z.exe`

## Docs

Gateway protocol PDFs are in `GatewayPDFs/`. Command helpers live in `gateway-protocol.js`.

## License

MIT — see [LICENSE](LICENSE).
