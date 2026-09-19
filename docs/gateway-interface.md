# eDIN+ Gateway interface — working reference

Developer notes for this repo. Official Mode Lighting manuals live in [`GatewayPDFs/`](../GatewayPDFs/):

| Volume | File | Use |
|--------|------|-----|
| 1 Standard | `Gateway Interface Vol 1 - Standard v2_0_3.pdf` | Everyday commands every user can send |
| 2 Advanced | `Gateway Interface Vol 2 - Advanced v2_0_3.pdf` | Events, users, scene status, live levels |
| 3 Developer | `Gateway Interface Vol 3 - Developer v2_0_3.pdf` | CSV `/info`, `$SCNSET`, `$MASTERTICK` |

The long command dump is still in [`gateway_readme.md`](../gateway_readme.md). Parsers used by the app are in [`gateway-protocol.js`](../gateway-protocol.js).

This page is the working map for Volumes 1–3: message grammar, events, scene feedback, and the developer APIs (`/info` CSV, `$SCNSET`, `$MASTERTICK`, DALI repair, XDALI).

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
| Project catalog | Setup **Load project from gateway** — HTTP GET `/info?what=names` and `what=levels`, then Control/Adjust use that channel list |

Helpers: `parseSceneEvents`, `reduceSceneFeedback`, `parseAreaResponse`, `parseSceneResponse`, `parseChannelNames`, `parseChannelStates`.

---

## 12. Volume 3 — developer features

Source: *Gateway Interface Vol 3 — Developer v2.0.3* (8 Mar 2022). Admin (or no user accounts) required. These APIs sit next to the NPU internals and can change the project. Talk to Mode before using them on a live site.

| Topic | What it is |
|-------|------------|
| `/info` CSV | Export/import names, scene levels, DALI commissioning over HTTP |
| Offline scene set | Rewrite a scene without moving live channels (`$SCNSET`) |
| External control | This app (or another) is master; NPU is backup (`$MASTERTICK`) |
| Advanced channel | Module discovery, identify/flash, DALI fixture health |
| DALI repair | Clear commissioning error 22; scan / repair / accept fixtures |
| Sensor repair | Not documented yet in v2.0.3 |
| XDALI | Raw 16-bit DALI-2 on a UBC bus, bypassing eDIN+ logic |

---

## 13. Info web service (`/info`)

Separate from `/gateway?`. URL:

```
http://<npu-ip>/info?<parameters>
Content-Type: application/csv
```

| Direction | Auth | Effect |
|-----------|------|--------|
| GET (export) | Administrator Basic Auth (or no users) | Read lists |
| POST (import) | **Configuration** username + **config password** | Edits the project; bumps `edit-stamp` on `?SYSTEMID` |

User accounts **must** be set up to import (so the config password exists).

### Export (GET)

Mandatory `what=`:

| `what` | Contents |
|--------|----------|
| `names` | Modules, plates, channels |
| `levels` | Areas, scenes, scene channel settings |
| `dali` | DALI universes and expected fixtures |

Filters (comma-separated lists). Manual typo in the PDF: `foraddess` — use **`foraddress`**.

| `what` | Filters |
|--------|---------|
| `names` | `foraddress=`, `fordevicecode=` (can combine) |
| `levels` | `forarea=` **or** `forscene=` — do not combine; `forscene` wins |
| `dali` | `foraddress=` (UBC MBus addresses) |

Optional `&where=<filename>` sets

```
Content-Disposition: attachment; filename="<filename>.csv";
```

so a browser will download the file.

```
GET /info?what=names&foraddress=6,17
GET /info?what=levels&forarea=1,2
GET /info?what=dali&foraddress=3
```

### Import (POST)

`what=names` | `levels` | `dali` as above. Body is CSV.

Rules that apply to every import:

1. One item per line (CR, LF, or CR-LF). Fields split on `,`.
2. First line **must** be the file type header (text after the header on that line is ignored).
3. A line starting with `!` is a comment.
4. Blank lines are ignored.
5. **Do not pad fields with spaces** — whitespace inside a line is kept.
6. First field is a case-insensitive token.
7. Numeric fields: at least one digit, leading zeros OK, no leading spaces. Text fields are case-sensitive and may be empty.
8. Extra fields after the documented ones are ignored. Unknown / disallowed rows are ignored.
9. Syntax follows the nearest GATEWAY discovery/status message where one exists.

