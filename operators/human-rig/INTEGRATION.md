# Human operator rig: integration guide

For anyone (or any Claude session with no context) who rebuilds, changes or ships this character. Units are metres and
degrees. Blender space: Z up, he faces -Y, his left is +X. glTF: Y up, he faces +Z, his left is +X (glTFast negates X
on import; he faces +Z in Unity too).

## 1. Source and rebuild

The asset is assembled from 24 module builds (each its own script, `mods/<id>.blend` + `mods/<id>.json` manifest) on a
shared base (`base/rig_base.blend`: the human-proto Rig, Body, head parts, mounts and fit proxies). The module contract
is `DESIGN.md` of the working folder; module scripts, `common.py` and `matlib.py` are under `source/build/` only where
this integration changed them (`matlib.py`: softer 1.5 mm jersey knit; `mod_headset.py`: smooth boom and downlead;
`common.py`: headset budget; fixB: `mod_pistol_mags.py` / `mod_dump.py` / `make_base.py` with the moved belt
mounts, `set_belt_mounts.py` that rewrote them in `base/mounts.json` (copy in `source/base/`): pistol mags +93 / +106.5°,
dump +131°). Working folder of the session that made it:
`/tmp/claude-0/-home-user/54ae899d-ab9c-5ac8-991a-a7fa61aa138b/scratchpad/human/rig` (`$R`; the prototype `$H` is its
parent, with the bpy venv and node_modules).

    $H/venv/bin/python $R/build/integrate_rig.py --all        # about 1.5 min; or --stage <name>, --from <name>
    $R/build/post_export.sh                                   # tangent fix, validator, web pack (pack_web_rig.mjs), viewer.html
    $H/venv/bin/python $R/build/make_unity.py                 # HumanRig.cs module table from the report
    $H/venv/bin/python $R/build/render_deliver.py --hero --sheet
    node $R/build/viewer_check_rig.js deliver/.../viewer.html deliver_checks   # (cwd $H)

| Stage | Does | Output |
| --- | --- | --- |
| `assemble` | appends every `GEAR_<id>` onto the one Rig, rebuilds every material from `matlib` (dedup by name), strips the hero Subsurf, lifts Rig + meshes by the boots' `ground_offset_m` (25 mm), splits the left rifle magazine into `RMAG_ReloadMag`, adds the prop bones and sockets | `final/stage/1_assembled.blend` |
| `anim` | `anim_rig.py`: the 8 clips (own FK + analytic two-bone IK), keyed as NLA strips | `2_anim.blend` |
| `fix` | corrective weights, skin poke-through masks (`final/extra_masks.json`), penetration scan per module and clip | `3_fix.blend`, `report.json` |
| `pack` | Body `hidemask` face attribute, hair-shell helmet chunks, one joined skinned mesh per module / part / variant with glTF extras | `4_pack.blend` |
| `lods` | LOD1 / LOD2 (collapse decimate, open borders and chunk borders protected), Body decimated once then split per level, tris / draw calls per preset | `final/human_rig.blend` |
| `export` | realtime materials (WEAR dropped; fabric sheen weight baked into the exported sheen colour), skinned meshes unparented to the root, degenerate faces removed, JPEG textures, 3 GLBs (sampled animation, constant channels as 2 keys) | `deliver/...`, `final/human-rig_web.glb` |

`pen_rig.py` is the tuning probe (`--rebuild --clips Ready,Reload`; environment overrides `ANIM_GEAR`, `ANIM_CROUCH`,
`ANIM_HOLSTER`, `ANIM_HOLSTER_BELT` take JSON to sweep the pose parameters). `render_rig.py` renders any loadout / clip /
frame / view in Cycles.

## 2. Modules

Node names: `<module>` for the main part, `<module>-<part>` for optional parts, `<module>-<variant>` for variants (in
`unity/` with `_LOD0/1/2`). Every node carries glTF `extras`: `module`, `part`, `variant`, `requires`, `part_requires`,
`hidden_with`, `exclusive_with`, `hidden_by` (Body / hair chunks), `lod`, `source_meshes`. LOD0 triangles; Bones =
distinct deform bones the module is weighted to.

