# Tactical Phone: integration guide

This guide is for anyone (or any session) putting the phone into the game with no other context. `viewer.html` is
the reference implementation: screen sequencing, sounds and the LED. `../../unity/Runtime/TacticalPhone.cs` is a
working Unity version of all of it. It has the same API shape as `TacticalTablet` (the 8" sibling), so shared code
can drive either device.

## The gadget

- **Held in the left hand**, screen toward the eyes, thumb on the glass. The violet PTT key and the programmable key
  under it are on the holder's left edge (under the thumb or the index finger). Parent the phone to the left hand
  bone through `grip_left_hand` (an empty node: the palm on the back cover, palm facing −Z). Thumb IK targets are
  `fx_touch` (glass) and `fx_ptt` (PTT key). In first person, hold it low-left, tipped about 30 degrees toward the eyes.
- **Draw and holster** are the holder's animations; the phone rides the hand.
  - `Draw()` as it comes up: draw sound, `wake`, then `unlock`.
  - `Holster()` as it goes away: holster sound, then a dark screen (`onScreenOff`), or `power_off` (`onPowerOff`)
    only when `powerOffOnHolster` is on.
- **Scan** is the programmable key. `scan` presses it and the thermal app opens. Run the ability's query 0.3 s in,
  from `fx_scan` (the thermal window); the lock-on screen shows at 1.0 s.
- **Push-to-talk:** `PttDown()` keys up (chirp, talk screen, key held, the clip loops while held); `PttUp()` releases
  (roger beep, key out, back to the app). From the lock screen or an alert the radio keys up without changing the
  screen; on the lock screen the key cap goes down too, and unlocking with the key held opens the talk screen (in an
  alert the cap does not move: the alert clip keeps the nodes). `PowerOff()`, `ScreenOff()`, `Holster()` and `LowBattery()` release a held key first, so `onPttUp` always
  follows `onPttDown`. An alert raised while talking sounds at once and takes the screen when the key is released.
- **Apps:** idle shows the map, the drone feed, the thermal scan, the home screen or the radio. A live RenderTexture
  of the drone's camera can replace the drone cells.
- **Size and mass:** 80.8 × 169.2 mm over the corner bumpers; 16.7 mm deep over the bumpers, 16.8 mm at the camera
  deco ring (it stands 0.1 mm proud of them); about 0.32 kg.

## Axes and import

- **glTF axes:** metres, +Y up the long axis, the screen faces −Z, the rear cameras +Z. The **holder's left is +X**:
  PTT and programmable keys on +X; power, volume and SIM tray on −X. The origin is the centre of the phone's volume.
- **glTFast negates X on import**: in Unity the holder's left is −X and rotations about Y and Z flip sign. Read poses
  from the imported nodes and clips rather than hard-coding signs; the script does this.
- **Clip import:** glTFast imports every clip as a **loop** and **plays the first one automatically**. Set
  `Animation.playAutomatically = false` and the wrap modes yourself (idle and alert loop, the rest ClampForever).
  `TacticalPhone.Awake` does this.
- **Emission:** glTF cannot animate it, so the `.glb` stores every emissive at strength 1 in `emissiveFactor`. Tint
  the LED and set screen brightness on material copies, through `emissiveFactor` (glTFast shaders) and
  `_EmissionColor` (Standard / URP Lit), with `_EMISSION` / `_EMISSIVE` enabled.

## Nodes

| Node | Rest position (glTF, m) | Driven by |
| --- | --- | --- |
| `body` | 0, 0, 0 | static: every fixed mesh, including `screen_glass` |
| `screen` | 0, −0.00145, −0.00736 | `screen_display`, the atlas plane (64.0 × 132.3 mm, 5.8" 18:9), optically bonded: 0.14 mm under the glass's front face, the ink 0.1 mm |
| `led_status` | −0.0196, 0.07405, −0.00741 | off (hidden by scale) except the `scan` lock-on flash and the `alert` blink; tint from the script (material `led_status`) |
| `btn_power` | −0.0376, 0.027, −0.0012 | `wake`, `power_off`: press +X 0.5 mm |
| `btn_vol_up` | −0.0376, 0.0522, −0.0012 | volume up key (its own cap, with a tactile nub); press +X 0.5 mm. No clip uses it |
| `btn_vol_down` | −0.0376, 0.0418, −0.0012 | volume down key (its own cap); press +X 0.5 mm. No clip uses it |
| `btn_ptt` | 0.0376, 0.024, −0.0012 | `ptt`: press −X 0.8 mm |
| `btn_action` | 0.0376, −0.001, −0.0012 | `scan`: press −X 0.5 mm (the programmable key, under the PTT key) |
| `flap_usb` | 0, −0.08325, 0.0033 | USB-C flap: living hinge about X at the back edge of its well, opens −120° (out of the bottom edge) |
| `grip_left_hand` | 0.006, −0.024, 0.0074 | attach socket: the palm on the back cover |
| `fx_touch` | 0.014, −0.024, −0.0079 | locator: thumb tap point on the glass |
| `fx_ptt` | 0.0407, 0.024, −0.0012 | locator: PTT key face |
| `fx_scan` / `cam_thermal` | −0.0136, 0.0652, 0.0082 | locators: thermal window (scan origin, thermal camera) |
| `cam_rear` / `cam_front` | −0.0028, 0.0652, 0.0082 / 0.0132, 0.07405, −0.0076 | main rear camera (+Z) / front camera in the top bezel (−Z) |
| `fx_flash` | 0.0156, 0.0652, 0.0082 | locator: rear flash, torch light origin |

The LED is hidden by scaling it to 1e-4 (STEP keys), never by disabling it. At rest, and in every clip but `scan` (one
flash at 1.0–1.1 s) and `alert` (4 Hz), it is off; an unlit `led_window` under the ink marks where it is.

**Materials (25).** Every dielectric exports `metallicFactor` 0, except the two coated optics, which are metallic on
purpose so their reflections carry the coating's tint in glTFast: `lens_coating` (0.7) and `thermal_window` (0.85).
`lens_glass` is 0. 24 of the 25 names are shared with the tablet (same names and values, so one material library
serves both); the phone adds `led_window`, and the tablet adds its strap (`strap_webbing`, `strap_stitch`,
`strap_buckle`), `frame_chamfer`, `frame_alloy_worn`, `panel_border` and `dust`.
- Shell: `tpu_overmould` (overmould, flap, audio plug), `tpu_bumper` (the corner bumpers: a touch darker and glossier),
  `frame_alloy` (near-black satin anodise), `back_cover` (near-black glass-filled nylon, fine bead-blast), `grip_knurl`
  (the two diamond-knurl TPU grip inlays on the back).
- Keys: `rubber_keys`, `ptt_accent` (the only accent, shared with the tablet: `#6234d4`, roughness 0.6, a matte
  pigment, not a light; it renders close to `#8a4dff` after ACES tonemapping).
- Small parts: `fasteners` (black-oxide Torx), `crevice`, `grille` (dark acoustic mesh), `pogo_gold`, `port_shell`
  (darkened stainless).
- Front: `glass_mask` (black ink), `screen`, `screen_glass` (transparent, clearcoat, prints), `led_window`.
- Cameras: `camera_trim` (black deco ring), `camera_glass` (transparent black cover glass), `camera_deco` (lens
  irises), `lens_barrel`, `lens_glass` (front camera), `lens_coating` (blue-violet AR coat on the domed elements),
  `thermal_window` (square germanium window: its grey-green tint is in the base colour, because glTFast ignores
  `KHR_materials_iridescence`), `flash_diffuser` (opaque off-white Fresnel lens; set emission on it for a torch).
- LED: `led_status`, the only emissive besides the screen (`#2fc26b`).

**Round 3:** bonded display (no parallax), black bezel ink, one bottom speaker slot, L-shaped constant-width bumpers
with chamfered ends, a near-black back with two knurled grip inlays (the rib patch and the strap pockets / bars are
gone: `body_back_ribs`, `body_strap_pockets`, `body_strap_bars` removed), the tablet's camera layout (square thermal,
round main and wide, rectangular flash), a sealed 3.5 mm audio port on the top edge, the LED off by default. Node
names, clips, cells and the API are unchanged. Materials: `panel_border`, `frame_alloy_worn`, `flash_led`,
`flash_led_warm` are gone; `tpu_overmould`, `grip_knurl`, `lens_barrel`, `led_window` are new.

**Round 2 (this file):** the phone was rebuilt on the tablet's construction (TPU overmould, keyed corner bumpers,
black-glass camera window). Node names, clips, cells and the API are unchanged except: `btn_vol_down` now has its own
key mesh (two keys instead of a rocker); `cam_front` moved from a punch-hole to the top bezel; the materials
`antenna_break` and `rubber_grip` are gone and `camera_glass` is new; the Unity copy has no `screen_COL` (it sat inside
`body_COL`, so no ray could reach it).

