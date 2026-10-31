# Tracker Tags: integration guide

For anyone (or any session) wiring Nox's tracker tags into the game or changing them. `viewer.html` is the
reference; `../../unity/Runtime/TrackerTags.cs` is a working Unity version. **It needs
`../../unity/Runtime/Nullfield.cs`** (same folder): it calls `Nullfield.IsHidden()` and does not compile without it.

Units are metres and degrees unless a line says otherwise. Positions are in glTF space unless a line says Unity.
glTFast negates X on import: glTF +X is Unity -X, rotations about X stay the same, and rotations about Y and Z flip
sign. Nothing in TrackerTags.cs depends on X (it moves nodes in Y and samples the clips).

## What it is

Five coin-sized tags that stick to surfaces (walls, doors, floors, hatches; never people). They feel vibration
through the surface: footsteps, vault landings, breaches. Not heat, not sight. Each tag pulses when a step lands
close enough, and Nox's HUD shows a fuzzy arc for it: a rough direction and a distance band (near, mid, far), never
the exact spot. A tag has a faint purple ring light; attackers can spot it and shoot it, and that sends Nox a
tamper alert (which is itself information: someone is there).

They are the cheap, passive intel gadget: many tags, short range, rough information. Keep them clearly weaker per
unit than Monarch's Butterflies (the active scanner that sweeps for biological signatures): a tag only hears loud
movement within 3 m of itself, gives no position, count or identity, and is beaten by walking slowly.

## Rig

### tracker-tag.glb

The root `tracker_tag` has its origin at the centre of the tag's back, on the surface; +Y is the surface normal
(+Z is any heading: the tag is round). 31.6 mm across, 8.0 mm tall when stuck (8.7 mm free).

- `gel`: the adhesive gel ring under the rim. Free it is 1.6 mm tall; stuck it is squashed to 0.9 mm
  (scale y 0.5625) and bulges 3 % wider (scale x and z 1.03).
- `body`: the housing, screws, the piezo contact disc underneath and the internals (a pickup coil and six chips,
  seen once the cap is off). It rides on the gel: y 0 stuck, 0.0007 free.
- `prongs` (under `body`): three contact pins at radius 8.8 mm. Stuck (y 0) their tips are 1 mm into the surface
  (y -0.001); free they are pulled up 1.9 mm.
- `led_ring` (under `body`): the ring light (`led_purple`) in the groove round the rim. y 0 lit, -0.0008 sunk.
- `pulse_ring` (under `body`): the inner ring (`pulse_purple`) round the membrane. It pops up 1.9 mm on a pulse.
- `membrane` (under `body`, y 0.0044): the low rubber sensing dome with a steel nub. The pulse squashes it in Y.
- `cap_a`, `cap_b` (under `body`): the two halves of the cap ring, split along X, hinged at their outer top edge:
  `cap_a` at (0, 0.0055, 0.0115), `cap_b` at (0, 0.0055, -0.0115). They flip open in `tamper`.

The .glb's rest pose (no clip playing) is the stuck pose with the ring light up and the cap shut.

### tracker-tags-pack.glb

The root `tracker_tags_pack` has its origin under the middle of the base, +Y up the stack, +Z out of the exit slot
(the front). 49 × 80 × 55 mm with the belt clip (on the back, -Z) and the thumb slide (on top).

- `pack_body`: shell, deck, foot, grip ribs (-X side), gate rails, pip bezels (+X side), belt clip, screws.
- `tag_1` … `tag_5`: the stack, `tag_1` on top (y 0.055) and next out, each 9.2 mm below the one above
  (`tag_5` at y 0.0182). Each is a dormant copy of the tag in its free pose (ring light dark, material
  `led_dormant`), turned about Y so the stack does not line up.
- `pip_1` … `pip_5`: count lights on the +X side, `pip_1` lowest (y 0.018), 8.5 mm apart.
- `follower`: the plate under the stack (origin at its top). `spring`: the coil under it, at y 0.006, natural
  height 0.03 (scaled in Y).
