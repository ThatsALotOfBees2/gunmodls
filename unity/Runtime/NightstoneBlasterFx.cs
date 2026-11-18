// Effects for the Nightstone Blaster, built in code from the shipped assets (weapons/nightstone-blaster/vfx):
// textures tex_*.png and the meshes in nightstone-blaster-fx.glb (fx_shard_a/b/c, fx_fragment_0..4). NightstoneBlaster
// calls MuzzleFlash / Tracer / SpawnShard / ShardImpact / ReleaseShard; everything else is internal and pooled.
// Layers, grounded (no outlines, no flat blobs): crisp objects (shard meshes, fragments, decals), soft additive glow
// (flash, impact glints, a short light), short streaks (tracers, sparks), slow neutral smoke and dust.
//   Muzzle   front flash quad (flipbook cells 0-7) + crossed side plume cards (cells 8-15), both local to the muzzle,
//            0.04 s; a hot core glint; powder embers (stretched); a stalling smoke jet (16 puffs) and bore wisps; a warm
//            point light for 0.06 s.
//   Bullets  LineRenderer tracers (tex_tracer, white-gold) travelling at tracerSpeed and collapsing into the hit;
//            at the hit: a bullet decal, warm sparks, a dust puff, a tiny glint.
//   Shards   pooled shard meshes (black crystal with a dim violet rim if your shader has one) with two TrailRenderers:
//            a dark smoky trail and a thin violet core. Impact: a shatter decal, 12 black fragments (mesh particles,
//            gravity, world collision), violet-white glints, grey dust, a faint violet light.
// Materials: assign the serialized Material slots (recommended for player builds). An empty slot falls back to a
// material made at runtime with Shader.Find (URP Particles/Unlit, else Particles/Standard Unlit, else the legacy
// particle shaders; URP Lit / Standard for the shards). Shader.Find only works in a build if that shader is in
// Project Settings > Graphics > Always Included Shaders (or used by a material in a scene or Resources), so either fill
// the slots or add those shaders there. Runtime materials are cached (one per texture and blend mode) and destroyed in
// OnDestroy together with the scene-root "nightstone_fx" object and the flash systems parented under the muzzle.
// Decals parent themselves to the collider they hit when it is not static, and are released when it is disabled.
// Not run in Unity here: compile-checked with mcs against API stubs only; tune sizes in play mode.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

public class NightstoneBlasterFx : MonoBehaviour
{
    [Header("Textures (vfx/tex_*.png, import with Alpha Is Transparency)")]
    public Texture2D muzzleFlashSheet;   // tex_muzzle_flash_4x4.png
    public Texture2D smokeSheet;         // tex_smoke_4x4.png
    public Texture2D sparkTexture;       // tex_spark.png (head at the top)
    public Texture2D emberTexture;       // tex_ember.png
    public Texture2D tracerTexture;      // tex_tracer.png (head at the top)
    public Texture2D glowTexture;        // tex_soft_glow.png
    public Texture2D bulletDecal;        // tex_decal_bullet_impact.png
    public Texture2D shatterDecal;       // tex_decal_crystal_shatter.png

    [Header("Meshes (nightstone-blaster-fx.glb)")]
    public Mesh[] shardMeshes;           // fx_shard_a, fx_shard_b, fx_shard_c
    public Mesh[] fragmentMeshes;        // fx_fragment_0..4
    [Tooltip("Optional lit material for shards and fragments (glossy black, smoothness ~0.95, a dim violet fresnel/rim if available)")] public Material shardMaterial;

    [Header("Materials (optional; empty = made at runtime from the textures, see the header)")]
    [Tooltip("Additive, tex_muzzle_flash_4x4")] public Material flashMaterial;
    [Tooltip("Alpha blended, tex_smoke_4x4 (smoke, wisps, dust)")] public Material smokeMaterial;
    [Tooltip("Additive, tex_spark (embers, impact sparks)")] public Material sparkMaterial;
    [Tooltip("Additive, tex_tracer (LineRenderer tracers)")] public Material tracerMaterial;
    [Tooltip("Additive, tex_soft_glow (glints, muzzle glow, shard trail core)")] public Material glowMaterial;
    [Tooltip("Alpha blended, tex_soft_glow (dark shard trail)")] public Material trailDarkMaterial;
    [Tooltip("Alpha blended, tex_decal_bullet_impact")] public Material bulletDecalMaterial;
    [Tooltip("Alpha blended, tex_decal_crystal_shatter")] public Material shatterDecalMaterial;

