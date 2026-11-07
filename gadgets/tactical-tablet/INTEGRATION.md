# Tactical Tablet: integration guide

This guide is for anyone (or any session) putting the tablet into the game with no other context. `viewer.html` is
the reference implementation: screen sequencing, sounds and the LED. `../../unity/Runtime/TacticalTablet.cs` is a
working Unity version of all of it. Its API matches `TacticalPhone`, with additions for push-to-talk, the flap and
the strap.

## The gadget

- **Held in the left hand**, under the back hand strap, screen toward the eyes. The thumb reaches the glass and
  the violet PTT key on the holder's left edge. Parent the tablet to the left hand bone through the
  `grip_left_hand` attach socket (an empty node, no mesh): the palm centre under the strap, palm facing −Z. Thumb IK targets are `fx_touch` (glass)
  and `fx_ptt` (PTT key). In first person, hold it low-left, tipped about 30 degrees toward the eyes.
- **Draw and holster** are the holder's animations; the tablet just rides the hand.
  - Call `Draw()` as it comes up: draw sound, `wake`, then `unlock`.
  - Call `Holster()` as it goes away: holster sound, then a dark screen or `power_off`.
- **Scan** is the programmable key on the top edge. `scan` presses it and the thermal app opens.
  - Run the ability's query 0.3 s in, from `fx_scan` (the thermal window).
  - The lock-on screen shows at 1.0 s.
- **Push-to-talk** is the ridged violet key on the holder's left edge.
  - `PttDown()` keys up the radio: chirp, talk screen, key held.
  - `PttUp()` releases it: roger beep, key out, back to the app.
- **Apps**: idle shows the map, the drone feed, the thermal scan, the home screen or the radio. A live
  RenderTexture of the drone's camera can replace the drone cells (the script stretches the screen's inner UV area over the whole feed).
- **Size and mass:** 138 × 224 × 16.4 mm over the TPU overmould (without the strap), about 0.62 kg. The hand strap rests about 5 mm off
  the back.

## Axes and import