Best practice: **export, edit, re-import**.

### Names file (`what=names`)

Header: `!EDIN NAMES FILE`

Cannot create new objects — only rename / re-area existing ones.

| Token | Format | Changes |
|-------|--------|---------|
| `PROJECTNAME` | `PROJECTNAME,<name>` | Project title |
| `PROJECTVERSION` | `PROJECTVERSION,<version>` | Version string |
| `PROJECTOWNER` | `PROJECTOWNER,<owner>` | Owner string |
| `AREA` | `AREA,<area-no>,<name>` | Area name |
| `PLATE` | `PLATE,<addr>,<devcode>,<area-no>,<name>` | Plate area + name |
| `MODULE` | `MODULE,<addr>,<devcode>,<area-no>,<name>` | Module area + name |
| `CHAN` | `CHAN,<addr>,<devcode>,<chan-no>,<area-no>,<name>` | Output channel |
| `DALI` | `DALI,<addr>,<devcode>,<dali-no>,<area-no>,<name>` | DALI channel |
| `DMX` | `DMX,<addr>,<devcode>,<zone-no>,<area-no>,<name>` | DMX zone |
| `INPSTATE` | `INPSTATE,<addr>,<devcode>,<chan-no>,<area-no>,<name>` | Contact input |
| `INPPIR` | `INPPIR,<addr>,<devcode>,<chan-no>,<area-no>,<name>` | PIR |
| `INPLEVEL` | `INPLEVEL,<addr>,<devcode>,<chan-no>,<area-no>,<name>` | Analogue input |

```
!EDIN NAMES FILE
PROJECTNAME,Example Project
AREA,1,First Area
DALI,3,17,1,1,DALI Channel 1
DALI,3,17,2,1,Main Downlights
```

### Levels file (`what=levels`)

Header: `!EDIN LEVELS FILE`

Cannot create new scenes. Colour may be a preset or `#rrggbb`. TW may be a preset or `#kelvinK`.

| Token | Format |
|-------|--------|
| `AREA` | `AREA,<area-no>,<name>` |
| `SCENE` | `SCENE,<scene-no>,<name>` |
| `SCNFADE` | `SCNFADE,<scene-no>,<fade-ms>` |
| `SCNCHANLEVEL` | `SCNCHANLEVEL,<scene>,<addr>,<devcode>,<chan>,<level>` |
| `SCNDALILEVEL` | `SCNDALILEVEL,<scene>,<addr>,<devcode>,<dali>,<level>` |
| `SCNDMXLEVEL` | `SCNDMXLEVEL,<scene>,<addr>,<devcode>,<zone>,<level>` |
| `SCNCHANRGBCOLR` | `SCNCHANRGBCOLR,<scene>,<addr>,<devcode>,<chan>,<colour-or-preset>` |
| `SCNDMXRGBCOLR` | `SCNDMXRGBCOLR,<scene>,<addr>,<devcode>,<zone>,<colour-or-preset>` |
| `SCNCHANRGBPLAY` | `SCNCHANRGBPLAY,<scene>,<addr>,<devcode>,<chan>,<seq>` |
| `SCNDMXRGBPLAY` | `SCNDMXRGBPLAY,<scene>,<addr>,<devcode>,<zone>,<seq>` |
| `SCNCHANTWCOLR` | `SCNCHANTWCOLR,<scene>,<addr>,<devcode>,<chan>,<kelvin-or-preset>` |
| `SCNDMXTWCOLR` | `SCNDMXTWCOLR,<scene>,<addr>,<devcode>,<zone>,<kelvin-or-preset>` |

```
!EDIN LEVELS FILE
SCNFADE,3,1000
SCNCHANLEVEL,5,1,12,3,255
SCNDMXRGBCOLR,5,2,15,1,#FF0080
```

### DALI commissioning file (`what=dali`)

Header: `!EDIN DALI COMMISSIONING FILE`

This edits the **expected** fixture list, not the physical ballasts.

