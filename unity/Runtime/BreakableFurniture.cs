// Makes one Haneul furniture piece breakable. Put it on the root of a piece (a .glb from
// props/haneul-furniture/unity/, imported with glTFast; or the prefab Tools > Gunmodls builds from it) and give it
// props/haneul-furniture/parts.json as a TextAsset (Tools > Gunmodls > Set Up Breakable Furniture does both).
// Unity 2021 LTS to Unity 6, no extra packages. The component may sit on the prefab root or on the <id> node under
// it: it looks for the node whose children are the part_* nodes.
//
// On Awake it finds, by name (the naming contract in INTEGRATION.md):
//   part_<name>          a part; its health, mass, break type and support links come from parts.json
//   col_<name>[_i]       box proxies (a BoxCollider; the prefab builder may already have made it on col_*_COL)
//   col_<name>..._hull   convex proxies (a convex MeshCollider from the _HULL mesh, or from the node's own mesh)
//   chunks_<name>        the part's pre-cut chunks, stored at scale 0.0001: kept inactive, scale set back to 1
//   debris               small loose bits (debris_<i>), same
// The intact piece is static: no Rigidbody, its colliders are the proxies.
//
//   ApplyDamage(part name | hit collider, amount, point, force)   damage one part (force in N s, world space)
//   ApplyExplosion(centre, radius, damage, force)                    damage falls off to 0 at radius (distance to
//                                                                    each part's collider bounds); force in N s for a
//                                                                    part of 1 kg or more, less for lighter parts
//   StopsBullet(collider)                                            true for parts with stops_bullets in parts.json
//                                                                    (render rack, vault, planter basin, bench plinths);
//                                                                    false for loose chunks and debris
//   Owner(collider)                                                  the piece a collider belongs to, also after the part
//                                                                    or chunk has left the piece (route hits with this)
// At 0 health: 'shatter' parts hide and their chunks fly apart as Rigidbodies (with the part's debris); 'detach'
// parts get a Rigidbody and leave the piece (they can still be shot, and a loose shatter part still shatters);
// 'fixed' parts ignore damage. To put a piece back, destroy it and instantiate the prefab again. After every break, a
// part whose attach list has fewer than `need` parts still in place comes loose (a `collapse` part, the soil in a
// planter, shatters instead). Torn paper keeps a border strip on the frame (parts.json `fixed_chunks`): it stays with
// the part it hangs from. A part that only detaches lets out its debris (foam tufts) the first time it is shot loose.
// A `breach_only` part (the office safe door) ignores ApplyDamage (bullets, melee, landings): only ApplyExplosion
// wears it down (one breach charge, 500 within 1 m, blows the safe door off; a frag does 300 at the centre). A
// `liquid` part (the aquarium water) drains instead of tumbling: its chunks and debris get no colliders, fall for
// liquidLifetime seconds and shrink away over liquidFade; BreakInfo.liquid is set so a game can play a splash. The
// water is never broken by hits (its health is 9999): it goes when a pane it is held by breaks (`collapse`).
// Freshly freed bodies do not collide with colliders of the same piece they start inside (sibling chunks, a drawer in
// its carcass) until they have moved apart. Loose chunks and debris fade out after debrisLifetime; at most
// maxLooseBodies stay alive per piece.
// Exterior batch G adds two optional hints. A part with `spin` { axis, rps } (turbine vent heads about +Y, the split-AC
// fans about +Z) turns rps revolutions per second about that axis through its node while it is still in place
// (animateSpin, spinScale; it stops when the part breaks or comes loose). A part with `fx` "steam" (the grate vent's
// steam cards) is an FX card: its colliders are switched off, it ignores damage, and while animateFx is on it breathes
// (slow rise/stretch and sway). Fading its material is left to the game (the cards use their own blended material).
// glTFast negates X on import (glTF +X is Unity -X). The spin axis is the one place glTF coordinates are read: it is
// mirrored to (-x, y, z), and because the mirror also flips handedness the signed rps is used as is with Rotate.
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

public class BreakableFurniture : MonoBehaviour
{
    public enum BreakType { Shatter, Detach, Fixed }
    public enum PartState { Intact, Loose, Shattered }

    [Header("Data")]
    public TextAsset partsJson;              // props/haneul-furniture/parts.json
    public string pieceId = "";              // empty: the GameObject's name without " (1)" or "(Clone)"
    [Header("Breaking")]
    public float impulseScale = 1f;          // multiplies every force handed in
    public float chunkScatter = 1.2f;        // m/s pushed outward from the hit on every chunk
    public float debrisLifetime = 12f;       // seconds before loose chunks and debris start to fade
    public float fadeTime = 1.5f;            // they shrink away over this long, then are destroyed
    public int maxLooseBodies = 60;          // per piece; the oldest fade early past this
    public bool darkenLightsOnBreak = true;  // broken screens, LEDs and lit paper go dark
    public bool landingDamage = true;        // a loose glass, ceramic or electronic part that lands hard takes damage
    public float liquidLifetime = 0.35f;     // liquid chunks (aquarium water) fall this long, without colliders ...
    public float liquidFade = 0.4f;          // ... then shrink away over this long
    [Header("Exterior hints (batch G)")]
    public bool animateSpin = true;          // turn parts with a spin hint (turbine heads, AC fans)
    public float spinScale = 1f;             // multiplies every spin rate (0.2 for a calm night, 1.5 for a gale)
    public bool animateFx = true;            // breathe the steam cards (fx "steam")
    [Header("Layers (-1 leaves them as imported)")]
    public int softLayer = -1;               // parts that never stop bullets (soft cover, as in Siege)
    public int hardLayer = -1;               // parts with stops_bullets
    public int looseLayer = -1;              // chunks, debris and loose parts
    [Header("Sound (optional, by material class)")]
    public List<ClassSound> sounds = new List<ClassSound>();
    [Header("Events")]
    public PartDamagedEvent onPartDamaged = new PartDamagedEvent();   // part, material class, health left
    public PartBrokenEvent onPartBroken = new PartBrokenEvent();      // part, material class, point (shattered or came loose)
    public static event Action<BreakableFurniture, BreakInfo> AnyPartBroken;   // for a global sound / effects manager

