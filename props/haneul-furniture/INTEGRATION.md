# Haneul furniture pack: integration guide

For anyone (or any session) placing these pieces in a level, wiring the breaking into the game, or changing the
pack. `viewer.html` is the reference and the source; `parts.json` holds every number below in machine-readable
form; `../../unity/Runtime/BreakableFurniture.cs` is a Unity runtime for it. The script was written for Unity 2021
LTS through Unity 6 with no extra packages, but it has not been compiled in this repo.

Units are metres, kilograms and seconds. Positions are in glTF space unless a line says Unity. glTFast negates X on
import: glTF +X is Unity -X, rotations about X stay the same, and rotations about Y and Z flip sign. Nothing in the
metadata is a coordinate, so the script needs no conversion.

## Placing a piece

- Each file is one piece. Its origin is on the floor, exactly under the middle of its footprint (the centre of its
  bounding box in x and z), and its lowest point is at y = 0. Drop it on any floor at the point you want.
- Front is +Z, up is +Y, and the piece's own left is +X. Turn it about Y only. A sofa's front, a desk's knee
  side and a bar counter's fluted customer side all face +Z.
- Real size. Do not scale pieces: masses, health and chunk sizes are for 1:1.
- Wall pieces (`bottle_shelf`, `cigar_humidor`, `wardrobe`, `media_wall`, `vault_shelving`) have their backs
  at -Z: put that face against the wall.
- Use as many copies as you like. Each copy breaks on its own.
- Use `unity/<id>.glb` in Unity. The plain `glb/<id>.glb` files are for other engines and for checking.

## What is in a file (the naming contract)

One root node named after the piece id (the glTF scene is named `<id>_scene`, so three.js's loader keeps the root's
name). Under the root, flat:

```
<id>                          root, identity transform; extras.furniture = the piece's metadata
  part_<name>                 one per part, at the part's pivot (its box centre, or its hinge for doors and flaps)
    <name>_<material>_<k>     the part's meshes, one material each, in the part's frame
    col_<name>[_<i>]          box collider proxy (invisible material 'collider'), in the part's frame
    col_<name>[_<i>]_hull     convex collider proxy (a hull mesh)
  chunks_<name>               shatter parts only: same transform as part_<name>, stored at SCALE 0.0001 (hidden)
    chunk_<name>_<i>          i = 1..n, at the chunk's centroid; extras { chunk_of, mass, fixed (torn-paper strip) }
      <name>_c<i>_<k>_<mat>   outer surface (the part's material) and fracture faces (its inner material)
  debris                      SCALE 0.0001 (hidden); extras { hidden_scale }
    debris_<i>                small loose bits, at the middle of the part they come from;
                              extras { debris_of, kind, material, mass }
```

- Every name is unique in its file: chunk names carry the part name (`chunk_top_3`), not just a number, because
  loaders rename duplicates.
- Part names are lower snake case: `top`, `leg_fl` (front left is +X, +Z), `door_l`, `drawer_2`, `shelf_1`,
  `pane_l`, `screen`, `monitor_r`. Numbered parts start at 1.
- The hidden sets use a tiny scale rather than a visibility flag, because glTF has no portable visibility. A game
  hides the group at load, sets its scale back to 1, and shows it when that part breaks.
- Colliders are children of their part, so they go with it when it comes loose. Every part has at least one.
  Box proxies are axis-aligned in their node's frame; some are turned about Y (for example the folding screen's
  panels).
- **In the `unity/` copies** the meshes are merged per node into `<node>_LOD0`, `_LOD1` and `_LOD2`. Each box
  proxy becomes a group `col_x` holding a box `col_x_COL`, and each hull becomes `col_x_hull` holding
  `col_x_hull_HULL`. Every chunk gets a convex hull of its own mesh, `chunk_<name>_<i>_HULL` (the cells are convex,
  and boxes of neighbouring cells would overlap), and every debris node its own `_COL` box. Every hull has at most
  250 triangles (Unity's limit for a convex MeshCollider is 255). Extras are kept, but glTFast does not import
  extras, which is why the script reads `parts.json`.
- Proxies of cabinets, racks and frames are shells (sides, top, base, back, dividers, stiles and rails), so the
  drawers, blades, boxes, shelves, glass and paper inside them are not inside another part's solid box. Thin
  lattices in front of paper have no proxy, so a shot through one reaches the paper.

## Metadata

Root extras `furniture` (and each entry of `parts.json` `pieces`): `id, name, batch, rooms, cover, size_m,
floor_contact, mass_kg, parts, debris (count), triangles { intact, chunks }, hidden_scale, note`. Each part, on its
`part_<name>` node and in `parts`:

| Field | Meaning |
| --- | --- |
| `part` | The name (`part_<part>` node, `chunks_<part>` group). |
| `material` | Material class for sounds and effects: wood, glass, metal, fabric, ceramic, stone, plastic, electronics, paper or plant. |
| `materials` | The glTF material names on the part. |
| `mass` | kg. Chunk masses split it by volume. |
| `health` | Hit points (see the health scale). |
| `break` | `shatter`: swaps to its chunks at 0 hp. `detach`: comes loose whole. `fixed`: never breaks (an anchor). |
| `attach`, `need` | Support: the part comes loose when fewer than `need` of the parts in `attach` are still in place. `ground` means it stands on the floor. |
| `stops_bullets` | True only for hard-cover cores (render rack frame and blades, vault frame and boxes, planter basin, garden bench plinths). |
| `chunks` | How many chunks the part has (0 if it does not shatter). |
| `fixed_chunks` | Torn paper only: the 1-based numbers of its chunks that stay put (the border strip glued to the frame). They stay on the part named first in `attach` and go with it. |
| `collapse` | A shatter part that shatters (instead of coming loose) when its support goes: the soil in `planter_large` and `potted_tree`. |
| `debris` | Names of its `debris_<i>` nodes. |
| `colliders` | Names of its `col_*` proxies. |

`parts.json` also has `classes` (per class: `density_kg_m3`, `base_health`, `debris` kind) and `materials`
(key, glTF name, class, inner material for fracture faces).

### Health scale

These are hit points; the game's own weapon numbers apply. As a guide: a rifle round is about 35–45, an SMG round
25–35, a shotgun pellet about 12, a melee hit 100, a frag grenade about 300 at the centre falling to 0 at 4 m, a
breach charge 500 within 1 m. Unless a piece sets its own, a part's health is its class base × cbrt(mass / 5),
clamped to 0.5–3 times the base and rounded to 5:

| Class | Density kg/m³ | Base health | Debris kind |
| --- | --- | --- | --- |
| glass | 2500 | 20 | shard |
| paper | 500 | 15 | scrap |
| ceramic | 2300 | 25 | shard |
| electronics | 700 | 40 | crumb |
| plant | 400 | 30 | leaf |
| plastic | 1100 | 60 | crumb |
| fabric | 45 | 80 | tuft |
| wood | 650 | 120 | splinter |
| metal | 2700 | 250 | bolt |
| stone | 2600 | 400 | crumb |

So a glass pane breaks to one round, a chair leg to two, a wooden tabletop to three or four, and a stone top to a
grenade. Steel frames are `fixed`.

### Materials

All textures are procedural tiling sheets (albedo, normal, ORM) stored as JPEG; each file carries only the ones it
uses. Fracture faces use the inner material. Chunks of lit parts use the unlit twin (`paper_hanji_lit` becomes
`paper_hanji`; `screen` and the `led_*` materials become `screen_off`).

| Key | glTF name | Class | Fracture faces |
| --- | --- | --- | --- |
| `walnut` | `wood_walnut` | wood | `walnut_inner` |
| `oak` | `wood_oak` | wood | `oak_inner` |
| `ebony` | `wood_ebony` | wood | `ebony_inner` |
| `woodInner` | `wood_inner` | wood | `wood_inner` |
| `walnutInner` | `walnut_inner` | wood | `walnut_inner` |
| `oakInner` | `oak_inner` | wood | `oak_inner` |
| `ebonyInner` | `ebony_inner` | wood | `ebony_inner` |
| `bark` | `bark` | plant | `wood_inner` |
| `fabricCharcoal` | `fabric_charcoal` | fabric | `foam_inner` |
| `fabricOat` | `fabric_oat` | fabric | `foam_inner` |
| `fabricIndigo` | `fabric_indigo` | fabric | `foam_inner` |
| `fabricCinnabar` | `fabric_cinnabar` | fabric | `foam_inner` |
| `fabricOchre` | `fabric_ochre` | fabric | `foam_inner` |
| `fabricPlum` | `fabric_plum` | fabric | `foam_inner` |
| `leatherCognac` | `leather_cognac` | fabric | `foam_inner` |
| `leatherBlack` | `leather_black` | fabric | `foam_inner` |
| `foam` | `foam_inner` | fabric | `foam_inner` |
| `hanji` | `paper_hanji` | paper | `paper_hanji` |
| `hanjiLit` | `paper_hanji_lit` | paper | `paper_hanji` |
| `celadon` | `celadon` | ceramic | `ceramic_biscuit` |
| `porcelain` | `porcelain` | ceramic | `ceramic_biscuit` |
| `biscuit` | `ceramic_biscuit` | ceramic | `ceramic_biscuit` |
| `granite` | `stone_granite` | stone | `stone_inner` |
| `palestone` | `stone_pale` | stone | `stone_inner` |
| `pebble` | `stone_pebble` | stone | `stone_inner` |
| `marble` | `stone_marble` | stone | `stone_inner` |
| `marbleHoned` | `stone_marble_honed` | stone | `stone_inner` |
| `basalt` | `stone_basalt` | stone | `stone_inner` |
| `stoneInner` | `stone_inner` | stone | `stone_inner` |
| `brass` | `brass` | metal | `metal_inner` |
| `alloy` | `alloy_dark` | metal | `metal_inner` |
| `graphite` | `graphite` | metal | `metal_inner` |
| `steel` | `steel_brushed` | metal | `metal_inner` |
| `metalInner` | `metal_inner` | metal | `metal_inner` |
| `glass` | `glass_clear` | glass | `glass_edge` |
| `glassSmoked` | `glass_smoked` | glass | `glass_edge` |
| `glassTint` | `glass_tint` | glass | `glass_edge` |
| `glassFrosted` | `glass_frosted` | glass | `glass_edge` |
| `glassAmber` | `glass_amber` | glass | `glass_edge` |
| `glassGreen` | `glass_green` | glass | `glass_edge` |
| `glassEdge` | `glass_edge` | glass | `glass_edge` |
| `plastic` | `plastic_dark` | plastic | `plastic_dark` |
| `rubber` | `rubber` | plastic | `rubber` |
| `screen` | `screen` | electronics | `electronics_inner` |
| `screenOff` | `screen_off` | electronics | `electronics_inner` |
| `pcb` | `electronics_inner` | electronics | `electronics_inner` |
| `led` | `led_purple` | electronics | `electronics_inner` |
| `ledWarm` | `led_warm` | electronics | `electronics_inner` |
| `ledWhite` | `led_white` | electronics | `electronics_inner` |
| `ledDim` | `led_purple_dim` | electronics | `electronics_inner` |
| `foliage` | `foliage` | plant | `foliage` |
| `soil` | `soil` | plant | `soil` |

## How a piece breaks

1. **At load** find `part_*`, `chunks_*`, `debris` and `col_*` by name. Make colliders from the proxies. Keep the
   chunk groups and the debris group inactive, with their scale set to 1. The intact piece is static.
2. **A hit** calls damage on the part that owns the collider: `health -= amount`. Fixed parts ignore it.
3. **At 0 hp**:
   - `shatter`: hide `part_<name>`, give `chunks_<name>` the part's current pose, show it, and unparent each chunk
     as a rigid body with its mass, pushed by the hit and outward from the hit point. Chunks listed in
     `fixed_chunks` (the border of a torn paper panel) are not bodies: parent them to the part they hang from.
     Spawn the part's debris the same way. Play the class's break sound. Sibling chunks touch along their cuts and
     may start inside the piece's other colliders: do not let them push each other apart (ignore those collisions).
   - `detach`: the part gets a rigid body (its mass) and leaves the piece with its colliders. It can still be shot;
     a loose `shatter` part still shatters at 0 hp. A detach part that lists debris (the shrubs) lets it out the
     first time it is shot loose. Ignore collisions with the piece's colliders it overlaps at that moment (a drawer
     in its carcass) until it has moved clear.