- `slide`: the thumb slide on the deck (y 0.075); it moves +Z 24 mm to push `tag_1` out.
- `gate`: the plate over the exit slot: y 0 shut, -0.0125 open.
- `fx_eject` at (0, 0.055, 0.026): where `tag_1` is when `eject` ends.

**Count rule.** With n tags left show `tag_1`..`tag_n` and `pip_1`..`pip_n`, set `follower.y = 0.055 -
max(n - 1, 0) × 0.0092` and `spring` scale y `= (follower.y - 0.009) / 0.03`. The rest pose is n = 5 (follower y
0.0182, spring 0.3067). The tags fill from the top: after an eject `tag_1` goes back in the slot as the next tag
and the bottom one goes.

## Clips

All clips are sampled at 30 fps from pose functions in `viewer.html`. None has root motion.

| Clip | Starts | Ends |
| --- | --- | --- |
| `stick` (0.25 s) | Free: gel 1.6 mm tall (scale 1), body y 0.0007, prongs up 1.9 mm, ring light sunk 0.8 mm. | Stuck (the rest pose). The gel squashes on a spring by 0.16 s, the prongs seat between 0.05 and 0.13 s, the ring light rises between 0.13 and 0.24 s, the membrane dips 12 % in the first 0.1 s. |
| `pulse` (0.35 s) | Rest. The membrane squashes to 84 % height by 0.04 s and springs back; the pulse ring is up 1.9 mm by 0.05 s, holds to 0.12 s and sinks by 0.35 s. | Rest. |
| `tamper` (0.5 s) | Rest (cap shut, ring light up). The ring light sinks in 0.06 s; the cap halves pop up (`cap_a` 1.4 mm at 0.07 s) and flip open on a spring; the membrane caves in by 0.08 s; the body shakes for about 0.2 s. | `cap_a` 52° about X (Euler XYZ 52°, 6.2°, 0°) and 0.2 mm up; `cap_b` -31° (Euler -31°, -7.75°, 4.65°) and 0.14 mm up; membrane 30 % height, tilted 9.2° about Z, 0.2 mm down; ring light sunk 0.8 mm. Holds. |
| `equip` (0.4 s) | Gate shut (y 0), slide back. The gate opens between 0.05 and 0.28 s; the slide clicks back 2.4 mm and returns between 0.22 and 0.4 s. | Gate open (y -0.0125), slide back: the rest pose. Play it backwards to shut the gate. |
| `eject` (0.35 s) | Rest. The slide pushes `tag_1` forward 24 mm by 0.16 s, `tag_1` pops another 2 mm (0.14 to 0.22 s), the slide springs back (0.17 to 0.33 s). | Slide back, `tag_1` at z 0.026 (`fx_eject`). Then apply the count rule for n - 1 and sample `eject` at 0 s. |

Keys: `stick` gel scale, body / prongs / led_ring position, membrane scale. `pulse` membrane scale, pulse_ring
position. `tamper` body position and rotation, led_ring position, membrane position, rotation and scale, cap_a and
cap_b position and rotation. `equip` gate and slide position. `eject` slide and tag_1 position.

**glTFast import.** glTFast creates every clip with `WrapMode.Loop` and its Animation component plays the first
clip (`stick`, `equip`) on its own. TrackerTag and TrackerTagsPack switch auto-play off in Awake and never call
`Play`: they sample the clips themselves each frame (`AnimationState.time` + `Animation.Sample()`), so wrap modes do
not matter. If you play clips yourself, set the wrap modes first (`stick`, `tamper` ClampForever; `pulse`,
`eject` Once) and note that `stick`, `pulse` and `tamper` all key the membrane.

**Lights.** glTF cannot animate a light's brightness. The `pulse` clip moves the pulse ring instead, and the game
sets the glow: `led_purple` and `pulse_purple` on while the tag is stuck, ramping up with the ring light in
`stick` (0.13 to 0.24 s), off once it is dead; a flash on each pulse. glTFast keeps emission in `emissiveFactor`;
TrackerTag scales that (and `_EmissionColor`, and the `_EMISSIVE` / `_EMISSION` keywords).