    [Serializable] public class ClassSound { public string materialClass = "wood"; public AudioClip hit, breakClip; [Range(0, 1)] public float volume = 0.8f; }
    [Serializable] public class PartDamagedEvent : UnityEvent<string, string, float> { }
    [Serializable] public class PartBrokenEvent : UnityEvent<string, string, Vector3> { }
    public struct BreakInfo { public string part, materialClass; public bool shattered, liquid; public Vector3 point; }

    public class Part
    {
        public string name, materialClass;
        public float mass = 1f, health = 100f, maxHealth = 100f;
        public BreakType breakType = BreakType.Detach;
        public string[] attach = { "ground" };
        public int need;
        public bool stopsBullets;
        public string[] debris = new string[0];
        public int[] fixedChunks = new int[0];   // 1-based chunk numbers that stay on the part this one hangs from
        public bool collapse;                    // shatters (instead of coming loose) when its support goes
        public bool liquid;                      // its chunks drain away (no colliders, short fade)
        public bool breachOnly;                  // only explosions damage it
        public Vector3 spinAxis;                 // Unity space, normalised; zero when the part does not spin
        public float spinRps;                    // signed rev/s (see the header)
        public string fx;                        // "steam": an FX card (no colliders, no damage)
        public Vector3 restScale; public Quaternion restRot;
        public bool debrisOut;                   // its debris has been let out
        public Transform node, chunks;
        public PartState state = PartState.Intact;
        public Rigidbody body;
        public readonly List<Collider> colliders = new List<Collider>();
    }

    // parts.json, as JsonUtility reads it (the classes and materials tables are not needed here)
    [Serializable] class PackJson { public PieceJson[] pieces; }
    [Serializable] class PieceJson { public string id, cover; public PartJson[] parts; }
    [Serializable] class PartJson { public string part, material; public float mass, health; public string @break; public string[] attach; public int need; public bool stops_bullets; public int chunks; public string[] debris; public int[] fixed_chunks; public bool collapse, liquid, breach_only; public SpinJson spin; public string fx; }
    [Serializable] class SpinJson { public float[] axis; public float rps; }

    public readonly Dictionary<string, Part> parts = new Dictionary<string, Part>();
    public string Cover { get; private set; }
    readonly Dictionary<Collider, Part> byCollider = new Dictionary<Collider, Part>();
    // every collider of every piece -> its piece, kept while the piece lives (loose parts leave the hierarchy)
    static readonly Dictionary<Collider, BreakableFurniture> owners = new Dictionary<Collider, BreakableFurniture>();
    readonly List<Collider> owned = new List<Collider>();
    Transform host;
    readonly Dictionary<string, Transform> debrisNodes = new Dictionary<string, Transform>();
    readonly List<Loose> loose = new List<Loose>();
    bool ready;

    class Loose { public Transform t; public Rigidbody rb; public float born; public Vector3 scale; public Part part; public float lastLand; public float life = -1f, fade = -1f; }

    // class defaults when parts.json has no entry (DESIGN numbers): density kg/m3 is not needed, base health is
    static readonly Dictionary<string, float> ClassHealth = new Dictionary<string, float> {
        { "glass", 20 }, { "paper", 15 }, { "ceramic", 25 }, { "electronics", 40 }, { "plant", 30 }, { "plastic", 60 },
        { "fabric", 80 }, { "wood", 120 }, { "metal", 250 }, { "stone", 400 } };

    void Awake() { Init(); }

    public void Init()
    {
        if (ready) return;
        ready = true;
        BuildColliders(this.transform);
        host = FindHost();
        var data = FindPiece();
        Cover = data != null ? data.cover : "soft";
        foreach (Transform c in host)
        {
            if (c.name.StartsWith("part_")) AddPart(c, data);
            else if (c.name == "debris") { foreach (Transform d in c) debrisNodes[d.name] = d; Hide(c); }
        }
        foreach (Transform c in host) if (c.name.StartsWith("chunks_") && parts.TryGetValue(c.name.Substring(7), out var p)) { p.chunks = c; Hide(c); }
        // a part listed as shatter in the data but without chunks in the file detaches instead
        foreach (var p in parts.Values) if (p.breakType == BreakType.Shatter && p.chunks == null) p.breakType = BreakType.Detach;
    }

