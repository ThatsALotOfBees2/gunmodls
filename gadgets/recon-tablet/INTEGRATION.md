# Recon Tablet: integration guide

For anyone (or any session) turning the tablet into the game ability. `viewer.html` is the reference
implementation of the screen; `../../unity/Runtime/ReconTablet.cs` is a working Unity version of the
whole ability.

## The ability

- **Held in the left hand.** Attach the tablet to the left hand bone at the `grip_left_hand` node (the
  origin): palm on the grip, fingers wrapping from the screen side, thumb on `pulse_button`. The right
  hand keeps the weapon. In first person, hold it low-left with the screen tipped back toward the eyes
  (about 30 degrees).
- **Deploy** (`deploy`, 0.75 s, with `power_on.wav`) when the ability is equipped; play `deploy`
  backwards (with `power_off.wav`) to put it away.
- **Pulse** (`scan`, 1.4 s, with `scan.wav`): either on a button press or automatically every 2.5 s
  while it is out. At the moment of the pulse, take everyone inside the cone:
  - the cone points where the **holder faces** (the camera's forward, flattened onto the ground),
    90 degrees wide and 25 m deep;
  - it sees **through walls and floors** (a pure distance and angle test, no line of sight);
  - each enemy becomes a blip at its bearing and distance; if it is more than 2 m above or below, it
    gets a caret above (higher) or below (lower) the blip.
- **The sweep.** From 0.15 s to 1.05 s into `scan`, a line sweeps across the cone from the left edge
  to the right. A blip appears when the line passes it (play `blip.wav` then) and fades over 2.2 s.
  Positions are a snapshot from the pulse: blips do not follow enemies between pulses.
- **Balance knobs:** range, cone width, pulse interval, how long blips last, whether it needs line of
  sight. Teammates could see the same blips on their HUD if you want it to be a team ability.

## The screen

The `screen` mesh is a 20.5 × 13.5 cm quad with UVs 0..1, holder at the bottom centre. Draw into a
texture and put it on its material (the `.glb` carries one example frame). What to draw (no text,
house style):

- background `#05040a`; the cone as a wedge from the bottom centre with a faint purple fill, edges
  `#a77bff`;
- range arcs every 5 m (stronger every 10 m) and bearing ticks every 15 degrees at the rim;
- during a pulse, the bright sweep line with a short fading wake;
- blips: an orange-red dot (`#ff7846`) with a soft halo, bigger when closer, fading out; carets for
  other floors;
- the holder as a small light chevron at the apex.

`ReconTablet.cs` draws exactly this into a Texture2D. If the image comes out upside down or mirrored on
your import, tick `flipVertical` or `flipHorizontal`.

## Nodes and effects

- `body/sensor_hinge/sensor_emitter`: the fixed sensor head; it only moves with the bar in `deploy`. `fx_sensor` sits on its lens.
- `fx_scan_cone`: a 90-degree fan of 1 m radius in its local XZ plane, pointing +Z. `scan` scales it from
  0 to about 1.65 m. Keep it level in the world (the script does) and fade it out over the clip if your
  material allows it; or replace it with your own effect.
- LEDs `led_purple`, lenses `sensor_lens` (brighter during a pulse looks good), screen `screen`.

## Unity quick start

1. Import `unity/recon-tablet.glb` with glTFast (Animation: Legacy) and run Tools > Gunmodls > Build
   Prefabs From Selection.
2. Add `ReconTablet` to the prefab root. Set `holder` to the player camera, and `enemyTag` (or fill
   `targets`). Assign the four sounds.
3. Call `Deploy()` / `Stow()` from the ability; leave `autoPulse` on or call `Pulse()` yourself.