    [Header("Look")]
    public Color flashColor = new Color(1f, 0.86f, 0.66f, 1f);
    public Color tracerColor = new Color(1f, 0.9f, 0.7f, 1f);
    public Color violet = new Color(0.42f, 0.25f, 0.88f, 1f);
    public Color smokeColor = new Color(0.5f, 0.5f, 0.52f, 1f);
    [Tooltip("tracerWidth is the full quad width; tex_tracer's hard core is the middle ~10 % of it")] public float tracerSpeed = 350f, tracerLength = 1.2f, tracerWidth = 0.03f;
    public float decalSize = 0.045f, shatterDecalSize = 0.14f, decalLife = 20f;
    public int decalPool = 48;
    public float lightIntensity = 3f;

    ParticleSystem flashFront, flashSide, embers, smoke, wisps, sparks, glints, dust, glow, fragments;
    Light muzzleLight, impactLight;
    float muzzleLightT = 9f, impactLightT = 9f;
    class TracerLine { public LineRenderer line; public Vector3 a, b; public float t, travel; public bool hit; public Vector3 hp, hn; public Collider hc; }
    readonly List<TracerLine> tracers = new List<TracerLine>();
    readonly Stack<Transform> shardPool = new Stack<Transform>();
    readonly List<Transform> decals = new List<Transform>();
    readonly List<float> decalBorn = new List<float>();
    int decalNext;
    readonly List<Transform> decalParents = new List<Transform>();
    Mesh frontQuad, sideCards, decalQuad;
    Material bulletDecalMat, shatterDecalMat, flashMat, smokeMat, sparkMat, tracerMat, glowMat, trailDarkMat;
    Transform fxRoot;
    readonly Dictionary<string, Material> matCache = new Dictionary<string, Material>();
    readonly List<Object> owned = new List<Object>();   // runtime materials and meshes, destroyed in OnDestroy

