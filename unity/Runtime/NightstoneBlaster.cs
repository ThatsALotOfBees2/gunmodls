// The Nightstone Blaster: a heavy two-handed scattergun. A thin forged-iron spine (grip, guard, skeletal stock) carries a
// big faceted black-violet stone head: an iron chamber cage with a hot core, a six-shard drum on the left flank, three
// stone segments with glowing seams, a crest, iron bands, black crystal overgrowth and a five-petal muzzle crown.
// Put it on the root of the nightstone-blaster prefab (from unity/nightstone-blaster.glb; import with Animation: Legacy,
// or set `animator` and give its controller states named like the clips). Add NightstoneBlasterFx next to it for effects.
//   Fire()     after shotDelay (the trigger break in the fire clip): bulletCount hitscan rays in a cone of bulletSpread
//              degrees (damage with distance falloff, onHit per hit) and shardCount black crystal shards as ballistic
//              projectiles (speed, spread, gravity; swept raycast each step; on impact onShardHit, damage, shatter fx).
//              One drum shard per shot; empty drum -> Reload() (autoReload) or onEmpty. Returns false while cooling down.
//   Reload()   the reload clip (pump racks, drum spins, the six shards regrow); the drum is full at reloadTime.
//   Inspect()  the inspect clip.
// Damage goes to INightstoneDamageable on the hit collider (or its parents); events carry everything for game logic.
// Clips (30 fps): idle 2.4 s loop, fire 0.7 (shot at 0.04, drum indexes -60 deg at 0.16-0.36), reload 1.6, inspect 2.8.
// Locators: muzzle (bullet + shard origin, +Z forward), core_locator, grip_attach, offhand_attach (on the pump).
// Drum shards: drum_shard_0..5; slot 0 feeds the bore. At rest the spent ones are i >= 6 - spent; from the shot until the
// fire clip ends shard 0 and i >= 7 - spent are hidden. The fire clip turns the drum -60 deg and has a step key back to
// 0 deg on its last frame; inspect ends at -360 deg; idle keys the drum, head, pump, trigger and petals at rest, and
// Play("idle") also resets the drum, so the two sets line up under Legacy Animation (which never resets transforms).
// The reload clip drives the shard scales itself.
// Self-hits: rays and shards skip every collider under ownerRoot (default: aimFrom.root, else this transform's root).
// Not run in Unity here: compile-checked with mcs against API stubs only.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

public interface INightstoneDamageable { void TakeDamage(float amount, Vector3 point, Vector3 direction, bool fromShard); }

public class NightstoneBlaster : MonoBehaviour
{
    [Serializable] public class HitEvent : UnityEvent<RaycastHit> { }
    [Serializable] public class ShotEvent : UnityEvent<Vector3, Vector3> { }               // origin, aim direction
    [Serializable] public class ShardHitEvent : UnityEvent<Vector3, Vector3, Collider> { }  // point, surface normal, collider

    [Header("Aim")]
    [Tooltip("Aim ray origin and direction, usually the player camera; empty = the muzzle locator")] public Transform aimFrom;
    public LayerMask hitMask = ~0;
    [Tooltip("Colliders under this transform are never hit (the player capsule, the gun). Empty = aimFrom.root, else transform.root")] public Transform ownerRoot;
    public QueryTriggerInteraction triggers = QueryTriggerInteraction.Ignore;

    [Header("Bullets (hitscan)")]
    public int bulletCount = 7;
    [Tooltip("Half-angle of the bullet cone, degrees")] public float bulletSpread = 3.5f;
    public float bulletDamage = 9f, bulletRange = 80f;
    [Tooltip("Full damage up to falloffStart metres, minDamageScale at falloffEnd and beyond")] public float falloffStart = 8f, falloffEnd = 30f;
    [Range(0f, 1f)] public float minDamageScale = 0.3f;

    [Header("Black crystal shards (ballistic)")]
    public int shardCount = 3;
    public float shardSpeed = 55f;
    [Tooltip("Half-angle of the shard cone, degrees (wider than the bullets)")] public float shardSpread = 7f;
    [Tooltip("Downward acceleration, m/s^2")] public float shardGravity = 9.81f;
    public float shardDamage = 22f, shardLifetime = 3f;
    [Tooltip("Shards leave the large upper bore: this offset from the muzzle locator, in its local space")] public Vector3 shardBoreOffset = new Vector3(0f, 0.012f, -0.02f);

