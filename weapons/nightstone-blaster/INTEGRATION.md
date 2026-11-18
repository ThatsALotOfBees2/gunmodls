# Nightstone Blaster: Unity setup

## Prefab
1. Import `unity/nightstone-blaster.glb` with glTFast. Set Animation to **Legacy**, or use an Animator with the states
   `idle`, `fire`, `reload` and `inspect`. Build the prefab with **Tools > Gunmodls > Build Prefabs From Selection**.
   This turns the `_COL` boxes into BoxColliders.
2. Add `NightstoneBlaster` to the prefab root. It finds `muzzle`, `drum_shard_0..5` and the glow materials (`core_hot`,
   `core_crystal`, `seam_glow*`, `nightstone_veined`) by name and makes one per-instance copy per source material. To
   shoot where the crosshair points, set `aimFrom` to the player camera. Rays and shards skip every collider under
   `ownerRoot` (default `aimFrom.root`, else the gun's root), so the player capsule and the gun are never hit; set
   `ownerRoot` to the player object if the camera is not under it.
3. Add `NightstoneBlasterFx` to the same object and assign:
   - the eight textures from `vfx/tex_*.png` (enable Alpha Is Transparency);
   - `shardMeshes` = `fx_shard_a`, `fx_shard_b`, `fx_shard_c`;
   - `fragmentMeshes` = `fx_fragment_0..4` (both from `vfx/nightstone-blaster-fx.glb`).

   - **for player builds, the Material slots** (`flashMaterial`, `smokeMaterial`, `sparkMaterial`, `tracerMaterial`,
     `glowMaterial`, `trailDarkMaterial`, `bulletDecalMaterial`, `shatterDecalMaterial`, `shardMaterial`): URP
     Particles/Unlit with the matching texture, additive for flash/spark/tracer/glow, alpha blended for the rest.
     An empty slot falls back to `Shader.Find`, which only works in a build when the shader is listed in
     **Project Settings > Graphics > Always Included Shaders** (`Universal Render Pipeline/Particles/Unlit`,
     `Universal Render Pipeline/Lit`) or used by a material somewhere in the build. Otherwise the effects render pink.

   The default `shardMaterial` is a glossy black URP/Lit with a faint violet emission. For the viewer's look, use a
   material with a violet fresnel rim (`#7a50f0` × 1.5, power 2.5, about 0.15 of the surface lit).
4. Put the hands on `grip_attach` and `offhand_attach`. `offhand_attach` rides on the pump, so IK follows the reload.
5. Implement `INightstoneDamageable.TakeDamage(amount, point, direction, fromShard)` on anything that can be hurt.

## Gameplay (`NightstoneBlaster`)
| Call / event | Behaviour |
|---|---|
| `Fire()` | False while cooling down (`cooldown` 0.55 s), reloading or empty. With an empty drum it raises `onEmpty`, then reloads if `autoReload` is on. The shot comes `shotDelay` (0.04 s) after the call. |
| bullets | `bulletCount` 7 raycasts from `aimFrom` in a `bulletSpread` 3.5° cone, out to `bulletRange` 80 m. Each does `bulletDamage` 9 at full damage up to `falloffStart` 8 m, dropping to `minDamageScale` 0.3 at `falloffEnd` 30 m. `onHit(RaycastHit)` fires for each hit. Tracers are drawn from the muzzle. |
| shards | `shardCount` 3 projectiles leave the upper bore at `shardSpeed` 55 m/s ±8 % in a `shardSpread` 7° cone, with `shardGravity` 9.81. Each step uses a swept raycast. On impact a shard does `shardDamage` 22, raises `onShardHit(point, normal, collider)` and shatters (fx). Shards expire after `shardLifetime` 3 s. |
| `Reload()` | False during the 0.04 s between `Fire()` and the shot. Otherwise plays the reload clip and raises `onReload`. The drum is full after `reloadTime` 1.6 s, then `onReloaded` fires. |
| `Inspect()` | Plays the inspect clip. |
| `onFire(origin, aim)` | Fires once per shot, for audio, recoil and camera kick. |
| state | `Ammo`, `IsReloading`, `CanFire` |
| clip lengths | Read from the clips (`Animation[n].length` or the Animator controller's clips); 0.7 / 1.6 / 2.8 s are only the fallback. `drumSize` is clamped to 1–6; missing slots show as spent. |
| glow | The core, seam and veined-stone materials breathe (`coreBreath`, `coreBreathSpeed`) and flash on each shot (`coreFlash`). The script writes per-instance copies of these materials. |

The drum shows the loaded shots. Slot 0 feeds the bore. At rest, shards with index i ≥ 6 − spent are hidden. From the
shot until the fire clip ends, shard 0 and shards with i ≥ 7 − spent are hidden. The fire clip turns the drum −60°
(0.16–0.36 s) and has a step key back to 0° at its end (0.699 → 0.7 s); inspect turns it a full −360° and ends at rest;
the idle clip keys the drum, head, pump, trigger and petals at rest, and `Play("idle")` also resets the drum. So under
Legacy Animation (which never resets transforms) the drum is always at 0° when the rest rule applies. The reload clip
scales the shards itself.

## Effects (`NightstoneBlasterFx`)
The script builds every ParticleSystem in code at Awake. They are world-space and live under `nightstone_fx`, except
the two flash systems, which are parented under the muzzle on the first shot. `OnDestroy` destroys `nightstone_fx`, the
flash systems, pooled shards and decals, and every material and mesh the script made (one cached material per texture
and blend mode; tracers and trails share them).

| Group | Settings |
|---|---|
| Muzzle flash | Mesh particles local to the muzzle: a front quad (flipbook cells 0–7) and crossed side cards along +Z (cells 8–15). Lifetime 0.03–0.045 s, size 0.07–0.1 × 0.15–0.22 m, additive, fading out. Also a 0.24 m warm glow (0.09 s) and a point light at 3 intensity for 0.06 s. |
| Embers | 18 stretched sparks at 6–20 m/s in a 14° cone. Drag 9, lifetime 0.06–0.2 s, colour going from white to orange. |
| Smoke | 16 puffs at 0.6–4 m/s in a 16° cone. Drag 3.2, slight lift, size 0.03 → ×6, alpha peaks at 0.34, smoke flipbook over the lifetime, 1.4–2.8 s. |
| Bore wisps | 2 per bore, rising at 0.03–0.08 m/s for 1.6 s. |
| Tracers | Pooled LineRenderers using `tex_tracer`. They travel at `tracerSpeed` 350 m/s, are 1.2 m long, and collapse into the hit. `tracerWidth` 30 mm is the full quad; the texture's hard core is the middle ~3 mm. |
| Bullet impact | A decal (pooled 48, 20 s life; parented to the hit collider when it is not static, released when that object is disabled), 10 warm sparks (gravity, drag 2), 3 dust puffs and a 0.04 s glint. |
| Shard trails | Two TrailRenderers per pooled shard: dark smoke (0.045 s, 16 mm) and a thin violet core (0.03 s, 2.8 mm). |
| Shard impact | A shatter decal and 12 fragment mesh particles (size 0.6–1.4, gravity, world collision with bounce 0.25, spin ±15 rad/s, shrinking at the end of a 2.5–4 s life). Also 8 violet-white sparks, 5 grey dust puffs, a violet glint and a faint violet light (0.15 s). |

Materials use URP `Particles/Unlit` when it exists. Additive effects set `_Blend` to 2; alpha effects set it to 0. The
script falls back to built-in `Particles/Standard Unlit`, then to the legacy particle shaders. Decals are unlit
alpha-blended quads; swap them for URP Decal Projectors if your project uses those.

**Not verified in Unity.** Both scripts compile with mcs against API stubs only. Check these in play mode:
- the stretched-billboard texture axis for sparks (the PNGs are drawn head-up);
- the flash card orientation;
- particle sizes at gameplay distance;
- that `ParticleSystem.Emit` works with emission disabled. This is the usual pattern, but it has not been checked
  here.