    // the node that holds the part_* nodes: this one, or (glTFast puts the file's root node under the prefab root)
    // the first one below it
    Transform FindHost()
    {
        if (HasPartChild(transform)) return transform;
        foreach (var t in GetComponentsInChildren<Transform>(true)) if (HasPartChild(t)) return t;
        return transform;
    }

    static bool HasPartChild(Transform t)
    {
        foreach (Transform c in t) if (c.name.StartsWith("part_")) return true;
        return false;
    }

    PieceJson FindPiece()
    {
        if (partsJson == null) return null;
        var id = pieceId;
        if (string.IsNullOrEmpty(id)) { id = name.Replace("(Clone)", ""); var k = id.IndexOf(" ("); if (k > 0) id = id.Substring(0, k); id = id.Trim(); }
        var pack = JsonUtility.FromJson<PackJson>(partsJson.text);
        if (pack != null && pack.pieces != null) foreach (var p in pack.pieces) if (p.id == id) return p;
        Debug.LogWarning("BreakableFurniture: no piece '" + id + "' in " + partsJson.name + "; using defaults", this);
        return null;
    }

    void AddPart(Transform node, PieceJson data)
    {
        var p = new Part { name = node.name.Substring(5), node = node };
        PartJson j = null;
        if (data != null && data.parts != null) foreach (var x in data.parts) if (x.part == p.name) j = x;
        if (j != null)
        {
            p.materialClass = j.material; p.mass = Mathf.Max(0.05f, j.mass); p.maxHealth = p.health = j.health;
            p.breakType = j.@break == "shatter" ? BreakType.Shatter : j.@break == "fixed" ? BreakType.Fixed : BreakType.Detach;
            p.attach = j.attach != null && j.attach.Length > 0 ? j.attach : new[] { "ground" };
            p.need = j.need; p.stopsBullets = j.stops_bullets; p.debris = j.debris ?? new string[0];
            p.fixedChunks = j.fixed_chunks ?? new int[0]; p.collapse = j.collapse; p.liquid = j.liquid; p.breachOnly = j.breach_only;
            if (j.spin != null && j.spin.axis != null && j.spin.axis.Length == 3 && j.spin.rps != 0f)
            { p.spinAxis = new Vector3(-j.spin.axis[0], j.spin.axis[1], j.spin.axis[2]).normalized; p.spinRps = j.spin.rps; }
            p.fx = string.IsNullOrEmpty(j.fx) ? null : j.fx;
        }
        else
        {
            // no data: guess from the file (chunks mean shatter; the class from the first material's name)
            p.materialClass = GuessClass(node);
            p.breakType = host.Find("chunks_" + p.name) != null ? BreakType.Shatter : BreakType.Detach;
            p.maxHealth = p.health = ClassHealth.TryGetValue(p.materialClass, out var h) ? h : 100f;
        }
        p.restScale = node.localScale; p.restRot = node.localRotation;
        if (p.fx != null) { p.breakType = BreakType.Fixed; foreach (var c in node.GetComponentsInChildren<Collider>(true)) c.enabled = false; }
        foreach (var c in node.GetComponentsInChildren<Collider>(true))
        {
            if (p.fx != null) continue;   // FX cards: no hits
            p.colliders.Add(c); byCollider[c] = p; Own(c);
            var layer = p.stopsBullets ? hardLayer : softLayer;
            if (layer >= 0) c.gameObject.layer = layer;
        }
        parts[p.name] = p;
    }

    static string GuessClass(Transform node)
    {
        var r = node.GetComponentInChildren<Renderer>(true);
        var m = r != null ? r.sharedMaterial : null;
        var n = m != null ? m.name : "";
        if (n.StartsWith("wood")) return "wood";
        if (n.StartsWith("glass")) return "glass";
        if (n.StartsWith("fabric") || n.StartsWith("leather")) return "fabric";
        if (n.StartsWith("paper")) return "paper";
        if (n.StartsWith("celadon") || n.StartsWith("porcelain")) return "ceramic";
        if (n.StartsWith("stone")) return "stone";
        if (n.StartsWith("brass") || n.StartsWith("alloy") || n.StartsWith("graphite") || n.StartsWith("steel")) return "metal";
        if (n.StartsWith("screen") || n.StartsWith("led") || n.StartsWith("electronics")) return "electronics";
        if (n.StartsWith("foliage") || n.StartsWith("bark") || n.StartsWith("soil")) return "plant";
        return "plastic";
    }

    // Colliders from the proxies. Safe to call more than once (the editor helper bakes them into the prefab).
    public static void BuildColliders(Transform root)
    {
        foreach (var t in root.GetComponentsInChildren<Transform>(true))
        {
            var n = t.name;
            var hull = n.EndsWith("_HULL") || (n.StartsWith("col_") && n.EndsWith("_hull"));
            var box = n.EndsWith("_COL") || (n.StartsWith("col_") && !n.EndsWith("_hull"));
            if (!hull && !box) continue;
            var mf = t.GetComponent<MeshFilter>();
            if (mf == null || mf.sharedMesh == null) continue;   // a proxy group node (its mesh is on a child)
            if (t.GetComponent<Collider>() == null)
            {
                if (hull) { var mc = t.gameObject.AddComponent<MeshCollider>(); mc.sharedMesh = mf.sharedMesh; mc.convex = true; }
                else { var b = t.gameObject.AddComponent<BoxCollider>(); b.center = mf.sharedMesh.bounds.center; b.size = mf.sharedMesh.bounds.size; }
            }
            var r = t.GetComponent<MeshRenderer>();
            if (r != null) DestroyNow(r);
            DestroyNow(mf);
        }
    }

