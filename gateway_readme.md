# eDin+ Gateway ASCII Command Protocol Summary

**Start here for day-to-day work:** [docs/gateway-interface.md](docs/gateway-interface.md) (tables, scene feedback, what the app uses). This file is the longer command list.

This document outlines the ASCII-based command protocol used to communicate directly with the eDin+ Gateway hardware. This information is crucial for developing applications, like the associated Electron project, to control the eDin+ lighting system.

## General Notes:
*   **Authentication:** Most commands should be prefixed with user credentials: `$User,USERNAME,PASSWORD;` (See User Management section for details).
*   **Termination:** Commands are typically terminated with a semicolon (`;`). Responses usually include `<CR><LF>` (Carriage Return, Line Feed).
*   **Responses:** Gateway responses often start with an exclamation mark (`!`). For example, `!OK,...;` indicates a successful command, while `!BAD;` indicates an invalid command or parameters. A long acknowledge (`!OK,...;` with command details) or short acknowledge (`!OK;`) can be configured (see Debugging).
*   **Initial Connection:** Upon successful connection, the gateway may send `!GATRDY;` followed by `!VERSION,<version-text>;`.
*   **Identifiers:** `addr` (MBus address), `devcode` (device code), and `chan-num` (channel number, or `zone-num` for DMX, `dali-num` or `dali-id` for DALI) are crucial for targeting specific devices and channels. Parameter values are typically decimal unless otherwise specified (e.g., hex colors).
*   **Parameter Separator:** Commas (`,`) are used to separate parameters in commands and responses.
*   **HTTP first:** This app uses `POST /gateway?` by default. Raw TCP port 26 is fallback only (the NPU allows **4** TCP sessions — close them with FIN). HTTP cannot receive unsolicited events; poll `?SCNS` or `/info`.
*   **Event Handling:** The gateway can send asynchronous event messages. Connection must be continuous (RS232, Raw IP) not HTTP for event-driven feedback. Events must be explicitly enabled.

## General Gateway Operations

*   **Null Command (Keep-alive/Test):**
    *   Command: `$OK;`
    *   Response: `!OK;`
*   **Version Query:**
    *   Query: `?VERSION;`
    *   Response: `!OK,VERSION;` then `!VERSION,<version-text>;`

## User Management and Access Control

User accounts can limit access to areas and functionalities.

### User Account Commands
*   **Change/Set User Account:**
    *   Command: `$USER,<user-name>,<password>;`
    *   Response: `!OK,USER,<user-name>,<password>;` then `!USERERR,<user-name>,<status-code>;` (0=OK, 1=Failed)
*   **Log Off (Revert to Public User):**
    *   Command: `$USER;`
    *   Response: `!OK,USER;` then `!USERERR,Public,0;`
*   **Query Current User:**
    *   Query: `?USER;`
    *   Response: `!OK,USER;` then `!USER,<user-name>;`
*   **Change Current User Password:**
    *   Command: `$USERPSSWD,<user-name>,<old-password>,<new-password>;`
    *   Response: `!OK,USERPSSWD,...;` then `!USERPSSWDERR,<user-name>,<status-code>;`
*   **HTTP Basic Authentication:** For HTTP connections, credentials can be sent via Basic Auth header (`Authorization: Basic <base64_encoded_username:password>`).

### Access Levels and Flags
*   **Access Flags:** View (1), Control (2), Edit (4). These are bit-field flags.
*   **Access Levels (combined flags):**
    *   `0`: Private (No access)
    *   `1`: Monitor-only (View)
    *   `3`: Access-only (View + Control)
    *   `7`: Public (View + Control + Edit)
*   User access is a combination of inherent item access and user's area access.

### Querying Channel Access
*   These queries return the access level (`<access>`) for a given item.
*   **Channel Access:**
    *   Query: `?CHANACCESS,<addr>,<devcode>,<chan-num>;`
    *   Response: `!CHANACCESS,<addr>,<devcode>,<chan-num>,<access>;`
*   **DALI Access:**
    *   Query: `?DALIACCESS,<addr>,<devcode>,<dali-id>;`
    *   Response: `!DALIACCESS,<addr>,<devcode>,<dali-id>,<access>;`
*   **DMX Access:**
    *   Query: `?DMXACCESS,<addr>,<devcode>,<zone-num>;`
    *   Response: `!DMXACCESS,<addr>,<devcode>,<zone-num>,<access>;`
*   **Button Access:** (Use `ALL` for `<btn-num>` to get all on plate)
    *   Query: `?BTNACCESS,<addr>,<devcode>,<btn-num_or_ALL>;`
    *   Response: Zero or more `!BTNACCESS,<addr>,<devcode>,<btn-num>,<access>;`
*   **Input Access:**
    *   Query: `?INPACCESS,<addr>,<devcode>,<chan-num>;`
    *   Response: `!INPACCESS,<addr>,<devcode>,<chan-num>,<access>;`
*   Scene access levels are returned via `?SCN` or `?SCNS` queries.

## Event System

Events report changes in the system (scenes, channels, inputs, health). Event reporting must be enabled per connection.

### Event Filtering Commands
*   **Enable/Disable All Event Classes:**
    *   Command: `$EVENTS,<on-off>;` (1=on, 0=off)
    *   Response: `!OK,EVENTS,<on-off>;`
*   **Query All Event Class Statuses:**
    *   Query: `?EVENTS;`
    *   Response: `!OK,EVENTS;` followed by `!EVTxxx,<on-off>;` for each class.
*   **Enable/Disable Individual Event Classes:** (`<on-off>` is 1 for on, 0 for off)
    *   `$EVTSCN,<on-off>;` (Scene events)
    *   `$EVTERR,<on-off>;` (Health status events)
    *   `$EVTOUT,<on-off>;` (Output channel events)
    *   `$EVTDIS,<on-off>;` (Wall plate display events - LED color/text)
    *   `$EVTCIN,<on-off>;` (Contact input events - PIR, buttons, contact closures)
    *   `$EVTAIN,<on-off>;` (Analogue input events)
    *   `$EVTADV,<on-off>;` (Advanced events - requires admin privileges to set)
    *   Response: `!OK,EVTxxx,<on-off>;`
*   **Query Individual Event Class Status:**
    *   `?EVTSCN;` -> `!EVTSCN,<on-off>;`
    *   `?EVTERR;` -> `!EVTERR,<on-off>;`
    *   `?EVTOUT;` -> `!EVTOUT,<on-off>;`
    *   `?EVTDIS;` -> `!EVTDIS,<on-off>;`
    *   `?EVTCIN;` -> `!EVTCIN,<on-off>;`
    *   `?EVTAIN;` -> `!EVTAIN,<on-off>;`
    *   `?EVTADV;` -> `!EVTADV,<on-off>;`
    *   Response prefix: `!OK,EVTxxx;`

### Common Event Message Formats

#### Scene Events (Class: `EVTSCN`)
*   **Scene State Change:**
    *   `!SCNSTATE,<scn-num>,<scn-state_0-1>,<scn-level_0-255>,<fadetime_ms>;`
*   **Scene Action Reports (Mirror scene commands):**
    *   `!SCNRECALL,<scn-num>;`
    *   `!SCNRECALLX,<scn-num>,<level>,<fadetime_ms>;`
    *   `!SCNOFF,<scn-num>;`
    *   `!SCNFAST,<scn-num>;`
    *   `!SCNBACKON,<scn-num>;`
    *   `!SCNRAISE,<scn-num>;`
    *   `!SCNLOWER,<scn-num>;`
    *   `!SCNRAMP,<scn-num>;`
    *   `!SCNSTOP,<scn-num>;`
    *   `!SCNNUDGEUP,<scn-num>;`
    *   `!SCNNUDGEDN,<scn-num>;`
    *   `!SCNONOFF,<scn-num>;`
    *   `!SCNTOGGLE,<scn-num>;`
    *   `!SCNSAVE,<scn-num>;`

#### Channel Output Events (Class: `EVTOUT`)
*   **Channel Level Change with Fade:**
    *   `!CHANFADE,<addr>,<devcode>,<chan-num>,<level>,<fadetime_ms>;`
    *   `!DALIFADE,<addr>,<devcode>,<dali-id>,<level>,<fadetime_ms>;`
    *   `!DMXFADE,<addr>,<devcode>,<zone-num>,<level>,<fadetime_ms>;`
