# N1CK: integration guide

For anyone (or any session) putting N1CK into the game or changing him. `viewer.html` is the reference and the
source; `../../unity/Runtime/N1CK.cs` is a working Unity driver.

Units are metres and degrees unless a line says otherwise. Positions are in glTF space unless a line says Unity.
glTFast negates X on import: glTF +X is Unity -X, rotations about X stay the same, and rotations about Y and Z flip
sign (a glTF quaternion (x, y, z, w) becomes (x, -y, -z, w)). He faces +Z in both; his left is glTF +X, Unity -X.

## What he is

A playable operator, 1.85 m tall (top of the head), lean, human proportions, big rounded shoulders over a slight
taper to the hips, and an open, easy stance. Forged iron plate over a darker iron frame, gunmetal actuators and rings,
a recessed screen for a face in a thick stepped iron bezel behind a thin glass pane, two Nullfield emitter discs on
his upper back and a Veinite power cell half sunk in a riveted iron cradle low on his back, inside a stainless
shroud. From the front, the energy shows only as a thin dark red line round the chest door and a purple hairline
between two neck rings. His gadget, the
Nullfield, is a separate model (`gadgets/nullfield`); this model only carries the two emitters it glows through.

The only writing on him is "Nick", scratched in a child's hand on the inside of the chest panel door (hidden when it is
shut). There are no other markings, numbers or logos.

## Files

| File | What it is |
| --- | --- |
| `n1ck.glb` | The source export: rig at rest, 505 meshes on their bones, 18 materials with embedded maps, 9 clips, extras on the root node. 12.6 MB. |
| `unity/n1ck.glb` | Game copy from `tools/unity-export.js` (skinned mode, set by the root extras `unity`): one skinned mesh per LOD, `body_LOD0/1/2` under the root (skin root `hips`), `<bone>_COL` box colliders, same clips and materials. 20.4 MB. |
| `textures/face-atlas.png` | The expression atlas, 1024 × 768 (the same image is the `screen_face` emissive texture in the .glb). |
| `textures/*.png` | Every other texture, one file per map: `<family>-albedo`, `-normal`, `-orm` for iron, wear, inner, gunmetal, stainless, weld, braid, rubber; `glow-band` (cell), `glow-radial` (emitter discs), `nick-scratch`. |
| `preview.png` | Hero still (mid-wave, happy, low angle from his right front). |
| `viewer.html` | The viewer and the full procedural source (see Rebuilding). |
| `../../unity/Runtime/N1CK.cs` | Unity driver: faces, blinks, alarm tint, emitter flare, cell glow, clip playback with crossfades and face timelines. |
| `../../unity/Editor/N1CKAvatarBuilder.cs` | Editor menu that builds a Humanoid Avatar from the bone names. |
| `../../unity/Runtime/Nullfield.cs` | Built separately. Its `NullfieldCarrier` component goes on N1CK. |

## Rig

Bones are plain nodes. In `n1ck.glb` every mesh is a child of exactly one bone and moves rigidly with it; the joints
are designed (drums, rings, pistons, overlapping plates) so bending reads without deformation. In `unity/n1ck.glb` the
same parts are merged into one skinned mesh per LOD, each vertex weighted 100% to the node it hung on (so it still
moves rigidly, but a LOD is one renderer). The joints of that skin are the 67 nodes that carry geometry: the bones
below plus the piston nodes, `chest_panel` and `emitter_l/r`. The first joint and the skin's `skeleton` is `hips` (the
common root), so glTFast sets `SkinnedMeshRenderer.rootBone` to `hips`.

The rig root is named `n1ck_rig` in the files and the glTF scene `n1ck` (Unity names the imported object after the
file, so the root must not also be called `n1ck`).

```
n1ck_rig (root, at the origin)
├─ hips
│  ├─ spine ─ chest ─ upper_chest
│  │                    ├─ neck ─ head
│  │                    ├─ shoulder_l ─ upper_arm_l ─ lower_arm_l ─ hand_l
│  │                    │     hand_l ─ thumb_1_l ─ thumb_2_l ─ thumb_3_l
│  │                    │            ─ index_1_l ─ index_2_l ─ index_3_l   (also middle_, ring_, pinky_)
│  │                    ├─ shoulder_r … (mirror)
│  │                    ├─ chest_panel   hinged door over the heart ("Nick" inside)
│  │                    └─ emitter_l, emitter_r   Nullfield emitter discs (local +Z points out of the disc)
│  ├─ upper_leg_l ─ lower_leg_l ─ foot_l ─ toes_l
│  └─ upper_leg_r … (mirror)
└─ face_ctrl   (no mesh: the face channel, see Faces)
```