    static void DestroyNow(UnityEngine.Object o) { if (Application.isPlaying) Destroy(o); else DestroyImmediate(o); }

    static void Hide(Transform group)
    {
        group.gameObject.SetActive(false);
        group.localScale = Vector3.one;   // stored at 0.0001 in the file; full size once it is swapped in
    }

    /* ------------------------------------------------------------------ damage */
    public Part GetPart(string part) { Init(); return part != null && parts.TryGetValue(part, out var p) ? p : null; }
    public Part FindPart(Collider c) { Init(); return c != null && byCollider.TryGetValue(c, out var p) ? p : null; }

    void Own(Collider c) { if (c == null) return; owners[c] = this; owned.Add(c); }

    // the piece a collider belongs to: a part (in place or loose), a chunk or a debris bit; null when it is not furniture
    public static BreakableFurniture Owner(Collider c)
    {
        if (c == null) return null;
        if (owners.TryGetValue(c, out var f) && f != null) return f;
        var d = c.GetComponentInParent<FurnitureDebris>();
        if (d != null) return d.owner;
        return c.GetComponentInParent<BreakableFurniture>();
    }

    // true when a bullet should stop at this collider (hard-cover part); soft parts take the damage and let it through,
    // and loose chunks and debris never stop one
    public static bool StopsBullet(Collider c)
    {
        if (c == null) return true;
        if (c.GetComponentInParent<FurnitureDebris>() != null) return false;
        var f = Owner(c);
        if (f == null) return true;   // not furniture: whatever the game decides (true = solid)
        var p = f.FindPart(c);
        return p != null && p.stopsBullets && p.state != PartState.Shattered;
    }

    public bool ApplyDamage(Collider hit, float amount, Vector3 point, Vector3 force)
    {
        var p = FindPart(hit);
        return p != null && Damage(p, amount, point, force);
    }

    public bool ApplyDamage(string part, float amount, Vector3 point, Vector3 force)
    {
        var p = GetPart(part);
        return p != null && Damage(p, amount, point, force);
    }

    // returns true when the part broke (shattered or came loose) from this hit
    bool Damage(Part p, float amount, Vector3 point, Vector3 force, bool explosive = false)
    {
        if (p.state == PartState.Shattered) return false;
        force *= impulseScale;
        if (p.breakType == BreakType.Fixed) { PlayHit(p, point); return false; }
        // breach-only parts (the safe door) shrug off bullets and melee while in place: only blasts count
        if (p.breachOnly && !explosive && p.state == PartState.Intact) { PlayHit(p, point); return false; }
        p.health = Mathf.Max(0f, p.health - amount);
        PlayHit(p, point);
        onPartDamaged.Invoke(p.name, p.materialClass, p.health);
        var broke = false;
        if (p.state == PartState.Loose)
        {
            if (p.health <= 0f && p.breakType == BreakType.Shatter) { Shatter(p, point, force); broke = true; }
            else if (p.body != null) p.body.AddForceAtPosition(force, point, ForceMode.Impulse);
        }
        else if (p.health <= 0f)
        {
            if (p.breakType == BreakType.Shatter) Shatter(p, point, force); else Detach(p, point, force, true);
            broke = true;
        }
        if (broke) Support();
        return broke;
    }

    public void ApplyExplosion(Vector3 centre, float radius, float damage, float force)
    {
        Init();
        // bodies that were already loose get the blast push; the ones this blast frees got their share in Damage.
        // A snapshot: Damage can remove entries from `loose` (Untrack), which would shift the indices
        var old = loose.ToArray();
        var hits = new List<KeyValuePair<Part, float>>();
        foreach (var p in parts.Values)
        {
            if (p.state == PartState.Shattered) continue;
            var d = DistanceTo(p, centre);
            if (d < radius) hits.Add(new KeyValuePair<Part, float>(p, 1f - d / radius));
        }
        foreach (var h in hits)
        {
            var p = h.Key; var at = Centre(p); var dir = (at - centre); dir.y = Mathf.Abs(dir.y) + 0.3f;
            Damage(p, damage * h.Value, at, dir.normalized * force * h.Value * Mathf.Min(1f, p.mass), true);
        }
        foreach (var l in old)
        {
            if (l.t == null || l.rb == null || !loose.Contains(l)) continue;
            l.rb.AddExplosionForce(force * impulseScale * Mathf.Min(1f, l.rb.mass), centre, radius, 0.3f, ForceMode.Impulse);
        }
    }

    float DistanceTo(Part p, Vector3 c)
    {
        var best = float.MaxValue;
        foreach (var col in p.colliders) if (col != null && col.enabled) best = Mathf.Min(best, Vector3.Distance(col.ClosestPointOnBounds(c), c));
        return best < float.MaxValue ? best : Vector3.Distance(Centre(p), c);
    }

