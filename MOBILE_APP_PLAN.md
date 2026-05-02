# eDin+ Gateway — Mobile App Plan

A plan to deliver iPhone and Android apps that control eDin+ lighting via
the gateway's HTTP API. The mobile app is a **multi-site, HTTP-only**
controller — it intentionally drops the TCP-event path the desktop app
uses and instead presents a clean Sites → Areas → Scenes → Channels
drill-down.

---

## 1. Goals and non-goals

**Goals**
- One codebase shipping to both iOS and Android.
- Multi-site management. A user can save several sites (e.g. "Home",
  "Holiday cottage", "Office") and switch between them.
- Multi-NPU per site. A site can have one or more NPUs; each NPU holds
  its own credentials; areas from all NPUs in a site are merged into a
  single tile grid for the user.
- Reuse the parser / command-builder logic from `renderer.js` — the
  protocol parts are the same, only the transport changes.
- Feature parity with the desktop app's end-user flow:
  Setup (now: Add Site) → Areas → Scenes → per-channel control.

**Non-goals (for v1)**
- TCP / live-event monitoring. **HTTP only.** That means no live
  plate-press feedback in the app — accepted.
- Replacing or competing with the existing desktop app — they ship in
  parallel.
- DALI configuration tooling (see §10; the DALI tab is broken in the
  desktop app today).
- Cloud sync, account systems, push notifications.
- Tablet-optimised layouts (phones first; tablets get a scaled phone
  layout in v1).

---

## 2. What exists today (one-page recap)

| File | Role | LOC |
| --- | --- | --- |
| `main.js` | Electron main process. Owns persistent TCP socket (port 26) and HTTP transport (port 80). Reads/writes `userData/settings.txt`. | 248 |
| `preload.js` | `contextBridge` exposing IPC bridge to the renderer. | ~20 |
| `renderer.js` | UI logic, command formatting, response parsing, color pickers, scene-edit modal. | ~2080 |
| `index.html` / `style.css` | Desktop layout (1280×800), 5 nav tabs + log pane + 2 modals. | ~300 / ~760 |
| `gateway_readme.md` + `GatewayPDFs/` | Mode Lighting's ASCII protocol spec. | n/a |

**Commands the desktop app sends** (and that we will reuse, minus the
TCP-only ones):

```
$User,<u>,<p>;            # auth prefix (sent on every HTTP request)
?VERSION;                 # connectivity test
?areanames;               # list areas
?SCNNAMES,<area>;         # list scenes for an area
$SCNRECALL,<scn>;         # recall scene
$SCNRECALLX,<scn>,<lvl>,<ms>;
$SCNSAVE,<scn>;           # save scene from current channel state
?SCNCHANNAMES,<scn>;      # list scene's channels
?SCNCHANSTATES,<scn>;     # current levels/colors of those channels
$CHANFADE,<addr>,<dev>,<chan>,<lvl>,<ms>;
$DMXFADE,...; $DALIFADE,...;
$CHANRGBCOLRFADE,...; $DMXRGBCOLRFADE,...;
$CHANTWCOLR,<addr>,<dev>,<chan>,#<temp>K,<ms>;
```

Dropped from the mobile build:
- `$Events,1;` and the `!BTNSTATE` / `!INPSTATE` listeners (TCP-only).
- The Keypad screen and the standalone Channel screen — those are
  diagnostic tools and not part of the end-user drill-down. Could
  return as a "Diagnostics" pane later (decision D-2 covers DALI and
  these together).

**Responses parsed** (lift directly from `renderer.js`):
`!AREANAME`, `!SCNNAME`, `!CHANNAME`, `!DMXNAME`, `!DALINAME`,
`!CHANRGBCOLRNAME`, `!DMXRGBCOLRNAME`, `!CHANTWCOLRNAME`, `!CHANLEVEL`,
`!DMXLEVEL`, `!DALILEVEL`, `!CHANRGBCOLR`, `!DMXRGBCOLR`, `!CHANTWCOLR`,
`!VERSION`.

