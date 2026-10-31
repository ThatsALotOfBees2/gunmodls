# N1CK: design and build contract

N1CK is a playable operator in a Siege-like shooter: a 1.85 m robot built for warmth. He's lean, has human proportions,
rounded shoulders and an open stance, and has a screen for a face. He's made of dark raw forged iron with weld seams,
rivets and worn bare-metal edges. The palette is gunmetal, warm bare iron, and dark red energy (`#6b0f12`) with purple
(`#8a4dff`) edges. His gadget, the Nullfield, is built elsewhere (do not touch `gadgets/nullfield`). This file covers
only the body: two emitter discs on his upper back.

The only writing allowed anywhere on him is a small scratched "Nick" in a child's handwriting, hidden inside the
chest panel. Add no other text, logos, numbers or markings.

**Quality bar:** a hero asset that makes people doubt it was generated. Work in this order: silhouette first, then big
forms, then secondary forms (layered plates, panel gaps, actuators, cable bundles, pistons), then micro detail (weld
ripple, rivet rows, hammer marks, mill scale, worn edges, scratches, faint rust only in crevices). He must read at
gameplay distance and reward a close look.

---

## 1. Files and workflow

```
n1ck/SPEC.md          this contract
n1ck/core.js          rig, proportions, materials + procedural textures, detail helpers, blockouts, loader, POSE
n1ck/parts/head.js    PARTS.head  (neck, head housing, screen, ears)
n1ck/parts/torso.js   PARTS.torso (pelvis, torso plates, back, power cell + stainless shroud, emitters, chest panel + "Nick")
n1ck/parts/arms.js    PARTS.arms  (clavicles, pauldrons, upper/lower arms, elbow actuators, hands, five fingers)
n1ck/parts/legs.js    PARTS.legs  (hip actuators, thighs, knee actuators, shins, flat-soled boots)
n1ck/anim.js          ANIM: poses, clips, face timelines
n1ck/n1ck.tpl.html    page template (scene, UI, playback, export, debug)
n1ck/head.html        page <head> styles
n1ck/assemble.sh      sh assemble.sh <out.html>
n1ck/views.json       starter camera set for closeups.js (front, side, back, 3/4, T-pose, face, hands, back with emitters lit)
n1ck/t-core/          the foundation's own renders (blockout reference)
```

- **Assemble into your own folder** (for example `n1ck/t-head/out.html`), and render into that folder too. `evalpage.js` and
  `closeups.js` write `_eval.html` / `_closeup.html` next to the page, so agents sharing a folder overwrite each
  other's files.
  ```
  S=/tmp/claude-0/-home-user-Crystalix-party/54ae899d-ab9c-5ac8-991a-a7fa61aa138b/scratchpad
  mkdir -p $S/n1ck/t-head && sh $S/n1ck/assemble.sh $S/n1ck/t-head/out.html
  cd $S/build && W=1000 H=1000 node closeups.js $S/n1ck/t-head/out.html $S/n1ck/t-head views.json
  node evalpage.js $S/n1ck/t-head/out.html 'return m.timings'
  ```
- Edit only your own file. Do not modify `core.js`, the template, or another region's file. If core lacks something,
  build it inside your own builder (as a local function) and mention it in your report.
- A part file may declare **one** top-level statement, `PARTS.<region> = function (K) { ... }`. Keep every helper
  inside that function. All files share one module scope, so a top-level `const` breaks the page.
- If your builder throws, the loader drops whatever it had added, uses that region's blockout, and pushes
  `{ region, message, stack }` to `window.__partErrors` (also `m.partErrors`). Check it after every assemble:
  `node evalpage.js page 'return [m.partErrors, m.timings]'`.
- Pitfall: in JS template-literal strings `\d` becomes `d`; use `[0-9]`.
- Load time: the whole page must stay well under 3 minutes in software rendering (the blockout loads in about 40 s;
  textures take 4 s). Budget per region: about 3 s of build time (see `m.timings`) and these LOD0 triangle counts: head
  25k, torso 45k, arms 50k for both, legs 30k for both, so roughly 150k in total. CSG (`subtract`) is slow, so keep
  cutters few and simple, and model shapes directly where you can.
