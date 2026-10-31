// Nox's Tracker Tags: coin-sized tags that stick to walls, doors, floors and hatches and feel steps and breaches
// through the surface. Nox's HUD gets a rough direction and a distance band, never the exact spot.
//
// TrackerTags goes on Nox (the player who owns the tags). It spawns tags from tagPrefab (built from
// unity/tracker-tag.glb with Tools > Gunmodls; import with Animation: Legacy) and drives the pack in his hand.
//   Place(point, normal, surface)   pressed on: the pack ejects one, it sticks 0.35 s later (0.6 s in all)
//   Throw(from, velocity)           thrown: it flies and sticks to the first surface it hits (never to people)
//   Pickup(tag), ResetAll()         one back into the pack; all tags gone and the pack full (new round)
//   onReading, onTamper             what the HUD shows: rough bearing, arc width, distance band
// The game reports vibrations (static, from anywhere; server side in multiplayer):
//   TrackerTags.ReportVibration(point, strength, source)   strength: crouch 0.15, walk 0.6, sprint 1.0
//   TrackerTags.ReportStep(foot, gait, who), TrackerTags.ReportBreach(point, who)
// Sources that Nullfield.IsHidden() hides are ignored: Nullfield.cs (same folder) is required.
// Also in this file:
//   TrackerTag       on each tag (TrackerTags adds it): Place, Throw, Damage / Kill (tamper)
//   TrackerTagsPack  on the pack prefab (TrackerTags adds it): Eject, Equip, Holster, SetCount
//   TrackerSurface   on a soft floor (damping 0.4) or a surface tags must not stick to
// Unity adds a MonoBehaviour from the Inspector only when its file has the class's name. Add the three with
// AddComponent, or move each class into its own file (TrackerTag.cs, TrackerTagsPack.cs, TrackerSurface.cs).
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

// What one tag felt, as Nox's HUD should show it.
public struct TrackerReading
{
    public int eventId;          // the vibration it came from (one footstep can reach several tags)
    public int tagId;            // 1..5
    public TrackerTag tag;
    public Vector3 approxPoint;  // the event moved up to `fuzz` metres in a random direction; never draw it as a marker
    public float bearing;        // degrees from the observer's forward, + to the right (clockwise seen from above)
    public float halfWidth;      // degrees: draw an arc from bearing - halfWidth to bearing + halfWidth
    public int band;             // 0 near (< 3 m from the observer), 1 mid (< 6 m), 2 far
    public float strength;       // 0..1, how hard the tag felt it
    public bool tamper;          // the tag was destroyed (the arc points at the tag itself)
    public float time;           // Time.time when it arrived
}

[System.Serializable] public class TrackerReadingEvent : UnityEvent<TrackerReading> { }
[System.Serializable] public class TrackerTagEvent : UnityEvent<TrackerTag> { }

public class TrackerTags : MonoBehaviour
{
    // step strengths (the viewer's GAIT), soft floor multiplier, breach strength and reach (times the range)
    public const float Crouch = 0.15f, Walk = 0.6f, Sprint = 1f, Vault = 1f, SoftFloor = 0.4f, BreachStrength = 1f, BreachReach = 2f;
    public enum Gait { Crouch, Walk, Sprint }

    [Header("Tags")]
    public GameObject tagPrefab;                 // the tracker-tag prefab
    public GameObject pack;                      // the pack in Nox's hand or on his belt (optional)
    public int capacity = 5;
    public float range = 3f;                     // m: a full-strength step reaches a tag this far away
    public float placeDelay = 0.35f;             // pressed on: the pack's eject, then the tag sticks (0.25 s)
    public LayerMask surfaces = ~0;              // layers tags stick to
    [Header("Readings (HUD)")]
    public Transform observer;                   // bearings are from here (Nox's camera); empty = this transform
    public float fuzz = 1.2f;                    // m: each reading is the event moved up to this far
    public Vector2 bands = new Vector2(3f, 6f);  // m from the observer: near below x, mid below y, far beyond
    public Vector2 arcLimits = new Vector2(8f, 40f);   // degrees: arc half-width = clamp(atan(fuzz / distance))
    public float readingLife = 2.6f, tamperLife = 4f;  // s a reading stays on the HUD
    public float alertDelay = 0.25f;             // s from the shot to the tamper alert
    [Header("Sound")]
    public AudioClip ejectSound, stickSound, pulseSound, tamperSound;   // 3D, at the pack or the tag
    public AudioClip hudPing, tamperAlert;                               // 2D, Nox only
    public TrackerReadingEvent onReading = new TrackerReadingEvent(), onTamper = new TrackerReadingEvent();
    public TrackerTagEvent onPlaced = new TrackerTagEvent();