| Token | Format | Effect |
|-------|--------|--------|
| `DALIUNIVERSE` | `DALIUNIVERSE,<addr>,<devcode>` | **Deletes** all expected fixtures on that UBC |
| `BALLAST` | `BALLAST,<addr>,<devcode>,<short>,<long>,<type>,<groups>` | Add or change type / groups / long address |

- Put `DALIUNIVERSE` **before** that universe’s `BALLAST` rows (it wipes data including rows above it for that UBC).
- Keep all `BALLAST` rows for one universe together.
- You cannot delete one fixture except by wiping the universe and re-importing without it.
- A universe with only `DALIUNIVERSE` and no `BALLAST` lines clears commissioning data.

```
!EDIN DALI COMMISSIONING FILE
DALIUNIVERSE,3,17
BALLAST,3,17,0,2109473,0,1
BALLAST,3,17,1,7811888,0,2
```

After changing groups in CSV, program the physical fixture with `$DALIREPAIR,<addr>,<devcode>,Fx,Fx;` (same short address both sides).

---

## 14. Offline scene setting (`$SCNSET`)

`$SCNSAVE` writes **live** levels. That cannot:

- edit a scene in the background (occupants see the look)
- save DALI virtual `BST` / `Gxx` (no readable live level)
- add or remove channels in a scene

`$SCNSET` … `$SCNEND` writes the **definition** only. Live levels stay put. `adjust-stamp` on `?SYSTEMID` changes. Scene must be editable. Only controllable/editable channels are stored. Scene state on plates may invalidate until the NPU recalculates.

Cannot create a new scene number. Each transaction must send the **complete** channel list. A token on the connection stops two sessions merging definitions; it expires if you stall.

### Transaction

1. `?SCNSET,<n>;` (and optionally `?SCNSETNAMES,<n>;`) to read the current definition
2. `$SCNSET,<n>;` to open
3. Optional `$SCNFADE,<n>,<ms>;`
4. One line per channel (level / RGB / TW / play)
5. `$SCNEND,<n>;` → `!SCNSETACK,<n>,<0|1>;` (`1` = applied)
6. Or `$SCNABORT;` to drop the token

TCP/raw: later `$SCNSET*` lines must arrive within **30 seconds** until end/abort. Same session only. One open transaction per scene.

| Command | Role |
|---------|------|
| `$SCNSET,<n>;` | Begin |
| `$SCNFADE,<n>,<ms>;` | Fade time |
| `$SCNCHAN,<n>,<addr>,<devcode>,<chan>,<level>;` | Dimmer |
| `$SCNDALI,<n>,<addr>,<devcode>,<dali\|BST\|Gxx>,<level>;` | DALI (virtual ids allowed) |
| `$SCNDMX,<n>,<addr>,<devcode>,<zone>,<level>;` | DMX |
| `$SCNCHANRGBCOLR` / `$SCNDMXRGBCOLR` | Preset or `#wrgb` |
| `$SCNCHANRGBPLAY` / `$SCNDMXRGBPLAY` | Sequence preset |
| `$SCNCHANTWCOLR` / `$SCNDMXTWCOLR` | Preset or `#kelvinK` |
| `$SCNEND,<n>;` | Commit |
| `$SCNABORT;` | Abort all open set ops on this session |

```
$SCNSET,3;
$SCNFADE,3,10000;
$SCNCHAN,3,2,21,5,255;
$SCNCHANRGBCOLR,3,2,21,5,#ff7f00;
$SCNEND,3;

!OK,SCNSET,00003;
!OK,SCNFADE,00003,00010000;
!OK,SCNCHAN,00003,002,21,005,255;
!OK,SCNCHANRGBCOLR,00003,002,21,005,#FF7F00;
!OK,SCNEND,00003;
!SCNSETACK,00003,1;
```

### Queries

`?SCNSET,<n>;` → `!SCNSET,<n>;` … item rows (same tokens as commands with `!`) … `!SCNEND,<n>;`

`?SCNSETNAMES,<n>;` → `!SCNSETNAMES,<n>;` then `!SCNCHANNAME`, `!SCNDALINAME`, `!SCNDMXNAME`, `!SCNCHANRGBCOLRNAME`, `!SCNDMXRGBCOLRNAME`, `!SCNCHANTWCOLRNAME`, `!SCNDMXTWCOLRNAME`, `!SCNCHANRGBPLAYNAME`, `!SCNDMXRGBPLAYNAME` … `!SCNSETNAMESEND,<n>;`