| Module | Nodes (glTF) | LOD0 tris | Materials | Bones | Default | Requires / exclusive |
|---|---|---|---|---|---|---|
| `shirt` | `shirt` | 8,080 | Jersey, MetalHW, Ripstop, Webbing | 31 | Assault | – |
| `trousers` | `trousers` | 6,406 | Ripstop, Webbing | 16 | Assault | – |
| `boots` | `boots` | 6,782 | Cordura, Elastic, Leather, MetalHW, Rubber, Webbing | 34 | Assault | – |
| `gloves` | `gloves` | 4,629 | Elastic, Jersey, Leather, Rubber, Webbing | 44 | Assault | – |
| `kneepads` | `kneepads` | 2,048 | Cordura, Polymer, Rubber, Webbing | 8 | Assault | – |
| `elbowpads` | `elbowpads` | 1,560 | Cordura, Polymer, Rubber, Webbing | 8 | Assault | – |
| `carrier` | `carrier`, `carrier-led` | 12,264 | Cordura, LED, Polymer, Webbing | 9 | Assault | excl. chest_rig |
| `helmet` | `helmet`, `helmet-bare`, `helmet-cover` | 7,337 | Cordura, Elastic, Jersey, MetalHW, Polymer, Rubber, ShellPaint, Velcro, Webbing | 1 | Assault | – |
| `neck_groin` | `neck_groin-groin`, `neck_groin-neck` | 2,428 | Cordura, MetalHW, Webbing | 15 | off | needs carrier |
| `belt` | `belt` | 3,896 | Cordura, Elastic, MetalHW, Webbing | 9 | Assault | – |
| `rifle_mags` | `rifle_mags`, `rifle_mags-reload_mag` | 5,388 | Cordura, Elastic, MetalHW, Polymer, Webbing | 4 | Assault | needs carrier |
| `pistol_mags` | `pistol_mags` | 2,528 | Kydex, MetalHW, Polymer, Rubber | 4 | Assault | needs belt |
| `chest_rig` | `chest_rig` | 8,208 | Cordura, Elastic, MetalHW, Polymer, Webbing | 7 | off | excl. carrier, rifle_mags, admin_hydration, radio, bang_pouches, sling |
| `dump` | `dump` | 1,372 | Cordura, Elastic, MetalHW, Polymer, Webbing | 4 | Assault | needs belt |
| `ifak` | `ifak-ifak`, `ifak-tq` | 2,636 | Cordura, Elastic, MetalHW, Polymer, Webbing | 6 | Assault | needs belt |
| `radio` | `radio` | 2,256 | Cordura, Elastic, MetalHW, Polymer, Rubber, Webbing | 5 | Assault | needs carrier |
| `admin_hydration` | `admin_hydration-admin`, `admin_hydration-hydration` | 2,348 | Cordura, MetalHW, Polymer, Rubber, Webbing | 5 | Assault | needs carrier |
| `holster_drop` | `holster_drop`, `holster_drop-pistol` | 3,806 | Cordura, Kydex, MetalHW, Polymer, Webbing | 6 | Assault | needs belt; excl. holster_belt |
| `holster_belt` | `holster_belt`, `holster_belt-pistol` | 2,610 | Kydex, MetalHW, Polymer | 4 | off | needs belt; excl. holster_drop |
| `sling` | `sling` | 1,286 | Cordura, MetalHW, Polymer, Webbing | 13 | Assault | needs carrier |
| `headset` | `headset`, `headset-downlead`, `headset-headband`, `headset-rails` | 3,024 | MetalHW, Polymer, Rubber | 4 | Assault | – |
| `eyewear` | `eyewear-glasses`, `eyewear-goggles` | 1,286 | Lens, Polymer, Rubber, Webbing | 1 | Assault | – |
| `bang_pouches` | `bang_pouches` | 1,840 | Cordura, MetalHW, Polymer, Velcro, Webbing | 4 | Assault | needs carrier |
| `knife` | `knife-knife`, `knife-multitool` | 1,116 | Cordura, Kydex, MetalHW, Polymer, Velcro, Webbing | 4 | Assault | needs belt |

The body module is `Body*` (chunks, below), `Eyes`, `Mouth`, `Brows`, `Lashes`, `HairShell1..5` and `HairShell1..5__helmet`.

**Part and variant rules.** `headset-headband` hides while the helmet is on; `headset-rails` needs the helmet;
`headset-downlead` needs the radio; `eyewear-goggles` needs the helmet (its strap is fitted around the shell);
`helmet-bare` / `helmet-cover` replace each other (the liner, rails, shroud and retention in `helmet` are shared);
`knife-knife` / `knife-multitool`; `rifle_mags-reload_mag` is the one magazine the Reload clip moves; `*-pistol` is the
pistol in either holster (hide it when the game holds the pistol). A module whose requirement is off is not shown
(it stays selected and comes back with it).

**Presets.**