    public static float travelTime = 0.75f;      // s for a vibration to reach the edge of its radius (the viewer's ripple)

    public TrackerTagsPack Pack { get; private set; }
    public int Left { get { return Pack != null ? Pack.Count : left; } }
    public IReadOnlyList<TrackerTag> Placed { get { return placed; } }
    public IReadOnlyList<TrackerReading> Recent { get { return recent; } }   // readings still on screen, oldest first

    static int autoId;
    static readonly RaycastHit[] probe = new RaycastHit[8];
    readonly List<TrackerTag> placed = new List<TrackerTag>();
    readonly List<TrackerReading> recent = new List<TrackerReading>();
    AudioSource ears;
    int left, lastPingId = -1;
    float lastPingT = -9f;

    void Awake()
    {
        left = capacity;
        if (pack != null)
        {
            Pack = pack.GetComponent<TrackerTagsPack>();
            if (Pack == null) Pack = pack.AddComponent<TrackerTagsPack>();
            Pack.ejectSound = ejectSound;
            Pack.SetCount(capacity);
        }
        ears = gameObject.AddComponent<AudioSource>(); ears.spatialBlend = 0f; ears.playOnAwake = false;
    }

    void Update()
    {
        var now = Time.time;
        recent.RemoveAll(r => now - r.time > (r.tamper ? tamperLife : readingLife));
    }

    // ---------------------------------------------------------------- placing

    // Pressed on at point (normal out of the surface). Null if none are left, the pack is busy or the surface takes no tags.
    public TrackerTag Place(Vector3 point, Vector3 normal, Collider surface)
    {
        if (!TrackerTag.CanStick(surface, surfaces) || !Take()) return null;
        var tag = Spawn(point, Quaternion.FromToRotation(Vector3.up, normal));
        tag.Place(point, normal, surface, Pack != null ? placeDelay : 0f);
        return tag;
    }

    // Thrown from `from` (the hand) at `velocity` (m/s). It sticks to the first surface it hits.
    public TrackerTag Throw(Vector3 from, Vector3 velocity)
    {
        if (!Take()) return null;
        var tag = Spawn(from, Random.rotation);
        tag.Throw(velocity);
        return tag;
    }

    // Nox picks a live tag back up: it goes back into the pack.
    public bool Pickup(TrackerTag tag)
    {
        if (tag == null || tag.Owner != this || !tag.Listening) return false;
        Destroy(tag.gameObject);
        if (Pack != null) Pack.SetCount(Pack.Count + 1); else left = Mathf.Min(capacity, left + 1);
        return true;
    }

    // a new round: every tag of Nox's gone, the pack full
    public void ResetAll()
    {
        foreach (var t in placed.ToArray()) if (t != null) Destroy(t.gameObject);
        placed.Clear(); recent.Clear();
        if (Pack != null) Pack.SetCount(capacity); else left = capacity;
    }

    bool Take()
    {
        if (tagPrefab == null) return false;
        if (Pack != null) return Pack.Eject();
        if (left <= 0) return false;
        left--;
        return true;
    }

    TrackerTag Spawn(Vector3 at, Quaternion rotation)
    {
        var go = Instantiate(tagPrefab, at, rotation);
        var tag = go.GetComponent<TrackerTag>();
        if (tag == null) tag = go.AddComponent<TrackerTag>();
        tag.range = range; tag.surfaces = surfaces;
        tag.stickSound = stickSound; tag.pulseSound = pulseSound; tag.tamperSound = tamperSound;
        // ids 1..capacity: the lowest one not in use (it seeds the fuzz)
        var id = 1;
        while (placed.Exists(t => t != null && t.Id == id)) id++;
        tag.Init(this, id);
        placed.Add(tag);
        return tag;
    }