*   **Channel Stop:**
    *   `!CHANSTOP,<addr>,<devcode>,<chan-num>;`
    *   `!DALISTOP,<addr>,<devcode>,<dali-id>;`
    *   `!DMXSTOP,<addr>,<devcode>,<zone-num>;`
*   **RGB Color Change:**
    *   `!CHANRGBCOLR,<addr>,<devcode>,<chan-num>,<preset>,#<wrgb>;`
    *   `!CHANRGBPLAY,<addr>,<devcode>,<chan-num>,<seq>,#<wrgb>;`
    *   `!DMXRGBCOLR,<addr>,<devcode>,<zone-num>,<preset>,#<wrgb>;`
    *   `!DMXRGBPLAY,<addr>,<devcode>,<zone-num>,<seq>,#<wrgb>;`
*   **Tunable White Change:**
    *   `!CHANTWCOLR,<addr>,<devcode>,<chan-num>,<preset>,#<kelvin>K;`
    *   `!DMXTWCOLR,<addr>,<devcode>,<zone-num>,<preset>,#<kelvin>K;`
*   **Relay Channel Pulse:**
    *   `!CHANPULSE,<addr>,<devcode>,<chan-num>,<action>,<pulsetime_ms>;`

#### Plate Display Events (Class: `EVTDIS`)
*   **Button Color Change:**
    *   `!BTNCOLR,<addr>,<devcode>,<btn-num>,<palette-colour>;`
*   **Button Text Change:**
    *   `!BTNTEXT,<addr>,<devcode>,<btn-num>,<text>;`

#### Input Channel Events (Contact Inputs - Class: `EVTCIN`)
*   **Button Switch State Change:**
    *   `!BTNSTATE,<addr>,<devcode>,<btn-num>,<new-state_0-6>;` (See Appendix for states)
*   **PIR Input State Change:**
    *   `!INPPIR,<addr>,<devcode>,<chan-num>,<new-state>;` (States: 0=Empty, 1=Triggered-On, 2=Timeout-Off, 3=Set-On, 5=Cleared-Off)
*   **Switched/Contact Input State Change:**
    *   `!INPSTATE,<addr>,<devcode>,<chan-num>,<new-state_0-6>;` (See Appendix for states like button states)

#### Analogue Input Events (Class: `EVTAIN`)
*   **Analogue Input Level Change:**
    *   `!INPLEVEL,<addr>,<devcode>,<chan-num>,<new-level>;`

#### Health Status Events (Class: `EVTERR`)
*   **Module Status Change:**
    *   `!MODULEERR,<addr>,<devcode>,<new_status-code>;`
*   **Output Channel Status Change:**
    *   `!CHANERR,<addr>,<devcode>,<chan-num>,<new_status-code>;`
    *   `!DALIERR,<addr>,<devcode>,<dali-id_or_dali-fixture>,<new_status-code>;`
    *   `!DMXERR,<addr>,<devcode>,<zone-num>,<new_status-code>;`
*   **Button Status Change:**
    *   `!BTNERR,<addr>,<devcode>,<btn-num>,<new_status-code>;`
*   **Input Channel Status Change:**
    *   `!INPERR,<addr>,<devcode>,<chan-num>,<new_status-code>;`

## Debugging

*   **Long Acknowledge Mode (provides detailed `!OK,...;` responses):**
    *   Set: `$DBGACK,<on-off>;` (0 for off, 1 for on)
    *   Query: `?DBGACK;`
    *   Response: `!OK,DBGACK;` then `!DBGACK,<on-off>;`
*   **Debug Echo Mode (echoes back sent characters, `.` for invalid):**
    *   Set: `$DBGECHO,<on-off>;` (0 for off, 1 for on)
    *   Query: `?DBGECHO;`
    *   Response: `!OK,DBGECHO;` then `!DBGECHO,<on-off>;`

## Area and Scene Operations

### Standard Scene Operations
*   **Get Area Names:**
    *   Query: `?AREANAMES;`
    *   Response: `!OK,AREANAMES;` then zero or more `!AREANAME,<area-num>,<access>,<area-content>,<area-name>;`
*   **Get Scene Names (for a given area or all scenes):**
    *   Query: `?SCNNAMES;` (all scenes)
    *   Query: `?SCNNAMES,<area-num>;` (scenes in a specific area)
    *   Response: `!OK,SCNNAMES;` (or `!OK,SCNNAMES,<area-num>;`) then zero or more `!SCNNAME,<scn-num>,<access>,<area-num>,<scn-name>;`
