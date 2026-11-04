# Tactical Phone: integration guide

For anyone (or any session) putting the phone into the game with no other context. `viewer.html` is the
reference implementation (screen sequencing, sounds, LEDs); `../../unity/Runtime/TacticalPhone.cs` is a
working Unity version of all of it.

## The gadget

- **Held in the left hand**, screen toward the eyes, thumb on the glass; the right hand keeps the weapon.
  Parent the phone to the left hand bone through the `grip_left_hand` locator (palm centre on the back,
  palm facing −Z). Thumb IK target: `fx_touch`. In first person hold it low-left, tipped about 30 degrees
  toward the eyes.
- **Draw / holster** are the holder's animations (the phone just rides the hand). Call `Draw()` as it comes
  up (draw sound, `wake`, then `unlock`) and `Holster()` as it goes away (holster sound, then a dark screen
  or `power_off`).
- **Scan** is the action key on the holder's left side: `scan` presses it and flashes the lug light. Run the
  ability's query 0.3 s in, from `fx_scan` (the lug tip, where the pulse effect starts); the result screen
  shows at 1.0 s.
- **Apps**: idle shows the map (abstract floor plan, ping ring, contacts), the drone feed, the signal scan or
  the home grid. The drone cells can be replaced by a live RenderTexture of the drone's camera.
- Mass about 0.42 kg. Size 86 × 160 × 22.4 mm at the corners; with the lug, bracket, camera rings and lanyard
  the bounds are 91 × 208 × 24 mm.

## Axes and import

- glTF: metres, +Y up the long axis, the screen faces −Z, the rear camera +Z, the **holder's left is +X**
  (lug, action key and side flap on +X; power and volume on −X). Origin = the centre of the phone's volume.
- **glTFast negates X on import**: in Unity the holder's left is −X and rotations about Y and Z flip sign.
  Read poses from the imported nodes and clips rather than hard-coding signs (the script does).
- glTFast imports every clip as a **loop** and **plays the first one automatically**: set
  `Animation.playAutomatically = false` and the wrap modes yourself (idle and alert loop; the rest
  ClampForever). `TacticalPhone.Awake` does this.
- **Emission**: glTF cannot animate it. The `.glb` stores every emissive at strength 1 in `emissiveFactor`.
  Tint LEDs and set screen brightness on material copies through `emissiveFactor` (glTFast shaders) and
  `_EmissionColor` (Standard / URP Lit), with `_EMISSION` / `_EMISSIVE` enabled.

## Nodes

| Node | Rest position (glTF, m) | Driven by |
| --- | --- | --- |
| `body` | 0, 0, 0 | static: every fixed mesh |
| `screen` | 0, −0.0035, −0.0080 | `screen_display` (atlas plane, 68 × 128 mm) and `screen_glass` |
| `led_status` | −0.021, 0.0645, −0.0097 | clips (scale blink); tint from script (material `led_status`) |
| `led_lug` | 0.0335, 0.1012, −0.0087 | clips (scale blink); tint from script (material `led_accent`) |
| `btn_power` | −0.0415, 0.037, 0 | clips: press +X 1.4 mm |
| `btn_vol_up` / `btn_vol_down` | −0.0415, 0.0165 / 0.0005, 0 | press +X 1.2 mm (no clip uses them; drive for volume) |
| `btn_action` | 0.0415, 0.026, 0 | `scan`: press −X 1.6 mm |
| `flap_port` | 0.0205, −0.0784, 0.0045 | USB flap, hinge about X at its back edge, open −110 deg |
| `flap_side` | 0.0417, −0.0285, 0.0048 | aux flap, hinge about Y, open −100 deg |
| `lanyard` | 0, −0.0824, 0 | cord loop pivot in the bracket slot; `idle` sways it ±3.4 deg, or drive a pendulum |
| `grip_left_hand` | 0.004, −0.03, 0.024 | locator: palm |
| `fx_touch` | 0.008, −0.018, −0.0086 | locator: thumb tap point on the glass |
| `fx_scan` | 0.0335, 0.104, 0 | locator: lug tip, scan pulse origin |
| `cam_rear` / `cam_front` | −0.0125, 0.057, 0.0118 / 0.021, 0.0645, −0.0098 | locators: cameras (+Z / −Z) |
| `fx_flash` | 0.0165, 0.0615, 0.0119 | locator: rear flash, torch light origin |

LEDs are hidden by scaling to 1e-4 (STEP keys), never by disabling. Materials: `gunmetal`, `gunmetal_worn`,
`frame_alloy`, `polymer`, `rubber`, `rubber_grip`, `black_steel`, `fasteners`, `crevice`, `grille` (alpha
mask), `screen`, `screen_glass` (transparent), `lens_glass`, `flash_diffuser` (set emission for a torch),
`led_status`, `led_accent`.

## Clips (30 fps; every clip keys all nine moving nodes, so any clip fully defines the pose)