    internal void Forget(TrackerTag tag) { placed.Remove(tag); }
    internal void Stuck(TrackerTag tag) { onPlaced.Invoke(tag); }

    // ---------------------------------------------------------------- vibrations (static: call from anywhere)

    // A step, a vault landing, a breach. strength 0..1 (Crouch, Walk, Sprint, Vault); reach multiplies the radius
    // (BreachReach for a breach). seed >= 0 makes the fuzz the same everywhere (send it to clients); -1 counts up.
    // Each stuck tag within range * strength * damping * reach pulses when the vibration reaches it.
    // Returns how many tags felt it.
    public static int ReportVibration(Vector3 point, float strength, GameObject source) { return ReportVibration(point, strength, source, 1f, -1); }

    public static int ReportVibration(Vector3 point, float strength, GameObject source, float reach, int seed = -1)
    {
        if (strength <= 0f) return 0;
        // sensors skip whatever a Nullfield hides (N1CK always, anyone inside a powered bubble)
        if (Nullfield.IsHidden(point) || (source != null && Nullfield.IsHidden(source))) return 0;
        var damping = DampingAt(point, source);
        var id = seed >= 0 ? seed : ++autoId;
        var felt = Mathf.Min(1f, strength * damping);
        var n = 0;
        foreach (var tag in TrackerTag.Live)
        {
            if (!tag.Listening) continue;
            var radius = tag.range * strength * damping * reach;
            var d = Vector3.Distance(tag.transform.position, point);
            if (radius <= 0f || d > radius) continue;
            var k = d / radius;
            tag.Feel(point, id, felt * (1f - k), travelTime * (1f - Mathf.Sqrt(1f - k)));
            n++;
        }
        return n;
    }

    public static int ReportStep(Vector3 foot, Gait gait, GameObject who, int seed = -1)
    {
        return ReportVibration(foot, gait == Gait.Crouch ? Crouch : gait == Gait.Walk ? Walk : Sprint, who, 1f, seed);
    }

    public static int ReportBreach(Vector3 point, GameObject who, int seed = -1)
    {
        return ReportVibration(point, BreachStrength, who, BreachReach, seed);
    }

    // the TrackerSurface under the point (a soft floor damps the step); 1 if none
    static float DampingAt(Vector3 point, GameObject source)
    {
        var n = Physics.RaycastNonAlloc(point + Vector3.up * 0.1f, Vector3.down, probe, 0.3f, ~0, QueryTriggerInteraction.Ignore);
        var best = float.MaxValue; var damping = 1f;
        for (var i = 0; i < n; i++)
        {
            if (source != null && probe[i].collider.transform.IsChildOf(source.transform)) continue;
            if (probe[i].collider.GetComponentInParent<TrackerTag>() != null) continue;
            if (probe[i].distance >= best) continue;
            best = probe[i].distance;
            var s = probe[i].collider.GetComponentInParent<TrackerSurface>();
            damping = s != null ? s.damping : 1f;
        }
        return damping;
    }

    // ---------------------------------------------------------------- readings

    // a tag felt something (called by the tag when the vibration reaches it)
    internal void Felt(TrackerTag tag, Vector3 approxPoint, int eventId, float strength)
    {
        var r = Reading(approxPoint, false);
        r.eventId = eventId; r.tagId = tag.Id; r.tag = tag; r.strength = strength;
        recent.Add(r);
        onReading.Invoke(r);
        // one ping per event, not per tag
        if (eventId != lastPingId && Time.time - lastPingT > 0.12f)
        {
            lastPingId = eventId; lastPingT = Time.time;
            if (hudPing != null) ears.PlayOneShot(hudPing, 0.4f);
        }
    }

    internal void Tampered(TrackerTag tag) { StartCoroutine(Alert(tag, tag.transform.position, tag.Id)); }

    IEnumerator Alert(TrackerTag tag, Vector3 at, int tagId)
    {
        yield return new WaitForSeconds(alertDelay);
        var r = Reading(at, true);
        r.eventId = -1; r.tagId = tagId; r.tag = tag; r.strength = 1f;
        recent.Add(r);
        if (tamperAlert != null) ears.PlayOneShot(tamperAlert, 0.6f);
        onTamper.Invoke(r);
    }

