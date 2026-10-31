# Scout Drone: integration guide

For anyone (or any session) wiring the drone into the game. `viewer.html` is the reference;
`../../unity/Runtime/ScoutDrone.cs` is a working Unity version.

## Rig

Node names (all under `body`):

- `body`: the chassis. Its height is set by the arms: `body.y = 0.043 + 0.07 * sin(arm angle)`
  (wheel radius 0.043 m, arm length 0.07 m); ride height is 40°, folded is -2.2°.
- `arm_fl`, `arm_fr`, `arm_rl`, `arm_rr`: swing arms, pivoting about X on the body sides. Front arms turn
  +angle, rear arms -angle (in degrees about X; glTFast keeps rotations about X as they are).
- `wheel_fl` … `wheel_rr`: children of the arms; spin about X, positive rolls forward. `l` wheels are the
  drone's left (+X in glTF, -X in Unity).
- `antenna`: hinge about X (-11.5° at rest, +90° folded flat along the deck).
- `thumper`: the hop plate; moves down 4.5 cm when it fires.
- `shutter_l`, `shutter_r`: slide apart 2.1 cm to uncover the nose camera.
- `fx_lens_nose`: the view point; a camera here looking along its +Z sees what the drone sees.

## Sequence

1. **Throw** (`throw.wav`): it leaves the hand folded (sample `deploy` at 0 s) and tumbles.
2. **Land and stand** (`land.wav` + `deploy.wav`, `deploy` clip, 1.2 s): set it upright on its belly with the
   heading it had, play `deploy`. It cannot drive until the clip ends.
3. **Drive**: skid steer. Up to 1.5 m/s and 180°/s. Spin each side's wheels by the distance that side
   covers: `left = v + yawRate * 0.098`, `right = v - yawRate * 0.098` (turning right, the left side goes
   forward); angle += distance / 0.043 rad. Swing each arm so its wheel touches the ground under it
   (`ScoutDrone.cs` raycasts per wheel). Loop `motor_loop.wav`, pitch and volume up with speed. The `drive`
   and `turn_*` clips are there if you would rather play clips than drive the wheels from code.
4. **Hop** (`hop` clip, `hop.wav`): only from the ground. Give it 2.25 m/s upward at 0.14 s (it flies about
   0.46 s on flat ground, matching the touch-down in the clip at 0.6 s, and clears about 25 cm). It keeps its
   speed in the air and cannot steer. `land.wav` on touch-down.
5. **Shutdown** (`shutdown` clip, `shutdown.wav`): when it is destroyed or picked up. Turn its lights off
   (the `led_purple` material) and cut the feed.

## Gameplay notes

- The nose camera has a wide lens (92° in the viewer). Shooting the drone is the counter; give it low health.
- Its box: 0.22 × 0.13 × 0.30 m from the ground up. It fits under gaps about 14 cm high.

## Unity quick start

1. Import `unity/scout-drone.glb` with glTFast (Animation: Legacy) and build its prefab (Tools > Gunmodls).
2. Add `ScoutDrone` to the prefab root. It adds a Rigidbody and a single BoxCollider (and turns off the
   per-part boxes) unless the root already has a collider. Assign the sounds and, for a feed, a RenderTexture.
3. To deploy from the hand: instantiate it at the hand and call `Throw(aimDirection * 6f)`. To place it already
   standing, just drop it on the floor.
4. Each frame call `Drive(throttle, turn)` from your input; `Hop()` on jump; `Shutdown()` when it dies.
   Events: `onLanded`, `onDeployed`, `onShutdown`.
