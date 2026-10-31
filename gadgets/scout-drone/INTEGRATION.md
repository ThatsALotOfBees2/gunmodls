# Scout Drone: integration guide

For anyone (or any session) wiring the drone into the game or changing it. `viewer.html` is the reference;
`../../unity/Runtime/ScoutDrone.cs` is a working Unity version.

Units are metres and degrees unless a line says otherwise. Positions are in glTF space unless a line says Unity. glTFast negates X on
import: glTF +X is Unity -X, rotations about X stay the same, and rotations about Y and Z flip sign.

## Rig

Node names (`body` is the root's child; the others sit under it):

- `body`: the chassis. Its height is set by the arms: `body.y = 0.043 + 0.07 * sin(arm angle)`
  (wheel radius 0.043 m, arm length 0.07 m). Ride height is 40° (body y 0.088); folded is -2.2°
  (body y 0.040, belly on the ground).
- `arm_fl`, `arm_fr`, `arm_rl`, `arm_rr`: swing arms, pivoting about X at (±0.074, 0, ±0.06) on the body.
  Front arms turn +angle, rear arms -angle.
- `wheel_fl` … `wheel_rr`: children of the arms, 0.07 m along them, 0.098 m out from the middle. They spin
  about X; positive rolls forward. `l` wheels are the drone's left (+X in glTF, -X in Unity).
- `antenna`: hinge about X (-11.5° at rest, +90° folded flat along the deck).
- `thumper`: the hop plate (rest y -0.034); moves down 4.5 cm when it fires.
- `shutter_l`, `shutter_r`: at x ±0.021 when open, 0 when shut; they uncover the nose camera.
- `fx_lens_nose`: the view point; a camera here looking along its +Z sees what the drone sees (also in Unity).

The .glb's rest pose (no clip playing) is the ride pose with the shutters open and the wheels at 0.

## Clips

All clips are sampled at 30 fps from pose functions in `viewer.html`. None has root motion: your code moves
the root. The README's clip table lists which nodes each clip keys.

| Clip | Starts | Ends |
| --- | --- | --- |
| `deploy` (1.2 s) | Folded: arms -2.2°, body y 0.040, shutters shut, antenna +90°. | Standing: arms 40°, shutters open (by 0.25 s), antenna -11.5°, wheels rolled in by the arms: front -21.8°, rear +21.8°. |
| `drive` (0.6 s loop) | Near the ride pose: arms 40° ±1.6°, body ±1.2 mm, antenna about -19.5°. | Loops; the wheels turn twice. |
| `turn_left`, `turn_right` (0.6 s loops) | Keys only the wheels and antenna (-11.5° ±1.7°). | Loops; each side's wheels turn once, opposite ways. |
| `hop` (0.9 s) | Ride pose. Crouch to arms 20° at 0.12 s; thumper down by 0.15 s; arms swing down to 58° in the air. | Touch-down at 0.6 s (arms 24° at 0.68 s), back to the ride pose by 0.9 s; thumper back by 0.42 s. |
| `shutdown` (0.9 s) | Ride pose, shutters open. | Arms 6°, body y 0.050, shutters shut (by 0.3 s), antenna +71.6°. This is not the folded pose: sample `deploy` at 0 s to fold it. |

**glTFast import.** glTFast creates every clip with `WrapMode.Loop` and its Animation component plays the
first clip (`deploy`) on its own. ScoutDrone switches auto-play off in Awake, sets `deploy` and `shutdown`
to `ClampForever` (it stops them itself) and `hop` to `Once`. If you play clips yourself, set
`anim[clip].wrapMode` first and leave `drive` and `turn_*` as loops.

**Playing the loops instead of code.** At speed 1, `drive` rolls the wheels for 0.9 m/s: set
`anim["drive"].speed = v / 0.9` (negative runs it backwards). At speed 1, `turn_left` / `turn_right` turn
each side one wheel turn per 0.6 s (0.45 m/s), which is a skid turn of about 263°/s: set
`speed = |yawRate in °/s| / 263`. `drive` keys the body and all four arms, so it replaces ScoutDrone's
ground following. Both key the wheels, so play one or the other.

## Sequence

| Step | Clip | Sound | What happens |
| --- | --- | --- | --- |
| In hand | (`deploy` sampled at 0 s) | | Folded. The viewer hides it. |
| Throw | | `throw.wav` | Leaves the hand folded and tumbles. |
| Land and stand | `deploy` | `land.wav` + `deploy.wav` | On the first contact whose normal points up (y ≥ 0.6), set it upright on its belly with the heading it had and play `deploy`. It cannot drive until the clip ends. The feed is live from here. |
| Drive | (or `drive` / `turn_*`) | `motor_loop.wav` | See Driving. |
| Hop | `hop` | `hop.wav` at the start, `land.wav` on touch-down | See Hop. |
| Shutdown | `shutdown` | `shutdown.wav` | Destroyed or picked up: lights out, feed cut. The viewer allows pick-up only while it stands, and puts it back in the hand 0.5 s after the clip ends. |

## Driving

- Skid steer. Up to 1.5 m/s, reached in 0.3 s (5 m/s²), and 180°/s (the viewer uses 3.2 rad/s, about
  183°/s). Speed and turn rate change only while it is on the ground.
- Wheels: each side spins by the distance it covers. With v in m/s and yawRate in rad/s, positive turning
  right (clockwise seen from above, Unity +Y):
  `left = v + yawRate * 0.098`, `right = v - yawRate * 0.098`; wheel angle += distance / 0.043 rad.
  The viewer's `dr.w` and `turn` are positive to the left, so its code reads `v - w * WX` for the left wheels.
- Arms: ScoutDrone keeps the body at its rest height and swings each arm so its wheel touches the ground
  under it: one raycast per wheel, arm angle = asin((pivot height above ground - 0.043) / 0.07), clamped to
  -2.2°..60°, and 58° (hanging) with no ground. The viewer only drives on flat ground: there the body height
  and tilt come from the four arm angles (`pose()`).
- Body lean: back when it speeds up and into a turn, up to 3.5° each.
- Antenna: a damped spring; -11.5° standing, leaning back to about -21.5° at full speed, pushed by
  acceleration.
- Motor: loop `motor_loop.wav`. ScoutDrone sets pitch 0.75 to 1.5 and volume 0.15 to 0.6 from how hard it
  drives (speed plus turn), and fades it out when it stops.

## Hop

- Only when standing on the ground. Start `hop` and `hop.wav` together (the bang is at 0.13 s).
- At 0.14 s the thumper fires: give the root an upward speed of |g| × (0.6 - 0.14) / 2 = 0.23 × |g|. At
  9.8 m/s² that is 2.25 m/s: a 0.46 s flight that touches down with the clip at 0.6 s, rising about 26 cm
  (it clears about 25 cm). With other gravity set `hopSpeed = 0.23f * -Physics.gravity.y` to keep the
  timing; the height is then 0.026 × |g| m.
- In the air it keeps its speed and turn rate and cannot steer. Play `land.wav` on touch-down.

## Feed camera

- ScoutDrone puts a Camera on `fx_lens_nose` (`FeedCamera`: 92° vertical field of view, near plane 0.01 m)
  and renders it into `feed`. The camera is on only while the drone is deploying or ready and has a
  texture. Without a texture it stays off; otherwise it would draw over the player's view.
- `feed` and `fieldOfView` are applied in Awake. At runtime call `SetFeed(texture)` (null switches the
  camera off) and set `FeedCamera.fieldOfView`.
- Give a feed only to the drone the local player pilots: leave `feed` empty on the prefab and call
  `SetFeed` on that one. Every drone with a feed renders the scene again each frame.
- The viewer hides the drone while it renders the feed. To do the same, put the drone on its own layer and
  take that layer out of `FeedCamera.cullingMask`.
- For a full-screen view, show the RenderTexture on a full-screen RawImage. Show "No signal" (as the
  viewer does) while the drone is in hand, thrown or off.

## Sounds

- `sounds/*.wav` are 44.1 kHz mono 16-bit, made by `python3 gadgets/scout-drone/sounds/generate_sounds.py`
  (needs numpy; it writes next to itself, and its docstring describes each sound). `motor_loop.wav` is a
  1.0 s seamless loop.
- Viewer levels: throw 0.6, land 0.8, deploy, hop and shutdown 0.85, motor 0.12 to 0.52.
- ScoutDrone adds two 3D AudioSources to the root (one-shots and the motor) with Unity's default rolloff
  (logarithmic, 1 to 500 m). Set the rolloff, max distance and mixer group after Awake through
  `GetComponents<AudioSource>()`.
- The viewer does not load the WAVs. It plays MP3 copies (80 kbps mono) embedded as base64 in
  `const SOUND_DATA`, one long line in `viewer.html`. After regenerating a sound, re-encode it
  (`ffmpeg -i land.wav -codec:a libmp3lame -b:a 80k -ac 1 land.mp3`), base64 it (`base64 -w0 land.mp3`)
  and replace that key's `data:audio/mpeg;base64,…` string. No tool does this.

## Gameplay notes

- The nose camera has a wide lens (92°). Shooting the drone is the counter; give it low health.
- ScoutDrone has no health. Hits land on the single BoxCollider on the root (the per-part `_COL` boxes are
  turned off). Put your health component on the root and call `Shutdown()` at 0.
- While standing it sets its horizontal velocity every physics step, so pushes and explosions only move it
  up or down. To knock it over, call `Throw(push)` with an upward part so it leaves the floor, for example
  `Throw(push + Vector3.up * 2f)`: it folds, tumbles and stands up where it lands (and plays `throw.wav`).
- Its box: 0.22 × 0.13 × 0.30 m, flat underneath, its bottom 3 mm above the root. It has no step offset,
  so it cannot climb steps or lips; `Hop()` clears about 25 cm.
- It fits under gaps about 14 cm high, but the antenna (26 cm tall at rest) has no collider and passes
  through anything lower.
- It lands on the first contact, 0.2 s or more after `Throw()`, whose normal points up (y ≥ 0.6, slopes up
  to about 53°). A capsule top counts, so throw it from clear of the thrower's collider or call
  `Physics.IgnoreCollision(drone.GetComponent<Collider>(), throwerCollider)` right after `Throw()` (Hold()
  turns the drone's collider off, and Unity drops the ignore when a collider is turned off). On anything
  steeper it stays thrown and slides.

## Unity quick start

1. Import `unity/scout-drone.glb` with glTFast (Animation: Legacy) and build its prefab with
   Tools > Gunmodls > Build Prefabs From Selection (setup in the root README's Unity section).
2. Add `ScoutDrone` to the prefab root and assign the six sounds. It adds a Rigidbody (1.6 kg, rotation
   about X and Z frozen while it stands) and a single BoxCollider (and turns off the per-part boxes) unless
   the root already has them. Rebuilding the prefab removes ScoutDrone: see Rebuilding.
3. For the feed, make a RenderTexture and call `SetFeed(texture)` on the drone the player pilots.
4. In hand: instantiate it, call `Hold()` and parent it to the hand. To throw: unparent it, then
   `Throw(aimDirection * 6f)`. To place it already standing, put it on the floor; it starts ready.
5. Each frame call `Drive(throttle, turn)` from your input, both -1..1, turn > 0 turns right. `Hop()` on
   jump. `Shutdown()` when it dies or is picked up.
6. After `onShutdown`, wait 0.9 s for the clip, then `Destroy` it, or call `Hold()` to give it back to the
   player. `Hold()` and `Throw()` undo the shutdown (lights, feed, speed, pose).

## ScoutDrone reference

| Member | What it does |
| --- | --- |
| `Hold()` | Folded, Rigidbody kinematic (no interpolation), collider off, feed off. State `InHand`. |
| `Throw(velocity)` | Folded, physics on, random spin. State `Thrown`; lands into `Deploying`, then `Ready`. |
| `Drive(throttle, turn)` | Both -1..1, turn > 0 turns right. Used only while `Ready` and on the ground. |
| `Hop()` | Ignored unless `Ready`, on the ground and not already hopping. |
| `Shutdown()` | State `Off`. Plays `shutdown` from `Ready` and blends into it over 0.4 s from `Deploying`; thrown or in hand it just goes dark. |
| `SetFeed(texture)` | The RenderTexture for `FeedCamera`; null switches the camera off. |
| `Current` | `InHand`, `Thrown`, `Deploying`, `Ready` or `Off`. |
| `FeedCamera`, `Speed` | The nose camera; forward speed in m/s. |
| `onLanded`, `onDeployed`, `onShutdown` | Touched down from a throw; stood up and can drive; shut down. |

Fields: `maxSpeed` 1.5 m/s, `turnRate` 180°/s, `acceleration` 5 m/s², `hopSpeed` 2.25 m/s, `ground` (layers
the wheel and ground rays hit), `feed`, `fieldOfView` 92, and the six sounds. Sounds are read when they play;
a new `motorLoop` is picked up while the drone is ready.

## Changing the drone

### Where things live in viewer.html

The file embeds base64 sounds on one very long line: search it by name rather than opening it whole.

- Dimensions: `const R, L, PX, PZ, WX` (wheel radius, arm length, arm pivot x and z, wheel centre x),
  `A_RIDE`, `A_STOW`, `bodyY`, `WHEELS`. `buildDrone()` builds the nodes.
- Poses: `P()` and `pose(D, p)`. A pose is `{ arms[4] (degrees), dy, pitch, roll, spin[4], ant, thump 0-1,
  open 0-1 }`, with pitch, roll, spin and ant in radians. `pose()` works out the body's height and tilt
  from the arm angles.
- Clips: `T` (lengths) and `HOP` (launch, land), then `deployP`, `STOWED`, `driveP`, `turnP`, `hopP` and
  `shutdownP`. `exportScenes()` samples each with `sampleClip` (30 fps), lists the nodes each clip keys,
  and writes the `extras.clips` text.
- The viewer's driving: `VMAX`, `WMAX`, `G`, `HOP_V` and `step()`. The feed is `renderFeed()`; the sounds
  are `SOUND_DATA`, `SFX` and `motorTick()`.

### Numbers copied into ScoutDrone.cs

ScoutDrone does not read the .glb extras. It reads the clip lengths from the imported clips, but these
numbers are copied by hand; change them in both files (and in this guide) together.

| ScoutDrone.cs | viewer.html |
| --- | --- |
| `R` 0.043, `L` 0.07, `WX` 0.098 | `R`, `L`, `WX` |
| `RideAngle` 40, `StowAngle` -2.2 | `A_RIDE`, `A_STOW` |
| `DeployRoll` (worked out from the four above) | the wheel spin in `deployP` |
| `HopLaunch` 0.14 | `HOP.launch` |
| `maxSpeed` 1.5, `turnRate` 180, `acceleration` 5 | `VMAX`, `WMAX` (3.2 rad/s), the `5 * dt` in `step()` |
| `hopSpeed` 2.25 | `HOP_V` |
| `fieldOfView` 92 | `feedCam` |
| antenna rest -11.5° | `ant: -0.2` (radians) in `P()` |
| box 0.22 × 0.13 × 0.3 at y 0.068 | the drone's outline at ride height (see the README) |

### Rebuilding

Install the tools once: `cd tools && npm install && npx playwright install chromium && cd ..`. Then, from
the repo root:

```bash
node tools/export-glb.js gadgets/scout-drone/viewer.html          # scout-drone.glb
node tools/unity-export.js gadgets/scout-drone/scout-drone.glb    # unity/scout-drone.glb
node tools/render-preview.js gadgets/scout-drone/viewer.html      # preview.png
node tools/check-glb.js gadgets/scout-drone/scout-drone.glb       # nodes, materials, extras, clips
```

Copy the new `unity/scout-drone.glb` over the project's copy and run Build Prefabs From Selection again.
That overwrites `scout-drone.prefab` and removes ScoutDrone and everything assigned to it. Before
rebuilding, use Copy Component on ScoutDrone; afterwards, Paste Component As New on the prefab root.
