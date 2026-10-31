// N1CK's Nullfield: a thrown emitter that stands up and raises a 4 m bubble. Electronics read nothing inside it:
// drones, cameras, scanners and tracker tags skip whatever Nullfield.IsHidden() says is hidden. Eyes still see it.
//
// Nullfield goes on the root of the nullfield-emitter prefab (built from unity/nullfield-emitter.glb with
// Tools > Gunmodls; import with Animation: Legacy). It adds a Rigidbody, a BoxCollider and a SphereCollider on the
// core if the root has no collider.
//   Hold()              in the hand: folded, kinematic, colliders off, field off (the battery recharges)
//   Throw(velocity)     it tumbles; when it lands on a floor it plays 'deploy', stands up and switches the field on
//   PowerOn(), PowerOff(), Toggle()   the field; it needs 20 % charge to come on and drops by itself when empty
//   Fold()              picked up: plays 'deploy' backwards at double speed, then Hold()
//   Damage(amount), Kill()   shot: the bubble collapses, the mast drops, the legs give way, the lights go out
// Also in this file:
//   Nullfield.IsHidden(point), Nullfield.IsHidden(gameObject)   the rule every sensor uses
//   NullfieldCarrier   on N1CK: he is always hidden from digital sensors
//   NullfieldFeed      on a feed camera: draws the flat patch over the bubble and over carriers
// Unity adds a MonoBehaviour from the Inspector only when its file has the class's name. Add NullfieldCarrier and
// NullfieldFeed with AddComponent, or move each class into its own file (NullfieldCarrier.cs, NullfieldFeed.cs).
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Rendering;

[RequireComponent(typeof(Animation))]
public class Nullfield : MonoBehaviour
{
    [Header("Field")]
    public float radius = 4f;                    // m, around fx_bubble (the core when standing)
    public bool powerOnLanding = true;           // switch the field on when it stands up (and in Start when placed in the level)
    [Header("Battery")]
    public float fieldSeconds = 25f;             // full to empty with the field on
    public float rechargeSeconds = 50f;          // empty to full with the field off
    public float rechargeDelay = 2f;             // after the field goes off, before it recharges
    [Range(0f, 1f)] public float minChargeToStart = 0.2f;
    [Header("Health")]
    public float health = 1f;                    // Damage() takes it down; at 0 it dies (1 = any hit kills it)
    [Header("Sound")]
    public AudioClip throwSound, landSound, deploySound, fieldOnSound, fieldLoop, fieldOffSound, lowBatterySound, shotSound;
    public UnityEvent onLanded = new UnityEvent(), onDeployed = new UnityEvent(), onFieldOn = new UnityEvent(), onFieldOff = new UnityEvent(),
        onBatteryEmpty = new UnityEvent(), onKilled = new UnityEvent(), onFolded = new UnityEvent();

    public enum State { InHand, Thrown, Deploying, Ready, Folding, Dead }
    public State Current { get; private set; }
    public bool FieldOn { get; private set; }    // switched on; the bubble may still be growing
    public float Charge { get; private set; }    // 0..1
    public float Growth { get { return growth; } }                 // bubble size, 0..1 of radius
    public float CurrentRadius { get { return radius * growth; } }
    public bool Powered { get { return growth > 0.001f && Current != State.InHand && Current != State.Thrown; } }
    public Vector3 Centre { get { return bubble != null ? bubble.position : transform.TransformPoint(0f, CoreHeight, 0f); } }
    public Transform Core { get { return core; } }
    public Collider CoreCollider { get; private set; }
    public Renderer[] BubbleRenderers { get; private set; }

    // the same numbers as the viewer
    const float DeployOn = 0.6f;                 // deploy: the legs until here, then the power_on motion
    const float GrowStart = 0.45f, GrowEnd = 0.95f;   // power_on: the bubble grows
    const float Collapse = 0.25f, KillCollapse = 0.12f, Blend = 0.2f;
    const float KillMast = 2.5f;                 // killed with the mast up: power_off plays this fast alongside shutdown
    const float CoreHeight = 0.1134f;            // core centre above the ground when standing
    const float CoreDim = 0.16f;                 // core glow with the field off, as a share of full
    const int GaugeCount = 12;

