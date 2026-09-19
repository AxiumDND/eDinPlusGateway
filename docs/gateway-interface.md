# eDIN+ Gateway interface — working reference

Developer notes for this repo. Official Mode Lighting manuals live in [`GatewayPDFs/`](../GatewayPDFs/):

| Volume | File | Use |
|--------|------|-----|
| 1 Standard | `Gateway Interface Vol 1 - Standard v2_0_3.pdf` | Everyday commands every user can send |
| 2 Advanced | `Gateway Interface Vol 2 - Advanced v2_0_3.pdf` | Events, users, scene status, live levels |
| 3 Developer | `Gateway Interface Vol 3 - Developer v2_0_3.pdf` | CSV `/info`, `$SCNSET`, `$MASTERTICK` |

The long command dump is still in [`gateway_readme.md`](../gateway_readme.md). Parsers used by the app are in [`gateway-protocol.js`](../gateway-protocol.js).

This page is the **short map**: how messages look, which events drive Control, and the commands we actually use.

---

## 1. How a message is built

| Piece | Rule |
|-------|------|
| Command | Starts with `$` |
| Query | Starts with `?` |
| Reply / event | Starts with `!` |
| End of message | `;` then CR/LF on the wire |
| Fields | Comma-separated, decimal unless noted (`#RRGGBB`, `#3000K`) |
| Numbers | Leading zeros are allowed (`00008` = scene 8) |
| Success ack | `!OK;` or long `!OK,<TOKEN>,…;` |
| Failure | `!BAD;` |
| Greeting | After connect: `!GATRDY;` then `!VERSION,<text>;` |

Keep-alive / smoke test:

```
$OK;
!OK;
```

Version:

```
?VERSION;
!OK,VERSION;
!VERSION,<version-text>;
```

Most sessions send credentials first:

```
$User,<username>,<password>;
```

HTTP can instead use Basic Auth. HTTP **closes after each request**, so it never receives unsolicited events.

---

## 2. TCP vs HTTP (this app)

| | HTTP (`/gateway?`) | TCP port 26 |
|--|--------------------|-------------|
| Commands and query replies | Yes | Yes |
| Live events (plates, scenes, channels) | No | Yes, if enabled |
| Scene feedback in Control | Snapshot only (`?SCNS`) | Live `!SCNSTATE` / action events |

**Scene feedback path used by this app**

1. Connection type = TCP/IP (port 26)
2. `$EVENTS,1;` and/or `$EVTSCN,1;`
3. Catalog: `?SCNNAMES;` then snapshot: `?SCNS;`
4. Listen for `!SCNSTATE` and scene-action events

---

## 3. Event classes

Events are **per connection**. Nothing is reported until you turn a class on.

| Command | Class | What you get |
|---------|-------|----------------|
| `$EVENTS,<0\|1>;` | All | Convenience on/off for every class |
| `$EVTSCN,<0\|1>;` | Scene | `!SCNSTATE`, `!SCNRECALL`, `!SCNOFF`, … |
| `$EVTOUT,<0\|1>;` | Outputs | `!CHANFADE`, colour, TW, pulse |
| `$EVTDIS,<0\|1>;` | Plate display | `!BTNCOLR`, `!BTNTEXT` |
| `$EVTCIN,<0\|1>;` | Contacts | `!BTNSTATE`, `!INPSTATE`, `!INPPIR` |
| `$EVTAIN,<0\|1>;` | Analogue in | `!INPLEVEL` |
| `$EVTERR,<0\|1>;` | Health | `!CHANERR`, `!MODULEERR`, … |
| `$EVTADV,<0\|1>;` | Advanced | Admin only to **set** |

Query one flag with `?EVTSCN;` → `!EVTSCN,<0|1>;`. Query all with `?EVENTS;`.

Ignore `!OK,SCNRECALL,…` — that is a command ack, not a plate event.

---

## 4. Areas and scenes

### Discover