    TrackerReading Reading(Vector3 point, bool tamper)
    {
        var o = observer != null ? observer : transform;
        var to = point - o.position; to.y = 0f;
        var dist = Mathf.Max(0.3f, to.magnitude);
        return new TrackerReading
        {
            approxPoint = point,
            bearing = Bearing(o, point),
            halfWidth = tamper ? 5f : Mathf.Clamp(Mathf.Atan(fuzz / dist) * Mathf.Rad2Deg, arcLimits.x, arcLimits.y),
            band = dist < bands.x ? 0 : dist < bands.y ? 1 : 2,
            tamper = tamper,
            time = Time.time,
        };
    }

    // degrees from the observer's forward to the point, + to the right; use it to turn old readings as Nox turns
    public static float Bearing(Transform observer, Vector3 point)
    {
        var f = observer.forward; f.y = 0f;
        var to = point - observer.position; to.y = 0f;
        if (f.sqrMagnitude < 1e-6f || to.sqrMagnitude < 1e-6f) return 0f;
        return Vector3.SignedAngle(f, to, Vector3.up);
    }

    // the viewer's seeded random numbers (mulberry32): the same event and tag give the same fuzz everywhere
    internal Vector3 Fuzz(Vector3 point, int eventId, int tagId)
    {
        uint a; unchecked { a = (uint)(eventId * 7919 + tagId * 104729); }
        var angle = Next(ref a) * Mathf.PI * 2f;
        var d = fuzz * Mathf.Sqrt(Next(ref a));
        return new Vector3(point.x + Mathf.Cos(angle) * d, point.y, point.z + Mathf.Sin(angle) * d);
    }

    static float Next(ref uint a)
    {
        unchecked
        {
            a += 0x6D2B79F5u;
            var t = (a ^ (a >> 15)) * (a | 1u);
            t = (t + (t ^ (t >> 7)) * (t | 61u)) ^ t;
            return (float)((t ^ (t >> 14)) / 4294967296.0);
        }
    }
}

// One tag. TrackerTags adds it to each tag it spawns; a tag placed in the level starts stuck where it is.
// Its glTF rest pose is stuck. Clips are sampled by this script (no wrap modes to worry about):
// stick 0.25 s (at 0 s it is the free pose), pulse 0.35 s, tamper 0.5 s (holds its last pose).
[RequireComponent(typeof(Animation))]
public class TrackerTag : MonoBehaviour
{
    public float range = 3f;                     // m for a full-strength step
    public float health = 1f;                    // Damage() takes it down; at 0 it is destroyed (1 = any hit)
    public float removeAfter = 6f;               // s a destroyed tag stays before it is removed (0 = keep it)
    public LayerMask surfaces = ~0;
    public AudioClip stickSound, pulseSound, tamperSound;
    public UnityEvent onStuck = new UnityEvent(), onPulse = new UnityEvent(), onTampered = new UnityEvent();

    public enum State { Flying, Sticking, Stuck, Dead }
    public State Current { get; private set; }
    public int Id { get; private set; }
    public TrackerTags Owner { get; private set; }
    public Collider Surface { get; private set; }
    // stuck (or sticking, once it is on the surface): it feels vibrations
    public bool Listening { get { return (Current == State.Sticking && waitT <= 0f) || Current == State.Stuck; } }
    public static IReadOnlyList<TrackerTag> Live { get { return live; } }

    const float FlashTau = 0.12f, FlashGain = 2.5f, LedOn = 0.13f, LedFull = 0.24f, MaxFlight = 6f;
    static readonly List<TrackerTag> live = new List<TrackerTag>();
    static int nextId = 100;

    struct Glow { public Material mat; public Color factor, color; public bool emissive, emission; }
    struct Pending { public float t; public Vector3 point; public int id; public float strength; }

    Animation anim;
    AudioSource oneShot;
    Renderer[] renderers;
    Collider[] colliders;
    readonly List<Glow> glow = new List<Glow>();
    readonly List<Pending> pending = new List<Pending>();
    readonly RaycastHit[] hits = new RaycastHit[8];
    Transform anchor;
    Vector3 localPos, velocity, spinAxis;
    Quaternion localRot;
    bool hadAnchor, shown = true, placedByScript;
    float clipT, waitT, pulseT = -1f, flashT = 9f, flashK, flightT, lastGlow = -1f, maxHealth;