## Sequence

| Step | Clip | Sound | What happens |
| --- | --- | --- | --- |
| Equip the pack | pack `equip` | | Optional: the viewer's pack sits on a crate with the gate open. |
| Press one on | pack `eject`, then tag `stick` | `eject.wav` at the pack, `stick.wav` at the tag | The pack ejects `tag_1` (0.35 s) and its count drops; the tag appears on the surface and sticks (0.25 s): about 0.6 s in all. The viewer flies it from the pack to the surface instead (0.14 s + distance / 13 m/s, a small arc). |
| Throw one | tag `stick` on contact | `stick.wav` | Flies, tumbling, and sticks to the first surface it hits. People make it bounce off. |
| Feel a step | tag `pulse` | `pulse_tick.wav` (quiet) at the tag, `hud_ping.wav` for Nox | When the vibration reaches the tag (see Vibrations). The ring lights flash. Nox's HUD draws an arc. |
| Shot | tag `tamper` | `tamper.wav` at the tag, `tamper_alert.wav` for Nox 0.25 s later | Lights out, cap pops, colliders off. Nox's HUD shows a red arc on the tag and a "Tamper · tag N" banner (3 s). TrackerTag removes the dead tag after 6 s; the viewer leaves it until Re-tag. |

## Vibrations

The game reports things that shake the structure; every stuck tag in range pulses.

- `radius = 3 m × strength × damping × reach`. Strength: crouch-walk (or a slow walk) 0.15, walk 0.6,
  sprint 1.0 (a vault landing: 1.0 in TrackerTags.cs). Damping: 0.4 on a soft floor (mats, rugs), else 1.
  Reach: 2 for a breach charge (strength 1), else 1. The distance is 3D, from the step to the tag.

  | Source | Hard floor | Soft floor |
  | --- | --- | --- |
  | Crouch-walk 0.15 | 0.45 m | 0.18 m |
  | Walk 0.6 | 1.8 m | 0.72 m |
  | Sprint 1.0 | 3 m | 1.2 m |
  | Breach (1.0, reach 2) | 6 m | |

- How hard a tag felt it: `min(1, strength × damping) × (1 - d / radius)`. It sets the flash and how bright the
  HUD arc is; it does not change the arc's size.
- The pulse is late by `0.75 s × (1 - sqrt(1 - d / radius))`: the time the viewer's ring takes to reach the tag
  (its front slows as it spreads). The viewer's breach rings run 1.4 times slower (1.05 s); TrackerTags.cs uses
  0.75 s for everything (`TrackerTags.travelTime`).
- **Nullfield.** Ignore the vibration if `Nullfield.IsHidden(source)` (N1CK always carries a NullfieldCarrier;
  anyone inside a powered bubble) or the point itself is inside a powered bubble. TrackerTags.ReportVibration does
  both checks. The tamper alert is not a sensing: it still fires when N1CK shoots a tag.

## Nox's HUD

What a reading gives (TrackerReading in Unity):

- Each tag that pulses makes its own reading. The event point is moved up to 1.2 m in a random direction (seeded:
  the same event and tag give the same offset) before anything is measured, so tags disagree a little and the
  truth is somewhere in the overlap.
- Bearing from Nox to that point (the viewer's HUD keeps Nox's forward up; Nox faces -Z in the viewer). Arc
  half-width `clamp(atan(1.2 m / distance), 8°, 40°)`: wide when close, narrow far away. Tamper arcs are 5°.
- Distance band from Nox: near under 3 m, mid under 6 m, far beyond. Horizontal distance only: no height.
- No exact position, no count, no identity. One footstep reaching three tags is three readings.
- A reading stays 2.6 s (tamper 4 s), fading as `(1 - age / life)²`. The arc's brightness is
  `0.35 + 0.65 × clamp01(felt × 1.8)` of full.