    // ---------------------------------------------------------------- the rule for sensors

    static readonly List<Nullfield> all = new List<Nullfield>();
    public static IReadOnlyList<Nullfield> All { get { return all; } }

    // true if the point is inside any powered bubble
    public static bool IsHidden(Vector3 worldPoint)
    {
        for (var i = 0; i < all.Count; i++)
        {
            var f = all[i];
            if (!f.Powered) continue;
            var r = f.CurrentRadius;
            if ((worldPoint - f.Centre).sqrMagnitude <= r * r) return true;
        }
        return false;
    }

    // true if who (or a parent) carries an enabled NullfieldCarrier, or its position is inside a powered bubble
    public static bool IsHidden(GameObject who)
    {
        if (who == null) return false;
        for (var t = who.transform; t != null; t = t.parent)
        {
            var c = t.GetComponent<NullfieldCarrier>();
            if (c != null && c.enabled) return true;
        }
        return IsHidden(who.transform.position);
    }

    // ---------------------------------------------------------------- set up

    struct Glow { public Material mat; public Color factor, color; public bool emissive, emission; }

    Animation anim;
    AnimationState idle;
    Rigidbody rb;
    BoxCollider box;
    Transform bubble, core, stageA;
    readonly Transform[] gauge = new Transform[GaugeCount];
    readonly List<Glow> leds = new List<Glow>(), coreGlow = new List<Glow>();
    AudioSource oneShot, hum;
    float stateT, fieldT, offT = 99f, growth, growthFrom, spin, foldT, maxHealth, mastFoldedY, lastLed = -1f, lastCore = -1f;
    bool landOn, lowWarned, ownCollider;
    RigidbodyInterpolation interpolation;

    void Awake()
    {
        anim = GetComponent<Animation>();
        // glTFast imports every clip as a loop and plays the first one (deploy) on its own. The pose clips hold their
        // last frame until this script plays another; idle loops on its own layer at a speed this script sets.
        anim.playAutomatically = false; anim.Stop();
        foreach (var c in new[] { "deploy", "power_on", "power_off" })
            if (anim[c] != null) { anim[c].wrapMode = WrapMode.ClampForever; anim[c].layer = 1; }
        if (anim["shutdown"] != null) { anim["shutdown"].wrapMode = WrapMode.ClampForever; anim["shutdown"].layer = 2; }
        idle = anim["idle"];
        if (idle != null) { idle.wrapMode = WrapMode.Loop; idle.layer = 0; }
        foreach (var t in GetComponentsInChildren<Transform>(true))
        {
            if (t.name == "fx_bubble") bubble = t;
            else if (t.name == "core") core = t;
            else if (t.name == "stage_a") stageA = t;
            else if (t.name.StartsWith("gauge_") && t.name.Length == 8)
            {
                int i;
                if (int.TryParse(t.name.Substring(6), out i) && i >= 0 && i < GaugeCount) gauge[i] = t;
            }
        }
        BubbleRenderers = bubble != null ? bubble.GetComponentsInChildren<Renderer>(true) : new Renderer[0];
        foreach (var r in GetComponentsInChildren<Renderer>(true))
            foreach (var m in r.materials)
            {
                if (m.name.StartsWith("led_purple")) leds.Add(GlowOf(m));
                else if (m.name.StartsWith("core_glow")) coreGlow.Add(GlowOf(m));
            }
        rb = GetComponent<Rigidbody>();
        if (rb == null) { rb = gameObject.AddComponent<Rigidbody>(); rb.mass = 0.7f; rb.interpolation = RigidbodyInterpolation.Interpolate; }
        interpolation = rb.interpolation;
        box = GetComponent<BoxCollider>();
        if (GetComponent<Collider>() == null)
        {
            // one box for the body and a ball on the core; the per-part boxes from the prefab builder are turned off
            foreach (var c in GetComponentsInChildren<Collider>(true)) c.enabled = false;
            box = gameObject.AddComponent<BoxCollider>();
            ownCollider = true;
            if (core != null)
            {
                var s = core.gameObject.AddComponent<SphereCollider>();
                s.radius = 0.016f;
                CoreCollider = s;
            }
        }
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f;
        hum = gameObject.AddComponent<AudioSource>(); hum.spatialBlend = 1f; hum.loop = true; hum.volume = 0f;
        Charge = 1f; maxHealth = health;
        SamplePose("deploy", 0f);
        if (stageA != null) mastFoldedY = stageA.localPosition.y;
        // placed in the level: standing with the mast down; Start switches the field on
        Current = State.Ready; fieldT = 99f;
        StartIdle();
        SamplePose("deploy", DeployOn);
        SetBox(true);
        rb.isKinematic = true;
    }

