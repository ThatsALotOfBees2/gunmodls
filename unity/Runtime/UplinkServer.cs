// The uplink server: the objective (the "bomb"). An ordinary 18U rack cabinet; attackers plug an UplinkLaptop
// into its front data port and pull its data. Put it on the root of the uplink-server prefab (built from
// unity/uplink-server.glb with Tools > Gunmodls; import with Animation: Legacy). Two per site.
//   CanAccept(laptop)             true when this server is idle, free, enabled and the laptop is in cable reach
//   CanAccept(laptop, position)   the same for a laptop that would stand at position
//   InReach(position)             the cable reach rule alone (3 m, height, in front of the server)
//   FindPlantable(laptop, pos)    static: the nearest server that would accept that laptop at pos
//   ResetServer()                 new round: door shut, idle, no laptop
//   Port                          the uplink_port locator; the laptop's plug sits exactly on it when connected
// The laptop drives the rest itself (Claim, BeginLink, BeginUpload, SetProgress, Complete, Abort, Close, Release); call
// those only if you run your own laptop logic. Abort means the laptop was disabled (the defenders' win: abort sound,
// onAborted); Close is a plant cancelled after the door opened, or a pick-up after Complete (no sound, no event).
// States: Idle (fans, LEDs ticking) -> Linking (door opens, port shutter flips; handshake) -> Uploading (fans
// faster, drive LEDs race, status strip alarm red) -> Complete; or -> Aborted (shutter snaps, door shuts) -> Idle.
// Aborted is also used when the door closes after a cancelled plant or a pick-up (Close).
// Clips (glTFast imports them all as loops and auto-plays the first; Awake fixes that): idle and upload loop on
// layer 0 (cross-fade 0.4 s); link, complete and abort hold their last frame on layer 1.
// Lights: the status_glow material (header light bars and the port ring) is purple, breathing while idle, pulsing
// 3 Hz while linking, alarm red pulsing 1.5 Hz while uploading, steady red on complete, back to purple over 0.5 s
// on abort. The drive and link LEDs blink by their clips (scale keys) and stay purple unless tintDriveLeds is on.
// Colours are written in linear terms into emissiveFactor (glTFast shaders) and _EmissionColor (Standard / URP
// Lit) on material copies owned by this component.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

[RequireComponent(typeof(Animation))]
public class UplinkServer : MonoBehaviour
{
    [Header("Rules")]
    public float cableReach = 3f;                // m, horizontal, laptop root to uplink_port
    public float maxHeightDifference = 0.5f;     // m, laptop root to uplink_port
    public float minFrontDistance = 0.2f;        // m, the laptop must stand this far in front of the port
    public bool interactable = true;             // false: refuses every laptop (site already won, and so on)
    [Header("Lights")]
    public Color idleColor = new Color(0.541f, 0.302f, 1f);     // #8a4dff
    public Color alarmColor = new Color(1f, 0.165f, 0.227f);    // #ff2a3a
    [Range(0f, 4f)] public float glowIntensity = 1f;            // 1 = as exported
    public bool tintDriveLeds = false;           // true: the drive and link LEDs turn alarm red with the strip
    [Header("Animation")]
    public float loopFade = 0.4f;                // idle <-> upload
    public float completeFade = 0.25f;
    [Header("Sound")]
    public AudioClip openSound, closeSound, alarmSound, abortSound;
    public AudioClip humLoop;                    // fans and power supplies, looped all round (a little higher while uploading)
    public float alarmInterval = 1.5f;           // s between alarm chirps while uploading
    public UnityEvent onLinked = new UnityEvent(), onUploadStarted = new UnityEvent(),
        onCompleted = new UnityEvent(), onAborted = new UnityEvent();