```
?AREANAMES;
!AREANAME,<area-num>,<access>,<area-content>,<area-name>;

?SCNNAMES;                  # every named scene
?SCNNAMES,<area-num>;       # one room
!SCNNAME,<scn-num>,<access>,<area-num>,<scn-name>;
```

The **area number on `!SCNNAME`** is how a scene id is mapped onto a Control tile.

### Status (Volume 2)

```
?SCNS;                 # all
?SCNS,<area-num>;      # one area
?SCN,<scn-num>;        # one scene
!SCN,<scn-num>,<mode>,<flags>,<scn-state>,<scn-level>;
```

| Field | Meaning |
|-------|---------|
| `scn-state` | `0` inactive, `1` active (in use on plates / logic) |
| `scn-level` | `0`–`255` (target level of the scene, not a channel) |
| `mode` | `1` scene-monitor (default), `2` channel-monitor |
| `flags` | bit `1` = is-an-off-scene, bit `2` = strict overlap rule |

**Off scenes** (name “Off”, or flags bit 1): recalling them **turns channels off** while the scene itself is marked active. `$SCNOFF` on a normal scene deactivates it. Toggle commands follow **scene state**, not channel brightness.

Overlapping scenes can stay “active” together depending on mode/strict. Trust `!SCNSTATE` from the NPU rather than guessing.

### Live scene events (`EVTSCN`)

```
!SCNSTATE,<scn-num>,<scn-state>,<scn-level>,<fadetime-ms>;
```

State changes are immediate. Level may still be fading; `fadetime` is how long until the new level.

Action events (same names as `$` commands):

| Event | Typical meaning for Control |
|-------|-----------------------------|
| `!SCNRECALL` / `!SCNRECALLX` / `!SCNFAST` / `!SCNBACKON` | Scene coming on |
| `!SCNOFF` | Scene recalled to off |
| `!SCNONOFF` / `!SCNTOGGLE` | Ambiguous — wait for `!SCNSTATE` |
| `!SCNRAISE` / `!SCNLOWER` / `!SCNRAMP` / `!SCNSTOP` / `!SCNNUDGEUP` / `!SCNNUDGEDN` | Level move; same scene still selected |
| `!SCNSAVE` | Live look written into the scene |

Example from a plate:

```
!SCNRECALL,00008;
!SCNSTATE,00008,1,255,00001000;
```

### Scene commands this app sends

| Command | Effect |
|---------|--------|
| `$SCNRECALL,<n>;` | Recall at scene default level/fade |
| `$SCNOFF,<n>;` | Recall to off (level 0, scene fade) |
| `$SCNRECALLX,<n>,<level>,<fade-ms>;` | Recall with explicit level/fade (Adjust / flash) |
| `$SCNSAVE,<n>;` | Capture **current live** levels into the scene |

Advanced (available, not all wired in the UI): `$SCNFAST`, `$SCNTOGGLE`, `$SCNBACKON`, `$SCNONOFF`, `$SCNRAISE`, `$SCNLOWER`, `$SCNRAMP`, `$SCNSTOP`, `$SCNNUDGEUP`, `$SCNNUDGEDN`.

### Channels in a scene

```
?SCNCHANNAMES,<scn-num>;
!CHANNAME,<addr>,<devcode>,<chan>,…,<name>;
!DALINAME,…
!CHANTWCOLRNAME,…
!CHANRGBCOLRNAME,…

?SCNCHANSTATES,<scn-num>;
!CHANLEVEL,<addr>,<devcode>,<chan>,<level-0-255>,<percent>,…;
!DALILEVEL,…
!CHANRGBCOLR,<addr>,<devcode>,<chan>,<level>,#<rgb>;
!CHANTWCOLR,<addr>,<devcode>,<chan>,#<kelvin>K;
```

Level field for `!CHANLEVEL` is the **0–255** slot, not the percent field.

---

## 5. Users and access

