# Scout Drone

![Scout Drone](preview.png)

A thrown recon drone on four wheels. It lands on its belly folded up, swings its arms down and stands, then
drives around on skid steering with a wide camera in its nose. A thumper plate under the belly fires to hop
it over low cover (about 25 cm up). Dark alloy shell, purple lights, hex screws, no markings.

About 23 cm wide, 31 cm long and 13 cm tall at ride height (26 cm to the antenna tip); 35k triangles.

## Files

| File | Contents |
| --- | --- |
| `scout-drone.glb` | The drone at ride height with its clips. Origin on the ground under the middle, forward +Z, up +Y, left +X. |
| `unity/scout-drone.glb` | Game-ready copy (merged meshes, UVs, LODs, colliders). Driven in Unity by `../../unity/Runtime/ScoutDrone.cs`. |
| `sounds/` | `throw`, `land`, `deploy`, `motor_loop`, `hop`, `shutdown` (44.1 kHz mono WAV), and `generate_sounds.py` that makes them. |
| `INTEGRATION.md` | How it works in game, how to wire it up in Unity, and how to change and rebuild it. |
| `viewer.html` | Interactive viewer (drive it around a room) and the procedural source. |

## Clips

| Clip | Length | What moves | Keys |
| --- | --- | --- | --- |
| `deploy` | 1.2 s | Starts folded on its belly: the arms swing down and it stands up (the wheels roll in), the nose shutters open, the antenna flicks up. | body, arms, wheels, antenna, shutters |
| `drive` | 0.6 s loop | Wheels two turns forward (0.9 m/s at speed 1), a little suspension bob, antenna leaning back. | body, arms, wheels, antenna |
| `turn_left`, `turn_right` | 0.6 s loops | Skid turn on the spot: one side forward, the other back (about 263°/s at speed 1). | wheels, antenna |
| `hop` | 0.9 s | Crouch, the thumper fires at 0.14 s (take off), the arms hang in the air, touch down at 0.6 s and soak it up. No root motion: the game lifts the drone. | body, arms, antenna, thumper |
| `shutdown` | 0.9 s | Destroyed or picked up: sags onto its belly, shutters close, antenna droops. It ends at arms 6° and antenna 72°, not the folded pose. | body, arms, antenna, shutters |

The `deploy` clip ends with the wheels rolled (front -21.8°, rear +21.8° about X). Start and end poses of
every clip are in `INTEGRATION.md`.

## Viewer

It is thrown in on load and patrols a loop, hopping the low barrier. **WASD** or the arrow keys drive it
yourself, **Space** hops, **Throw / Pick up** (T) throws it or folds it up, **Patrol** (P) hands it back to the
loop. The feed in the corner is its nose camera. Views Follow, Close and Room.