    public enum State { Idle, Linking, Uploading, Complete, Aborted }
    public State Current { get; private set; }
    public UplinkLaptop Laptop { get; private set; }     // the laptop planted (or being planted) here
    public float UploadProgress { get; private set; }    // 0..1, as the laptop reports it
    public Transform Port { get { return port; } }       // uplink_port: +Z points out of the socket
    public Transform Door { get { return door; } }
    public Transform StatusStrip { get { return strip; } }
    public bool Busy { get { return Laptop != null || Current != State.Idle; } }
    // the server's front (+Z in the glb), flat
    public Vector3 Front
    {
        get
        {
            var f = port != null ? port.forward : transform.forward;
            f.y = 0f;
            return f.sqrMagnitude > 1e-6f ? f.normalized : Vector3.forward;
        }
    }

    public event Action<UplinkServer, State, State> OnStateChanged;   // server, from, to

    // ---------------------------------------------------------------- every server, for range queries

    static readonly List<UplinkServer> all = new List<UplinkServer>();
    public static IReadOnlyList<UplinkServer> All { get { return all; } }

    // the nearest server (by distance to its port) that would take this laptop standing at position; null if none
    public static UplinkServer FindPlantable(UplinkLaptop laptop, Vector3 position)
    {
        UplinkServer best = null;
        var bestD = float.MaxValue;
        for (var i = 0; i < all.Count; i++)
        {
            var s = all[i];
            if (s == null || !s.CanAccept(laptop, position)) continue;
            var d = s.DistanceToPort(position);
            if (d < bestD) { bestD = d; best = s; }
        }
        return best;
    }

    // ---------------------------------------------------------------- set up

    struct Glow { public Material mat; public float factorMax, colorMax; }

    const float AbortBlend = 0.5f;               // s, red back to purple on abort
    const float LinkReverseSpeed = 1.6f;         // an unfinished link runs back at this speed on abort

    Animation anim;
    Transform port, door, strip;
    readonly List<Glow> statusGlow = new List<Glow>(), driveGlow = new List<Glow>();
    readonly List<Material> owned = new List<Material>();
    AudioSource oneShot, humSource;
    float stateT, alarmT, now, shutLength;
    Color abortFrom, lastStatus = new Color(-1f, 0f, 0f, 0f), lastDrive = new Color(-1f, 0f, 0f, 0f);
    bool loopsStopped;

    void Awake()
    {
        anim = GetComponent<Animation>();
        // glTFast imports every clip as a loop and plays the first one (idle) on its own
        anim.playAutomatically = false; anim.Stop();
        Setup("idle", WrapMode.Loop, 0);
        Setup("upload", WrapMode.Loop, 0);
        Setup("link", WrapMode.ClampForever, 1);
        Setup("complete", WrapMode.ClampForever, 1);
        Setup("abort", WrapMode.ClampForever, 1);
        foreach (var t in GetComponentsInChildren<Transform>(true))
        {
            if (t.name == "uplink_port") port = t;
            else if (t.name == "door") door = t;
            else if (t.name == "status_strip") strip = t;
        }
        if (port == null) Debug.LogWarning("UplinkServer: no uplink_port node under " + name, this);
        CollectMaterials();
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f; oneShot.playOnAwake = false;
        humSource = gameObject.AddComponent<AudioSource>(); humSource.spatialBlend = 1f; humSource.loop = true; humSource.playOnAwake = false;
        if (humLoop != null) { humSource.clip = humLoop; humSource.Play(); }
        StartIdle();
    }

    void OnEnable() { if (!all.Contains(this)) all.Add(this); }
    void OnDisable() { all.Remove(this); }
    void OnDestroy() { foreach (var m in owned) if (m != null) Destroy(m); }

    void Setup(string clip, WrapMode wrap, int layer)
    {
        var s = anim[clip]; if (s == null) return;
        s.wrapMode = wrap; s.layer = layer;
    }