    [Header("Drum and timing")]
    [Range(1, 6)] public int drumSize = 6;
    public float cooldown = 0.55f;
    [Tooltip("Seconds from Fire() to the shot (the trigger break in the fire clip)")] public float shotDelay = 0.04f;
    public float reloadTime = 1.6f;
    public bool autoReload = true;

    [Header("Core glow")]
    public float coreBreath = 0.15f, coreBreathSpeed = 2.6f, coreFlash = 0.6f;

    [Header("Animation")]
    [Tooltip("Optional: drive an Animator with states idle / fire / reload / inspect instead of the legacy Animation")] public Animator animator;

    [Header("Effects (optional)")]
    public NightstoneBlasterFx fx;

    [Header("Events")]
    public ShotEvent onFire = new ShotEvent();
    public HitEvent onHit = new HitEvent();
    public ShardHitEvent onShardHit = new ShardHitEvent();
    public UnityEvent onReload = new UnityEvent(), onReloaded = new UnityEvent(), onEmpty = new UnityEvent();

    public int Ammo { get { return ammo; } }
    public bool IsReloading { get { return reloading; } }
    public bool CanFire { get { return !reloading && Time.time >= nextShot && ammo > 0; } }

    class Shard { public Vector3 pos, vel; public float age; public Transform visual; }

    Animation anim;
    Transform muzzle;
    readonly Transform[] drumShards = new Transform[6];
    readonly List<Shard> shards = new List<Shard>();
    readonly Dictionary<Material, int> glowIndex = new Dictionary<Material, int>();
    readonly RaycastHit[] hitBuf = new RaycastHit[16];
    Transform drum, owner;
    readonly List<Material> glowMats = new List<Material>();
    readonly List<Color> glowBase = new List<Color>();
    readonly List<string> glowProp = new List<string>();
    int ammo;
    bool reloading, pendingShot;
    float nextShot, shotAt, reloadDone, flashT = 99f, clipStart;
    string clip = "idle";

    void Awake()
    {
        drumSize = Mathf.Clamp(drumSize, 1, 6);
        ammo = drumSize;
        anim = GetComponent<Animation>();
        if (anim != null)
        {
            anim.playAutomatically = false;
            foreach (AnimationState s in anim) s.wrapMode = s.name == "idle" ? WrapMode.Loop : WrapMode.ClampForever;
        }
        muzzle = Find(transform, "muzzle");
        for (int i = 0; i < 6; i++) drumShards[i] = Find(transform, "drum_shard_" + i);
        drum = Find(transform, "shard_drum");
        owner = ownerRoot != null ? ownerRoot : (aimFrom != null ? aimFrom.root : transform.root);
        if (muzzle == null) Debug.LogWarning("NightstoneBlaster: no 'muzzle' locator under " + name, this);
        // per-instance copies of the glowing materials (core, core shell, seams, veins), so the pulse never touches the
        // asset; one copy per source material, shared by every renderer that uses it
        foreach (Renderer r in GetComponentsInChildren<Renderer>(true))
        {
            Material[] mats = r.sharedMaterials; bool changed = false;
            for (int i = 0; i < mats.Length; i++)
            {
                if (mats[i] == null) continue;
                string n = mats[i].name;
                if (!(n.StartsWith("core_hot") || n.StartsWith("core_crystal") || n.StartsWith("seam_glow") || n.StartsWith("nightstone_veined"))) continue;
                int gi;
                if (!glowIndex.TryGetValue(mats[i], out gi))
                {
                    Material m = new Material(mats[i]);
                    string prop = m.HasProperty("emissiveFactor") ? "emissiveFactor" : "_EmissionColor";   // glTFast shaders / URP Lit
                    m.EnableKeyword("_EMISSION");
                    gi = glowMats.Count; glowIndex[mats[i]] = gi;
                    glowMats.Add(m); glowBase.Add(m.GetColor(prop)); glowProp.Add(prop);
                }
                mats[i] = glowMats[gi]; changed = true;
            }
            if (changed) r.sharedMaterials = mats;
        }
        if (fx == null) fx = GetComponent<NightstoneBlasterFx>();
    }