| Preset | Modules |
| --- | --- |
| Body | none |
| Base | shirt, trousers, boots, gloves |
| Light | Base + knee pads, chest rig, belt, pistol mags, drop-leg holster, IFAK, dump pouch, headset (headband), glasses |
| Assault (default) | everything `default_on`: Base + both pads, carrier (with LED), helmet (cover), belt, rifle and pistol mags, dump, IFAK + TQ, radio, admin + hydration, drop-leg holster, sling, headset (rails + downlead), glasses, bang pouches, knife |
| Full | Assault + neck and groin |

Holster variant: switching to `holster_belt` turns `holster_drop` off (mutually exclusive); play `HolsterBelt` with it.

## 3. Toggling and the body mask chunks

The skin under the base clothing is not deleted: each Body face carries the set of base garments that cover it, and
the Body is split into one chunk per distinct set. A chunk shows only while none of its garments is on, so every
combination is hole-free with no runtime mesh edits. Masks = the module manifests' `hides_body_faces` plus faces that
poked through the garment in any of 64 clip frames (`final/extra_masks.json`: shirt +89, trousers +7, boots +1; the
right pec / armpit poke-through of the fix round is gone this way). Faces within 20 mm of a hem stay visible.

| Chunk | Hidden while | LOD0 / LOD1 / LOD2 tris |
| --- | --- | --- |
| `Body` | never (head, neck, wrists and hem margins) | 8,952 / 3,115 / 1,283 |
| `Body__shirt` | shirt | 4,804 / 2,868 / 1,330 |
| `Body__trousers` | trousers | 2,188 / 1,577 / 809 |
| `Body__gloves` | gloves | 6,600 / 2,401 / 1,003 |
| `Body__boots` | boots | 4,202 / 2,079 / 925 |
| `Body__shirt__trousers` | shirt or trousers | 8 / – / – |
| `Body__trousers__boots` | trousers or boots | 2 / – / – |
| `HairShellN__helmet` (×5) | helmet | 232 each (LOD1 shells 1, 3, 5; LOD2 shells 1, 4) |

Ground offset: the file stands on the boot soles (Rig and meshes lifted 25 mm). Without boots, move the model down
0.025 m (the viewer and `HumanRig.cs` do this).

## 4. Rig, bone map, props and sockets

MakeHuman default skeleton (163 bones) named for Unity Humanoid, plus three prop bones; at most 4 influences per vertex,
normalised. Rest pose: MakeHuman's A-pose.

| Unity human bone | File bone |
| --- | --- |
| Hips / Spine / Chest / UpperChest | `Hips` / `Spine` / `Chest` / `UpperChest` (`spine04`, `spine02` between them, unmapped) |
| Neck / Head / Jaw / eyes | `Neck` (`neck02`, `neck03` unmapped) / `Head` / `Jaw` / `LeftEye`, `RightEye` |
| Shoulder, UpperArm, LowerArm, Hand | `LeftShoulder`, `LeftUpperArm`, `LeftLowerArm`, `LeftHand` (and Right) |
| UpperLeg, LowerLeg, Foot, Toes | `LeftUpperLeg`, `LeftLowerLeg`, `LeftFoot`, `LeftToes` |
| Fingers | `LeftThumbProximal` ... `LeftLittleDistal` |

Extras (unmapped): twist bones, `pelvis.L/R`, `shoulder01.L/R`, metacarpals, toes, face bones, and

| Prop bone | Parent | Skins | In other clips |
| --- | --- | --- | --- |
| `PropPistolDrop` | `RightUpperLegTwist` | `holster_drop-pistol` | follows the leg holster exactly |
| `PropPistolBelt` | `Hips` | `holster_belt-pistol` | keyed to the blend of `pelvis.R` / `RightUpperLeg` / `spine04` / `Spine` the holster uses |
| `PropMag` | `spine02` | `rifle_mags-reload_mag` | keyed to the front-panel blend (`spine02` .47, `Chest` .21, `UpperChest` .18, `spine04` .15) |

Prop bone frame: +Y = muzzle (pistol) / feed end (magazine), pistol slide on -Z, grip toward +Z.

| Socket (empty, child of the bone) | Bone | Rest position, glTF (x, y, z) | Use |
| --- | --- | --- | --- |
| `SOCKET_RightHandGrip` | `RightHand` | (-0.542, 1.127, 0.263) | palm centre: attach a rifle / weapon (x across the knuckles, y along the fingers) |
| `SOCKET_PistolHolster` | `RightUpperLegTwist` | (-0.276, 0.804, 0.032) | the drop-leg pistol's rest frame |
| `SOCKET_PistolBelt` | `Hips` | (-0.234, 1.033, -0.007) | the belt pistol's rest frame |
| `SOCKET_RifleSling` | `spine04` | (-0.084, 1.043, 0.148) | the sling's QD swivel parked on the belt |