    // one material copy per imported glow material, shared by every renderer (and LOD) that used it
    void CollectMaterials()
    {
        var copies = new Dictionary<Material, Material>();
        foreach (var r in GetComponentsInChildren<Renderer>(true))
        {
            var mats = r.sharedMaterials;
            var changed = false;
            for (var i = 0; i < mats.Length; i++)
            {
                var m = mats[i];
                if (m == null) continue;
                var kind = NameIs(m.name, "status_glow") ? 1 : NameIs(m.name, "drive_led") ? 2 : 0;
                if (kind == 0) continue;
                Material copy;
                if (!copies.TryGetValue(m, out copy))
                {
                    copy = new Material(m) { name = m.name };
                    copies[m] = copy; owned.Add(copy);
                    copy.EnableKeyword("_EMISSIVE"); copy.EnableKeyword("_EMISSION");
                    var g = new Glow { mat = copy, factorMax = MaxOf(ReadLinear(copy, "emissiveFactor")), colorMax = MaxOf(ReadLinear(copy, "_EmissionColor")) };
                    if (kind == 1) statusGlow.Add(g); else driveGlow.Add(g);
                }
                mats[i] = copy;
                changed = true;
            }
            if (changed) r.sharedMaterials = mats;
        }
    }

    // ---------------------------------------------------------------- rules

    public float DistanceToPort(Vector3 position)
    {
        if (port == null) return float.MaxValue;
        var d = position - port.position; d.y = 0f;
        return d.magnitude;
    }

    // cable reach: within cableReach (flat) of the port, within maxHeightDifference, and in front of the server
    public bool InReach(Vector3 position)
    {
        if (port == null) return false;
        var d = position - port.position;
        if (Mathf.Abs(d.y) > maxHeightDifference) return false;
        if (Vector3.Dot(d, Front) < minFrontDistance) return false;
        d.y = 0f;
        return d.magnitude <= cableReach;
    }

    public bool CanAccept(UplinkLaptop laptop)
    {
        return laptop != null && CanAccept(laptop, laptop.transform.position);
    }

    public bool CanAccept(UplinkLaptop laptop, Vector3 position)
    {
        if (!isActiveAndEnabled || !interactable || port == null) return false;
        if (Current != State.Idle) return false;
        if (Laptop != null && Laptop != laptop) return false;   // one laptop per server
        return InReach(position);
    }

    // ---------------------------------------------------------------- driven by the laptop

    // reserve this server for a laptop that starts planting at position
    public bool Claim(UplinkLaptop laptop, Vector3 position)
    {
        if (laptop == null || !CanAccept(laptop, position)) return false;
        Laptop = laptop;
        return true;
    }

    public void Release(UplinkLaptop laptop)
    {
        if (laptop != null && Laptop == laptop) Laptop = null;
    }

    // plant 2.4 s: handle unlatches, door swings open, port shutter flips open
    public void BeginLink(UplinkLaptop laptop)
    {
        if (laptop == null || Laptop != laptop || Current != State.Idle) return;
        PlayLayer1("link", 0f);
        Play(openSound);
        SetState(State.Linking);
        onLinked.Invoke();
    }

    // plant done: fans faster, the drive LEDs race, the strip turns alarm red
    public void BeginUpload(UplinkLaptop laptop)
    {
        if (laptop == null || Laptop != laptop || Current != State.Linking) return;
        UploadProgress = 0f;
        anim.CrossFade("upload", loopFade, PlayMode.StopSameLayer);
        alarmT = 0f;
        SetState(State.Uploading);
        onUploadStarted.Invoke();
    }

    public void SetProgress(UplinkLaptop laptop, float progress)
    {
        if (laptop != null && Laptop == laptop) UploadProgress = Mathf.Clamp01(progress);
    }

    // upload done: a last LED sweep, fans slow, the port lock clicks
    public void Complete(UplinkLaptop laptop)
    {
        if (laptop == null || Laptop != laptop || Current != State.Uploading) return;
        UploadProgress = 1f;
        // complete keys the loop set too, so on layer 1 at full weight it covers the layer-0 loop
        PlayLayer1("complete", completeFade);
        loopsStopped = false;
        SetState(State.Complete);
        onCompleted.Invoke();
    }