    void Start()
    {
        if (Current == State.Ready && powerOnLanding) PowerOn();
    }

    void OnEnable() { if (!all.Contains(this)) all.Add(this); }
    void OnDisable() { all.Remove(this); }

    // ---------------------------------------------------------------- commands

    public void Hold()
    {
        Wake();
        Current = State.InHand;
        rb.isKinematic = true; rb.interpolation = RigidbodyInterpolation.None;   // it follows the hand it is parented to
        SetColliders(false);
    }

    public void Throw(Vector3 velocity)
    {
        Wake();
        Current = State.Thrown;
        rb.isKinematic = false; rb.interpolation = interpolation; rb.constraints = RigidbodyConstraints.None;
        SetColliders(true); SetBox(false);
        SetVelocity(velocity);
        rb.angularVelocity = Random.insideUnitSphere * 10f;
        Play(throwSound);
    }

    public bool PowerOn()
    {
        if (Current != State.Ready || FieldOn) return false;
        if (Charge < minChargeToStart) { Play(lowBatterySound); return false; }
        growthFrom = growth; fieldT = 0f;
        FieldOn = true;
        PlayClip("power_on", 1f, 0f, Blend);
        Play(fieldOnSound);
        onFieldOn.Invoke();
        return true;
    }

    public void PowerOff() { SwitchOff(false); }

    public void Toggle() { if (FieldOn) PowerOff(); else PowerOn(); }

    public void Fold()
    {
        if (Current != State.Ready) return;
        // from the top of deploy if the mast is (still) up, else from where the legs finished
        var start = MastUp() ? Length("deploy") : DeployOn;
        if (FieldOn) SwitchOff(false);
        Current = State.Folding;
        foldT = start / 2f;
        PlayClip("deploy", -2f, start, 0.15f);
    }

    public void Damage(float amount)
    {
        if (Current == State.Dead || Current == State.InHand) return;
        health -= amount;
        if (health <= 0f) Kill();
    }

    public void Kill()
    {
        if (Current == State.Dead || Current == State.InHand) return;
        var mast = MastUp();
        growthFrom = growth; FieldOn = false; fieldT = 0f;
        Current = State.Dead; stateT = 0f;
        if (anim["shutdown"] != null) { anim["shutdown"].speed = 1f; anim.CrossFade("shutdown", 0.15f, PlayMode.StopSameLayer); }
        if (mast) PlayClip("power_off", KillMast, 0f, 0.1f);
        hum.Stop();
        Play(shotSound);
        onKilled.Invoke();
    }

    // ---------------------------------------------------------------- running

    void OnCollisionEnter(Collision c) { TryLand(c); }
    void OnCollisionStay(Collision c) { TryLand(c); }

    void TryLand(Collision c)
    {
        // contacts in the first 0.2 s after Throw() don't count: one thrown from the floor still touches it
        if (Current != State.Thrown || stateT < 0.2f) return;
        foreach (var p in c.contacts)
        {
            if (p.normal.y < 0.6f) continue;
            // landed: sit upright on the belly, keep the heading, stay put
            var fwd = Vector3.ProjectOnPlane(transform.forward, Vector3.up);
            if (fwd.sqrMagnitude < 1e-4f) fwd = Vector3.ProjectOnPlane(transform.up, Vector3.up);
            SetVelocity(Vector3.zero); rb.angularVelocity = Vector3.zero;
            rb.isKinematic = true;
            transform.SetPositionAndRotation(new Vector3(transform.position.x, p.point.y, transform.position.z), Quaternion.LookRotation(fwd.normalized, Vector3.up));
            SetBox(true);
            Current = State.Deploying; stateT = 0f;
            landOn = powerOnLanding && Charge >= minChargeToStart;
            PlayClip("deploy", 1f, 0f, 0f);
            Play(landSound); Play(deploySound);
            onLanded.Invoke();
            return;
        }
    }