    static Vector3 Centre(Part p)
    {
        var b = new Bounds(p.node.position, Vector3.zero); var any = false;
        foreach (var r in p.node.GetComponentsInChildren<Renderer>()) { if (!any) { b = r.bounds; any = true; } else b.Encapsulate(r.bounds); }
        return b.center;
    }

    /* ------------------------------------------------------------------ breaking */
    void Detach(Part p, Vector3 point, Vector3 force, bool loud)
    {
        p.state = PartState.Loose;
        p.node.SetParent(null, true);
        if (looseLayer >= 0) foreach (var c in p.colliders) if (c != null) c.gameObject.layer = looseLayer;
        foreach (var mc in p.node.GetComponentsInChildren<MeshCollider>()) mc.convex = true;   // Rigidbodies need convex meshes
        p.body = p.node.gameObject.AddComponent<Rigidbody>();
        p.body.mass = p.mass; p.body.interpolation = RigidbodyInterpolation.Interpolate;
        p.body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
        if (force.sqrMagnitude > 0) p.body.AddForceAtPosition(force, point, ForceMode.Impulse);
        if (darkenLightsOnBreak && p.materialClass == "electronics") Darken(p.node);
        Track(p.node, p.body, p, false);
        // a drawer starts inside its carcass, a blade inside its rack: ignore what it overlaps until it is clear
        var others = new List<Collider>();
        foreach (var q in parts.Values) if (q != p && q.state != PartState.Shattered) foreach (var c in q.colliders) if (c != null && c.enabled) others.Add(c);
        IgnoreOverlaps(p.colliders, others, true);
        if (loud) { PlayBreak(p, point); if (p.breakType != BreakType.Shatter) ReleaseDebris(p, Centre(p), Vector3.zero); }
        Broke(p, point, false);
    }

    // stop collisions between each collider in a and each collider in b it overlaps now (or all pairs); with recheck,
    // pairs are turned back on once they no longer overlap
    void IgnoreOverlaps(List<Collider> a, List<Collider> b, bool recheck, bool all = false)
    {
        var pairs = new List<KeyValuePair<Collider, Collider>>();
        foreach (var x in a)
        {
            if (x == null) continue;
            foreach (var y in b)
            {
                if (y == null || y == x) continue;
                if (!all && !Physics.ComputePenetration(x, x.transform.position, x.transform.rotation, y, y.transform.position, y.transform.rotation, out _, out _)) continue;
                Physics.IgnoreCollision(x, y, true);
                pairs.Add(new KeyValuePair<Collider, Collider>(x, y));
            }
        }
        if (recheck && pairs.Count > 0 && isActiveAndEnabled) StartCoroutine(Unignore(pairs));
    }

    IEnumerator Unignore(List<KeyValuePair<Collider, Collider>> pairs)
    {
        for (var tries = 0; tries < 8 && pairs.Count > 0; tries++)
        {
            yield return new WaitForSeconds(0.5f);
            for (var i = pairs.Count - 1; i >= 0; i--)
            {
                var x = pairs[i].Key; var y = pairs[i].Value;
                if (x == null || y == null) { pairs.RemoveAt(i); continue; }
                if (Physics.ComputePenetration(x, x.transform.position, x.transform.rotation, y, y.transform.position, y.transform.rotation, out _, out _)) continue;
                Physics.IgnoreCollision(x, y, false); pairs.RemoveAt(i);
            }
        }
    }

    // a part's debris bits come out round it (once)
    void ReleaseDebris(Part p, Vector3 centre, Vector3 baseVel)
    {
        if (p.debrisOut) return;
        p.debrisOut = true;
        foreach (var dn in p.debris)
        {
            if (!debrisNodes.TryGetValue(dn, out var d) || d == null) continue;
            d.SetParent(null, true);
            d.position = centre + UnityEngine.Random.insideUnitSphere * 0.1f;
            d.gameObject.SetActive(true);
            var rb = p.liquid ? Drain(d, 0.02f) : MakeBody(d, 0.02f);
            MarkDebris(d, p);
            SetVelocity(rb, baseVel + UnityEngine.Random.insideUnitSphere * 2.5f + Vector3.up * 1.5f);
            Track(d, rb, null, true, p.liquid);
        }
    }

    void MarkDebris(Transform t, Part p)
    {
        var m = t.GetComponent<FurnitureDebris>(); if (m == null) m = t.gameObject.AddComponent<FurnitureDebris>();
        m.owner = this; m.part = p.name;
        foreach (var c in t.GetComponentsInChildren<Collider>(true)) Own(c);
    }