```
$USER,<name>,<password>;     # log in (also `$User,…`)
$USER;                       # Public guest
?USER;                       # !USER,<name>;
$USERPSSWD,<name>,<old>,<new>;
```

Access is a bit field: **View = 1**, **Control = 2**, **Edit = 4**.

| Level | Value | Meaning |
|-------|------:|---------|
| Private | 0 | None |
| Monitor | 1 | View |
| Access | 3 | View + Control |
| Public | 7 | View + Control + Edit |

Events only fire for items the connection may **view**. Admin is required for `$EVTADV` and most Volume 3 tools.

---

## 6. Channel control

Address a point as `<addr>,<devcode>,<chan|dali|zone>`.

### Levels

```
$CHANFADE,<addr>,<devcode>,<chan>,<level-0-255>,<fade-ms>;
$DALIFADE,<addr>,<devcode>,<dali-id>,<level>,<fade-ms>;
$DMXFADE,<addr>,<devcode>,<zone>,<level>,<fade-ms>;
$CHANSTOP,<addr>,<devcode>,<chan>;
```

DALI ids on a UBC can also be `BST` (broadcast) or `Gxx` (group) in advanced addressing.

Relay pulse (blinds): `$CHANPULSE,<addr>,<devcode>,<chan>,<1=close|2=open|3=toggle>,<ms>;`

Standard `?CHAN` / `?DALI` / `?DMX` replies are the **end of fade**. Mid-fade instantaneous level: `?CHANLEVELX` / `?DALILEVELX` / `?DMXLEVELX`.

Output events (`EVTOUT`): `!CHANFADE`, `!DALIFADE`, `!DMXFADE`, `!CHANSTOP`, colour/TW, `!CHANPULSE`.

### Colour and tunable white

RGB/TW fixtures usually have a **master level** (`$CHANFADE` / `$DMXFADE`) plus a **colour** command.

```
$CHANRGBCOLRFADE,<addr>,<devcode>,<chan>,#<wrgb>,<fade-ms>;
$CHANRGBCOLRFADE,<addr>,<devcode>,<chan>,<preset-1-15>,<fade-ms>;
$CHANRGBPLAYFADE,<addr>,<devcode>,<chan>,<seq-64-100>,<fade-ms>;
$CHANTWCOLRFADE,<addr>,<devcode>,<chan>,#<kelvin>K,<fade-ms>;
$CHANTWCOLRFADE,<addr>,<devcode>,<chan>,<preset-48-63>,<fade-ms>;
```

DMX RGB often uses a **pure** `#RGB` plus a separate `$DMXFADE` for brightness.

Admin presets: `$RGBPRESET,…,#<wrgb>;` and `$TWPRESET,…,#<kelvin>K;`.

---

## 7. Plates and inputs

```
$BTNSTATE,<addr>,<devcode>,<btn>,<state>;
$INPSTATE,<addr>,<devcode>,<chan>,<state>;
$INPPIRSET,<addr>,<devcode>,<chan>,<pir-state>;
$INPLEVELSET,<addr>,<devcode>,<chan>,<0-255>;
```

### Button / contact states

| Value | Name | When |
|------:|------|------|
| 0 | Release-off | Idle |
| 1 | Press-on | Down |
| 2 | Hold-on | Held long enough |
| 5 | Short-press | Released before hold |
| 6 | Hold-off | Released after hold |

### PIR

| Value | Event / command |
|------:|-----------------|
| 0 | Empty / SYNC |
| 1 | Triggered-On / TRIGGER |
| 2 | Timeout-Off / TIMEOUT |
| 3 | Set-On / SET |
| 4 | HOLD (command only) |
| 5 | Cleared-Off / CLEAR |

Plate LED/text events (`EVTDIS`): `!BTNCOLR,<addr>,<devcode>,<btn>,<palette-0-16>;` and `!BTNTEXT,…,<text>;`.

---

## 8. Health and config stamp