**Compared with the old phone (v1):** the v1 nodes `flap_port`, `flap_side`, `led_lug` and the materials
`led_accent`, `gunmetal*`, `polymer` are gone; `port_open` is now `flap_open`; the atlas went from 4 × 4 cells of
272 × 512 to 5 × 4 cells of 256 × 512 with new cell names (the tablet's); new nodes `btn_ptt`, `cam_thermal`,
`fx_ptt`; `fx_scan` is the thermal window. The public API keeps its names (`Draw`, `Holster`, `Wake`, `Unlock`,
`Tap`, `TapPoint`, `Scan`, `SetAlert`, `LowBattery`, `PowerOff`, `ScreenOff`, `SetPorts`, `SetApp`, `SetCell`,
`SetTorch`, `SetBrightness`, `ScanOrigin`, `TouchPoint`, `Grip`, `RearCamera`, `FrontCamera`) and adds `PttDown`,
`PttUp`, `SetFlap` (alias of `SetPorts`), `ThermalCamera`, `PttKey`, `Talking`, `App.Radio`, `State.Talking`,
`onScreenOff`, `onPttDown`, `onPttUp`, and the `pttChirp` / `pttRelease` sounds.

## Clips (30 fps; every clip keys all seven moving nodes, so any clip fully defines the pose)

| Clip | s | Loop | Timeline |
| --- | --- | --- | --- |
| `idle` | 2.0 | yes | nothing moves; the LED stays off |
| `wake` | 0.6 | | power key 0.05–0.25 s |
| `unlock` | 0.7 | | nothing moves (the thumb swipe is the hand's animation) |
| `ptt` | 1.6 | | PTT key down at 0.05 s, held to 1.4 s. **Hold:** loop 0.3–1.3 s while the input is held; on release jump to ≥ 1.3 s |
| `scan` | 1.2 | | programmable key 0.05–0.25 s; query at 0.3 s; LED flash and lock-on at 1.0 s |
| `alert` | 1.0 | yes | LED at 4 Hz (tint red): the only clip that keeps it lit |
| `power_off` | 1.2 | | power key held 0.05–0.9 s |
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

The `screen` material's **emissive map** is `screen_atlas`: 1280 × 2048 px, **5 × 4 cells of 256 × 512** (the
64.0 × 132.3 mm 18:9 active area), sRGB, clamp.

- **Gutters:** each cell's art (laid out at 320 × 661 px) fills its inner 240 × 496 px. The 8 px gutter
  round it repeats the art's edge pixels, so mip levels never bleed a neighbouring cell in.
- **UVs:** `screen_display`'s UVs cover cell 0's inner area: u 0.00625..0.19375, v 0.00391..0.24609, with v = 0 at the
  top of the image. Cell selection is still a whole-cell offset (col / 5, row / 4). The base
  colour is near black; the picture is all emission.
- **Default cell:** the `.glb` carries a `KHR_texture_transform` on the emissive texture (offset [0.4, 0],
  scale 1). It makes glTFast build the material with texture transforms, and makes the plain file show the
  **lock** cell. `TacticalPhone.cs` subtracts that column on start.
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
| 2 | `lock` | 0.4, 0 | night-city wallpaper, analog clock, two notifications, lock glyph, torch and camera shortcuts |
| 3 | `home` | 0.6, 0 | clock and weather widget, search pill, two rows of app icons low on the screen, dock |
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

Sequencing (the viewer's `cellFor`, copied in `TacticalPhone.CellFor`):

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

**LED tints:** normal `#2fc26b` (green), alert `#ff3a44`, low battery `#ffb347`, off black. The script normalises each tint to its brightest channel and scales it to the glb's LED strength, so all three read equally bright. The LED shows only while a clip shows it (the `scan` flash, the `alert` blink).

## Unity setup

1. Copy `unity/tactical-phone.glb` into the project and import it with glTFast, **Animation: Legacy**.
2. Select it and run **Tools > Gunmodls > Build Prefabs From Selection** (LODGroup from `*_LOD0..2`, BoxColliders
   from `*_COL`: one, `body_COL`, round the whole phone. The screen has no collider of its own: for a tap, raycast
   against `body_COL` (or use a layer mask), turn the hit into screen uv yourself, or call `Tap(uv)` directly, which
   is the intended path).
3. Add **`TacticalPhone`** to the prefab root (it needs the `Animation` component glTFast adds) and assign the 15
   sounds from `sounds/`. Optional: `droneFeed` (tick `flipFeed` if upside down), `torchLight`.
4. Parent the prefab to the left hand bone so `grip_left_hand` sits in the palm. Point the thumb IK at `TouchPoint`
   (or `PttKey` while talking).
5. Drive it from the ability:
   - **Power:** `Draw()`, `Holster()`, `PowerOff()`, `ScreenOff()`.
   - **Scan:** `Scan()`; `onScan` at 0.3 s for the query (pulse from `ScanOrigin`), `onScanResult` at 1.0 s.
   - **Radio:** `PttDown()` / `PttUp()`, events `onPttDown` / `onPttUp`.
   - **Touch:** `Tap(uv)`, or `Tapped` for the world point.
   - **Warnings:** `SetAlert(bool)`, `LowBattery()`.
   - **Hardware:** `SetPorts(bool)` (alias `SetFlap(bool)`), `SetTorch(bool)` (off again on `PowerOff`, `ScreenOff`,
     `Holster`), `SetBrightness(float)` (inspector edits of `screenBrightness` apply live in play mode).
   - **Screen:** `SetApp(App)`, `SetCell(int or name)` (−1 = automatic).
   - **State:** `Current` is one of `Off`, `Waking`, `Locked`, `Unlocking`, `Idle`, `Scanning`, `Talking`, `Alert`,
     `LowBattery`, `PoweringOff`.

The USB flap is driven in `LateUpdate` between the poses sampled from `flap_open` at 0 and at its end, so it stays
open on top of whatever clip plays (every clip keys it closed).
