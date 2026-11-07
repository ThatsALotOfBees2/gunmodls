# Tactical Tablet

![Tactical Tablet](preview.png)

The 8-inch rugged sibling of the Tactical Phone. It is built like the real enterprise rugged tablets in this size
class (8" 16:10, IP68 / MIL-STD drop rated):
- **Shell:** one continuous TPU overmould co-moulded round a hard-anodised aluminium mid-frame. It is 2 mm thick on
  the sides and swells to about 4.4 mm at the corners, which take the drops. It folds over the glass edge as a lip
  1.2 mm proud of the glass, and over the back cover's edge as a rim with a moulded grain grip zone.
- **Back:** a glass-filled PC back cover with crowned edges, held by six Torx T5 screws over a gasket. A battery door
  on its lower half has four captive Torx screws in counterbores.
- **Strap:** a webbing hand strap runs through two loops moulded into the TPU rim.

The tablet is held in the left hand under the strap, with the screen toward the holder.

Every visible feature has a job and a real size:
- **Front:** cover glass with a 0.45 mm 2.5D edge and a black ink mask. The panel's own border shows as a slightly
  lighter line inside the ink. The top bezel has an earpiece slot, the front camera, the light and proximity window,
  and one status LED. The loudspeaker sits behind two staggered rows of slots in the bottom bezel.
- **Right side:** a concave power key and a one-piece volume rocker with a centre saddle. Both sit in a pocket in the
  TPU with a raised guard rib round it.
- **Left side:** a 20 × 7 mm push-to-talk key with one centre ridge, 1.3 mm proud of the TPU. It is the only accent
  colour, a dark desaturated violet pigment (not a light).
- **Edges:**
  - The top edge has a programmable key and a mic.
  - The bottom edge has a USB-C receptacle (8.9 × 3.3 mm, steel shell, tongue with pins) and a mic.
  - The receptacle sits behind a TPU flap with a perimeter seal lip, a plug, a pull tab, a nail notch and a living hinge.
  - A lanyard channel runs through the bottom corner, from the back rim out through the bottom edge.
- **Back:**
  - A raised anodised camera island, screwed on with two Torx screws. It holds the main lens (9 mm) and the
    ultrawide (7 mm), each with visible barrel rings, plus a recessed round thermal window with an iridescent
    chalcogenide coating and a dual-tone flash (two LED dies under a Fresnel diffuser).
  - A pressure-equalising vent (membrane under a cap).
  - Pogo dock pads in a recessed well.

There is no text, logo or digit anywhere, including the screen.

## Files

| File | Contents |
| --- | --- |
| `tactical-tablet.glb` | The tablet: 138 × 224 × 16.4 mm over the TPU (without the strap), about 0.62 kg. 42.6k triangles, 26 materials, named parts, a 20-cell screen atlas (5 × 4) and eight clips (below). The plain file shows the lock screen. |
| `unity/tactical-tablet.glb` | Game-ready copy: meshes merged per node, LOD0/1/2 (42.6k / 19.6k / 12.4k triangles), three box colliders and the same clips. |
| `sounds/` | 15 WAVs (`wake`, `unlock`, `tap`, `scan`, `scan_result`, `alert`, `low_battery`, `power_off`, `button`, `flap_open`, `flap_close`, `draw`, `holster`, `ptt_chirp`, `ptt_release`) and `generate_sounds.py`. |
| `INTEGRATION.md` | Node names, clips, the atlas cells and their UV offsets, and the Unity setup. |
| `viewer.html` | Interactive viewer and the procedural source of the `.glb`. |
| `../../unity/Runtime/TacticalTablet.cs` | The Unity component. It covers the screen state machine, push-to-talk hold, thermal scan, LED tints, sounds, events, the USB flap, the strap, the torch and a live drone feed. |

## Parts

- **`body`** (static):
  - Shell: `body_frame` (aluminium mid-frame, seen in the key and port pockets), `body_bumper` (the TPU overmould) with `_wear` (scuffed TPU on the four corner apexes only) and `_inner` (dust in tight creases), `body_grip_zone` (grain grip on the back rim), `body_strap_anchors`, `body_key_guard`, `body_lanyard_shadow`.
  - Back: `body_back` (cover with the pogo well), `body_back_gap` (the cover / TPU part line), `body_door_line` (battery door), `body_back_screws` and `body_screw_counterbores`, `body_vent_cap` and `body_vent_holes`, `body_pogo_pads`.
  - Camera island: `body_cam_island`, `body_cam_screws`, `body_cam_lenses`, `body_cam_baffles`, `body_cam_coating`, `body_cam_elements`, `body_thermal_bezel`, `body_thermal_window`, `body_flash_well`, `body_flash_die_cool`, `body_flash_die_warm`, `body_flash`.
  - Front: `screen_glass` (clean, with a few oily thumb prints in its roughness), `body_glass_mask` (ink, with the earpiece and speaker slots open), `body_panel_border`, `body_speaker_grilles`, `body_speaker_backing`, `body_cam_front_ring`, `body_cam_front`, `body_als_window`.
  - Edges: `btn_*_gap` (a 0.2 mm shadow line round each key), `body_mic_holes`, `body_usb_shell`, `body_usb_back`, `body_usb_tongue`, `body_usb_pins`.
- **Moving nodes:**
  - `screen` (the atlas plane `screen_display`) and `led_status`.
  - Keys: `btn_power`, `btn_vol_up` (the whole volume rocker), `btn_vol_down` (the rocker's lower-half press point, no mesh), `btn_ptt` (cap and ridge) and `btn_action` (the programmable top key).
  - `flap_usb` (cover, seal lip, plug, pull tab, living hinge) and `hand_strap` (band and folded ends).
- **Locators:**
  - `grip_left_hand`: attach socket (no mesh): the palm centre under the strap.
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

Every screen is a believable phone or tablet OS with no text. Short, low-contrast segments in word lengths stand in
for words, and the status bar has notification dots, signal bars, a Wi-Fi fan and a battery glyph. The accent violet
appears on at most one element per screen.
- **System:**
  - The lock screen has a night-city wallpaper (soft dusk sky, hazed far towers, windows lit in floor-wise clusters),
    an analog clock and one notification. It also has a lock glyph, a swipe-up chevron, and torch and camera
    shortcuts.
  - The home screen has the clock and a weather-style widget, eight unique app icons, page dots and a dock of four
    other apps.
- **Map:** a tactical floor plan with stairs, the holder's arrow and view cone, team markers and a blinking hostile marker.
- **Thermal scan and lock-on:**
  - An ironbow image from a low-resolution, blurred temperature field with column (NUC) noise and vignetting.
  - The room is cool, black to deep blue. A hot pipe and a warm vent are the only mid tones.
  - The person kneeling behind the cool crate is warm, with the face and hands hottest.
  - There is a palette bar, a hot-spot crosshair, and palette, shutter and torch buttons.
- **Drone feed:** a low-light greyscale corridor with grain, a reticle and a record dot.
- **Radio and call:**
  - Radio push-to-talk idle and talking, with a channel card, member avatars and signal chips.
  - An incoming call with an avatar.
- **Warnings and power:** alerts over the map, low battery, the power menu, shutdown and boot.

Each 320 × 512 cell is drawn into its inner 304 × 486 px, with a gutter of edge pixels round it. Mip levels therefore
never bleed a neighbouring cell into the screen's border.

## Viewer

- **Clips:** clip buttons (keys 1–8) play the clips with their sounds and screen sequence. Wake chains into unlock, then idle.
- **Screen and idle app:** Screen state forces any screen; Auto follows the clip. Idle app picks what idle shows (map, drone feed, thermal scan, home, radio).
- **Lighting:** Studio, Daylight, Night (L cycles).
- **Views:** Held (the reference framing), ¾, Front, Side, Back.
- **Interaction:** click the glass for a tap. Drag to orbit, scroll to zoom.

The viewer has no glove or hand proxy; the tablet is shown alone. On phone-width screens the title plate shrinks and
the control rows scroll sideways, and the tablet is framed into the space between them.

It is a single standalone HTML file. three.js and the CSG modules load from the jsDelivr CDN (as in every viewer in
this repo), so it needs a network connection; system fonts stand in if Google Fonts is unreachable.
