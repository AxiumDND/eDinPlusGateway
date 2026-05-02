# eDin+ Gateway — Mobile App Plan

A plan to deliver iPhone and Android apps with feature parity to the current
Electron desktop app (`eDin+ Gateway Control` v1.2.2), plus the mobile-only
quality-of-life features that LAN-controller apps are expected to have.

---

## 1. Goals and non-goals

**Goals**
- One codebase shipping to both iOS and Android.
- Feature parity with the current desktop app for the screens that actually
  work today: Setup, Keypad, Channel, Area / Scenes (incl. scene editor with
  level / RGB / Tunable White controls).
- Live event monitoring over TCP (port 26) so plate-press and input events
  show up in real time, same as desktop.
- Reuse as much of the existing parser / command-builder logic from
  `renderer.js` as possible — it is the most valuable IP in this repo.

**Non-goals (for v1)**
- Replacing or competing with the existing desktop app — they ship in
  parallel.
- Cloud sync, multi-site management, user accounts beyond what the gateway
  itself supports.
- DALI configuration tooling (see §10 — the DALI tab is broken in the
  desktop app today; we will descope or rebuild deliberately, not port).
- Tablet-optimised layouts. We will design for phones first; tablets get a
  scaled phone layout in v1.

---

## 2. What exists today (one-page recap)

| File | Role | LOC |
| --- | --- | --- |
| `main.js` | Electron main process. Owns the persistent TCP socket (`net.Socket`, port 26) and HTTP transport (`node-fetch`, port 80). Reads/writes a userData `settings.txt`. | 248 |
| `preload.js` | `contextBridge` exposing `sendCommand`, `updateSettings`, `requestSettings`, `onLogMessage`, `onLoadSettings`, `openSceneEdit`. | ~20 |
| `renderer.js` | UI logic, command formatting, response parsing, color pickers, scene-edit modal. | ~2080 |
| `index.html` / `style.css` | Layout (5 nav tabs + log pane + 2 modals). Desktop-sized (1280×800). | ~300 / ~760 |
| `gateway_readme.md` + `GatewayPDFs/` | Mode Lighting's ASCII protocol spec, our reference. | n/a |

**Commands the desktop app actually sends today** (grep on `renderer.js`):

```
$User,<u>,<p>;            # auth prefix
?VERSION;                 # connectivity test
$Events,<0|1>;            # turn event reporting on/off
?areanames;               # list areas
?SCNNAMES,<area>;         # list scenes for an area
$SCNRECALL,<scn>;         # recall scene
$SCNRECALLX,<scn>,255,1000;
$SCNSAVE,<scn>;           # save scene from current channel state
?SCNCHANNAMES,<scn>;      # list scene's channels
?SCNCHANSTATES,<scn>;     # current levels/colors of those channels
$BTNSTATE,<addr>,<dev>,<btn>,<state>;        # simulate a wall-plate press
$CHANFADE,<addr>,<dev>,<chan>,<lvl>,<ms>;
$DMXFADE,...; $DALIFADE,...;
$CHANRGBCOLRFADE,...; $DMXRGBCOLRFADE,...;
$CHANTWCOLR,<addr>,<dev>,<chan>,#<temp>K,<ms>;
```

**Responses parsed:** `!AREANAME`, `!SCNNAME`, `!CHANNAME`, `!DMXNAME`,
`!DALINAME`, `!CHANRGBCOLRNAME`, `!DMXRGBCOLRNAME`, `!CHANTWCOLRNAME`,
`!CHANLEVEL`, `!DMXLEVEL`, `!DALILEVEL`, `!CHANRGBCOLR`, `!DMXRGBCOLR`,
`!CHANTWCOLR`, `!BTNSTATE`, `!INPSTATE`, `!VERSION`.

**Settings persisted:** `IP_ADDRESS`, `CONNECTION_TYPE` (`http` | `tcp`),
`USERNAME`, `PASSWORD` — currently in `userData/settings.txt`, also mirrored
into `localStorage`. Default: `192.168.1.100` / `Administrator` / `mode1234`.