---

## 3. Recommended stack

| Concern | Pick | Why |
| --- | --- | --- |
| Framework | **React Native + Expo (managed)** | Lift `renderer.js` parsers and command builders almost verbatim. With no TCP requirement we can stay on managed Expo (no dev-client needed) and ship over-the-air updates trivially. |
| Build / release | **EAS Build + EAS Submit** | Standard Expo path to TestFlight and Play. |
| HTTP | Built-in `fetch` | POST `text/plain` to `http://<npu-ip>/gateway?` with `$User,…;` prefix. Same shape the desktop uses. |
| Discovery | **expo-zeroconf** (or `react-native-zeroconf`) | mDNS so users don't have to type each NPU IP. Big v1.1 win — list as stretch for v1 (decision D-2). |
| State | **Zustand** | Lightweight; we have shared state across screens (sites, current site, areas, scene-in-edit) but no need for full Redux. |
| Navigation | **React Navigation** (native stack + bottom tabs once inside a site) | Sites stack at the root; once a site is opened, bottom tabs for Areas / Scenes / Settings. |
| Storage — non-secret | **AsyncStorage** (`@react-native-async-storage/async-storage`) | Sites list, NPU IPs, last-active site, UI prefs. |
| Storage — secrets | **expo-secure-store** | Per-NPU username/password lives in iOS Keychain / Android Keystore. We never write passwords to AsyncStorage. |
| Color wheel | Custom view with `react-native-skia` (or `react-native-svg`) + `PanResponder` | Today's wheel uses a 2D canvas + `mousedown/mousemove`; we redo this for touch. |

**Flutter is the credible alternative.** It would mean rewriting the JS
parsers in Dart and ramping the team on Dart, with a slightly nicer-feeling
UI as the payoff. Given the JS reuse story above, RN is the lower-risk
path for v1.

---

## 4. Data model: Sites and NPUs

This is the biggest difference from the desktop app, which only knows
about a single gateway.

```ts
type NPU = {
  id: string;            // local UUID
  label?: string;        // optional friendly label, e.g. "Main rack"
  ip: string;            // 192.168.x.x
  username: string;      // stored alongside ip in AsyncStorage
  // password lives in expo-secure-store, keyed by `npu:${id}`
};

type Site = {
  id: string;            // local UUID
  name: string;          // user-given, e.g. "Holiday cottage"
  npus: NPU[];           // one or more
  createdAt: number;
};

type AppState = {
  sites: Site[];          // persisted to AsyncStorage
  activeSiteId?: string;  // null until the user opens a site
};
```

Rules:
- **Credentials are per NPU**, not per site. Each row in the Add Site
  form has its own username/password.
- **Areas merge across NPUs at display time.** Internally each `Area`
  carries its origin `npuId` so commands can be routed to the correct
  NPU. The user never sees that distinction.
- **No concurrent sites.** Only the active site has connections in
  flight; switching site discards in-flight requests.