    void Start() { Play("idle"); }

    void OnDestroy() { foreach (Material m in glowMats) if (m != null) Destroy(m); }

    // clip length from the clip itself (Legacy Animation or the Animator's controller); defaults if neither has it
    float ClipLength(string n)
    {
        if (anim != null && anim[n] != null) return anim[n].length;
        if (animator != null && animator.runtimeAnimatorController != null)
            foreach (AnimationClip c in animator.runtimeAnimatorController.animationClips) if (c != null && c.name == n) return c.length;
        return n == "fire" ? 0.7f : n == "reload" ? 1.6f : n == "inspect" ? 2.8f : 2.4f;
    }

    // nearest hit along a ray that is not one of the owner's own colliders
    bool CastOthers(Vector3 o, Vector3 dir, float dist, out RaycastHit best)
    {
        best = new RaycastHit();
        int n = Physics.RaycastNonAlloc(o, dir, hitBuf, dist, hitMask, triggers);
        float bd = float.MaxValue; bool got = false;
        for (int i = 0; i < n; i++)
        {
            Collider c = hitBuf[i].collider;
            if (c == null || (owner != null && c.transform.IsChildOf(owner))) continue;
            if (hitBuf[i].distance < bd) { bd = hitBuf[i].distance; best = hitBuf[i]; got = true; }
        }
        return got;
    }

    static Transform Find(Transform t, string n)
    {
        if (t.name == n) return t;
        for (int i = 0; i < t.childCount; i++) { Transform f = Find(t.GetChild(i), n); if (f != null) return f; }
        return null;
    }

    void Play(string n)
    {
        clip = n; clipStart = Time.time;
        if (n == "idle" && drum != null) drum.localRotation = Quaternion.identity;
        if (animator != null) { animator.CrossFade(n, 0.04f, 0, 0f); return; }
        if (anim == null || anim[n] == null) return;
        anim.Stop(); anim.Play(n);
    }

    public bool Fire()
    {
        if (reloading || pendingShot || Time.time < nextShot) return false;
        if (ammo <= 0) { onEmpty.Invoke(); if (autoReload) Reload(); return false; }
        nextShot = Time.time + cooldown;
        pendingShot = true; shotAt = Time.time + shotDelay;
        Play("fire");
        return true;
    }

    public bool Reload()
    {
        if (reloading || pendingShot || ammo >= drumSize) return false;
        reloading = true; reloadDone = Time.time + reloadTime;
        Play("reload"); onReload.Invoke();
        return true;
    }

    public void Inspect() { if (!reloading && !pendingShot) Play("inspect"); }

    void Shoot()
    {
        Transform from = aimFrom != null ? aimFrom : (muzzle != null ? muzzle : transform);
        Vector3 aim = from.forward;
        Vector3 origin = muzzle != null ? muzzle.position : from.position;
        ammo--; flashT = 0f;
        onFire.Invoke(origin, aim);
        if (fx != null) fx.MuzzleFlash(muzzle != null ? muzzle : transform);
        // bullets: hitscan from the aim origin (so they land where the crosshair points), tracers drawn from the muzzle
        for (int i = 0; i < bulletCount; i++)
        {
            Vector3 dir = Cone(aim, bulletSpread);
            RaycastHit hit;
            bool got = CastOthers(from.position, dir, bulletRange, out hit);
            Vector3 end = got ? hit.point : from.position + dir * bulletRange;
            if (fx != null) fx.Tracer(origin, end, got, hit.point, hit.normal, got ? hit.collider : null);
            if (!got) continue;
            float k = Mathf.Lerp(1f, minDamageScale, Mathf.InverseLerp(falloffStart, falloffEnd, hit.distance));
            Damage(hit.collider, bulletDamage * k, hit.point, dir, false);
            onHit.Invoke(hit);
        }
        // shards: real projectiles, stepped in Update
        Vector3 so = muzzle != null ? muzzle.TransformPoint(shardBoreOffset) : origin;
        for (int i = 0; i < shardCount; i++)
        {
            Shard s = new Shard();
            s.pos = so; s.vel = Cone(aim, shardSpread) * shardSpeed * UnityEngine.Random.Range(0.92f, 1.08f); s.age = 0f;
            s.visual = fx != null ? fx.SpawnShard(so, s.vel) : null;
            shards.Add(s);
        }
    }

