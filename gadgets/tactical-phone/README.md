# Tactical Phone

![Tactical Phone](preview.png)

A chunky rugged operator smartphone, held in the left hand with the thumb on the glass while the right hand
stays on the weapon. Thick brushed-gunmetal frame with worn bright edges, four armoured corners with black
rubber shock cores, a deep top bezel with a stubby antenna lug, a recessed screen under a heavy lip, guarded
side keys, rubber port flaps and a bottom lanyard bracket. Purple `#8a4dff` status lights. No text or marks
anywhere, including the screen.

## Files

| File | Contents |
| --- | --- |
| `tactical-phone.glb` | The phone: 86 × 160 × 22.4 mm at the armoured corners (lug 24 mm above the top, bracket 5.5 mm below), about 45k triangles, 16 materials, named parts, a 16-cell screen atlas. Seven clips (below). |
| `unity/tactical-phone.glb` | Game-ready copy: meshes merged per node, LOD0/1/2 (45k / 23k / 11k triangles), box colliders, the same clips. |
| `sounds/` | 13 WAVs (`wake`, `unlock`, `tap`, `scan`, `scan_result`, `alert`, `low_battery`, `power_off`, `button`, `flap_open`, `flap_close`, `draw`, `holster`) and `generate_sounds.py`. |
| `INTEGRATION.md` | Node names, clips, the atlas cells and their UV offsets, and the Unity setup. |
| `viewer.html` | Interactive viewer and the procedural source of the `.glb`. |
| `../../unity/Runtime/TacticalPhone.cs` | The Unity component: screen state machine, LED tints, sounds, events, ports, torch, live drone feed. |

## Parts

- `body`: the frame (`body_rail`, `body_rail_rear` and the `body_rail_gasket` seam between them), the black
  `body_bezel`, the raised `body_lip` round the glass, the armoured corners (`body_corners`,
  `body_corner_pads`, `body_corner_cores`, `body_corners_rear`, `body_corner_screws`), the antenna lug
  (`body_lug`, `_cap`, `_collar`, `_ribs`, `_screw`), the earpiece and speaker plates, the front camera,
  key guards and pockets, the bottom bracket with its lanyard slot, the port mouths, and on the back the
  battery door, knurled grip panel, sliding latch, accessory boss, vents and the camera island with two
  lenses, a flash and a sensor window. Gunmetal parts carry `_wear` (bright rubbed edges) and `_inner`
  (grime in creases) siblings.
- Moving nodes: `screen` (the atlas plane `screen_display` and `screen_glass`), `led_status`, `led_lug`,
  `btn_power`, `btn_vol_up`, `btn_vol_down`, `btn_action`, `flap_port`, `flap_side`, `lanyard`.
- Locators: `grip_left_hand` (palm), `fx_touch` (thumb on the glass), `fx_scan` (lug tip), `cam_rear`,
  `cam_front`, `fx_flash`.
- Axes: +Y up the phone, the screen faces −Z (toward the holder), the holder's left is +X (glTF).

## Clips

| Clip | Seconds | What moves |
| --- | --- | --- |
| `idle` | 2.0, loop | status LED double-blink, lanyard sway |
| `wake` | 0.6 | power key press, LEDs come on |
| `unlock` | 0.7 | status LED blink |
| `scan` | 1.2 | action key press, the lug light flashes four times |
| `alert` | 1.0, loop | both LEDs blink at 4 Hz in opposition |
| `power_off` | 1.2 | power key held, LEDs off |
| `port_open` | 0.45 | both flaps swing open (play backwards to close) |

## Viewer

Clip buttons (keys 1–7) play the clips with their sounds and screen sequence; wake chains into unlock and
idle. **Screen state** forces any screen (Auto follows the clip). **Idle app** picks what idle shows (map,
drone feed, signal scan, home). **Lighting**: Studio, Daylight, Night (L cycles). Views: Held (the
reference framing), ¾, Front, Side, Back. **Glove** (H) toggles the hand proxy (viewer only). Click the glass
for a tap. Drag to orbit, scroll to zoom.