---

## 3. Recommended stack: React Native + Expo (dev-client)

| Concern | Pick | Why |
| --- | --- | --- |
| Framework | **React Native** | Lift `renderer.js` parsers and command builders almost verbatim (they are pure JS string manipulation). Largest pool of devs. |
| Tooling | **Expo + dev-client + EAS Build** | Modern RN DX, OTA updates, no Xcode/Gradle in the everyday loop. We need a custom dev-client (not Expo Go) because of the TCP socket dependency. |
| TCP | **react-native-tcp-socket** | Actively maintained, drop-in API similar to Node's `net.Socket`. |
| HTTP | Built-in `fetch` | Same protocol the desktop uses on port 80. |
| Discovery | **react-native-zeroconf** | mDNS so users don't have to type the gateway's IP. Big mobile-only win. |
| State | **Zustand** | Lightweight; we have shared state (connection, areas, scenes, channels, log) across many screens but no need for full Redux. |
| Navigation | **React Navigation** (bottom tabs + native stack) | Standard. |
| Storage | **expo-secure-store** for password, **AsyncStorage** for IP/username | Don't put the gateway password in plain AsyncStorage. |
| Color wheel | Custom RN view with `react-native-skia` or `react-native-svg` + PanResponder | Today's wheel uses 2D canvas + `mousedown/mousemove`; we redo this for touch. |

**Flutter is the credible alternative.** It would mean rewriting all the JS
parsers in Dart and ramping the team on Dart, in exchange for a slightly
nicer-feeling UI. Given the JS reuse story above, RN is the lower-risk
path for v1. We can revisit if RN performance disappoints us in
benchmarking.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ UI layer (React components, screens)                             │
│   SetupScreen / AreasScreen / SceneScreen / SceneEditScreen      │
│   KeypadScreen / ChannelScreen / LogPane                         │
└─────────────────┬────────────────────────────┬───────────────────┘
                  │                            │
        ┌─────────▼────────┐         ┌─────────▼────────────┐
        │ Zustand stores   │         │ ColorPicker / shared │
        │ - connection     │         │ UI primitives        │
        │ - areas / scenes │         └──────────────────────┘
        │ - channels       │
        │ - log            │
        └─────────┬────────┘
                  │ subscribes / dispatches
        ┌─────────▼─────────────────────────────────────┐
        │ GatewayClient (singleton)                     │
        │ - connect(ip, mode)                           │
        │ - send(cmd) → Promise<response>               │
        │ - on('event', cb) for !BTNSTATE, !INPSTATE …  │
        │ - reconnect on app foreground                 │
        └─────────┬─────────────────────────────────────┘
                  │
        ┌─────────▼──────────┐    ┌──────────────────────┐
        │ TcpTransport       │    │ HttpTransport        │
        │ react-native-tcp-  │    │ fetch POST text/plain│
        │ socket             │    │                      │
        └────────────────────┘    └──────────────────────┘
                  │
        ┌─────────▼──────────────────────────────────────┐
        │ Pure helpers (lifted from renderer.js)         │
        │ - protocol/commands.ts (builders)              │
        │ - protocol/parsers.ts  (response parsers)      │
        │ - protocol/types.ts    (Channel, Scene, …)     │
        └────────────────────────────────────────────────┘