    // the laptop was disabled (the defenders' win): the plug is out, the shutter snaps shut, the door closes, the
    // power-down sound plays and onAborted fires; Idle again when the clip ends. Before the door opened it only
    // frees the server. If link has not finished yet, link runs back (1.6x) instead of abort, as the viewer does.
    public void Abort(UplinkLaptop laptop) { Shut(laptop, true); }

    // the plant was cancelled after the door opened, or the attackers picked the laptop up after Complete: the door
    // closes the same way, without the power-down sound and without onAborted
    public void Close(UplinkLaptop laptop) { Shut(laptop, false); }

    void Shut(UplinkLaptop laptop, bool aborted)
    {
        if (laptop == null || Laptop != laptop) return;
        Laptop = null;
        if (Current != State.Linking && Current != State.Uploading && Current != State.Complete) return;
        abortFrom = StatusColor(out _);
        anim.CrossFade("idle", loopFade, PlayMode.StopSameLayer);
        var ls = anim["link"];
        if (Current == State.Linking && ls != null && ls.enabled && ls.time < ls.length)
        {
            ls.speed = -LinkReverseSpeed;
            shutLength = ls.time / LinkReverseSpeed;
        }
        else
        {
            PlayLayer1("abort", 0.1f);
            shutLength = Length("abort");
        }
        Play(closeSound);
        if (aborted) Play(abortSound);
        UploadProgress = 0f;
        SetState(State.Aborted);
        if (aborted) onAborted.Invoke();
    }

    // new round: door shut, idle, no laptop
    public void ResetServer()
    {
        Laptop = null; UploadProgress = 0f;
        StartIdle();
        SetState(State.Idle);
    }

    // ---------------------------------------------------------------- running

    void Update()
    {
        var dt = Time.deltaTime;
        stateT += dt; now += dt;
        if (Current == State.Aborted && stateT >= shutLength)
        {
            // a link run backwards stops exactly on its first frame (door shut), so nothing relies on clamping
            var ls = anim["link"];
            if (ls != null && ls.speed < 0f) { ls.speed = 0f; ls.time = 0f; anim.Sample(); }
            SetState(State.Idle);
        }
        if (Current == State.Complete && !loopsStopped && stateT >= completeFade)
        {
            loopsStopped = true;
            anim.Stop("upload"); anim.Stop("idle");
        }
        if (humSource.clip != humLoop) { humSource.clip = humLoop; if (humLoop != null) humSource.Play(); else humSource.Stop(); }
        humSource.pitch = Current == State.Uploading ? 1.08f : 1f;
        if (Current == State.Uploading)
        {
            alarmT -= dt;
            if (alarmT <= 0f) { Play(alarmSound); alarmT += Mathf.Max(0.1f, alarmInterval); }
        }
        float k;
        var c = StatusColor(out k);
        var status = c * k;
        if (Changed(status, lastStatus)) { WriteGlow(statusGlow, c, k * glowIntensity); lastStatus = status; }
        var drive = tintDriveLeds && (Current == State.Uploading || Current == State.Complete) ? alarmColor : idleColor;
        if (Changed(drive, lastDrive)) { WriteGlow(driveGlow, drive, glowIntensity); lastDrive = drive; }
    }