    void Update()
    {
        var dt = Time.deltaTime;
        stateT += dt; fieldT += dt;
        if (Current == State.Deploying)
        {
            if (landOn && !FieldOn && stateT >= DeployOn)
            {
                FieldOn = true; fieldT = stateT - DeployOn; growthFrom = 0f;
                Play(fieldOnSound);
                onFieldOn.Invoke();
            }
            if (!landOn && stateT >= DeployOn) { SamplePose("deploy", DeployOn); anim.Stop("deploy"); }   // stands up, mast stays down
            if (stateT >= (landOn ? Length("deploy") : DeployOn)) { Current = State.Ready; onDeployed.Invoke(); }
        }
        else if (Current == State.Folding)
        {
            foldT -= dt;
            if (foldT <= 0f) { Hold(); onFolded.Invoke(); return; }
        }

        // battery: drains while the field is on, recharges after a pause while it is off
        if (FieldOn)
        {
            offT = 0f;
            Charge -= dt / Mathf.Max(0.01f, fieldSeconds);
            if (Charge <= 0f) { Charge = 0f; SwitchOff(true); }
            else if (Charge < minChargeToStart && !lowWarned) { lowWarned = true; Play(lowBatterySound); }
        }
        else if (Current != State.Dead)
        {
            offT += dt;
            if (offT > rechargeDelay) Charge = Mathf.Min(1f, Charge + dt / Mathf.Max(0.01f, rechargeSeconds));
        }
        if (Charge > minChargeToStart + 0.1f) lowWarned = false;

        // bubble size (as the clips draw it)
        if (Current == State.InHand || Current == State.Thrown) growth = 0f;
        else if (Current == State.Dead) { var k = 1f - Mathf.Clamp01(stateT / KillCollapse); growth = growthFrom * k * k; }
        else if (FieldOn)
        {
            var u = 1f - Mathf.Clamp01((fieldT - GrowStart) / (GrowEnd - GrowStart));
            growth = Mathf.Lerp(growthFrom, 1f - u * u * u, Mathf.SmoothStep(0f, 1f, fieldT / Blend));
        }
        else { var c = Mathf.Clamp01(fieldT / Collapse); growth = growthFrom * (1f - c * c); }

        // rings: idle runs at a speed that ramps over a second (a quarter second when killed)
        spin = Mathf.MoveTowards(spin, FieldOn ? 1f : 0f, dt * (Current == State.Dead ? 4f : 1f));
        if (idle != null) idle.speed = spin;

        // hum
        if (hum.clip != fieldLoop) { hum.Stop(); hum.clip = fieldLoop; }
        if (hum.clip != null && Powered)
        {
            if (!hum.isPlaying) hum.Play();
            hum.volume = 0.35f * growth; hum.pitch = 0.85f + 0.15f * growth;
        }
        else if (hum.isPlaying) hum.Stop();
    }

    void LateUpdate()
    {
        // after the Animation update: the bubble's scale is the current radius, whatever the clip says
        if (bubble != null)
        {
            bubble.localScale = Vector3.one * Mathf.Max(1e-4f, radius * growth);
            foreach (var r in BubbleRenderers) if (r != null) r.enabled = growth > 0.001f;
        }
        // gauge: segment i is lit while charge > i/12; the last one blinks when low with the field on
        var dead = Current == State.Dead;
        var lit = dead ? 0 : Mathf.CeilToInt(Charge * GaugeCount - 1e-4f);
        var blink = FieldOn && Charge < minChargeToStart && Mathf.Sin(Time.time * 8f) < 0f;
        for (var i = 0; i < GaugeCount; i++)
            if (gauge[i] != null) gauge[i].localScale = Vector3.one * (i < lit && !(blink && i == lit - 1) ? 1f : 1e-4f);
        // lights: out when dead (the core flashes first); the core glows with the bubble
        var led = dead ? Mathf.Clamp01(1f - stateT / 0.5f) : 1f;
        var coreK = dead ? 1.6f * Mathf.Clamp01(1f - stateT / 0.35f) : CoreDim + (1f - CoreDim) * growth * (0.88f + 0.12f * Mathf.Sin(Time.time * 2f * Mathf.PI));
        if (Mathf.Abs(led - lastLed) > 0.01f) { SetGlow(leds, led); lastLed = led; }
        if (Mathf.Abs(coreK - lastCore) > 0.01f) { SetGlow(coreGlow, coreK); lastCore = coreK; }
    }