4. **Support**: after every break, any part still in place whose `attach` list has fewer than `need` parts in
   place comes loose (detach), or shatters if it is marked `collapse`. This repeats until nothing changes. The
   glass top drops when the coffee table's frame goes, the vase falls when the stand top shatters, bottles fall
   with their shelf, wardrobe doors fall with the carcass, the ondol chest drops when its plinth goes, the
   trolley frame drops when two casters are gone, and planter soil slumps into lumps when the basin breaks. A part
   whose host came loose whole (a pane in a door that was shot off) comes loose as a body of its own next to it in
   the Unity script; a game may instead parent it to the host's body.
5. **Landing**: a loose glass, ceramic or electronic part that lands faster than 2 m/s takes (speed - 2) × 25
   damage. A vase knocked off its stand breaks; a monitor knocked off a desk usually does.
6. **Lights out**: broken screens, LEDs and lit hanji go dark. Their chunks are stored with the unlit materials
   already (`paper_hanji`, `screen_off`), so every engine gets dark shards with no code; electronics parts that
   come loose whole still need darkening (the Unity script does it).
7. **Clean-up**: chunks and debris fade after a while, and only so many stay live per piece.

**Bullets.** Soft cover never stops a bullet: the round damages every soft part it passes through and goes on.
Parts with `stops_bullets` stop it (they still take the damage). In Unity, put soft parts on a layer your bullet
raycast passes through (or use `RaycastAll`), and stop at the first collider for which
`BreakableFurniture.StopsBullet(collider)` is true. (The viewer's demo shots are simpler: each one damages only the
first mesh it hits.)

**Sounds and effects by class**: wood (crack, splinters), glass (shatter, tinkle), metal (clang; sparks if it holds
electronics), fabric (thump, foam tufts), ceramic (clink, shards), stone (crack, dust), plastic (snap), electronics
(pop, sparks, the screen goes dark), paper (tear, flutter), plant (rustle, leaves). `sounds/` has
`hit_<class>.wav` and `break_<class>.wav` for all ten classes, plus `shot_rifle`, `shot_shotgun` and `frag`.

**How the chunks are cut** (all in `viewer.html`, so the files carry the result):

- **Wood** splits along the grain into long pieces (cells stretched 5:1 along it), and the cuts across the grain
  are saw-toothed (teeth about 12 mm deep) so the ends look splintered, not sawn. A part built from several boards
  (a carcass, a crate, a slatted shelf) breaks board by board, so the chunks stay thin boards. Each species shows
  its own cut-face colour (`walnut_inner`, `oak_inner`, `ebony_inner`). Lounger and bench slats break slat by slat.
- **Cells** of stone, wood, ceramic and electronics cluster round an impact point: small near it, large at the edges.
- **Glass** breaks radially round an impact point that differs per piece: an irregular core, a ring of wedges and
  shards out to the edge, with uneven spokes, some of which stop at the ring (up to about 19 chunks). Tempered tops
  (coffee table, holo deck) also drop 10 small shards. The render rack's door is tempered glass: a patch of cracked
  slabs round the impact (none over about 40 cm) and 24 small cubes for the rest of the pane.
- **Screens**: a monitor is a housing that comes off whole plus a screen-glass part that cracks into small, thin,
  dark shards (`glass_l`/`glass_r` on the desk, `glass_1..3` on the control desk, `monitor_glass` on reception).
- **Paper** tears: long strips with ragged edges, 1 mm thick, plus a border strip that stays glued to the frame.
- **Upholstery** (sofa and club chair bodies) splits along its build lines (arms, back, seat deck); a cushion that
  only touches a seam stays whole. The foam on every cut sits about 12 mm behind the cover's edge, with small lumps,
  and the body lets out 8 foam tufts.
- **Soil** breaks into lumps with lumpy cuts and crumbs; stone, ceramic, metal and electronics use Voronoi cells.

## Unity: BreakableFurniture.cs

Setup:

1. Install glTFast. Copy `props/haneul-furniture/unity/*.glb` and `parts.json` into one folder under Assets, and
   copy `unity/Runtime/BreakableFurniture.cs` and `unity/Editor/GunmodlsPrefabBuilder.cs` (into an Editor folder).
2. Select the imported .glb files, then choose Tools > Gunmodls > Build Prefabs From Selection. This adds a
   LODGroup and BoxColliders on the `_COL` nodes.
3. Select the prefabs, then choose Tools > Gunmodls > Set Up Breakable Furniture. This bakes the hull colliders,
   adds the component, sets `pieceId`, and points `partsJson` at the nearest `parts.json`.
4. Place the prefabs. Assign sounds per class in `sounds` if you like, or listen to `AnyPartBroken` from one
   effects manager.