---

## 15. External control / backup NPU

**A. No backup.** Config is hardware only (no scenes/rules). You drive Channel API + events.

**B. With backup.** Full eDIN+ config exists. While you are alive you hold the NPU off with `$MASTERTICK`. If you vanish, local rules/scenes run again.

```
$MASTERTICK,<unix-seconds-UTC>;
!OK,MASTERTICK,<unix-seconds-UTC>;
```

- Admin required
- Send about **once per second** (heartbeat)
- NPU takes control again after about **5 seconds** without a tick

```
$MASTERTICK,1646218969;
!OK,MASTERTICK,1646218969;
```

---

## 16. Advanced Channel API

### Module discovery

Works even with **no project loaded** (useful with XDALI).

```
?MODULENAME;
?MODULENAME,<devcode>;
!MODULENAME,<addr>,<devcode>,<style>,<access>,<area>,<name>;
```

`area` is `0` if unassigned. Example filter for UBCs (`17`):

```
?MODULENAME,17;
!MODULENAME,001,017,00,07,00000,;
```

(The older alias `?MODULENAMES` appears in some notes; the Volume 3 token is `MODULENAME`.)

### Identify / flash

One channel or fixture per module. Auto-clears after **5 minutes** (resend to refresh).

| Command | Target |
|---------|--------|
| `$SHOWOFF,<addr>,<devcode>;` | Cancel identify on that module |
| `$SHOWCHAN,<addr>,<devcode>,<chan>;` | Output channel |
| `$SHOWDALI,<addr>,<devcode>,<dali-num>;` | Mode DALI channel |
| `$SHOWDALI,<addr>,<devcode>,Fxx;` | Physical fixture short address (`F0` = 0) |

### DALI fixture health

Known/expected fixture only:

```
?DALI,<addr>,<devcode>,Fxx;
!DALIERR,<addr>,<devcode>,Fxx,<status-code>;
```

`0` = OK. Same status table as `EVTERR`.

---

## 17. Advanced DALI repair (error 22)

Replacing a ballast without re-commissioning sets **status 22** (commissioning problem). Repair APIs find the new fixture and write the old short address / groups. **Admin** + **`EVTADV`** for progress events.

### Session

Entering a session **turns off** runtime fixture-error checking.

| Command | Effect |
|---------|--------|
| `$DALICAPTURE;` | Open repair on **all** UBCs |
| `$DALIDONE;` | Close session; checking back on |

First repair command on a UBC also opens a session for that bus. **5 minute** idle timeout; any repair command or `$DALICAPTURE` extends it.

### Scan

```
$DALISCAN,<addr>,<devcode>;
?DALISCAN,<addr>,<devcode>;
!DALISCAN,<addr>,<devcode>,<scan-status>,<num-fixtures>;
```

| `scan-status` | Meaning |
|--------------:|---------|
| 0 | Idle |
| 1 | Search done |
| 2 | Searching |
| 3 | Programming |
| 4 | Error |

### Live fixture list

```
?DALIFIX,<addr>,<devcode>;
!DALIFIX,<addr>,<devcode>,<Fxx or FXX>,<long-24bit>,<groups-16bit>,<type-8bit>,<fixture-status>;
!DALIEND,<addr>,<devcode>;
```

`FXX` = no short address. Same `!DALIFIX` / `!DALIEND` / `!DALISCAN` also arrive as **`EVTADV`** events.

| `fixture-status` | Meaning |
|-----------------:|---------|
| 0 | OK |
| 1 | Lamp failure |
| 2 | Missing (expected, not on the bus) |
| 5 | New (on the bus, not in commissioning) |
| 8 | Address clash (two fixtures, one short address) |
| 9 | Unassigned / no valid short address |

### Repair commands

| Command | What it does |
|---------|----------------|
| `$DALIREPAIR,<addr>,<devcode>,<missing-Fxx>,<new-Fxx>;` | Reprogram the **physical** new fixture to the missing slot; update commissioning |
| `$DALIACCEPT,<addr>,<devcode>,<Fxx>;` | Change **data only**: drop an unmatched missing, or add an unmatched new |

