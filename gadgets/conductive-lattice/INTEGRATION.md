# Conductive Lattice: integration guide

For anyone (or any session) wiring the lattice into the game. `viewer.html` is the reference;
`../../unity/Runtime/ConductiveLattice.cs` is a working Unity version.

## Placement

- Defender gadget. The node sticks to the defender side of a wall, facing out of it (+Z). The origin of
  each file is the bottom centre of the covered area, on the wall surface.
- **Soft wall:** use `conductive-lattice-soft.glb`; the traces cover x -0.95..0.95, y 0.06..2.15.
- **Reinforced:** use `conductive-lattice-reinforced.glb` at the same position and rotation as the Wall
  Fortification (standard, 1.5 m); the traces sit on its panel faces, inside its frame. For other widths
  scale the root along X by width / 1.5 (the traces stretch; the node keeps its look if you scale it back).

## Sequence

1. **Deploy** (`deploy` clip, about 3.3 s, `deploy.wav`): the node presses on, sprays and the metal cures.
   It is not live yet.
2. **Pulse loop** (`pulse` clip looping, `pulse.wav` at each start, `idle.wav` looping underneath):
   live for 1.0 s, off for 2.0 s. Attackers can time their pushes on the off beat.
3. **Kill:** the node has a collider; when it is destroyed, stop the loop, hide `lattice_glow`, play
   `power_down.wav`. The cured metal stays on the wall as dead traces.

## While live

- Damage or stun players touching the wall on either side, and fry gadgets attached to it (the Breach
  Spider dies mid-cut; drones on the wall short out).
- The glow is the `lattice_glow` node (scaled on and off by `pulse`). Brighten the node's
  `capacitor_coil` material while live if your engine can.
- Arcs: jagged lines jumping along and between traces, reshuffled 20 times a second, a few centimetres off
  the surface. `lattice-paths.json` has the segments; `ConductiveLattice.cs` draws them with LineRenderers.

## Unity quick start

1. Import the `unity/` variant with glTFast (Animation: Legacy) and build its prefab (Tools > Gunmodls).
2. Add `ConductiveLattice`, assign `lattice-paths.json`, set `variant` to the file name without `.glb`,
   assign the sounds and an additive arc material.
3. Hook `onLiveStart` / `onLiveEnd` (or check `IsLive`) for damage, and call `Kill()` when the node dies.
