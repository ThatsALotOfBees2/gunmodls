# N1CK: integration guide

For anyone (or any session) putting N1CK into the game or changing him. `viewer.html` is the reference and the
source; `../../unity/Runtime/N1CK.cs` is a working Unity driver.

Units are metres and degrees unless a line says otherwise. Positions are in glTF space unless a line says Unity.
glTFast negates X on import: glTF +X is Unity -X, rotations about X stay the same, and rotations about Y and Z flip
sign (a glTF quaternion (x, y, z, w) becomes (x, -y, -z, w)). He faces +Z in both; his left is glTF +X, Unity -X.

## What he is

A playable operator, 1.85 m tall (top of the head): an agile, athletic soldier-robot with a clear V-taper. His
shoulders measure about 0.51 m across the pauldrons, his chest about 0.375 m across the pec plates just under the
armpits, his waist about 0.22 m across the oblique plates (an exposed core 0.17 m wide), and his limbs are long and
slim.

- **Armour.** Sleek, angular hard-surface plates: a few big planar facets, crisp 45° chamfers on every edge, layered
  plates (each pec is a clavicle plate lapping over the main plate, with a lower plate flaring under the armpit; the
  pecs sit over the rib plates, the rib plates over the obliques, proximal plates over distal ones), tight panel
  gaps and recessed panel lines. The knee cap is a three-plane wedge under a lapping lip plate, the pelvis front a
  layered fauld (a keeled centre plate over two side plates angled back), and the limb shells are asymmetric
  sections of a few broad planes. Small flush hex screws sit at a few plate corners. There are no welds, rivets or
  forged textures.
- **Under-structure.** A slim, dark, near-dielectric satin frame shows at every gap (it recedes behind the paint): the ab stack and spine column at the waist, cable
  bundles, two small pistons from the pelvis to the chest, the neck rings, the palms and finger segments, and the
  exposed actuators at the shoulders, elbows, wrists, hips, knees and ankles. Each hip is a machined ball (smooth,
  with an equator groove) seated in a faceted painted socket cup on the pelvis; side guards cover the knee hubs; a
  faceted cuff on the shin wraps the ankle above the boot.
- **Paint.** Clean matte paint in two tones, grouped by value so he reads at range from the front and the back.
  Dark slate `#3c3f44` covers most plates. Warm light grey `#8a8781` is on the pec plates (with the outside of the
  chest door), the upper thigh front plates, the forearm top plates, the shin front plates, the two scapula plates on
  his back and the head housing (with its rear panel), so the light head frames the dark screen and the chest links
  to the shins through the thighs. Wear is light: a few clusters of 3–8 mm chips on exposed edges and plate corners
  through a thin primer ring to dull grey metal, faint scuffs, and a little grime in panel lines. Polished chrome is only
  on the piston rods.
- **Tactical gear.** A duty belt, a chest harness and a drop-leg rig (see Gear).
- **Head.** A light rounded-rectangle housing (0.18 × 0.232 × 0.198, corner radius 0.044), bevelled at the brow,
  chin and back, with a panel seam all round. On it sit a light crown plate, light side panels and a light raised
  rear panel, with a small louvred vent low on the back below it (the back of the head is light, so it never reads
  as a second face). A dark faceted chin plate sits on the chin bevel under the bezel. The dark bezel stands 3 mm
  proud and has no chips; the LED screen sits 12 mm behind it, inside
  a metal trim ring, behind a thin bowed glass pane. His left ear is a louvred speaker; his right ear is a perforated
  microphone dome with a stub antenna. The neck is about 0.10 m wide: two wide 12-sided rings and a small one, a
  purple hairline in the ring gap, braided cables and two small pistons, under a 0.10 m head-base disc.
- **Back.** Two Nullfield emitter pods sit on the light scapula plates: a dark housing, an angular painted bezel, a
  red lens recessed 3 mm behind 9 thin radial blades round a small hub (an aperture), and a purple rim. Low on his
  back, between stepped lower-back plates and inside a raised lip on the lumbar plates, the Veinite power cell glows
  dark red with purple end rings inside a bright brushed **stainless** cage (hexagonal collars, six wide staves
  brushed along their length, low six-faceted end caps). That cage is the one bright metal on him (lore: stainless
  blocks Veinite's hivemind effect).
- **Front glows.** The energy shows only as a thin dark red line deep in the bottom gap of the shut chest door and
  the purple hairline in the neck.
- **Chest door.** It sits 1.5 mm below the pec face in a recessed frame, on a 3-knuckle barrel hinge on its medial
  edge, with a finger notch and a small dark catch on its lateral edge.

His gadget, the Nullfield, is a separate model (`gadgets/nullfield`); this model only carries the two emitters it
glows through.

The only writing on him is "Nick", scratched in a child's hand on the inside of the chest panel door (hidden when it is
shut). There are no other markings, numbers or logos.

## Files