    void Awake()
    {
        anim = GetComponent<Animation>();
        // glTFast imports every clip as a loop and plays the first one (stick) on its own: this script samples them instead
        anim.playAutomatically = false; anim.Stop();
        renderers = GetComponentsInChildren<Renderer>(true);
        colliders = GetComponentsInChildren<Collider>(true);
        if (colliders.Length == 0)
        {
            // one box round the puck, if the prefab has none
            var b = gameObject.AddComponent<BoxCollider>();
            b.center = new Vector3(0f, 0.004f, 0f); b.size = new Vector3(0.032f, 0.009f, 0.032f);
            colliders = new Collider[] { b };
        }
        foreach (var r in renderers)
            foreach (var m in r.materials)
                if (m.name.StartsWith("led_purple") || m.name.StartsWith("pulse_purple"))
                    glow.Add(new Glow
                    {
                        mat = m,
                        factor = m.HasProperty("emissiveFactor") ? m.GetColor("emissiveFactor") : Color.black,
                        color = m.HasProperty("_EmissionColor") ? m.GetColor("_EmissionColor") : Color.black,
                        emissive = m.IsKeywordEnabled("_EMISSIVE"),
                        emission = m.IsKeywordEnabled("_EMISSION"),
                    });
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f; oneShot.playOnAwake = false;
        maxHealth = health;
        Id = ++nextId;
        // placed in the level: stuck where it is
        Current = State.Stuck;
        SamplePose("tamper", 0f); SamplePose("pulse", 0f); SamplePose("stick", Length("stick"));
        SetGlow(1f);
    }

    void Start()
    {
        if (placedByScript || Current != State.Stuck) return;
        // a tag put in the level: find what it is stuck to (it follows a door that swings)
        RaycastHit hit;
        if (Cast(transform.position + transform.up * 0.01f, -transform.up, 0.03f, out hit)) Anchor(hit.collider);
    }

    void OnEnable() { if (!live.Contains(this)) live.Add(this); }
    void OnDisable() { live.Remove(this); }
    void OnDestroy() { if (Owner != null) Owner.Forget(this); }

    internal void Init(TrackerTags owner, int id) { Owner = owner; Id = id; placedByScript = true; }

    // ---------------------------------------------------------------- commands

    // Stick it at point (the origin is the centre of its back), its +Y along normal. surface may be null.
    // delay: hidden until then (the pack's eject), then the stick clip. yaw: degrees about the normal, < 0 random.
    public void Place(Vector3 point, Vector3 normal, Collider surface, float delay = 0f, float yaw = -1f)
    {
        placedByScript = true;
        Fresh();
        if (yaw < 0f) yaw = Random.Range(0f, 360f);
        transform.SetPositionAndRotation(point, Quaternion.FromToRotation(Vector3.up, normal.normalized) * Quaternion.AngleAxis(yaw, Vector3.up));
        Anchor(surface);
        Current = State.Sticking; clipT = 0f; waitT = delay;
        Show(delay <= 0f);
        if (delay <= 0f) Land();
    }

    // Leaves the hand at velocity (m/s), tumbling. It sticks to the first surface it hits, bounces off people.
    public void Throw(Vector3 v)
    {
        placedByScript = true;
        Fresh();
        Current = State.Flying; flightT = 0f; velocity = v;
        spinAxis = Random.onUnitSphere;
        Show(true);
    }

    public void Damage(float amount)
    {
        if (Current == State.Dead || amount <= 0f) return;
        health -= amount;
        if (health <= 0f) Kill();
    }

    // Shot, pried off or its surface destroyed: the cap pops open, lights out, Nox gets a tamper alert.
    public void Kill()
    {
        if (Current == State.Dead) return;
        var placed = shown && Current != State.Flying;
        Current = State.Dead; clipT = 0f; pulseT = -1f; pending.Clear();
        if (!placed) { Destroy(gameObject); return; }   // hidden in the pack's eject or still in the air: no alert
        SamplePose("stick", Length("stick")); SamplePose("pulse", 0f);
        SetGlow(0f);
        foreach (var c in colliders) if (c != null) c.enabled = false;
        if (tamperSound != null) oneShot.PlayOneShot(tamperSound, 0.8f);
        onTampered.Invoke();
        if (Owner != null && Owner.isActiveAndEnabled) Owner.Tampered(this);
        if (removeAfter > 0f) Destroy(gameObject, removeAfter);
    }