    // ---------------------------------------------------------------- helpers

    void SwitchOff(bool empty)
    {
        if (!FieldOn) return;
        growthFrom = growth; fieldT = 0f; offT = 0f;
        FieldOn = false;
        if (Current == State.Deploying) { Current = State.Ready; onDeployed.Invoke(); }   // the legs finish before the field starts
        PlayClip("power_off", 1f, 0f, Blend);
        Play(fieldOffSound);
        if (empty) Play(lowBatterySound);
        onFieldOff.Invoke();
        if (empty) onBatteryEmpty.Invoke();
    }

    // back to a fresh emitter, folded: undoes Kill() and stops whatever it was doing (the charge stays)
    void Wake()
    {
        stateT = 0f; fieldT = 99f; growth = growthFrom = spin = 0f;
        FieldOn = false; health = maxHealth;
        anim.Stop();
        StartIdle();
        SamplePose("deploy", 0f);   // folded: legs up, mast down, bubble hidden (also undoes the shutdown sag)
        lastLed = lastCore = -1f;
        hum.Stop();
    }

    void StartIdle()
    {
        if (idle == null) return;
        anim.Play("idle", PlayMode.StopSameLayer);
        idle.time = 0f; idle.speed = 0f; idle.weight = 1f;
    }

    void PlayClip(string clip, float speed, float time, float fade)
    {
        var s = anim[clip]; if (s == null) return;
        s.speed = speed;
        if (fade > 0f) anim.CrossFade(clip, fade, PlayMode.StopSameLayer); else anim.Play(clip, PlayMode.StopSameLayer);
        s.time = time;
    }

    void SamplePose(string clip, float time)
    {
        var s = anim[clip]; if (s == null) return;
        var was = s.enabled;
        s.enabled = true; s.time = time; s.weight = 1f; anim.Sample(); s.enabled = was;
    }

    float Length(string clip) { var s = anim[clip]; return s != null ? s.length : 0f; }

    bool MastUp() { return stageA != null && stageA.localPosition.y > mastFoldedY + 0.002f; }

    void SetBox(bool standing)
    {
        if (!ownCollider || box == null) return;
        // folded puck while thrown; standing: the puck and legs (the core has its own ball)
        box.center = standing ? new Vector3(0f, 0.048f, 0f) : new Vector3(0f, 0.026f, 0f);
        box.size = standing ? new Vector3(0.15f, 0.075f, 0.15f) : new Vector3(0.132f, 0.052f, 0.132f);
    }

    void SetColliders(bool on)
    {
        if (box != null) box.enabled = on;
        if (CoreCollider != null) CoreCollider.enabled = on;
    }

    void Play(AudioClip c) { if (c != null) oneShot.PlayOneShot(c); }

    static Glow GlowOf(Material m)
    {
        return new Glow
        {
            mat = m,
            factor = m.HasProperty("emissiveFactor") ? m.GetColor("emissiveFactor") : Color.black,
            color = m.HasProperty("_EmissionColor") ? m.GetColor("_EmissionColor") : Color.black,
            emissive = m.IsKeywordEnabled("_EMISSIVE"),
            emission = m.IsKeywordEnabled("_EMISSION"),
        };
    }