- **glTF axes:** metres, +Y up the long axis (portrait), the screen faces −Z, the rear cameras +Z. The **holder's
  left is +X**: the PTT key is on +X, and power and volume are on −X (the SIM and microSD sit under the battery door). The origin is the centre of
  the tablet's volume.
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
| `screen` | 0, −0.0027, −0.0059 | `screen_display`, the atlas plane (107.7 × 172.3 mm, 8.0" 16:10) |
| `led_status` | −0.024, 0.0976, −0.0070 | clips (scale blink); tint from the script (material `led_status`) |
| `btn_power` | −0.0655, 0.067, −0.001 | `wake`, `power_off`: press +X 0.6 mm |
| `btn_vol_up` | −0.0655, 0.041, −0.001 | the one-piece volume rocker (cap mesh); press +X 0.5 mm. No clip uses it |
| `btn_vol_down` | −0.0655, 0.0355, −0.001 | the rocker's lower-half press point (empty node, no mesh) |
| `btn_ptt` | 0.0655, 0.024, −0.001 | `ptt`: press −X 0.8 mm |
| `btn_action` | −0.018, 0.1085, −0.001 | `scan`: press −Y 0.5 mm (the programmable top key) |
| `flap_usb` | 0, −0.1095, 0.0026 | USB-C flap: living hinge about X at the back edge of its well, opens −120 deg (out of the bottom edge) |
| `hand_strap` | 0, −0.022, 0 | static band through the moulded anchors; disable it for a strapless variant (`SetStrap(false)`) |
| `grip_left_hand` | 0.010, −0.022, 0.0152 | attach socket: the palm under the strap |
| `fx_touch` | 0.022, −0.030, −0.0074 | locator: thumb tap point on the glass |
| `fx_ptt` | 0.0691, 0.024, −0.001 | locator: PTT key face |
| `fx_scan` / `cam_thermal` | −0.0145, 0.092, 0.0081 | locators: thermal window (scan origin, thermal camera) |
| `cam_rear` / `cam_front` | −0.0035, 0.092, 0.0081 / 0.017, 0.0976, −0.0071 | locators: main rear camera (+Z) and front camera (−Z) |
| `fx_flash` | 0.0155, 0.092, 0.0081 | locator: rear flash, torch light origin |

The LED is hidden by scaling it to 1e-4 (STEP keys), never by disabling it.

**Materials (26).** Every dielectric exports `metallicFactor` 0.
- Shell: `tpu_bumper`, `tpu_scuffed` (corner apexes), `rubber_grip` (the back rim's grain zone), `frame_alloy`, `back_cover`.
- Keys: `rubber_keys`, `ptt_accent`.
- Small parts: `fasteners` (black-oxide Torx), `crevice`, `grille` (steel mesh, alpha mask), `pogo_gold`, `port_shell`, `vent_membrane`, `strap_webbing`.
- Front: `glass_mask`, `panel_border`, `screen`, `screen_glass` (transparent).
- Cameras: `camera_trim`, `camera_deco`, `lens_glass`, `thermal_window` (uses `KHR_materials_iridescence`; glTFast ignores it, and it stays a dark metallic window), `flash_diffuser` (transparent; set emission on it for a torch), `flash_led`, `flash_led_warm`.
- LED: `led_status`, the only emissive besides the screen. Its extras `emissive` is `#2fc26b`, matching `emissiveFactor`.

**Compared with the phone:**
- The tablet has a single `flap_usb` and the clip `flap_open`, where the phone has `flap_port` / `flap_side` and `port_open`.
- There is no `led_lug` and no `led_accent`.
- New nodes: `btn_ptt`, `cam_thermal`, `fx_ptt` and `hand_strap`.
- The phone's `SetPorts(bool)` exists on `TacticalTablet` as an alias of `SetFlap(bool)`, so shared code can drive
  either gadget.

## Clips (30 fps; every clip keys all seven moving nodes, so any clip fully defines the pose)

| Clip | s | Loop | Timeline |
| --- | --- | --- | --- |
| `idle` | 2.0 | yes | LED double-blinks at 1.55 / 1.75 s |
| `wake` | 0.6 | | power key 0.05–0.25 s; LED on at 0.25 s |
| `unlock` | 0.7 | | LED blinks at 0.5 s (the thumb swipe is the hand's animation) |
| `ptt` | 1.6 | | PTT key down at 0.05 s, held to 1.4 s. **Hold:** loop 0.3–1.3 s while the input is held; on release jump to ≥ 1.3 s |
| `scan` | 1.2 | | top key 0.05–0.25 s; query at 0.3 s; LED blink and lock-on at 1.0 s |
| `alert` | 1.0 | yes | LED at 4 Hz (tint red) |
| `power_off` | 1.2 | | power key held 0.05–0.9 s; LED off at 0.95 s |
| `flap_open` | 0.45 | | USB-C flap 0–0.4 s; play backwards to close |

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
| 2 | `lock` | 0.4, 0 | night-city wallpaper, analog clock, one notification, lock glyph |
| 3 | `home` | 0.6, 0 | clock widget, two rows of app icons, page dots, dock |
| 4 | `app_open` | 0.8, 0 | an app card opening out of the home screen |
| 5 | `map_a` | 0, 0.25 | floor plan, stairs, own arrow and view cone, team (green) and hostile (red) markers |
| 6 | `map_b` | 0.2, 0.25 | the same, hostile marker blink phase |
| 7 | `scan_a` | 0.4, 0.25 | thermal (ironbow): a person kneeling behind a cool crate in a cool room, hot-spot crosshair on the face |
| 8 | `scan_b` | 0.6, 0.25 | the next sensor frame: the same scene with new noise |
| 9 | `lock_on` | 0.8, 0.25 | thermal with a lock-on box on the person |
| 10 | `drone_a` | 0, 0.5 | low-light corridor feed, reticle, record dot |
| 11 | `drone_b` | 0.2, 0.5 | the same, record dot off (blink) |
| 12 | `ptt_idle` | 0.4, 0.5 | radio channel card, member avatars with signal chips, microphone button |
| 13 | `ptt_talk` | 0.6, 0.5 | the button fills with the accent, with a waveform and rings |
| 14 | `call_in` | 0.8, 0.5 | incoming call: avatar, decline and accept |
| 15 | `alert_a` | 0, 0.75 | red warning card over the map |
| 16 | `alert_b` | 0.2, 0.75 | the same with a red edge flash |
| 17 | `low_battery` | 0.4, 0.75 | battery glyph with a red sliver, amber bar |
| 18 | `power_menu` | 0.6, 0.75 | power, restart and stop pills over the dimmed home screen |
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
| low battery | low_battery / off at 1 Hz for 3 s, then back where it was (alert, lock screen, or the app) |
| power off | power_menu until 0.6 s, shutdown until 0.95 s, then off |

`call_in` is not part of the automatic sequence; show it with `SetCell("call_in")`.

**LED tints:** normal `#2fc26b` (green), alert `#ff3a44`, low battery `#ffb347`, off black.

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
   - **Touch:** `Tap(uv)`, or `Tapped` for the world point.
   - **Warnings:** `SetAlert(bool)`, `LowBattery()`.
   - **Hardware:** `SetFlap(bool)` (alias `SetPorts(bool)`), `SetStrap(bool)`, `SetTorch(bool)`, `SetBrightness(float)`.
   - **Screen:** `SetApp(App)`, `SetCell(int or name)` (−1 = automatic).
   - **State:** `Current` is one of `Off`, `Waking`, `Locked`, `Unlocking`, `Idle`, `Scanning`, `Talking`,
     `Alert`, `LowBattery`, `PoweringOff`.

The USB flap is driven in `LateUpdate` between the poses sampled from `flap_open` at 0 and at its end, so it
stays open on top of whatever clip plays (every clip keys it closed).