    // the strip's hue and level now (DESIGN: idle breathing, link 3 Hz, upload red 1.5 Hz 40..100 %, complete red)
    Color StatusColor(out float k)
    {
        switch (Current)
        {
            case State.Linking:
                k = 0.6f + 0.4f * Mathf.Sin(now * Mathf.PI * 6f);
                return idleColor;
            case State.Uploading:
                k = 0.4f + 0.6f * (0.5f + 0.5f * Mathf.Sin(now * Mathf.PI * 3f));
                return alarmColor;
            case State.Complete:
                k = 1f;
                return alarmColor;
            case State.Aborted:
                {
                    var u = Mathf.Clamp01(stateT / AbortBlend);
                    k = 0.85f + 0.15f * Mathf.Sin(now * Mathf.PI * 0.5f);
                    return Color.Lerp(abortFrom, idleColor, u);
                }
            default:
                k = 0.85f + 0.15f * Mathf.Sin(now * Mathf.PI * 0.5f);
                return idleColor;
        }
    }

    // ---------------------------------------------------------------- helpers

    void SetState(State s)
    {
        if (s == Current) { stateT = 0f; return; }
        var was = Current;
        Current = s; stateT = 0f;
        if (OnStateChanged != null) OnStateChanged(this, was, s);
    }

    // closed (abort ends with the door shut and relatched, the rest pose) and idle at 0
    void StartIdle()
    {
        anim.Stop();
        SamplePose("abort", Length("abort"));
        SamplePose("idle", 0f);
        var s = anim["idle"];
        if (s != null) { anim.Play("idle", PlayMode.StopSameLayer); s.time = 0f; s.speed = 1f; }
        loopsStopped = false;
    }

    void PlayLayer1(string clip, float fade)
    {
        var s = anim[clip]; if (s == null) return;
        s.speed = 1f;
        var from = false;
        foreach (AnimationState o in anim)
            if (o != s && o.layer == s.layer && o.enabled && o.weight > 0f) { from = true; break; }
        if (fade > 0f && from) anim.CrossFade(clip, fade, PlayMode.StopSameLayer); else anim.Play(clip, PlayMode.StopSameLayer);
        s.time = 0f;
    }

    void SamplePose(string clip, float time)
    {
        var s = anim[clip]; if (s == null) return;
        var was = s.enabled;
        s.enabled = true; s.time = time; s.weight = 1f; anim.Sample(); s.enabled = was;
    }

    float Length(string clip) { var s = anim[clip]; return s != null ? s.length : 0f; }

    void Play(AudioClip c) { if (c != null) oneShot.PlayOneShot(c); }

    static bool NameIs(string n, string key)
    {
        return n == key || n.StartsWith(key + " ") || n.StartsWith(key + "(") || n.StartsWith(key + ".");
    }

    static bool Changed(Color a, Color b)
    {
        return Mathf.Abs(a.r - b.r) > 0.002f || Mathf.Abs(a.g - b.g) > 0.002f || Mathf.Abs(a.b - b.b) > 0.002f;
    }

    static float MaxOf(Color c) { var m = c.maxColorComponent; return m > 1e-4f ? m : 1f; }

    static bool LinearSpace { get { return QualitySettings.activeColorSpace == ColorSpace.Linear; } }

    // a material colour in linear terms (GetColor / SetColor work in sRGB terms and Unity converts in a Linear project)
    static Color ReadLinear(Material m, string prop)
    {
        if (!m.HasProperty(prop)) return Color.black;
        var c = m.GetColor(prop);
        return LinearSpace ? c.linear : c;
    }

    static void WriteLinear(Material m, string prop, Color c)
    {
        if (m.HasProperty(prop)) m.SetColor(prop, LinearSpace ? c.gamma : c);
    }

    // hue (an inspector colour, sRGB) at level k, keeping the strength the material was imported with
    static void WriteGlow(List<Glow> list, Color hue, float k)
    {
        var h = LinearSpace ? hue.linear : hue;
        h.a = 1f;
        foreach (var g in list)
        {
            var f = h * (g.factorMax * k); f.a = 1f;
            var e = h * (g.colorMax * k); e.a = 1f;
            WriteLinear(g.mat, "emissiveFactor", f);   // glTFast shaders
            WriteLinear(g.mat, "_EmissionColor", e);   // Standard / URP Lit
        }
    }
}
