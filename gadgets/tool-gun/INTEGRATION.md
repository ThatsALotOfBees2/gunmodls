# Tool Gun: integration guide

What `ToolGun.cs` does: it switches between the 11 tools shown on the rear display, fires a raycast with a beam from the
muzzle and a spark at the hit point, raises a UnityEvent for each tool so your game logic can run, and plays the five clips.

## Axes and import

- Metres, glTF axes: +Y up, the muzzle points +Z, the right side faces -X. The origin is on the bore axis above the trigger.
- glTFast negates X on import, so the thumb wheel (left side, +X in the glb) ends up on -X in Unity. The script reads
  everything from the imported nodes, so nothing needs a sign flip.
- Use `unity/tool-gun.glb`. Import with Animation: **Legacy** (the default path), or Mecanim (see below).

## Nodes

| Node | Use |
| --- | --- |
| `muzzle` | beam origin; its +Z (Unity forward) is the shot direction when `aimFrom` is empty |
| `screen_center` | centre of the display glass, +Z out of the glass (for a UI overlay or a world-space canvas) |
| `grip_attach` | hand attach point on the grip axis (tilted 15° like the grip) |
| `trigger_assembly`, `hammer_assembly`, `cylinder_assembly`, `selector_wheel`, `screen_assembly`, `emitter_ring` | moving parts (rotation keys) |
| `fx_beam_flash` | muzzle flash; at rest it is scaled to 1e-4, the `fire` clip pops it, the `deny` clip holds it hidden |
| `fx_scanline` | thin glowing line that sweeps the display (position keys) |

## Clips

`idle` (2 s, loop), `fire` (0.6 s, the hammer drops and the flash peaks at 0.125 s), `deny` (0.6 s, the same
action with no flash; `Deny()` plays it), `switch_tool` (0.45 s, swap the cell
at 0.2 s), `inspect` (2.6 s). Clips are sampled at 30 fps. glTF cannot animate emission, so the script pulses the
screen glow itself.

## The screen atlas

The atlas is the emissive map of the `screen` material: 1024 × 768 px, 4 × 4 cells of 256 × 192 px, with the art in the
inner 244 × 180 px of each cell and a 6 px gutter.

| Cell | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shows | boot | idle (tool menu) | select | fire | error | remover | weld | rope | balloon | color | material | hold | thruster | light | wheel | duplicate |

The mesh UVs cover cell 0. The glb carries `KHR_texture_transform` offset `[0.25, 0]`, so on its own it shows `idle`.
glTFast flips V on import, so the offset for cell (col, row) is the cell-0 offset + (scale.x · col / 4, −scale.y · row / 4).
The script does this math on a material copy it owns. It copies only the panel material (`screen`, or glTFast's
`screen (Instance)` style copies), never `screen_glass` or `screen_scanline`, so the violet scan line keeps its colour.
The glb's atlas sampler is LINEAR with no mipmaps; if Unity extracts the texture, turn **Generate Mip Maps** off on it,
or at a distance neighbouring cells bleed into the shown one. To add your own tools, point several entries in `tools` at the
same cell, or paint new art into the atlas.

## Unity setup

1. Install glTFast (`com.unity.cloud.gltfast`). Copy `unity/Editor/GunmodlsPrefabBuilder.cs` (from the repo) into an
   `Editor` folder and `unity/Runtime/ToolGun.cs` anywhere in Assets.
2. Import `unity/tool-gun.glb` with Animation: Legacy. Select it and run Tools > Gunmodls > Build Prefabs From Selection.
   You get a LODGroup and BoxColliders.
3. Add **ToolGun** to the prefab root (next to the `Animation` component glTFast created). The colliders block raycasts
   from inside the gun, so either set `hitMask` to leave out the gun's own layer, or put the gun on a layer such as "Viewmodel".
4. Set `aimFrom` to the player camera so shots go where the crosshair points. The beam still starts at `muzzle`.
5. Fill in `tools`. By default there is one entry per atlas tool. Each entry has a `cooldown`, a `needsTarget` flag
   and an `onFire(RaycastHit)` event. Wire that event to your weld or remover logic. With `needsTarget` on (the
   default), a shot that hits nothing is denied. With it off (light and balloon), a miss still fires to full `range`
   and `onFire` is raised with a synthetic hit: `point` is the end of the ray, `normal` points back along it and
   `collider` is null (test `hit.collider == null` to tell a miss); the global `onMiss` follows.
6. Optional: `sparkPrefab` (a ParticleSystem is spawned at the hit, facing the surface normal), `beam` (your own
   LineRenderer; otherwise one is made with the Sprites/Default shader), audio clips, and global
   `onHit` / `onMiss` / `onDenied` / `onToolChanged`.
7. Input, for example: `if (Input.GetMouseButtonDown(0)) gun.Fire(); if (Input.mouseScrollDelta.y > 0) gun.NextTool();`.

**Mecanim instead of Legacy:** import with Mecanim and make a controller with states named `idle`, `fire`,
`deny`, `switch_tool` and `inspect`, holding the imported clips. Then assign `animator`. The script calls
`CrossFade(state, 0.05)` and times the return to `idle` with the clip lengths above.

API: `NextTool()`, `PreviousTool()`, `SelectTool(i)`, `Fire()` (returns false while cooling down or when denied),
`Deny()` (plays `deny`: dry fire, error frame, no flash), `Inspect()`, `Boot()`, `SetCell(c)` (-1 = automatic), `CurrentTool`, `Muzzle`, `ScreenCenter`,
`GripAttach`.

The viewer (`viewer.html`) is for previewing only: it loads three.js from cdn.jsdelivr.net and requests Google Fonts;
offline the fonts fall back to system fonts.