```
?ERRORS;          # current faults
?SYSTEMID;        # !SYSTEMID,<serial>,<edit-stamp>,<adjust-stamp>;
```

`edit-stamp` / `adjust-stamp` change when the project or scene definitions change. Re-query names if they move.

Status `0` is OK. Common non-zero codes: `2` device missing, `5` no AC, `6` too hot, `9` / `25` / `26` DALI lamp / ballast, `20` no DALI PSU, `22` commissioning mismatch. Full table: [`gateway_readme.md`](../gateway_readme.md).

---

## 9. Device codes (`devcode`)

| Code | Product |
|-----:|---------|
| 01 | EVO-LCD-55 LCD plate |
| 02 | EVO-SGP wall plates |
| 04 | EVO 2-ch relay |
| 12 | eDIN 2A 8-ch leading-edge dimmer |
| 13 | eDIN 3A 4-ch trailing-edge |
| 14 | eDIN 3A 4-ch leading-edge |
| 15 | eDIN 8-ch I/O |
| 16 | eDIN 5A 4-ch relay |
| 17 | eDIN UBC |
| 18 | eDIN 8-ch configurable output |
| 19 | eDIN dimmer packs |
| 21 | Rotary plates |
| 24 | Multi-sensor |
| 144 | Mains-sync relay |
| 145 | UBC 2 |

---

## 10. Colour / TW preset numbers

**RGB static** `1–15` (Red … User3). **Sequences** `64–68` solid, `96–100` ripple.

**TW presets**

| Preset | Name | Default |
|-------:|------|--------:|
| 48 | Candlelight | 1800 K |
| 49 | SoftWhite | 2700 K |
| 50 | WarmWhite | 3000 K |
| 51 | Whitelight | 3500 K |
| 52 | CoolWhite | 4000 K |
| 53 | BrightWhite | 5000 K |
| 54 | Daylight | 6000 K |
| 55 | BlueSky | 7000 K |

Plate palette `0–16`: Black, White, Red, Green, Blue, Orange, Cyan, Magenta, Yellow, then dim variants.

---

## 11. What this app implements

| Area | Behaviour |
|------|-----------|
| Setup | IP, HTTP vs TCP, user, Event Report → `$EVENTS` + `$EVTSCN` |
| Control tiles | `?AREANAMES`, scene caption from catalog + `!SCNSTATE` / `?SCNS` |
| Room scenes | `?SCNNAMES,<area>`, `$SCNRECALL` / `$SCNOFF` |
| Scene channels | `?SCNCHANNAMES` / `?SCNCHANSTATES`, sliders, Flash, nudge |
| Adjust modal | `$SCNRECALLX` then `$SCNSAVE` |
| Keypad | `$BTNSTATE` |
| DALI page | Broadcast / BST / fitting identify |
| Preview `?preview=1` | Demo house; Setup **Test Command** can inject `!SCNSTATE,…` locally |

Helpers: `parseSceneEvents`, `reduceSceneFeedback`, `parseAreaResponse`, `parseSceneResponse`, `parseChannelNames`, `parseChannelStates`.

---

## 12. Volume 3 (do not use lightly)

Requires administrator / config password. Can change the project.

- HTTP **`/info?what=names|levels|dali`** — CSV export/import of names, scene levels, DALI commissioning
- **`$SCNSET` / `$SCNEND`** — rewrite a scene **without** changing live levels (unlike `$SCNSAVE`)
- **`$MASTERTICK`** — inhibit the NPU’s own logic while an external controller is master (~1 Hz; NPU takes over after ~5 s of silence)

See Volume 3 PDF and the second half of `gateway_readme.md`.

---

## 13. Debugging on the wire

```
$DBGACK,1;     # long !OK,<command>,…;
$DBGECHO,1;    # echo each character (`.` if invalid)
```

Useful when a `$` command is silently ignored (wrong user, no Control access, bad `devcode`).