- **No persistent connection.** Every action is a fresh HTTPS-style
  POST to one of the active site's NPUs. Auth prefix `$User,…;` is
  prepended to every request body using the matching NPU's credentials.

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ UI layer (React Navigation stacks + screens)                     │
│   SitesScreen / AddSiteScreen / EditSiteScreen                   │
│   SiteHomeScreen (Areas grid)                                    │
│   AreaScreen (Scenes list)                                       │
│   SceneScreen (Channels list, recall / save / send)              │
│   SettingsScreen                                                 │
└─────────────────┬────────────────────────────┬───────────────────┘
                  │                            │
        ┌─────────▼────────┐         ┌─────────▼────────────┐
        │ Zustand stores   │         │ Shared UI primitives │
        │ - sitesStore     │         │ ColorPickerSheet,    │
        │ - activeSite     │         │ ChannelRow, Tile…    │
        │ - areas / scenes │         └──────────────────────┘
        │ - channels       │
        └─────────┬────────┘
                  │
        ┌─────────▼─────────────────────────────────────┐
        │ SiteSession (one per active site)             │
        │ - listAreasAcrossNpus()                       │
        │ - listScenesForArea(area)                     │
        │ - recallScene(scene), saveScene(scene)        │
        │ - listChannels(scene), setChannel(...)        │
        │ - dispatches each call to the right NPU client│
        └─────────┬─────────────────────────────────────┘
                  │
        ┌─────────▼─────────────────────────────────────┐
        │ NpuHttpClient (one per NPU)                   │
        │ - send(commandString) → Promise<rawResponse>  │
        │ - injects $User,<u>,<p>; prefix               │
        │ - retry/backoff for transient network errors  │
        └─────────┬─────────────────────────────────────┘
                  │
        ┌─────────▼─────────────────────────────────────┐
        │ Pure helpers (lifted from renderer.js)        │
        │ - protocol/commands.ts (builders)             │
        │ - protocol/parsers.ts  (response parsers)     │
        │ - protocol/types.ts    (Channel, Scene, …)    │
        └────────────────────────────────────────────────┘
```

`SiteSession` is the only thing the UI talks to. It hides the fact that
"this site has 2 NPUs" — when the UI asks for areas, `SiteSession` calls
each NPU's `?areanames;` in parallel, merges the results, tags each one
with `npuId`, and returns one combined list. When the UI asks to recall
a scene, `SiteSession` reads the scene's `npuId` and routes the request
to the right NPU client.

---

## 6. Reuse map: what lifts from `renderer.js`

These are pure functions and port to TypeScript with cosmetic changes:

- `pad()`, `getUserPrefix()`
- `getChannelCategory()`, `getColorType()`
- `parseAreaResponse()`, `parseSceneResponse()`
- `parseChannelNames()`, `parseChannelStates()`
- `hexToRgb()`, `rgbToHex()`, `hslToHex()`, `rgbToHsl()`
- All the command-builder string templates.

These get rebuilt for touch:

- `populateChannelList()` → `<ChannelList>` (FlatList).
- `showColorPicker()` / canvas wheel → `<ColorPickerSheet>` using
  `react-native-skia` + `PanResponder`. Bottom-sheet, not modal.
- `nudgeSlider()`, `setAllChannelsToValue()`, `nudgeAllChannels()` → store
  actions called from buttons.
- `updateChannelControls()` → reactive: state shape drives rendering, no
  imperative DOM updates.

Dropped:
- The bottom log pane (HTTP-only means there are no async events to log
  in real time). Replaced by a per-screen "last command" debug toggle in
  Settings if needed.
- The TCP transport in `main.js` and the IPC bridge in `preload.js`.
- `?Events,1;` plumbing.

---

## 7. UX / navigation

### 7.1 First-launch (no sites saved)

```
┌──────────────────────────────┐
│         eDin+                │
│                              │
│       (no sites yet)         │
│                              │
│   ┌──────────────────────┐   │
│   │     + Add Site       │   │
│   └──────────────────────┘   │
│                              │
└──────────────────────────────┘
```

### 7.2 Saved Sites screen (returning users)

```
┌──────────────────────────────┐
│ Sites                    [+] │
├──────────────────────────────┤
│ ▸ Home                       │
│   192.168.1.100 + 1 more     │
├──────────────────────────────┤
│ ▸ Holiday cottage            │
│   192.168.50.10              │
├──────────────────────────────┤
│ ▸ Office                     │
│   10.0.0.20                  │
└──────────────────────────────┘
```

Long-press a row → Edit / Delete.

### 7.3 Add Site screen

```
┌──────────────────────────────┐
│ ‹ Back   New Site      Save  │
├──────────────────────────────┤
│ Site name                    │
│ [ Home                     ] │
│                              │
│ NPUs                         │
│ ┌──────────────────────────┐ │
│ │ NPU 1                  ✕ │ │
│ │ Label (optional)         │ │
│ │ [ Main rack            ] │ │
│ │ IP address               │ │
│ │ [ 192.168.1.100        ] │ │
│ │ Username                 │ │
│ │ [ Administrator        ] │ │
│ │ Password                 │ │
│ │ [ ••••••••             ] │ │
│ │ [ Test NPU             ] │ │
│ └──────────────────────────┘ │
│                              │
│ [ + Add another NPU ]        │
│                              │
│ [ Test all & Save ]          │
└──────────────────────────────┘
```

Save is enabled when every NPU row has a valid IP + username + password
and "Test all" returned `!VERSION` from each.

### 7.4 Inside a site

Tapping a saved site enters that site's stack. Bottom tabs:
**Areas** (default) / **Settings** (this site's NPUs, edit / delete).

```
SiteHomeScreen (Areas grid)
─────────────────────────────
Tiles for every area returned by ?areanames; on every NPU at this site,
merged into one alphabetical (or original-order) grid.