    void Shatter(Part p, Vector3 point, Vector3 force)
    {
        var baseVel = p.body != null ? GetVelocity(p.body) : Vector3.zero;
        var centre = Centre(p);   // before the part is hidden (inactive renderers are not counted)
        if (p.body != null) { Untrack(p.node); Destroy(p.body); p.body = null; }
        p.state = PartState.Shattered; p.health = 0f;
        var g = p.chunks;
        g.SetPositionAndRotation(p.node.position, p.node.rotation);
        g.localScale = Vector3.one;
        g.gameObject.SetActive(true);
        p.node.gameObject.SetActive(false);
        var kids = new List<Transform>(); foreach (Transform c in g) kids.Add(c);
        var total = 0f; var vols = new float[kids.Count];
        for (var i = 0; i < kids.Count; i++) { var b = LocalBounds(kids[i]); vols[i] = Mathf.Max(1e-6f, b.size.x * b.size.y * b.size.z); total += vols[i]; }
        // the part this one hangs from keeps the glued strips (torn paper)
        Part hostPart = null;
        if (p.attach.Length > 0 && p.attach[0] != "ground") parts.TryGetValue(p.attach[0], out hostPart);
        var chunkCols = new List<Collider>(); var stripCols = new List<Collider>();
        for (var i = 0; i < kids.Count; i++)
        {
            var t = kids[i];
            if (Array.IndexOf(p.fixedChunks, i + 1) >= 0)
            {
                if (hostPart != null && hostPart.state == PartState.Shattered) { t.gameObject.SetActive(false); continue; }
                t.SetParent(hostPart != null ? hostPart.node : host, true);
                MarkDebris(t, p);
                foreach (var c in t.GetComponentsInChildren<Collider>()) stripCols.Add(c);
                if (darkenLightsOnBreak) Darken(t);
                continue;
            }
            t.SetParent(null, true);
            if (p.liquid)
            {
                // water: no colliders, a short fall, then gone (the game plays the splash on the break event)
                var wb = Drain(t, p.mass * vols[i] / total);
                MarkDebris(t, p);
                var o = (t.position - point); o.y = 0f;
                SetVelocity(wb, baseVel + o.normalized * chunkScatter * UnityEngine.Random.Range(0.3f, 0.9f));
                Track(t, wb, null, true, true);
                continue;
            }
            var rb = MakeBody(t, p.mass * vols[i] / total);
            rb.maxDepenetrationVelocity = 1f;
            MarkDebris(t, p);
            foreach (var c in t.GetComponentsInChildren<Collider>()) chunkCols.Add(c);
            var outward = (t.position - point); outward.y = Mathf.Abs(outward.y) * 0.5f;
            SetVelocity(rb, baseVel + outward.normalized * chunkScatter * UnityEngine.Random.Range(0.4f, 1.2f) + Vector3.up * UnityEngine.Random.Range(0.3f, 1f));
            rb.AddForceAtPosition(force * (vols[i] / total), point, ForceMode.Impulse);
            rb.AddTorque(UnityEngine.Random.insideUnitSphere * 0.02f * rb.mass, ForceMode.Impulse);
            if (darkenLightsOnBreak) Darken(t);
            Track(t, rb, null, true);
        }
        // the cells of one part touch along their cuts: sibling chunks never push each other apart, and none of them
        // fights the piece's other colliders it starts inside of
        IgnoreOverlaps(chunkCols, chunkCols, false, true);
        // nor do they fight the torn border strips that stay on the frame next to them
        if (stripCols.Count > 0) IgnoreOverlaps(chunkCols, stripCols, false, true);
        var rest = new List<Collider>();
        foreach (var q in parts.Values) if (q != p && q.state != PartState.Shattered) foreach (var c in q.colliders) if (c != null && c.enabled) rest.Add(c);
        IgnoreOverlaps(chunkCols, rest, true);
        if (g.childCount == 0) Destroy(g.gameObject);   // the group is empty now
        ReleaseDebris(p, centre, baseVel);
        PlayBreak(p, point);
        Broke(p, point, true);
    }

    // a body with no colliders (liquid chunks): it falls through everything and is gone within a second
    Rigidbody Drain(Transform t, float mass)
    {
        foreach (var c in t.GetComponentsInChildren<Collider>(true)) c.enabled = false;
        var rb = t.gameObject.AddComponent<Rigidbody>();
        rb.mass = Mathf.Max(0.01f, mass); rb.interpolation = RigidbodyInterpolation.Interpolate;
        return rb;
    }

    Rigidbody MakeBody(Transform t, float mass)
    {
        if (looseLayer >= 0) foreach (var x in t.GetComponentsInChildren<Transform>(true)) x.gameObject.layer = looseLayer;
        if (t.GetComponentInChildren<Collider>() == null)
        {
            var b = LocalBounds(t); var box = t.gameObject.AddComponent<BoxCollider>();
            box.center = b.center; box.size = Vector3.Max(b.size, Vector3.one * 0.005f);
        }
        foreach (var mc in t.GetComponentsInChildren<MeshCollider>()) mc.convex = true;
        var rb = t.gameObject.AddComponent<Rigidbody>();
        rb.mass = Mathf.Max(0.01f, mass); rb.interpolation = RigidbodyInterpolation.Interpolate;
        return rb;
    }

