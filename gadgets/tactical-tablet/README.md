# Tactical Tablet

![Tactical Tablet](preview.png)

The 8-inch rugged sibling of the Tactical Phone. It is built like the real enterprise rugged tablets in this size
class (8" 16:10, IP68 / MIL-STD drop rated):
- **Frame:** a hard-anodised aluminium mid-frame with a TPU lip that stands 1.2 mm proud of the glass.
- **Corners:** four replaceable TPU corner bumpers, each held by two Torx screws.
- **Back:** a screwed and gasketed glass-filled PC back cover with knurled grip pads and a webbing hand strap.

The tablet is held in the left hand under the strap, with the screen toward the holder.

Every visible feature has a job and a real size:
- **Front:** cover glass with a black mask, two speaker slots cut through the glass with a perforated grille, the front camera, the light and proximity window, and one status LED.
- **Right side:** power key with a locator dot, two volume keys and a SIM tray.
- **Left side:** a ribbed push-to-talk key, the only accent colour (#8a4dff pigment, not a light).
- **Edges:** a programmable key on the top edge, a sealed USB-C flap with a pull tab and seal plug on the bottom edge, a mic at each end and a lanyard hole through one corner bumper.
- **Back:** a rear module with the main camera, a thermal camera window and the flash, plus pogo dock contacts.

There is no text, logo or digit anywhere, including the screen.

## Files

| File | Contents |
| --- | --- |
| `tactical-tablet.glb` | The tablet: 136 × 222 × 16.4 mm over the bumpers, about 0.6 kg. 26.4k triangles, 20 materials, named parts, a 20-cell screen atlas (5 × 4) and eight clips (below). The plain file shows the lock screen. |
| `unity/tactical-tablet.glb` | Game-ready copy: meshes merged per node, LOD0/1/2 (26.4k / 12.1k / 5.9k triangles), four box colliders and the same clips. |
| `sounds/` | 15 WAVs (`wake`, `unlock`, `tap`, `scan`, `scan_result`, `alert`, `low_battery`, `power_off`, `button`, `flap_open`, `flap_close`, `draw`, `holster`, `ptt_chirp`, `ptt_release`) and `generate_sounds.py`. |
| `INTEGRATION.md` | Node names, clips, the atlas cells and their UV offsets, and the Unity setup. |
| `viewer.html` | Interactive viewer and the procedural source of the `.glb`. |
| `../../unity/Runtime/TacticalTablet.cs` | The Unity component. It covers the screen state machine, push-to-talk hold, thermal scan, LED tints, sounds, events, the USB flap, the strap, the torch and a live drone feed. |

## Parts

- **`body`** (static):
  - Frame and shell: `body_frame` (anodised aluminium band), `body_back` (back cover), `body_front_lip` (TPU lip) and `body_part_lines` (the dark seams at the lip/frame and frame/back-cover joints).
  - Bumpers: `body_bumpers` with `_wear` (scuffed TPU on the sharpest edges) and `_inner` (dirt in the creases), plus `body_bumper_screws`.
  - Front: `screen_glass` (with oleophobic smudges and fine scratches in its roughness), `body_glass_mask`, `body_speaker_grilles` and `body_speaker_mesh`, `body_cam_front`, `body_als_window`.
  - Key surrounds: `btn_*_gap`, the 0.35 mm dark gap round each key.
  - Edges: `body_sim_tray`, `body_holes` (mics, SIM eject hole), `body_usb_mouth` and `body_usb_tongue`.
  - Rear camera module: `body_cam_trim`, `body_cam_deco`, `body_cam_lens`, `body_cam_ring`, `body_cam_baffle`, `body_cam_coating`, `body_thermal_window`, `body_thermal_bezel`, `body_flash`.
  - Back details: `body_grip_pads`, `body_strap_bridges`, `body_pogo_well` and `body_pogo_pads`, `body_back_screws` (Torx).
- **Moving nodes:**
  - `screen` (the atlas plane `screen_display`) and `led_status`.
  - Keys: `btn_power` (cap and dot), `btn_vol_up`, `btn_vol_down`, `btn_ptt` (cap and ribs) and `btn_action` (the programmable top key).
  - `flap_usb` (cover, plug and ridges) and `hand_strap`.
- **Locators:**
  - `grip_left_hand`: the palm under the strap.
  - `fx_touch`: the thumb tap point on the glass.
  - `fx_scan`: the thermal window, where the scan originates.
  - `cam_rear`, `cam_thermal`, `cam_front`.
  - `fx_flash`, `fx_ptt`: the PTT key face.
- **Axes:** +Y up the tablet (portrait), the screen faces −Z (toward the holder), the holder's left is +X (glTF).

## Clips

| Clip | Seconds | What moves |
| --- | --- | --- |
| `idle` | 2.0, loop | status LED double-blink |
| `wake` | 0.6 | power key press, LED on |
| `unlock` | 0.7 | LED blink |
| `ptt` | 1.6 | PTT key pressed at 0.05 s, held to 1.4 s (loop 0.3–1.3 s while held) |
| `scan` | 1.2 | top key press, LED blink at the result |
| `alert` | 1.0, loop | LED blinks at 4 Hz (tinted red) |
| `power_off` | 1.2 | power key held, LED off |
| `flap_open` | 0.45 | USB-C flap swings 120° out of the bottom edge (play backwards to close) |

## Screen

Every screen is a believable phone or tablet OS with no text: grey bars stand in for words, and the status bar has notification dots, signal bars, a Wi-Fi fan and a battery glyph.
- **System:** a night-city lock screen with an analog clock and one notification. The home screen has the clock widget, eight app icons with pictograms, page dots and a dock of four different apps.
- **Map:** a tactical floor plan with stairs, the holder's arrow and view cone, team markers and a blinking hostile marker.
- **Thermal scan and lock-on:** an iron-palette view of a crouched person behind a crate, with a lock-on box.
- **Drone feed:** a low-light greyscale corridor with grain, a reticle and a record dot.
- **Radio and call:** radio push-to-talk idle and talking, and an incoming call.
- **Warnings and power:** alerts over the map, low battery, the power menu, shutdown and boot.

## Viewer

- **Clips:** clip buttons (keys 1–8) play the clips with their sounds and screen sequence. Wake chains into unlock, then idle.
- **Screen and idle app:** Screen state forces any screen; Auto follows the clip. Idle app picks what idle shows (map, drone feed, thermal scan, home, radio).
- **Lighting:** Studio, Daylight, Night (L cycles).
- **Views:** Held (the reference framing), ¾, Front, Side, Back.
- **Interaction:** click the glass for a tap. Drag to orbit, scroll to zoom.

The viewer has no glove or hand proxy; the tablet is shown alone. It is a single standalone HTML file. three.js and the CSG modules load from the jsDelivr CDN.