- **Use only the shared materials in `K.M`.** Every new material variant costs 5 to 25 s of shader compile in swiftshader.
  Never create materials, and never clone or tweak `K.M` entries.
- Keep comments plain and short.

## 2. Space, units, rest pose

- Metres. glTF axes: +Y up, N1CK faces **+Z**, **his left is +X**. The origin is on the ground (the plinth top) between his
  feet.
- The rest pose is a **T-pose**: arms straight out along ±X with palms down (-Y) and thumbs forward (+Z), legs straight,
  feet forward. **Every bone has identity rotation at rest**, so at rest a bone's local axes are the world axes and
  `local = world - J[bone]`.
- `K.add(bone, geo, ...)` takes bone-local geometry. `K.addW(bone, geo, ...)` takes rest-pose world geometry, and is
  usually easier for the torso and head.
- Right-side parts: build the left side in local space, then `K.mirrorX(geo)` gives the right side in its own local space
  (the joints mirror exactly).

## 3. Proportions (rest pose, world metres)

Height 1.85 (head top). Arm span 1.89. Lean build: chest 0.34 wide, waist 0.27, hips 0.33, shoulders across the
pauldrons about 0.49. The V-taper is slight.

| joint | position (x, y, z) | parent | note |
| --- | --- | --- | --- |
| hips | 0, 1.000, 0 | (root `n1ck`) | pelvis centre |
| spine | 0, 1.090, -0.005 | hips | lower back, waist |
| chest | 0, 1.215, -0.010 | spine | lower ribs |
| upper_chest | 0, 1.345, -0.012 | chest | upper ribs, shoulder girdle |
| neck | 0, 1.555, -0.020 | upper_chest | neck base (collar top) |
| head | 0, 1.640, -0.010 | neck | skull pivot; housing spans y 1.615–1.85 |
| shoulder_l | 0.030, 1.470, -0.015 | upper_chest | clavicle root |
| upper_arm_l | 0.185, 1.470, -0.025 | shoulder_l | shoulder joint |
| lower_arm_l | 0.485, 1.470, -0.025 | upper_arm_l | elbow (upper arm 0.300) |
| hand_l | 0.750, 1.470, -0.025 | lower_arm_l | wrist (forearm 0.265) |
| upper_leg_l | 0.092, 0.955, 0 | hips | hip joint |
| lower_leg_l | 0.092, 0.515, 0.006 | upper_leg_l | knee (thigh 0.440) |
| foot_l | 0.092, 0.090, -0.012 | lower_leg_l | ankle (shin 0.425); sole bottom at y 0 |
| toes_l | 0.092, 0.026, 0.150 | foot_l | ball of the foot |

Right side: same with x negated (`_r`).

**Hand** (left, T-pose: palm down -Y, back of the hand +Y, fingers +X, thumb toward +Z). Palm: x 0.75–0.85, z -0.069 to
+0.019 (half width 0.044 about z -0.025), y 1.453–1.485. Hand length wrist to middle tip 0.197.

| finger | knuckle (proximal) | middle joint | distal joint | tip | width / thickness |
| --- | --- | --- | --- | --- | --- |
| thumb (along dir 0.62,-0.30,0.72) | 0.774, 1.458, -0.003 | 0.8026, 1.4442, 0.0302 | 0.8232, 1.4342, 0.0541 | 0.8406, 1.4258, 0.0743 | 0.022 / 0.019 |
| index | 0.844, 1.473, 0.003 | 0.887 | 0.913 | 0.934 | 0.019 / 0.017 |
| middle | 0.848, 1.474, -0.017 | 0.895 | 0.925 | 0.947 | 0.0195 / 0.0175 |
| ring | 0.844, 1.472, -0.037 | 0.888 | 0.916 | 0.936 | 0.018 / 0.0165 |
| pinky | 0.836, 1.468, -0.056 | 0.870 | 0.891 | 0.909 | 0.016 / 0.015 |

(For index to pinky, only x changes along the finger; y and z stay as on the knuckle.) Segment lengths: thumb 0.046,
0.033, 0.028; index 0.043, 0.026, 0.021; middle 0.047, 0.030, 0.022; ring 0.044, 0.028, 0.020; pinky 0.034, 0.021,
0.018. `thumb_1` is the thumb metacarpal (Unity "Thumb Proximal"). All of these are in `K.D.FINGER` / `K.J` / `K.TIP`.