    // a vibration reaches the tag after delay s (TrackerTags.ReportVibration calls this)
    internal void Feel(Vector3 point, int eventId, float strength, float delay)
    {
        pending.Add(new Pending { t = delay, point = point, id = eventId, strength = strength });
    }

    // ---------------------------------------------------------------- running

    void Update()
    {
        var dt = Time.deltaTime;
        if (Current == State.Flying) { Fly(dt); return; }
        if (Current == State.Sticking)
        {
            if (waitT > 0f) { waitT -= dt; if (waitT <= 0f) { Show(true); Land(); } return; }
            clipT += dt;
            var len = Length("stick");
            SamplePose("stick", Mathf.Min(clipT, len));
            SetGlow(Mathf.Clamp01((clipT - LedOn) / (LedFull - LedOn)));
            if (clipT >= len) { Current = State.Stuck; SetGlow(1f); onStuck.Invoke(); if (Owner != null) Owner.Stuck(this); }
        }
        else if (Current == State.Dead)
        {
            if (clipT < Length("tamper")) { clipT += dt; SamplePose("tamper", Mathf.Min(clipT, Length("tamper"))); }
            return;
        }
        if (Current == State.Stuck && hadAnchor && anchor == null) { Kill(); return; }   // the wall or door it was on is gone

        // vibrations arriving
        for (var i = pending.Count - 1; i >= 0; i--)
        {
            var p = pending[i]; p.t -= dt; pending[i] = p;
            if (p.t > 0f) continue;
            pending.RemoveAt(i);
            Pulse(p);
        }
        if (Current == State.Stuck && pulseT >= 0f)
        {
            pulseT += dt;
            var len = Length("pulse");
            SamplePose("pulse", Mathf.Min(pulseT, len));
            if (pulseT >= len) pulseT = -1f;
        }
        if (Current == State.Stuck && flashT < 1f)
        {
            flashT += dt;
            SetGlow(flashT >= 1f ? 1f : 1f + FlashGain * flashK * Mathf.Exp(-flashT / FlashTau));
        }
    }

    void LateUpdate()
    {
        // follow the surface (a door that swings); not parented, so a scaled parent cannot skew it
        if (anchor != null && Current != State.Flying)
            transform.SetPositionAndRotation(anchor.TransformPoint(localPos), anchor.rotation * localRot);
    }

    void Pulse(Pending p)
    {
        if (!Listening) return;
        if (Current == State.Stuck) { pulseT = 0f; flashT = 0f; flashK = 0.4f + 0.6f * Mathf.Clamp01(p.strength * 1.6f); }
        if (pulseSound != null) oneShot.PlayOneShot(pulseSound, 0.22f);
        onPulse.Invoke();
        if (Owner != null) Owner.Felt(this, Owner.Fuzz(p.point, p.id, Id), p.id, p.strength);
    }

    void Fly(float dt)
    {
        flightT += dt;
        velocity += Physics.gravity * dt;
        var step = velocity * dt;
        var dist = step.magnitude;
        RaycastHit hit;
        if (dist > 1e-6f && Cast(transform.position, step / dist, dist, out hit))
        {
            if (CanStick(hit.collider, surfaces)) { Place(hit.point, hit.normal, hit.collider); return; }
            // a person or a surface that takes no tags: bounce off and keep falling
            velocity = Vector3.Reflect(velocity, hit.normal) * 0.3f;
            transform.position = hit.point + hit.normal * 0.005f;
        }
        else transform.position += step;
        transform.Rotate(spinAxis, 900f * dt, Space.World);
        if (flightT > MaxFlight) Destroy(gameObject);   // lost
    }