Tap a tile →

AreaScreen (Scenes list)
─────────────────────────────
Vertical list of scenes for that area. Each row:
  [ Scene name        Recall  ▸ ]
    └ tap row body  → drill into channels (SceneScreen)
    └ tap "Recall"  → fires $SCNRECALL, brief toast

SceneScreen (Channels list — individual on/off control)
─────────────────────────────
Sticky header: scene name + Recall / Save / Close
Body: list of channels in that scene
  - Level channel:  [ Name           [——●——————] 47%  on/off ]
  - RGB channel:    [ Name (RGB)     [chip] [——●——] 80%      ]
  - TW channel:     [ Name (TW)      [—●——] 2700K            ]
Each row's on/off is a tap-toggle that fires the matching $…FADE,…,255
or $…FADE,…,0 command.
```

### 7.5 Settings (global vs site)

Two tiers:
- **Global Settings** (on the Sites screen header): app theme, units,
  diagnostic toggles.
- **Site Settings** (Settings tab inside a site): the list of NPUs,
  edit / add / remove, "Test connection" per NPU.

---

## 8. Mobile-specific concerns

These are the things that catch desktop-to-mobile ports off guard.
Everything TCP-related from the previous draft of this plan is gone —
HTTP-only removes the whole class of socket-lifecycle problems.

**iOS Local Network permission.** Talking to a LAN NPU from an iOS app
still triggers a permission prompt on first contact, even over HTTP, on
iOS 14+. Need:
- `NSLocalNetworkUsageDescription` in `Info.plist` (e.g. "eDin+ needs to
  contact your lighting NPUs on your local network.").
- Trigger the prompt at the right moment — first "Test NPU" tap, not on
  app launch — so users know what they're approving.

**Android cleartext to a LAN IP.** The NPU is HTTP, not HTTPS. We need
`networkSecurityConfig` allowing cleartext for private IPv4 ranges
(`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) only — do not disable
cleartext globally.

**Credential storage.** Per-NPU passwords go into `expo-secure-store`
keyed by `npu:${npuId}`. Site name / NPU IP / username are not secrets
and live in AsyncStorage. Never log passwords; mask them in any
diagnostic display.

**Request timeouts and offline UX.** HTTP to a LAN device fails fast
when the device is unreachable — set a 5 s timeout per request, show a
clear "NPU not reachable" state at the row level rather than a global
spinner. Multi-NPU sites must keep working even if one NPU is offline
(merge what we got, mark the missing one).

**Touch-target sizing.** Today's nudge buttons are tiny. Mobile minimum
is 44 pt iOS / 48 dp Android. Sliders need wider hit areas than the
default.

**Discovery (stretch, decision D-2).** mDNS browse on the Add Site
screen if the gateway advertises itself via Bonjour. Need to confirm
the actual service type the eDin+ NPU broadcasts before we hard-code it.