    // bounds of a node's meshes in its own frame
    static Bounds LocalBounds(Transform t)
    {
        var b = new Bounds(); var any = false;
        foreach (var mf in t.GetComponentsInChildren<MeshFilter>(true))
        {
            if (mf.sharedMesh == null) continue;
            var mb = mf.sharedMesh.bounds; var m = t.worldToLocalMatrix * mf.transform.localToWorldMatrix;
            for (var i = 0; i < 8; i++)
            {
                var p = m.MultiplyPoint3x4(mb.center + Vector3.Scale(mb.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1)));
                if (!any) { b = new Bounds(p, Vector3.zero); any = true; } else b.Encapsulate(p);
            }
        }
        return any ? b : new Bounds(Vector3.zero, Vector3.one * 0.05f);
    }

    // parts held only by parts that are gone or loose come loose. A part whose host came loose whole (a pane in a
    // door that was shot off) becomes a body of its own next to it, not a child of the host's body
    void Support()
    {
        for (var changed = true; changed;)
        {
            changed = false;
            foreach (var p in parts.Values)
            {
                if (p.state != PartState.Intact || p.breakType == BreakType.Fixed || p.attach.Length == 0 || p.attach[0] == "ground") continue;
                var held = 0;
                foreach (var a in p.attach) if (parts.TryGetValue(a, out var q) && q.state == PartState.Intact) held++;
                if (held < p.need)
                {
                    if (p.collapse && p.breakType == BreakType.Shatter && p.chunks != null) Shatter(p, Centre(p), Vector3.zero);
                    else Detach(p, Centre(p), Vector3.zero, false);
                    changed = true;
                }
            }
        }
    }

    void Broke(Part p, Vector3 point, bool shattered)
    {
        onPartBroken.Invoke(p.name, p.materialClass, point);
        AnyPartBroken?.Invoke(this, new BreakInfo { part = p.name, materialClass = p.materialClass, shattered = shattered, liquid = p.liquid, point = point });
    }

    /* ------------------------------------------------------------------ loose bodies: landing damage, fade, limit */
    void Track(Transform t, Rigidbody rb, Part part, bool fades, bool liquid = false)
    {
        loose.Add(new Loose { t = t, rb = rb, born = fades ? Time.time : float.MaxValue, scale = t.localScale, part = part, lastLand = -1f,
            life = liquid ? liquidLifetime : -1f, fade = liquid ? liquidFade : -1f });
        if (part != null && landingDamage && (part.materialClass == "glass" || part.materialClass == "ceramic" || part.materialClass == "electronics"))
        {
            var l = t.gameObject.AddComponent<LandingProbe>(); l.owner = this; l.part = part;
        }
        var live = 0; foreach (var x in loose) if (x.born < float.MaxValue) live++;
        for (var i = 0; i < loose.Count && live > maxLooseBodies; i++)
            if (loose[i].born < float.MaxValue && loose[i].born > Time.time - debrisLifetime) { loose[i].born = Time.time - debrisLifetime; live--; }
    }

    void Untrack(Transform t) { loose.RemoveAll(l => l.t == t); }

    internal void Landed(Part p, float speed, Vector3 point)
    {
        if (p.state != PartState.Loose || speed < 2f) return;
        Damage(p, (speed - 2f) * 25f, point, Vector3.zero);
    }

    void Update()
    {
        var now = Time.time;
        Animate(now);
        for (var i = loose.Count - 1; i >= 0; i--)
        {
            var l = loose[i];
            if (l.t == null) { loose.RemoveAt(i); continue; }
            var life = l.life >= 0f ? l.life : debrisLifetime; var fade = l.fade > 0f ? l.fade : fadeTime;
            var age = now - l.born - life;
            if (age < 0) continue;
            if (age >= fade) { Release(l.t); Destroy(l.t.gameObject); loose.RemoveAt(i); continue; }
            l.t.localScale = l.scale * (1f - age / fade);   // shrink away: works with any shader
        }
    }

    // batch G hints: spinning parts while in place, breathing steam cards
    void Animate(float now)
    {
        foreach (var p in parts.Values)
        {
            if (p.state != PartState.Intact || p.node == null) continue;
            if (animateSpin && p.spinRps != 0f) p.node.Rotate(p.spinAxis, p.spinRps * spinScale * 360f * Time.deltaTime, Space.Self);
            if (animateFx && p.fx == "steam")
            {
                var ph = (p.name.GetHashCode() & 255) * 0.05f;
                p.node.localScale = Vector3.Scale(p.restScale, new Vector3(1f + 0.06f * Mathf.Sin(now * 0.9f + ph), 1f + 0.12f * Mathf.Sin(now * 0.6f + ph), 1f));
                p.node.localRotation = p.restRot * Quaternion.Euler(0f, 6f * Mathf.Sin(now * 0.35f + ph), 0f);
            }
        }
    }

    // forget the colliders of a body that is about to be destroyed (the static owner map would keep them otherwise)
    void Release(Transform t)
    {
        foreach (var c in t.GetComponentsInChildren<Collider>(true)) { if (owners.TryGetValue(c, out var f) && f == this) owners.Remove(c); owned.Remove(c); }
    }

    void OnDestroy()
    {
        foreach (var l in loose) if (l.t != null) Destroy(l.t.gameObject);
        loose.Clear();
        // ReferenceEquals: a collider destroyed earlier compares equal to null but its key is still in the map
        foreach (var c in owned) if (!ReferenceEquals(c, null) && owners.TryGetValue(c, out var f) && f == this) owners.Remove(c);
        owned.Clear();
    }

    /* ------------------------------------------------------------------ looks and sound */
    static void Darken(Transform t)
    {
        foreach (var r in t.GetComponentsInChildren<Renderer>())
        {
            var mats = r.sharedMaterials; var changed = false;
            for (var i = 0; i < mats.Length; i++)
            {
                var m = mats[i];
                if (m == null || !(m.name.StartsWith("screen") || m.name.StartsWith("led") || m.name.StartsWith("paper_hanji_lit"))) continue;
                m = new Material(m);
                if (m.HasProperty("emissiveFactor")) m.SetColor("emissiveFactor", Color.black);   // glTFast shaders
                if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", Color.black);   // Standard / URP Lit
                m.DisableKeyword("_EMISSIVE"); m.DisableKeyword("_EMISSION");
                mats[i] = m; changed = true;
            }
            if (changed) r.sharedMaterials = mats;
        }
    }

    ClassSound SoundFor(string cls) { foreach (var s in sounds) if (s.materialClass == cls) return s; return null; }
    void PlayHit(Part p, Vector3 at) { var s = SoundFor(p.materialClass); if (s != null && s.hit != null) AudioSource.PlayClipAtPoint(s.hit, at, s.volume); }
    void PlayBreak(Part p, Vector3 at) { var s = SoundFor(p.materialClass); if (s != null && s.breakClip != null) AudioSource.PlayClipAtPoint(s.breakClip, at, s.volume); }