| File | What it is |
| --- | --- |
| `n1ck.glb` | The source export: rig at rest, 513 meshes on their bones (gear meshes named `gear_*`), 19 materials with embedded maps, 9 clips, extras on the root node. 16.2 MB. |
| `unity/n1ck.glb` | Game copy from `tools/unity-export.js` (skinned mode, set by the root extras `unity`): one skinned mesh per LOD, `body_LOD0/1/2` under the root (skin root `hips`), `<bone>_COL` box colliders, same clips and materials. 23.7 MB. |
| `textures/face-atlas.png` | The expression atlas, 1024 × 768 (the same image is the `screen_face` emissive texture in the .glb). |
| `textures/*.png` | Every other texture, one file per map: `<family>-albedo`, `-normal`, `-orm` for `paint` (shared by both paint tones), `chip` (plus `chip-light-albedo` for the light paint's chipped edges), `under`, `stainless` (also the chrome), `braid`, `rubber`, `webbing`, `fabric` (pouch fabric), `polymer`; `glow-band` (cell), `glow-radial` (emitter lenses), `nick-scratch`. Each sheet is stored in the same orientation as the image embedded in the .glb, so it is a drop-in replacement with the glTF UVs (v runs down the image). |
| `preview.png` | Hero still (mid-wave, happy, low angle from his right front). |
| `viewer.html` | The viewer and the full procedural source (see Rebuilding). |
| `../../unity/Runtime/N1CK.cs` | Unity driver: faces, blinks, alarm tint, emitter flare, cell glow, clip playback with crossfades and face timelines. |
| `../../unity/Editor/N1CKAvatarBuilder.cs` | Editor menu that builds a Humanoid Avatar from the bone names. |
| `../../unity/Runtime/Nullfield.cs` | Built separately. Its `NullfieldCarrier` component goes on N1CK. |

## Rig

Bones are plain nodes. In `n1ck.glb` every mesh is a child of exactly one bone and moves rigidly with it. The joints
are designed so bending reads without deformation: actuator drums and hubs centred on the pivots, pistons, and shells
kept back from the pivots. In `unity/n1ck.glb` the same parts are merged into one skinned mesh per LOD, each vertex
weighted 100% to the node it hung on (so it still moves rigidly, but a LOD is one renderer).

The joints of that skin are the 75 nodes that carry geometry: the bones below plus the 20 piston nodes,
`chest_panel` and `emitter_l/r`. The first joint and the skin's `skeleton` is `hips` (the common root), so glTFast sets
`SkinnedMeshRenderer.rootBone` to `hips`.

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
│  │                    ├─ chest_panel   hinged door on his left pec ("Nick" inside)
│  │                    └─ emitter_l, emitter_r   Nullfield emitters (local +Z points out of the lens)
│  ├─ upper_leg_l ─ lower_leg_l ─ foot_l ─ toes_l
│  └─ upper_leg_r … (mirror)
└─ face_ctrl   (no mesh: the face channel, see Faces)
```

Each piston has two nodes: `pist_<name>_a` (the body, on the first bone) and `pist_<name>_b` (the rod, on the
second). The pistons are:

- `elbow_l/r` (upper_arm → lower_arm)
- `knee_l/r` (upper_leg → lower_leg)
- `heel_l/r` (lower_leg → foot)
- `abd_l/r` (hips → chest; the two small pistons at the front of the waist)
- `neck_l/r` (neck → head; each `_b` also carries a longer chrome rod, `pist_neck_*_rod_ext`, so the rod never pulls
  out of its body)

Their rotations are keyed in every clip, so they track the joints in any player that plays the clips. If you pose the
bones yourself (IK, ragdoll, Humanoid retargeting), aim the pistons every frame: point each `_a` node's local +Y at
its `_b` node, and each `_b` node's +Y at its `_a` node. In Unity that is `transform.up`, which glTFast's X flip does
not change. For example:

```csharp
a.localRotation = Quaternion.FromToRotation(Vector3.up, a.parent.InverseTransformDirection(b.position - a.position));
```

If you don't, the pistons will be slightly misaligned.

**Rest pose.** T-pose: arms straight out along ±X, palms down (-Y), thumbs forward (+Z), legs straight, feet
forward. Every bone has identity rotation at rest, so a bone's local axes are the world axes. The soles are at y 0.
The pauldrons hang on `upper_arm_*` and are shaped for the arm hanging at his side, so in the T-pose they tip up with
the arm.

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

Fingers (left knuckles):

| finger | position (x, y, z) |
| --- | --- |
| thumb | 0.774, 1.458, -0.003 |
| index | 0.844, 1.473, 0.003 |
| middle | 0.848, 1.474, -0.017 |
| ring | 0.844, 1.472, -0.037 |
| pinky | 0.836, 1.468, -0.056 |

The full table, with every finger joint, is in the root extras (`joints`).

**Axes for posing** (left side and spine in glTF; mirror for the right):

| bone | axes |
| --- | --- |
| spine, neck, head | +X bends forward / nods down, +Y turns to his left, +Z tilts toward his right |
| upper_arm | Z- lowers the arm (-74° hangs it at the side), then X- swings it forward, Y+ turns the palm forward |
| lower_arm | Y- bends the elbow |
| hand | Z- flexes toward the palm |
| upper_leg | X- swings forward, Z+ out to the side |
| lower_leg | X+ bends the knee |
| foot | X+ points the toes down |
| toes | X- bends them up |

**Supported ranges.** The rig takes the full range; the right-hand column is where rigid parts and gear stay clean
(no part more than 3 mm inside another; measured with both legs or both arms posed, knees at 100° for the hip rows):

| joint | rig range | clean with gear |
| --- | --- | --- |
| elbow | 0–145° | the elbow drum sits in its fork by design |
| knee | 0–140° | to about 125° (the calf then meets the back of the thigh) |
| hip flexion / extension | -30° to +110° | flexion to 85° (about 5 mm at 90°, 9 mm at 100°, 27 mm at 110°: the thigh reaches the belt and its pouches); extension to 30° |
| hip abduction | ±45° | to 20° (5 mm at 25°; at 45° the hip cap goes 15 mm into the pelvis) |
| shoulder raise (upper_arm Z) | -80° to +80° | to 30° (5.6 mm at 45°, 9.6 mm at 60°, 13.4 mm overhead: the upper arm meets the collar and pec plates) |
| wrist | ±70° flex, ±25° side to side | |
| fingers | 0–100° per joint | |
| neck and head | ±40° nod, ±60° turn, ±25° tilt | |
| spine chain | ±25° bend, ±30° twist | |

For a Siege-style crouch, keep hip flexion near 80° and let the knees and the spine take the rest; a deeper crouch
pushes the thighs into the belt (see Known limits).

**Humanoid map** (also in the extras as `humanoid`):

| bone | Unity human bone |
| --- | --- |
| `hips`, `spine`, `chest`, `upper_chest`, `neck`, `head` | Hips, Spine, Chest, UpperChest, Neck, Head |
| `shoulder_l`, `upper_arm_l`, `lower_arm_l`, `hand_l` | LeftShoulder, LeftUpperArm, LeftLowerArm, LeftHand |
| `upper_leg_l`, `lower_leg_l`, `foot_l`, `toes_l` | LeftUpperLeg, LeftLowerLeg, LeftFoot, LeftToes |
| `<finger>_1/2/3_l` | "Left <Finger> Proximal / Intermediate / Distal" |

`pinky` maps to Little, and `thumb_1` is Thumb Proximal (the metacarpal). The right side is the same with `_r` /
Right.

**Hit boxes.** `unity/n1ck.glb` has 20 `<bone>_COL` boxes. `GunmodlsPrefabBuilder` turns them into BoxColliders on
their bones, so they follow the animation:

- `head`, `neck`, `upper_chest`, `chest`, `spine`, `hips`;
- per side: `upper_arm`, `lower_arm`, `hand` (the box takes in the fingers at rest), `upper_leg`, `lower_leg`,
  `foot`, `toes`.

Pistons, emitters, the chest panel, the finger bones and the `shoulder_*` bones (they carry only the thin yoke strip;
the `upper_chest` and `upper_arm` boxes cover it) have none. Each box fits everything on its bone, gear
included: the `hips` box takes in the belt pouches, and `upper_leg_r` takes in the drop-leg panel (about 4 cm wider
than the left thigh's box).

Map a hit to a body part by the box name:

| box | body part |
| --- | --- |
| `head`, `neck` | head |
| `upper_chest`, `chest`, `spine`, `hips` | torso |
| `upper_arm`, `lower_arm`, `hand` | arm |
| `upper_leg`, `lower_leg`, `foot`, `toes` | leg |

Put a kinematic Rigidbody on the root so the moving colliders are cheap.

## Gear

The gear is ordinary geometry on the body bones (meshes named `gear_*` in `n1ck.glb`, merged into the LOD meshes in
`unity/n1ck.glb`), so it moves with him and has no extra nodes. Straps and loops are `webbing`, the pouch bodies,
lids and flaps are `pouch_fabric` (a fine weave), buckles, sliders, tabs and the zip are `gear_polymer`, and the
D-rings, zip slider and screws are `under_structure`. Every strap sits about 0.6 mm off the armour.

| Item | Bone | Where and what |
| --- | --- | --- |
| duty belt | `hips` | 50 mm, round the pelvis at y ≈ 1.036. Side-release buckle 34 mm right of centre (a female body with a keeled top, a dished thumb rest and side windows; the male's tapered prongs latched in the windows and a centre guide rail; curved to the belt, the webbing wrapped round both bars), its free end folded back through a keeper. MOLLE loop rows along his left side and the back (none on the front, and none on his right side, where the gap between the utility pouch and the drop-leg hanger is too short for a row). A D-ring on a tab at the left rear. The webbing and pouch fabric are near-black, so the gear reads as a dark band against the slate paint at range. |
| magazine pouches ×2 | `hips` | 56 × 80 × 30 mm on his left: one in front of the hip (about 70° round from the buckle), one behind the hip actuator, so the thigh clears them in a crouch to about 85° of hip flexion and the hip cap clears them with the leg out to 20°. Each has a flap with a pull tab. |
| utility pouch | `hips` | Right rear of the belt. A stiff, boxy body with piping on its front edges; a clamshell zip that arcs over the lid, with a slider; a strap across its face and a grab loop. |
| drop-leg bracket | `hips` | A screwed polymer bracket down from the belt to the drop-leg swivel. |
| chest band | `chest` | 38 mm round the chest at y ≈ 1.27. Side-release buckle (as on the belt) just right of the keel, the tail held by an elastic keeper. |
| shoulder straps, lower | `chest` | From the band up to the ladder locks; the back strap's lower part. |
| shoulder straps, upper | `upper_chest` | 30 mm, from the ladder locks on the pec's lower edge (y ≈ 1.36) over the shoulders, clear of the chest door, the collar ring and the yokes. They bridge the step onto the clavicle plates in a straight run, like tensioned webbing. Daisy loops on the flat of the pec (ends sewn flat); a D-ring on the left strap; a small radio pouch (52 × 70 × 24 mm) on the right strap, over the pec. |
| back yoke and strap | `upper_chest` | The straps run inside the emitter pods to a polymer yoke plate at y ≈ 1.41; a strap runs from it down to the band through a tri-glide. Its lower part (on `chest`) rides on the lower back plates and bridges the spine channel. |
| drop-leg rig | `upper_leg_r` | A curved panel on the outer right thigh (centre y ≈ 0.765) with edge binding, three MOLLE rows and a magazine pouch. Two leg straps (y ≈ 0.80 and 0.69) with front-outer side-release buckles; the lower tail is held with a cable tie. The hanger is a polymer swivel on the right hip actuator's hub, which turns on the hip's flexion axis, so the rig never pulls apart; a ladder-lock strap runs from the swivel down to the panel. |

Triangles: hips 7.3k, chest 3.4k, upper_chest 4.7k, upper_leg_r 7.4k (22.8k in all, 55 meshes). To hide the gear
in `n1ck.glb`, disable the `gear_*` renderers. In `unity/n1ck.glb` it is part of the LOD meshes: hide the `webbing`,
`pouch_fabric` and `gear_polymer` sub-meshes for most of it (the D-rings and screws share `under_structure` with the
body).

## Materials and textures

All PBR metal/roughness. Textured materials carry three maps: albedo (sRGB, JPEG in the .glb), normal, and ORM
(G roughness, B metalness; R is 1, there is no baked AO). The material factors multiply the maps.

UVs on plates and shells are in metres divided by the material's tile size (paint repeats every 0.30 m), so the maps
tile and stay seamless across bends. Webbing UVs run u 0–1 across the strap (so the stitch rows land near both edges)
and v in metres / 0.1 along it; pouch fabric is metric at 0.04 m. The screen, lenses, cell core and decal have their
own UVs.

No vertex colours are used anywhere: wear lives in the textures and in the mesh split below.

| Material | Look | Where |
| --- | --- | --- |
| `armor_paint` | matte two-pack paint, colour factor `#3c3f44` (dark slate) over a neutral paint texture: faint orange peel in the normal map, a slow ±4% value drift, faint scuff patches (a touch lighter and glossier); metalness 0 | most armour: pelvis (girdle, fauld) and the hip socket cups, obliques, rib and lat plates, lower back plates, collar, yokes, pauldrons, upper arm and forearm shells, back of the hands and knuckle guards, finger plates, the lower thigh front plates and the other thigh plates, knee caps and guards, ankle cuffs, calves and shin side plates, boots, the bezel, chin plate and ear plates |
| `armor_paint_light` | the same maps with colour factor `#8a8781` (warm light grey) | pec plates (clavicle, main and lower plates) and the outside of the chest door, upper thigh front plates, forearm top plates, shin front plates, scapula plates, head housing, crown, side and rear plates |
| `armor_chipped` / `armor_chipped_light` | the paint (dark / light) baked in, with 3–8 mm irregular chips in clusters (few loose specks), ragged outlines, a thin primer ring (about 0.3 grey on the dark paint; lighter, cooler and narrower on the light paint, so its chips read grey, not brown) and a burnished halo, through to dull grey bare metal (about 0.53 / 0.52 / 0.50, roughness about 0.45) with fine scratches; metalness from the ORM (metal only inside the chips) | worn edge strips (see below) |
| `under_structure` | dark satin anodized alloy, neutral-cool and nearly dielectric (about 0.11 / 0.118 / 0.13 sRGB, metalness about 0.15, roughness about 0.68, environment 0.5), so the frame recedes behind the paint; faint short machining streaks, a few faint scratches, a little dark grime in patches | frame, actuators, hip balls, ab stack, spine column, neck rings, palms and finger cores, emitter housings and blades, cell mount, panel-gap backs and groove floors, screws, the inside of the chest door; the gear's D-rings and zip slider |
| `piston_chrome` | polished rods (the stainless maps at 0.1 m, colour `#70747b`, roughness 0.24, environment 0.4: a thin highlight, never a glow) | piston rods only |
| `stainless_shroud` | bright satin brushed stainless (roughness about 0.4), brushed along U: along each stave's length and round the collars; the faceted end caps sample the texture's roughest patch, so they never mirror a light to white | only the power-cell cage |
| `cable_braid` | braided sleeve (0.02 m tile) | cable bundles |
| `rubber` | matte black rubber | boot soles (one 22 mm block with tread, lugs along the sides and a little toe spring), hand and finger pads |
| `webbing` | near-black nylon (about 0.14 under a `#8c8c8c` colour factor, environment 0.4): warp ribs with a fine twill, a lock-stitch row 6.5% in from each edge (thread a touch lighter and glossier), darker bound edges | straps, belt, buckle loops, pouch tapes and loops, drop-leg panel |
| `pouch_fabric` | near-black fine plain weave (Cordura-like, about 0.13 under a `#8c8c8c` colour factor, environment 0.4, threads about 1 mm apart at a 0.04 m tile), no ribs or stitch rows | pouch bodies, lids, flaps and piping |
| `gear_polymer` | black moulded polymer (about 0.11), fine stipple, satin-matte | buckles, ladder locks, tri-glides, keepers, yoke plate, pouch tabs, zip chain, drop-leg swivel and bracket |
| `screen_face` | black display with no reflectance of its own (colour `#050505`, metalness 1, roughness 0.5, no environment), so the key light never washes it grey, even when he looks up; emissive = face atlas | the `screen` mesh only |
| `screen_glass` | thin dark glass, transparent (opacity 0.06), roughness 0.1, specular 0.25 (`KHR_materials_specular`; importers without it use the default), no clearcoat, slightly bowed | `screen_glass`, 1.6 mm in front of the display |
| `energy_core` | emissive `glow-band` (purple ends, dark red `#6b0f12` body, a thin hotter red `#a01c22` line in the middle), strength 1 | `cell_core` (on `spine`); in the chest: the glow strip deep in the door's bottom gap (`chest_gap_leak`, dark red part of the band) and the capacitor caps (`chest_capacitor_glow`) |
| `energy_rim` | purple `#8a4dff` emissive, strength 1.8 | the rings at the cell ends, the hairline between the neck rings (`neck_glow`) |
| `nullfield_glow` | emissive `glow-radial` (dark red `#6b0f12` body, a slightly brighter centre, no purple), 0.45 baked into the emissive factor (a faint red glow at rest) | emitter lenses, recessed behind the blades |
| `nullfield_rim` | purple emissive, 0.3 baked into the emissive factor | ring round each emitter lens |
| `nick_scratch` | alpha-tested scratches (bright metal, dark burr) | inside the chest panel door |

The two paint materials share one texture set, and the two chipped materials share their normal and ORM maps.

glTFast does not support `KHR_materials_emissive_strength`, so every strength up to 1 is baked into `emissiveFactor`
(`nullfield_glow` 0.45, `nullfield_rim` 0.3, `energy_core` 1). Only `energy_rim` (1.8) keeps the extension, because
a core glTF factor cannot go above 1. three.js and Blender read it; glTFast imports the rim at 1.0, and N1CK.cs
multiplies it back to 1.8 when it finds the imported factor at most 1.

**Edge wear and dusty panel lines are separate meshes.** Every painted part is split into up to three meshes on the
same bone, so Unity gets one sub-mesh per material:

- `<part>` is the paint;
- `<part>_wear` holds its chipped edge strips (`armor_chipped` or `armor_chipped_light`);
- `<part>_inner` holds its groove floors and creases (`under_structure`).

Chips follow the exposed chamfers in short clusters (1–4 cm) with long clean gaps between them, most on edges that
face up or forward and get knocked and about three times as often near plate corners: pauldron crowns, yokes,
forearm plate edges, knuckles, knee caps, shin ridges, toe caps and heels. The dark paint chips about half as much as
the light paint, so bare metal never sparkles along whole edges. Undersides, flat faces and the whole bezel round
the screen stay clean; on the head only the top rear corners chip. In the Unity copy they are sub-meshes of the LOD mesh, so keep them
together if you re-texture.

**Triangles.** 138,435 at LOD0.

| By region | Triangles |
| --- | --- |
| head and neck | 16,614 |
| torso, pelvis and back | 37,297 |
| arms and hands (5.4k a hand) | 27,796 |
| legs and boots | 33,954 |
| gear | 22,774 |

| By material | Triangles |
| --- | --- |
| under_structure | 52.1k |
| armor_paint | 35.9k |
| webbing | 12.1k |
| armor_paint_light | 9.2k |
| rubber | 6.8k |
| cable_braid | 6.2k |
| gear_polymer | 5.6k |
| pouch_fabric | 4.2k |
| armor_chipped (+ light) | 2.5k |
| everything else | 3.8k |

**Unity LODs** (`tools/unity-export.js`, driven by the root extras `unity.lod`):

| LOD | Triangles | Sub-meshes | Dropped |
| --- | --- | --- | --- |
| LOD0 | 138,435 | 19 | nothing |
| LOD1 | 49,354 | 17 | the "Nick" decal and the glass; loose specks pruned |
| LOD2 | 34,286 | 16 | also the cable braids |

- LOD1 and LOD2 use meshopt's `Permissive` flag, because the hard-edged armour has normal seams everywhere and would
  hardly simplify otherwise.
- The protect rules simplify these gently at every LOD and never prune them:
  - `stainless_shroud`, `energy_core`, `energy_rim`, `nullfield_glow` and `nullfield_rim`;
  - `webbing` and `pouch_fabric`, so the belt, harness and pouches keep their outline;
  - the head (every material on it) and the pelvis armour, without `Permissive`, so their plates stay closed;
  - the under-structure spine column on `spine` / `chest` / `upper_chest`;
  - the under-structure on `hips` and `upper_leg_*` (hip balls, thigh frames), without `Permissive`, so the hip
    actuators never break into shards.
- `dropFlipped` removes the triangles the simplifier turns against their vertex normals (and degenerate ones) on
  LOD1/2: no LOD has flipped or degenerate triangles.
- In the viewer, `n1ck.glb` draws 513 meshes. Import the Unity copy for the game.

## Faces

The face is the `screen` mesh (child of `head`) with the `screen_face` material. Its emissive texture is the atlas
(`textures/face-atlas.png`). The atlas has 4 columns × 4 rows of 256 × 192 px cells (4:3, the screen's shape), each a
32 × 24 grid of warm off-white LEDs; the alert cells are red. Cell index = row × 4 + column from the top-left.

| | col 0 | col 1 | col 2 | col 3 |
| --- | --- | --- | --- | --- |
| row 0 | 0 `neutral` | 1 `neutral_blink` | 2 `happy` | 3 `happy_blink` |
| row 1 | 4 `worried` | 5 `worried_blink` | 6 `laughing_a` | 7 `laughing_b` |
| row 2 | 8 `sad` | 9 `sad_blink` | 10 `alert` | 11 `alert_blink` |
| row 3 | 12 `talk_a` | 13 `talk_b` | 14 `focus` | 15 `off` |

**Switching faces.** The atlas is stored upright in the .glb; the embedded image is identical to
`textures/face-atlas.png`. The screen UVs cover cell 0, the top-left cell (u 0–0.25, v 0–0.25 in glTF UVs, where v
runs down the image). To show cell i (col = i % 4, row = floor(i / 4)), move the texture by whole cells and change
nothing else:

- **glTF / three.js** (texture `flipY = false`): offset = (col / 4, row / 4).
- **Unity with glTFast.** glTFast flips V on the mesh and imports a PNG with identity scale and offset (a KTX
  texture comes in with scale (1, -1) and offset (0, 1)). Read the imported scale `s` and offset `o` once, then set
  offset = `o + (s.x * col / 4, -s.y * row / 4)`. For the PNG atlas that is (col / 4, -row / 4). The formula holds
  for either import, so do not hard-code the sign. Set the offset on every atlas property the material has:
  - glTFast shaders: `emissiveTexture` and `baseColorTexture`. They read `<name>_ST` only with the
    `_TEXTURE_TRANSFORM` keyword on.
  - Standard or URP Lit: `_EmissionMap`, `_BaseMap` and `_MainTex`. Those shaders move the emission map with the base
    map's tiling, so `_MainTex` / `_BaseMap` count even with no texture in them.

  `N1CK.SetFace` and `N1CK.ShowCell` do all of this.
- **Shader variant.** The atlas texture in both .glb files carries an identity `KHR_texture_transform`. glTFast
  therefore creates `screen_face` with `_TEXTURE_TRANSFORM` already on, and that shader variant is kept in player
  builds. If you import at runtime instead, include glTFast's shader variant collection in the build.
- **Repainting faces.** Edit `face-atlas.png` (keep the 4 × 4 grid of 256 × 192 cells) and assign it as the
  material's emission texture; no UV or offset changes are needed. Keep every face at least 8 px (one LED) inside its
  cell: the outer ring of LEDs is always dark, so mipmaps never bleed one face into the next at range. If you still
  see bleed on a very small screen, turn off mipmaps on the atlas import (or use a LINEAR min filter).

**Blinks and expressions.** Each `*_blink` cell is its face with the eyes shut (about 0.12 s). `laughing` alternates
`laughing_a` / `laughing_b` at about 7 Hz; `talk` alternates `talk_a` / `talk_b`. A held expression blinks every
3.7 s in the viewer and every 2.6 to 5 s in N1CK.cs.

**Alarm tint.** Multiply the screen's emissive colour toward dark red `#d8141a` by a 0..1 tint (keep the HDR
strength). The viewer also turns the small screen light red. The alert cells are already red, so they read without
the tint.

**Face channel.** `face_ctrl.position` is keyed in every clip with STEP interpolation:

- x = cell index (glTFast negates x, so read `|x|` in Unity);
- y = alarm tint 0..1;
- z = Nullfield emitter glow 0..1.

Do not read it while two clips crossfade: the index blends into a wrong cell. N1CK.cs uses the per-clip timelines
below instead, and only falls back to `face_ctrl` for clips it does not know.

## Clips

All clips are sampled at 30 fps from pose functions in `viewer.html` (`ANIM.CLIPS`). They key every bone's rotation,
`hips` position, the piston nodes and `face_ctrl`.

- **Feet.** Legs are solved with IK against planted feet: when a plant is out of reach of a straight leg, the pelvis
  drops just enough first, so a planted sole stays on y 0 in every frame (checked on all 2,600 sole vertices at
  30 fps) and never moves; steps (the hop and step back in `alert`) leave and land vertically. `walk`'s stance foot moves back at exactly the walk
  speed (that is the in-place walk, not sliding).
- **No clip has root motion.**
- **Crossfades.** Every one-shot starts and ends exactly on `idle` at 0 s, and the loops match at both ends, so
  0.3 s crossfades are clean.
- **Gear.** Hands that touch the body are placed against the gear: in `laugh` the left hand rests on his stomach
  above the belt, and in `nullfield_activate` the fists brace in front of the stomach, arc out over the front mag
  pouch and plant on the hips with the knuckles on the belt.

| Clip | Length | Loop | Content | Face timeline (s → cell) | Tint / field |
| --- | --- | --- | --- | --- | --- |
| `idle` | 4.0 | loop | Contrapposto: pelvis shifted 3.3 cm over the left leg and rolled 6° (high on that side, left knee nearly straight), right foot 6 cm forward, 4 cm out and turned out 19° with a soft knee, chest lifted and counter-turned, head tilted. The arms hang close (wrists about 0.29 m and 0.37 m out from the pelvis centre, the right a touch more bent), elbows soft (18° and 27°). One breath, a slow weight settle, a look round at 2.2–2.9 s (the neck leads), fingers fidget out of step. | 0 neutral; blinks at 1.3, 3.25, 3.5 | |
| `walk` | 1.1 | loop | One cycle in place: heel strike, flat foot, toe-off, swing. Pelvis bob, sway and twist (hip flexion up to 38°); arms swing opposite. | 0 happy; blink at 0.621 | |
| `talk_gesture` | 4.0 | loop | Gestures in front of the chest (hands at y 1.05–1.3): palms-up offer, a right-hand beat with a wrist flick, an index point, a two-hand frame, left palm on the chest ("me"), open-hand chops, settle. The upper chest turns up to 8° toward the gesturing hand, the chest leans in up to 6° on the points, the shoulders lift 5–8° on the beats; nods. | flaps between neutral, talk_a, talk_b; happy at 1.421–1.863 and 3.45–3.85 (blinks 1.5, 3.6) | |
| `wave` | 2.4 | once | Weight shifts 2.5 cm onto the left leg. Right arm up and out (elbow above the shoulder, hand above the head and clear of it), three waves from the elbow with the wrist trailing 0.08 s, head tilted up to 18° toward the hand, the left arm easy and a little forward, back down. | 0 neutral, 0.121 happy, 0.85–1.35 happy squint (`happy_blink` held), blink 1.95, 2.25 neutral | |
| `laugh` | 2.0 | once | Inhale, leans back with the head thrown back, then folds forward (about 11° in each of spine and chest). The left hand lies flat on the stomach above the belt's mag pouches, thumb along the index, riding 1.6 cm higher as he folds; it is solved onto the stomach again after the body's bounce, so it stays on the surface. He slaps the right thigh twice. The shoulders bounce ±5° at 3.5 Hz, in step with the laughing_a / _b flips. | 0 neutral, 0.1 happy, 0.3–1.621 laughing_a/b alternating every ~0.143, then happy (blink 1.721), 1.95 neutral | |
| `sad` | 3.0 | once | A slump through the whole spine (about 9–10° in each of spine, chest and upper chest, about 26° in all), up to about 32° in the neck and head, shoulders dropped 10–15° and rolled forward, hips 2 cm lower with soft knees. Arms heavy, wrists turned in, a slow sigh and head shake, the right hand closes into a loose fist and lets go. | 0 neutral, 0.15 sad (blinks 0.9, 2.15, 0.2 s long), 2.75 neutral | |
| `worried` | 2.6 | once | Hunched (upper chest forward 6°), shoulders up 7–10°, hands wringing in front of the chest: palms facing about 6 cm apart, sliding past each other, thumbs and index fingers rubbing out of step. Glances left and right. | 0 neutral, 0.121 worried (blinks 0.662, 1.421, 2.021), 2.45 neutral | |
| `alert` | 1.6 | once | Startled hop into a wider ready stance that loads forward: hips back 3 cm and down 5 cm, the trunk about 12° forward (hips to neck) with the screen kept level, hands up in loose fists (thumbs tucked along the index). Looks left and right. | 0 neutral, 0.05 alert (blink 0.621), 1.4 neutral | tint 0 → 0.8 by 0.12 s, held, back to 0 by 1.6 |
| `nullfield_activate` | 1.8 | once | Braces in the knees (feet stay planted), fists close in front of the stomach, then arc out over the front mag pouch (0.46 s). He rolls the shoulders well back (about 15°) to bare the emitters and brings the chest out on the upper chest, while the trunk stays about 5° forward over the bent knees and the head over the feet; both fists plant on the hips with the knuckles on the belt (placed in the pelvis frame, so the two sides match). Trembles. | 0 neutral, 0.121 focus, 1.621 neutral | field 0 until 0.45, peak 1 at 0.9, 0.6 by 1.45 |

The exact resolved timelines (every key, blinks included) are in the root extras `clips.<name>.faces`, with `tint` /
`field` sampled every 0.1 s.

`walk` also carries `root_speed_mps: 1.3`: the planted foot moves back at exactly 1.3 m/s, so move the character's root
forward at 1.3 m/s while it plays (scale the clip speed with the movement speed for other speeds).

After a clip's tint or field ends, fade it out over about 0.4 s rather than cutting it (the viewer and N1CK.cs do).

## Glows

- **Emitters** (`nullfield_glow` + `nullfield_rim`, under `emitter_l` / `emitter_r`, at (±0.119, 0.1281, -0.1045)
  from `upper_chest`). They glow a faint dark red at rest (0.45 / 0.3 in the exported emissive factors). To flare,
  scale the emission with f = 0..1 and pulse = 0.85 + 0.15 sin(9 t):
  - lens × (1 + 4.5 f · pulse);
  - rim × (1 + 4 f · pulse).

  The lens texture has no white and no purple, so the flare reads as a hotter red; the purple stays on the rim.
- **Power cell** (`energy_core`, under `spine`, centre (0, 1.15, -0.105)). Breathe it at × (0.92 + 0.08 sin(2.1 t)).
  Only `energy_core` breathes (N1CK.cs `cellGlow`); the chest door-gap line and the capacitor caps share it and
  breathe with it. `energy_rim` (the cell's end rings and the neck hairline) stays as exported. The cage
  (`cell_shroud`, stainless) is not emissive.
- **Viewer lights.** The viewer adds two small point lights that follow the bones: a warm one just below and in
  front of the screen, and a faint short-range red one 2 cm behind the cell (it lights only the back plates and the
  belt next to it). They are not in the .glb; add your own if you want spill.

## Chest panel and "Nick"

`chest_panel` (under `upper_chest`, at (0.0207, 0.0402, 0.1328) from it) is the hinged door on his left pec. It is
light paint outside and dark under-structure inside, sits 1.5 mm below the pec face in a recessed frame and hangs on
a 3-knuckle barrel hinge (r 2.6 mm, standing proud of the face; the middle knuckle is on the door), with a finger
notch and a small dark catch on its lateral edge. It is shut in the file and in every clip.

To open it, rotate it about its hinge (the door's medial edge) by up to 106°, with u running from 0 (shut) to 1
(open):

- glTF local rotation: axis (0, -0.9992, 0.04), angle u × 106°.
- Unity: `localRotation = Quaternion.AngleAxis(u * 106f, new Vector3(0f, 0.9992f, -0.04f))`.

"Nick" is scratched on the inside of the door and is readable when it is open. Behind the door is a recess with a
small memory module, three capacitors with dark red glowing caps and a lead into the frame. A thin dark red glow strip
sits deep in the bottom gap of the door; it is what shows under the shut door.

The viewer's chest view camera is at (0.352, 1.445, 0.363) looking at (0.064, 1.381, 0.143).

## Unity setup

1. **Import.** Install glTFast (`com.unity.cloud.gltfast`) and copy `unity/n1ck.glb` into Assets. Unity 2021 LTS to
   Unity 6.
   - In its import settings set **Animation: Legacy** (N1CK.cs plays his clips through the Animation component).
   - The body imports as three SkinnedMeshRenderers (`body_LOD0/1/2`), each one renderer with one sub-mesh per
     material and `rootBone` = `hips`.
   - glTFast's default **Skin Update When Offscreen** keeps every LOD skinning even when culled. For performance,
     untick it and give each `body_LOD` renderer fixed `localBounds` that cover the clips: centre (0, 0.05, 0.05)
     and size (2.0, 2.3, 1.3) in `hips` space (y -1.1…1.2, z -0.6…0.7). Measured over every clip, the body spans
     x ±0.947 (the T-pose rest), y -1.0…1.114 (`wave`'s raised hand) and z -0.481…0.571 (`walk`).
2. **Prefab.** Keep `../../unity/Editor/GunmodlsPrefabBuilder.cs` in an Editor folder, select the .glb and run
   **Tools > Gunmodls > Build Prefabs From Selection**. It adds a LODGroup from the `_LOD0/1/2` renderers and turns
   every `_COL` node into a BoxCollider (one per body bone; they follow the animation). Add a kinematic Rigidbody to
   the root.
3. **Scripts.** Add `N1CK` (from `unity/Runtime/N1CK.cs`) to the prefab root: the object with the Animation
   component, or a parent of it. Give the same object a `NullfieldCarrier`, so Nullfield sensors and feed cameras
   ignore him. That class lives in `unity/Runtime/Nullfield.cs` next to other classes, and Unity's Inspector only
   offers a MonoBehaviour whose file has its name, so either:
   - add it in code (`gameObject.AddComponent<NullfieldCarrier>()`, for example from a small bootstrap script on the
     prefab); or
   - move the class into its own `NullfieldCarrier.cs`.
4. **Movement.** Move him with your character controller. Play `walk` while moving and move the root at
   `N1CK.WalkSpeed` (1.3 m/s) times the clip speed.

**N1CK.cs reference.**

| Member | What it does |
| --- | --- |
| `Play(clip, fade = 0.3)` | Crossfades to a clip. Loops (`idle`, `walk`, `talk_gesture`) keep going; one-shots crossfade back to `idle` when they end. Sets `playAutomatically = false` and the wrap modes (Loop / ClampForever) in Awake. |
| `SetFace(name)` | Holds an expression (`neutral`, `happy`, `worried`, `laughing`, `sad`, `alert`, `talk`, `focus`, `off`) or a cell name; it blinks now and then. `SetFace(null)` gives the face back to the playing clip's timeline. |
| `Blink()` | One blink now (when the current face has a `_blink` cell). |
| `ShowCell(index, tint)` | Shows one atlas cell immediately (the next Update applies the clip / expression again). |
| `Alarm(bool)` | Screen tint toward `alarmColor` (`#d8141a`), eased in and out. The `alert` clip adds its own tint. |
| `Nullfield(bool)` | Emitters flare (pulse included; lens × 1 + 4.5 f, rim × 1 + 4 f). `nullfield_activate` adds its own flare. |
| `cellGlow` | Power-cell (`energy_core`) brightness multiplier (1 = as exported). |
| `startClip`, `defaultFade`, `alarmColor` | Inspector settings. |
| `CurrentClip`, `CurrentFace`, `AlarmOn`, `NullfieldOn`, `Cells`, `CellIndex(name)`, `WalkSpeed` | Read-only helpers. |

**Materials.** N1CK.cs makes one material instance for each of `screen_face`, `nullfield_glow`, `nullfield_rim`,
`energy_core` and `energy_rim`, and shares it across every renderer and LOD that used it (skinned or not). It sets
`emissiveFactor` (glTFast) and `_EmissionColor` (Standard / URP) and enables `_EMISSIVE` / `_EMISSION`. Its
`EmissiveStrength` table puts back the strength glTFast drops (`energy_rim` × 1.8) when the imported factor is still
at most 1.

Face timelines and tint / field keys are tables in the script, copied from the extras. If you add a clip, add its row
there.

**Humanoid (retargeting other animation).** His own clips are generic legacy clips. To drive him with humanoid
animation (mocap, Mixamo, Starter Assets):

1. Import the .glb with Animation set to Mecanim or None.
2. Select the model (or an instance) and run **Tools > Gunmodls > N1CK > Build Humanoid Avatar**
   (`unity/Editor/N1CKAvatarBuilder.cs`). It maps the bones by name (table above), uses the file's T-pose as the rest
   pose, saves `<model>_Avatar.asset` next to the model and, for a scene instance, adds an Animator with it.

Use either the Animator (humanoid) or the legacy Animation on one instance, not both.

With humanoid animation, N1CK.cs still does faces, alarm, emitters and cell glow. Call `SetFace` yourself, since
humanoid clips carry no face timeline. The pistons are not driven (see Rig). The fingers map to Unity's finger bones;
the thumb's first bone is the metacarpal.

## Rebuilding

`viewer.html` is the source. It is a standalone build (all sources inlined) of the scratch project the model was
made in, so **a future session edits `operators/n1ck/viewer.html` directly** and re-exports:

```
node tools/export-glb.js operators/n1ck/viewer.html        # n1ck.glb (about 1.5 min in software rendering)
node tools/unity-export.js operators/n1ck/n1ck.glb         # unity/n1ck.glb (skinned LODs, about 10 s)
node tools/render-preview.js operators/n1ck/viewer.html    # preview.png
node tools/check-glb.js operators/n1ck/n1ck.glb operators/n1ck/unity/n1ck.glb
```

`textures/` is written from the page with `window.__model.faceAtlasPNG()` (atlas) and
`window.__model.textureSheets()` (every map, PNG base64 by texture name). Open the viewer with
`tools/lib/open-viewer.js`, call both, and write `face-atlas.png` and `<name with dashes>.png`. Delete sheets that
no longer exist. `textureSheets()` turns every canvas drawn for three.js's `flipY` over, so the sheets come out in the
.glb's orientation.

Where things live in `viewer.html` (search for these lines):

| Section | Search for | What is there |
| --- | --- | --- |
| proportions, joints, humanoid map | `- proportions */` and `const HUMAN` | `J`, `D` (body envelope, head, screen, cell, emitter, chest panel and gear-path numbers) |
| procedural textures | `function paintFields` (then `chipMaps`, `underMaps`, `webbingMaps`, `fabricMaps`, `polymerMaps`, `stainlessMaps`, `braidMaps`, `rubberMaps`, `glowRadial`, `glowBand`) | every texture is drawn here |
| face atlas | `- face atlas */` | `FACES`, layout; the head part redraws the LEDs (`function drawAtlas` in `PARTS.head`) |
| materials | `function buildMaterials` | the 19 materials (`M.paint`, `M.paint2`, `M.chip`, `M.under`, `M.webbing`, `M.fabric`, `M.screen`, ...) |
| hard-surface kit | `function armorPlate`, `function facetLoft` | faceted plates with chamfers, folds, grooves and steps; faceted shell lofts |
| gear kit | `function strap`, `function hug` | webbing straps laid onto the armour; buckles, sliders, D-rings, MOLLE, pouches |
| wear rule and split | `function edgeWear`, `function cornerFlags`, `function wearSplit` | the shared edge-wear rule (clusters, corners, less on dark paint); the split into `_wear` / `_inner` meshes |
| rig, loader | `- rig */`, `- kit and part loader */` | bones, `K.add` / `K.addW`, pistons, the per-region try/catch loader |
| faces at runtime | `function setFace` | atlas offset, alarm tint, `face_ctrl` |
| head | `PARTS.head = function` | housing, bezel, screen (`screen` mesh), ears, neck rings, cables and pistons |
| torso | `PARTS.torso = function` | pelvis, waist under-structure, plates, back, power cell and stainless cage, emitters, chest panel and "Nick" |
| arms | `PARTS.arms = function` | yokes, pauldrons, arms, elbow actuators and pistons, hands, fingers |
| legs | `PARTS.legs = function` | hip actuators, hip balls and socket cups, thighs, knees and knee guards, shins, ankle cuffs, boots, pistons |
| gear | `PARTS.gear = function` | belt, pouches, chest harness, drop-leg rig |
| animation | `const ANIM = (() =>` | IK, pose library (`HANDS`, `hand()`), every clip with its face keys and blink times |
| scene, lights, UI, export | `- scene: a dark concrete bay`, `- export */` | `exportScenes` (extras, including the `unity` settings), `exportGLB` (welds meshes for the file, names the root and scene, adds the atlas texture transform), `preview` |

Rules the parts follow:

- Use only the shared materials in `M`: each new material costs seconds of shader compile in software rendering and a
  draw call in game.
- Keep wear in textures and the mesh split, never in vertex colours.
- Keep the "Nick" decal as the only writing.
- Name gear meshes `gear_*`.
- Keep the build fast: the parts build in about 4 s and the page is ready in about 15 s headless.

## Known limits

- **LOD2 is 34k triangles.** The faceted armour is many flat facets and separate edge strips, so it cannot shrink
  much further without losing its silhouette. `Permissive` simplification leaves some soft shading streaks on the
  arms at LOD2 (only seen beyond about 27 m); the hips are simplified without it.
- **Deep crouch and wide stances with gear.** The clean ranges are in Rig, Supported ranges. Beyond them the thigh
  reaches the belt: at 90° of hip flexion about 5 mm (the light thigh plate against the belt on his left), at 100°
  about 9 mm (the front mag pouch and the fauld), at 110° about 27 mm. With the leg out past 20° the hip cap meets the
  socket cup and the pelvis (5 mm at 25°, 15 mm at 45°); with the arms raised past 30° the upper arm meets the collar
  and pec plates (5.6 mm at 45°, 13 mm overhead). If retargeted animation goes further, clamp the humanoid muscle
  limits or blend the gear meshes' LOD sub-meshes off for that move.
- **Rigid parts.** At the extremes of the joint ranges some plates overlap: the calf meets the back of the thigh
  from about 125° of knee bend, and the pauldron tips up with the arm in the T-pose. In the clips, the deepest contacts
  left between parts on different bones (sampled at 10 fps; the elbow fork, the joints' drums in their forks, the
  pistons' rods in their bodies and fingers against their own hand are by design) are small and mostly hidden:

  | Contact | Depth | Clip |
  | --- | --- | --- |
  | thumb metacarpal into its own forearm cuff | 6.1 mm | `talk_gesture`; 5.7 mm `nullfield_activate` |
  | left thumb metacarpal against the rib plate's lower edge, hand on the stomach | 4.8 mm (the thumb tip 3.3 mm) | `laugh` (folded forward, 1.1–1.4 s) |
  | thumb tips crossing while the hands wring | 4.7 mm | `worried` |
  | right upper arm into the right emitter's blades | 4.2 mm | `wave` (arm going up) |
  | back strap tail on the lower back plate | 3.5 mm | `laugh` (shoulders rolled back) |
  | right shoulder strap's tail against its lower piece | 3.4 mm | `worried` (upper chest hunched) |
  | left shoulder strap into the left yoke's frame | 3.1 mm | `worried` (shoulders up) |
  | the upper arm's inner side into the lat and lower back plates | about 3 mm | most clips |
  | chest door edge into the rib plate screws | 3.0 mm | `alert` |
  | the lower pec plate against the upper arm's inner side | 2.7 mm | `talk_gesture`, `sad`, `worried` |
  | right thumb tip into the thigh armour on the slap | 2.5 mm | `laugh` |
  | drop-leg swivel and its bracket | about 2.3 mm | most clips |

  The laugh hand was measured point by point against the torso surface as well: nothing on it sinks more than 3 mm.
- **Gear in the Unity copy** is merged into the LOD meshes, and the hit boxes on `hips` and `upper_leg_r` include it.
- **Pistons** only follow the joints through the clips (or code that aims them); humanoid retargeting does not.