---

## 9. Phased delivery

Each phase is a shippable internal build. Each phase ends with a tag and
a TestFlight / Play internal-testing build.

**Phase 0 — repo and tooling (≈2 days)**
- Add `mobile/` directory in this repo (decision D-1).
- Bootstrap Expo (managed) app, EAS Build configured for both
  platforms, GitHub Actions CI running typecheck + tests.
- Lift `protocol/commands.ts`, `protocol/parsers.ts`, `protocol/types.ts`
  from `renderer.js`. Unit-test the parsers against captured gateway
  fixtures (we will record real responses against a live NPU and commit
  them to `protocol/__fixtures__/`).
- **Exit criteria:** `npm test` green, builds install on a real iPhone
  and a real Android device.

**Phase 1 — Sites and Add Site (≈4–5 days)**
- `Site` / `NPU` data model in Zustand, persisted to AsyncStorage +
  secure-store.
- Sites screen with empty state + Add Site CTA.
- Add Site / Edit Site forms, multi-NPU rows, "Test NPU" hits
  `?VERSION;` and reports per-row pass/fail.
- Long-press to delete a site; confirm dialog.
- **Exit criteria:** can save a site with 2 NPUs, restart the app, see
  it reappear, edit it, delete it. Test NPU shows version on success
  and a clear failure on bad creds / wrong IP.

**Phase 2 — Site Home, Areas merging (≈3–4 days)**
- Open a site → fan out `?areanames;` to all NPUs in parallel, merge,
  tag each area with `npuId`, render as tile grid.
- Pull-to-refresh.
- Per-NPU offline state surfaced inline (e.g. "1 NPU unreachable").
- **Exit criteria:** opening a 2-NPU site shows a single merged grid,
  works correctly when one NPU is offline.

**Phase 3 — Areas → Scenes (≈3 days)**
- Tap area → Scenes screen.
- Tap "Recall" on a scene row → `$SCNRECALL` to the right NPU.
- **Exit criteria:** can recall scenes for any area on any NPU at the
  site, end-to-end.

**Phase 4 — Scenes → Channels (≈2 weeks, the big one)**
- Tap scene row body → SceneScreen.
- Channel list with virtualised rendering.
- Level sliders + nudge buttons + percent display.
- Per-channel on/off tap-toggle.
- Tunable White slider with K display.
- RGB / RGBW chip + bottom-sheet color picker (wheel / TW / advanced
  RGB tabs, like desktop).
- Recall / Save / Close actions; `$SCNRECALLX` on entry, `$SCNSAVE` on
  save. Routed via `npuId`.
- **Exit criteria:** every scene-edit interaction the desktop has works
  on mobile, validated against the same NPU side-by-side.

**Phase 5 — polish (≈1 week)**
- Pull-to-refresh on every list.
- Haptics on slider commit, scene recall, on/off toggle.
- Light / dark theme respecting system setting.
- App icons, splash, store metadata.

**Phase 6 — store submission (≈1–2 weeks elapsed, mostly review wait)**
- TestFlight beta.
- Play internal testing track.
- Privacy nutrition labels — local-only, no data collected, makes the
  form trivial.
- Production release.

Total: ~5–7 weeks of focused work for one engineer, plus review time.
(About a week shorter than the previous TCP-inclusive plan.)

---

## 10. Risks and unknowns