#if UNITY_6000_0_OR_NEWER
    static Vector3 GetVelocity(Rigidbody rb) { return rb.linearVelocity; }
    static void SetVelocity(Rigidbody rb, Vector3 v) { rb.linearVelocity = v; }
#else
    static Vector3 GetVelocity(Rigidbody rb) { return rb.velocity; }
    static void SetVelocity(Rigidbody rb, Vector3 v) { rb.velocity = v; }
#endif

#if UNITY_EDITOR
    // Tools > Gunmodls > Set Up Breakable Furniture: on the selected piece prefabs or scene objects, bakes the
    // colliders, adds this component and points it at the parts.json found in the same or a parent folder.
    static class EditorSetup
    {
        [UnityEditor.MenuItem("Tools/Gunmodls/Set Up Breakable Furniture")]
        static void Run()
        {
            var done = 0;
            foreach (var o in UnityEditor.Selection.gameObjects)
            {
                var path = UnityEditor.AssetDatabase.GetAssetPath(o);
                if (!string.IsNullOrEmpty(path) && path.EndsWith(".prefab"))
                {
                    var root = UnityEditor.PrefabUtility.LoadPrefabContents(path);
                    try { Setup(root, path); UnityEditor.PrefabUtility.SaveAsPrefabAsset(root, path); done++; }
                    finally { UnityEditor.PrefabUtility.UnloadPrefabContents(root); }
                }
                else if (string.IsNullOrEmpty(path)) { UnityEditor.Undo.RegisterFullObjectHierarchyUndo(o, "Set Up Breakable Furniture"); Setup(o, null); done++; }
                else Debug.LogWarning("BreakableFurniture: " + path + " is not a prefab; build prefabs first (Tools > Gunmodls > Build Prefabs From Selection)");
            }
            Debug.Log("BreakableFurniture: set up " + done + " piece(s).");
        }

        static void Setup(GameObject root, string assetPath)
        {
            BuildColliders(root.transform);
            var f = root.GetComponent<BreakableFurniture>(); if (f == null) f = root.AddComponent<BreakableFurniture>();
            if (f.partsJson == null) f.partsJson = FindPartsJson(assetPath);
            if (string.IsNullOrEmpty(f.pieceId)) f.pieceId = root.name;
            UnityEditor.EditorUtility.SetDirty(f);
        }

        static TextAsset FindPartsJson(string near)
        {
            var dir = string.IsNullOrEmpty(near) ? "Assets" : System.IO.Path.GetDirectoryName(near).Replace('\\', '/');
            while (!string.IsNullOrEmpty(dir))
            {
                var t = UnityEditor.AssetDatabase.LoadAssetAtPath<TextAsset>(dir + "/parts.json");
                if (t != null) return t;
                var k = dir.LastIndexOf('/'); if (k < 0) break; dir = dir.Substring(0, k);
            }
            foreach (var g in UnityEditor.AssetDatabase.FindAssets("parts t:TextAsset"))
            {
                var p = UnityEditor.AssetDatabase.GUIDToAssetPath(g);
                if (p.EndsWith("/parts.json")) return UnityEditor.AssetDatabase.LoadAssetAtPath<TextAsset>(p);
            }
            return null;
        }
    }
#endif
}

// Marks a chunk or debris bit that has left its piece (added by BreakableFurniture): it never stops a bullet, and
// BreakableFurniture.Owner finds its piece through it.
public class FurnitureDebris : MonoBehaviour
{
    public BreakableFurniture owner;
    public string part;
}

// Reports hard landings of a loose brittle part back to its piece (added by BreakableFurniture).
public class LandingProbe : MonoBehaviour
{
    internal BreakableFurniture owner;
    internal BreakableFurniture.Part part;
    void OnCollisionEnter(Collision c)
    {
        if (owner == null || part == null) return;
        owner.Landed(part, c.relativeVelocity.magnitude, c.contactCount > 0 ? c.GetContact(0).point : transform.position);
    }
}
