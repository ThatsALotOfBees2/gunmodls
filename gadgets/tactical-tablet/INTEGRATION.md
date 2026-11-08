# Tactical Tablet: integration guide

This guide is for anyone (or any session) putting the tablet into the game with no other context. `viewer.html` is
the reference implementation: screen sequencing, sounds and the LED. `../../unity/Runtime/TacticalTablet.cs` is a
working Unity version of all of it. Its API matches `TacticalPhone`, with additions for push-to-talk, the flap and
the strap.

## The gadget

- **Held in the left hand**, under the back hand strap, screen toward the eyes. The thumb reaches the glass and
  the violet PTT key on the holder's left edge. Parent the tablet to the left hand bone through the
  `grip_left_hand` attach socket (an empty node, no mesh). It sits on the palm's surface on the battery door,
  under the strap pad, palm facing −Z. Thumb IK targets are `fx_touch` (glass) and `fx_ptt` (PTT key). In first
  person, hold it low-left, tipped about 30 degrees toward the eyes.
- **Draw and holster** are the holder's animations; the tablet just rides the hand.
  - Call `Draw()` as it comes up: draw sound, `wake`, then `unlock`.
  - Call `Holster()` as it goes away: holster sound, then a dark screen or `power_off`.
- **Scan** is the programmable key on the top edge. `scan` presses it and the thermal app opens.
  - Run the ability's query 0.3 s in, from `fx_scan` (the thermal window).
  - The lock-on screen shows at 1.0 s.
- **Push-to-talk** is the ribbed violet key on the holder's left edge.
  - `PttDown()` keys up the radio: chirp, talk screen, key held.
  - `PttUp()` releases it: roger beep, key out, back to the app.
  - Anything else that ends a held PTT also releases it first, with the beep and `onPttUp`: `PowerOff()`,
    `ScreenOff()`, `Holster()`, `LowBattery()`, and the end of an alert that was raised before unlock. The game's
    radio never stays keyed.
  - The radio works through an alert. A PTT held when the alert starts stays keyed, and `PttDown()` during an alert
    keys it (with the key click and chirp). The script holds the key down over the alert clip. When the alert ends
    with the key still held, the talk screen takes over with the `ptt` clip in its held span.
- **Apps**: idle shows the map, the drone feed, the thermal scan, the home screen or the radio. A live
  RenderTexture of the drone's camera can replace the drone cells (the script stretches the screen's inner UV area over the whole feed).