To show a real pistol drawn, hide `holster_*-pistol` and attach the weapon to the prop bone (or to the hand socket).

## 5. Clips

All 30 fps, in place (root at the origin), loop, baked from `anim_rig.py` (FK + analytic two-bone IK; knee and elbow
poles). The geared versions of the proto clips: relaxed arms abducted (left wrist 105 mm, right 150 mm further out, right
hand 70 mm forward, elbows pushed out) to clear the cummerbund pouches and the holster grip; rifle 110 mm forward of the
front plate bag, support hand further out on the handguard (0.60 m along the bore, 110 mm to the left); LookAround
turns 22 % from the hips and pushes the rifle forward when looking right; CrouchIdle 220 mm deep (was 300), feet 150 mm
wider, hip pitch 6° and spine bend 15° (fixB, were 9° / 19°: the belly no longer folds onto the belt front), knees
out. Reload (fixB): the rifle swings 0.30 inboard (muzzle ~17° to his left) while tilted so the magwell comes to the
support hand, the mag path bows 50 mm forward round the pouch edge, the hand holds the mag at its baseplate end.
Holster (fixB): the hand comes in from outside and above, sits high on the still-holstered grip (fingers clear of the
shell mouth and hood) and only closes fully as the pistol clears; from the belt holster the drawn pistol drifts 60 mm out
and 30 mm back, under the bang pouches. Tuning hooks: `ANIM_GEAR`, `ANIM_CROUCH`, `ANIM_HOLSTER`, `ANIM_HOLSTER_BELT`,
`ANIM_MAG_HAND`, `ANIM_PISTOL_HAND` (JSON).

| Clip | Length | Notes |
| --- | --- | --- |
| `Idle` | 4 s | breathing, weight shift, head drift |
| `Ready` | 3 s | low ready, bladed stance, rifle hold |
| `Walk` | 1.1 s | move the root at 0.94 m/s |
| `CrouchIdle` | 4 s | crouch, right heel up, rifle hold |
| `LookAround` | 6 s | scans 55° left and 50° right, eyes lead |
| `Holster` | 4.2 s | 0.15-0.70 s reach (shoulder dips 24° to clear the bang pouches), 0.80-1.15 draw 170 mm out along the bore, rock to the hip, 1.45-1.85 present (isosceles, two-handed), hold to 2.65, then compress, reholster, release |
| `HolsterBelt` | 4.2 s | the same from the belt holster (leans the other way, elbow back) |
| `Reload` | 3.6 s | from Ready: muzzle up 14° and rifle tilted inboard, support hand to the left magazine (0.65 s), pull 140 mm out, to the magwell (1.5 s), seat, strip, back into the pouch (2.85 s), hand back to the handguard |

Penetration after the clip work (module vertices > 1 mm inside the skin, worst of 12 frames per clip; base garments
only count where the skin they cover would be visible; held props excluded). Target ≤ 20, bold = over. Before fixB: `pistol_mags` 644 and `belt` 36 in CrouchIdle,
`carrier` 70 / `rifle_mags` 68 / `admin_hydration` 26 in Reload, `holster_drop` 34 / `holster_belt` 29, `chest_rig` 157
in Reload. A 36-frame resample of every clip keeps all Assault modules at or under 20 as well (holsters 13 / 11,
rifle mags 12).

| Module | Idle | Ready | Walk | CrouchIdle | LookAround | Holster | HolsterBelt | Reload |
|---|---|---|---|---|---|---|---|---|
| `shirt` | 5 | 0 | 8 | 0 | 0 | 16 | 5 | 2 |
| `trousers` | 0 | 0 | 4 | 0 | 0 | 5 | 0 | 0 |
| `boots` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `gloves` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `kneepads` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `elbowpads` | 0 | 0 | 0 | 0 | 0 | 3 | 4 | 3 |
| `carrier` | 1 | 0 | 6 | 2 | 17 | 5 | 2 | 2 |
| `helmet` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `neck_groin` | 1 | 0 | 2 | 0 | 0 | 1 | 1 | 0 |
| `belt` | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| `rifle_mags` | 0 | 2 | 0 | 4 | 5 | 0 | 0 | 12 |
| `pistol_mags` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `chest_rig` | 5 | 19 | 4 | 13 | **29** | **21** | **21** | **56** |
| `dump` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `ifak` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `radio` | 4 | 0 | 11 | 0 | 7 | 16 | 2 | 3 |
| `admin_hydration` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9 |
| `holster_drop` | 8 | 8 | 12 | 0 | 8 | 13 | 0 | 8 |
| `holster_belt` | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0 |
| `sling` | 6 | 6 | 8 | 7 | 7 | 12 | 6 | 6 |
| `headset` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `eyewear` | 1 | 1 | 1 | 0 | 2 | 2 | 2 | 1 |
| `bang_pouches` | 0 | 0 | 18 | 0 | 5 | 0 | 2 | 0 |
| `knife` | 0 | 0 | 0 | 17 | 5 | 0 | 0 | 0 |