    void Awake()
    {
        frontQuad = Quad(false); sideCards = Quad(true); decalQuad = DecalQuad(); owned.Add(frontQuad); owned.Add(sideCards); owned.Add(decalQuad);
        if (shardMaterial == null) { shardMaterial = DefaultShardMaterial(); owned.Add(shardMaterial); }
        flashMat = flashMaterial != null ? flashMaterial : ParticleMaterial(muzzleFlashSheet, true);
        smokeMat = smokeMaterial != null ? smokeMaterial : ParticleMaterial(smokeSheet, false);
        sparkMat = sparkMaterial != null ? sparkMaterial : ParticleMaterial(sparkTexture, true);
        tracerMat = tracerMaterial != null ? tracerMaterial : ParticleMaterial(tracerTexture, true);
        glowMat = glowMaterial != null ? glowMaterial : ParticleMaterial(glowTexture, true);
        trailDarkMat = trailDarkMaterial != null ? trailDarkMaterial : ParticleMaterial(glowTexture, false);
        Transform root = new GameObject("nightstone_fx").transform;   // world-space systems live here (not under the gun)
        fxRoot = root;
        // muzzle: local to the muzzle at fire time (re-parented in MuzzleFlash)
        flashFront = System("flash_front", root, flashMat, true);
        Flipbook(flashFront, 0, 8); MeshMode(flashFront, frontQuad);
        flashSide = System("flash_side", root, flashMat, true);
        Flipbook(flashSide, 8, 7); MeshMode(flashSide, sideCards);
        foreach (ParticleSystem p in new[] { flashFront, flashSide })
        {
            var m = p.main; m.startLifetime = new ParticleSystem.MinMaxCurve(0.03f, 0.045f); m.startSpeed = 0f; m.startColor = flashColor;
            m.startSize3D = true; m.startSizeX = new ParticleSystem.MinMaxCurve(0.07f, 0.1f); m.startSizeY = new ParticleSystem.MinMaxCurve(0.07f, 0.1f); m.startSizeZ = new ParticleSystem.MinMaxCurve(0.15f, 0.22f);
            m.startRotation3D = true; m.startRotationZ = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            m.simulationSpace = ParticleSystemSimulationSpace.Local;
            var c = p.colorOverLifetime; c.enabled = true; c.color = Fade(1f, 0f);
            var s = p.sizeOverLifetime; s.enabled = true; s.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.85f, 1f, 1.35f));
            p.GetComponent<ParticleSystemRenderer>().alignment = ParticleSystemRenderSpace.Local;
        }
        // powder embers: fast, tiny, stretched along velocity, short
        embers = System("embers", root, sparkMat, false);
        { var m = embers.main; m.startLifetime = new ParticleSystem.MinMaxCurve(0.06f, 0.2f); m.startSpeed = new ParticleSystem.MinMaxCurve(6f, 20f); m.startSize = 0.004f; m.startColor = flashColor; m.gravityModifier = 0.2f;
          var sh = embers.shape; sh.enabled = true; sh.shapeType = ParticleSystemShapeType.Cone; sh.angle = 14f; sh.radius = 0.01f;
          Drag(embers, 9f); Stretch(embers, 0.015f); var c = embers.colorOverLifetime; c.enabled = true; c.color = Ramp(new Color(1f, 0.9f, 0.7f), new Color(1f, 0.45f, 0.15f)); }
        // smoke jet: stalls (drag), rises a little, grows, fades; neutral grey
        smoke = System("smoke", root, smokeMat, false);
        { var m = smoke.main; m.startLifetime = new ParticleSystem.MinMaxCurve(1.4f, 2.8f); m.startSpeed = new ParticleSystem.MinMaxCurve(0.6f, 4f); m.startSize = new ParticleSystem.MinMaxCurve(0.03f, 0.06f); m.startColor = smokeColor; m.gravityModifier = -0.01f;
          m.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f); m.maxParticles = 200;
          var sh = smoke.shape; sh.enabled = true; sh.shapeType = ParticleSystemShapeType.Cone; sh.angle = 16f; sh.radius = 0.015f;
          Drag(smoke, 3.2f); Flipbook(smoke, 0, 16, true);
          var s = smoke.sizeOverLifetime; s.enabled = true; s.size = new ParticleSystem.MinMaxCurve(6f, new AnimationCurve(new Keyframe(0f, 0.17f), new Keyframe(0.35f, 0.75f), new Keyframe(1f, 1f)));
          var c = smoke.colorOverLifetime; c.enabled = true; c.color = Fade(0.34f, 0.08f);
          var r = smoke.rotationOverLifetime; r.enabled = true; r.z = new ParticleSystem.MinMaxCurve(-0.25f, 0.25f); }
        wisps = System("bore_wisps", root, smokeMat, false);
        { var m = wisps.main; m.startLifetime = 1.6f; m.startSpeed = new ParticleSystem.MinMaxCurve(0.03f, 0.08f); m.startSize = 0.012f; m.startColor = smokeColor; m.gravityModifier = -0.005f;
          Flipbook(wisps, 2, 12, true); var s = wisps.sizeOverLifetime; s.enabled = true; s.size = new ParticleSystem.MinMaxCurve(7f, AnimationCurve.Linear(0f, 0.15f, 1f, 1f));
          var c = wisps.colorOverLifetime; c.enabled = true; c.color = Fade(0.22f, 0.15f); }
        // impacts: sparks (warm or violet per call), glints, dust, glow
        sparks = System("impact_sparks", root, sparkMat, false);
        { var m = sparks.main; m.startLifetime = new ParticleSystem.MinMaxCurve(0.1f, 0.35f); m.startSpeed = new ParticleSystem.MinMaxCurve(2f, 7f); m.startSize = 0.0035f; m.gravityModifier = 1f; m.maxParticles = 400;
          var sh = sparks.shape; sh.enabled = true; sh.shapeType = ParticleSystemShapeType.Hemisphere; sh.radius = 0.005f;
          Drag(sparks, 2f); Stretch(sparks, 0.01f); var c = sparks.colorOverLifetime; c.enabled = true; c.color = Fade(1f, 0f); }
        glints = System("impact_glow", root, glowMat, false);
        { var m = glints.main; m.startLifetime = 0.04f; m.startSpeed = 0f; m.startSize = 0.03f; var c = glints.colorOverLifetime; c.enabled = true; c.color = Fade(0.6f, 0f); }
        glow = System("muzzle_glow", root, glowMat, false);
        { var m = glow.main; m.startLifetime = 0.09f; m.startSpeed = 0f; m.startSize = 0.24f; m.startColor = new Color(1f, 0.62f, 0.32f, 0.35f); var c = glow.colorOverLifetime; c.enabled = true; c.color = Fade(1f, 0f); }
        dust = System("impact_dust", root, smokeMat, false);
        { var m = dust.main; m.startLifetime = new ParticleSystem.MinMaxCurve(0.9f, 2f); m.startSpeed = new ParticleSystem.MinMaxCurve(0.1f, 0.45f); m.startSize = new ParticleSystem.MinMaxCurve(0.02f, 0.04f); m.gravityModifier = 0.04f; m.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
          var sh = dust.shape; sh.enabled = true; sh.shapeType = ParticleSystemShapeType.Hemisphere; sh.radius = 0.01f;
          Drag(dust, 2.5f); Flipbook(dust, 3, 12, true); var s = dust.sizeOverLifetime; s.enabled = true; s.size = new ParticleSystem.MinMaxCurve(4f, AnimationCurve.EaseInOut(0f, 0.25f, 1f, 1f));
          var c = dust.colorOverLifetime; c.enabled = true; c.color = Fade(0.4f, 0.05f); }
        // shatter fragments: mesh particles, lit, colliding with the world
        fragments = System("shatter_fragments", root, shardMaterial, false);
        { var m = fragments.main; m.startLifetime = new ParticleSystem.MinMaxCurve(2.5f, 4f); m.startSpeed = new ParticleSystem.MinMaxCurve(0.6f, 2.6f); m.startSize = new ParticleSystem.MinMaxCurve(0.6f, 1.4f); m.gravityModifier = 1f;
          m.startRotation3D = true; m.startRotationX = m.startRotationY = m.startRotationZ = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
          var sh = fragments.shape; sh.enabled = true; sh.shapeType = ParticleSystemShapeType.Hemisphere; sh.radius = 0.01f;
          var rot = fragments.rotationOverLifetime; rot.enabled = true; rot.separateAxes = true; rot.x = rot.y = rot.z = new ParticleSystem.MinMaxCurve(-15f, 15f);
          var col = fragments.collision; col.enabled = true; col.type = ParticleSystemCollisionType.World; col.bounce = 0.25f; col.dampen = 0.5f; col.lifetimeLoss = 0f;
          var sz = fragments.sizeOverLifetime; sz.enabled = true; sz.size = new ParticleSystem.MinMaxCurve(1f, new AnimationCurve(new Keyframe(0f, 1f), new Keyframe(0.85f, 1f), new Keyframe(1f, 0f)));
          var pr = fragments.GetComponent<ParticleSystemRenderer>(); pr.renderMode = ParticleSystemRenderMode.Mesh;
          if (fragmentMeshes != null && fragmentMeshes.Length > 0) pr.SetMeshes(fragmentMeshes); pr.shadowCastingMode = ShadowCastingMode.On; }
        muzzleLight = MakeLight("muzzle_light", root, new Color(1f, 0.7f, 0.42f), 3f);
        impactLight = MakeLight("impact_light", root, violet, 0.8f);
        bulletDecalMat = bulletDecalMaterial != null ? bulletDecalMaterial : DecalMaterial(bulletDecal);
        shatterDecalMat = shatterDecalMaterial != null ? shatterDecalMaterial : DecalMaterial(shatterDecal);
    }

    void OnDestroy()
    {
        foreach (ParticleSystem p in new[] { flashFront, flashSide }) if (p != null) Destroy(p.gameObject);   // re-parented under the muzzle
        foreach (Transform d in decals) if (d != null) Destroy(d.gameObject);                                // may sit under hit objects
        foreach (Transform s in shardPool) if (s != null) Destroy(s.gameObject);
        if (fxRoot != null) Destroy(fxRoot.gameObject);
        foreach (Object o in owned) if (o != null) Destroy(o);
        owned.Clear(); matCache.Clear();
    }

    /* ---------------- calls from NightstoneBlaster */

    public void MuzzleFlash(Transform muzzle)
    {
        foreach (ParticleSystem p in new[] { flashFront, flashSide }) { p.transform.SetParent(muzzle, false); p.transform.localPosition = new Vector3(0f, 0f, 0.012f); p.transform.localRotation = Quaternion.identity; p.Emit(1); }
        Vector3 o = muzzle.position, f = muzzle.forward;
        Aim(glow, o + f * 0.05f, f); glow.Emit(1);
        Aim(embers, o, f); embers.Emit(18);
        Aim(smoke, o + f * 0.03f, f); smoke.Emit(16);
        for (int i = 0; i < 3; i++) { Aim(wisps, muzzle.TransformPoint(new Vector3(i == 0 ? 0.026f : i == 1 ? -0.026f : 0f, i == 2 ? -0.04f : -0.022f, -0.02f)), Vector3.up); wisps.Emit(2); }
        muzzleLight.transform.position = o + f * 0.16f; muzzleLightT = 0f;
    }

    public void Tracer(Vector3 from, Vector3 to, bool hit, Vector3 hitPoint, Vector3 hitNormal, Collider hitCollider = null)
    {
        TracerLine t = null;
        foreach (TracerLine x in tracers) if (!x.line.enabled) { t = x; break; }
        if (t == null) { t = new TracerLine(); t.line = MakeLine(); tracers.Add(t); }
        t.a = from; t.b = to; t.t = 0f; t.travel = Vector3.Distance(from, to) / tracerSpeed; t.hit = hit; t.hp = hitPoint; t.hn = hitNormal; t.hc = hitCollider; t.line.enabled = true;
    }

    public Transform SpawnShard(Vector3 at, Vector3 velocity)
    {
        Transform s = shardPool.Count > 0 ? shardPool.Pop() : MakeShard();
        s.gameObject.SetActive(true); s.position = at; s.rotation = Quaternion.LookRotation(velocity);
        foreach (TrailRenderer tr in s.GetComponentsInChildren<TrailRenderer>(true)) tr.Clear();
        return s;
    }

    public void ReleaseShard(Transform s) { if (s == null) return; s.gameObject.SetActive(false); shardPool.Push(s); }

    public void ShardImpact(Transform shard, Vector3 point, Vector3 normal, Vector3 velocity, Collider hitCollider = null)
    {
        ReleaseShard(shard);
        Decal(shatterDecalMat, point, normal, shatterDecalSize * Random.Range(0.85f, 1.2f), hitCollider);
        Aim(fragments, point + normal * 0.005f, normal); fragments.Emit(12);
        Aim(sparks, point, normal); Tint(sparks, new Color(0.75f, 0.68f, 1f)); sparks.Emit(8);
        Aim(dust, point + normal * 0.01f, normal); Tint(dust, new Color(0.34f, 0.33f, 0.37f)); dust.Emit(5);
        Aim(glints, point + normal * 0.012f, normal); Tint(glints, new Color(0.45f, 0.35f, 0.9f)); glints.Emit(1);
        impactLight.transform.position = point + normal * 0.05f; impactLightT = 0f;
    }

    void BulletImpact(Vector3 point, Vector3 normal, Collider hitCollider)
    {
        Decal(bulletDecalMat, point, normal, decalSize * Random.Range(0.8f, 1.3f), hitCollider);
        Aim(sparks, point, normal); Tint(sparks, new Color(1f, 0.75f, 0.45f)); sparks.Emit(10);
        Aim(dust, point + normal * 0.01f, normal); Tint(dust, new Color(0.45f, 0.44f, 0.42f)); dust.Emit(3);
        Aim(glints, point + normal * 0.01f, normal); Tint(glints, new Color(1f, 0.7f, 0.4f)); glints.Emit(1);
    }

    /* ---------------- per frame: tracers, lights, decal ageing */

    void Update()
    {
        float dt = Time.deltaTime;
        foreach (TracerLine t in tracers)
        {
            if (!t.line.enabled) continue;
            t.t += dt;
            Vector3 d = (t.b - t.a).normalized; float dist = Vector3.Distance(t.a, t.b), head = Mathf.Min(dist, t.t * tracerSpeed);
            float tail = Mathf.Max(0f, head - tracerLength);
            if (t.t >= t.travel) { tail = Mathf.Min(dist, tail + (t.t - t.travel) * tracerSpeed); if (t.hit && t.t - dt < t.travel) BulletImpact(t.hp, t.hn, t.hc); }
            if (tail >= dist - 0.001f) { t.line.enabled = false; continue; }
            t.line.SetPosition(0, t.a + d * head); t.line.SetPosition(1, t.a + d * tail);
        }
        muzzleLightT += dt; impactLightT += dt;
        muzzleLight.intensity = lightIntensity * Sq(Mathf.Max(0f, 1f - muzzleLightT / 0.06f));
        impactLight.intensity = lightIntensity * 0.3f * Sq(Mathf.Max(0f, 1f - impactLightT / 0.15f));
        for (int i = 0; i < decals.Count; i++)
        {
            Transform d = decals[i];
            if (d == null) continue;                                   // destroyed with the object it sat on; Decal() replaces it
            bool parentGone = decalParents[i] != null && !decalParents[i].gameObject.activeInHierarchy;
            if (d.gameObject.activeSelf && (Time.time - decalBorn[i] > decalLife || parentGone)) Release(i);
        }
    }

    static float Sq(float x) { return x * x; }

    /* ---------------- builders */

    ParticleSystem System(string n, Transform parent, Material mat, bool local)
    {
        GameObject go = new GameObject(n); go.transform.SetParent(parent, false);
        ParticleSystem p = go.AddComponent<ParticleSystem>();
        p.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
        var m = p.main; m.playOnAwake = false; m.loop = false; m.duration = 1f; m.maxParticles = Mathf.Max(m.maxParticles, 64);
        m.simulationSpace = local ? ParticleSystemSimulationSpace.Local : ParticleSystemSimulationSpace.World;
        var e = p.emission; e.enabled = false;               // everything is emitted by hand (Emit)
        var sh = p.shape; sh.enabled = false;
        ParticleSystemRenderer r = go.GetComponent<ParticleSystemRenderer>(); r.sharedMaterial = mat; r.shadowCastingMode = ShadowCastingMode.Off; r.receiveShadows = false;
        return p;
    }

    static void Aim(ParticleSystem p, Vector3 pos, Vector3 dir) { p.transform.position = pos; p.transform.rotation = Quaternion.LookRotation(dir); }
    static void Tint(ParticleSystem p, Color c) { var m = p.main; m.startColor = c; }
    static void Drag(ParticleSystem p, float k) { var l = p.limitVelocityOverLifetime; l.enabled = true; l.drag = k; l.multiplyDragByParticleSize = false; l.multiplyDragByParticleVelocity = false; }
    static void Stretch(ParticleSystem p, float velocityScale) { ParticleSystemRenderer r = p.GetComponent<ParticleSystemRenderer>(); r.renderMode = ParticleSystemRenderMode.Stretch; r.velocityScale = velocityScale; r.lengthScale = 2f; }
    static void MeshMode(ParticleSystem p, Mesh mesh) { ParticleSystemRenderer r = p.GetComponent<ParticleSystemRenderer>(); r.renderMode = ParticleSystemRenderMode.Mesh; r.mesh = mesh; }

    // flipbook cells first .. first+count-1 of a 4 x 4 sheet; overLife plays them across the lifetime, else one random cell
    static void Flipbook(ParticleSystem p, int first, int count, bool overLife = false)
    {
        var t = p.textureSheetAnimation; t.enabled = true; t.numTilesX = 4; t.numTilesY = 4; t.animation = ParticleSystemAnimationType.WholeSheet;
        t.startFrame = overLife ? new ParticleSystem.MinMaxCurve(first / 16f) : new ParticleSystem.MinMaxCurve(first / 16f, (first + count - 0.01f) / 16f);
        t.frameOverTime = overLife ? new ParticleSystem.MinMaxCurve(count / 16f, AnimationCurve.Linear(0f, 0f, 1f, 1f)) : new ParticleSystem.MinMaxCurve(0f);
        t.cycleCount = 1;
    }

    static ParticleSystem.MinMaxGradient Fade(float peak, float rise)
    {
        Gradient g = new Gradient();
        g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                  rise > 0f ? new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(peak, rise), new GradientAlphaKey(0f, 1f) } : new[] { new GradientAlphaKey(peak, 0f), new GradientAlphaKey(0f, 1f) });
        return new ParticleSystem.MinMaxGradient(g);
    }
    static ParticleSystem.MinMaxGradient Ramp(Color a, Color b)
    {
        Gradient g = new Gradient();
        g.SetKeys(new[] { new GradientColorKey(a, 0f), new GradientColorKey(b, 1f) }, new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0f, 1f) });
        return new ParticleSystem.MinMaxGradient(g);
    }

    // one runtime material per texture and blend mode
    Material ParticleMaterial(Texture tex, bool add)
    {
        string key = (tex != null ? tex.GetInstanceID().ToString() : "none") + (add ? "+add" : "+blend");
        Material cached;
        if (matCache.TryGetValue(key, out cached) && cached != null) return cached;
        Material made = MakeParticleMaterial(tex, add); matCache[key] = made; owned.Add(made);
        return made;
    }

    Material MakeParticleMaterial(Texture tex, bool add)
    {
        Shader s = Shader.Find("Universal Render Pipeline/Particles/Unlit");
        bool urp = s != null;
        if (s == null) s = Shader.Find("Particles/Standard Unlit");
        if (s == null) s = Shader.Find(add ? "Legacy Shaders/Particles/Additive" : "Legacy Shaders/Particles/Alpha Blended");
        Material m = new Material(s);
        if (tex != null) { m.mainTexture = tex; if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", tex); }
        if (urp || m.HasProperty("_Surface")) { m.SetFloat("_Surface", 1f); m.SetFloat("_Blend", add ? 2f : 0f); m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT"); }
        if (m.HasProperty("_Mode")) m.SetFloat("_Mode", add ? 4f : 2f);   // Standard Unlit: 4 additive, 2 fade
        if (m.HasProperty("_SrcBlend")) { m.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha); m.SetInt("_DstBlend", add ? (int)BlendMode.One : (int)BlendMode.OneMinusSrcAlpha); }
        if (m.HasProperty("_ZWrite")) m.SetInt("_ZWrite", 0);
        m.renderQueue = (int)RenderQueue.Transparent;
        return m;
    }

    Material DecalMaterial(Texture tex)
    {
        Material m = MakeParticleMaterial(tex, false); owned.Add(m);   // alpha-blended unlit; swap for a URP Decal Projector if you use them
        m.renderQueue = (int)RenderQueue.Transparent - 10;
        return m;
    }

    Material DefaultShardMaterial()
    {
        Shader s = Shader.Find("Universal Render Pipeline/Lit"); if (s == null) s = Shader.Find("Standard");
        Material m = new Material(s);
        m.color = new Color(0.05f, 0.04f, 0.07f, 1f);
        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.95f);
        if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.95f);
        m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", new Color(0.04f, 0.02f, 0.09f, 1f));
        return m;
    }

    Light MakeLight(string n, Transform parent, Color c, float range)
    {
        GameObject go = new GameObject(n); go.transform.SetParent(parent, false);
        Light l = go.AddComponent<Light>(); l.type = LightType.Point; l.color = c; l.range = range; l.intensity = 0f; l.shadows = LightShadows.None;
        return l;
    }

    LineRenderer MakeLine()
    {
        GameObject go = new GameObject("tracer"); go.transform.SetParent(transform, false);
        LineRenderer l = go.AddComponent<LineRenderer>();
        l.useWorldSpace = true; l.positionCount = 2; l.startWidth = tracerWidth; l.endWidth = tracerWidth * 0.4f; l.numCapVertices = 0;
        l.textureMode = LineTextureMode.Stretch; l.alignment = LineAlignment.View; l.shadowCastingMode = ShadowCastingMode.Off;
        l.sharedMaterial = tracerMat; l.startColor = tracerColor; l.endColor = new Color(tracerColor.r, tracerColor.g, tracerColor.b, 0.2f);
        l.enabled = false;
        return l;
    }

    Transform MakeShard()
    {
        GameObject go = new GameObject("shard");
        go.AddComponent<MeshFilter>().sharedMesh = shardMeshes != null && shardMeshes.Length > 0 ? shardMeshes[Random.Range(0, shardMeshes.Length)] : null;
        MeshRenderer mr = go.AddComponent<MeshRenderer>(); mr.sharedMaterial = shardMaterial; mr.shadowCastingMode = ShadowCastingMode.On;
        Trail(go.transform, "trail_dark", 0.045f, 0.016f, new Color(0.06f, 0.05f, 0.08f, 0.42f), trailDarkMat);
        Trail(go.transform, "trail_core", 0.03f, 0.0028f, new Color(violet.r, violet.g, violet.b, 0.5f), glowMat);
        return go.transform;
    }

    void Trail(Transform parent, string n, float time, float width, Color c, Material mat)
    {
        GameObject go = new GameObject(n); go.transform.SetParent(parent, false);
        TrailRenderer t = go.AddComponent<TrailRenderer>();
        t.time = time; t.startWidth = width; t.endWidth = 0f; t.minVertexDistance = 0.02f; t.numCapVertices = 0; t.shadowCastingMode = ShadowCastingMode.Off;
        t.sharedMaterial = mat;
        t.startColor = c; t.endColor = new Color(c.r, c.g, c.b, 0f);
    }

    Transform NewDecal()
    {
        GameObject go = new GameObject("decal"); go.AddComponent<MeshFilter>().sharedMesh = decalQuad;
        MeshRenderer mr = go.AddComponent<MeshRenderer>(); mr.shadowCastingMode = ShadowCastingMode.Off; mr.receiveShadows = false;
        go.transform.SetParent(fxRoot, false);
        return go.transform;
    }

    void Release(int i)
    {
        Transform d = decals[i]; if (d == null) return;
        d.gameObject.SetActive(false); d.SetParent(fxRoot, false); decalParents[i] = null;
    }

    // the decal sticks to a moving (non-static) collider's transform; static geometry keeps it under the fx root
    void Decal(Material mat, Vector3 p, Vector3 n, float size, Collider on)
    {
        int i;
        if (decals.Count < decalPool) { decals.Add(NewDecal()); decalBorn.Add(0f); decalParents.Add(null); i = decals.Count - 1; }
        else { i = decalNext; decalNext = (decalNext + 1) % decals.Count; if (decals[i] == null) decals[i] = NewDecal(); else Release(i); }
        Transform d = decals[i]; decalBorn[i] = Time.time;
        d.GetComponent<MeshRenderer>().sharedMaterial = mat;
        Transform parent = on != null && !on.gameObject.isStatic ? on.transform : fxRoot;
        d.SetParent(parent, true); decalParents[i] = parent == fxRoot ? null : parent;
        d.gameObject.SetActive(true);
        d.position = p + n * 0.002f; d.rotation = Quaternion.LookRotation(-n) * Quaternion.Euler(0f, 0f, Random.Range(0f, 360f));
        Vector3 ps = parent.lossyScale;   // keep the world size under a scaled parent
        d.localScale = new Vector3(size / Mathf.Max(1e-4f, Mathf.Abs(ps.x)), size / Mathf.Max(1e-4f, Mathf.Abs(ps.y)), size / Mathf.Max(1e-4f, Mathf.Abs(ps.z)));
    }

    // unit quad facing +Z (front flash) or two crossed quads along +Z from 0 to 1 (side plume); UVs span 0..1 (the
    // texture sheet module picks the cell)
    static Mesh Quad(bool cross)
    {
        Mesh m = new Mesh();
        if (!cross)
        {
            m.vertices = new[] { new Vector3(-0.5f, -0.5f, 0f), new Vector3(0.5f, -0.5f, 0f), new Vector3(0.5f, 0.5f, 0f), new Vector3(-0.5f, 0.5f, 0f) };
            m.uv = new[] { new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(1f, 1f), new Vector2(0f, 1f) };
            m.triangles = new[] { 0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3 };
        }
        else
        {
            m.vertices = new[] { new Vector3(-0.5f, 0f, 0f), new Vector3(0.5f, 0f, 0f), new Vector3(0.5f, 0f, 1f), new Vector3(-0.5f, 0f, 1f),
                                 new Vector3(0f, -0.5f, 0f), new Vector3(0f, 0.5f, 0f), new Vector3(0f, 0.5f, 1f), new Vector3(0f, -0.5f, 1f) };
            m.uv = new[] { new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(1f, 1f), new Vector2(0f, 1f) };
            m.triangles = new[] { 0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 4, 5, 6, 4, 6, 7 };
        }
        m.RecalculateNormals(); m.RecalculateBounds();
        return m;
    }

    static Mesh DecalQuad()
    {
        Mesh m = new Mesh();
        m.vertices = new[] { new Vector3(-0.5f, -0.5f, 0f), new Vector3(0.5f, -0.5f, 0f), new Vector3(0.5f, 0.5f, 0f), new Vector3(-0.5f, 0.5f, 0f) };
        m.uv = new[] { new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(1f, 1f), new Vector2(0f, 1f) };
        m.triangles = new[] { 0, 2, 1, 0, 3, 2 };   // front face toward -Z: the quad looks back along the surface normal
        m.RecalculateNormals(); m.RecalculateBounds();
        return m;
    }
}