    // a direction inside a cone of half-angle deg round dir, uniform over the disc
    static Vector3 Cone(Vector3 dir, float deg)
    {
        Vector3 x = Vector3.Cross(dir, Mathf.Abs(dir.y) < 0.9f ? Vector3.up : Vector3.right).normalized, y = Vector3.Cross(x, dir);
        float a = UnityEngine.Random.value * Mathf.PI * 2f, r = Mathf.Sqrt(UnityEngine.Random.value) * Mathf.Tan(deg * Mathf.Deg2Rad);
        return (dir + x * (Mathf.Cos(a) * r) + y * (Mathf.Sin(a) * r)).normalized;
    }

    static void Damage(Collider c, float amount, Vector3 point, Vector3 dir, bool shard)
    {
        if (c == null) return;
        INightstoneDamageable d = c.GetComponentInParent<INightstoneDamageable>();
        if (d != null) d.TakeDamage(amount, point, dir, shard);
    }

    void Update()
    {
        if (pendingShot && Time.time >= shotAt) { pendingShot = false; Shoot(); }
        if (reloading && Time.time >= reloadDone) { reloading = false; ammo = drumSize; onReloaded.Invoke(); }
        float len = clip == "idle" ? 0f : clip == "reload" ? Mathf.Max(reloadTime, ClipLength("reload")) : ClipLength(clip);
        if (len > 0f && Time.time - clipStart >= len && !reloading) Play("idle");
        StepShards(Time.deltaTime);
        // core glow: breathes at rest, flashes on the shot
        flashT += Time.deltaTime;
        float breathe = 0.5f + 0.5f * Mathf.Sin(Time.time * coreBreathSpeed), flash = flashT < 0.25f ? Mathf.Sin(Mathf.PI * flashT / 0.25f) : 0f;
        float k = 1f - coreBreath + coreBreath * breathe + coreFlash * flash * flash;
        for (int i = 0; i < glowMats.Count; i++) glowMats[i].SetColor(glowProp[i], glowBase[i] * k);
    }

    void StepShards(float dt)
    {
        for (int i = shards.Count - 1; i >= 0; i--)
        {
            Shard s = shards[i];
            s.age += dt;
            Vector3 step = s.vel * dt; s.vel += Vector3.down * shardGravity * dt;
            RaycastHit hit;
            if (CastOthers(s.pos, step.normalized, step.magnitude, out hit))
            {
                Damage(hit.collider, shardDamage, hit.point, s.vel.normalized, true);
                onShardHit.Invoke(hit.point, hit.normal, hit.collider);
                if (fx != null) fx.ShardImpact(s.visual, hit.point, hit.normal, s.vel, hit.collider);
                shards.RemoveAt(i); continue;
            }
            s.pos += step;
            if (s.visual != null) { s.visual.position = s.pos; s.visual.rotation = Quaternion.LookRotation(s.vel); }
            if (s.age > shardLifetime) { if (fx != null) fx.ReleaseShard(s.visual); shards.RemoveAt(i); }
        }
    }

    // after the animation has posed the drum: hide spent shards (see the header for the slot rule)
    void LateUpdate()
    {
        if (reloading || clip == "reload") return;
        int spent = 6 - ammo;   // a smaller drum (drumSize < 6) shows its missing slots as spent
        bool afterShot = clip == "fire" && !pendingShot;
        for (int i = 0; i < 6; i++)
        {
            if (drumShards[i] == null) continue;
            bool hidden = afterShot ? (i == 0 || i >= 7 - spent) : i >= 6 - spent;
            drumShards[i].localScale = hidden ? Vector3.one * 0.0001f : Vector3.one;
        }
    }
}