    static void SetGlow(List<Glow> list, float k)
    {
        foreach (var g in list)
        {
            var m = g.mat;
            if (m.HasProperty("emissiveFactor")) m.SetColor("emissiveFactor", g.factor * k);   // glTFast shaders
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", g.color * k);    // Standard / URP Lit
            if (k > 0f && g.emissive) m.EnableKeyword("_EMISSIVE"); else m.DisableKeyword("_EMISSIVE");
            if (k > 0f && g.emission) m.EnableKeyword("_EMISSION"); else m.DisableKeyword("_EMISSION");
        }
    }

#if UNITY_6000_0_OR_NEWER
    void SetVelocity(Vector3 v) { if (!rb.isKinematic) rb.linearVelocity = v; }
#else
    void SetVelocity(Vector3 v) { if (!rb.isKinematic) rb.velocity = v; }
#endif
}

// Put on N1CK (or anything that should always be invisible to sensors). Nullfield.IsHidden(gameObject) is true for it
// and its children while this component is enabled.
public class NullfieldCarrier : MonoBehaviour
{
    static readonly List<NullfieldCarrier> all = new List<NullfieldCarrier>();
    public static IReadOnlyList<NullfieldCarrier> All { get { return all; } }

    void OnEnable() { if (!all.Contains(this)) all.Add(this); }
    void OnDisable() { all.Remove(this); }
}

// Put on a feed camera (a drone's, a security camera's). While that camera renders:
//   - every powered bubble is drawn as an opaque, unlit, flat sphere: whatever the camera would see inside or
//     behind it becomes one clean patch (the tell);
//   - carriers (and hidden objects in alsoCheck) are drawn in the patch colour, or not at all;
//   - the bubble's own see-through skin is not drawn.
// Other cameras are not affected. It adds no noise: if your feed adds grain in post, the patch gets it too.
[RequireComponent(typeof(Camera))]
public class NullfieldFeed : MonoBehaviour
{
    public Color patchColor = new Color(0.36f, 0.37f, 0.39f);
    public Material patchMaterial;               // optional: any opaque, unlit, double-sided material; made from Hidden/Internal-Colored if empty
    public bool carriersAsPatch = true;          // true: N1CK shows as a flat silhouette (as in the viewer); false: he is not drawn
    public List<GameObject> alsoCheck = new List<GameObject>();   // drawn whole as patch while Nullfield.IsHidden() says so (players, gadgets)
    public int patchLayer = 0;                   // layer the patch spheres are drawn on; it must be in the camera's culling mask

    Camera cam;
    Material mat;
    static Mesh sphere;
    readonly List<Renderer> swapped = new List<Renderer>(), turnedOff = new List<Renderer>(), found = new List<Renderer>();
    readonly List<Material[]> saved = new List<Material[]>();
    readonly HashSet<Renderer> seen = new HashSet<Renderer>();
    readonly Dictionary<int, Material[]> patchArrays = new Dictionary<int, Material[]>();

    void OnEnable()
    {
        cam = GetComponent<Camera>();
        Camera.onPreCull += OnPreCullAny;
        Camera.onPostRender += OnPostRenderAny;
        RenderPipelineManager.beginCameraRendering += OnBeginCamera;
        RenderPipelineManager.endCameraRendering += OnEndCamera;
    }

    void OnDisable()
    {
        Camera.onPreCull -= OnPreCullAny;
        Camera.onPostRender -= OnPostRenderAny;
        RenderPipelineManager.beginCameraRendering -= OnBeginCamera;
        RenderPipelineManager.endCameraRendering -= OnEndCamera;
        Restore();
    }

    void LateUpdate()
    {
        if (cam == null || !cam.enabled) return;
        var m = PatchMaterial(); if (m == null) return;
        var fields = Nullfield.All;
        for (var i = 0; i < fields.Count; i++)
        {
            var f = fields[i];
            if (!f.Powered) continue;
            Graphics.DrawMesh(Sphere(), Matrix4x4.TRS(f.Centre, Quaternion.identity, Vector3.one * f.CurrentRadius), m, patchLayer, cam, 0, null, false, false);
        }
    }

    void OnPreCullAny(Camera c) { if (c == cam) Hide(); }                                   // built-in pipeline
    void OnPostRenderAny(Camera c) { if (c == cam) Restore(); }
    void OnBeginCamera(ScriptableRenderContext ctx, Camera c) { if (c == cam) Hide(); }      // URP and other scriptable pipelines
    void OnEndCamera(ScriptableRenderContext ctx, Camera c) { if (c == cam) Restore(); }