**Envelopes** (`K.D`; your shells should sit close to these numbers so the regions meet):

- `D.torso`: crotch y 0.86, hip band y 0.99 (half width 0.163, front +0.10, back -0.116), waist y 1.13 (half width 0.134,
  front +0.09, back -0.098), chest y 1.37 (half width 0.17, front +0.114, back -0.126), collar top y 1.555 (neck opening
  radius ≥ 0.055). Shoulder outer edge x ±0.245.
- `D.limbR` (radius at the near joint, then at the far joint): upper_arm 0.050 → 0.041, lower_arm 0.044 → 0.032,
  upper_leg 0.078 → 0.056, lower_leg 0.060 → 0.042. Arms are a little deeper (z) than tall (y).
- `D.head`: half width 0.092, y 1.615–1.85, front face z +0.095, back z -0.11, corner radius 0.05. Screen: centre
  (0, 1.735), 0.136 × 0.102 (4:3), corner radius 0.014, display surface at z 0.083 (12 mm behind the bezel face).
  Ears: cylinders along X, outer face centre (±0.104, 1.73, -0.012), r 0.026, length 0.024.
- `D.foot`: heel z -0.075, toe z +0.215, sole 0.025 thick, half width 0.05, ankle y 0.09.
- `D.emitter`: left disc centre (0.115, 1.47, -0.128), facing (0.5, 0.35, -1) normalised, r 0.032; the right one mirrors x.
- `D.cell`: power cell centre (0, 1.15, -0.13), core radius 0.03, core height 0.085.

## 4. Rig

Bones are `THREE.Group` nodes. The names are fixed:

```
n1ck (root, at the origin)
├─ hips
│  ├─ spine ─ chest ─ upper_chest
│  │                    ├─ neck ─ head
│  │                    ├─ shoulder_l ─ upper_arm_l ─ lower_arm_l ─ hand_l
│  │                    │     hand_l ─ thumb_1_l ─ thumb_2_l ─ thumb_3_l
│  │                    │            ─ index_1_l ─ index_2_l ─ index_3_l   (also middle_, ring_, pinky_)
│  │                    └─ shoulder_r … (mirror)
│  ├─ upper_leg_l ─ lower_leg_l ─ foot_l ─ toes_l
│  └─ upper_leg_r … (mirror)
└─ face_ctrl   (no mesh: position = face cell, alarm tint, nullfield glow; see §8)
```

Pistons add nodes `pist_<name>_a` / `pist_<name>_b` under their bones (§6). The torso adds `chest_panel` (§9). Unity
Humanoid mapping is in `K.HUMAN` (for example `index_2_l` → "Left Index Intermediate", `pinky_*` → "Little"). The
rest pose is Unity's T-pose.

**Rigid parts:** nothing is skinned. Every mesh hangs on one bone and moves rigidly with it. Design the joints so
bending reads well: put housings, rings or actuator drums centred on each pivot, and keep the segment shells back from
the pivot so they don't intersect through the range below. Some overlap at the extremes is fine. A visible gap is not.

| joint | range to support |
| --- | --- |
| elbow (lower_arm Y) | 0 to 145° flex |
| knee (lower_leg X) | 0 to 140° flex |
| hip (upper_leg) | -30° (back) to +110° (forward); ±45° out to the side |
| shoulder (upper_arm) | from down at the side (Z -80°) to overhead (Z +80°), forward and back ±90° |
| wrist (hand) | ±70° flex, ±25° side to side |
| fingers | 0 to 100° per joint; thumb across the palm |
| neck + head | ±40° nod, ±60° turn, ±25° tilt |
| spine chain | ±25° bend, ±30° twist in total |

## 5. Region ownership