Piston nodes: `pist_<name>_a` (cylinder, on the first bone) and `pist_<name>_b` (rod, on the second) for `elbow_l/r`
(upper_arm → lower_arm), `knee_l/r` (upper_leg → lower_leg) and `heel_l/r` (lower_leg → foot). Their rotations are
keyed in every clip, so they track the joints in any player that plays the clips. If you pose the bones yourself
(IK, ragdoll, Humanoid retargeting), aim each `_a` node's local +Y at its `_b` node and each `_b` node's +Y at its
`_a` node every frame (in Unity that is `transform.up`, which glTFast's X flip does not change), for example
`a.localRotation = Quaternion.FromToRotation(Vector3.up, a.parent.InverseTransformDirection(b.position - a.position))`,
or accept slightly misaligned pistons.

**Rest pose.** T-pose: arms straight out along ±X, palms down (-Y), thumbs forward (+Z), legs straight, feet
forward. Every bone has identity rotation at rest, so a bone's local axes are the world axes. The soles are at y 0.

**Joints** (rest, world; right side mirrors x):

| bone | position (x, y, z) | bone | position (x, y, z) |
| --- | --- | --- | --- |
| hips | 0, 1.000, 0 | shoulder_l | 0.030, 1.470, -0.015 |
| spine | 0, 1.090, -0.005 | upper_arm_l | 0.185, 1.470, -0.025 |
| chest | 0, 1.215, -0.010 | lower_arm_l | 0.485, 1.470, -0.025 |
| upper_chest | 0, 1.345, -0.012 | hand_l | 0.750, 1.470, -0.025 |
| neck | 0, 1.555, -0.020 | upper_leg_l | 0.092, 0.955, 0 |
| head | 0, 1.640, -0.010 | lower_leg_l | 0.092, 0.515, 0.006 |
| | | foot_l | 0.092, 0.090, -0.012 |
| | | toes_l | 0.092, 0.026, 0.150 |

Fingers (left): knuckles thumb (0.774, 1.458, -0.003), index (0.844, 1.473, 0.003), middle (0.848, 1.474, -0.017),
ring (0.844, 1.472, -0.037), pinky (0.836, 1.468, -0.056). The full table, with every finger joint, is in the root
extras (`joints`).

**Axes for posing** (left side and spine; mirror for the right, in glTF):
spine, neck, head: +X bends forward / nods down, +Y turns to his left, +Z tilts toward his right.
upper_arm: Z- lowers the arm (-74° hangs it at the side), then X- swings it forward, Y+ turns the palm forward.
lower_arm: Y- bends the elbow (hinge only; the clips never twist the forearm). hand: Z- flexes toward the palm.
upper_leg: X- swings forward, Z+ out to the side. lower_leg: X+ bends the knee. foot: X+ points the toes down.
toes: X- bends them up. Supported range: elbow 0–145°, knee 0–140°, hip -30° to +110° and ±45° out, wrist ±70° /
±25°, fingers 0–100° per joint, neck and head ±40° nod / ±60° turn / ±25° tilt, spine chain ±25° bend / ±30° twist.
Some plate overlap shows only at the extremes.

**Humanoid map** (also in the extras as `humanoid`): `hips` Hips, `spine` Spine, `chest` Chest, `upper_chest`
UpperChest, `neck` Neck, `head` Head, `shoulder_l` LeftShoulder, `upper_arm_l` LeftUpperArm, `lower_arm_l`
LeftLowerArm, `hand_l` LeftHand, `upper_leg_l` LeftUpperLeg, `lower_leg_l` LeftLowerLeg, `foot_l` LeftFoot,
`toes_l` LeftToes, `<finger>_1/2/3_l` "Left <Finger> Proximal / Intermediate / Distal" with `pinky` = Little and
`thumb_1` = Thumb Proximal (the metacarpal). Right side the same with `_r` / Right.

**Hit boxes.** `unity/n1ck.glb` has 22 `<bone>_COL` boxes that `GunmodlsPrefabBuilder` turns into BoxColliders on
their bones, so they follow the animation: `head`, `neck`, `upper_chest`, `chest`, `spine`, `hips`, and per side
`shoulder`, `upper_arm`, `lower_arm`, `hand` (the box takes in the fingers at rest), `upper_leg`, `lower_leg`, `foot`,
`toes`. Pistons, emitters, the chest panel and the finger bones have none. Map a hit to a body part by the box name:
`head`/`neck` head; `upper_chest`/`chest`/`spine`/`hips` torso; `shoulder`/`upper_arm`/`lower_arm`/`hand` arm;
`upper_leg`/`lower_leg`/`foot`/`toes` leg. Put a kinematic Rigidbody on the root so the moving colliders are cheap.

## Materials and textures

All PBR metal/roughness. Textured materials carry three maps: albedo (sRGB, JPEG in the .glb), normal, and ORM
(G roughness, B metalness; R is 1, there is no baked AO). The material factors multiply the maps. UVs on plates
and shells are in metres divided by the material's tile size (iron repeats every 0.30 m), so the maps tile;
the screen, discs, cell core, cables and welds have their own UVs. No vertex colours are used anywhere: wear lives
in the textures and in the mesh split below.

| Material | Look | Where |
| --- | --- | --- |
| `iron_plate` | dark raw forged iron: satin blue-black mill scale, small steel-grey spots where it flaked (about 7%, 1–2.5 cm, a slight step down), soft hammer facets and elongated peen marks only in hammered patches (plate centres stay smooth), grinder streaks, fine pits, scratches, a slow value / roughness drift and faint straw / blue heat tint; colour `#dcdcdc` (linear 0.72) | frames, joints, inner shells, smaller plates |
| `iron_plate_outer` | the same maps at full value (about 15% lighter than `iron_plate`) | the big outer plates (pecs, sternum, scapulas, spaulders, deltoids, forearm backs, thigh and shin fronts, pelvis guard, toe caps, head shell, face plate, screen bezel), so he reads in two value groups |
| `iron_wear` | warm bare iron (albedo about 0.55), ground and scratched along the edge | worn edges (see below) |
| `iron_inner` | dark iron with faint warm rust bloom and a few fine pits | tight creases, panel-gap backs, wells, the inside of the chest door (the broad cores are `iron_plate`) |
| `gunmetal` | machined blue-grey steel | actuator drums, rings, ferrules, screws, piston bodies |
| `piston_chrome` | polished rods (colour `#9ea3ab`, roughness 0.26: a thin highlight, never a glow) | piston rods |
| `stainless_shroud` | bright brushed stainless | only the power-cell shroud |
| `weld_bead` | satin weld metal with crescent ripples at 2.75 mm pitch from the normal map (v 0–0.3 of the texture); v 0.3–0.7 is the heat band beside the bead (straw, bronze, blue, fading to scale) | weld seams (beads at most 1.4 mm high, tapered ends) and their heat bands |
| `rivet_iron` | lighter iron, the iron maps at true scale | rivet heads (smooth 12-sided domes) |
| `cable_braid` | braided steel sleeve | cable bundles |
| `rubber` | black rubber | soles, bumpers, pads, gaskets |
| `screen_face` | black display with no reflectance of its own (colour `#050505`, metalness 1, roughness 0.5), so the key light never washes it grey; emissive = face atlas | the `screen` mesh only |
| `screen_glass` | thin dark glass, transparent (opacity 0.06), roughness 0.18, clearcoat 0.3; bowed 2.5 mm so its highlight is a small streak | `screen_glass`, 1.5 mm in front of the display |
| `energy_core` | emissive `glow-band` (wide purple ends, dark red `#7a1015` body, a thin hot red line in the middle), strength 1 | `cell_core` (on `spine`); in the chest: the glow strip under the door gap, the capacitor caps and the power bus |
| `energy_rim` | purple `#8a4dff` emissive, strength 1.8 | rings at the cell ends, the LED in the chest recess, the hairline between the neck rings |
| `nullfield_glow` | emissive `glow-radial` (dark red `#6b0f12` body, a slightly brighter centre, no purple), 0.45 baked into the emissive factor (a faint red glow at rest) | emitter disc faces, 3 mm down in the housing behind a gunmetal grille |
| `nullfield_rim` | purple emissive, 0.3 baked into the emissive factor | ring around each disc |
| `nick_scratch` | alpha-tested scratches (bright metal, dark burr) | inside the chest panel door |

glTFast does not support `KHR_materials_emissive_strength`, so every strength up to 1 is baked into `emissiveFactor`
(`nullfield_glow` 0.45, `nullfield_rim` 0.3, `energy_core` 1). Only `energy_rim` (1.8) keeps the extension, because a
core glTF factor cannot go above 1: three.js and Blender read it, glTFast imports the rim at 1.0, and N1CK.cs
multiplies it back to 1.8 when it finds the imported factor at most 1.

**Edge wear and crevices are separate meshes.** Plates were split by curvature: `<part>` is the plate, `<part>_wear`
holds the worn pieces of its edges in `iron_wear`, and `<part>_inner` holds tight concave creases in `iron_inner`.
Edges wear in long irregular runs over roughly a third to a half of their length, most on top and front-facing edges
(shoulders, knuckles, toe caps, knee fronts) and almost never underneath. In the Unity copy they are sub-meshes of the
LOD mesh. Keep them together if you re-texture.

**Triangles.** 230,752 at LOD0: head 31.7k, torso 57.6k, arms 59.3k, legs 82.2k (including the hip stators on
`hips`). By material: iron_plate 59.6k, gunmetal 50.4k, rivets 30.4k, iron_plate_outer 24.4k, iron_wear 22.7k,
welds 14.1k, cables 10.6k, rubber 9.0k. Unity LOD1 61,596 (no "Nick" decal, glass or rivets; loose specks pruned),
LOD2 29,966 (no welds or cables either); LOD0/1/2 draw 18 / 15 / 13 sub-meshes. The root extras `unity.lod.protect`
keep `stainless_shroud`, `energy_core`, `energy_rim` and `nullfield_rim` at every LOD (simplified gently, never
pruned), and keep the gunmetal vertebrae on `chest` / `upper_chest` blocky instead of spiky at LOD2. There are no
zero-area triangles.

## Faces

The face is the `screen` mesh (child of `head`) with the `screen_face` material. Its emissive texture is the atlas
(`textures/face-atlas.png`): 4 columns × 4 rows of 256 × 192 px cells (4:3, the screen's shape), each a 32 × 24 grid
of warm off-white LEDs; the alert cells are red. Cell index = row × 4 + column from the top-left.

| | col 0 | col 1 | col 2 | col 3 |
| --- | --- | --- | --- | --- |
| row 0 | 0 `neutral` | 1 `neutral_blink` | 2 `happy` | 3 `happy_blink` |
| row 1 | 4 `worried` | 5 `worried_blink` | 6 `laughing_a` | 7 `laughing_b` |
| row 2 | 8 `sad` | 9 `sad_blink` | 10 `alert` | 11 `alert_blink` |
| row 3 | 12 `talk_a` | 13 `talk_b` | 14 `focus` | 15 `off` |

**Switching faces.** The atlas is stored upright in the .glb (the embedded image is identical to
`textures/face-atlas.png`), and the screen UVs cover cell 0, the top-left cell (u 0–0.25, v 0–0.25 in glTF UVs,
where v runs down the image). To show cell i (col = i % 4, row = floor(i / 4)), move the texture by whole cells,
nothing else:

- glTF / three.js (texture `flipY = false`): offset = (col / 4, row / 4).
- Unity with glTFast: glTFast flips V on the mesh and imports a PNG with identity scale and offset (a KTX texture
  comes in with scale (1, -1) and offset (0, 1)). Read the imported scale `s` and offset `o` once, then set offset =
  `o + (s.x * col / 4, -s.y * row / 4)`; for the PNG atlas that is (col / 4, -row / 4). Set it on every atlas property
  the material has: `emissiveTexture` and `baseColorTexture` on glTFast shaders (they read `<name>_ST` only with the
  `_TEXTURE_TRANSFORM` keyword on), `_EmissionMap` / `_BaseMap` / `_MainTex` on Standard or URP Lit (those move the
  emission map with the base map's tiling, so `_MainTex` / `_BaseMap` count even with no texture in them).
  `N1CK.SetFace` / `ShowCell` do all of this. The formula holds for either import, so do not hard-code the sign.
- The atlas texture in both .glb files carries an identity `KHR_texture_transform`, so glTFast creates
  `screen_face` with `_TEXTURE_TRANSFORM` already on and that shader variant is kept in player builds. If you import
  at runtime instead, include glTFast's shader variant collection in the build.
- To repaint faces, edit `face-atlas.png` (keep the 4 × 4 grid of 256 × 192 cells) and assign it as the material's
  emission texture; no UV or offset changes are needed. Keep every face at least 8 px (one LED) inside its cell: the
  outer ring of LEDs is always dark, so mipmaps never bleed one face into the next at range. If you still see bleed
  on a very small screen, turn off mipmaps on the atlas import (or use a LINEAR min filter).

**Blinks and expressions.** Each `*_blink` cell is its face with the eyes shut (about 0.12 s). `laughing` alternates
`laughing_a` / `laughing_b` at about 7 Hz; `talk` alternates `talk_a` / `talk_b`. A held expression blinks every
3.7 s in the viewer and every 2.6 to 5 s in N1CK.cs.

**Alarm tint.** Multiply the screen's emissive colour toward dark red `#d8141a` by a 0..1 tint (keep the HDR
strength). The viewer also turns the small screen light red. The alert cells are already red, so they read without
the tint.

**Face channel.** `face_ctrl.position` is keyed in every clip with STEP interpolation: x = cell index, y = alarm
tint 0..1, z = Nullfield emitter glow 0..1. In Unity, glTFast negates x, so read `|x|`. Do not read it while two
clips crossfade (the index blends into a wrong cell); N1CK.cs uses the per-clip timelines below instead and only
falls back to `face_ctrl` for clips it does not know.

## Clips

All clips are sampled at 30 fps from pose functions in `viewer.html` (`ANIM.CLIPS`). They key every bone's rotation,
`hips` position, the piston nodes and `face_ctrl`. Legs are solved with IK against planted feet: soles stay on y 0, a
planted foot never moves, and steps (the hop and step back in `alert`) leave and land vertically. `walk`'s stance
foot moves back at exactly the walk speed (that is the in-place walk, not sliding). **No clip has root motion.** Every one-shot starts and ends exactly on `idle` at 0 s, and the loops match at
both ends, so 0.3 s crossfades are clean.

| Clip | Length | Loop | Content | Face timeline (s → cell) | Tint / field |
| --- | --- | --- | --- | --- | --- |
| `idle` | 4.0 | loop | contrapposto: weight on the left leg (pelvis high on that side, left knee nearly straight), right foot 6 cm forward and 4 cm out with a soft knee, chest counter-turned, head tilted; one breath, a slow weight settle, a look round at 2.2–2.9 s (the neck leads), fingers fidget out of step | 0 neutral; blinks at 1.3, 3.25, 3.5 | |
| `walk` | 1.1 | loop | one cycle in place: heel strike, flat foot, toe-off, swing; pelvis bob, sway, twist; arms swing opposite | 0 happy; blink at 0.621 | |
| `talk_gesture` | 4.0 | loop | gestures in front of the chest (hands at y 1.05–1.3): palms-up offer, a right-hand beat with a wrist flick, an index point, a two-hand frame, left palm on the chest ("me"), open-hand chops, settle; the upper chest turns up to 8° toward the gesturing hand, the chest leans in up to 6° on the points, the shoulders lift 5–8° on the beats, nods | flaps between neutral, talk_a, talk_b; happy at 1.421–1.863 and 3.45–3.85 (blinks 1.5, 3.6) | |
| `wave` | 2.4 | once | weight shifts 2.5 cm onto the left leg; right arm up and out (elbow above the shoulder, palm about 7 cm above the head top and fingertips about 20 cm, 25–35 cm out, clear of it), three waves from the elbow with the wrist trailing 0.08 s, head tilted up to 18° toward the hand, the left arm easy and a little forward, back down | 0 neutral, 0.121 happy, 0.85–1.35 happy squint (`happy_blink` held), blink 1.95, 2.25 neutral | |
| `laugh` | 2.0 | once | inhale, leans back with the head thrown back, then folds forward (about 11° in each of spine and chest), left hand flat on the belly (thumb along it), slaps the right thigh twice; the shoulders bounce ±5° at 3.5 Hz, in step with the laughing_a / _b flips | 0 neutral, 0.1 happy, 0.3–1.621 laughing_a/b alternating every ~0.143, then happy (blink 1.721), 1.95 neutral | |
| `sad` | 3.0 | once | a slump through the whole spine (about 9–10° in each of spine, chest and upper chest, about 26° in all), up to about 32° in the neck and head, shoulders dropped 10–15° and rolled forward, hips 2 cm lower with soft knees; arms heavy, wrists turned in, slow sigh and head shake, the right hand closes into a loose fist and lets go | 0 neutral, 0.15 sad (blinks 0.9, 2.15, 0.2 s long), 2.75 neutral | |
| `worried` | 2.6 | once | hunched (upper chest forward 6°), shoulders up 7–10°, hands wringing in front of the chest: palms facing about 6 cm apart, sliding past each other, thumbs and index fingers rubbing out of step; glances left and right | 0 neutral, 0.121 worried (blinks 0.662, 1.421, 2.021), 2.45 neutral | |
| `alert` | 1.6 | once | startled hop into a wider ready stance, hands up, looks left and right | 0 neutral, 0.05 alert (blink 0.621), 1.4 neutral | tint 0 → 0.8 by 0.12 s, held, back to 0 by 1.6 |
| `nullfield_activate` | 1.8 | once | braces in the knees (feet stay planted), fists close, rolls the shoulders well back (about 15°) to bare the emitters, chest out, chin up, both fists planted on the hips (placed in the pelvis frame, so the two sides match), trembles | 0 neutral, 0.121 focus, 1.621 neutral | field 0 until 0.45, peak 1 at 0.9, 0.6 by 1.45 |

The exact resolved timelines (every key, blinks included) are in the root extras `clips.<name>.faces`, with
`tint` / `field` sampled every 0.1 s. `walk` also carries `root_speed_mps: 1.3`: the planted foot moves back at
exactly 1.3 m/s, so move the character's root forward at 1.3 m/s while it plays (scale the clip speed with the
movement speed for other speeds). After a clip's tint or field ends, fade it out over about 0.4 s rather than cutting
it (the viewer and N1CK.cs do).

## Glows

- **Emitters** (`nullfield_glow` + `nullfield_rim`, under `emitter_l` / `emitter_r`): a faint dark red glow at rest
  (0.45 / 0.3 in the exported emissive factors). To flare, scale the emission: disc × (1 + 4.5 f · pulse), rim ×
  (1 + 4 f · pulse), with f = 0..1 and pulse = 0.85 + 0.15 sin(9 t). The disc texture has no white and no purple, so
  the flare reads as a hotter red; the purple stays on the rim.
- **Power cell** (`energy_core`, under `spine`, centre (0, 1.15, -0.105)): breathe it at × (0.92 + 0.08 sin(2.1 t)).
  Only `energy_core` breathes (N1CK.cs `cellGlow`; the chest's door-gap strip and capacitor caps share it and
  breathe with it); `energy_rim` is shared with the chest LED and the neck hairline and stays as exported.
  The shroud (`cell_shroud`, stainless) is not emissive.
- The viewer adds two small point lights that follow the bones (a warm one under the chin, a short-range red one
  inside the cell). They are not in the .glb; add your own if you want spill.

## Chest panel and "Nick"

`chest_panel` (under `upper_chest`, at (0.0287, 0.0475, 0.1319) from it) is the hinged door over his heart. It is
shut in the file and in every clip. To open it, rotate it about its hinge (the door's medial edge) by up to 106°:
glTF local rotation = axis (0.0001, -0.9812, 0.1932), angle u × 106°, u = 0 shut to 1 open; in Unity
`localRotation = Quaternion.AngleAxis(u * 106f, new Vector3(0.0001f, 0.9812f, -0.1932f))`. "Nick" is on the inside of
the door (its inside face is plain dark `iron_inner`), readable when open; behind it is a recess with a small finned
module on two screws, its leads into the frame and a clip on one of them, three capacitors with dark red caps, a purple
LED, a faint red power bus along the bottom and a dark red glow strip round the floor under the door gap (it is what
leaks round the shut door). The viewer's chest view camera is at (0.368, 1.453, 0.368) looking at (0.080, 1.389,
0.148).

## Unity setup

1. Install glTFast (`com.unity.cloud.gltfast`). Copy `unity/n1ck.glb` into Assets. In its import settings set
   **Animation: Legacy** (N1CK.cs plays his clips through the Animation component). Unity 2021 LTS to Unity 6. The
   body imports as three SkinnedMeshRenderers (`body_LOD0/1/2`), each one renderer with one sub-mesh per material and
   `rootBone` = `hips`. glTFast's default **Skin Update When Offscreen** keeps every LOD skinning even when culled;
   for performance untick it and give each `body_LOD` renderer fixed `localBounds` that cover the clips, for example
   centre (0, -0.05, 0) and size (2.0, 2.0, 1.3) in `hips` space.
2. Keep `../../unity/Editor/GunmodlsPrefabBuilder.cs` in an Editor folder, select the .glb and run
   **Tools > Gunmodls > Build Prefabs From Selection**: it adds a LODGroup from the `_LOD0/1/2` renderers and turns
   every `_COL` node into a BoxCollider (one per body bone, they follow the animation). Add a kinematic Rigidbody to
   the root.
3. Add `N1CK` (from `unity/Runtime/N1CK.cs`) to the prefab root (the object with the Animation component, or a parent
   of it). Give the same object a `NullfieldCarrier` so Nullfield sensors and feed cameras ignore him. It lives in
   `unity/Runtime/Nullfield.cs` next to other classes, and Unity's Inspector only offers a MonoBehaviour whose file
   has its name, so add it in code (`gameObject.AddComponent<NullfieldCarrier>()`, for example from a small bootstrap
   script on the prefab), or move the class into its own `NullfieldCarrier.cs`.
4. Move him with your character controller; play `walk` while moving and move the root at `N1CK.WalkSpeed` (1.3 m/s)
   times the clip speed.

**N1CK.cs reference.**

| Member | What it does |
| --- | --- |
| `Play(clip, fade = 0.3)` | Crossfades to a clip. Loops (`idle`, `walk`, `talk_gesture`) keep going; one-shots crossfade back to `idle` when they end. Sets `playAutomatically = false` and the wrap modes (Loop / ClampForever) in Awake. |
| `SetFace(name)` | Holds an expression (`neutral`, `happy`, `worried`, `laughing`, `sad`, `alert`, `talk`, `focus`, `off`) or a cell name; it blinks now and then. `SetFace(null)` gives the face back to the playing clip's timeline. |
| `Blink()` | One blink now (when the current face has a `_blink` cell). |
| `ShowCell(index, tint)` | Shows one atlas cell immediately (the next Update applies the clip / expression again). |
| `Alarm(bool)` | Screen tint toward `alarmColor` (`#d8141a`), eased in and out. The `alert` clip adds its own tint. |
| `Nullfield(bool)` | Emitter discs flare (pulse included; disc × 1 + 4.5 f, rim × 1 + 4 f). `nullfield_activate` adds its own flare. |
| `cellGlow` | Power-cell (`energy_core`) brightness multiplier (1 = as exported). |
| `startClip`, `defaultFade`, `alarmColor` | Inspector settings. |
| `CurrentClip`, `CurrentFace`, `AlarmOn`, `NullfieldOn`, `Cells`, `CellIndex(name)`, `WalkSpeed` | Read-only helpers. |

It makes one material instance for each of `screen_face`, `nullfield_glow`, `nullfield_rim`, `energy_core` and
`energy_rim` and shares it across every renderer and LOD that used it (skinned or not), sets `emissiveFactor`
(glTFast) and `_EmissionColor` (Standard / URP), and enables `_EMISSIVE` / `_EMISSION`. Its `EmissiveStrength` table
puts back the strength glTFast drops (`energy_rim` × 1.8) when the imported factor is still at most 1. Face timelines and tint / field keys are tables in the script (copied from
the extras); if you add a clip, add its row there.

**Humanoid (retargeting other animation).** His own clips are generic legacy clips. To drive him with humanoid
animation (mocap, Mixamo, Starter Assets), import the .glb with Animation set to Mecanim or None, select the model (or
an instance) and run **Tools > Gunmodls > N1CK > Build Humanoid Avatar** (`unity/Editor/N1CKAvatarBuilder.cs`). It maps
the bones by name (table above), uses the file's T-pose as the rest pose, saves `<model>_Avatar.asset` next to the
model and, for a scene instance, adds an Animator with it. Use either the Animator (humanoid) or the legacy Animation
on one instance, not both. With humanoid animation N1CK.cs still does faces, alarm, emitters and cell glow (call
`SetFace` yourself, since humanoid clips carry no face timeline), but the pistons are not driven (see Rig). The
fingers map to Unity's finger bones; the thumb's first bone is the metacarpal.

## Rebuilding

`viewer.html` is the source. It is a standalone build (all sources inlined) of the scratch project the model was
made in, so **a future session edits `operators/n1ck/viewer.html` directly** and re-exports:

```
node tools/export-glb.js operators/n1ck/viewer.html        # n1ck.glb (about 1.5–2 min in software rendering)
node tools/unity-export.js operators/n1ck/n1ck.glb         # unity/n1ck.glb (skinned LODs, about 10 s)
node tools/render-preview.js operators/n1ck/viewer.html    # preview.png
node tools/check-glb.js operators/n1ck/n1ck.glb operators/n1ck/unity/n1ck.glb
```

`textures/` is written from the page with `window.__model.faceAtlasPNG()` (atlas) and
`window.__model.textureSheets()` (every map, PNG base64 by texture name): open the viewer with
`tools/lib/open-viewer.js`, call both and write `face-atlas.png` and `<name with dashes>.png`.

Where things live in `viewer.html` (search for these lines):

| Section | Search for | What is there |
| --- | --- | --- |
| proportions, joints, humanoid map | `- proportions */` and `const HUMAN` | `J`, `D` (body envelope, head, screen, cell, emitter numbers) |
| procedural textures | `function ironMaps` (then `wearMaps`, `innerMaps`, `gunmetalMaps`, `stainlessMaps`, `weldMaps`, `braidMaps`, `rubberMaps`, `glowRadial`, `glowBand`) | every texture is drawn here (`facetField` makes the hammer facets, `addPeen` the peen marks) |
| face atlas | `- face atlas */` | `FACES`, layout; the head part redraws the LEDs (`function drawAtlas` in `PARTS.head`) |
| materials | `function buildMaterials` | the 18 materials (`M.iron`, `M.plate`, `M.screen`, ...) |
| wear rule and split | `function edgeWear`, `function wearSplit` | the shared edge-wear rule; curvature split into `_wear` / `_inner` meshes |
| rig, loader | `- rig */`, `- kit and part loader */` | bones, `K.add` / `K.addW`, pistons, the per-region try/catch loader |
| faces at runtime | `function setFace` | atlas offset, alarm tint, `face_ctrl` |
| head | `PARTS.head = function` | housing, bezel, screen (`screen` mesh), ears, neck rings and cables |
| torso | `PARTS.torso = function` | pelvis, plates, back, power cell + shroud, emitters, chest panel + "Nick" |
| arms | `PARTS.arms = function` | shoulders, arms, elbow actuators and pistons, hands, fingers |
| legs | `PARTS.legs = function` | hip actuators, thighs, knees, shins, boots |
| animation | `const ANIM = (() =>` | IK, pose library (`HANDS`, `hand()`), every clip with its face keys and blink times |
| scene, lights, UI, export | `- scene: a dark concrete bay`, `- export */` | `exportScenes` (extras, including the `unity` settings), `exportGLB` (welds meshes for the file, names the root and scene, adds the atlas texture transform), `preview` |

Rules the parts follow: use only the shared materials in `M` (each new material costs seconds of shader compile in
software rendering and a draw call in game), keep wear in textures and the mesh split (never vertex colours), keep the
only writing the "Nick" decal, and keep the build under about 20 s (the page loads in about 18 s headless).

## Known limits

- 231k triangles at LOD0 is above the 150k budget the parts were planned for; most of it is rivets (smooth 12-sided
  domes), welds, small machined parts and plate bevels kept for close-ups. LOD1 (61.6k) and LOD2 (30.0k) are
  generated and drop the small parts; they cannot shrink much further because the worn-edge pieces are many small
  separate strips.
- Rigid parts: at the extremes of the joint ranges some plates overlap (calf into thigh past ~140° knee bend, thigh
  into pelvis past ~110° hip bend, deltoid into the spaulder with the arm far overhead, the forearm's clevis into the
  elbow hub and the upper arm's leads from about 80°, mostly hidden inside the hub, the thumb metacarpal into the
  thenar housing in a tight fist). In the clips the only contacts left between parts that are not neighbours are
  small and hidden: the relaxed thumb's proximal segment sits up to 9 mm into the palm's thenar block, the thumb
  root about 4.5 mm into the forearm cuff in two `talk_gesture` gestures, the chest door edge up to 3 mm into the
  rib plates when the chest twists, the thumb tips touching (4 mm) as the hands meet in `worried`, and a thumb tip
  brushing the thigh plate (up to 8 mm) as the fists leave the hips in `nullfield_activate`.
- Pistons only follow the joints through the clips (or code that aims them); humanoid retargeting does not.
