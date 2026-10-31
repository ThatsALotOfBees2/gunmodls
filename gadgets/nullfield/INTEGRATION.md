# Nullfield: integration guide

For anyone (or any session) wiring the Nullfield into the game or changing it. `viewer.html` is the reference;
`../../unity/Runtime/Nullfield.cs` is a Unity version (the emitter, the rule every sensor uses, and a helper for
feed cameras). It was written for Unity 2021 LTS through Unity 6 but has not been compiled in this repo.

Units are metres and degrees unless a line says otherwise. Positions are in glTF space unless a line says
Unity. glTFast negates X on import: glTF +X is Unity -X, rotations about X stay the same, and rotations about
Y and Z flip sign. Spin directions written as "seen from above" are the same in both.

## What it does

- **N1CK is always hidden** from digital sensors (a passive perk; no model). In Unity: a `NullfieldCarrier`
  component on him.
- **The emitter** is thrown, stands up and raises a bubble of radius 4 m around its core. Everything inside a
  powered bubble is hidden from digital sensors too: drone and camera feeds, scanner pulses, tracker tags,
  anything that asks `Nullfield.IsHidden`. People still see the room through it, and sounds are unchanged.
- **The tell.** A sensor does not show a fake room; it shows nothing. In a feed the bubble is one perfectly flat
  patch with no grain and no scanlines, in a feed that is otherwise noisy, and N1CK is a flat silhouette in the
  same colour wherever he walks. A scan never marks anyone hidden.
- **Battery.** 25 s of field from full. It drains only while the field is on, recharges after the field has been
  off for 2 s (50 s from empty to full), and needs 20 % to switch on. When it runs out, the field drops.
- **Counter.** Shoot the emitter: one hit kills it (as Nullfield.cs ships) and the bubble collapses in 0.12 s.

## Rig