| Clip | s | Loop | Timeline |
| --- | --- | --- | --- |
| `idle` | 2.0 | yes | status LED double-blinks at 1.55 / 1.75 s; lanyard sway |
| `wake` | 0.6 | | power key 0.05–0.25 s; status LED on 0.25 s, lug light 0.35 s |
| `unlock` | 0.7 | | status LED blinks at 0.5 s (the thumb swipe is the hand's animation) |
| `scan` | 1.2 | | action key 0.05–0.3 s; lug light flashes 0.3 / 0.5 / 0.7 / 0.9–1.1 s; query and pulse at 0.3 s |
| `alert` | 1.0 | yes | both LEDs at 4 Hz in opposition (tint red) |
| `power_off` | 1.2 | | power key held 0.05–0.9 s; LEDs off at 0.95 s |
| `port_open` | 0.45 | | USB flap 0–0.35 s, side flap 0.1–0.45 s; play backwards to close |

Sounds (`sounds/`, 44.1 kHz mono): `button` with every key press (0.05 s into wake, scan, power_off), `wake`
at 0.25 s, `unlock` at 0.42 s, `scan` at 0.3 s (its four pings match the lug flashes), `scan_result` at
1.0 s, `alert` looping (1.0 s seamless), `power_off` at 0.6 s, `low_battery`, `tap` for every touch,
`flap_open` / `flap_close`, `draw` / `holster`.

## The screen atlas

The `screen` material's **emissive map** is `screen_atlas`: 1088 × 2048 px, **4 × 4 cells of 272 × 512**
(17:32, the 68 × 128 mm screen), sRGB, clamp. `screen_display`'s UVs cover cell 0 (u 0..0.25, v 0..0.25,
v = 0 at the top of the image). The base colour is near black; the picture is all emission. The `.glb`
carries an identity `KHR_texture_transform` on the emissive texture so glTFast builds the material with
texture transforms.

Cell i is at column `i % 4`, row `floor(i / 4)` from the top left. To show cell i:

- **three.js / glTF**: texture offset = (col / 4, row / 4).
- **Unity (glTFast flips V)**: offset = imported offset + (scale.x · col / 4, −scale.y · row / 4), on every
  atlas property the shader has (`emissiveTexture`, `_EmissionMap`, and `_BaseMap` / `_MainTex`, which
  Standard / URP Lit use for the emission map's tiling), also written to `<prop>_ST`.

| i | Cell | glTF offset | Content |
| --- | --- | --- | --- |
| 0 | `off` | 0, 0 | black |
| 1 | `boot_a` | 0.25, 0 | segmented ring loader at 1/3 |
| 2 | `boot_b` | 0.5, 0 | loader at 2/3 |
| 3 | `lock` | 0.75, 0 | 12-tick ring, hexagon lock glyph, swipe track |
| 4 | `home` | 0, 0.25 | 3 × 4 app tiles, dock |
| 5 | `map_a` | 0.25, 0.25 | floor plan, range rings, ping ring (small), contacts, own chevron |
| 6 | `map_b` | 0.5, 0.25 | the same, ping ring large |
| 7 | `drone_a` | 0.75, 0.25 | drone feed frame: noisy picture, brackets, reticle, ladder |
| 8 | `drone_b` | 0, 0.5 | the same, shifted scan lines, red record dot |
| 9 | `scan_a` | 0.25, 0.5 | segmented rings, spectrum bars, waveforms |
| 10 | `scan_b` | 0.5, 0.5 | the same, rotated one step |
| 11 | `lock_on` | 0.75, 0.5 | scan result: locked rings, brackets, result bars |
| 12 | `alert_a` | 0, 0.75 | red frame, double ring, diamond glyph, hazard chevrons |
| 13 | `alert_b` | 0.25, 0.75 | the same, pulsed |
| 14 | `low_battery` | 0.5, 0.75 | amber battery with one red cell |
| 15 | `shutdown` | 0.75, 0.75 | the picture collapsed to a line with a dot |

Sequencing (the viewer's `cellFor`, copied in `TacticalPhone.CellFor`):

| State | Cells |
| --- | --- |
| idle | the app: map a/b at 2 Hz, drone a/b at 6 Hz, scan a/b at 6 Hz, or home |
| wake | 0–0.25 s off; 0.25–0.5 s boot a/b at 8 Hz; then lock |
| unlock | lock until 0.45 s, then home, then the app |
| scan | 0–0.25 s the app; 0.25–1.0 s scan a/b at 6 Hz; lock_on until 2.5 s; then the app |
| alert | alert a/b at 4 Hz |
| low battery | low_battery / off at 1 Hz for 3 s, then the app |
| power off | the app until 0.6 s, shutdown until 0.95 s, then off |

LED tints: normal `#8a4dff`, alert `#ff3a44` (both LEDs), low battery `#ffb347` (status LED), off black.

## Unity setup

1. Copy `unity/tactical-phone.glb` into the project; import with glTFast, **Animation: Legacy**.
2. Select it and run **Tools > Gunmodls > Build Prefabs From Selection** (LODGroup from `*_LOD0..2`,
   BoxColliders from `*_COL`).
3. Add **`TacticalPhone`** to the prefab root (it needs the `Animation` component glTFast adds). Assign the
   13 sounds from `sounds/`. Optional: `droneFeed` (RenderTexture of the drone camera; tick `flipFeed` if it
   shows upside down), `torchLight`.
4. Parent the prefab to the left hand bone so `grip_left_hand` sits in the palm, and point the thumb IK at
   `TouchPoint`.
5. From the ability: `Draw()`, `Holster()`, `Scan()` (listen to `onScan` for the query, `ScanOrigin` for
   the pulse effect; `onScanResult` at 1.0 s), `Tap(uv)` (or `Tapped` for the world point), `SetAlert(bool)`,
   `LowBattery()`, `PowerOff()`, `SetPorts(bool)`, `SetApp(App)`, `SetCell(int or name)` (−1 = automatic),
   `SetTorch(bool)`, `SetBrightness(float)`. `Current` is the state (`Off`, `Waking`, `Locked`, `Unlocking`,
   `Idle`, `Scanning`, `Alert`, `LowBattery`, `PoweringOff`).

The port flaps are driven in `LateUpdate` between the poses sampled from `port_open` at 0 and at its end,
so they stay open on top of whatever clip plays (every clip keys them closed).