- One `hud_ping` per event (not per tag), at most one every 0.12 s.

The viewer's panel: a compass ring (radius 0.36 of the panel's short side) with three band rings, ticks every
15°, a forward marker on top and near / mid / far labels. Each arc is four overlapping strokes in its band's ring,
each narrower (`half × (1 - 0.24 i)`), purple (160, 110, 255) at 16 % alpha, tamper red (255, 80, 80) at 30 %,
with a glow. Along the bottom: one dot per tag (filled purple stuck, lighter for 0.25 s after a pulse, red cross
dead, hollow in the pack or in the air) and the last event's band ("Movement · mid") for 2.5 s.

## Sounds

- `sounds/*.wav` are 44.1 kHz mono 16-bit, made by `python3 gadgets/tracker-tags/sounds/generate_sounds.py`
  (needs numpy; it writes next to itself, and its docstring describes each sound). The output is the same every run.

  | Sound | Length | When | Viewer level |
  | --- | --- | --- | --- |
  | `eject.wav` | 0.67 s | The pack's slide pushes a tag out | 0.5, at the pack |
  | `stick.wav` | 0.75 s | A tag lands or is pressed on | 0.6, at the tag |
  | `pulse_tick.wav` | 0.12 s | A tag feels a step (quiet: attackers right next to it may hear it) | 0.22, at the tag |
  | `hud_ping.wav` | 1.1 s | Nox's HUD draws a new arc (once per event) | 0.4 |
  | `tamper.wav` | 1.0 s | A tag is shot | 0.8, at the tag |
  | `tamper_alert.wav` | 1.3 s | Nox's HUD warns that a tag was destroyed | 0.6 |
  | `breach.wav` | 2.7 s | The viewer's breach charge | 0.9 |
  | `footstep.wav` | 0.56 s | The viewer's attacker | crouch 0.12, walk 0.32, sprint 0.5; × 0.45 on the mat |

- The viewer scales sounds that have a position by `min(1, 3 / distance to the camera)`. TrackerTags.cs plays the
  tag sounds from a 3D AudioSource on each tag and the pack's from one on the pack (Unity's default rolloff), and
  `hud_ping` / `tamper_alert` from a 2D AudioSource on Nox. Only Nox should hear those two.
- The viewer does not load the WAVs. It plays MP3 copies (80 kbps mono) embedded as base64 in
  `const SOUND_DATA`, one long line in `viewer.html`. After regenerating a sound, re-encode it
  (`ffmpeg -i stick.wav -codec:a libmp3lame -b:a 80k -ac 1 stick.mp3`), base64 it (`base64 -w0 stick.mp3`) and
  replace that key's `data:audio/mpeg;base64,…` string. No tool does this.

## Gameplay rules and counterplay

- Nox carries 5 tags. Placing is quick (about 0.6 s pressed on). Surfaces only: TrackerTag refuses colliders with
  a CharacterController, a non-kinematic Rigidbody, another tag, a layer outside `surfaces`, or a TrackerSurface
  with `allowTags` off; a thrown tag bounces off those.
- A tag on a door swings with it. If the object it is stuck to is destroyed (a breached wall), the tag dies and
  Nox gets the tamper alert.
- Health 1: any hit kills it. A dead tag's colliders are off, so it does not soak up more bullets.
- Tells: the faint ring light (about 3 cm across), a brighter flash and a quiet tick each time it feels a step.
- Counterplay: shoot the tags (Nox then learns roughly where the tag was, and that someone is there);
  crouch-walk or walk slowly (0.45 m: they must almost step on the tag); stay on soft floors (× 0.4); a Nullfield
  or N1CK hides the source completely. Breach charges are loud: 6 m.
- Tuning: lower `range` or raise `fuzz` if the tags feel too strong; keep the arcs at least 8° wide and the bands
  at three. Do not add positions, counts or identities to readings.

## Unity quick start

