# Breach Spider: integration guide

For anyone (or any session) wiring the breach spider into the game. The viewer (`viewer.html`) is the
reference implementation of everything below, including the wall destruction.

## Package

| Path | What it is |
| --- | --- |
| `breach-spider.glb` | The spider and its effect nodes, clips `deploy` and `breach`. |
| `unity/breach-spider.glb` | Game-ready copy: merged meshes, UVs, LODs, colliders (see the repo README, Unity). |
| `sounds/breach.wav` | One track for the whole sequence, starting with `deploy`. |
| `sounds/*.wav` | One-shots: `throw`, `land`, `step`, `lance_loop`, `beep`, `detonate`. |
| `sounds/cues.json` | Every event with its time: landing, each footstep, each move, beeps, detonation. |
| `fx/*.png` | Particle textures: `spark`, `glow`, `smoke`, `flash` (white; tint in the material). |
| `fx/breach-fx.json` | Emitters, lights and timing for the effects. |
| `../../unity/Runtime/BreachSpiderFx.cs` | Reference Unity player: clips, sound, effects, lights, `onDetonate`. |

The test wall, the panel fragments and the viewer's particles are not in the `.glb`: the game owns the wall.

## Frame of reference

- The spider's root node (`spider`) sits at the **bottom-left corner of the breach**, on the wall
  surface. +X runs along the wall to the right, +Y is up, +Z points out of the wall toward the attacker.
- The breach is an upside-down U: **1.0 m wide (x 0 to 1) and 1.8 m tall (y 0 to 1.8)**, open at
  the floor. The spider walks on the wall face (z = 0) on the attacker's side.
- To place it, put the root at the floor line where the left edge of the doorway should be, with +Z
  along the wall's outward normal on the thrower's side. The area x 0..1, y 0..1.8 must be breakable
  wall.

## Sequence

1. **Throw (game side, no clip).** Throw the spider with physics, legs tucked (the first frame of
   `deploy` is the tucked pose). On impact, snap it to the placement above. Play `sounds/throw.wav`
   on release.
2. **`deploy` (0.80 s).** It unfolds on the wall. Start `breach.wav` here, as a 3D sound on the spider.
3. **`breach` (9.29 s).** Plays right after `deploy`. Times below are from the start of `deploy`:

| t (s) | move | duration | lance |
| --- | --- | --- | --- |
| 0.80 | aim | 0.35 | off |
| 1.15 | cut | 0.20 | on |
| 1.35 | cut | 1.60 | on |
| 2.95 | turn | 0.37 | on |
| 3.32 | cut | 1.00 | on |
| 4.32 | turn | 0.37 | on |
| 4.70 | cut | 1.60 | on |
| 6.30 | settle | 0.09 | on |
| 6.39 | cut | 0.20 | on |
| 6.59 | cool | 0.25 | off |
| 6.84 | turn | 0.61 | off |
| 7.45 | walk | 1.08 | off |
| 8.53 | turn | 0.14 | off |
| 8.67 | settle | 0.12 | off |
| 8.79 | arm | 1.30 | off |

   The lance is on from 1.15 s to 6.59 s. It holds still at the two top corners while
   the spider turns (2.95, 4.32 s), then cuts down the right side, walks to the
   middle of the panel and arms (beeps speed up, the charge slit glows, the body crouches).
4. **Detonation at 10.09 s** (the end of `breach`). Hide the spider, cut the hole, blow the panel out
   toward -Z (the far side), play the blast effects. `breach.wav` already contains the boom and the debris.

The sequence is deterministic: over a network, sync the placement and the start time only.

## Nodes in the .glb

- `body`: the spider (animated). Children: `turret` (aims the lance), `turret/fx_emitter` (the lens),
  `fx_charge` (the charge, where the blast starts), `leg_<L|R><1-4>_coxa / _femur / _tibia / _foot`.
- `laser_beam`: the lance beam, a unit-length cylinder from the lens to the hit point (scaled to zero
  while the lance is off). Emissive material `laser_beam`.
- `fx_laser_hit`: follows the point the lance is cutting. Attach sparks, smoke, the hit glow and a
  flickering light here.
- `fx_cut/fx_cut_NN`: 92 short glowing segments of the kerf; each scales from 0 to 1 when the lance
  passes it. Emissive material `cut_glow`. In the viewer the kerf also cools from white-hot through
  orange to a dark scorch over about 4 s; do that with a material if your engine can.
- Materials follow the house style; LEDs `led_purple`, the charge `charge_glow`.

## Effects

`fx/breach-fx.json` lists each emitter with its locator, start and stop time (or burst), rate,
lifetime, speed, size, growth, gravity multiplier, drag, cone, colours and blend mode, plus two point
lights. Lance effects run while the lance is on; blast effects fire once at the detonation:
a flash, a fireball, embers, thick smoke on both sides of the wall and falling dust.
`BreachSpiderFx.cs` builds all of them as Unity ParticleSystems from that file.

## What the game has to do

- Placement checks (enough breakable wall, not reinforced, the spider fits).
- At detonation: remove the panel area from the wall (doorway hole), spawn the panel debris flying
  toward -Z (5 to 10 m/s near the charge, about 4 m/s at the edges, spinning up to about 14 rad/s), and
  apply blast damage on the far side.
- If the spider is destroyed before it detonates, stop the clip, the sound and the effects. The kerf
  segments already shown stay as a scorch line, and no hole opens.