- **Size and mass:** 131.6 × 212.0 × 15.8 mm over the corner bumpers (without the strap), about 0.6 kg. The
  overmould wall line is 129.6 × 210 × 14.6 mm and the mid-frame 125.8 × 206.2 × 12.95 mm. The bumpers' front lip
  stands 1.2 mm above the glass and their back face 0.9 mm above the cover, and the camera deco ring stays 0.2 mm
  inside the bumper line, so `body_COL` is the whole tablet. The strap bows to about 5 mm off the battery door at its
  middle; its top stands about 6.2 mm above the back bumper line (measured: `hand_strap_COL` max z 14.07 mm against
  the bumpers' 7.9 mm).

## Axes and import

- **glTF axes:** metres, +Y up the long axis (portrait), the screen faces −Z, the rear cameras +Z. The **holder's
  left is +X**: the PTT key is on +X, and power, volume and the SIM / microSD tray are on −X. The programmable key and
  two mics are on the top edge (+Y). The USB-C flap and a mic are on the bottom edge. The loudspeaker slots, the front
  camera, the ALS window and the status LED are in the front bezels. The origin is the centre of the tablet's volume.
- **glTFast negates X on import**: in Unity the holder's left is −X and rotations about Y and Z flip sign. Read
  poses from the imported nodes and clips rather than hard-coding signs; the script does this.
- **Clip import:** glTFast imports every clip as a **loop** and **plays the first one automatically**. Set
  `Animation.playAutomatically = false` and set the wrap modes yourself: idle and alert loop, the rest
  ClampForever. `TacticalTablet.Awake` does this.
- **Emission:** glTF cannot animate it, so the `.glb` stores every emissive at strength 1 in `emissiveFactor`.
  Tint the LED and set screen brightness on material copies, through `emissiveFactor` (glTFast shaders) and
  `_EmissionColor` (Standard / URP Lit), with `_EMISSION` / `_EMISSIVE` enabled.

## Nodes

| Node | Rest position (glTF, m) | Driven by |
| --- | --- | --- |
| `body` | 0, 0, 0 | static: every fixed mesh, including `screen_glass` |
| `screen` | 0, 0, −0.00563 | `screen_display`, the atlas plane (107.7 × 172.3 mm, 8.0" 16:10, centred); the glass front is 1.07 mm in front of it |
| `led_status` | −0.027, 0.09318, −0.00667 | clips (scale blink); tint from the script (material `led_status`). It sits in the top bezel, left of the ALS window |
| `btn_power` | −0.0629, 0.027, −0.0015 | `wake`, `power_off`: press +X 0.5 mm |
| `btn_vol_down` | −0.0629, 0.0418, −0.0015 | the volume-down key (its own cap); press +X 0.5 mm. No clip presses it |
| `btn_vol_up` | −0.0629, 0.0522, −0.0015 | the volume-up key (cap and tactile nub); press +X 0.5 mm. No clip presses it |
| `btn_ptt` | 0.0629, 0.021, −0.0014 | `ptt`: press −X 0.8 mm |
| `btn_action` | −0.0095, 0.1031, −0.0015 | `scan`: press −Y 0.5 mm (the programmable top key) |
| `flap_usb` | 0, −0.10465, 0.0033 | USB-C flap: living hinge about X along the back edge of its well, opens −100 deg (out of the bottom edge) |
| `hand_strap` | 0, −0.010, 0 | static strap through the two strap pockets in the back cover; disable it for a strapless variant (`SetStrap(false)`) |
| `grip_left_hand` | 0.010, −0.010, 0.0074 | attach socket: the palm on the battery door under the strap pad |
| `fx_touch` | 0.022, −0.030, −0.0071 | locator: thumb tap point on the glass |
| `fx_ptt` | 0.0661, 0.021, −0.0014 | locator: PTT key face |
| `fx_scan` / `cam_thermal` | −0.0136, 0.086, 0.0078 | locators: thermal window (scan origin, thermal camera) |
| `cam_rear` | −0.0028, 0.086, 0.0078 | locator: main rear camera (+Z) |
| `cam_front` | 0.0195, 0.09318, −0.0068 | locator: front camera in the top bezel, right of the speaker slot (−Z) |
| `fx_flash` | 0.0156, 0.086, 0.0078 | locator: rear flash, torch light origin |

The LED is hidden by scaling it to 1e-4 (STEP keys), never by disabling it.

**Materials (31).** Every dielectric exports `metallicFactor` 0.
- Shell: `frame_alloy` (near-black satin anodise `#2c2e33`, the phone's value), `frame_alloy_worn` (chips on the exposed chamfers), `frame_chamfer` (the machined edge round the glass), `tpu_overmould`, `tpu_bumper` (more scuffed), `back_cover`, `grip_knurl` (the door's diamond-knurl inlays).
- Keys: `rubber_keys`, `ptt_accent` (matte `#6234d4`, roughness 0.6: the phone's value; it renders close to the house `#8a4dff`).
- Small parts: `fasteners` (black-oxide Torx), `crevice`, `dust` (grime in counterbores, pockets and wells), `pogo_gold`, `port_shell`.
- Strap: `strap_webbing`, `strap_stitch`, `strap_buckle`.
- Front: `glass_mask`, `panel_border`, `grille`, `screen`, `screen_glass` (alpha blend: its base colour texture is a faint haze over the prints, its roughness and clearcoat roughness textures carry the prints; glTFast ignores the clearcoat).
- Cameras: `camera_trim`, `camera_deco`, `camera_glass` (transparent), `lens_barrel`, `lens_glass`, `lens_coating` and `thermal_window` (both use `KHR_materials_iridescence`; glTFast ignores it and they keep their dark base colours), `flash_diffuser` (an opaque Fresnel lens; set emission on it for a torch).
- LED: `led_status`, the only emissive besides the screen. Its extras `emissive` is `#2fc26b`, matching `emissiveFactor`.

**Colliders (unity copy):**
- `body_COL` is the whole tablet: 131.6 × 212 × 15.8 mm.
- `hand_strap_COL` is the strap. It overlaps the back of `body_COL`.
- `screen_COL` is the display plane. It lies inside `body_COL`, so no ray from outside can reach it.
  `TacticalTablet` switches it off on start and adds `screen_touch` instead: a trigger box over the display, from
  the glass front (1.07 mm in front of the display) to 0.5 mm in front of the bumper lip (2.77 mm). Raycast it (put it on its own layer with
  `touchLayer`, and `body_COL` on another), then call `Tap(TouchUV(hit.point))`. Or skip colliders and call
  `Tap(uv)` directly.

**Compared with the phone** (checked against the phone's source as of this delivery; the phone was being revised in
parallel, so re-check its glb before relying on a detail):
- One construction: an anodised mid-frame showing only as chamfered bands round the glass and the cover, one TPU
  overmould with the keys in moulded pockets and a guard rim round the PTT key, L-shaped corner bumpers a constant
  1.0 mm proud with chamfered leg ends and one back Torx screw each, a crowned PA-GF30 back cover on Torx screws with
  diamond-knurl TPU grip inlays, the same black-glass camera window (same size and layout: square thermal window,
  main, wide, rectangular flash), the same loudspeaker slot in the glass, the same front camera, ALS window and green
  LED in the top bezel, the same USB-C flap, and the same `ptt_accent` value.
- The same 20 cell names in the same order, the same clip names and timings, and the same node names as
  `TacticalPhone`. The tablet differs in a few places:
  - It adds `hand_strap` and the battery door with its latch.
  - `btn_action` sits on the top edge (press −Y), not on the side.
  - The flap opens 100° (the phone's opens further).
  - Its UI uses tablet layouts (widget row, 6-column grid, taskbar, side panes) in the same visual style.
- The phone's `SetPorts(bool)` exists on `TacticalTablet` as an alias of `SetFlap(bool)`, so shared code can drive
  either gadget.

## Clips (30 fps, `alert` 24 fps; every clip keys all seven moving nodes, so any clip fully defines the pose)

| Clip | s | Loop | Timeline |
| --- | --- | --- | --- |
| `idle` | 2.0 | yes | LED dark; a notification double-blink at 1.55 / 1.75 s |
| `wake` | 0.6 | | power key 0.05–0.25 s; LED lit 0.25–0.45 s |
| `unlock` | 0.7 | | LED blinks at 0.5 s (the thumb swipe is the hand's animation) |
| `ptt` | 1.6 | | PTT key down at 0.05 s, held to 1.4 s. **Hold:** loop 0.3–1.3 s while the input is held; on release jump to ≥ 1.3 s |
| `scan` | 1.2 | | top key 0.05–0.25 s; query at 0.3 s; LED blink and lock-on at 1.0 s |
| `alert` | 1.0 | yes | LED at 4 Hz: lit on [0, 0.125), [0.25, 0.375) … (keyed at 24 fps so every toggle lands on a key), in phase with the screen's 4 Hz alert blink (tint red) |
| `power_off` | 1.2 | | power key held 0.05–0.9 s; LED lit 0.6–0.95 s |
| `flap_open` | 0.45 | | USB-C flap 0–0.4 s, 100°; play backwards to close |

**Sounds** (`sounds/`, 44.1 kHz mono):

| Sound | When |
| --- | --- |
| `button` | every key press: 0.05 s into wake, scan, ptt and power_off |
| `wake` | 0.25 s into wake |
| `unlock` | 0.42 s into unlock (with `tap` at 0.3 s) |
| `scan` | 0.3 s into scan |
| `scan_result` | 1.0 s into scan |
| `ptt_chirp` | PTT key down (squelch break and a rising two-tone) |
| `ptt_release` | PTT key up (roger beep and squelch tail) |
| `alert` | looping, 1.0 s seamless |
| `power_off` | 0.6 s into power_off |
| `low_battery` | the low battery warning |
| `tap` | every touch on the glass |
| `flap_open` / `flap_close` | the USB-C flap |
| `draw` / `holster` | the holder's draw and holster |

## The screen atlas

The `screen` material's **emissive map** is `screen_atlas`: 1600 × 2048 px, **5 × 4 cells of 320 × 512** (10:16,
the 107.7 × 172.3 mm active area), sRGB, clamp.

- **Gutters:** each cell's art fills its inner 304 × 486 px. The 8 px (left and right) and 13 px (top and
  bottom) gutter round it repeats the art's edge pixels, so mip levels never bleed a neighbouring cell in.
- **UVs:** `screen_display`'s UVs cover cell 0's inner area: u 0.005..0.195, v 0.00635..0.24365, with v = 0 at the
  top of the image. Cell selection is still a whole-cell offset (col / 5, row / 4). The base
  colour is near black; the picture is all emission.
- **Default cell:** the `.glb` carries a `KHR_texture_transform` on the emissive texture (offset [0.4, 0],
  scale 1). It makes glTFast build the material with texture transforms, and makes the plain file show the
  **lock** cell. `TacticalTablet.cs` subtracts that column on start.
- **Grid metadata:** the glb's root extras carry `screen_atlas` with `grid` [5, 4], `cell_px`, `size_px`, `gutter_px` and the
  `cells` list. A shared script can read the grid instead of hard-coding it.

Cell i is at column `i % 5`, row `floor(i / 5)` from the top left. To show cell i:

- **three.js / glTF**: texture offset = (col / 5, row / 4).
- **Unity (glTFast flips V)**:
  - Offset = cell-0 offset + (scale.x · col / 5, −scale.y · row / 4).
  - The cell-0 offset is the imported offset − (scale.x · 2 / 5, 0).
  - Write it on every atlas property the shader has: `emissiveTexture`, `_EmissionMap`, and `_BaseMap` /
    `_MainTex` (which Standard / URP Lit use for the emission map's tiling). Also write it to `<prop>_ST`.

| i | Cell | glTF offset | Content |
| --- | --- | --- | --- |
| 0 | `off` | 0, 0 | black |
| 1 | `boot` | 0.2, 0 | power ring and progress dots |
| 2 | `lock` | 0.4, 0 | night-city wallpaper, analog clock, one notification, lock glyph, torch and camera shortcuts |
| 3 | `home` | 0.6, 0 | widget row (clock, weather, team status), search pill, 6-column app grid with label segments, page dots, taskbar |
| 4 | `app_open` | 0.8, 0 | the thermal camera app's card opening over the home screen |
| 5 | `map_a` | 0, 0.25 | floor plan, own arrow and view cone, team (green) and hostile (red) markers, floor switcher, team roster bottom sheet |
| 6 | `map_b` | 0.2, 0.25 | the same, hostile marker blink phase |
| 7 | `scan_a` | 0.4, 0.25 | thermal (ironbow, a visible 96-px sensor grid, column noise): a person kneeling behind a crate, rifle up, sweep line high, control rail with the temperature scale |
| 8 | `scan_b` | 0.6, 0.25 | the next sensor frame: new noise, the person shifted a little, the gain re-ranged, the sweep line lower |
| 9 | `lock_on` | 0.8, 0.25 | thermal with a lock-on box round the person |
| 10 | `drone_a` | 0, 0.5 | low-light corridor feed, reticle, record dot |
| 11 | `drone_b` | 0.2, 0.5 | the same, record dot off (blink) |
| 12 | `ptt_idle` | 0.4, 0.5 | channel list column, channel card, members (one talking), PTT pane with a microphone button |
| 13 | `ptt_talk` | 0.6, 0.5 | the PTT button fills with the accent, with a waveform and rings |
| 14 | `call_in` | 0.8, 0.5 | incoming call: avatar, decline and accept |
| 15 | `alert_a` | 0, 0.75 | red warning card over the map |
| 16 | `alert_b` | 0.2, 0.75 | the same with a red edge flash |
| 17 | `low_battery` | 0.4, 0.75 | battery glyph with a red sliver, amber bar |
| 18 | `power_menu` | 0.6, 0.75 | centred dialog: power off, restart and emergency over the dimmed wallpaper (so it fits over any app) |
| 19 | `shutdown` | 0.8, 0.75 | spinner on black |

Sequencing (the viewer's `cellFor`, copied in `TacticalTablet.CellFor`):

| State | Cells |
| --- | --- |
| idle | the app: map a/b at 2 Hz, drone a/b at 6 Hz, scan a/b at 6 Hz, home, or radio (ptt_idle) |
| wake | 0–0.25 s off; 0.25–0.5 s boot; then lock |
| unlock | lock until 0.45 s, then home, then the app |
| scan | 0–0.3 s app_open; 0.3–1.0 s scan a/b at 6 Hz; lock_on until 2.5 s; then the app |
| ptt | ptt_idle, ptt_talk from 0.12 s while held and until the key comes back out (1.4 s), then the app |
| alert | alert a/b at 4 Hz |
| low battery | low_battery, steady, for 3 s, then back where it was (alert, lock screen, or the app) |
| power off | power_menu until 0.6 s, shutdown until 0.95 s, then off |

`call_in` is not part of the automatic sequence; show it with `SetCell("call_in")`.

**LED tints:** normal `#2fc26b` (green), alert `#ff3a44`, low battery `#ffb347`, off black. The clips decide when it is
visible (dark in idle apart from the notification blink).

## Unity setup

1. Copy `unity/tactical-tablet.glb` into the project and import it with glTFast, **Animation: Legacy**.
2. Select it and run **Tools > Gunmodls > Build Prefabs From Selection**. This builds a LODGroup from `*_LOD0..2`
   and BoxColliders from `*_COL`.
3. Add **`TacticalTablet`** to the prefab root (it needs the `Animation` component glTFast adds) and assign the
   15 sounds from `sounds/`. Optional fields:
   - `droneFeed`: a RenderTexture of the drone camera. Tick `flipFeed` if it shows upside down.
   - `torchLight`.
   - `showStrap`.
4. Parent the prefab to the left hand bone so `grip_left_hand` sits in the palm under the strap. Point the thumb
   IK at `TouchPoint` (or `PttKey` while talking).
5. Drive it from the ability:
   - **Power:** `Draw()`, `Holster()`, `PowerOff()`.
   - **Scan:** `Scan()`. Listen to `onScan` for the query and use `ScanOrigin` for the pulse effect;
     `onScanResult` fires at 1.0 s.
   - **Radio:** `PttDown()` / `PttUp()`, with events `onPttDown` / `onPttUp`.
   - **Touch:** `Tap(uv)` (`onTap` has no arguments; the `Tapped` event carries the world point). For a raycast:
     hit `TouchCollider` (`screen_touch`), then `Tap(TouchUV(hit.point))`.
   - **Warnings:** `SetAlert(bool)`, `LowBattery()`.
   - **Hardware:** `SetFlap(bool)` (alias `SetPorts(bool)`), `SetStrap(bool)`, `SetTorch(bool)`, `SetBrightness(float)`.
   - **Screen:** `SetApp(App)`, `SetCell(int or name)` (−1 = automatic).
   - **State:** `Current` is one of `Off`, `Waking`, `Locked`, `Unlocking`, `Idle`, `Scanning`, `Talking`,
     `Alert`, `LowBattery`, `PoweringOff`. `PttHeld` says whether the radio is keyed.
   - An alert raised before the tablet was unlocked (Waking, Locked or Unlocking) hands back to the lock screen, then
     unlocks if `autoUnlock` is set, or if `Unlock()` was called during the alert (the call is remembered; the same
     holds during a low-battery warning over the lock screen). `Holster()` on a tablet that is already off does nothing (no sound).

The USB flap is driven in `LateUpdate` between the poses sampled from `flap_open` at 0 and at its end, so it
stays open on top of whatever clip plays (every clip keys it closed).

The screen's atlas slots: the emissive slot (`emissiveTexture` / `_EmissionMap`) carries the imported texture
transform. `_MainTex` / `_BaseMap`, which Standard and URP Lit use to move the emission map, take the emissive slot's
scale and offset rather than their own. After a material conversion their own values can be (1, 1) / (0, 0), and
reading them would put the screen two columns off.