Node names (`body` and `fx_bubble` are the root's children; the rest sit under `body`):

- `nullfield_emitter`: the root. Its extras hold the dimensions, the battery numbers and the clip notes.
- `body`: the puck (12.8 cm across, 4 cm thick). Its height is set by the legs: 0 folded (on its belly),
  0.0269 standing. `shutdown` also tilts it.
- `leg_0`, `leg_1`, `leg_2`: hinged at the bottom of the wall, 0.0605 from the middle at y 0.004 on the body,
  at azimuths 0°, 120° and 240° (from +Z toward glTF +X; anticlockwise seen from above). Rotation =
  Ry(azimuth) · Rx(swing): swing 0 is folded (lying up the wall in its slot), 145° is standing (the foot rollers
  on the ground, 55° below horizontal). In Unity the azimuths read 0°, -120°, -240°.
- `stage_a`: the outer mast sleeve. y 0.034 down, 0.066 up (rises 0.032).
- `ring_lower`: child of `stage_a` (y 0.003), turns about Y in `idle`.
- `stage_b`: the inner mast with the lantern, child of `stage_a`. y -0.0135 down, 0.012 up (rises 0.0255).
- `core`: the crystal in the lantern, child of `stage_b` (y 0.0085); turns about Y in `idle`. Visible through
  three windows; 0.1134 above the ground when standing with the mast up.
- `fx_core`: same place as `core`, does not turn: aim point and hit effects.
- `ring_upper`: child of `stage_b` (y 0.0215), turns about Y in `idle`.
- `gauge_00` … `gauge_11`: the battery gauge, one lit segment each in the channel round the top, anticlockwise
  seen from above starting at +Z (`gauge_00` is 15° round from leg 0, toward leg 1). Segment i is lit while
  charge > i / 12. Scale an unlit one to 0 (the viewer and Nullfield.cs use 0.0001).
- `fx_bubble`: the field, a root child at y 0.1134 (the core when standing). A unit sphere (`fx_bubble_sphere`,
  32 × 16, 960 triangles, material `nullfield_bubble`: violet, 12 % opacity, blend); its scale is the bubble
  radius in metres. Rest scale 0.0001. It is a stand-in: the viewer draws its own shimmering skin instead, and
  a game will want its own shader too. In `unity/nullfield-emitter.glb` the sphere is `fx_bubble_mesh`.

Materials: `shell_composite`, `frame_alloy`, `joint_steel`, `black_steel`, `fasteners`, `foot_rubber`,
`gauge_cell` (dark), `led_purple` (emissive strength 2.6), `gauge_led` (1.1), `core_glow` (3.2),
`nullfield_bubble`.

The .glb's rest pose (no clip playing) is standing, mast up, rings at 0, bubble hidden.

## Clips

All clips are sampled at 30 fps from pose functions in `viewer.html`. None has root motion.

| Clip | Starts | Ends |
| --- | --- | --- |
| `deploy` (1.6 s) | Folded: legs 0°, body y 0, mast down, bubble 0.0001. | Standing, mast up, bubble 4. Leg i springs out from 0.05 + 0.04·i s over 0.42 s (all at 145° by 0.55 s); the body rises once a leg passes about 92°. From 0.6 s it is `power_on`: stage_a 0.6 to 0.98 s, stage_b springs up from 0.82 s (settled by 1.32 s), bubble 1.05 to 1.55 s. |
| `idle` (3 s loop) | Rings and core at 0. | Loops: `ring_lower` +120°/s, `ring_upper` -240°/s, `core` +120°/s about Y (glTF; anticlockwise, clockwise, anticlockwise seen from above). |
| `power_on` (1.0 s) | Standing, mast down, bubble 0.0001. | Mast up, bubble 4. stage_a eases up over 0 to 0.38 s, stage_b springs from 0.22 s (overshoots, settled by 0.72 s), bubble grows 0.45 to 0.95 s (fast, then slowing: 1 - (1 - u)³). Body and legs held standing. |
| `power_off` (0.8 s) | Standing, mast up, bubble 4. | Mast down, bubble 0.0001. Bubble 4 · (1 - c²) over 0 to 0.25 s; stage_b down 0.1 to 0.48 s, stage_a down 0.3 to 0.75 s. Body and legs held standing. |
| `shutdown` (1.2 s) | Standing, bubble 4. | Legs 104°, 128°, 121°, body y 0.0157, tilted about 4.9° about X and 1.3° about Z (glTF; -1.3° in Unity), bubble 0.0001 (4 · (1 - c)² over 0.12 s). Leg i gives way from 0.28 + 0.06·i s, hits its stop at 0.62 + 0.06·i s and bounces once (0.2 s). It does not key the mast. |

To kill it with the mast up, play `shutdown` and `power_off` at 2.5× together (as the viewer and Nullfield.cs
do). Folded is `deploy` at 0 s; standing with the mast down is `deploy` at 0.6 s (or `power_on` at 0 s).

**glTFast import.** glTFast creates every clip with `WrapMode.Loop` and its Animation component plays the
first clip (`deploy`) on its own. Nullfield switches auto-play off in Awake and puts the clips on layers:
`idle` loops on layer 0 at a speed it ramps; `deploy`, `power_on` and `power_off` are `ClampForever` on
layer 1; `shutdown` is `ClampForever` on layer 2, so it overrides the body and legs. If you play clips
yourself, set `wrapMode` first.

## Sequence

| Step | Clip | Sound | What happens |
| --- | --- | --- | --- |
| In hand | (`deploy` at 0 s) | | Folded. The viewer hides it. The battery recharges. |
| Throw | | `throw` | Leaves the hand folded and tumbles (the viewer: 0.75 s from the hand to the floor). |
| Land and stand | `deploy` | `land` + `deploy` | On the first contact whose normal points up (y ≥ 0.6), set it upright with the heading it had and play `deploy`. If the charge is under 20 % it only stands up (stops at 0.6 s, mast down, no field). |
| Field on | (`deploy` from 0.6 s, or `power_on`) | `field_on` | The field counts as on (the battery drains) from here; the bubble hides from the moment it starts growing. Start `idle` and ramp its speed to 1 over 1 s. |
| Field up | `idle` | `field_loop` | Hum volume and pitch follow the bubble's size. At 20 % charge: `low_battery` once, and the last lit segment blinks. |
| Field off | `power_off` | `field_off` | Switched off, or the battery ran out (then `low_battery` too). `idle` ramps down over 1 s. |
| Picked up | `deploy` backwards at 2× | `field_off` if it was on | From 1.6 s if the mast is up (the viewer: if the field is on), else from 0.6 s; then in hand. |
| Shot | `shutdown` (+ `power_off` at 2.5×) | `shot` | Bubble gone in 0.12 s, lights out over 0.5 s (the core flashes and dies in 0.35 s), rings stop in 0.25 s, gauge dark. It stays dead. |

## The field

- The rule is one sphere test: a point is hidden while it is within the current bubble radius of the
  `fx_bubble` node (`Nullfield.IsHidden(point)`); a GameObject is hidden if it, or a parent, has an enabled
  `NullfieldCarrier`, or its position is inside a bubble (`Nullfield.IsHidden(gameObject)`).
- The radius grows and collapses with the clips: hidden-ness follows the bubble, not the switch. A bubble that
  is still collapsing still hides what is inside it.
- It is a plain sphere: it goes through walls, floors and ceilings. Someone on the floor above, within 4 m of
  the core, is hidden too. If rooms should stop it, add that test in your sensor code.
- It does not care about teams: your own cameras see the patch too. Filter by team in the sensor code if you
  want N1CK's side exempt.
- The sphere is centred 0.11 m above the floor, so at head height (1.8 m) it reaches about 3.6 m out.
  `IsHidden(gameObject)` tests the object's position (usually the feet): a person standing at the edge counts
  by where they stand.

## Battery

| | Viewer `BATT` | Nullfield.cs |
| --- | --- | --- |
| Full to empty with the field on | `field` 25 s | `fieldSeconds` 25 |
| Empty to full with the field off | `recharge` 50 s | `rechargeSeconds` 50 |
| Wait after the field goes off before recharging | `delay` 2 s | `rechargeDelay` 2 |
| Charge needed to switch on | `min` 0.2 | `minChargeToStart` 0.2 |

It recharges in the hand and standing, not when dead. Every 2 s off buys about 1 s on. The viewer switches the
field back on by itself when a battery that ran out is full again (a demo convenience, stopped by the Field and
Shoot buttons); Nullfield.cs does not: call `PowerOn()`.

## Sensors

Every sensor asks `Nullfield.IsHidden(...)` before it reports something. What each one does in the viewer, and
what to add in Unity (without changing the existing scripts' behaviour otherwise):

- **Tracker Tags** (Nox, `unity/Runtime/TrackerTags.cs`): `TrackerTags.ReportVibration` already returns 0 for a
  hidden point or source. It needs Nullfield.cs in the project.
- **Scout Drone and security / sticky cameras** (`ScoutDrone`, `DeviceCamera`): their feeds get the patch from
  `NullfieldFeed` on the feed camera. Both create the camera in Awake, so add it right after you instantiate
  them:

  ```csharp
  var drone = Instantiate(dronePrefab).GetComponent<ScoutDrone>();
  drone.FeedCamera.gameObject.AddComponent<NullfieldFeed>();

  var cam = Instantiate(cameraPrefab).GetComponent<DeviceCamera>();
  if (cam.FeedCamera != null) cam.FeedCamera.gameObject.AddComponent<NullfieldFeed>();
  ```

  If the game lets the pilot mark or ping enemies through a feed, skip hidden ones:
  `if (Nullfield.IsHidden(enemy)) return;`
- **Recon Tablet** (`ReconTablet`): in `ReconTablet.Pulse()`, inside `foreach (var t in Targets())`, after
  `if (t == null) continue;` add one line:

  ```csharp
  if (Nullfield.IsHidden(t.gameObject)) continue;
  ```

  The tablet freezes positions at the pulse, so someone who walks into the bubble after a pulse stays on the
  screen until the blip fades (2.2 s). The viewer's scan drops a mark as soon as its person is hidden.

### NullfieldFeed (feed cameras)

Put it on any Camera that renders a sensor feed. While that camera renders, and only for it:

- each powered bubble is drawn as an opaque, unlit, flat sphere in `patchColor` (default 0.36, 0.37, 0.39: the
  viewer's camera patch). From outside, every ray into the bubble hits that sphere first, so whatever is inside
  and whatever is behind it becomes the patch, as in the viewer.
- A camera inside a powered bubble (a drone that drove in) sees only the patch: the sphere is drawn last and
  through everything.
- `NullfieldCarrier` objects (N1CK) are drawn with the patch material: a flat silhouette, and no shadow in that
  camera. `carriersAsPatch = false` leaves them out instead (the feed then shows what is behind him, so N1CK
  outside a bubble has no tell). `alsoCheck` lists other objects drawn whole as patch while `IsHidden` says so
  (for one that sticks out of the bubble's edge).
- The bubble's own see-through skin (`fx_bubble`'s renderers) is not drawn.

Limits:

- **It adds no noise.** The patch is only flat if the rest of the feed is noisy and the patch is not. Add grain
  and scanlines where you show the RenderTexture (a shader on the RawImage), skip pixels equal to
  `patchColor`, and keep post-processing off on the feed camera so the colour stays exact. Without this the
  tell is lost.
- The default material comes from `Hidden/Internal-Colored` (built-in pipeline and URP). On HDRP, or to write
  a stencil for your noise pass, assign `patchMaterial`: opaque, unlit, double-sided. A camera inside a bubble
  draws a copy at the Overlay queue with `_ZTest` set to Always; without a `_ZTest` property in your shader,
  things between that camera and the bubble wall still show.
- The patch spheres are drawn on `patchLayer` (default 0), which must be in the camera's culling mask.
- It swaps materials and toggles renderers between the camera's pre-cull and the end of its render (built-in:
  `Camera.onPreCull` / `onPostRender`; URP: `RenderPipelineManager` begin / end camera rendering). Anything
  else changing those renderers in that window can fight it. It costs one material swap per carrier renderer
  per feed camera per frame.
- Screen-space effects on the feed camera (SSAO, bloom, colour grading) change the patch's pixels.

## Sounds

- `sounds/*.wav` are 44.1 kHz mono 16-bit, made by `python3 gadgets/nullfield/sounds/generate_sounds.py`
  (needs numpy; it writes next to itself, and its docstring describes each sound). `field_loop.wav` is a 2.0 s
  seamless loop.

| Sound | Length | Plays | Viewer level |
| --- | --- | --- | --- |
| `throw` | 0.5 s | Throw | 0.6 |
| `land` | 0.85 s | Landing (with `deploy`) | 0.8 |
| `deploy` | 1.1 s | Landing: the legs (0 to 0.6 s of the clip) | 0.8 |
| `field_on` | 1.7 s | Field switched on (0.6 s into `deploy`, or `power_on`) | 0.85 |
| `field_loop` | 2.0 s loop | While the bubble is up | 0.35 × size, pitch 0.85 + 0.15 × size (size = radius / 4) |
| `field_off` | 1.4 s | Switched off, battery empty, picked up with the field on | 0.85 |
| `low_battery` | 0.42 s | Charge under 20 % with the field on (once), battery empty, switching on refused | 0.6 |
| `shot` | 1.85 s | Shot (`shutdown`) | 0.9 |

- Nullfield adds two 3D AudioSources to the root (one-shots at volume 1, and the hum) with Unity's default
  rolloff. Set rolloff, max distance and mixer group after Awake through `GetComponents<AudioSource>()`.
- The viewer does not load the WAVs. It plays MP3 copies (80 kbps mono) embedded as base64 in
  `const SOUND_DATA`, one long line in `viewer.html`. After regenerating a sound, re-encode it
  (`ffmpeg -i field_on.wav -codec:a libmp3lame -b:a 80k -ac 1 field_on.mp3`), base64 it
  (`base64 -w0 field_on.mp3`) and replace that key's `data:audio/mpeg;base64,…` string. No tool does this.

## Gameplay notes and counterplay

- `health` is 1 by default, so one `Damage(1)` (or `Kill()`) destroys it. It has a box over the puck and legs, and a
  ball (radius 0.016) on the core, which glows through three windows at the top of the mast: give core hits a
  multiplier or make them the only ones that count if you want shots to need aim.
- Counterplay, in order of how a defender or attacker finds it:
  1. **The patch.** A region of a feed with no grain, no scanlines and one exact colour is a bubble; a flat
     person-shaped region is N1CK. Teach it once (the viewer's feed shows it side by side with real noise).
  2. **Eyes and ears.** The bubble's skin is a faint violet shimmer with a line on the floor; the emitter hums
     and lights up. Going to look in person beats it.
  3. **Shoot the emitter.** The bubble is gone in 0.12 s.
  4. **Wait.** 25 s from full; then it needs 20 % to come back, which is 2 s of delay and 10 s of recharging.
- N1CK's own perk has no counter in sensors; the counter is the silhouette tell and finding him by eye.
- It does not block gunfire, sight, sound or gadgets that are not sensors (a breach charge works inside).

## Multiplayer

- Run the state on the server: throw and landing point, `PowerOn` / `PowerOff`, `Kill`, the charge. Send
  events (thrown, landed at, field on, field off, killed, folded) and let each client's Nullfield play them; the
  timers are the same everywhere, so `Growth`, `CurrentRadius` and `IsHidden` agree to within a frame. Send the
  charge now and then and apply it with `SetCharge`.
- Decide sensor results on the server: scans, tracker tag readings, pings. `IsHidden` needs the emitters and
  the carrier components to exist there.
- `NullfieldFeed` is only drawing. A client that sees N1CK with its eyes has his position anyway, so the feed
  patch is not anti-cheat; the server-side scan results are.
- Do not replicate `NullfieldFeed`; add it on each client to the feed cameras that client shows.

## Unity quick start

1. Import `unity/nullfield-emitter.glb` with glTFast (Animation: Legacy) and build its prefab with
   Tools > Gunmodls > Build Prefabs From Selection (setup in the root README's Unity section).
2. Add `Nullfield` to the prefab root and assign the eight sounds. It adds a Rigidbody (0.7 kg) if there is
   none and, if the root has no collider, one BoxCollider sized to the puck (folded or standing) and a
   SphereCollider on `core`, and turns off the per-part boxes. Rebuilding the prefab removes Nullfield: see Rebuilding.
3. Put `NullfieldCarrier` on N1CK at spawn (`n1ck.AddComponent<NullfieldCarrier>()`). Unity only adds a
   MonoBehaviour from the Inspector when its file has the class's name: to add it there, move the class into
   `NullfieldCarrier.cs` (the same goes for `NullfieldFeed`).
4. Add `NullfieldFeed` to every feed camera (see Sensors) and the one line to `ReconTablet.Pulse()`.
5. In hand: instantiate it, call `Hold()` and parent it to the hand. To throw: unparent it, then
   `Throw(aimDirection * 6f)`. It lands, stands and switches the field on by itself (`powerOnLanding`). Placed
   in the level, it starts standing with the mast down and switches on in Start.
6. The gadget key: `Toggle()` while it stands. Pick up: `Fold()` (then `onFolded`, it is in hand). Hits:
   `Damage(amount)` or `Kill()`. After `onKilled`, wait 1.2 s for the clip, then `Destroy` it, or call
   `Hold()` to give it back (that undoes the kill; the charge stays as it was).

## Nullfield reference

| Member | What it does |
| --- | --- |
| `Hold()` | Folded, field off, Rigidbody kinematic, colliders off, health back to full. State `InHand`. Undoes `Kill()`. |
| `Throw(velocity)` | Folded, physics on, random spin. State `Thrown`; lands into `Deploying`, then `Ready`. |
| `PowerOn()` | Only while `Ready`. Returns false (and plays `low_battery`) under `minChargeToStart`. |
| `PowerOff()`, `Toggle()` | Field off (`power_off`), or the other way round. |
| `Fold()` | Only while `Ready`. Switches the field off, plays `deploy` backwards at 2×, then `Hold()`. State `Folding`. |
| `Damage(amount)`, `Kill()` | Ignored in hand or dead. From `Ready` or `Deploying`: `shutdown` (and `power_off` at 2.5× if the mast is up; else the mast stays where it is). Thrown or folding: it just goes dark as it is. State `Dead`. |
| `SetCharge(0..1)` | Sets the battery; 0 with the field on switches it off as if empty. |
| `Current` | `InHand`, `Thrown`, `Deploying`, `Ready`, `Folding` or `Dead`. |
| `FieldOn`, `Charge`, `Growth`, `CurrentRadius`, `Powered` | Switched on; 0..1; bubble size 0..1; radius × growth in m; growth > 0.001 and not in hand or thrown. |
| `Centre`, `Core`, `CoreCollider`, `BubbleRenderers` | `fx_bubble`'s world position; the `core` node; the ball on it (if Nullfield made the colliders); `fx_bubble`'s renderers. |
| `onLanded`, `onDeployed`, `onFieldOn`, `onFieldOff`, `onBatteryEmpty`, `onKilled`, `onFolded` | Events. |
| `Nullfield.IsHidden(Vector3)` | True inside any powered bubble. |
| `Nullfield.IsHidden(GameObject)` | True if it or a parent has an enabled `NullfieldCarrier`, or its position is inside a powered bubble. |
| `Nullfield.All`, `NullfieldCarrier.All` | Every enabled emitter and carrier. |

Fields: `radius` 4, `powerOnLanding` true, `fieldSeconds` 25, `rechargeSeconds` 50, `rechargeDelay` 2,
`minChargeToStart` 0.2, `health` 1, and the eight sounds. NullfieldFeed: `patchColor`, `patchMaterial`,
`carriersAsPatch` true, `alsoCheck`, `patchLayer` 0.

Nullfield also drives the looks: the bubble's scale and renderers (after the Animation update, so the clips'
bubble keys are only a fallback), the gauge segments (scale 0.0001 when unlit; the last one blinks under 20 %
with the field on), `led_purple` (out over 0.5 s when dead) and `core_glow` (16 % with the field off; with the
bubble up it pulses between about 80 % and 100 % once a second; a 1.6× flash dying in 0.35 s when shot) through
`emissiveFactor` (glTFast) and `_EmissionColor`, with the `_EMISSIVE` / `_EMISSION` keywords.

Landing: the first contact with an upward normal (y ≥ 0.6, slopes up to about 53°), 0.2 s or more after
`Throw()`. It sets the emitter upright at the contact height and makes it kinematic; on a slope the legs do
not follow the ground. A contact with the thrower's capsule counts: throw it from clear of the thrower's
collider or call `Physics.IgnoreCollision` after `Throw()`. Its colliders: standing a box 0.15 × 0.075 × 0.15
at y 0.048; thrown a box 0.132 × 0.052 × 0.132 at y 0.026; the core ball moves with the mast.

## Changing the Nullfield

### Where things live in viewer.html

The file embeds base64 sounds on one very long line: search it by name rather than opening it whole.

- Dimensions: `PR`, `PH` (puck), `CB_R`, `CB_Y`, `WELL_R`, `FLOOR_Y` (top recess and mast well), `LEG_R`,
  `LEG_Y`, `LEG_L`, `PAD`, `PAD_Z`, `LEGS`, `PHI_STAND` (legs), `A_Y0`, `A_UP`, `B_Y0`, `B_UP`, `CORE_B`
  (mast), `FIELD_R`, `GAUGE_N`, `BATT`; `legLift()`, `LIFT` and `CORE_STAND` are worked out from them.
  `buildEmitter()` builds the nodes (`legGeos()` the legs).
- Poses: `P()`, `FOLDED` and `pose(E, p)`. A pose is `{ phi[3] (leg swings, degrees), a, b (mast stages 0-1),
  rl, ru, core (radians), bub (bubble radius, m) }`. `pose()` fits the body's height and tilt to the three
  legs.
- Clips: `T` (lengths), `ON_AT`, `GROW`, `COLLAPSE`, `KILL_COLLAPSE`, `SPIN`, `KILL_MAST`, `SAG`, then
  `powerOnP`, `deployP`, `idleP`, `powerOffP`, `drop` and `shutdownP`. `exportScenes()` samples each with
  `sampleClip` (30 fps), lists the nodes each clip keys, and writes the `extras.clips` text.
- The viewer's emitter: `em`, `step()` (flight, deploy, folding, battery, ring speed), `setField()`,
  `throwOrPick()`, `shoot()`, `currentPose()` and `blended()` (0.2 s blends when something interrupts a clip);
  lights, gauge and bubble in `updateLooks()`.
- The rule: `bubbleCentre()`, `inBubble()`, `isHidden()`. The walkers: `makeDummy()`, `WALK`, `walkerAt()`.
- The feed: `FEEDS` (sensor positions, fields of view, patch colours), `renderFeed()` (N1CK drawn with
  `holeMat`, alpha 0) and `postMat` (tone mapping, grain, scanlines, the patch: any ray that enters the bubble
  before it hits something). The scan overlay: `SCAN`, `drawScan()`.
- The bubble's look: `bubbleMat` (refracting skin), `bubbleBackMat`, `floorRing`. The room: walls, `feedOnly`
  (the near walls and ceiling, drawn only in the feeds), crates, `secCam`, `droneProp`.
- Sounds: `SOUND_DATA`, `SFX`, `humTick()`.

### Numbers copied into Nullfield.cs

Nullfield does not read the .glb extras. It reads the clip lengths from the imported clips, but these numbers
are copied by hand; change them in both files (and in this guide) together.

| Nullfield.cs | viewer.html |
| --- | --- |
| `radius` 4 | `FIELD_R` |
| `fieldSeconds` 25, `rechargeSeconds` 50, `rechargeDelay` 2, `minChargeToStart` 0.2 | `BATT` |
| `DeployOn` 0.6 | `ON_AT` |
| `GrowStart` 0.45, `GrowEnd` 0.95 | `GROW` |
| `Collapse` 0.25, `KillCollapse` 0.12 | `COLLAPSE`, `KILL_COLLAPSE` |
| `Blend` 0.2 | `blended()` |
| `KillMast` 2.5 | `KILL_MAST` |
| `CoreHeight` 0.1134 (used only without `fx_bubble`) | `CORE_STAND` |
| `CoreDim` 0.16 | 0.5 / `GLOW.core` in `updateLooks()` |
| `GaugeCount` 12 | `GAUGE_N` |
| ring ramp 1 s (0.25 s when dead), hum 0.35 and 0.85 + 0.15, LED and core fades, gauge blink | `step()`, `humTick()`, `updateLooks()` |
| boxes 0.15 × 0.075 × 0.15 at y 0.048 and 0.132 × 0.052 × 0.132 at y 0.026, core ball 0.016 | the emitter's outline (see the README) |
| NullfieldFeed `patchColor` 0.36, 0.37, 0.39 | `FEEDS.camera.patch` |

### Rebuilding

Install the tools once: `cd tools && npm install && npx playwright install chromium && cd ..`. Then, from
the repo root:

```bash
node tools/export-glb.js gadgets/nullfield/viewer.html                  # nullfield-emitter.glb
node tools/unity-export.js gadgets/nullfield/nullfield-emitter.glb      # unity/nullfield-emitter.glb
node tools/render-preview.js gadgets/nullfield/viewer.html              # preview.png
node tools/check-glb.js gadgets/nullfield/nullfield-emitter.glb         # nodes, materials, extras, clips
```

Copy the new `unity/nullfield-emitter.glb` over the project's copy and run Build Prefabs From Selection again.
That overwrites the prefab and removes Nullfield and everything assigned to it. Before rebuilding, use Copy
Component on Nullfield; afterwards, Paste Component As New on the prefab root.