| region | attaches to | owns | must leave free |
| --- | --- | --- | --- |
| head | neck, head | neck rings and cables (y 1.545–1.625; tuck the bottom into the collar opening), head housing, recessed screen, bezel, glass, ears (mic and speaker) | |
| torso | hips, spine, chest, upper_chest | pelvis and hip plates, abdomen, layered chest plates with a central seam, collar ring, back plates, power cell + stainless shroud (`D.cell`), both Nullfield emitters (`D.emitter`), chest panel + "Nick" | spheres r 0.075 around the shoulder joints; spheres r 0.065 around the hip joints, plus \|x\| > 0.13 at y 0.88–1.0 for the hip actuators |
| arms | shoulder_*, upper_arm_*, lower_arm_*, hand_*, finger bones | clavicle / trapezius plates (sit over the torso's top plates, x 0.06–0.17), rounded pauldrons on the shoulder joints, upper arm, elbow actuators, forearm, wrist, palm, five fingers | |
| legs | upper_leg_*, lower_leg_*, foot_*, toes_*; hip actuator stators may go on `hips` | hip actuators (outside of the hip, coaxial with the X axis through the joint), thighs, knee actuators, shins, boots with flat soles | |

Design notes for every region. Use rounded, friendly forms, not spikes or MANTIS-style menace. Use layered plates with
real panel gaps (2 to 4 mm) that show darker `iron_inner` underneath. Every plate gets a worn bevel. Put weld beads
where plates are joined, not everywhere, and run rivets in tidy rows along plate edges. Keep cables in braided
bundles with ferrules, and put exposed actuators at the elbows, knees and hips. Use the same detail density on every
part so they look like one machine.

## 6. Builder contract and the kit `K`

```js
PARTS.head = function (K) { ... }   // likewise PARTS.torso, PARTS.arms, PARTS.legs
```

The loader runs the regions in this order: torso, legs, arms, head. A builder only attaches children. It must never
move or rotate bones and must not touch another region's bones. Everything below is on `K`.

**Data:** `THREE`, `D` (all of §3), `J` (bone name → rest world `Vector3`), `TIP` (fingertips `thumb_l` …, `toe_l`,
`heel_l`, `head_top`), `FINGER`, `FINGERS`, `HUMAN`, `M` (materials, §7), `TX` (textures), `bones` (name → Group), `rig`,
`hooks` (§9), `blockout` (`K.blockout.head(K)` etc.).

**Attaching:**

- `K.add(bone, geo, mat, name, opts)` attaches geometry modelled in that bone's local space. `bone` is a name or any
  node of the rig, such as a hinge group you added under a bone.
- `K.addW(bone, geo, mat, name, opts)` does the same for geometry modelled in rest-pose world space.
- Both return the base mesh. `opts`:
  - `wear: true | { k, kIn, chip, freq, inner }` splits the mesh into `name`, `name_wear` and `name_inner` (§7).
  - `cast` / `receive` set shadows (default true). Pass `cast: false` for emissive parts and tiny things.
  - `wearMat` / `innerMat` override the two split materials.
  - Geometry with no UVs gets box-projected UVs at the material's tile size. Keep your own UVs where they matter
    (screen, discs, cables, welds).
- Other helpers: `K.local(bone, v)` gives a world point in bone space; `K.toLocal(bone, geo)` translates geometry the same
  way; `K.merge([geos], tile)` merges geometries and keeps UVs; `K.mirrorX(geo)`; `K.orient(geo, fromAxis, toAxis)`;
  `K.boxUV(geo, tile)`; `K.prepUV(geo)`.

**Shapes:**

- `K.sLoft(stations, { axis: 'x'|'y'|'z', seg, steps, roundStart, roundEnd, cap })` builds a superellipse loft.
  Stations are `[s, a, b, n, o1, o2]`:
  - axis y: a = half x, b = half z, offsets x and z.
  - axis x: a = half y, b = half z, offsets y and z.
  - axis z: a = half x, b = half y, offsets x and y.

  Stations are sorted by s, n = 2 is an ellipse and higher is squarer, and the ends can roll over by
  `roundStart`/`roundEnd`. Use it for limb shells, the torso core and fingers.
- `K.plate(shape, t, { bevel, segs, bendY, bendX, tess, crease })` builds an armour plate. The outline (a `THREE.Shape`
  in XY, kept exact) is extruded from z 0 (back) to z t (face) with a rounded bevel. `bendY` / `bendX` wrap it around a
  cylinder of that radius whose axis is behind the plate (positive gives a convex face). `geo.userData.surf(x, y, h = t)`
  returns `{ p, n }` on the bent face, which is how you place rivets, welds and screws on it.
- `K.rect(x0, x1, y0, y1, r)` and `K.roundedShape([[x, y, r], ...])` (alias `K.rshape`) make outlines with per-corner
  radii.
- `K.slab(shape, width, { bevel, segs, zc })` is the older extrude: centred, and it grows the outline by 0.9 × bevel.
- Also available: `K.loft` (along X), `K.latheX([[x, r]...])`, `K.latheY([[y, r]...])`, `K.box(x0, x1, y0, y1, z0, z1)`,
  `K.subtract(base, ...cutters)` and `K.subtractEach` (CSG; slow, so use sparingly), `K.creased(geo, deg)`, and
  `K.curve(pts)` (a monotone cubic).

**Detail:**

- `K.rivets([{ p, n }...], r = 0.0045, seed)` makes hand-set domed rivets: each one is slightly squashed and tilted, and
  sinks 0.5 mm into the surface. Related: `K.rivetLine(a, b, count, n | fn(p), r, seed)` and
  `K.rivetsOn(plateGeo, [[x, y]...], r, seed)`. Use `M.rivet`, with r around 4 to 6 mm on the body and 3 mm on hands.
- `K.weld(points, normals, { w = 0.0085, h = 0.0024, pitch = 0.0048, ripple, seg, seed })` lays a bead along a path. It
  sits on the surface with crescent ripples, a hand-laid width wobble and cratered ends. `normals` is a `V3`, an
  array (one per point) or `fn(s)`. `K.weldOn(plateGeo, [[x, y]...], opts)` does the same on a plate face. Use
  `M.weld`.
- `K.cable(points, r, { seg, tile })` makes a braided sleeve with UVs along it. `K.cableBundle(points, { n = 3, r, twist
  (turns/m), gap })` twists several cables. `K.cableEnds(points, outerR)` adds ferrules at both ends (use
  `M.gunmetal`). Cables use `M.cable`.
- `K.piston(name, boneA, pa, boneB, pb, { r })` makes a hydraulic piston between two bones (pa and pb are rest world
  points). The body (gunmetal) hangs on boneA, the chrome rod on boneB, and both aim at each other after every pose.
  They are exported as nodes `pist_<name>_a/_b` and their rotations are baked into the clips. Use it at the elbows and
  knees if it suits your design. Keep `pa`/`pb` on parts that do not swing through each other.
- `K.pistonGeos(d0, r)` returns the raw piston parts.
- `K.rotary(r, w, { bolts, ribs })` makes a ribbed joint actuator drum around X, centred on the origin:
  `{ housing (M.gunmetal), cap (M.iron, wear), bolts (M.rivet) }`. Rotate it for other axes and centre it on a pivot.
- `K.hexScrew(r, pos, normal, spin)`, `K.screwHead`, `K.placeScrew` (from `ws_screws.js`).
- `K.screenUV(geo, cx, cy, w, h)` maps a +Z-facing screen to atlas cell 0 (§8). `K.discUV(geo, n, R)` maps a glow disc
  for `TX.glowRadial`. The disc must be centred on the origin when you call it.
- `K.nickDecal(w)` returns a +Z-facing plane w wide (aspect 512:224) for `M.nick`.
- Utilities: `K.prng(seed)` (returns a `() => [0,1)`), `K.noise3`, `K.V3`, `K.deg`, `K.lerp`, `K.clamp01`, `K.sstep`.

The debug sample board (`m.board(true)`) shows every helper and material on the plinth. It hides N1CK. Frame it with
camera `[0, 0.62, 1.25]` and target `[0, 0.6, 0]`.

## 7. Materials and palette

All of these are `MeshStandardMaterial` (glass is Physical). Textured materials carry real maps (albedo, normal, and orm
where G = roughness and B = metalness), so they export to the .glb and to Unity. The material's colour, roughness and
metalness factors multiply the maps. `userData.tile` is metres per texture repeat for box UVs.

| `K.M` | glTF name | look | tile |
| --- | --- | --- | --- |
| `iron` | iron_plate | dark raw forged iron: blue-black mill scale with small lighter flakes, soft hammer facets, peen marks, pits, a few scratches. **Main body.** | 0.30 |
| `wear` | iron_wear | warm bare iron on worn edges (ground metal, scratches, leftover scale islands) | 0.30 |
| `inner` | iron_inner | crevices, panel-gap backs, inner frames: dark iron with a faint warm rust bloom | 0.25 |
| `gunmetal` | gunmetal | machined blue-grey steel: actuator housings, joint drums, ferrules, neck rings | 0.15 |
| `chrome` | piston_chrome | polished actuator rods | 0.10 |
| `stainless` | stainless_shroud | bright satin brushed stainless (brushed along U). **Only on the power-cell shroud** (the lore: stainless blocks Veinite), so it stays the one bright, different metal. | 0.12 |
| `weld` | weld_bead | weld metal with straw and blue heat tint | 0.05 |
| `rivet` | rivet_iron | rivet heads (iron maps, lighter) | 0.08 |
| `cable` | cable_braid | braided steel sleeve | 0.02 |
| `rubber` | rubber | boot soles, grommets, bumpers | 0.10 |
| `screen` | screen_face | face display: black base, emissive = face atlas (§8) | own UVs |
| `glass` | screen_glass | thin dark glass over the screen (transparent, clearcoat) | |
| `core` | energy_core | power cell core: emissive `TX.glowBand` along V (purple ends, dark red body, hot red middle). Use the cylinder's own UVs (V along the axis). | own UVs |
| `rim` | energy_rim | purple `#8a4dff` emissive edges and rings around the energy parts | |
| `field` | nullfield_glow | emitter disc face: emissive `TX.glowRadial` (hot red centre, dark red, purple edge). Needs `discUV`. Faint at rest; the viewer flares it. | own UVs |
| `fieldRim` | nullfield_rim | purple ring around each emitter | |
| `nick` | nick_scratch | the scratched "Nick" decal (alpha-tested, bright metal scratches with a dark burr) | own UVs |

Palette: gunmetal body (albedo about 0.19–0.25 sRGB, metalness 0.7–0.8, roughness about 0.5); warm bare iron on the
edges (about 0.58 / 0.55 / 0.50); dark red energy `#6b0f12` with a hot red centre and purple `#8a4dff` edges.

**Edge wear that survives export.** `opts.wear` runs `wearSplit`, which measures curvature from the mesh's dihedral
angles:

- Triangles on sharp convex edges (radius under about 9 mm; tune with `k`, in rad/m) go to `M.wear`. Noise
  (`chip`, `freq`) breaks them up so the edges look chipped, not outlined.
- Triangles in tight concave creases go to `M.inner`, which gives the rust bloom in crevices.

The split pieces are separate meshes on the same bone (`name_wear`, `name_inner`), so Unity gets one sub-mesh per
material. To make it work:

- Give plates real bevels (`K.plate` or `K.slab` with bevel ≥ 1.5 mm) and shared-vertex topology. CSG output has
  T-junctions, so it wears less.
- Use `wear` on every iron shell and plate, not on gunmetal or small parts.

## 8. Face screen and atlas

- Atlas `TX.faceAtlas` (canvas `TX.faceAtlasCanvas`) is 1024 × 768: **4 columns × 4 rows of 256 × 192 px cells** (4:3,
  the screen's shape). Each face is a 32 × 24 grid of warm off-white LEDs (8 px pitch) with glow; alert faces are red.
- Cell order (index = row × 4 + col, from the top left):

| | col 0 | col 1 | col 2 | col 3 |
| --- | --- | --- | --- | --- |
| row 0 | 0 neutral | 1 neutral_blink | 2 happy | 3 happy_blink |
| row 1 | 4 worried | 5 worried_blink | 6 laughing_a | 7 laughing_b |
| row 2 | 8 sad | 9 sad_blink | 10 alert (red) | 11 alert_blink (red) |
| row 3 | 12 talk_a | 13 talk_b | 14 focus | 15 off |

- The screen mesh's UVs cover **cell 0**: use `K.screenUV(geo, cx, cy, w, h)` on a +Z-facing screen surface in the same
  space as cx and cy (world for `addW`). To show cell i, offset the emissive map by
  `((i % 4) / 4, -floor(i / 4) / 4)`. The same offset rule holds in Unity (`_EmissionMap` / `_BaseMap` offset), so
  faces swap without re-rigging. `setFace(rig, name, tint, field)` does this in the viewer.
- The screen surface must be its own mesh with `M.screen`. Put a `M.glass` pane 1 to 2 mm in front if you like.
- **Alarm:** the viewer multiplies the emissive colour toward dark red (`#d8141a`) by `tint`. The alert cells are red
  in the atlas, so they read without a tint.
- **Face channel in clips:** `face_ctrl.position` = (cell index, alarm tint 0..1, nullfield glow 0..1). It is keyed in
  every clip with STEP interpolation, so the face, the tint and the emitter flare travel with the animation into the
  .glb. A Unity script reads `face_ctrl` and sets the material offset, colour and emitter intensity.

## 9. Hooks and the hidden "Nick"

- `K.hooks.chestPanel = (u) => { ... }` (torso). u runs from 0 (shut) to 1 (open). Swing a hinge node named
  `chest_panel` (a Group under `chest` or `upper_chest`; attach the panel meshes with `K.add(hingeNode, ...)`). It must
  be idempotent: set the rotation from u and never accumulate. The viewer's Chest toggle animates u over 0.7 s, and
  export sets it to 0.
- `K.hooks.chestView = { pos: [x, y, z], target: [x, y, z] }` (torso, optional) sets the camera for the chest close-up
  when the panel opens (world coordinates, rest pose).
- **"Nick"** is the only writing on him. Make it tiny: `K.nickDecal(0.035–0.05)` with `M.nick`, scratched on the inside
  face of the chest panel door, or on the frame behind it. Place it so it is hidden when the panel is shut and readable
  in the chest view when it is open. Offset it about 0.3 mm off the surface (the material also has polygon offset).

## 10. Animation (anim.js)

- **Pose:** `{ rot: { bone: [x, y, z] }, hips: [dx, dy, dz] }`. Angles are degrees, Euler order 'XYZ' (three.js default:
  the X rotation acts last, in the parent frame). `hips` is metres from the rest position. Missing bones stay at rest.
  `POSE.apply(rig, pose, from?, w?)` sets the rig (and solves pistons). `POSE.sym(rot, 'upper_arm', [x, y, z])` sets
  `_l` and mirrors `_r` = [x, -y, -z]. `POSE.curl(rot, side, finger, [a1, a2, a3], spread)` curls toward the palm
  (the thumb flexes about `D.thumbFlexAxis_l`, mirrored for the right). `POSE.axis(axisV3, deg)` gives Euler degrees
  for an axis-angle.
- **Axis guide (left side and spine; mirror for the right):**
  - Spine chain, neck, head: +X bends forward or nods down, +Y turns to his left, +Z tilts the top toward his right.
  - upper_arm: Z- lowers the arm (-74 hangs it relaxed at the side), Z+ raises it overhead. Once lowered, X- swings it
    forward and Y+ turns the palm forward.
  - lower_arm: Y- bends the elbow. X twists the forearm.
  - hand: Z- flexes the wrist toward the palm, Y- moves it toward the thumb side.
  - Fingers: use `curl`.
  - upper_leg: X- swings the leg forward, Z+ out to the side.
  - lower_leg: X+ bends the knee.
  - foot: X+ points the toes down.
  - toes: X- bends the toes up.
- **Clip registry:** `ANIM.CLIPS[name] = { len, loop, label, pose(t), face(t) → cell name, tint(t)?, field(t)? }`. `ANIM.ORDER`
  and `ANIM.LABELS` drive the page's clip buttons. A clip without root motion stays over the origin, and game code moves
  the root.
- **Clips to make:**

| clip | len | loop | content | face |
| --- | --- | --- | --- | --- |
| idle | 4.0 | yes | open, warm stance, breathing, small weight shift (exists, refine it) | neutral, blinks |
| walk | 1.1 | yes | one full cycle in place at about 1.3 m/s (two steps of about 0.72 m), easy arm swing, chest open | neutral or happy, blinks |
| talk_gesture | 4.0 | yes | expressive open-palm hand gestures, small head nods | talk_a / talk_b / neutral flaps, the odd happy |
| wave | 2.4 | no | right hand up, three waves, back down | happy, happy_blink |
| laugh | 2.0 | no | shoulders bounce, head back, a hand to the belly | laughing_a / _b at about 7 Hz |
| sad | 3.0 | no | shoulders slump, head down, arms heavy | sad, sad_blink |
| worried | 2.6 | no | hands wring near the chest, glances left and right | worried, worried_blink |
| alert | 1.6 | no | snaps to ready, head turns, weight forward | alert (`tint` rises to about 0.8) |
| nullfield_activate | 1.8 | no | braces, shoulders roll back to bare the emitters, chest out | focus (`field` ramps 0 → 1 → 0.6) |

  Loops must match at t = 0 and t = len. Every clip should start and end close to idle(0), so the page's 0.35 s blends
  and Unity's crossfades look clean. Hands matter: he gestures a lot, so curl the fingers individually, with thumbs
  alive.

## 11. Page and debug contract

The page has a dark concrete bay and a turntable plinth (top at y 0, radius 0.62). It is lit by a warm key light,
violet and warm rim lights, and a cool fill, and runs a slow turntable orbit. UI:

- clip buttons from `ANIM.ORDER`;
- expressions: Auto, Neutral, Happy, Worried, Laughing, Sad, Alert;
- toggles: Alarm, Nullfield, Chest;
- views: Full, Face, Hands, Back;
- Orbit.

`m = window.__model.debug`:

- `tick(dt)`, `stop()`, `renderOnce()` (waits for the GPU);
- `set(clip, t)` holds a clip's pose and face at time t;
- `face(name | null)` holds a face cell; `expr(name | null)` picks an expression as the UI does;
- `alarm(on)`, `field(on)`, `panel(u)`;
- `showRef(on)` shows the 1.85 m bar with 10 cm ticks and lines at 1.85, 1.47, 0.955 and 0.515;
- `board(on)` shows the sample board;
- `rest()` sets the T-pose;
- `goView(name)` with name `full`, `face`, `hands`, `back` or `chest`; `setSpin(on)`;
- `pivot`, `camera`, `controls`, `scene`, `renderer`, `composer`, `bloom`, `ao`;
- `rig`, `bones`, `K`, `D`, `J`, `M`, `TX`, `POSE`, `ANIM`, `st`, `timings`, `partErrors`.

`closeups.js` resets `pivot.rotation.y` to 0 for every view, so camera positions are in world space with N1CK facing
+Z. Useful views:

- full front: `[0, 1.0, 4.6]` → `[0, 0.95, 0]`
- 3/4: `[1.6, 1.35, 3.4]` → `[0, 0.98, 0]`
- face: `[0.25, 1.77, 0.75]` → `[0, 1.73, 0.03]`
- hands in idle: `[0.95, 1.05, 0.95]` → `[0.3, 0.88, 0.06]`
- back: `[0, 1.2, -4.2]` → `[0, 0.95, 0]` (the wall sits at z -4.8)

Use `"setup": "m.rest()"` for the T-pose.

## 12. Export (integrator)

`window.__model.exportGLB()` writes `n1ck.glb`:

- the live rig at rest, with every bone, `face_ctrl` and the piston nodes;
- all clips sampled at 30 fps (every bone's quaternion, the hips position, the `face_ctrl` position as STEP, the piston
  quaternions);
- textures embedded (albedo as JPEG, normal and orm as PNG);
- extras on the root: units, axes, joint table, humanoid map, face atlas layout, face channel, clip list.

`window.__model.faceAtlasPNG()` returns the atlas as base64 PNG for `textures/n1ck-face-atlas.png`.

`tools/unity-export.js` keeps our UVs and merges the meshes per bone (one sub-mesh per material), with LODs and box
colliders per bone (usable as hitboxes). Vertex colours are not used anywhere.

Measured with the blockout: the export takes about 2.3 min in software rendering and the file is 13.5 MB, mostly
textures.
