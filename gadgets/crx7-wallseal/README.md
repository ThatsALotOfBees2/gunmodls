# CRX-7 "Wallseal"

![CRX-7 Wallseal](preview.png)

Crystalix automated wall reinforcement. The operator places the base unit in the middle of a wall
and traces an arm pattern on its touch screen. After a press of the confirm button, the unit
expands into a reinforced wall:

1. **Sideways first.** The side rails ride outward. The beams telescope out with them and carry a
   band of panels, outer columns first, until the band spans the full width.
2. **Then up and down.** The rails telescope to full height, carrying the top and bottom beams.
   The panel rows that were stacked behind the band slide out vertically, outer rows first.
3. **Lock.** The panels seat flush and lock bolts shoot 10 cm up into the ceiling frame and down
   into the floor. Tie rods then punch through the wall, and X-shaped star anchors twist-lock on
   the far side.

Every part is rigid and slides or turns; nothing scales.

## Files

Sizes differ in width only; every variant covers the full 2.0 m wall height. Nothing reaches past
the unit's width, so several units can sit flush side by side. Place them W apart; the only parts
that pass the outline are the lock bolts, 10 cm above and below.

| File | Width | Panels (rows × columns) | `deploy` clip | Triangles |
| --- | --- | --- | --- | --- |
| `crx7-wallseal-small.glb` | 1.0 m (doorway / narrow) | 5 × 2 | 2.8 s | ~45k |
| `crx7-wallseal-standard.glb` | 1.5 m (single wall) | 5 × 2 | 2.8 s | ~45k |
| `crx7-wallseal-large.glb` | 3.0 m (wide wall) | 5 × 4 | 3.0 s | ~63k |
| `crx7-wallseal-xl.glb` | 4.0 m (bulkhead) | 5 × 6 | 3.3 s | ~80k |
| `crx7-wallseal-hatch.glb` | 1.2 × 1.2 m square floor hatch | 3 × 3 | 2.8 s | ~40k |
| `viewer.html` | Interactive viewer and the procedural source of the `.glb` files | | |

Panels share one mesh per file, so the files stay around 2 MB.

## Sounds

`sounds/` holds generated mechanical sounds (44.1 kHz mono WAV), made by `sounds/generate_sounds.py`
(numpy only; run it to regenerate or tweak them).

- **`deploy_<size>.wav`:** start it with the `deploy` clip. It is built from the same timeline as
  the animation: the servo runs while the parts move and stops with them, and each clank lands on the
  frame a column, rail or row hits its stop. The tie rods thump one after another, and the slam lands
  on the lock frame.
- **`retract_<size>.wav`:** start it when you play `deploy` backwards (at normal speed).
- **One-shots:** `place`, `touch_tap`, `arm_confirmed` play before the clip, when the base goes on
  and the operator traces the arm pattern. `button_press`, `motor_spread`, `rail_extend`,
  `panel_latch`, `lock_bolt`, `anchor_set`, `locked` and `retract` are separate pieces for custom
  setups.
- **`cues.json`:** lists every animation event's time for each size.

## Using it in a game

- **Units:** metres, +Y up. The unit faces +Z, away from the wall.
- **Origin:** bottom centre of the reinforced area, on the wall surface (z = 0). Put it on the
  defender side of the wall.
- **Rest pose:** fully deployed and locked.
- **Animation:** `deploy` runs from the stowed base to the locked wall, in this order:
  1. Confirm press.
  2. The sideways spread.
  3. The vertical spread.
  4. Lock.

  Play it after your touch-screen interaction, and play it backwards to retract.
- **Far side:** the star anchors and tie rods sit under the `far_side` node, set for a 0.3 m wall.
  Set that node's z to minus your wall's thickness.
- **Hatch:** a perfect square laid face-up. The origin is the centre of the square, on the floor
  surface, and the unit faces +Y. Everything sits under `hatch_mount`, and its lock bolts drive down
  into the floor. The star anchors are on the underside, 0.3 m down; move `far_side` for other floor
  thicknesses.
- **Nodes:**
  - `core` (with `confirm_button`)
  - `rail_left` / `rail_right` (sleeves, `*_upper_n` / `*_lower_n` stages, clamps and `*_lockbolt_top` / `*_lockbolt_bottom`)
  - `post_centre` (large and XL only)
  - `beam_top`, `beam_bottom` (with `*_left_n` / `*_right_n` stages)
  - `panel_rR_cC`
  - `far_side` (`tie_rod_n`, `star_n`)
- **Materials:** PBR, with emissive purple LEDs and the screen. Every bolt has a hex socket recess.

## Viewer

Open `viewer.html`. **Deploy** (D or Space) plays the whole sequence, and pressing it again
retracts. There are size buttons (1–4), views including **Far side**, part labels and a slow orbit.