    bool Cast(Vector3 from, Vector3 dir, float dist, out RaycastHit best)
    {
        best = default(RaycastHit);
        var n = Physics.RaycastNonAlloc(from, dir, hits, dist, ~0, QueryTriggerInteraction.Ignore);
        var found = false;
        for (var i = 0; i < n; i++)
        {
            var t = hits[i].collider.transform;
            if (t.IsChildOf(transform) || (Owner != null && t.IsChildOf(Owner.transform))) continue;
            if (!found || hits[i].distance < best.distance) { best = hits[i]; found = true; }
        }
        return found;
    }

    // surfaces only: on the layer mask, not a person (CharacterController), not a moving physics body, not another tag
    public static bool CanStick(Collider c, LayerMask mask)
    {
        if (c == null) return true;   // no collider given: the caller vouches for the surface
        if ((mask.value & (1 << c.gameObject.layer)) == 0) return false;
        if (c.GetComponentInParent<CharacterController>() != null) return false;
        if (c.attachedRigidbody != null && !c.attachedRigidbody.isKinematic) return false;
        if (c.GetComponentInParent<TrackerTag>() != null) return false;
        var s = c.GetComponentInParent<TrackerSurface>();
        return s == null || s.allowTags;
    }

    // ---------------------------------------------------------------- helpers

    void Land()
    {
        clipT = 0f;
        SamplePose("stick", 0f);
        if (stickSound != null) oneShot.PlayOneShot(stickSound, 0.6f);
    }

    // back to a fresh, free tag: caps shut, gel round, prongs in, lights off, colliders on
    void Fresh()
    {
        anim.Stop();
        SamplePose("tamper", 0f); SamplePose("pulse", 0f); SamplePose("stick", 0f);
        health = maxHealth; pulseT = -1f; flashT = 9f; pending.Clear();
        anchor = null; hadAnchor = false; Surface = null;
        SetGlow(0f);
        foreach (var c in colliders) if (c != null) c.enabled = true;
    }

    void Anchor(Collider surface)
    {
        Surface = surface;
        anchor = surface != null ? surface.transform : null;
        hadAnchor = anchor != null;
        if (anchor == null) return;
        localPos = anchor.InverseTransformPoint(transform.position);
        localRot = Quaternion.Inverse(anchor.rotation) * transform.rotation;
    }

    void Show(bool on)
    {
        shown = on;
        foreach (var r in renderers) if (r != null) r.enabled = on;
        foreach (var c in colliders) if (c != null) c.enabled = on;
    }

    // k = 0 off, 1 as imported, above 1 the pulse flash
    void SetGlow(float k)
    {
        if (Mathf.Abs(k - lastGlow) < 0.01f) return;
        lastGlow = k;
        foreach (var g in glow)
        {
            var m = g.mat;
            if (m.HasProperty("emissiveFactor")) m.SetColor("emissiveFactor", g.factor * k);   // glTFast shaders
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", g.color * k);    // Standard / URP Lit
            if (k > 0f && g.emissive) m.EnableKeyword("_EMISSIVE"); else m.DisableKeyword("_EMISSIVE");
            if (k > 0f && g.emission) m.EnableKeyword("_EMISSION"); else m.DisableKeyword("_EMISSION");
        }
    }

    float Length(string clip) { var s = anim[clip]; return s != null ? s.length : 0f; }

    void SamplePose(string clip, float time)
    {
        var s = anim[clip]; if (s == null) return;
        s.enabled = true; s.time = time; s.weight = 1f; anim.Sample(); s.enabled = false;
    }
}

// The pack in Nox's hand or on his belt (the tracker-tags-pack prefab). TrackerTags adds it.
// tag_1 is the top of the stack and the next one out. With n left it shows tag_1..tag_n and pip_1..pip_n and moves
// the follower and spring. Clips are sampled by this script: equip 0.4 s (gate opens), eject 0.35 s.
[RequireComponent(typeof(Animation))]
public class TrackerTagsPack : MonoBehaviour
{
    public const int Capacity = 5;
    const float TopY = 0.055f, Pitch = 0.0092f, SpringBottom = 0.009f, SpringH0 = 0.03f;   // glTF metres, as the viewer
    public AudioClip ejectSound;
    public UnityEvent onEjected = new UnityEvent();   // tag_1 is out at EjectPoint (spawn the hand's tag there if you show one)

    public int Count { get; private set; }
    public bool Busy { get { return ejectT >= 0f; } }
    public bool Equipped { get; private set; }
    public Transform EjectPoint { get; private set; }   // fx_eject