Corrective weights: belt sleeve / webbing / holster hanger lowest row ramps up to 40 % onto the thigh at the front
sides; knife and multitool 30 % onto `LeftUpperLeg`. Pistol mags need none since they moved to the hip.

## 6. LODs

LOD1 ≈ 45 %, LOD2 ≈ 20 % of the manifest ratios (Assault 100.7k / 42.8k / 18.6k). Collapse decimation with open borders
(hems, strap ends) and Body chunk borders protected by a vertex group, then an unprotected finish pass where the
protection saturates (small hard-surface parts). Parts keep at least ~60 tris. Dropped: brows and lashes from LOD1
(painted brows in the skin texture), the mouth and at LOD2 the knife / multitool, glasses, carrier LED and headset
downlead; hair shells 1, 3, 5 at LOD1 and 1, 4 at LOD2.

## 7. Unity setup (glTFast, Unity 2021.3 LTS to Unity 6)

1. Install glTFast. Copy `unity/human-rig.glb` into `Assets/`; importer **Animation: Legacy**.
2. Add `HumanRig` (`../../unity/Runtime/HumanRig.cs`) to the instance root. On Awake it builds the LODGroup (screen heights
   0.45 / 0.18 / 0.015), applies `startPreset` (Assault), fixes materials (LED emission 6×, hair alpha clip and double
   sided, cornea and lens transparent, no shadows from strands / eyes / glasses) and plays `startClip`.
   API: `ApplyPreset(name)`, `SetModule(id, on)` (enforces `exclusive_with`, e.g. carrier ↔ chest rig, drop ↔ belt
   holster), `SetVariant(id, v)`, `SetHolster(belt)`, `IsOn(id)`, `Play(clip, fade)`, `PlayOnce(clip, then)`,
   `Socket(name)`, `Attach(go, socketOrPropBone)`, `ForceLod(i)`. Module requirements, part rules, Body / hair chunks and
   the boots ground offset (`modelRoot` drops 25 mm without boots) are applied on every change. glTFast does not import
   glTF extras, so the module table is generated into the script (`make_unity.py`).
3. Humanoid: select the model, **Tools > Gunmodls > Human Rig > Build Humanoid Avatar** (`../../unity/Editor/HumanRigAvatar.cs`):
   maps the bones by name, records a T-pose on a temporary copy, saves `<model>_Avatar.asset`. The prop bones and sockets
   stay unmapped (animate them yourself or parent weapons to the hand).
4. Both scripts compile with `mcs` against minimal API stubs (no Unity was available to test them in an editor).

## 8. Viewer contract

`viewer.html` exposes `window.__model = { id: 'human-rig', ready, exportScenes(), exportGLB(), debug }`.
`exportGLB()` returns `[{file: 'human-rig-web.glb', base64, bytes}]` (the embedded web GLB, 9.8 MB: meshopt level high, no TANGENT, WebP textures with
normal maps / skin / hair / webbing trim at 1K and the other gear albedo / ORM at 512, redundant animation keys removed;
`pack_web_rig.mjs`); Khronos PBR Neutral tone mapping; `exportScenes()` lists
the LOD0 nodes each preset shows. `debug`: `set(clip, t)`, `play(clip)`, `clips()`, `preset(name)`, `toggle(id, on)`,
`loadout()`, `visible()`, `modules()`, `presets()`, `lod(0|1|2|'auto')`, `lights(name)`, `spin(on)`,
`goView('full'|'face'|'armour'|'back'|'hips')`, `stop()`, `renderOnce()`, `stats()`, `tick(dt)` plus three objects.
Headless check (`viewer_check_rig.js`, swiftshader, 1280 × 860 and 390 × 844): every module toggled, every preset and
clip run, no page errors (the only console error is the Google Fonts request, blocked offline on purpose).