*   **Recall Scene (using scene\'s default level and fade):**
    *   Command: `$SCNRECALL,<scn-num>;`
    *   Response: `!OK,SCNRECALL,<scn-num>;`
*   **Recall Scene Off (level 0, using scene\'s default fade):**
    *   Command: `$SCNOFF,<scn-num>;`
    *   Response: `!OK,SCNOFF,<scn-num>;`
*   **Recall Scene with Explicit Level and Fade:**
    *   Command: `$SCNRECALLX,<scn-num>,<scn-level_0-255>,<fadetime_ms>;`
    *   Response: `!OK,SCNRECALLX,<scn-num>,<scn-level_0-255>,<fadetime_ms>;`
*   **Toggle Scene On/Off (standard toggle):**
    *   Command: `$SCNONOFF,<scn-num>;`
    *   Response: `!OK,SCNONOFF,<scn-num>;`
*   **Save Scene (captures current live state):**
    *   Command: `$SCNSAVE,<scn-num>;`
    *   Response: `!OK,SCNSAVE,<scn-num>;`
*   **Query Scene Status:**
    *   Query: `?SCNS;` (all scenes), `?SCNS,<area-num>;` (area scenes), `?SCN,<scn-num>;` (single scene)
    *   Response: `!OK,SCNS...;` then `!SCN,<scn-num>,<mode>,<flags>,<scn-state_0-1>,<scn-level_0-255>;`
        *   `<scn-state_0-1>`: 0 = inactive, 1 = active.
        *   `<mode>`: 1 = scene monitor, 2 = channel monitor.
        *   `<flags>`: bit-field, 1 = is-an-off-scene, 2 = strict rule applied.

### Advanced Scene Control
*   **Fast Recall (ignores scene fade, uses global fast fade):**
    *   Command: `$SCNFAST,<scn-num>;`
    *   Response: `!OK,SCNFAST,<scn-num>;`
*   **Advanced Toggle (uses remembered snapshot for 'on' state):**
    *   Command: `$SCNTOGGLE,<scn-num>;`
    *   Response: `!OK,SCNTOGGLE,<scn-num>;`
*   **Recall to Previous Toggle Level (half of $SCNTOGGLE):**
    *   Command: `$SCNBACKON,<scn-num>;`
    *   Response: `!OK,SCNBACKON,<scn-num>;`
*   **Raise Scene Level (start dimming up):**
    *   Command: `$SCNRAISE,<scn-num>;`
    *   Response: `!OK,SCNRAISE,<scn-num>;`
*   **Lower Scene Level (start dimming down):**
    *   Command: `$SCNLOWER,<scn-num>;`
    *   Response: `!OK,SCNLOWER,<scn-num>;`
*   **Stop Scene Dimming (raise/lower/ramp):**
    *   Command: `$SCNSTOP,<scn-num>;`
    *   Response: `!OK,SCNSTOP,<scn-num>;`
*   **Ramp Scene (toggle between raise and lower):**
    *   Command: `$SCNRAMP,<scn-num>;`
    *   Response: `!OK,SCNRAMP,<scn-num>;`
*   **Nudge Scene Up (small fixed step up):**
    *   Command: `$SCNNUDGEUP,<scn-num>;`
    *   Response: `!OK,SCNNUDGEUP,<scn-num>;`
*   **Nudge Scene Down (small fixed step down):**
    *   Command: `$SCNNUDGEDN,<scn-num>;`
    *   Response: `!OK,SCNNUDGEDN,<scn-num>;`

## System Health and Discovery

*   **Request System Error List:** (See also EVTERR class events)
    *   Query: `?ERRORS;`
    *   Response: `!OK,ERRORS;` then zero or more error reports (e.g., `!MODULEERR,...`, `!CHANERR,...`).
*   **Request System ID (to check for configuration changes):**
    *   Query: `?SYSTEMID;`
    *   Response: `!OK,SYSTEMID;` then `!SYSTEMID,<serial-num>,<edit-stamp>,<adjust-stamp>;`

## Channel Information Retrieval

### Scene-based Channel Information
*   **Get Channel Names for a Scene:** (`?SCNCHANNAMES`)
    *   Query: `?SCNCHANNAMES,<scn-num>;`
    *   Response: `!OK,SCNCHANNAMES,<scn-num>;` then `!<entry-id>NAME,...;`
*   **Get Channel States for a Scene:** (`?SCNCHANSTATES`)
    *   Query: `?SCNCHANSTATES,<scn-num>;`
    *   Response: `!OK,SCNCHANSTATES,<scn-num>;` then various state reports.

### Direct Channel Status Queries (Final Values)
*   **Output/Relay Channel Status:** (`?CHAN`)
    *   Query: `?CHAN,<addr>,<devcode>,<chan-num>;` -> `!CHANLEVEL,...;`
*   **DALI Channel Status:** (`?DALI`)
    *   Query: `?DALI,<addr>,<devcode>,<dali-id>;` -> `!DALILEVEL,...;`
    *   **DALI Fixture Health:** `?DALI,<addr>,<devcode>,<dali-fixture_Fxx>;` -> `!DALIERR,<addr>,<devcode>,<dali-fixture_Fxx>,<status-code>;`
*   **DMX Zone Status:** (`?DMX`)
    *   Query: `?DMX,<addr>,<devcode>,<zone-num>;` -> `!DMXLEVEL,...;`
*   **RGB Color Status (CHAN/DMX):** (`?CHANRGB`, `?DMXRGB`)
    *   Query: `?CHANRGB,<addr>,<devcode>,<chan-num>;` -> `!CHANRGBCOLR,...` or `!CHANRGBPLAY,...;`
    *   Query: `?DMXRGB,<addr>,<devcode>,<zone-num>;` -> `!DMXRGBCOLR,...` or `!DMXRGBPLAY,...;`
*   **Tunable White Status (CHAN/DMX):** (`?CHANTW`, `?DMXTW`)
    *   Query: `?CHANTW,<addr>,<devcode>,<chan-num>;` -> `!CHANTWCOLR,...;`
    *   Query: `?DMXTW,<addr>,<devcode>,<zone-num>;` -> `!DMXTWCOLR,...;`

### Live/Mid-Fade Channel Level Queries (Instantaneous Values)
*   These queries return the channel's level at the moment of query, even during a fade.
*   Response format: `!<TYPE>LEVELX,<addr>,<devcode>,<id>,<level_0-255>,<power_percent_0-100>,<wattage_at_max>;`
*   **Instantaneous Channel Level:**
    *   Query: `?CHANLEVELX,<addr>,<devcode>,<chan-num>;`
*   **Instantaneous DALI Level:**
    *   Query: `?DALILEVELX,<addr>,<devcode>,<dali-num>;`
*   **Instantaneous DMX Level:**
    *   Query: `?DMXLEVELX,<addr>,<devcode>,<zone-num>;`

## Channel Control (Setting Levels/Colors)

*Note: Outputs that drive colour or tuneable white fixtures often have two controls: one for level/master brightness (using standard CHAN/DMX FADE commands) and one for the colour (using specific RGB/TW commands). Application logic must handle this distinction, especially for DMX RGB.*

All fade times are in milliseconds (ms).

### Standard Level Channels
*   **Set Level with Fade:**
    *   `$CHANFADE,<addr>,<devcode>,<chan-num>,<level_0-255>,<fadetime_ms>;`
    *   `$DALIFADE,<addr>,<devcode>,<dali-id>,<level_0-255>,<fadetime_ms>;` (Can use `BST` or `Gxx` for `<dali-id>` in some UBC modes)
    *   `$DMXFADE,<addr>,<devcode>,<zone-num>,<level_0-255>,<fadetime_ms>;`
*   **Stop Channel Fade:**
    *   `$CHANSTOP,<addr>,<devcode>,<chan-num>;`
    *   `$DALISTOP,<addr>,<devcode>,<dali-id>;` (Can use `BST` or `Gxx`)
    *   `$DMXSTOP,<addr>,<devcode>,<zone-num>;`
*   **Pulse Relay Channel (for blind/curtain control etc.):**
    *   Actions: 1=Pulse Close, 2=Pulse Open, 3=Pulse Toggle
    *   Command: `$CHANPULSE,<addr>,<devcode>,<chan-num>,<action_1-3>,<pulsetime_ms>;`
    *   Response: `!OK,CHANPULSE,<addr>,<devcode>,<chan-num>,<action>,<pulsetime_ms>;`

### Color and Tunable White Channels
*   **RGB Color Channels (CHAN or DMX types):**
    *   **Set Static Color (Direct Hex or Preset):**
        *   `$CHANRGBCOLRFADE,<addr>,<devcode>,<chan-num>,#<wrgb_with_brightness>,<fadetime_ms>;`
        *   `$DMXRGBCOLRFADE,<addr>,<devcode>,<zone-num>,#<pure_wrgb>,<fadetime_ms>;` (Brightness via separate `$DMXFADE`)
        *   `$CHANRGBCOLRFADE,<addr>,<devcode>,<chan-num>,<preset_1-15>,<fadetime_ms>;`
        *   `$DMXRGBCOLRFADE,<addr>,<devcode>,<zone-num>,<preset_1-15>,<fadetime_ms>;`
    *   **Play Color Sequence:**
        *   `$CHANRGBPLAYFADE,<addr>,<devcode>,<chan-num>,<sequence_64-100>,<fadetime_ms>;`
        *   `$DMXRGBPLAYFADE,<addr>,<devcode>,<zone-num>,<sequence_64-100>,<fadetime_ms>;`
*   **Tunable White Channels (CHAN or DMX types):**
    *   **Set Temperature (Direct Kelvin or Preset):**
        *   `$CHANTWCOLRFADE,<addr>,<devcode>,<chan-num>,#<kelvin>K,<fadetime_ms>;`
        *   `$DMXTWCOLRFADE,<addr>,<devcode>,<zone-num>,#<kelvin>K,<fadetime_ms>;`
        *   `$CHANTWCOLRFADE,<addr>,<devcode>,<chan-num>,<preset_48-63>,<fadetime_ms>;`
        *   `$DMXTWCOLRFADE,<addr>,<devcode>,<zone-num>,<preset_48-63>,<fadetime_ms>;`

### Input Channel Control (Injecting Events / Overriding State)
*   **Inject Button/Contact Input State:** (States: 0=Release-off, 1=Press-on, 2=Hold-on, 5=Short-press, 6=Hold-off)
    *   `$BTNSTATE,<addr>,<devcode>,<btn-num>,<state_0-6>;`
    *   `$INPSTATE,<addr>,<devcode>,<chan-num>,<state_0-6>;`
*   **Control PIR Input State:** (Commands/States for `<pir_command_state>`: 0=SYNC, 1=TRIGGER, 2=TIMEOUT, 3=SET, 4=HOLD, 5=CLEAR)
    *   Command: `$INPPIRSET,<addr>,<devcode>,<chan-num>,<pir_command_state>;` (Note: Doc uses INPPIRSET, API summary used INPPIR. Assuming SET for command.)
*   **Set Analogue Input Level:**
    *   Command: `$INPLEVELSET,<addr>,<devcode>,<chan-num>,<level_0-255>;` (Note: Doc uses INPLEVELSET, API summary used INPLEVEL. Assuming SET for command.)

## System Adjustments (Requires Admin Privileges if Users Enabled)

*   **Adjust RGB Preset Value:**
    *   Command: `$RGBPRESET,<addr>,<devcode>,<rgb-preset_1-15>,#<wrgb>;`
    *   Response: `!OK,RGBPRESET,<addr>,<devcode>,<rgb-preset>,#<wrgb>;`
*   **Adjust Tunable White Preset Value:**
    *   Command: `$TWPRESET,<addr>,<devcode>,<tw-preset_48-55>,#<kelvin>K;`
    *   Response: `!OK,TWPRESET,<addr>,<devcode>,<tw-preset>,#<kelvin>K;`

---

## Appendix: Gateway Enumerations and Codes

*(Based on provided PDF extract. This section is for reference and may not be exhaustive.)*

### Device Codes (`<devcode>`)

| devCode | Product Code   | Products                                         |
|---------|----------------|--------------------------------------------------|
| 01      | EVO-LCD-55     | LCD Wall Plate                                   |
| 02      | EVO-SGP-xx     | 2, 5 & 10 button Wall Plates, Coolbrium & Icon   |
| 04      | EVO-RP-03-02   | Evo 2-channel Relay Module                       |
| 08      | EVS-xxx        | All Legacy Evo Slave Packs                       |
| 09      | EVO-INT-CI-xx  | Evo 4 & 8 channel Contact Input modules          |
| 12      | DIN-02-08      | eDIN 2A 8 channel leading edge dimmer module     |
| 13      | DIN-03-04-TE   | eDIN 3A 4 channel trailing edge dimmer module    |
| 14      | DIN-03-04      | eDIN 3A 4 channel leading edge dimmer module     |
| 15      | DIN-INT-00-08  | eDIN 8 channel IO module                         |
| 16      | DIN-RP-05-04   | eDIN 5A 4 channel relay module                   |
| 17      | DIN-UBC-01-05  | eDIN Universal Ballast Control module            |
| 18      | DIN-DBM-00-08  | eDIN 8 channel Configurable Output module        |
| 19      | DIN-DCM-xxx    | All eDIN Dimmer Packs                            |
| 21      | DIN-RP-00-xx   | All eDIN Rotary switch wall plates               |
| 24      | ECO_MULTISENSOR| eDIN Multi-sensor (both Mk1 and Mk2)             |
| 30      | MBUS-SPLIT     | MBus splitter module                             |
| 144     | DIN-RP-05-04   | eDIN 5A 4 channel mains sync relay module        |
| 145     | DIN-UBC-01-05  | eDIN Universal Ballast Control 2 module          |

### Channel Status Codes (`<status-code>` in error reports)

| Value | Error                     | Description                                                                          |
|-------|---------------------------|--------------------------------------------------------------------------------------|
| 0     | Status Ok                 | No Errors                                                                            |
| 2     | Device missing            | Device or Module is not responding to MBus messages.                                 |
| 3     | Channel Errors            | Module has errors on at least one specific channel – see channel for details.        |
| 4     | Bad Device Firmware       | System configured for features not in current module firmware.                         |
| 5     | No AC                     | Module uses mains AC and does not detect any.                                        |
| 6     | Too Hot                   | Module\'s internal temperature is above its maximum rated operating temperature.       |
| 7     | Override Active           | Channel manually set to override mode, no longer system controlled.                  |
| 8     | Internal Failure          | Channel or module has detected some sort of hardware failure internally.             |
| 9     | DALI Fixture Errors       | Fixtures on this DALI channel are reporting errors – see DALI fixtures for details. |
| 10    | Channel Load Failure      | Module detected a problem with the external load a channel is driving.               |
| 20    | No DALI PSU               | Module detected no PSU on its DALI bus.                                              |
| 21    | No DALI Commissioning Data| DALI universe on this module does not contain any commissioning data.                |
| 22    | DALI Commissioning problem| Actual DALI fixtures detected do not match commissioning data.                       |
| 25    | DALI Lamp failure         | A DALI fixture on this channel is indicating a lamp failure condition.               |
| 26    | DALI missing ballast      | A DALI fixture in commissioning data is not present (not responding).                |

### Button Palette Colours (for `$BTNCOLR` command)

| Value | Name        |
|-------|-------------|
| 0     | Black       |
| 1     | White       |
| 2     | Red         |
| 3     | Green       |
| 4     | Blue        |
| 5     | Orange      |
| 6     | Cyan        |
| 7     | Magenta     |
| 8     | Yellow      |
| 9     | DimWhite    |
| 10    | DimRed      |
| 11    | DimGreen    |
| 12    | DimBlue     |
| 13    | DimOrange   |
| 14    | DimCyan     |
| 15    | DimMagenta  |
| 16    | DimYellow   |

### Colour Palette and Modes (for RGB Channels - Presets for Set/Play Commands)

**Static Colour Presets (Value 1-15):**

| Palette Code | Default Name  |
|--------------|---------------|
| 1            | Red           |
| 2            | Orange        |
| 3            | Yellow        |
| 4            | LawnGreen     |
| 5            | Green         |
| 6            | Mint          |
| 7            | Cyan          |
| 8            | DeepSkyBlue   |
| 9            | Blue          |
| 10           | Purple        |
| 11           | Magenta       |
| 12           | DeepPink      |
| 13           | User1         |
| 14           | User2         |
| 15           | User3         |

**Colour Sequence Presets (Value 64-68 for Solid, 96-100 for Ripple):**

| Value | Mode                  |
|-------|-----------------------|
| 64    | Long Rainbow Solid    |
| 65    | Short Rainbow Solid   |
| 66    | Hot Colours Solid     |
| 67    | Cold Colours Solid    |
| 68    | User Colours Solid    |
| 96    | Long Rainbow Ripple   |
| 97    | Short Rainbow Ripple  |
| 98    | Hot Colours Ripple    |
| 99    | Cold Colours Ripple   |
| 100   | User Colours Ripple   |

### Tuneable White Pre-sets (Values for Set Commands)

| Preset Value | Default Name  | Default Temperature |
|--------------|---------------|---------------------|
| 48           | Candlelight   | 1800K               |
| 49           | SoftWhite     | 2700K               |
| 50           | WarmWhite     | 3000K               |
| 51           | Whitelight    | 3500K               |
| 52           | CoolWhite     | 4000K               |
| 53           | BrightWhite   | 5000K               |
| 54           | Daylight      | 6000K               |
| 55           | BlueSky       | 7000K               |

### Button/Contact Input Event States (for `!BTNSTATE`, `!INPSTATE` events and `$BTNSTATE`, `$INPSTATE` commands)

| Value | State        | Description                                     |
|-------|--------------|-------------------------------------------------|
| 0     | Release-off  | Button/contact released (inactive state)        |
| 1     | Press-on     | Button/contact pressed (active state)           |
| 2     | Hold-on      | Pressed and held for a sufficient time          |
| 5     | Short-press  | Released before Hold-on event occurred          |
| 6     | Hold-off     | Released after a Hold-on event                  |

### PIR Input Event/Command States (for `!INPPIR` event and `$INPPIRSET` command)

| Value | State/Command | Description                                           |
|-------|---------------|-------------------------------------------------------|
| 0     | Empty / SYNC  | Sensor at rest, no occupancy / Force sync event       |
| 1     | Triggered-On / TRIGGER | Presence event, active sensor / Force presence |
| 2     | Timeout-Off / TIMEOUT | Absence event, timeout occurred / Force absence |
| 3     | Set-On / SET  | Manual presence override, track occupancy             |
| 4     | HOLD          | (Command only) Manual presence, suspend timeout       |
| 5     | Cleared-Off / CLEAR | Manual absence override, track occupancy          |

---

# Volume 3: Developer Features

Formatted tables and the full Volume 3 command set: [docs/gateway-interface.md](docs/gateway-interface.md) (sections 12–19).

This section describes features of the eDIN+ GATEWAY interface that are primarily relevant for software developers. These features may provide access similar to the administrator pages of an eDIN+ system or allow for system extension. Familiarity with Volumes 1 & 2 is assumed.

**Caution:** Developer facilities interact closely with eDIN+ internal workings and can have significant side-effects. Contact Mode Lighting to discuss your application before using these features. Administrative privileges are required for these features.

## Developer Features Overview

*   **Info Web Service & CSV Files:** Provides fuller access to eDIN+ configuration (modules, channels, scenes) than standard discovery queries, using CSV file import/export via HTTP.
*   **Offline Scene Setting:** Allows adjustment of individual scene elements (fade time, channel inclusion, levels/colors) without affecting live levels, overcoming limitations of `$SCNSAVE`.
*   **External Control through GATEWAY:** Enables an external system to be the primary controller, with an optional eDIN+ backup configuration.
*   **Advanced Channel API:** Includes commands for channel identification/test, module discovery, and DALI fixture health queries.
*   **Advanced DALI Repair:** Provides tools to fix DALI commissioning errors (e.g., Status Code 22) by finding and repairing fixtures.
*   **Advanced Sensor Repair:** (To be completed in documentation)
*   **The XDALI API:** Offers a "DALI back door" to send any DALI message directly to a DALI bus, bypassing the eDIN+ system.

## The Info Web Service and CSV Files

This web service, separate from the GATEWAY interface, provides comprehensive access to eDIN+ configuration information via HTTP GET (export) and POST (import) requests using CSV formatted data.

### Accessing the Web Service
*   **URL:** `http://<npu_ip_address>/info?<parameters>`
*   **Content-Type:** `application/csv`

### Exporting Configuration Information (HTTP GET)
Requires administrator privileges (HTTP Basic Authorization if user accounts are set up).

**Mandatory Parameter:**
*   `what=names`: List of modules and their channels.
*   `what=levels`: List of scenes and the channels they control.
*   `what=dali`: List of DALI buses and their fixtures.

**Optional Filter Parameters:**
*   For `what=names`:
    *   `foraddress=<addr-list>` (comma-separated MBus addresses)
    *   `fordevicecode=<devcode-list>` (comma-separated device codes)
*   For `what=levels`:
    *   `forarea=<area-num-list>` (comma-separated area numbers)
    *   `forscene=<scene-num-list>` (comma-separated scene numbers; `forscene` takes precedence over `forarea` if both used)
*   For `what=dali`:
    *   `foraddress=<addr-list>` (comma-separated MBus addresses of DALI universes)

**Optional Global Parameter:**
*   `&where=<filename>`: Returns filename in `Content-Disposition` header for automatic file download by browsers.

**Example (JQuery GET):**
```javascript
$.ajax({
  type: 'GET',
  url: 'http://'+ipaddr+'/info?what=names&foraddress=6,17',
  contentType: 'application/csv; ',
  dataType: 'text',
  username: 'Administrator',
  password: 'your_password_here',
});
```

### Importing Configuration Information (HTTP POST)
Changes the eDIN+ configuration and **requires the configuration password** via HTTP Basic Authorization (user accounts MUST be set up).

**Mandatory Parameter:**
*   `what=names`: Change module/channel names and areas.
*   `what=levels`: Perform scene setting.
*   `what=dali`: Re-register commissioned DALI fixtures.

**Example (JQuery POST):**
```javascript
$.ajax({
  type: 'POST',
  url: 'http://'+ipaddr+'/info?what=names',
  data: '!EDIN NAMES FILE\nAREA,1,First Area\n',
  contentType: 'application/csv; ',
  dataType: 'text',
  username: 'configuration', // Special username for configuration changes
  password: 'your_config_password_here',
});
```

**General Rules for Imported CSV Data:**
1.  Each item on a new line (CR, LF, or CR-LF).
2.  First line must identify data type (e.g., `!EDIN NAMES FILE`). Text after identification is ignored.
3.  Lines starting with `!` are comments.
4.  Blank lines are ignored.
5.  Whitespace within a line is significant.
6.  First field of an item is a case-insensitive token identifying item type.
7.  Numeric fields are mandatory, can have leading zeros, no leading spaces. Text fields are case-sensitive and can be blank.
8.  Item properties used for identification vs. modification vary by item type.
9.  Items with all required fields are accepted; additional fields are ignored.
10. Unrecognized or non-importable items are ignored.
11. Syntax often mirrors GATEWAY discovery/status queries.

### Names CSV File Format (`what=names`)
**Header:** `!EDIN NAMES FILE`

Modifies existing items; cannot define new items.

| Item           | Format                                                          |
|----------------|-----------------------------------------------------------------|
| `PROJECTNAME`  | `PROJECTNAME,<name-string>`                                     |
| `PROJECTVERSION`| `PROJECTVERSION,<version-string>`                               |
| `PROJECTOWNER` | `PROJECTOWNER,<owner-string>`                                   |
| `AREA`         | `AREA,<area-no>,<name-string>`                                  |
| `PLATE`        | `PLATE,<addr>,<devcode>,<area-no>,<name-string>`                |
| `MODULE`       | `MODULE,<addr>,<devcode>,<area-no>,<name-string>`                |
| `CHAN`         | `CHAN,<addr>,<devcode>,<chan-no>,<area-no>,<name-string>`        |
| `DALI`         | `DALI,<addr>,<devcode>,<dali-no>,<area-no>,<name-string>`        |
| `DMX`          | `DMX,<addr>,<devcode>,<zone-no>,<area-no>,<name-string>`         |
| `INPSTATE`     | `INPSTATE,<addr>,<devcode>,<chan-no>,<area-no>,<name-string>`    |
| `INPPIR`       | `INPPIR,<addr>,<devcode>,<chan-no>,<area-no>,<name-string>`      |
| `INPLEVEL`     | `INPLEVEL,<addr>,<devcode>,<chan-no>,<area-no>,<name-string>`    |

**Example Data:**
```csv
!EDIN NAMES FILE

!the next line changes the project name
PROJECTNAME,Example Project

!the next line changes the name for area no 1
AREA,1,First Area

!the next lines move the first two DALI channels on UBC at address 3 in to area no 1 and change their name 
DALI,3,17,1,1,DALI Channel 1
DALI,3,17,2,1,Main Downlights
```

### Levels CSV File Format (`what=levels`)
**Header:** `!EDIN LEVELS FILE`

Modifies existing items; cannot define new items.

| Item             | Format                                                                |
|------------------|-----------------------------------------------------------------------|
| `AREA`           | `AREA,<area-no>,<name-string>`                                        |
| `SCENE`          | `SCENE,<scene-no>,<name-string>`                                      |
| `SCNFADE`        | `SCNFADE,<scene-no>,<fadetime-ms>`                                    |
| `SCNCHANLEVEL`   | `SCNCHANLEVEL,<scene-no>,<addr>,<devcode>,<chan-no>,<level>`           |
| `SCNDALILEVEL`   | `SCNDALILEVEL,<scene-no>,<addr>,<devcode>,<dali-no>,<level>`           |
| `SCNDMXLEVEL`    | `SCNDMXLEVEL,<scene-no>,<addr>,<devcode>,<zone-no>,<level>`            |
| `SCNCHANRGBCOLR` | `SCNCHANRGBCOLR,<scene-no>,<addr>,<devcode>,<chan-no>,<colour_or_preset>`|
| `SCNDMXRGBCOLR`  | `SCNDMXRGBCOLR,<scene-no>,<addr>,<devcode>,<zone-no>,<colour_or_preset>`|
| `SCNCHANRGBPLAY` | `SCNCHANRGBPLAY,<scene-no>,<addr>,<devcode>,<chan-no>,<seq>`           |
| `SCNDMXRGBPLAY`  | `SCNDMXRGBPLAY,<scene-no>,<addr>,<devcode>,<zone-no>,<seq>`            |
| `SCNCHANTWCOLR`  | `SCNCHANTWCOLR,<scene-no>,<addr>,<devcode>,<chan-no>,<kelvin_or_preset>`|
| `SCNDMXTWCOLR`   | `SCNDMXTWCOLR,<scene-no>,<addr>,<devcode>,<zone-no>,<kelvin_or_preset>`|

*Note: `<colour>` can be `#rrggbb`. `<kelvin>` can be `#kelvinK`.*

**Example Data:**
```csv
!EDIN LEVELS FILE

!the next line changes the fade time to 1 sec for scene no 3
SCNFADE,3,1000

! the next lines change the levels for scene no 5
SCNCHANLEVEL,5,1,12,3,255
SCNDMXLEVEL,5,2,15,1,255
SCNDMXRGBCOLR,5,2,15,1,#FF0080
```

### Dali CSV File Format (`what=dali`)
**Header:** `!EDIN DALI COMMISSIONING FILE`

Operations:
*   Clear existing commissioning data for a DALI universe.
*   Modify an existing DALI fixture.
*   Add new DALI fixtures.
*   Cannot delete individual fixtures (delete whole universe and re-import without it).
*   This modifies expected fixture list, not physical fixtures.
*   Keep `BALLAST` items for the same universe together. Use `DALIUNIVERSE` before `BALLAST` items for that universe.

| Item           | Format                                                              |
|----------------|---------------------------------------------------------------------|
| `DALIUNIVERSE` | `DALIUNIVERSE,<addr>,<devcode>` (Deletes all existing data for universe)|
| `BALLAST`      | `BALLAST,<addr>,<devcode>,<short-addr>,<long-addr>,<type>,<groups>`   |

**Example Data:**
```csv
!EDIN DALI COMMISSIONING FILE

! the next item deletes all DALI commissioning data on UBC 3,17
DALIUNIVERSE,3,17
! the next items redefine 5 new fixtures for the universe
BALLAST,3,17,0,2109473,0,1
BALLAST,3,17,1,7811888,0,2
BALLAST,3,17,2,12129130,0,4
BALLAST,3,17,13,10722243,0,8
BALLAST,3,17,24,6492078,0,16
```

## Offline Scene Setting

Allows redefinition of a scene (fade time, channels, levels/states) without affecting live channel levels. More complex than `$SCNSAVE` but offers more control.

**Advantages:**
*   Remote/background scene definition.
*   Adjust channels without live state (e.g., DALI virtual BST/Gxx).
*   Change which channels are in a scene.

**Limitations:**
*   Cannot create new scenes (new scene numbers).
*   Must send complete scene definition (all channels) each time.
*   Operation can fail; requires completion within a finite time.

### SCNSET Method Overview
1.  Frame commands with `$SCNSET,<scn-num>;` (start) and `$SCNEND,<scn-num>;` (end).
2.  Changes `adjust-stamp` in `?SYSTEMID`.
3.  Scene must allow editing (access level).
4.  Only controllable/editable channels are affected.
5.  Scene set operation is nearly invisible but invalidates scene state, potentially affecting plate buttons.
6.  Internal token mechanism prevents merging simultaneous definitions from multiple connections. Token expires if operation isn't completed.

**Typical Workflow:**
1.  Query current definition: `?SCNSET,<scn-num>;` (and optionally `?SCNSETNAMES,<scn-num>;`).
2.  Modify the channel list.
3.  Send the new definition using SCNSET commands (as a single transaction).
4.  Check `!SCNSETACK,<scn-num>,<status>;` (1=performed, 0=not performed) or re-query with `?SCNSET`.

**Transaction Rules:**
*   For non-HTTP connections, subsequent SCNSET messages must be sent within 30 seconds until `$SCNEND` or `$SCNABORT`.
*   All commands in a transaction must be on the same session.
*   Only one active SCNSET transaction per scene.
*   `$SCNABORT;` can abort active transactions on a session (useful for long-lived connections).

### Scene Set Commands

*   **Begin Scene Definition:**
    *   `$SCNSET,<scn-num>;`
    *   Response: `!OK,SCNSET,<scn-num>;`
*   **(Optional) Set Scene Fade Time:**
    *   `$SCNFADE,<scn-num>,<fadetime_ms>;`
    *   Response: `!OK,SCNFADE,<scn-num>,<fadetime_ms>;`
*   **Set Channel Level:**
    *   `$SCNCHAN,<scn-num>,<addr>,<devcode>,<chan-num>,<level>;`
    *   `$SCNDALI,<scn-num>,<addr>,<devcode>,<dali-id_or_BST_or_Gxx>,<level>;`
    *   `$SCNDMX,<scn-num>,<addr>,<devcode>,<zone-num>,<level>;`
    *   Response: `!OK,SCNxxx,<scn-num>,...,<level>;`
*   **Set Channel Static Preset Colour:**
    *   `$SCNCHANRGBCOLR,<scn-num>,<addr>,<devcode>,<chan-num>,<preset>;`
    *   `$SCNDMXRGBCOLR,<scn-num>,<addr>,<devcode>,<zone-num>,<preset>;`
    *   Response: `!OK,SCNxxxRGBCOLR,...;`
*   **Set Channel Direct Static Colour:**
    *   `$SCNCHANRGBCOLR,<scn-num>,<addr>,<devcode>,<chan-num>,#<wrgb>;`
    *   `$SCNDMXRGBCOLR,<scn-num>,<addr>,<devcode>,<zone-num>,#<wrgb>;`
    *   Response: `!OK,SCNxxxRGBCOLR,...;`
*   **Set Channel to Play Colour Sequence:**
    *   `$SCNCHANRGBPLAY,<scn-num>,<addr>,<devcode>,<chan-num>,<preset>;`
    *   `$SCNDMXRGBPLAY,<scn-num>,<addr>,<devcode>,<zone-num>,<preset>;`
    *   Response: `!OK,SCNxxxRGBPLAY,...;`
*   **Set Channel to Preset Colour Temperature:**
    *   `$SCNCHANTWCOLR,<scn-num>,<addr>,<devcode>,<chan-num>,<preset>;`
    *   `$SCNDMXTWCOLR,<scn-num>,<addr>,<devcode>,<zone-num>,<preset>;`
    *   Response: `!OK,SCNxxxTWCOLR,...;`
*   **Set Channel to Direct Colour Temperature:**
    *   `$SCNCHANTWCOLR,<scn-num>,<addr>,<devcode>,<chan-num>,#<kelvin>K;`
    *   `$SCNDMXTWCOLR,<scn-num>,<addr>,<devcode>,<zone-num>,#<kelvin>K;`
    *   Response: `!OK,SCNxxxTWCOLR,...;`
*   **End Scene Definition:**
    *   `$SCNEND,<scn-num>;`
    *   Response: `!OK,SCNEND,<scn-num>;` followed by `!SCNSETACK,<scn-num>,<status>;` (1=performed, 0=not performed)
*   **Abort Scene Definition:**
    *   `$SCNABORT;`
    *   Response: `!OK,SCNABORT;`

**Example Transaction & Responses:**
```
$scnSET,3;
$scnFade,3,10000;
$scnChan,3,2,21,5,255;
$scnChanRgbColr,3,2,21,5,#ff7f00;
$scnEnd,3;

!OK,SCNSET,00003;<CR><LF>
!OK,SCNFADE,00003,00010000;<CR><LF>
!OK,SCNCHAN,00003,002,21,005,255;<CR><LF>
!OK,SCNCHANRGBCOLR,00003,002,21,005,#FF7F00;<CR><LF>
!OK,SCNEND,00003;<CR><LF>
!SCNSETACK,00003,1;<CR><LF>
```

### Scene Set Queries

#### Scene Definition Query (`?SCNSET`)
Returns channel elements in the scene and their settings, plus fade time.
*   Query: `?SCNSET,<scn-num>;`
*   Response: `!OK,SCNSET,<scn-num>;` followed by:
    *   `!SCNSET,<scn-num>;` (Start of definition)
    *   Zero or more scene item reports:
        *   `!SCNFADE,<scn-num>,<fadetime_ms>;`
        *   `!SCNCHAN,<scn-num>,<addr>,<devcode>,<chan-num>,<level>;`
        *   `!SCNDALI,<scn-num>,<addr>,<devcode>,<dali-id_or_BST_or_Gxx>,<level>;`
        *   `!SCNDMX,<scn-num>,<addr>,<devcode>,<zone-num>,<level>;`
        *   `!SCNCHANRGBCOLR,<scn-num>,<addr>,<devcode>,<chan-num>,<preset_or_#wrgb>;`
        *   `!SCNDMXRGBCOLR,<scn-num>,<addr>,<devcode>,<zone-num>,<preset_or_#wrgb>;`
        *   `!SCNCHANRGBPLAY,<scn-num>,<addr>,<devcode>,<chan-num>,<preset>;`
        *   `!SCNDMXRGBPLAY,<scn-num>,<addr>,<devcode>,<zone-num>,<preset>;`
        *   `!SCNCHANTWCOLR,<scn-num>,<addr>,<devcode>,<chan-num>,<preset_or_#kelvinK>;`
        *   `!SCNDMXTWCOLR,<scn-num>,<addr>,<devcode>,<zone-num>,<preset_or_#kelvinK>;`
    *   `!SCNEND,<scn-num>;` (End of definition)

**Example Query & Response:**
```
?scnSET,3;

!OK,SCNSET,00003;<CR><LF>
!SCNSET,00003;<CR><LF>
!SCNFADE,00003,00010000;<CR><LF>
!SCNCHAN,00003,002,21,005,255;<CR><LF>
!SCNCHANRGBCOLR,00003,002,21,005,#FF7F00;<CR><LF>
!SCNEND,00003;<CR><LF>
```

#### Channel Discovery for Scene Set (`?SCNSETNAMES`)
Returns channel elements in the scene and their names.
*   Query: `?SCNSETNAMES,<scn-num>;`
*   Response: `!OK,SCNSETNAMES,<scn-num>;` followed by:
    *   `!SCNSETNAMES,<scn-num>;` (Start of names)
    *   Zero or more scene item name reports:
        *   `!SCNCHANNAME,<scn-num>,<addr>,<devcode>,<chan-num>,<name>;`
        *   `!SCNDALINAME,<scn-num>,<addr>,<devcode>,<dali-id_or_BST_or_Gxx>,<name>;`
        *   `!SCNDMXNAME,<scn-num>,<addr>,<devcode>,<zone-num>,<name>;`
        *   `!SCNCHANRGBCOLRNAME,<scn-num>,<addr>,<devcode>,<chan-num>,<name>;` (Note: Doc shows SCNxxxRGBCOLRNAME, consistent with other name reports)
        *   `!SCNDMXRGBCOLRNAME,<scn-num>,<addr>,<devcode>,<zone-num>,<name>;`
        *   `!SCNCHANTWCOLRNAME,<scn-num>,<addr>,<devcode>,<chan-num>,<name>;`
        *   `!SCNDMXTWCOLRNAME,<scn-num>,<addr>,<devcode>,<zone-num>,<name>;`
        *   `!SCNCHANRGBPLAYNAME,<scn-num>,<addr>,<devcode>,<chan-num>,<name>;`
        *   `!SCNDMXRGBPLAYNAME,<scn-num>,<addr>,<devcode>,<zone-num>,<name>;`
    *   `!SCNSETNAMESEND,<scn-num>;` (End of names)

**Example Query & Response:**
```
?scnSetNames,3;

!OK,SCNSETNAMES,00003;<CR><LF>
!SCNSETNAMES,00003;<CR><LF>
!SCNCHANNAME,00003,002,21,005,Downlights;<CR><LF>
!SCNCHANRGBCOLRNAME,00003,002,21,005,Downlights;<CR><LF>
!SCNSETNAMESEND,00003;<CR><LF>
```

## External Control through GATEWAY

Allows an external system to control the eDIN+ system.

**A. Minimal Configuration (No Backup Controller):**
*   Create an eDIN+ configuration defining only hardware modules (no rules, scenes, areas).
*   Use Channel API commands/queries to control the system.
*   Enable GATEWAY events for timely response to input events.

**B. Configuration with Backup Controller:**
*   Create an eDIN+ configuration with hardware, rules, scenes, etc., for backup behavior.
*   Inhibit the internal eDIN+ controller by repeatedly sending `$MASTERTICK`.

### Inhibit In-Built Backup Control

#### Master Tick Command (`$MASTERTICK`)
Requires administrator privileges. Informs the internal controller that an external controller is active.
*   **Command:** `$MASTERTICK,<seconds_since_1_jan_1970_utc>;`
*   **Response:** `!OK,MASTERTICK,<seconds_since_1_jan_1970_utc>;`
*   Should be sent every second. Also acts as a system heartbeat.
*   Internal controller takes back control after ~5 seconds of no `$MASTERTICK` messages.

**Example:**
```
$masterTick,1646218969;
!OK,MASTERTICK,1646218969;<CR><LF>
```

## Advanced Channel API

### Advanced Module Discovery

#### Module Discovery Queries (`?MODULENAME`)
Returns information about modules. Can be used without a configuration loaded (useful with XDALI API).
*   **Query All Modules:** `?MODULENAME;`
*   **Query Modules by Device Code:** `?MODULENAME,<device-code>;`
*   **Response:** `!OK,MODULENAME;` (or `!OK,MODULENAME,<device-code>;`) followed by zero or more:
    *   `!MODULENAME,<addr>,<devcode>,<device-style_0>,<access_bitfield>,<area-num_0_if_unassigned>,<module-name>;`

**Example:**
```
?MODULENAME,17;
!OK,MODULENAME,017;
!MODULENAME,001,017,00,07,00000,;<CR><LF>
!MODULENAME,002,017,00,07,00000,;<CR><LF>
```

### Channel Test and Fixture Identification
Temporarily overrides a lighting channel/fixture to flash. Only one channel/fixture per module at a time. Automatic 5-minute timeout (resend command to reset).

*   **Cancel Identify on a Module:**
    *   `$SHOWOFF,<addr>,<devcode>;`
    *   Response: `!OK,SHOWOFF,<addr>,<devcode>;`
*   **Identify Channel:**
    *   `$SHOWCHAN,<addr>,<devcode>,<chan-num>;`
    *   `$SHOWDALI,<addr>,<devcode>,<dali-num>;`
    *   Response: `!OK,SHOWCHAN,...;` or `!OK,SHOWDALI,...;`
*   **Identify DALI Fixture:** (`<dali-fixture>` is `Fxx`, e.g., `F0` for short address 0)
    *   `$SHOWDALI,<addr>,<devcode>,<dali-fixture>;`
    *   Response: `!OK,SHOWDALI,...;`

**Examples:**
```
$showOff,08,2;
!OK,SHOWOFF,008,002;<CR><LF>

$showChan,08,2,1;
!OK,SHOWCHAN,008,002,001;<CR><LF>

$showDali,2,17,F0;
!OK,SHOWDALI,002,017,F00;
```

### DALI Fixture Status

#### Request DALI Fixture Status
Queries current status of an individual DALI fixture (must be known/expected fixture).
*   **Query:** `?DALI,<addr>,<devcode>,<dali-fixture_Fxx>;`
*   **Response:** `!OK,DALI,<addr>,<devcode>,<dali-fixture>;` followed by:
    *   `!DALIERR,<addr>,<devcode>,<dali-fixture>,<status-code>;`

**Example:**
```
?dali,1,17,F1;
!OK,DALI,001,017,F01;<CR><LF>
!DALIERR,001,017,F01,000;<CR><LF>
```

## Advanced DALI Repair

Tools to repair DALI commissioning issues (e.g., Status Code 22).

### DALI Repair API and Events
Admin privileges required. Events are in `EVTADV` class.

#### Advanced DALI Sessions
Entering a repair session turns off fixture error checking. Explicitly use `$DALICAPTURE` for all UBCs or implicitly per UBC on first repair command.
*   **Start Repair Session (all UBCs):**
    *   `$DALICAPTURE;`
    *   Response: `!OK,DALICAPTURE;`
*   **End Repair Session (all UBCs):**
    *   `$DALIDONE;`
    *   Response: `!OK,DALIDONE;`
*   Sessions have a 5-minute timeout, extended by repair commands or `$DALICAPTURE`.

#### Advanced DALI Scans
Finds fixtures on a DALI bus.
*   **Perform DALI Scan:**
    *   `$DALISCAN,<addr>,<devcode>;`
    *   Response: `!OK,DALISCAN,<addr>,<devcode>;`
*   **Request DALI Scan Progress/Status:**
    *   `?DALISCAN,<addr>,<devcode>;`
    *   Response: `!OK,DALISCAN,<addr>,<devcode>;` followed by `!DALISCAN,<addr>,<devcode>,<scan-status>,<num-of-fixtures>;`
*   **Event: DALI Scan Status:** (Class: `EVTADV`)
    *   `!DALISCAN,<addr>,<devcode>,<scan-status>,<num-of-fixtures>;`
    *   **Scan Status Codes:** 0=Idle, 1=Search Done, 2=Searching, 3=Programming, 4=Error.

#### Advanced DALI Live Fixtures
Obtain scan results. Data updated by scan/repair/accept operations.
*   **Request DALI Fixture Information:**
    *   `?DALIFIX,<addr>,<devcode>;`
    *   Response: `!OK,DALIFIX,<addr>,<devcode>;` followed by zero or more `!DALIFIX` messages, then `!DALIEND`.
*   **Event: Report of DALI Fixture Information:** (Class: `EVTADV`)
    *   `!DALIFIX,<addr>,<devcode>,<dali-fixture_Fxx_or_FXX_if_no_short_addr>,<long-addr_24bit>,<groups_16bit>,<device-type_8bit>,<fixture-status>;`
*   **Event: End of DALI Fixture Information:** (Class: `EVTADV`)
    *   `!DALIEND,<addr>,<devcode>;`

**DALI Scan Fixture Status Codes (`<fixture-status>` in `!DALIFIX`):**

| Value | Error        | Description                                     |
|-------|--------------|-------------------------------------------------|
| 0     | Ok           | No Error with fixture                           |
| 1     | Lamp Failure | Fixture is reporting Lamp Failure               |
| 2     | Missing      | Expected fixture not present on DALI bus.       |
| 5     | New          | Fixture present but not in commissioning data.  |
| 8     | Address Clash| Multiple fixtures with the same short address.  |
| 9     | Unassigned   | Fixture non-existent or no valid short address. |

#### Advanced DALI Repair Commands
Adjust physical fixtures and/or commissioning data.
*   **Repair a DALI Fixture:** (Reprograms physical fixture, updates commissioning data)
    *   `$DALIREPAIR,<addr>,<devcode>,<missing-fixture_Fxx>,<new-fixture_Fxx>;`
    *   Response: `!OK,DALIREPAIR,...;`
*   **Accept/Import a DALI Fixture:** (Modifies commissioning data only)
    *   `$DALIACCEPT,<addr>,<devcode>,<new_or_missing_fixture_Fxx>;`
    *   Response: `!OK,DALIACCEPT,...;`
*   **Event: Repair of DALI Fixture:** (Class: `EVTADV`)
    *   `!DALIREPAIR,<addr>,<devcode>,<missing-fixture_Fxx>,<new-fixture_Fxx>;`
*   **Event: Import of DALI Fixture:** (Class: `EVTADV`)
    *   `!DALIACCEPT,<addr>,<devcode>,<new_or_missing_fixture_Fxx>;`

### Fixing DALI Broadcast Channel Errors
Usually self-heal. If not, re-initialize via module menu or web pages. No specific GATEWAY commands.

### The DALI Repair Process
1.  **(Optional) Prepare:** `$DALICAPTURE;` (clears DALI errors, prepares all universes).
2.  **Perform Scan:** `$DALISCAN,<addr>,<devcode>;`. Monitor with `?DALISCAN` / `?DALIFIX` or `!DALISCAN` / `!DALIFIX` events.
3.  **Identify Fixtures:** Match missing (expected) fixtures with new (actual) fixtures, using physical location and flashing commands (`$SHOWDALI Fxx`).
4.  **Repair:** `$DALIREPAIR,<addr>,<devcode>,<missing_Fxx>,<new_Fxx>;` for each match.
5.  **Tidy Data:** `$DALIACCEPT,<addr>,<devcode>,<Fxx>;` to remove unmatchable missing fixtures or add unmatchable new ones.
6.  **Check & End Session:** Verify statuses in `?DALIFIX` are 'Ok'. Send `$DALIDONE;` to re-enable runtime checking.
7.  **Backup Configuration:** (Done outside GATEWAY interface).

**Using Info Web Service in Repair:**
Can export (`GET /info?what=dali`) and import (`POST /info?what=dali`) DALI commissioning data.
*   **To clear data for a universe:** Import a file with `DALIUNIVERSE,<addr>,<devcode>` and no `BALLAST` items for that universe.
*   **To change groups:** Export, edit groups for a `BALLAST` item, re-import. Then use `$DALIREPAIR,addr,devcode,Fx,Fx;` to update the physical fixture.

**(A detailed Repair Process Example is provided in the source document but omitted here for brevity; it demonstrates the flow of scan results and repair commands.)**

## Advanced Sensor Repair
*(To be completed in documentation.)*

## The XDALI API

Provides direct DALI bus access, bypassing eDIN+ system logic. Requires admin privileges. No XDALI-specific events.
Use `?MODULENAMES,17;` to find DALI Universes (UBCs).
Supports standard 16-bit Control Gear DALI2 messages. Does not support 24-bit Control Device DALI2 messages.

**DALI2 Message Formats Overview:**
*   **DAP (Direct Arc Power):** Address byte, level byte.
*   **General Opcode:** Address byte, opcode byte.
*   **Special Opcode:** Special opcode byte, data byte.
*   **Application Extended Opcode:** General opcode format, preceded by 'Enable Device Type' special message.
*   **Flags:** 'Needs Answer' (for queries), 'Send Twice' (for critical commands).

### XDALI API and Connections

#### HTTP Query Timeout Control
For HTTP connections, if a UBC doesn't respond to an XDALI query, the request might time out. Default is a few seconds.
*   **Custom Timeout Header:** `ModeLighting-Timeout: <seconds>` (e.g., `ModeLighting-Timeout: 20`)

### XDALI API Messages
Use DALI identifiers: `BST` (broadcast), `Gxx` (group), `Fxx` (fixture short address).
Queries return `<resp-data>` and `<resp-status>`.

**Response Status (`<resp-status>`):**

| Value | Status           | Description                                     |
|-------|------------------|-------------------------------------------------|
| 0     | Ok               | 'Yes' response, or `resp-data` is valid.        |
| 1     | No Response      | 'No' response or 'No fixture' error.            |
| 2     | Corrupt Response | Erroneous multi-reply or noise; or 'Yes' response.|

Each `$XDALI...` command (except `$XDALIDELAY`) generates an equivalent `!XDALI...` event in the `EVTADV` class after the DALI message is sent.

#### XDALI DAP Message (`$XDALIDAP`)
Sets Direct Arc Power.
*   **Command:** `$XDALIDAP,<addr>,<devcode>,<dali-id>,<dap-level_0-255>;` (255 = stop fade)
*   **Response:** `!OK,XDALIDAP,...;`
*   **Event:** `!XDALIDAP,<addr>,<devcode>,<dali-id>,<dap-level>;`

#### XDALI General Messages (`$XDALI`, `$XDALIX2`, `?XDALI`)
Sends a general DALI opcode.
*   **Command (Send Once):** `$XDALI,<addr>,<devcode>,<dali-id>,<opcode_0-200>;`
*   **Command (Send Twice):** `$XDALIX2,<addr>,<devcode>,<dali-id>,<opcode_0-200>;`
*   **Responses:** `!OK,XDALI,...;` or `!OK,XDALIX2,...;`
*   **Query:** `?XDALI,<addr>,<devcode>,<dali-id>,<opcode_0-200>;`
*   **Query Response:** `!OK,XDALI,...;` then `!XDALI,<addr>,<devcode>,<dali-id>,<opcode>,<resp-data_8bit>,<resp-status>;`
*   **Events:** `!XDALI,...;` or `!XDALIX2,...;`

#### XDALISP Special Messages (`$XDALISP`, `$XDALISPX2`, `?XDALISP`)
Sends a special DALI opcode (address byte is opcode, opcode byte is data).
*   **Command (Send Once):** `$XDALISP,<addr>,<devcode>,<special-opcode_161-201>,<data_0-255>;`
*   **Command (Send Twice):** `$XDALISPX2,<addr>,<devcode>,<special-opcode_161-201>,<data_0-255>;`
*   **Responses:** `!OK,XDALISP,...;` or `!OK,XDALISPX2,...;`
*   **Query:** `?XDALISP,<addr>,<devcode>,<special-opcode_161-201>,<data_0-255>;`
*   **Query Response:** `!OK,XDALISP,...;` then `!XDALISP,<addr>,<devcode>,<special-opcode>,<data>,<resp-data_8bit>,<resp-status>;`
*   **Events:** `!XDALISP,...;` or `!XDALISPX2,...;`

#### XDALIAPP Application Extended Messages (`$XDALIAPP`, `$XDALIAPPX2`, `?XDALIAPP`)
Sends an application extended opcode (preceded by 'Enable Device Type' special message).
*   **Command (Send Once):** `$XDALIAPP,<addr>,<devcode>,<dali-id>,<opcode_224-254>,<device-type_0-253>;`
*   **Command (Send Twice):** `$XDALIAPPX2,<addr>,<devcode>,<dali-id>,<opcode_224-254>,<device-type_0-253>;`
*   **Responses:** `!OK,XDALIAPP,...;` or `!OK,XDALIAPPX2,...;`
*   **Query:** `?XDALIAPP,<addr>,<devcode>,<dali-id>,<opcode_224-254>,<device-type_0-253>;`
*   **Query Response:** `!OK,XDALIAPP,...;` then `!XDALIAPP,<addr>,<devcode>,<dali-id>,<opcode>,<device-type>,<resp-data_8bit>,<resp-status>;`
*   **Events:** `!XDALIAPP,...;` or `!XDALIAPPX2,...;`

#### XDALI Delay (`$XDALIDELAY`)
Forces a delay on the DALI bus.
*   **Command:** `$XDALIDELAY,<addr>,<devcode>,<delaytime_ms_0-65000>;`
*   **Response:** `!OK,XDALIDELAY,...;` (Note: Doc example shows `!OK,XDALIAPP...` likely a typo, should be `!OK,XDALIDELAY...`)

**Example Usage (Randomize and Initialize):**
```
$xdaliSpX2,3,17,167,0;       // Randomise command (send twice)
$xdaliDelay,3,17,300;       // Wait 300ms
$xdaliSpX2,3,17,165,0;       // Initialize all command (send twice)

!OK,XDALISPX2,003,017,167,000;<CR><LF>
!OK,XDALIDELAY,003,017,00300;<CR><LF>
!OK,XDALISPX2,003,017,165,000;<CR><LF>
```