    Animation anim;
    AudioSource oneShot;
    readonly Transform[] tags = new Transform[Capacity], pips = new Transform[Capacity];
    Transform follower, spring;
    float ejectT = -1f, equipT = -1f, holsterT = -1f;

    void Awake()
    {
        anim = GetComponent<Animation>();
        anim.playAutomatically = false; anim.Stop();   // glTFast would play equip on its own
        foreach (var t in GetComponentsInChildren<Transform>(true))
        {
            if (t.name == "follower") follower = t;
            else if (t.name == "spring") spring = t;
            else if (t.name == "fx_eject") EjectPoint = t;
            for (var i = 0; i < Capacity; i++)
            {
                if (t.name == "tag_" + (i + 1)) tags[i] = t;
                if (t.name == "pip_" + (i + 1)) pips[i] = t;
            }
        }
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f; oneShot.playOnAwake = false;
        SamplePose("eject", 0f); SamplePose("equip", Length("equip"));   // the rest pose: gate open, slide back
        Equipped = true;
        SetCount(Capacity);
    }

    public void SetCount(int n)
    {
        Count = Mathf.Clamp(n, 0, Capacity);
        if (!Busy) Apply(Count);
    }

    // the thumb slide pushes tag_1 out (0.35 s). False if empty or still ejecting. Count drops at once.
    public bool Eject()
    {
        if (Busy || Count <= 0) return false;
        if (!Equipped || equipT >= 0f || holsterT >= 0f) { equipT = holsterT = -1f; SamplePose("equip", Length("equip")); Equipped = true; }
        Count--; ejectT = 0f;
        if (ejectSound != null) oneShot.PlayOneShot(ejectSound, 0.5f);
        return true;
    }

    public void Equip() { if (!Busy) { holsterT = -1f; equipT = 0f; Equipped = true; } }       // gate opens
    public void Holster() { if (!Busy) { equipT = -1f; holsterT = 0f; Equipped = false; } }    // equip backwards: gate shuts

    void Update()
    {
        var dt = Time.deltaTime;
        if (ejectT >= 0f)
        {
            ejectT += dt;
            var len = Length("eject");
            SamplePose("eject", Mathf.Min(ejectT, len));
            if (ejectT >= len)
            {
                // tag_1 is out: put it back in the slot as the next tag and show one fewer
                ejectT = -1f;
                SamplePose("eject", 0f);
                Apply(Count);
                onEjected.Invoke();
            }
        }
        if (equipT >= 0f) { equipT += dt; SamplePose("equip", Mathf.Min(equipT, Length("equip"))); if (equipT >= Length("equip")) equipT = -1f; }
        if (holsterT >= 0f) { holsterT += dt; SamplePose("equip", Mathf.Max(0f, Length("equip") - holsterT)); if (holsterT >= Length("equip")) holsterT = -1f; }
    }

    void Apply(int n)
    {
        for (var i = 0; i < Capacity; i++)
        {
            if (tags[i] != null) tags[i].gameObject.SetActive(i < n);
            if (pips[i] != null) pips[i].gameObject.SetActive(i < n);
        }
        var fy = TopY - Mathf.Max(n - 1, 0) * Pitch;
        if (follower != null) { var p = follower.localPosition; p.y = fy; follower.localPosition = p; }
        if (spring != null) { var s = spring.localScale; s.y = (fy - SpringBottom) / SpringH0; spring.localScale = s; }
    }

    float Length(string clip) { var s = anim[clip]; return s != null ? s.length : 0f; }

    void SamplePose(string clip, float time)
    {
        var s = anim[clip]; if (s == null) return;
        s.enabled = true; s.time = time; s.weight = 1f; anim.Sample(); s.enabled = false;
    }
}

// On a soft floor (damping 0.4 by default: rugs, mats, sand) or anything tags must not stick to (allowTags off).
// ReportVibration looks for it under the step's point. If your footstep system already knows the floor, you can
// multiply the strength by TrackerTags.SoftFloor yourself instead.
public class TrackerSurface : MonoBehaviour
{
    [Range(0f, 1f)] public float damping = TrackerTags.SoftFloor;
    public bool allowTags = true;
}