```

`GatewayClient` is the single chokepoint for I/O. It hides whether the
underlying transport is TCP (event-capable) or HTTP (poll-only) and exposes
the same Promise-and-events API to the rest of the app. This is the layer
that replaces `main.js` + `preload.js`.

---

## 5. Reuse map: what lifts from `renderer.js` unchanged

These are pure functions and port to TypeScript with cosmetic changes:

- `pad()`, `getUserPrefix()`
- `getChannelCategory()`, `getColorType()`
- `parseAreaResponse()`, `parseSceneResponse()`
- `parseChannelNames()`, `parseChannelStates()`
- `hexToRgb()`, `rgbToHex()`, `hslToHex()`, `rgbToHsl()`
- All the command-builder string templates (`$CHANFADE,...`, `$SCNRECALL,...`,
  `$CHANRGBCOLRFADE,...`, `$CHANTWCOLR,...`).

These get rebuilt for touch:

- `populateChannelList()` → `<ChannelList>` component (FlatList).
- `showColorPicker()` / color wheel canvas → `<ColorPickerSheet>` using
  `react-native-skia` + `PanResponder`. Bottom-sheet, not modal.
- `nudgeSlider()`, `setAllChannelsToValue()`, `nudgeAllChannels()` → store
  actions called from buttons.
- `updateChannelControls()` → reactive: state shape drives rendering, no
  imperative DOM updates.

These get redesigned, not ported:

- The fixed-bottom log pane. Mobile gets a slide-up Diagnostics sheet,
  not a permanent split.
- The 5-tab top nav. Mobile gets a 4-icon bottom-tab bar
  (Areas / Keypad / Channel / Settings) plus a header status pill.
- Modals for scene edit and color picking → full-screen routes / bottom
  sheets.

---

## 6. Mobile-specific concerns

These are the things that catch desktop-to-mobile ports off guard. Each
one is a checklist item, not a research project.

**iOS Local Network permission.** Talking to a LAN gateway triggers a
permission prompt the first time. Need:
- `NSLocalNetworkUsageDescription` in `Info.plist`
  (e.g. "eDin+ Gateway Control needs to discover and control your lighting
  gateway on the local network.").
- `NSBonjourServices` listing any mDNS service types we browse.
- Trigger the prompt at a sensible moment (Setup screen, not app launch).

**Android cleartext to a LAN IP.** The gateway is HTTP, not HTTPS. Need
`networkSecurityConfig` with cleartext allowed for private IPv4 ranges
(`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) and `usesCleartextTraffic`
left default. Do not disable cleartext globally; scope it.

**Backgrounding kills TCP sockets.** Desktop holds a persistent connection
forever; mobile OSes will tear ours down on background. `GatewayClient`
must:
- Listen to `AppState` `active`/`background`.
- On `background`: tear down the TCP socket cleanly, mark connection
  state as suspended.
- On `active`: reconnect, re-`$User,...`, re-enable `$Events,1;`, re-fetch
  area names so the UI is fresh.
- Do not attempt long-lived background sockets — that path leads to iOS
  background-mode entitlement requests we do not need.

**HTTP keep-alive vs event capture.** Same caveat as desktop: HTTP mode
cannot receive events, only command responses. Surface this in the UI
(small badge on the Setup screen plus a one-time tooltip) so users know
why they need TCP for live plate-press feedback.

**Discovery (new feature).** mDNS browse for the gateway on the Setup
screen. If the gateway advertises itself via Bonjour we present a "Found
gateways on your network" list and let the user tap one. If it doesn't,
we fall back to a manual IP field. Confirm the actual mDNS service name
the gateway broadcasts before we hard-code it.

**Credential storage.** Move `PASSWORD` out of plain key/value storage and
into `expo-secure-store` (iOS Keychain / Android Keystore). Keep
`IP_ADDRESS` and `USERNAME` in AsyncStorage — they are not secrets.

**Touch-target sizing.** Today's nudge buttons are tiny. Mobile minimum
is 44pt iOS / 48dp Android. Sliders need wider hit areas than the default.

---

## 7. UX redesign sketch (text wireframes)

```
┌──────────────────────────────┐
│ eDin+      ● TCP   192.168…  │  ← header w/ live connection pill
├──────────────────────────────┤
│                              │
│   ┌──────────┐ ┌──────────┐  │
│   │ Kitchen  │ │ Living   │  │  ← Areas grid (current home)
│   └──────────┘ └──────────┘  │
│   ┌──────────┐ ┌──────────┐  │
│   │ Bedroom  │ │ Hallway  │  │
│   └──────────┘ └──────────┘  │
│                              │
├──────────────────────────────┤
│ [Areas] [Keypad] [Chan] [⚙]  │  ← bottom tabs
└──────────────────────────────┘

Tap an area → scene list w/ recall button + edit (gear) per row.
Tap edit → full-screen Scene Edit:
  - sticky header: scene name, ALL OFF / ALL ON / ±5%
  - virtualised list of channels:
      [Name              [——●———————] 47% [-][+]]
      [Name (RGB)        [color chip] [——●——] 80%]
      [Name (TW)         [—●——————]   2700K   ]
  - bottom action bar: Send / Save / Close
Tap a color chip → bottom-sheet ColorPicker (RGB wheel / TW / Advanced tabs).
```