Events: `!DALIREPAIR,…;` and `!DALIACCEPT,…;` (`EVTADV`).

Broadcast-channel errors usually self-heal. If not, re-init from the module menu or web UI — no dedicated GATEWAY command.

### Recommended process

1. Optional `$DALICAPTURE;` (clears DALI errors, all universes)
2. `$DALISCAN,<addr>,<devcode>;` — watch `?DALISCAN` / `?DALIFIX` or events
3. Match missing vs new using location + `$SHOWDALI,…,Fxx;`
4. `$DALIREPAIR,…,<missing>,<new>;` for each pair
5. `$DALIACCEPT` leftovers you cannot pair
6. Confirm `?DALIFIX` is all OK, then `$DALIDONE;`
7. Back up the configuration (outside GATEWAY)
8. Optional: export/import `/info?what=dali` to edit groups, then `$DALIREPAIR,addr,dev,Fx,Fx` to push groups to the ballast

---

## 18. Advanced sensor repair

Volume 3 v2.0.3 marks this chapter **to be completed**. No GATEWAY tokens yet.

---

## 19. XDALI (DALI back door)

Sends **16-bit Control Gear DALI-2** frames on a UBC. Does **not** send 24-bit Control Device frames. Bypasses eDIN+ scene/channel logic. Admin required. Find UBCs with `?MODULENAME,17;`.

HTTP queries that wait on a silent ballast can hang. Add header:

```
ModeLighting-Timeout: <seconds>
```

Default is a few seconds. Example: `ModeLighting-Timeout: 20`.

DALI ids: `BST` broadcast, `Gxx` group, `Fxx` short address.

Every `$XDALI…` except `$XDALIDELAY` produces a matching `!XDALI…` **`EVTADV`** event after the frame goes out. There are no other XDALI-specific events.

Query replies include `<resp-data>` (8-bit) and `<resp-status>`:

| `resp-status` | Meaning |
|--------------:|---------|
| 0 | OK / Yes / `resp-data` valid |
| 1 | No response / no fixture |
| 2 | Corrupt / collision / treated as Yes |

### DAP (direct arc power)

```
$XDALIDAP,<addr>,<devcode>,<dali-id>,<level-0-255>;
```

`255` = MASK (stop fade). Event: `!XDALIDAP,…;`

### General opcode

| Form | Command |
|------|---------|
| Once | `$XDALI,<addr>,<devcode>,<dali-id>,<opcode-0-200>;` |
| Twice (critical) | `$XDALIX2,<addr>,<devcode>,<dali-id>,<opcode-0-200>;` |
| Query | `?XDALI,<addr>,<devcode>,<dali-id>,<opcode-0-200>;` → `!XDALI,…,<resp-data>,<resp-status>;` |

### Special opcode (address byte = opcode, data byte = data)

| Form | Command |
|------|---------|
| Once | `$XDALISP,<addr>,<devcode>,<special-161-201>,<data-0-255>;` |
| Twice | `$XDALISPX2,<addr>,<devcode>,<special-161-201>,<data-0-255>;` |
| Query | `?XDALISP,…` → `!XDALISP,…,<resp-data>,<resp-status>;` |

### Application extended (Enable Device Type then opcode)

| Form | Command |
|------|---------|
| Once | `$XDALIAPP,<addr>,<devcode>,<dali-id>,<opcode-224-254>,<device-type-0-253>;` |
| Twice | `$XDALIAPPX2,…;` |
| Query | `?XDALIAPP,…` → `!XDALIAPP,…,<resp-data>,<resp-status>;` |

### Bus delay

```
$XDALIDELAY,<addr>,<devcode>,<ms-0-65000>;
```

Example — randomise then initialise (both send-twice), with a settle delay:

```
$XDALISPX2,3,17,167,0;
$XDALIDELAY,3,17,300;
$XDALISPX2,3,17,165,0;
```

---

## 20. Debugging on the wire

```
$DBGACK,1;     # long !OK,<command>,…;
$DBGECHO,1;    # echo each character (`.` if invalid)
```

Useful when a `$` command is silently ignored (wrong user, no Control access, bad `devcode`).
