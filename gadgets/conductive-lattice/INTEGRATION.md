# Conductive Lattice: integration guide

For anyone (or any session) wiring the lattice into the game. `viewer.html` is the reference;
`../../unity/Runtime/ConductiveLattice.cs` is a working Unity version.

## Throw and stick

- Defender gadget, thrown. When the node hits a wall (any point, soft or reinforced), stick it there:
  origin on the hit point, +Z along the surface normal (out of the wall, toward the defender).
- Only the node is a model. The circuit is generated at runtime from the hit point, inside the wall face:
  - **Reach** 1.0 m from the node in every direction, clipped to the face of the wall it hit (a corner
    throw gives a quarter-sized lattice).
  - 20 primary traces leave the node's rim and walk outward in 5–15 cm steps on 45° angles (like a
    circuit board), turning now and then, steering away from the node, never crossing themselves. They
    branch (chance 0.2 per step, up to three levels deep, each branch thinner) and end in round pads.
  - Each segment stores its spray distance (length of trace from the node), used for the growth.
  - Seed it from the hit point so all clients grow the same pattern.
- On the Wall Fortification the traces sit on its panel faces (the reinforcement is 0.157 m deep from the
  wall's centre line); on a soft wall on the surface itself (2 mm off).

## Sequence

1. **Stick and spray** (`deploy` clip, about 2.9 s, `deploy.wav`): 0.45 s after the hit the spray front
   leaves the node at 0.9 m/s and each trace appears as the front passes along it; 0.7 s after the front
   stops, the metal has cured. It is not live yet.
2. **Pulse loop** (`pulse.wav` at each start, `idle.wav` looping underneath): live for 1.0 s, off for 2.0 s.
   Attackers can time their pushes on the off beat.
3. **Kill:** the node has a collider; when it is destroyed, stop the loop, hide the glow, play
   `power_down.wav`. The cured metal stays on the wall as dead traces.

## While live

- Damage or stun players touching the wall within the lattice on either side, and fry gadgets attached to
  it (the Breach Spider dies mid-cut; drones on the wall short out).
- The glow is a thinner copy of the traces, purple (#8a4dff) and emissive, shown only while live.
- Arcs: jagged lines jumping along and between traces, reshuffled 20 times a second, a few centimetres off
  the surface.

## Unity quick start

1. Import `unity/conductive-lattice-node.glb` with glTFast (Animation: Legacy) and build its prefab
   (Tools > Gunmodls). Add `ConductiveLattice`; assign a metal material, an emissive glow material, an
   additive arc material and the sounds.
2. Throw it as a rigidbody; on its first collision with a wall call
   `Stick(contact.point, contact.normal, contact.otherCollider)` (and make the rigidbody kinematic). The
   script snaps the node to the wall, plays `deploy`, grows the lattice as a child of the wall and starts
   pulsing.
3. Hook `onLiveStart` / `onLiveEnd` (or check `IsLive`) for damage, and call `Kill()` when the node dies.