Settings tab carries: IP, connection type, username, password, "Test
connection", "Discover gateways" button, link to a Diagnostics screen
(the current log pane, reachable on demand only).

---

## 8. Phased delivery

Each phase is a shippable internal build. Each phase ends with a tag and
a TestFlight / Play internal-testing build.

**Phase 0 — repo and tooling (≈2 days)**
- New `mobile/` directory in this repo (or a sibling `eDinPlusMobile`
  repo — call this out as decision D-1 below).
- Bootstrap Expo app, dev-client, EAS Build configured for both
  platforms, GitHub Actions CI running typecheck + tests.
- Lift `protocol/commands.ts`, `protocol/parsers.ts`, `protocol/types.ts`
  from `renderer.js`. Unit-test the parsers against captured gateway
  fixtures (we will record real responses against a live gateway and
  commit them to `protocol/__fixtures__/`).
- **Exit criteria:** `npm test` green, builds install on a real iPhone
  and a real Android device.

**Phase 1 — connectivity (≈1 week)**
- `GatewayClient` + `TcpTransport` + `HttpTransport`.
- Setup screen: IP / connection type / credentials, Test Connection
  button, status pill in header.
- Connection persisted, reconnect-on-foreground works.
- Diagnostics screen showing raw command/response log.
- **Exit criteria:** Test Connection succeeds on both transports against
  a real gateway. Plate-press events show up in Diagnostics when on TCP.

**Phase 2 — Areas and scenes (≈1 week)**
- Areas tab: tile grid from `?areanames`.
- Scene list per area from `?SCNNAMES,<n>`.
- Tap to recall (`$SCNRECALL`).
- Scene status pill (on/off) updated from `!SCNSTATE` events.
- **Exit criteria:** can recall scenes from a phone reliably; on/off
  state reflects gateway truth within ~500 ms over TCP.

**Phase 3 — Scene editor (≈2 weeks, the big one)**
- Channel list with virtualised rendering.
- Level sliders + nudge buttons + percent display.
- Tunable White slider with K display.
- RGB / RGBW chip + bottom-sheet color picker (wheel / TW / advanced
  RGB tabs, like desktop).
- Send / Save / Close actions; `$SCNRECALLX` on entry, `$SCNSAVE` on save.
- Global ALL OFF / ALL ON / ±5%.
- **Exit criteria:** every scene-edit interaction we have on desktop
  works on mobile, validated against the same gateway side-by-side.

**Phase 4 — Keypad + single Channel (≈2–3 days)**
- Direct port of the existing `$BTNSTATE` and `$CHANFADE` screens.
- Lower priority because they are diagnostic tools, not end-user
  features.

**Phase 5 — mobile-only polish (≈1 week)**
- mDNS gateway discovery on the Setup screen.
- Pull-to-refresh on Areas and scene lists.
- Haptics on slider commit, scene recall.
- Light / dark theme respecting system setting.
- App icons, splash, store metadata.

**Phase 6 — store submission (≈1–2 weeks elapsed, mostly review wait)**
- TestFlight beta with a small group.
- Play internal testing track.
- App Store review prep (privacy nutrition labels — local-only, no data
  collected, makes the form easy).
- Production release.

Total: ~6–8 weeks of focused work for one engineer, plus review time.

---

## 9. Risks and unknowns