1. Import `unity/tracker-tag.glb` and `unity/tracker-tags-pack.glb` with glTFast (Animation: Legacy) and build
   their prefabs with Tools > Gunmodls > Build Prefabs From Selection (setup in the root README's Unity section).
2. Make sure `unity/Runtime/Nullfield.cs` is in the project next to `TrackerTags.cs`.
3. Add `TrackerTags` to Nox. Assign `tagPrefab` (the tracker-tag prefab), `pack` (an instance of the pack prefab
   in his hand or on his belt; keep it active), `observer` (his camera) and the six sounds. It adds TrackerTag to
   each tag it spawns and TrackerTagsPack to the pack, so rebuilding the gadget prefabs loses nothing.
4. Pressing one on: raycast from the camera (about 1.5 m) and call `Place(hit.point, hit.normal, hit.collider)`.
   Throwing: `Throw(hand.position, camera.forward * 8f)`. Both return null when none are left, the pack is still
   ejecting or the surface takes no tags.
5. Each foot strike (server side): `TrackerTags.ReportStep(footPosition, gait, player)`. A vault landing:
   `ReportVibration(point, TrackerTags.Vault, player)`. A breach: `TrackerTags.ReportBreach(chargePosition,
   attacker)`.
6. Weapons: on a hit, `hit.collider.GetComponentInParent<TrackerTag>()` and call `Damage(amount)` on it.
7. HUD: draw `Recent` every frame (each reading's `approxPoint` with `TrackerTags.Bearing(observer, point)` keeps
   the arcs right as Nox turns), or listen to `onReading` and `onTamper`.
8. Soft floors: put a TrackerSurface on the mat (move the class into `TrackerSurface.cs` first to add it from the
   Inspector), or multiply the strength by `TrackerTags.SoftFloor` yourself if your footstep system knows the floor.
9. New round: `ResetAll()`.

The pack's per-part `_COL` boxes become BoxColliders; turn them off if they get in the way on the player. A tag's
thrown flight ignores Nox's own colliders (anything under the TrackerTags object).

## Script reference (TrackerTags.cs)

### TrackerTags (on Nox)

| Member | What it does |
| --- | --- |
| `Place(point, normal, surface)` | Pressed on: ejects one from the pack and sticks it `placeDelay` (0.35 s) later. Returns the TrackerTag or null. |
| `Throw(from, velocity)` | Ejects one and throws it from `from`. Returns the TrackerTag or null. |
| `Pickup(tag)` | A live tag of Nox's goes back into the pack. |
| `ResetAll()` | Destroys all of Nox's tags (live or dead), clears the readings, fills the pack. |
| `Left`, `Placed`, `Recent`, `Pack` | Tags still in the pack; tags out (dead ones until removed); readings still on screen; the TrackerTagsPack. |
| `onReading`, `onTamper`, `onPlaced` | A tag felt something; a tag was destroyed (after `alertDelay`); a tag finished sticking. |
| `static ReportVibration(point, strength, source[, reach, seed])` | Every stuck tag within `range × strength × damping × reach` pulses after its delay. `seed` ≥ 0 sets the event id (send it to clients); -1 counts up. Returns how many tags felt it. |
| `static ReportStep(foot, gait, who[, seed])`, `static ReportBreach(point, who[, seed])` | The same with `Crouch` / `Walk` / `Sprint`, and with strength 1, reach 2. |
| `static Bearing(observer, point)` | Degrees from the observer's forward to the point, + to the right. |
| `const Crouch, Walk, Sprint, Vault, SoftFloor, BreachStrength, BreachReach` | 0.15, 0.6, 1, 1, 0.4, 1, 2. |
| `static travelTime` | 0.75 s: the pulse delay for a tag at the edge of the radius. |

Fields: `tagPrefab`, `pack`, `capacity` 5, `range` 3, `placeDelay` 0.35, `surfaces`, `observer`, `fuzz` 1.2,
`bands` (3, 6), `arcLimits` (8, 40), `readingLife` 2.6, `tamperLife` 4, `alertDelay` 0.25, and the sounds
`ejectSound`, `stickSound`, `pulseSound`, `tamperSound`, `hudPing`, `tamperAlert`. The tags get `range`,
`surfaces` and their sounds when they spawn.

### TrackerReading

`eventId`, `tagId` (1..5: the lowest id not in use when it was placed), `tag`, `approxPoint` (the fuzzed point,
world; never draw it as a marker), `bearing`, `halfWidth`, `band` (0, 1, 2), `strength` (0..1), `tamper`, `time`.
Tamper readings have eventId -1, strength 1, the tag's own position and a 5° half-width.

### TrackerTag (on each tag)

| Member | What it does |
| --- | --- |
| `Place(point, normal, surface[, delay, yaw])` | Sticks it at the point, +Y along the normal (random yaw unless given), hidden for `delay` s first. Follows `surface`'s transform without parenting. |
| `Throw(velocity)` | Flies under gravity, tumbling; sticks to the first surface it may stick to, bounces off the rest (0.3 of its speed). Lost after 6 s. |
| `Damage(amount)`, `Kill()` | `health` 1 by default. Kill plays `tamper`, lights and colliders off, tells the owner, removes it after `removeAfter` (6 s). Killed while hidden or in the air it just goes, without an alert. |
| `Current` | `Flying`, `Sticking`, `Stuck` or `Dead`. `Listening` is true when stuck or sticking on the surface. |
| `Id`, `Owner`, `Surface`, `static Live` | 1..5 from TrackerTags (level tags count from 101); the TrackerTags that placed it; the collider it is on; every enabled tag. |
| `static CanStick(collider, mask)` | The surfaces-only rule above. |
| `onStuck`, `onPulse`, `onTampered` | Hooks for effects. |

A tag put in the level starts stuck and finds its surface with a short ray down its -Y. It has no owner: it
pulses (flash, tick, `onPulse`) but no HUD gets a reading. The flash multiplies the glow by
`1 + 2.5 × (0.4 + 0.6 × clamp01(felt × 1.6)) × exp(-t / 0.12 s)`.

### TrackerTagsPack (on the pack)

| Member | What it does |
| --- | --- |
| `Eject()` | False if empty or still ejecting. Count drops at once; the clip runs 0.35 s; then the count rule applies and `onEjected` fires. Opens the gate first if it was shut. |
| `Equip()`, `Holster()` | `equip` forwards (gate opens) or backwards (gate shuts). |
| `SetCount(n)`, `Count`, `Busy`, `Equipped`, `EjectPoint` | 0..5 with the count rule; ejecting; gate open; `fx_eject`. |

### TrackerSurface

`damping` (0.4) for steps on it, `allowTags` (true). ReportVibration looks for it with a 0.3 m ray down from 0.1 m
above the point.

## Multiplayer notes

- Run placement, `Damage` and `ReportVibration` on the server. Replicate each tag's spawn, pose and state; clients
  play the clips and sounds from the state changes.
- Report steps from authoritative movement, once per foot strike, with a seed from a server counter. The fuzz is
  seeded by (event id, tag id) with the viewer's random numbers (mulberry32 of `id × 7919 + tagId × 104729`), so
  every machine gets the same `approxPoint` for the same pair.
- Send readings and tamper alerts to Nox only (his team if you want), never to attackers. Compute bearings on his
  client with `TrackerTags.Bearing`.
- The ring light, the pulse flash and the tick are public: everyone near the tag sees and hears them.
- Check `Nullfield.IsHidden` where ReportVibration runs, against the server's bubble state.

## Changing the tags

### Where things live in viewer.html

The file embeds base64 sounds on one very long line: search it by name rather than opening it whole.

- The tag: `TG` (sizes and offsets: radius, gel heights, prong lift, LED drop, pulse lift, hinge, membrane),
  `tagGeos()` (geometry; `lite` is the cheaper copy for the pack) and `buildTag()` (nodes).
- Tag poses and clips: `TP()`, `FREE()`, `poseTag()`; `TT` (lengths), `stickP`, `pulseP`, `tamperP`.
- The pack: `PK` (sizes, stack top and pitch, travel), `followY`, `packGeos()`, `buildPack()`; poses `PP()`,
  `posePack()`, `setPackCount()`; clips `TPK`, `equipP`, `ejectP`.
- `exportScenes()` samples each clip with `sampleClip` (30 fps), lists the nodes each clip keys and writes the
  `extras` text (including the count and eject rules).
- Gameplay numbers: `RANGE`, `GAIT`, `SOFT`, `BREACH`, `FUZZ`, `BANDS`, `ARC`, `RIPPLE_T`. The logic:
  `vibration()`, `footstep()`, `fuzzed()`, `hudReading()`, `runPending()`, `placeTag()`, `shootTag()`,
  `updateTags()`, `breach()` / `breachBlast()`, and the HUD in `drawHud()`.
- The room: `DOOR`, `HATCH`, `RUG` (the soft floor), `NOX`, `CRATE`, the default tag spots `SPOTS`; the attacker:
  `PATH`, `GAITS`, `buildDummy()`, `poseAttacker()`. Sounds: `SOUND_DATA` and `play()`.

### Numbers copied into TrackerTags.cs

TrackerTags.cs does not read the .glb extras. It reads the clip lengths from the imported clips, but these numbers
are copied by hand; change them in both files (and in this guide) together.

| TrackerTags.cs | viewer.html |
| --- | --- |
| `range` 3 (TrackerTags and TrackerTag) | `RANGE` |
| `Crouch` 0.15, `Walk` 0.6, `Sprint` 1 | `GAIT` |
| `SoftFloor` 0.4 | `SOFT` |
| `BreachStrength` 1, `BreachReach` 2 | `BREACH` |
| `fuzz` 1.2 | `FUZZ` |
| `bands` (3, 6) | `BANDS` |
| `arcLimits` (8, 40), tamper half-width 5 | `ARC`, the 5 in `hudReading()` |
| `readingLife` 2.6, `tamperLife` 4 | `life` in `hudReading()` |
| `travelTime` 0.75 | `RIPPLE_T` |
| `alertDelay` 0.25 | the alert's `t` in `shootTag()` |
| the 0.12 s between pings | `runPending()` |
| fuzz seed `id × 7919 + tagId × 104729` and mulberry32 | `fuzzed()`, `mulberry32()` |
| flash `0.4 + 0.6 × clamp01(felt × 1.6)`, 0.12 s | `runPending()`, `updateTags()` |
| ring light ramp 0.13 to 0.24 s (`LedOn`, `LedFull`) | `stickP` |
| `placeDelay` 0.35 | `TPK.eject` |
| pack `TopY` 0.055, `Pitch` 0.0092, `SpringBottom` 0.009, `SpringH0` 0.03 | `PK.TOPY`, `PK.PITCH`, `PK.BASE + PK.FOLLOW_T`, `PK.SPRING_H0` |
| sound levels (stick 0.6, pulse 0.22, tamper 0.8, eject 0.5, ping 0.4, alert 0.6) | the `play()` calls |

### Rebuilding

Install the tools once: `cd tools && npm install && npx playwright install chromium && cd ..`. Then, from the
repo root:

```bash
node tools/export-glb.js gadgets/tracker-tags/viewer.html     # tracker-tag.glb, tracker-tags-pack.glb
node tools/unity-export.js gadgets/tracker-tags/tracker-tag.glb gadgets/tracker-tags/tracker-tags-pack.glb
node tools/render-preview.js gadgets/tracker-tags/viewer.html  # preview.png
node tools/check-glb.js gadgets/tracker-tags/tracker-tag.glb gadgets/tracker-tags/tracker-tags-pack.glb
```

The preview takes about a minute in software WebGL; if it times out on a busy machine, run it again. Copy the new
`unity/*.glb` over the project's copies and run Build Prefabs From Selection again. TrackerTag and TrackerTagsPack
are added at runtime, so the rebuilt prefabs need nothing put back.