| Risk | Mitigation |
| --- | --- |
| HTTP cleartext to LAN — App Store reviewers occasionally ask about it. | Privacy questionnaire: "Communicates with a local-network device on the user's LAN; no data leaves the device." `networkSecurityConfig` scopes cleartext to private IPv4 ranges only. |
| `?SCNCHANNAMES` / `?SCNCHANSTATES` ordering — desktop relies on `setTimeout(250)` to avoid a race. | Replace with proper request/response correlation: tag each query, await `!OK,...` before parsing follow-up payload. Cleaner than what desktop does today. |
| Multi-NPU "merge" hides which NPU owns an area — confusing if names collide ("Kitchen" on both NPUs). | Show a small badge ("NPU 1") on tiles only when names collide; otherwise hide it. Detect collision client-side after the merge. |
| Color picker performance on low-end Androids using a 200×200 per-pixel canvas like desktop does. | Pre-rasterise the wheel as a Skia image, only redraw the thumb. Already a known win. |
| Stale state — without TCP events, the app can't know if someone changed a scene from a wall plate. | Aggressive pull-to-refresh + auto-refresh on screen focus. Acceptable v1 trade-off given HTTP-only is a deliberate choice. |
| DALI / Keypad / standalone Channel screens are not in the new flow. | See decision D-3. They could come back as a Diagnostics tab post-v1. |

---

## 11. Decisions we still need from you

These are the questions whose answers shape the plan. Most of the
earlier set were resolved by your last message; what remains:

- **D-1 — Repo layout.** Add a `mobile/` directory inside this repo, or
  spin up a new `eDinPlusMobile` repo? My default: same repo, separate
  top-level dir, share the `protocol/` package via path-import. Easier
  for one-engineer development.
- **D-2 — mDNS discovery in v1?** Adds ~1–2 days. Recommendation: ship
  v1 with manual IP entry only; add mDNS in v1.1 once we know what
  service type the NPU advertises (if any).
- **D-3 — Diagnostics screen.** Do you want any of the desktop-only
  screens (DALI, Keypad simulator, standalone Channel control) carried
  over as a hidden Diagnostics tab for installers? Recommendation: skip
  in v1. They're installer tools, not end-user features, and the
  desktop app remains available for them.
- **D-4 — Channel-row control model.** When a user taps "on/off" on a
  channel inside a scene: does that fire a live command and **also**
  modify the in-memory scene state (so a subsequent Save persists it),
  or is it a transient "preview" until the user taps Save? Today's
  desktop app behaves as the latter (Save sends `$SCNSAVE`). I'd keep
  that model unless you want different mobile behaviour.
- **D-5 — Min OS support.** Recommend iOS 16+ and Android 10+ (API 29).
- **D-6 — Distribution.** App Store + Play Store, or sideload / MDM
  only? Public store is the answer for non-technical end users;
  TestFlight / ad-hoc if this is for a known set of installations.
- **D-7 — Branding.** Keep "eDin+ Gateway Control" or a new product
  name for the mobile app? Worth checking App Store name availability
  early.

---

## 12. Open questions for protocol verification

Before Phase 2 ends, confirm these against a live NPU:

- Does HTTP basic auth (per `gateway_readme.md` §User Management) work as
  an alternative to the `$User,…;` prefix? If yes, the auth path gets
  simpler and we can drop the prefix injection.
- Confirm framing of multi-line responses on HTTP (newline / semicolon
  termination) so the parser's line-splitting matches what the NPU
  actually returns.
- Maximum response size for `?SCNCHANNAMES` on a large scene — informs
  whether we need a streaming parser or can buffer-then-parse.
- Does a single HTTP request return one whole logical response (e.g. a
  full `?areanames;` listing with many `!AREANAME` lines), or do we
  need to read multiple HTTP responses to assemble it? The desktop
  app's TCP-stream parsing assumed continuous bytes; HTTP is
  request/response.
- Does the eDin+ NPU advertise itself via mDNS / Bonjour, and if so on
  what service type? Determines whether D-2 is viable.

---

## 13. Immediate next steps

1. You answer D-1 through D-7.
2. I scaffold Phase 0 (Expo managed app, `protocol/` ported to TS,
   parser tests passing) on this branch.
3. Get a real NPU IP / credentials reachable from a dev machine so
   Phase 1 can validate against truth, not mocks.
4. Run the phases above week by week.