| Risk | Mitigation |
| --- | --- |
| Gateway only advertises HTTP cleartext — App Store reviewers sometimes ask for justification. | Privacy questionnaire: "Communicates with a local-network device on the user's LAN; no data leaves the device." Cleartext is restricted to private IPv4 ranges via `networkSecurityConfig`. |
| `react-native-tcp-socket` behaviour on iOS post-Local-Network-prompt is occasionally flaky on older RN versions. | Pin to a recent RN/Expo SDK; smoke-test the prompt flow on iOS 16/17/18 before Phase 1 ends. |
| `?SCNCHANNAMES` / `?SCNCHANSTATES` ordering race exists on desktop today (renderer relies on `setTimeout(250)`). | Replace timeout with proper request/response correlation: tag each query, await `!OK,...` before parsing follow-up payload. Cleaner than what desktop does. |
| Backgrounded socket reconnect storms if the user toggles the app rapidly. | Debounce reconnects; cap at one attempt per 2 s; expose connection state in the UI so users can see why nothing is responding. |
| Color picker performance on low-end Androids using a 200×200 per-pixel canvas like desktop does. | Pre-rasterise the wheel as an SVG / Skia image, only redraw the thumb. Already a known win. |
| DALI tab is dead code on desktop (HTML calls `toggleDaliBroadcast`, `sendDaliOn`, etc., which do not exist in `renderer.js`). | See §10 — this is a decision, not a port. |

---

## 10. Decisions we need from you (D-list)

These are the questions whose answers shape the plan. Flagging them now
so we don't sleepwalk past them.

- **D-1 — Repo layout.** Add a `mobile/` directory inside this repo, or
  spin up a new `eDinPlusMobile` repo? My default: same repo, separate
  top-level dir, share the `protocol/` package via path-import. Easier
  for one-engineer development.
- **D-2 — DALI tab.** The desktop DALI screen is broken (HTML calls
  functions that do not exist in `renderer.js`). Options:
  (a) skip DALI entirely in v1 (recommended);
  (b) port it properly with the gateway's DALI commands from
  `gateway_readme.md` — adds ~3–5 days;
  (c) hide it behind a "Diagnostics" toggle.
- **D-3 — Phone-only or phone+tablet for v1?** Recommend phone-only.
  Tablets get a scaled phone layout; iPad-optimised layout in v1.1.
- **D-4 — Auth model.** Stick with the existing username/password the
  gateway has, stored locally? Or do we want a per-user PIN on top, so
  multiple housemates can have different access? My default: passthrough
  to gateway auth, no extra PIN. Add PIN later if requested.
- **D-5 — Min OS support.** Recommend iOS 16+ and Android 10+ (API 29).
  Anything older balloons the test matrix and gives little payoff.
- **D-6 — Distribution.** App Store + Play Store, or sideload / MDM only?
  Public store is the answer if you want non-technical end users to
  install easily; ad-hoc / TestFlight if this is for a known set of
  installations.
- **D-7 — Branding.** Keep "eDin+ Gateway Control" or a new product name
  for the mobile app? App Store names can't collide with existing ones,
  so worth checking early.

---

## 11. Open questions for protocol verification

Before Phase 1 ends, confirm these against a live gateway. Each is
cheap to answer if the gateway is on a desk somewhere:

- Does the gateway advertise itself via mDNS? If so, what service type
  (`_edin._tcp.local.`?). This determines whether D-1 / Phase 5 mDNS
  discovery is viable.
- Confirmed framing of multi-line responses on TCP (`<CR><LF>`-terminated,
  `;` per record) so the receive buffer's line-splitting logic is right.
- Maximum response size for `?SCNCHANNAMES` on a large scene — informs
  whether we need streaming parser or can buffer-then-parse.
- Does HTTP basic auth (per `gateway_readme.md` §User Management) work as
  an alternative to the `$User,…;` prefix? If yes, HTTP path becomes a
  bit cleaner.

---

## 12. Immediate next steps

1. You answer D-1 through D-7.
2. I scaffold Phase 0 (Expo dev-client app, `protocol/` ported to TS,
   parser tests passing) on this branch.
3. We get a real gateway IP / credentials reachable from a dev machine
   so Phase 1 can validate against truth, not mocks.
4. From there we run the phases above week by week.