The component can sit on the prefab root or on the `<id>` node under it: it looks for the node whose children are
the `part_*` nodes (glTFast puts the file's root node under the prefab root).

Without step 3 the script still works: on Awake it makes the colliders itself (`BuildColliders`), finds the piece
in `partsJson` by `pieceId` (or by the GameObject name without " (1)" or "(Clone)"), and without data it guesses
the values from the file. In that case chunks mean shatter, the class comes from the material name, and health is
the class base.

| Member | What it does |
| --- | --- |
| `partsJson`, `pieceId` | The data and which piece this is. |
| `impulseScale`, `chunkScatter` | Multiplies every force handed in / m/s pushed outward on chunks (1.2). |
| `debrisLifetime`, `fadeTime`, `maxLooseBodies` | Chunks and debris start to shrink away after 12 s, are gone 1.5 s later, and at most 60 stay per piece. The oldest go first. Loose whole parts stay. |
| `darkenLightsOnBreak`, `landingDamage` | Steps 5 and 6 above (both on). |
| `softLayer`, `hardLayer`, `looseLayer` | Layers for soft parts, bullet-stopping parts, and loose bodies (-1 leaves them as imported). |
| `sounds` | Per class: `hit`, `breakClip`, `volume` (played with `AudioSource.PlayClipAtPoint`). |
| `onPartDamaged (part, class, health left)` | UnityEvent after every hit that lands. |
| `onPartBroken (part, class, point)` | UnityEvent when a part shatters or comes loose (by damage, or because its support went). |
| `static AnyPartBroken (furniture, BreakInfo)` | The same for every piece: `part`, `materialClass`, `shattered`, `point`. |
| `ApplyDamage(Collider hit, amount, point, force)` | Damage the part that owns the collider. `force` is an impulse in N s, world space. Returns true if the part broke. |
| `ApplyDamage(string part, amount, point, force)` | The same, by part name. |
| `ApplyExplosion(centre, radius, damage, force)` | Damage × (1 - distance / radius), with distance measured to each part's collider bounds. Also pushes the bodies that were already loose, scaled by min(1, mass) so light bits do not fly off. |
| `static Owner(Collider)` | The piece a collider belongs to: a part in place or loose, a chunk or a debris bit (they leave the hierarchy, so do not use `GetComponentInParent`). Route hits with `Owner(hit.collider)?.ApplyDamage(hit.collider, ...)`. |
| `static StopsBullet(Collider)` | True for a bullet-stopping part that has not shattered (and for colliders that are not furniture). False for chunks and debris. |
| `GetPart(name)`, `FindPart(collider)`, `parts`, `Cover` | Live state: `Part { name, materialClass, mass, health, maxHealth, breakType, attach, need, stopsBullets, state (Intact, Loose, Shattered), body, colliders }`. |
| `static BuildColliders(root)` | Box proxies become BoxColliders and hulls become convex MeshColliders; their meshes are removed. It is safe to call more than once. |

Notes:

- Loose parts and chunks are unparented into the scene root. The root's LODGroup (from the prefab builder) still
  lists their renderers, so it switches them with the piece. If that matters at range, remove the LODGroup or give
  loose bodies their own.
- To put a piece back, destroy it and instantiate the prefab again.
- A part's Rigidbody uses `ContinuousDynamic` collision. Chunks use the default, with `maxDepenetrationVelocity` 1.
- Sibling chunks never collide with each other. A freed part or chunk ignores the piece's colliders it overlaps at
  that moment, and the pairs are turned back on (checked every 0.5 s for 4 s) once they no longer overlap.
- Chunks and debris get a small `FurnitureDebris` component (owner and part), which `Owner` and `StopsBullet` use.

## Every piece

Parts are listed in file order. Colliders are the `col_*` proxy names (`_hull` means convex). Debris is how many
`debris_<i>` bits belong to the part. A shatter part lets them out when it shatters; a detach part has debris only
when it asks for some (the shrubs' twigs), and lets it out the first time it is shot loose. Chunks marked "n stay"
are torn-paper border strips that stay on the part the paper hangs from (`fixed_chunks`). "collapse" marks a part
that shatters, rather than coming loose, when its support goes.

### Batch 0: Examples (lounge, tea room)

#### `coffee_table`: Coffee table, glass top

1.20 × 0.37 × 0.70 m, 33.4 kg, cover soft, 6,556 / 6,543 triangles, 16 debris bits, 9 textures. Walnut frame on brass-shod legs, 12 mm glass top resting on the frame, slatted lower shelf.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `leg_fl` | wood | detach | – | 0.38 | 60 | ground |  | `col_leg_fl` | 0 |
| `leg_fr` | wood | detach | – | 0.38 | 60 | ground |  | `col_leg_fr` | 0 |
| `leg_bl` | wood | detach | – | 0.38 | 60 | ground |  | `col_leg_bl` | 0 |
| `leg_br` | wood | detach | – | 0.38 | 60 | ground |  | `col_leg_br` | 0 |
| `frame` | wood | shatter | 9 | 3.1 | 100 | leg_fl, leg_fr, leg_bl, leg_br (3) |  | `col_frame` | 3 |
| `top` | glass | shatter | 17 | 21.98 | 35 | frame (1) |  | `col_top` | 10 |
| `shelf` | wood | shatter | 7 | 6.82 | 135 | leg_fl, leg_fr, leg_bl, leg_br (2) |  | `col_shelf` | 3 |

#### `celadon_vase_stand`: Celadon vase on stand

0.40 × 1.00 × 0.40 m, 11 kg, cover soft, 9,084 / 10,957 triangles, 10 debris bits, 15 textures. Maebyeong-form celadon vase (crackle glaze, 7 mm wall) on a low ebony stand with brass feet.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `stand_top` | wood | shatter | 7 | 3.09 | 100 | leg_fl, leg_fr, leg_bl, leg_br (3) |  | `col_stand_top` | 3 |
| `leg_fl` | wood | detach | – | 0.44 | 60 | ground |  | `col_leg_fl` | 0 |
| `leg_fr` | wood | detach | – | 0.44 | 60 | ground |  | `col_leg_fr` | 0 |
| `leg_bl` | wood | detach | – | 0.44 | 60 | ground |  | `col_leg_bl` | 0 |
| `leg_br` | wood | detach | – | 0.44 | 60 | ground |  | `col_leg_br` | 0 |
| `apron` | wood | shatter | 5 | 0.75 | 65 | leg_fl, leg_fr, leg_bl, leg_br (2) |  | `col_apron` | 3 |
| `stretchers` | wood | detach | – | 0.21 | 60 | leg_fl, leg_fr, leg_bl, leg_br (2) |  | `col_stretchers` | 0 |
| `vase` | ceramic | shatter | 10 | 5.19 | 25 | stand_top (1) |  | `col_vase_hull` | 4 |

### Batch A: Lounge, bar, cigar

#### `lounge_sofa`: Low lounge sofa, 3 seat

2.20 × 0.80 × 0.92 m, 59.5 kg, cover soft, 13,464 / 16,280 triangles, 11 debris bits, 15 textures. Low charcoal sofa on a walnut plinth with a recessed brass kick strip; loose seat and back cushions.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `kick` | metal | detach | – | 1 | 145 | ground |  | `col_kick` | 0 |
| `base` | wood | shatter | 9 | 18 | 185 | ground |  | `col_base` | 3 |
| `body` | fabric | shatter | 4 | 25 | 135 | base (1) |  | `col_body_1`, `col_body_2`, `col_body_3`, `col_body_4` | 8 |
| `seat_l` | fabric | detach | – | 3 | 65 | body (1) |  | `col_seat_l` | 0 |
| `back_l` | fabric | detach | – | 2 | 60 | body (1) |  | `col_back_l` | 0 |
| `seat_c` | fabric | detach | – | 3 | 65 | body (1) |  | `col_seat_c` | 0 |
| `back_c` | fabric | detach | – | 2 | 60 | body (1) |  | `col_back_c` | 0 |
| `seat_r` | fabric | detach | – | 3 | 65 | body (1) |  | `col_seat_r` | 0 |
| `back_r` | fabric | detach | – | 2 | 60 | body (1) |  | `col_back_r` | 0 |
| `pillow` | fabric | detach | – | 0.5 | 40 | seat_l (1) |  | `col_pillow` | 0 |

#### `armchair`: Oak-frame lounge armchair

0.81 × 0.80 × 0.85 m, 13.7 kg, cover soft, 8,056 / 4,456 triangles, 3 debris bits, 9 textures. Solid oak frame with flat arms and a raked back, oat cushions on webbing.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `leg_fl` | wood | detach | – | 0.6 | 60 | ground |  | `col_leg_fl` | 0 |
| `leg_fr` | wood | detach | – | 0.6 | 60 | ground |  | `col_leg_fr` | 0 |
| `leg_bl` | wood | detach | – | 0.6 | 60 | ground |  | `col_leg_bl` | 0 |
| `leg_br` | wood | detach | – | 0.6 | 60 | ground |  | `col_leg_br` | 0 |
| `frame` | wood | shatter | 7 | 7 | 135 | leg_fl, leg_fr, leg_bl, leg_br (3) |  | `col_frame_1`, `col_frame_2`, `col_frame_3`, `col_frame_4` | 3 |
| `seat` | fabric | detach | – | 2.5 | 65 | frame (1) |  | `col_seat` | 0 |
| `back` | fabric | detach | – | 1.8 | 55 | frame (1) |  | `col_back` | 0 |

#### `club_chair`: Leather club chair

0.90 × 0.78 × 0.92 m, 28.2 kg, cover soft, 9,988 / 22,847 triangles, 8 debris bits, 15 textures. Deep cognac leather tub with rolled arms on ebony feet with brass cups.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `foot_fl` | wood | detach | – | 0.3 | 60 | ground |  | `col_foot_fl` | 0 |
| `foot_fr` | wood | detach | – | 0.3 | 60 | ground |  | `col_foot_fr` | 0 |
| `foot_bl` | wood | detach | – | 0.3 | 60 | ground |  | `col_foot_bl` | 0 |
| `foot_br` | wood | detach | – | 0.3 | 60 | ground |  | `col_foot_br` | 0 |
| `body` | fabric | shatter | 4 | 24 | 135 | foot_fl, foot_fr, foot_bl, foot_br (3) |  | `col_body_1`, `col_body_2`, `col_body_3`, `col_body_4` | 8 |
| `seat` | fabric | detach | – | 3 | 65 | body (1) |  | `col_seat` | 0 |

#### `bar_counter`: Bar counter module (2 m, fluted front)

2.00 × 1.10 × 0.71 m, 165.5 kg, cover soft, 5,256 / 12,279 triangles, 9 debris bits, 19 textures. Graphite steel carcass, reeded walnut front, granite top with a purple wash under the lip, brass foot rail; customer side is +Z.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `carcass` | metal | fixed | – | 60 | 570 | ground |  | `col_carcass_1`, `col_carcass_2`, `col_carcass_3`, `col_carcass_4`, `col_carcass_5`, `col_carcass_6` | 0 |
| `front` | wood | shatter | 9 | 20 | 190 | carcass (1) |  | `col_front` | 3 |
| `top` | stone | shatter | 6 | 75 | 985 | carcass (1) |  | `col_top` | 3 |
| `led` | electronics | detach | – | 0.5 | 20 | top (1) |  | `col_led` | 0 |
| `foot_rail` | metal | detach | – | 4 | 230 | carcass (1) |  | `col_foot_rail` | 0 |
| `shelf` | wood | shatter | 5 | 6 | 130 | carcass (1) |  | `col_shelf` | 3 |

#### `bar_stool`: Bar stool

0.44 × 0.78 × 0.44 m, 13 kg, cover none, 3,448 / 0 triangles, 0 debris bits, 6 textures. Black leather seat on a dark alloy column and weighted disc base, brass foot ring.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `base` | metal | fixed | – | 8 | 290 | ground |  | `col_base` | 0 |
| `column` | metal | detach | – | 2.5 | 200 | base (1) |  | `col_column` | 0 |
| `foot_ring` | metal | detach | – | 1 | 145 | column (1) |  | `col_foot_ring` | 0 |
| `seat` | fabric | detach | – | 1.5 | 55 | column (1) |  | `col_seat` | 0 |

#### `bottle_shelf`: Back-bar bottle shelf, backlit

1.60 × 2.21 × 0.41 m, 78.4 kg, cover soft, 15,024 / 29,908 triangles, 161 debris bits, 18 textures. Graphite frame and low cabinet, warm-lit hanji back behind an open ttisal lattice, three green-edged glass shelves with brass rails holding eighteen bottles, two decanters and three tumblers on the walnut ledge.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame` | metal | detach | – | 35 | 480 | ground |  | `col_frame_1`, `col_frame_2`, `col_frame_3`, `col_frame_4`, `col_frame_5` | 0 |
| `back` | paper | shatter | 5 (1 stay) | 3 | 15 | frame (1) |  | `col_back` | 5 |
| `led` | electronics | detach | – | 0.3 | 20 | frame (1) |  | `col_led` | 0 |
| `shelf_1` | glass | shatter | 15 | 6 | 20 | frame (1) |  | `col_shelf_1` | 6 |
| `bottle_1` | glass | shatter | 5 | 1 | 10 | shelf_1 (1) |  | `col_bottle_1` | 6 |
| `bottle_2` | glass | shatter | 5 | 1 | 10 | shelf_1 (1) |  | `col_bottle_2` | 6 |
| `bottle_3` | glass | shatter | 4 | 1 | 10 | shelf_1 (1) |  | `col_bottle_3` | 6 |
| `bottle_4` | glass | shatter | 4 | 1 | 10 | shelf_1 (1) |  | `col_bottle_4` | 6 |
| `bottle_5` | glass | shatter | 5 | 1 | 10 | shelf_1 (1) |  | `col_bottle_5` | 6 |
| `bottle_6` | glass | shatter | 4 | 1 | 10 | shelf_1 (1) |  | `col_bottle_6` | 6 |
| `shelf_2` | glass | shatter | 17 | 6 | 20 | frame (1) |  | `col_shelf_2` | 6 |
| `bottle_7` | glass | shatter | 4 | 1 | 10 | shelf_2 (1) |  | `col_bottle_7` | 6 |
| `bottle_8` | glass | shatter | 4 | 1 | 10 | shelf_2 (1) |  | `col_bottle_8` | 6 |
| `bottle_9` | glass | shatter | 4 | 1 | 10 | shelf_2 (1) |  | `col_bottle_9` | 6 |
| `bottle_10` | glass | shatter | 4 | 1 | 10 | shelf_2 (1) |  | `col_bottle_10` | 6 |
| `bottle_11` | glass | shatter | 4 | 1 | 10 | shelf_2 (1) |  | `col_bottle_11` | 6 |
| `bottle_12` | glass | shatter | 4 | 1 | 10 | shelf_2 (1) |  | `col_bottle_12` | 6 |
| `shelf_3` | glass | shatter | 13 | 6 | 20 | frame (1) |  | `col_shelf_3` | 6 |
| `bottle_13` | glass | shatter | 4 | 1.4 | 15 | shelf_3 (1) |  | `col_bottle_13` | 6 |
| `bottle_14` | glass | shatter | 4 | 1 | 10 | shelf_3 (1) |  | `col_bottle_14` | 6 |
| `bottle_15` | glass | shatter | 5 | 1 | 10 | shelf_3 (1) |  | `col_bottle_15` | 6 |
| `bottle_16` | glass | shatter | 4 | 1 | 10 | shelf_3 (1) |  | `col_bottle_16` | 6 |
| `bottle_17` | glass | shatter | 4 | 1 | 10 | shelf_3 (1) |  | `col_bottle_17` | 6 |
| `bottle_18` | glass | shatter | 5 | 1 | 10 | shelf_3 (1) |  | `col_bottle_18` | 6 |
| `bottle_19` | glass | shatter | 5 | 1.4 | 15 | frame (1) |  | `col_bottle_19` | 6 |
| `bottle_20` | glass | shatter | 4 | 1.4 | 15 | frame (1) |  | `col_bottle_20` | 6 |
| `tumbler_1` | glass | shatter | 4 | 0.3 | 10 | frame (1) |  | `col_tumbler_1` | 6 |
| `tumbler_2` | glass | shatter | 4 | 0.3 | 10 | frame (1) |  | `col_tumbler_2` | 6 |
| `tumbler_3` | glass | shatter | 4 | 0.3 | 10 | frame (1) |  | `col_tumbler_3` | 6 |

#### `cigar_humidor`: Cigar humidor cabinet, glass doors

0.92 × 2.00 × 0.54 m, 72.9 kg, cover soft, 13,352 / 2,755 triangles, 15 debris bits, 23 textures. Walnut cabinet with an oak-lined interior, two glazed doors, slatted oak shelves, cigar boxes and a plain brass gauge.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `carcass` | wood | shatter | 8 | 45 | 250 | ground |  | `col_carcass_1`, `col_carcass_2`, `col_carcass_3`, `col_carcass_4`, `col_carcass_5` | 3 |
| `door_l` | wood | detach | – | 6 | 130 | carcass (1) |  | `col_door_l_1`, `col_door_l_2`, `col_door_l_3`, `col_door_l_4` | 0 |
| `pane_l` | glass | shatter | 12 | 3 | 15 | door_l (1) |  | `col_pane_l` | 6 |
| `door_r` | wood | detach | – | 6 | 130 | carcass (1) |  | `col_door_r_1`, `col_door_r_2`, `col_door_r_3`, `col_door_r_4` | 0 |
| `pane_r` | glass | shatter | 12 | 3 | 15 | door_r (1) |  | `col_pane_r` | 6 |
| `shelf_1` | wood | detach | – | 1.5 | 80 | carcass (1) |  | `col_shelf_1` | 0 |
| `shelf_2` | wood | detach | – | 1.5 | 80 | carcass (1) |  | `col_shelf_2` | 0 |
| `shelf_3` | wood | detach | – | 1.5 | 80 | carcass (1) |  | `col_shelf_3` | 0 |
| `shelf_4` | wood | detach | – | 1.5 | 80 | carcass (1) |  | `col_shelf_4` | 0 |
| `box_1` | wood | detach | – | 0.6 | 60 | shelf_1 (1) |  | `col_box_1` | 0 |
| `box_2` | wood | detach | – | 0.6 | 60 | box_1 (1) |  | `col_box_2` | 0 |
| `box_3` | wood | detach | – | 0.6 | 60 | shelf_2 (1) |  | `col_box_3` | 0 |
| `box_4` | wood | detach | – | 0.6 | 60 | shelf_2 (1) |  | `col_box_4` | 0 |
| `box_5` | wood | detach | – | 0.6 | 60 | shelf_3 (1) |  | `col_box_5` | 0 |
| `box_6` | wood | detach | – | 0.6 | 60 | shelf_4 (1) |  | `col_box_6` | 0 |
| `gauge` | metal | detach | – | 0.3 | 125 | carcass (1) |  | `col_gauge` | 0 |

### Batch B: Hotel suite, ondol, tea, spa

#### `bed`: Platform bed with hanji headboard

1.80 × 1.05 × 2.20 m, 82.8 kg, cover soft, 6,692 / 9,370 triangles, 11 debris bits, 19 textures. Oak platform floating on a dark recessed plinth; lit hanji headboard behind an oak lattice; indigo throw at the foot.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `platform` | wood | shatter | 10 | 40 | 240 | ground |  | `col_platform` | 3 |
| `mattress` | fabric | detach | – | 25 | 135 | platform (1) |  | `col_mattress` | 0 |
| `runner` | fabric | detach | – | 2 | 60 | mattress (1) |  | `col_runner` | 0 |
| `pillow_l` | fabric | detach | – | 1 | 45 | mattress (1) |  | `col_pillow_l` | 0 |
| `pillow_r` | fabric | detach | – | 1 | 45 | mattress (1) |  | `col_pillow_r` | 0 |
| `head_frame` | wood | shatter | 6 | 12 | 160 | ground |  | `col_head_frame_1`, `col_head_frame_2`, `col_head_frame_3`, `col_head_frame_4`, `col_head_frame_5` | 3 |
| `head_panel` | paper | shatter | 9 (1 stay) | 1.5 | 10 | head_frame (1) |  | `col_head_panel` | 5 |
| `glow` | electronics | detach | – | 0.3 | 20 | head_frame (1) |  | `col_glow` | 0 |

#### `nightstand`: Nightstand with drawer

0.50 × 0.52 × 0.43 m, 16.5 kg, cover soft, 1,704 / 1,539 triangles, 6 debris bits, 19 textures. Oak box on a shadow plinth, one drawer with a plain brass pull over an open niche, honed pale stone top.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `carcass` | wood | shatter | 7 | 8 | 140 | ground |  | `col_carcass_1`, `col_carcass_2`, `col_carcass_3`, `col_carcass_4`, `col_carcass_5`, `col_carcass_6` | 3 |
| `top` | stone | shatter | 7 | 6 | 425 | carcass (1) |  | `col_top` | 3 |
| `drawer` | wood | detach | – | 2.5 | 95 | carcass (1) |  | `col_drawer` | 0 |

#### `wardrobe`: Wardrobe, lattice-and-hanji doors

1.20 × 2.20 × 0.61 m, 87.6 kg, cover soft, 5,448 / 9,738 triangles, 19 debris bits, 23 textures. Walnut carcass, two oak lattice doors over hanji on the hinge line, a drawer below; shelf and brass rail inside.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `carcass` | wood | shatter | 11 | 60 | 275 | ground |  | `col_carcass_1`, `col_carcass_2`, `col_carcass_3`, `col_carcass_4`, `col_carcass_5`, `col_carcass_6`, `col_carcass_7` | 3 |
| `door_l` | wood | shatter | 7 | 8 | 140 | carcass (1) |  | `col_door_l_1`, `col_door_l_2`, `col_door_l_3`, `col_door_l_4`, `col_door_l_5` | 3 |
| `panel_l` | paper | shatter | 9 (1 stay) | 0.8 | 10 | door_l (1) |  | `col_panel_l` | 5 |
| `door_r` | wood | shatter | 7 | 8 | 140 | carcass (1) |  | `col_door_r_1`, `col_door_r_2`, `col_door_r_3`, `col_door_r_4`, `col_door_r_5` | 3 |
| `panel_r` | paper | shatter | 9 (1 stay) | 0.8 | 10 | door_r (1) |  | `col_panel_r` | 5 |
| `shelf` | wood | detach | – | 4 | 110 | carcass (1) |  | `col_shelf` | 0 |
| `rail` | metal | detach | – | 1 | 145 | carcass (1) |  | `col_rail` | 0 |
| `drawer` | wood | detach | – | 5 | 120 | carcass (1) |  | `col_drawer` | 0 |

#### `low_tea_table`: Low tea table with celadon tea set

1.20 × 0.46 × 0.70 m, 21.5 kg, cover soft, 7,724 / 12,002 triangles, 13 debris bits, 15 textures. Thick walnut slab on tapered legs and arched aprons; oak tray with a celadon pot and four cups.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `top` | wood | shatter | 7 | 14 | 170 | leg_fl, leg_fr, leg_bl, leg_br (3) |  | `col_top` | 3 |
| `leg_fl` | wood | detach | – | 0.8 | 65 | ground |  | `col_leg_fl` | 0 |
| `leg_fr` | wood | detach | – | 0.8 | 65 | ground |  | `col_leg_fr` | 0 |
| `leg_bl` | wood | detach | – | 0.8 | 65 | ground |  | `col_leg_bl` | 0 |
| `leg_br` | wood | detach | – | 0.8 | 65 | ground |  | `col_leg_br` | 0 |
| `apron` | wood | shatter | 7 | 2 | 90 | leg_fl, leg_fr, leg_bl, leg_br (2) |  | `col_apron` | 3 |
| `tray` | wood | detach | – | 0.8 | 65 | top (1) |  | `col_tray` | 0 |
| `teapot` | ceramic | shatter | 6 | 0.9 | 15 | tray (1) |  | `col_teapot_hull` | 3 |
| `cup_1` | ceramic | shatter | 5 | 0.15 | 15 | tray (1) |  | `col_cup_1_hull` | 1 |
| `cup_2` | ceramic | shatter | 5 | 0.15 | 15 | tray (1) |  | `col_cup_2_hull` | 1 |
| `cup_3` | ceramic | shatter | 5 | 0.15 | 15 | top (1) |  | `col_cup_3_hull` | 1 |
| `cup_4` | ceramic | shatter | 4 | 0.15 | 15 | top (1) |  | `col_cup_4_hull` | 1 |

#### `floor_cushion_set`: Ondol floor cushion set

1.36 × 0.45 × 1.02 m, 9.3 kg, cover none, 12,840 / 0 triangles, 0 debris bits, 6 textures. Four piped bangseok cushions (two stacked), an upright boryo back cushion, a round bolster and a low walnut armrest.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cushion_1` | fabric | detach | – | 1.2 | 50 | ground |  | `col_cushion_1` | 0 |
| `cushion_2` | fabric | detach | – | 1.2 | 50 | ground |  | `col_cushion_2` | 0 |
| `cushion_3` | fabric | detach | – | 1.2 | 50 | ground |  | `col_cushion_3` | 0 |
| `cushion_4` | fabric | detach | – | 1.2 | 50 | cushion_3 (1) |  | `col_cushion_4` | 0 |
| `bolster_1` | fabric | detach | – | 1.5 | 55 | ground |  | `col_bolster_1` | 0 |
| `bolster_2` | fabric | detach | – | 1.5 | 55 | cushion_4 (1) |  | `col_bolster_2` | 0 |
| `armrest` | wood | detach | – | 1.5 | 80 | ground |  | `col_armrest` | 0 |

#### `folding_screen`: Four-panel hanji folding screen

1.98 × 1.80 × 0.44 m, 13.2 kg, cover soft, 4,548 / 7,352 triangles, 20 debris bits, 12 textures. Ebony frames in a zig-zag, hanji above a walnut kick panel, brass hinge pins between panels.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame_1` | wood | detach | – | 3 | 100 | frame_2 (1) |  | `col_frame_1_1`, `col_frame_1_2`, `col_frame_1_3`, `col_frame_1_4` | 0 |
| `paper_1` | paper | shatter | 9 (1 stay) | 0.3 | 10 | frame_1 (1) |  | `col_paper_1` | 5 |
| `frame_2` | wood | detach | – | 3 | 100 | frame_1, frame_3 (1) |  | `col_frame_2_1`, `col_frame_2_2`, `col_frame_2_3`, `col_frame_2_4` | 0 |
| `paper_2` | paper | shatter | 9 (1 stay) | 0.3 | 10 | frame_2 (1) |  | `col_paper_2` | 5 |
| `frame_3` | wood | detach | – | 3 | 100 | frame_2, frame_4 (1) |  | `col_frame_3_1`, `col_frame_3_2`, `col_frame_3_3`, `col_frame_3_4` | 0 |
| `paper_3` | paper | shatter | 9 (1 stay) | 0.3 | 10 | frame_3 (1) |  | `col_paper_3` | 5 |
| `frame_4` | wood | detach | – | 3 | 100 | frame_3 (1) |  | `col_frame_4_1`, `col_frame_4_2`, `col_frame_4_3`, `col_frame_4_4` | 0 |
| `paper_4` | paper | shatter | 9 (1 stay) | 0.3 | 10 | frame_4 (1) |  | `col_paper_4` | 5 |

#### `ondol_chest`: Low ondol cabinet (bandaji-style chest)

1.05 × 0.60 × 0.46 m, 38 kg, cover soft, 10,600 / 4,884 triangles, 3 debris bits, 12 textures. Walnut chest with a front fall-flap over two drawers, plain brass plates, hinge straps and side handles, on an ebony base.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `carcass` | wood | shatter | 10 | 25 | 205 | plinth (1) |  | `col_carcass_1`, `col_carcass_2`, `col_carcass_3`, `col_carcass_4`, `col_carcass_5`, `col_carcass_6`, `col_carcass_7` | 3 |
| `flap` | wood | detach | – | 4 | 110 | carcass (1) |  | `col_flap` | 0 |
| `drawer_l` | wood | detach | – | 2 | 90 | carcass (1) |  | `col_drawer_l` | 0 |
| `drawer_r` | wood | detach | – | 2 | 90 | carcass (1) |  | `col_drawer_r` | 0 |
| `plinth` | wood | detach | – | 5 | 120 | ground |  | `col_plinth` | 0 |

#### `spa_lounger`: Spa lounger

0.77 × 0.87 × 1.96 m, 23.6 kg, cover soft, 7,472 / 2,931 triangles, 3 debris bits, 15 textures. Dark alloy sled frames with oak slats on a reclined back, oat pad and headrest.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame` | metal | detach | – | 14 | 350 | ground |  | `col_frame_1`, `col_frame_2`, `col_frame_3` | 0 |
| `slats` | wood | shatter | 28 | 6 | 130 | frame (1) |  | `col_slats_1_hull`, `col_slats_2` | 3 |
| `pad` | fabric | detach | – | 3 | 65 | slats (1) |  | `col_pad_1_hull`, `col_pad_2` | 0 |
| `headrest` | fabric | detach | – | 0.6 | 40 | pad (1) |  | `col_headrest` | 0 |

#### `towel_rack`: Free-standing towel rack

0.58 × 1.50 × 0.43 m, 26.2 kg, cover none, 2,836 / 691 triangles, 3 debris bits, 12 textures. Leaning brass ladder set into a pale stone base; two towels over the rungs and one folded on the base.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `base` | stone | shatter | 4 | 19.36 | 630 | ground |  | `col_base` | 3 |
| `frame` | metal | detach | – | 5 | 250 | base (1) |  | `col_frame_1_hull`, `col_frame_2_hull`, `col_frame_3`, `col_frame_4`, `col_frame_5`, `col_frame_6` | 0 |
| `towel_1` | fabric | detach | – | 0.6 | 40 | frame (1) |  | `col_towel_1` | 0 |
| `towel_2` | fabric | detach | – | 0.6 | 40 | frame (1) |  | `col_towel_2` | 0 |
| `towel_3` | fabric | detach | – | 0.6 | 40 | base (1) |  | `col_towel_3` | 0 |

### Batch C: Broadcast tech, vault, office

#### `desk_monitors`: Desk with two monitors

1.60 × 1.20 × 0.80 m, 44.3 kg, cover soft, 5,768 / 2,446 triangles, 9 debris bits, 25 textures. Oak top on dark alloy sled legs, graphite modesty panel and cable tray, two slim monitors angled in, keyboard and mouse.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `leg_l` | metal | detach | – | 6 | 265 | ground |  | `col_leg_l` | 0 |
| `leg_r` | metal | detach | – | 6 | 265 | ground |  | `col_leg_r` | 0 |
| `modesty` | metal | detach | – | 4 | 230 | leg_l, leg_r (1) |  | `col_modesty` | 0 |
| `top` | wood | shatter | 6 | 16 | 175 | leg_l, leg_r (2) |  | `col_top` | 3 |
| `stand_l` | metal | detach | – | 1.5 | 165 | top (1) |  | `col_stand_l_hull` | 0 |
| `monitor_l` | electronics | detach | – | 3 | 35 | stand_l (1) |  | `col_monitor_l_hull` | 0 |
| `glass_l` | electronics | shatter | 10 | 1.2 | 25 | monitor_l (1) |  | `col_glass_l_hull` | 3 |
| `stand_r` | metal | detach | – | 1.5 | 165 | top (1) |  | `col_stand_r_hull` | 0 |
| `monitor_r` | electronics | detach | – | 3 | 35 | stand_r (1) |  | `col_monitor_r_hull` | 0 |
| `glass_r` | electronics | shatter | 8 | 1.2 | 25 | monitor_r (1) |  | `col_glass_r_hull` | 3 |
| `keyboard` | plastic | detach | – | 0.8 | 35 | top (1) |  | `col_keyboard` | 0 |
| `mouse` | plastic | detach | – | 0.1 | 30 | top (1) |  | `col_mouse` | 0 |

#### `office_chair`: Task chair

0.66 × 1.15 × 0.69 m, 12.6 kg, cover none, 11,588 / 0 triangles, 0 debris bits, 12 textures. Five-star alloy base on twin casters, gas column, charcoal seat, curved tubular back frame with a woven mesh and a lumbar pad on a spine, T arms.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `base` | metal | detach | – | 4 | 230 | ground |  | `col_base` | 0 |
| `column` | metal | detach | – | 1.5 | 165 | base (1) |  | `col_column` | 0 |
| `seat` | fabric | detach | – | 3 | 65 | column (1) |  | `col_seat` | 0 |
| `back` | metal | detach | – | 2.5 | 200 | seat (1) |  | `col_back_1_hull`, `col_back_2` | 0 |
| `lumbar` | fabric | detach | – | 0.4 | 40 | back (1) |  | `col_lumbar` | 0 |
| `arm_l` | plastic | detach | – | 0.6 | 30 | seat (1) |  | `col_arm_l` | 0 |
| `arm_r` | plastic | detach | – | 0.6 | 30 | seat (1) |  | `col_arm_r` | 0 |

#### `filing_cabinet`: Four-drawer filing cabinet

0.45 × 1.30 × 0.64 m, 45 kg, cover soft, 3,264 / 0 triangles, 0 debris bits, 3 textures. Graphite steel carcass, four dark alloy drawer fronts with plain brass bar pulls, keypad lock with a status dot.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `carcass` | metal | fixed | – | 25 | 425 | ground |  | `col_carcass_1`, `col_carcass_2`, `col_carcass_3`, `col_carcass_4`, `col_carcass_5` | 0 |
| `drawer_1` | metal | detach | – | 5 | 250 | carcass (1) |  | `col_drawer_1` | 0 |
| `drawer_2` | metal | detach | – | 5 | 250 | carcass (1) |  | `col_drawer_2` | 0 |
| `drawer_3` | metal | detach | – | 5 | 250 | carcass (1) |  | `col_drawer_3` | 0 |
| `drawer_4` | metal | detach | – | 5 | 250 | carcass (1) |  | `col_drawer_4` | 0 |

#### `render_rack`: Render-farm rack

0.60 × 2.20 × 1.10 m, 217 kg, cover hard, 14,660 / 950 triangles, 24 debris bits, 9 textures. Graphite steel rack, light-smoke glass door on a right hinge with a perforated grille over the top fans, eight 4U render nodes each with a purple status strip and activity dots.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame` | metal | fixed | – | 90 | 655 | ground | yes | `col_frame_1`, `col_frame_2`, `col_frame_3`, `col_frame_4`, `col_frame_5`, `col_frame_6`, `col_frame_7`, `col_frame_8` | 0 |
| `side_l` | metal | detach | – | 8 | 290 | frame (1) |  | `col_side_l` | 0 |
| `side_r` | metal | detach | – | 8 | 290 | frame (1) |  | `col_side_r` | 0 |
| `door` | metal | detach | – | 6 | 265 | frame (1) |  | `col_door_1`, `col_door_2`, `col_door_3`, `col_door_4`, `col_door_5`, `col_door_6` | 0 |
| `pane` | glass | shatter | 17 | 5 | 20 | door (1) |  | `col_pane` | 24 |
| `blade_1` | electronics | detach | – | 12 | 55 | frame (1) | yes | `col_blade_1` | 0 |
| `blade_2` | electronics | detach | – | 12 | 55 | frame (1) | yes | `col_blade_2` | 0 |
| `blade_3` | electronics | detach | – | 12 | 55 | frame (1) | yes | `col_blade_3` | 0 |
| `blade_4` | electronics | detach | – | 12 | 55 | frame (1) | yes | `col_blade_4` | 0 |
| `blade_5` | electronics | detach | – | 12 | 55 | frame (1) | yes | `col_blade_5` | 0 |
| `blade_6` | electronics | detach | – | 12 | 55 | frame (1) | yes | `col_blade_6` | 0 |
| `blade_7` | electronics | detach | – | 12 | 55 | frame (1) | yes | `col_blade_7` | 0 |
| `blade_8` | electronics | detach | – | 12 | 55 | frame (1) | yes | `col_blade_8` | 0 |
| `fans` | electronics | detach | – | 4 | 35 | frame (1) |  | `col_fans` | 0 |

#### `holo_console`: Holo stage console

1.20 × 1.05 × 0.80 m, 57.5 kg, cover soft, 3,620 / 2,436 triangles, 16 debris bits, 7 textures. Tapered dark alloy pedestal with graphite cheeks, sloped glass touch deck over a light field, purple emitter ring and lens.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pedestal` | metal | fixed | – | 40 | 500 | ground |  | `col_pedestal_hull` | 0 |
| `side_l` | metal | detach | – | 4 | 230 | pedestal (1) |  | `col_side_l_hull` | 0 |
| `side_r` | metal | detach | – | 4 | 230 | pedestal (1) |  | `col_side_r_hull` | 0 |
| `deck` | glass | shatter | 12 | 6 | 20 | pedestal (1) |  | `col_deck_hull` | 10 |
| `ring` | electronics | detach | – | 3 | 35 | pedestal (1) |  | `col_ring_1`, `col_ring_2`, `col_ring_3`, `col_ring_4` | 0 |
| `lens` | glass | shatter | 4 | 0.5 | 10 | ring (1) |  | `col_lens` | 6 |

#### `control_desk`: Broadcast control desk module

1.80 × 1.30 × 0.95 m, 71 kg, cover soft, 7,440 / 5,453 triangles, 15 debris bits, 19 textures. Graphite console with knee space, walnut arm rest, sloped fader deck, three screens on the riser, one purple reveal line.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | metal | fixed | – | 45 | 520 | ground |  | `col_body_1`, `col_body_2`, `col_body_3_hull`, `col_body_4_hull`, `col_body_5_hull` | 0 |
| `top` | wood | shatter | 6 | 8 | 140 | body (1) |  | `col_top` | 3 |
| `deck` | electronics | shatter | 4 | 6 | 45 | body (1) |  | `col_deck_hull` | 3 |
| `screen_1` | electronics | detach | – | 3 | 35 | body (1) |  | `col_screen_1_1_hull`, `col_screen_1_2_hull` | 0 |
| `glass_1` | electronics | shatter | 9 | 1 | 25 | screen_1 (1) |  | `col_glass_1_hull` | 3 |
| `screen_2` | electronics | detach | – | 3 | 35 | body (1) |  | `col_screen_2_1_hull`, `col_screen_2_2_hull` | 0 |
| `glass_2` | electronics | shatter | 9 | 1 | 25 | screen_2 (1) |  | `col_glass_2_hull` | 3 |
| `screen_3` | electronics | detach | – | 3 | 35 | body (1) |  | `col_screen_3_1_hull`, `col_screen_3_2_hull` | 0 |
| `glass_3` | electronics | shatter | 10 | 1 | 25 | screen_3 (1) |  | `col_glass_3_hull` | 3 |

#### `vault_shelving`: Deposit-box shelving

1.20 × 2.10 × 0.61 m, 214 kg, cover hard, 9,948 / 0 triangles, 0 debris bits, 6 textures. Graphite steel carcass in a 4 by 4 grid, brushed steel deposit boxes with plain bar pulls and brass lock discs.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame` | metal | fixed | – | 150 | 750 | ground | yes | `col_frame_1`, `col_frame_2`, `col_frame_3`, `col_frame_4`, `col_frame_5`, `col_frame_6`, `col_frame_7`, `col_frame_8`, `col_frame_9`, `col_frame_10`, `col_frame_11` | 0 |
| `box_1` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_1` | 0 |
| `box_2` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_2` | 0 |
| `box_3` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_3` | 0 |
| `box_4` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_4` | 0 |
| `box_5` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_5` | 0 |
| `box_6` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_6` | 0 |
| `box_7` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_7` | 0 |
| `box_8` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_8` | 0 |
| `box_9` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_9` | 0 |
| `box_10` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_10` | 0 |
| `box_11` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_11` | 0 |
| `box_12` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_12` | 0 |
| `box_13` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_13` | 0 |
| `box_14` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_14` | 0 |
| `box_15` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_15` | 0 |
| `box_16` | metal | detach | – | 4 | 230 | frame (1) | yes | `col_box_16` | 0 |

#### `media_wall`: Media wall unit

2.40 × 2.00 × 0.46 m, 75.8 kg, cover soft, 5,412 / 8,867 triangles, 15 debris bits, 28 textures. Walnut credenza on a shadow plinth with a fluted walnut back wall, wall screen, slim speakers, two floating shelves, celadon bowl.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `credenza` | wood | shatter | 9 | 35 | 230 | ground |  | `col_credenza_1`, `col_credenza_2` | 3 |
| `door_l` | wood | detach | – | 4 | 110 | credenza (1) |  | `col_door_l` | 0 |
| `door_r` | wood | detach | – | 4 | 110 | credenza (1) |  | `col_door_r` | 0 |
| `screen` | electronics | shatter | 16 | 18 | 60 | credenza (1) |  | `col_screen` | 3 |
| `speaker_l` | electronics | detach | – | 3 | 35 | credenza (1) |  | `col_speaker_l` | 0 |
| `speaker_r` | electronics | detach | – | 3 | 35 | credenza (1) |  | `col_speaker_r` | 0 |
| `shelf_l` | wood | shatter | 5 | 4 | 110 | credenza (1) |  | `col_shelf_l` | 3 |
| `shelf_r` | wood | shatter | 4 | 4 | 110 | credenza (1) |  | `col_shelf_r` | 3 |
| `bowl` | ceramic | shatter | 4 | 0.8 | 15 | shelf_r (1) |  | `col_bowl_hull` | 3 |

### Batch D: Garden, lobby, service, misc

#### `planter_large`: Large basalt planter with shrub

1.27 × 1.70 × 0.61 m, 289 kg, cover hard, 8,644 / 13,633 triangles, 14 debris bits, 19 textures. Honed basalt trough with a projecting cap and a shadow-gap foot; white pebble mulch and three shrubs.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `basin` | stone | shatter | 9 | 220 | 1200 | ground | yes | `col_basin_1`, `col_basin_2`, `col_basin_3`, `col_basin_4`, `col_basin_5` | 3 |
| `soil` | plant | shatter (collapse) | 7 | 60 | 400 | basin (1) |  | `col_soil` | 5 |
| `shrub_1` | plant | detach | – | 3 | 25 | soil (1) |  | `col_shrub_1` | 2 |
| `shrub_2` | plant | detach | – | 3 | 25 | soil (1) |  | `col_shrub_2` | 2 |
| `shrub_3` | plant | detach | – | 3 | 25 | soil (1) |  | `col_shrub_3` | 2 |

#### `garden_bench`: Stone and oak garden bench

1.80 × 0.45 × 0.50 m, 188 kg, cover soft, 1,632 / 1,613 triangles, 3 debris bits, 12 textures. Two honed granite plinths on shadow-gap feet carrying a thick two-board oak seat; the plinths stop bullets.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plinth_l` | stone | fixed | – | 80 | 1010 | ground | yes | `col_plinth_l` | 0 |
| `plinth_r` | stone | fixed | – | 80 | 1010 | ground | yes | `col_plinth_r` | 0 |
| `seat` | wood | shatter | 7 | 28 | 215 | plinth_l, plinth_r (1) |  | `col_seat` | 3 |

#### `potted_tree`: Potted tree

1.04 × 2.45 × 0.80 m, 57 kg, cover soft, 4,508 / 5,676 triangles, 14 debris bits, 13 textures. Celadon jar planter (hollow, 2 cm wall) with a slender multi-branch tree and three leaf canopies.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pot` | ceramic | shatter | 8 | 25 | 45 | ground |  | `col_pot_hull` | 4 |
| `soil` | plant | shatter (collapse) | 5 | 20 | 400 | pot (1) |  | `col_soil` | 4 |
| `trunk` | plant | detach | – | 6 | 30 | soil (1) |  | `col_trunk` | 0 |
| `canopy_1` | plant | detach | – | 2 | 20 | trunk (1) |  | `col_canopy_1` | 2 |
| `canopy_2` | plant | detach | – | 2 | 20 | trunk (1) |  | `col_canopy_2` | 2 |
| `canopy_3` | plant | detach | – | 2 | 20 | trunk (1) |  | `col_canopy_3` | 2 |

#### `reception_desk`: Reception desk (stone front)

2.40 × 1.10 × 0.85 m, 172.5 kg, cover soft, 2,812 / 4,524 triangles, 12 debris bits, 23 textures. Three book-matched veined marble slabs with 3 mm reveals and a brass top band on a walnut carcass, dark toe-kick, soft purple wash under the stone ledge; staff worktop, drawer pedestal and monitor behind.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `carcass` | wood | fixed | – | 50 | 260 | ground |  | `col_carcass_1`, `col_carcass_2`, `col_carcass_3`, `col_carcass_4` | 0 |
| `front` | stone | shatter | 8 | 60 | 915 | carcass (1) |  | `col_front` | 3 |
| `band` | metal | detach | – | 1 | 145 | carcass (1) |  | `col_band` | 0 |
| `led` | electronics | detach | – | 0.5 | 20 | top (1) |  | `col_led` | 0 |
| `top` | stone | shatter | 8 | 45 | 830 | carcass (1) |  | `col_top` | 3 |
| `worktop` | wood | shatter | 6 | 12 | 160 | carcass (1) |  | `col_worktop` | 3 |
| `monitor` | electronics | detach | – | 3 | 35 | worktop (1) |  | `col_monitor_1`, `col_monitor_2` | 0 |
| `monitor_glass` | electronics | shatter | 8 | 1 | 25 | monitor (1) |  | `col_monitor_glass` | 3 |

#### `lobby_bench`: Lift-lobby bench

1.80 × 0.44 × 0.55 m, 27 kg, cover soft, 5,256 / 3,816 triangles, 3 debris bits, 15 textures. Dark alloy flat-bar frame, walnut slat deck with two black leather pads; bare slats at the ends as a ledge.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame` | metal | detach | – | 15 | 360 | ground |  | `col_frame_1`, `col_frame_2`, `col_frame_3` | 0 |
| `slats` | wood | shatter | 12 | 6 | 130 | frame (1) |  | `col_slats` | 3 |
| `cushion_l` | fabric | detach | – | 3 | 65 | slats (1) |  | `col_cushion_l` | 0 |
| `cushion_r` | fabric | detach | – | 3 | 65 | slats (1) |  | `col_cushion_r` | 0 |

#### `floor_lamp`: Hanji lantern floor lamp

0.45 × 1.65 × 0.45 m, 11.3 kg, cover none, 3,172 / 3,604 triangles, 11 debris bits, 15 textures. Square oak lantern frame with lit hanji panels on a brass stem and a basalt foot.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `base` | stone | detach | – | 9 | 485 | ground |  | `col_base` | 0 |
| `stem` | metal | detach | – | 1.5 | 165 | base (1) |  | `col_stem` | 0 |
| `shade_frame` | wood | detach | – | 0.6 | 60 | stem (1) |  | `col_shade_frame_1`, `col_shade_frame_2`, `col_shade_frame_3`, `col_shade_frame_4`, `col_shade_frame_5`, `col_shade_frame_6`, `col_shade_frame_7`, `col_shade_frame_8`, `col_shade_frame_9`, `col_shade_frame_10`, `col_shade_frame_11`, `col_shade_frame_12` | 0 |
| `shade` | paper | shatter | 20 (4 stay) | 0.2 | 10 | shade_frame (1) |  | `col_shade_1`, `col_shade_2`, `col_shade_3`, `col_shade_4` | 5 |
| `bulb` | glass | shatter | 4 | 0.05 | 10 | stem (1) |  | `col_bulb` | 6 |

#### `service_trolley`: Service trolley

0.88 × 0.99 × 0.58 m, 18.4 kg, cover soft, 9,344 / 11,363 triangles, 6 debris bits, 12 textures. Brushed steel two-tray trolley on rubber casters with a push bar; linen cloth, a porcelain teapot and a stack of plates.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame` | metal | detach | – | 9 | 305 | wheel_1, wheel_2, wheel_3, wheel_4 (3) |  | `col_frame_1`, `col_frame_2`, `col_frame_3`, `col_frame_4`, `col_frame_5` | 0 |
| `tray_top` | metal | detach | – | 2 | 185 | frame (1) |  | `col_tray_top_1`, `col_tray_top_2`, `col_tray_top_3`, `col_tray_top_4`, `col_tray_top_5` | 0 |
| `tray_low` | metal | detach | – | 2 | 185 | frame (1) |  | `col_tray_low_1`, `col_tray_low_2`, `col_tray_low_3`, `col_tray_low_4`, `col_tray_low_5` | 0 |
| `wheel_1` | plastic | detach | – | 0.3 | 30 | frame (1) |  | `col_wheel_1` | 0 |
| `wheel_2` | plastic | detach | – | 0.3 | 30 | frame (1) |  | `col_wheel_2` | 0 |
| `wheel_3` | plastic | detach | – | 0.3 | 30 | frame (1) |  | `col_wheel_3` | 0 |
| `wheel_4` | plastic | detach | – | 0.3 | 30 | frame (1) |  | `col_wheel_4` | 0 |
| `cloth` | fabric | detach | – | 0.4 | 40 | tray_top (1) |  | `col_cloth_1`, `col_cloth_2` | 0 |
| `plates` | ceramic | shatter | 8 | 3 | 20 | tray_top (1) |  | `col_plates` | 3 |
| `teapot` | ceramic | shatter | 6 | 0.8 | 15 | tray_top (1) |  | `col_teapot_hull` | 3 |

#### `crate_stack`: Stacked crates and a flight case

1.21 × 1.40 × 0.80 m, 41 kg, cover soft, 10,108 / 10,994 triangles, 6 debris bits, 16 textures. Slatted pine-look crate with a loose plank lid, a panelled small crate set askew on top, and an upright dark flight case.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crate_big` | wood | shatter | 14 | 18 | 185 | ground |  | `col_crate_big` | 3 |
| `lid_big` | wood | detach | – | 3 | 100 | crate_big (1) |  | `col_lid_big` | 0 |
| `crate_small` | wood | shatter | 8 | 8 | 140 | lid_big (1) |  | `col_crate_small` | 3 |
| `case` | plastic | detach | – | 12 | 80 | ground |  | `col_case` | 0 |

### Batch E: Studio, shrine, garden

#### `holo_cylinder`: Hologram cylinder

1.12 × 2.02 × 1.13 m, 159.6 kg, cover none, 13,784 / 18,326 triangles, 12 debris bits, 17 textures. Stepped machined-alloy projector plinth (purple LED kick line, waisted vent band, cable port, LED deck reveal) with eight emitter heads round a lens array, under a see-through layered purple hologram column holding a wireframe model of the tower. The hologram (`holo`) is light only: `light: true` in `parts.json`, `cast_shadows: false` in the extras of its meshes (turn shadows off and use an additive unlit shader for the `holo_*` materials in Unity), and it is a shatter part with 0 chunks set to collapse, so it switches off, rather than falling, the moment the lens goes. The data-ring node carries `spin: 0.4` in its extras for a runtime spin about Y.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `base` | metal | shatter | 10 | 150 | 750 | ground |  | `col_base_1_hull`, `col_base_2` | 6 |
| `lens` | glass | shatter | 15 | 3.5 | 20 | base (1) |  | `col_lens` | 6 |
| `emitters` | electronics | detach | – | 6 | 45 | base (1) |  | `col_emitters_1`, `col_emitters_2`, `col_emitters_3`, `col_emitters_4`, `col_emitters_5`, `col_emitters_6`, `col_emitters_7`, `col_emitters_8` | 0 |
| `holo` | electronics | shatter (collapse) | 0 | 0.05 | 1 | lens (1) |  | `col_holo` | 0 |

#### `japanese_shrine`: Japanese shrine pavilion

3.19 × 3.78 × 3.19 m, 3,087.7 kg, cover soft, 29,248 / 36,934 triangles, 95 debris bits, 47 textures. Indoor shrine pavilion for double-height rooms: four vermilion-lacquered pillars on black bases, tie and head beams with walnut bracket sets, an irimoya hip-and-gable tiled roof with upturned corners, black eave board over exposed rafters and a slatted gable; walnut plank deck on a granite plinth with a front step. Inside: mirror altar with sakaki vases, a paper andon, a suzu bell whose rope hangs in front of the offering box, and a purple LED cove under the head beams. Needs 3.9 m headroom; 2.05 m clear under the tie beams. Roof sections break into strips when the head frame goes; the gable sides also need both the front and back sections. About 29k triangles intact (over the 15k guideline: a room-sized hero piece).

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plinth` | stone | shatter | 8 | 1,400 | 1600 | ground | yes | `col_plinth` | 5 |
| `step` | stone | shatter | 4 | 110 | 1120 | ground | yes | `col_step` | 3 |
| `deck_frame` | wood | shatter | 9 | 100 | 420 | plinth (1) |  | `col_deck_frame` | 3 |
| `deck` | wood | shatter | 16 | 110 | 335 | deck_frame (1) |  | `col_deck` | 4 |
| `deck_led` | electronics | detach | – | 0.4 | 20 | deck_frame (1) |  | `col_deck_led` | 0 |
| `pillar_fl` | wood | shatter | 7 | 50 | 260 | plinth, deck_frame (1) |  | `col_pillar_fl_hull` | 3 |
| `pillar_fr` | wood | shatter | 7 | 50 | 260 | plinth, deck_frame (1) |  | `col_pillar_fr_hull` | 3 |
| `pillar_bl` | wood | shatter | 7 | 50 | 260 | plinth, deck_frame (1) |  | `col_pillar_bl_hull` | 3 |
| `pillar_br` | wood | shatter | 6 | 50 | 260 | plinth, deck_frame (1) |  | `col_pillar_br_hull` | 3 |
| `tie_beams` | wood | shatter | 6 | 36 | 230 | pillar_fl, pillar_fr, pillar_bl, pillar_br (2) |  | `col_tie_beams_1`, `col_tie_beams_2`, `col_tie_beams_3`, `col_tie_beams_4` | 3 |
| `head_frame` | wood | shatter | 12 | 170 | 420 | pillar_fl, pillar_fr, pillar_bl, pillar_br (3) |  | `col_head_frame_1`, `col_head_frame_2`, `col_head_frame_3`, `col_head_frame_4`, `col_head_frame_5`, `col_head_frame_6`, `col_head_frame_7`, `col_head_frame_8`, `col_head_frame_9` | 4 |
| `cove_led` | electronics | detach | – | 0.6 | 20 | head_frame (1) |  | `col_cove_led` | 0 |
| `roof_f` | ceramic | shatter (collapse) | 4 | 260 | 700 | head_frame (1) |  | `col_roof_f_1_hull`, `col_roof_f_2_hull`, `col_roof_f_3_hull`, `col_roof_f_4_hull`, `col_roof_f_5_hull`, `col_roof_f_6_hull`, `col_roof_f_7_hull`, `col_roof_f_8_hull`, `col_roof_f_9_hull` | 12 |
| `roof_b` | ceramic | shatter (collapse) | 4 | 260 | 700 | head_frame (1) |  | `col_roof_b_1_hull`, `col_roof_b_2_hull`, `col_roof_b_3_hull`, `col_roof_b_4_hull`, `col_roof_b_5_hull`, `col_roof_b_6_hull`, `col_roof_b_7_hull`, `col_roof_b_8_hull`, `col_roof_b_9_hull` | 12 |
| `roof_l` | ceramic | shatter (collapse) | 2 | 150 | 500 | head_frame, roof_f, roof_b (3) |  | `col_roof_l_1_hull`, `col_roof_l_2_hull`, `col_roof_l_3_hull`, `col_roof_l_4_hull`, `col_roof_l_5_hull`, `col_roof_l_6_hull`, `col_roof_l_7_hull` | 8 |
| `roof_r` | ceramic | shatter (collapse) | 2 | 150 | 500 | head_frame, roof_f, roof_b (3) |  | `col_roof_r_1_hull`, `col_roof_r_2_hull`, `col_roof_r_3_hull`, `col_roof_r_4_hull`, `col_roof_r_5_hull`, `col_roof_r_6_hull`, `col_roof_r_7_hull` | 8 |
| `ridge` | ceramic | detach | – | 90 | 400 | roof_f, roof_b (2) |  | `col_ridge` | 3 |
| `altar` | wood | shatter | 6 | 14 | 170 | deck (1) |  | `col_altar` | 3 |
| `mirror` | metal | detach | – | 3 | 210 | altar (1) |  | `col_mirror` | 0 |
| `vase_r` | ceramic | shatter | 6 | 1.6 | 15 | altar (1) |  | `col_vase_r_hull` | 3 |
| `sakaki_r` | plant | detach | – | 0.3 | 15 | vase_r (1) |  | `col_sakaki_r` | 3 |
| `vase_l` | ceramic | shatter | 5 | 1.6 | 15 | altar (1) |  | `col_vase_l_hull` | 3 |
| `sakaki_l` | plant | detach | – | 0.3 | 15 | vase_l (1) |  | `col_sakaki_l` | 3 |
| `andon` | wood | detach | – | 2.2 | 40 | deck (1) |  | `col_andon` | 0 |
| `bell` | metal | detach | – | 2.5 | 200 | head_frame (1) |  | `col_bell` | 0 |
| `bell_rope` | fabric | detach | – | 1.2 | 50 | bell (1) |  | `col_bell_rope` | 0 |
| `offering_box` | wood | shatter | 9 | 24 | 200 | deck (1) |  | `col_offering_box` | 3 |

#### `maple_tree`: Red maple in a garden bed

2.30 × 2.33 × 1.62 m, 453 kg, cover soft, 13,102 / 13,476 triangles, 42 debris bits, 25 textures. Cloud-pruned red Japanese maple on a gnarled trunk in a low basalt bed with raked gravel, moss islands, two moss-capped stones, stepping pebbles and a warm LED washer under the coping. Six flat leaf pads (2D alpha cards, with a dark under-layer so they read solid from below) each come loose with their twigs.

| Part | Class | Break | Chunks | kg | hp | Attached to (need) | Stops bullets | Colliders | Debris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bed` | stone | shatter | 8 | 320 | 1200 | ground | yes | `col_bed_1`, `col_bed_2`, `col_bed_3`, `col_bed_4` | 5 |
| `soil` | plant | shatter (collapse) | 6 | 90 | 400 | bed (1) |  | `col_soil` | 10 |
| `trunk` | plant | detach | – | 28 | 55 | soil (1) |  | `col_trunk_1`, `col_trunk_2`, `col_trunk_3` | 3 |
| `canopy_1` | plant | detach | – | 2.5 | 25 | trunk (1) |  | `col_canopy_1` | 4 |
| `canopy_2` | plant | detach | – | 2.5 | 25 | trunk (1) |  | `col_canopy_2` | 4 |
| `canopy_3` | plant | detach | – | 2.5 | 25 | trunk (1) |  | `col_canopy_3` | 4 |
| `canopy_4` | plant | detach | – | 2.5 | 25 | trunk (1) |  | `col_canopy_4` | 4 |
| `canopy_5` | plant | detach | – | 2.5 | 25 | trunk (1) |  | `col_canopy_5` | 4 |
| `canopy_6` | plant | detach | – | 2.5 | 25 | trunk (1) |  | `col_canopy_6` | 4 |
## Changing and rebuilding

`viewer.html` is the source: everything is procedural three.js r0.180.0 inlined in one module. It has these
sections in order:

- **Kit.** Textures, the 52 materials in `M`, geometry helpers, and the shape helpers shared by the pieces (`softBox`,
  `taperLeg`, `bottlePart`, `mergeGeos`, `pillowGeo`, `pipeLoop`, `insetPoly`, `frameX`, `fineWood`, `placeGeo`,
  `screenBox`, `addMonitor`, `leafCards`, `taperTube`, `puffPad`, `clothSheet`).
- **Builder.** `defPiece`, `Piece` and `Part`.
- **Fracture.** Voronoi cells cut by plane clipping for convex meshes, or three-bvh-csg for others. Wood cells
  stretch along the grain; glass cells are radial round an impact point.
- **Pieces.** Batch 0 and A–E, one `defPiece({ id, name, batch, rooms, cover, note, build(P) })` each.
- **Viewer.**

A piece is built like this:

```js
defPiece({ id: 'coffee_table', name: 'Coffee table, glass top', batch: '0', cover: 'soft', rooms: [...], note: '...',
  build(P) {
    const top = P.part('top', { break: 'shatter', attach: 'frame', chunks: 10, pattern: 'radial', impact: [x, y, z] });
    top.add(rbox(...), M.glass);          // geometry in piece coordinates, one material per call
    top.colBox(x0, x1, y0, y1, z0, z1);   // optional; a box round the part otherwise
  } });
```

Part options are `break`, `attach`, `need`, `chunks` (4–12, varied ±30% per part; for glass, the number of
spokes, 5–9), `pattern` (`radial`, the default for flat glass; `tempered`, with `maxR`, a patch of slabs and the
rest as cube debris), `impact` (where the cells cluster), `grain`, `grainStretch` (wood 5), `perItem` (wood with 3+
boards breaks board by board; on by default), `pivot` (hinges), `mass`, `health`, `stops`, `cls`, `seed`, `cells`
(boxes in piece coordinates to cut along, such as an upholstered body's build lines; items within `snap`, 18 mm, of
a cut stay whole), `bulge` and `recess` (lumps on the cuts and how far the cap sinks behind the cover; fabric 0.005
and 0.012), `teeth: false` (straight wood cuts), `tear: false` (paper cracks like the rest) and `collapse`. Wood teeth that would cost more than max(6000, 5 × the
part's own) triangles fall back to straight cuts. Masses default to volume × class density, and health to the
scale above. Debris: shatter parts get 3 bits (paper 5, glass 6, fabric 6, tempered glass 24 cubes); detach parts none unless they ask for
some. After building, the piece is moved so the footprint of its render meshes (not the collider proxies) is
centred on the origin. Rules: no text or symbols, a closed solid
for every shatter part, and about 1–15k triangles intact.

Rebuild from the repo root:

```
node tools/export-glb.js props/haneul-furniture/viewer.html --out props/haneul-furniture/glb   # one <id>.glb per piece
node tools/unity-export.js props/haneul-furniture/glb/*.glb --out props/haneul-furniture/unity
node tools/check-glb.js props/haneul-furniture/glb/<id>.glb [--render out.png]
node tools/render-preview.js props/haneul-furniture/viewer.html                                # preview.png (room view)
python3 props/haneul-furniture/sounds/generate_sounds.py                                       # the WAVs
```

`export-glb.js` asks the viewer for `window.__model.exportIds` and exports one piece per call. `parts.json` is what
`window.__model.debug.partsJson()` returns, written with one-space indentation. The viewer's sounds are MP3 copies
of the WAVs, inlined as `SOUND_DATA`.

The viewer's debug handle (`window.__model.debug`) has these calls:

- `set({ piece, mode, view, dir, dist, turn, t, k })`, where mode is `intact`, `exploded`, `chunks`, `colliders`,
  `broken` or `shoot`, and view is `piece` or `room`
- `shoot({ part, piece | room, amount, dir, force })`
- `fire(x, y)` and `blastAt([x, y, z])`
- `step(seconds)` and `state()`
- `info(id)`, `list()`, `partsJson()`, `pieceBox(id)`, `timings()` and `chunkTris()` (triangles in each chunk set)

Every file passes the Khronos glTF validator with 0 errors, and its only warnings (severity 1) are
`MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`. The infos are unused texture coordinates on the invisible collider proxies,
a few degenerate triangles from welding, and the non-power-of-two screen image (1024 × 576). `unity-export.js` checks
that every primitive it writes is indexed whole triangles, and a LOD never writes an empty material group.