    void Hide()
    {
        Restore();
        var fields = Nullfield.All;
        for (var i = 0; i < fields.Count; i++)
            foreach (var r in fields[i].BubbleRenderers)
                if (r != null && r.enabled) { r.enabled = false; turnedOff.Add(r); }
        var m = PatchMaterial();
        seen.Clear();
        var carriers = NullfieldCarrier.All;
        for (var i = 0; i < carriers.Count; i++) Patch(carriers[i].gameObject, m);
        foreach (var go in alsoCheck) if (go != null && Nullfield.IsHidden(go)) Patch(go, m);
    }

    void Patch(GameObject go, Material m)
    {
        go.GetComponentsInChildren(false, found);
        foreach (var r in found)
        {
            if (!r.enabled || !seen.Add(r)) continue;
            if (carriersAsPatch && m != null)
            {
                var mats = r.sharedMaterials;
                saved.Add(mats); swapped.Add(r);
                r.sharedMaterials = PatchArray(mats.Length, m);
            }
            else { r.enabled = false; turnedOff.Add(r); }
        }
    }

    void Restore()
    {
        for (var i = 0; i < swapped.Count; i++) if (swapped[i] != null) swapped[i].sharedMaterials = saved[i];
        for (var i = 0; i < turnedOff.Count; i++) if (turnedOff[i] != null) turnedOff[i].enabled = true;
        swapped.Clear(); saved.Clear(); turnedOff.Clear();
    }

    Material[] PatchArray(int n, Material m)
    {
        Material[] a;
        if (!patchArrays.TryGetValue(n, out a) || (n > 0 && a[0] != m))
        {
            a = new Material[n];
            for (var i = 0; i < n; i++) a[i] = m;
            patchArrays[n] = a;
        }
        return a;
    }

    Material PatchMaterial()
    {
        if (patchMaterial != null) return patchMaterial;
        if (mat == null)
        {
            var sh = Shader.Find("Hidden/Internal-Colored");
            if (sh == null) { Debug.LogWarning("NullfieldFeed: Hidden/Internal-Colored not found, assign patchMaterial"); enabled = false; return null; }
            mat = new Material(sh) { hideFlags = HideFlags.HideAndDontSave, name = "nullfield_patch" };
            mat.SetInt("_SrcBlend", (int)BlendMode.One);
            mat.SetInt("_DstBlend", (int)BlendMode.Zero);
            mat.SetInt("_Cull", (int)CullMode.Off);
            mat.SetInt("_ZWrite", 1);
            mat.SetInt("_ZTest", (int)CompareFunction.LessEqual);
            mat.renderQueue = (int)RenderQueue.Geometry;
        }
        mat.color = patchColor;
        return mat;
    }

    // a unit sphere with faces both ways, so it also works from inside a bubble and with any culling
    static Mesh Sphere()
    {
        if (sphere != null) return sphere;
        const int lon = 32, lat = 16;
        var v = new List<Vector3>();
        var t = new List<int>();
        for (var y = 0; y <= lat; y++)
            for (var x = 0; x <= lon; x++)
            {
                float a = Mathf.PI * y / lat, b = 2f * Mathf.PI * x / lon;
                v.Add(new Vector3(Mathf.Sin(a) * Mathf.Cos(b), Mathf.Cos(a), Mathf.Sin(a) * Mathf.Sin(b)));
            }
        for (var y = 0; y < lat; y++)
            for (var x = 0; x < lon; x++)
            {
                int i = y * (lon + 1) + x, j = i + lon + 1;
                t.Add(i); t.Add(i + 1); t.Add(j); t.Add(i + 1); t.Add(j + 1); t.Add(j);
                t.Add(i); t.Add(j); t.Add(i + 1); t.Add(i + 1); t.Add(j); t.Add(j + 1);
            }
        var c = new Color32[v.Count];
        for (var k = 0; k < c.Length; k++) c[k] = new Color32(255, 255, 255, 255);
        sphere = new Mesh { name = "nullfield_patch" };
        sphere.SetVertices(v);
        sphere.SetTriangles(t, 0);
        sphere.colors32 = c;
        sphere.RecalculateBounds();
        return sphere;
    }
}
