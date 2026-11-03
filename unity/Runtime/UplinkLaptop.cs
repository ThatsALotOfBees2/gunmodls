// The uplink laptop: the attackers' "defuser". A bulky rugged field laptop that is planted on the floor near an
// UplinkServer. Its armoured data cable is plugged into the server's front data port, and it pulls the server's
// data. Put it on the root of the uplink-laptop prefab (built from unity/uplink-laptop.glb with Tools > Gunmodls;
// import with Animation: Legacy). It needs no other component; it draws its own cable.
//   CanPlant(server, pose)        would BeginPlant succeed (floor flat enough, server free, in cable reach)
//   BeginPlant(server, pose)      the attacker starts holding interact: the laptop moves to pose (the root on the
//                                 floor, +Z away from the server) and the 6 s plant runs on its own
//   CancelPlant()                 the attacker let go: the plug is reeled back, the server closes (no abort), the
//                                 laptop packs up, back to Carried; also accepted from Uploading / Disabling (late cancel)
//   BeginDisable(), CancelDisable()   a defender holds interact for 6 s while it uploads; letting go resets it
//   Kill()                        destroyed (shot, explosive): disabled at once
//   SetUploadProgress(p), SetDisableProgress(p)   networking: the authority's progress (set driveUploadExternally
//                                 so the upload stops advancing on its own)
//   Pickup()                      packs it up while planting (same as CancelPlant) or after Complete (the
//                                 server door closes 0.3 s into the plug's reel-back)
//   ResetLaptop()                 new round: closed, in the carry pose, no server
//   PlantPoseFacing(server, floorPoint, floorNormal)   static: a plant pose with the laptop's rear to the server
// Plant timeline (plantSeconds 6): 0-2.4 s deploy (set down, latches, lid, feet, cable door, the plug pops out of
// its holster); 2.4 s the laptop plays link (the reel pays out) and the server plays link (door, shutter); the plug
// flies to the port (in front of it by 3.55 s, pushed in by 3.75 s, collar locked by 3.95 s); 4.0-6.0 s handshake;
// 6.0 s planted: the upload runs uploadSeconds (45). Upload done: Complete (attackers win). Disabled: the plug is
// yanked out and drops to the floor, the server aborts and goes idle, the laptop stays dead on the floor.
// The plug: a child of base in the glb. While it is out this script writes its world pose every LateUpdate
// (after the Animation): popped pose -> a cubic Bezier flight that leaves the bay sideways and arrives square to
// the port -> pushed in along the port's -Z -> exactly the uplink_port world pose. World poses are taken from the
// imported transforms, so glTFast's X mirroring needs no special case (the bay side is read from cable_door's x).
// The cable: drawn every frame between cable_anchor (the bay mouth) and plug_tail. With the plug low (in the bay,
// carried low, dropped) one span: a cubic Bezier whose plug end is bent down by cableDroop, a parabolic sag from
// about 22 % slack eased in over the first anchorLip metres so it clears the dropped bay door, a soft floor at the
// laptop's floor height. With the plug up at the port two spans: it drops off the boot to a touchdown point
// touchdown metres in front of the port (turned towards the laptop), then runs along the floor to the bay with a
// sideways bow; the two shapes blend by the plug's height (DESIGN 9). Drawn as a generated tube mesh with the
// laptop's own 'cable' material (u = metres / 0.024 along it, so the armour keeps its pitch), or as a LineRenderer
// (useLineRenderer). It is drawn only while this script owns the plug (link onward, until the plug is back at the
// popped pose, whose tail sits on cable_anchor), and never while the cable door is under 20 degrees open; in deploy
// and pack the bay's static cable span is the cable. Data pulses (server -> laptop): bands every 0.30 m,
// moving towards the laptop at 0.9 m/s, drawn on a second, slightly larger tube with an additive material and a
// generated band texture; the band is scrolled by the texture offset (_MainTex_ST / _BaseMap_ST) through a
// MaterialPropertyBlock. f = fract((0.9 t - x) / 0.30), x = distance from the plug end. Assign pulseMaterial (any
// unlit additive shader with a main texture and a colour) for player builds; otherwise one is made at runtime
// from Legacy Shaders/Particles/Additive, URP Particles/Unlit or Sprites/Default, whichever the build has.
// Screen: 4 x 4 atlas cells on the 'screen' material's emissive map; a cell is shown by moving the texture offset
// by whole cells on a material copy owned by this component (glTFast applies *_ST with _TEXTURE_TRANSFORM, which
// the glb's identity KHR_texture_transform turns on). Progress: the 10 progress_N nodes are scaled 1 / 1e-4.
// Status LED: tinted on a copy of the 'status_led' material (emissiveFactor and _EmissionColor, in linear terms).
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Rendering;

[RequireComponent(typeof(Animation))]
public class UplinkLaptop : MonoBehaviour
{
    [Header("Rules (seconds, metres)")]
    public float plantSeconds = 6f;              // the whole plant hold; at least deploySeconds + 1.6
    public float deploySeconds = 2.4f;           // the deploy clip; link starts here
    public float uploadSeconds = 45f;
    public float disableSeconds = 6f;            // defender hold
    public float disableRange = 1.5f;            // defender to laptop, for InDisableRange
    [Range(0f, 1f)] public float minGroundNormalY = 0.9f;
    public bool driveUploadExternally = false;   // networking: only SetUploadProgress moves the upload
    public bool detachOnPlant = true;            // BeginPlant unparents the laptop from the hand
    [Header("Cable")]
    public bool useLineRenderer = false;         // the cheap fallback instead of the tube mesh
    public float cableRadius = 0.0045f;
    [Range(4, 128)] public int cableSegments = 48;
    [Range(3, 24)] public int cableSides = 10;
    public float cableSlack = 1.22f;             // free length = slack * d + slackExtra * smoothstep(0.05, 0.6, d)
    public float cableSlackExtra = 0.18f;
    public float anchorHandle = 0.18f, plugHandle = 0.12f;   // Bezier handles at the bay mouth (long: the cable bows out clear of the side) and the plug boot
    public float cableDroop = 0.6f;              // the plug-end handle points along normalize(plug_tail +Z - droop * up)
    public float anchorLip = 0.12f;              // m from the anchor over which the sag eases in (smoothstep squared)
    [Header("Cable hanging from the port")]
    public float touchdown = 0.28f;              // m from the plug's foot on the floor to where the cable lands
    public float touchdownToward = 0.5f;         // how far the touchdown direction turns from the port's forward towards the laptop
    public float bootHandle = 0.07f;             // Bezier handle off the plug boot (short: it turns down within about 10 cm)
    public float dropHandle = 0.55f;             // the drop's handle at the touchdown, times the plug height
    public float dropLean = 0.35f;               // the drop arrives along normalize(-up + lean * towards-laptop)
    public float floorSlack = 1.15f, floorSlackExtra = 0.10f;   // floor span length = slack * dL + extra
    public float floorBow = 0.9f;                // the floor span's sag leans sideways this much (and 0.5 down)
    public Vector2 hangHeight = new Vector2(0.10f, 0.30f);    // plug height above the floor: single span below x, two spans above y
    [Range(0, 8)] public int cableSmoothing = 3;
    public float floorSoftness = 0.01f;          // the soft floor's k
    public float armourTile = 0.024f;            // m of cable per armour texture repeat
    public Material cableMaterial;               // empty: the laptop's own 'cable' material
    [Header("Data pulses")]
    public Material pulseMaterial;               // additive unlit; empty: made at runtime
    public Color pulseColor = new Color(0.541f, 0.302f, 1f);     // #8a4dff
    [Range(0f, 8f)] public float pulseIntensity = 2f;
    public float pulseSpacing = 0.30f, pulseSpeed = 0.9f;
    public float pulseHandshake = 0.25f, pulseUpload = 0.8f, pulseSurge = 1.3f;
    [Header("Lights")]
    public Color idleColor = new Color(0.541f, 0.302f, 1f);      // #8a4dff
    public Color alarmColor = new Color(1f, 0.165f, 0.227f);     // #ff2a3a
    public Color completeColor = new Color(0.722f, 0.612f, 1f);   // #b89cff
    [Range(0f, 4f)] public float glowIntensity = 1f;
    [Header("Sound")]
    public AudioClip deploySound, cablePaySound, plugLockSound, handshakeSound, uploadLoop, progressTick,
        disableHoldLoop, disableSound, plugEjectSound, completeSound, packSound;
    [Header("Effects")]
    public GameObject sparksPrefab;              // spawned at fx_sparks on disable
    public UnityEvent onPlanted = new UnityEvent(), onPlantCancelled = new UnityEvent(), onCompleted = new UnityEvent(),
        onDisabled = new UnityEvent(), onPacked = new UnityEvent(), onDisableStarted = new UnityEvent(),
        onDisableCancelled = new UnityEvent();

    public enum State { Carried, Planting, Linking, Uploading, Complete, Disabling, Disabled, Packing }
    public State Current { get; private set; }
    public UplinkServer Server { get { return server; } }
    public float PlantProgress { get { return Current == State.Planting || Current == State.Linking ? Mathf.Clamp01(plantT / PlantLength) : (IsPlanted ? 1f : 0f); } }
    public float PlantTime { get { return plantT; } }
    public float UploadProgress { get { return progress; } }
    public float DisableProgress { get { return Current == State.Disabling ? Mathf.Clamp01(disableT / Mathf.Max(0.01f, disableSeconds)) : 0f; } }
    public bool IsPlanted { get { return Current == State.Uploading || Current == State.Disabling || Current == State.Complete; } }
    public bool PlugSeated { get { return plugMode == PlugMode.Port || (plugMode == PlugMode.Flight && LinkT >= PushStart); } }
    public float CableLength { get; private set; }   // the drawn cable's length, m
    public Transform Grip { get { return grip; } }   // hand attach point (carry: the root hangs front edge up, -90 deg about X)
    public Transform Plug { get { return plug; } }
    public Transform CableAnchor { get { return anchor; } }
    public Transform FxSparks { get { return fxSparks; } }

    public event Action<UplinkLaptop, State, State> OnStateChanged;   // laptop, from, to
    public event Action<UplinkLaptop, float> OnProgress;              // upload progress 0..1, when it changes
    public event Action<UplinkLaptop> OnPlanted, OnPlantCancelled, OnCompleted, OnDisabled, OnPacked;

    // ---------------------------------------------------------------- the numbers of the clips and the viewer

    const float LinkClip = 1.6f;                 // link clip length; the plug is locked by its end (plant 4.0 s)
    const float FlightStart = 0.10f, FlightEnd = 1.15f, PushStart = 1.15f, PushEnd = 1.35f;   // link time
    const float ScreenLinkAt = 1.4f;             // link time: the screen shows 'link'
    const float Approach = 0.10f;                // m in front of the port where the flight ends
    const float YankOut = 0.04f, YankTime = 0.06f, YankDrift = 0.22f, PlugRestHeight = 0.014f;
    const float RecallTime = 0.5f;               // s, plug back to the popped pose before pack
    const float ReverseSpeed = 1.6f;             // deploy runs back at this speed when a plant is cancelled early
    const float RecallLift = 0.07f;              // m, the plug is lifted this much half-way back
    const float ServerCloseAt = 0.3f;            // s into the recall after a pick-up: the server door starts to close
    const float DoorShowAngle = 20f;             // deg, the cable is hidden below this
    const float Hidden = 1e-4f;
    const int Segments = 10;
    const int CellOff = 0, CellBootA = 1, CellBootB = 2, CellSearchA = 3, CellSearchB = 4, CellLink = 5, CellUpload = 6, CellComplete = 14, CellDisabled = 15;

    public static readonly string[] Cells = {
        "off", "boot_a", "boot_b", "search_a", "search_b", "link", "upload_1a", "upload_1b",
        "upload_2a", "upload_2b", "upload_3a", "upload_3b", "upload_4a", "upload_4b", "complete", "disabled" };
    static readonly string[] AtlasProps = { "emissiveTexture", "baseColorTexture", "_EmissionMap", "_BaseMap", "_MainTex" };

    // ---------------------------------------------------------------- set up

    enum PlugMode { Clip, Flight, Port, Yanked, Recall }
    enum PackPhase { Reverse, Recall, Pack }
    struct AtlasSlot { public Material mat; public string prop; public Vector2 scale, offset; }
    struct Glow { public Material mat; public float factorMax, colorMax; }

    Animation anim;
    Transform plug, plugTail, anchor, cableDoor, grip, fxSparks;
    readonly Transform[] segments = new Transform[Segments];
    readonly List<AtlasSlot> atlas = new List<AtlasSlot>();
    readonly List<Glow> statusGlow = new List<Glow>(), ledGlow = new List<Glow>();
    readonly List<Material> owned = new List<Material>();
    Material armourMat;
    AudioSource oneShot, uploadSource, holdSource;
    UplinkServer server;
    PlugMode plugMode = PlugMode.Clip;
    PackPhase packPhase;
    Vector3 holsterPos, poppedPos, moveFrom, moveDir;
    Quaternion holsterRot = Quaternion.identity, poppedRot = Quaternion.identity, moveRot = Quaternion.identity;
    float stateT, now, plantT, uploadT, progress, disableT, moveT, packT, floorY, bayX = 1f;
    bool seatedDone, handshakeDone, closePending;
    int shownCell = -1, litShown;
    Color lastStatus = new Color(-1f, 0f, 0f, 0f);
    float lastLed = -1f;

    float LinkT { get { return plantT - deploySeconds; } }
    float PlantLength { get { return Mathf.Max(plantSeconds, deploySeconds + LinkClip); } }

    void Awake()
    {
        anim = GetComponent<Animation>();
        // glTFast imports every clip as a loop and plays the first one (carry) on its own
        anim.playAutomatically = false; anim.Stop();
        foreach (AnimationState s in anim)
        {
            s.layer = 0;
            s.wrapMode = s.name == "carry" || s.name == "upload" ? WrapMode.Loop : WrapMode.ClampForever;
        }
        foreach (var t in GetComponentsInChildren<Transform>(true))
        {
            switch (t.name)
            {
                case "plug": plug = t; break;
                case "plug_tail": plugTail = t; break;
                case "cable_anchor": anchor = t; break;
                case "cable_door": cableDoor = t; break;
                case "grip": grip = t; break;
                case "fx_sparks": fxSparks = t; break;
                default:
                    if (t.name.StartsWith("progress_"))
                    {
                        int i;
                        if (int.TryParse(t.name.Substring(9), out i) && i >= 1 && i <= Segments) segments[i - 1] = t;
                    }
                    break;
            }
        }
        if (plug == null || anchor == null || plugTail == null) Debug.LogWarning("UplinkLaptop: plug, plug_tail or cable_anchor missing under " + name, this);
        // the bay is on the laptop's -X in the glb; glTFast mirrors X, so read the side from the door's position
        if (cableDoor != null && Mathf.Abs(cableDoor.localPosition.x) > 1e-4f) bayX = Mathf.Sign(cableDoor.localPosition.x);
        else bayX = -1f;
        CollectMaterials();
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f; oneShot.playOnAwake = false;
        uploadSource = gameObject.AddComponent<AudioSource>(); uploadSource.spatialBlend = 1f; uploadSource.loop = true; uploadSource.playOnAwake = false;
        holdSource = gameObject.AddComponent<AudioSource>(); holdSource.spatialBlend = 1f; holdSource.loop = true; holdSource.playOnAwake = false;
        // the plug's holster and popped poses (base space), read from the clips so the import's mirroring is in them
        if (plug != null)
        {
            SamplePose("deploy", Length("deploy"));
            poppedPos = plug.localPosition; poppedRot = plug.localRotation;
            SamplePose("carry", 0f);
            holsterPos = plug.localPosition; holsterRot = plug.localRotation;
            if (anim["deploy"] == null) { poppedPos = holsterPos; poppedRot = holsterRot; }
        }
        BuildCable();
        ResetLaptop();
    }

    void OnDestroy()
    {
        // quiet: destroying the object is not a disable (call Kill() first for that), so no abort sound or onAborted
        if (server != null) { if (server.Current == UplinkServer.State.Idle) server.Release(this); else server.Close(this); }
        foreach (var m in owned) if (m != null) Destroy(m);
        if (tubeMesh != null) Destroy(tubeMesh);
        if (pulseMesh != null) Destroy(pulseMesh);
        if (pulseTex != null) Destroy(pulseTex);
    }

    // one material copy per imported material it drives, shared by every renderer (and LOD) that used it
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
                if (armourMat == null && NameIs(m.name, "cable")) armourMat = m;   // used as is by the runtime cable
                var kind = NameIs(m.name, "screen") ? 1 : NameIs(m.name, "status_led") ? 2 : NameIs(m.name, "led") ? 3 : 0;
                if (kind == 0) continue;
                Material copy;
                if (!copies.TryGetValue(m, out copy))
                {
                    copy = new Material(m) { name = m.name };
                    copies[m] = copy; owned.Add(copy);
                    if (kind == 1) AddAtlas(copy);
                    else
                    {
                        copy.EnableKeyword("_EMISSIVE"); copy.EnableKeyword("_EMISSION");
                        var g = new Glow { mat = copy, factorMax = MaxOf(ReadLinear(copy, "emissiveFactor")), colorMax = MaxOf(ReadLinear(copy, "_EmissionColor")) };
                        if (kind == 2) statusGlow.Add(g); else ledGlow.Add(g);
                    }
                }
                mats[i] = copy;
                changed = true;
            }
            if (changed) r.sharedMaterials = mats;
        }
        if (cableMaterial != null) armourMat = cableMaterial;
    }

    void AddAtlas(Material m)
    {
        foreach (var p in AtlasProps)
        {
            // Standard and URP Lit move the emission map with the base map's tiling and offset, even when the base
            // map slot is empty, so _MainTex / _BaseMap count whenever the shader has them
            var shared = p == "_MainTex" || p == "_BaseMap";
            if (!m.HasProperty(p) || (!shared && m.GetTexture(p) == null)) continue;
            atlas.Add(new AtlasSlot { mat = m, prop = p, scale = m.GetTextureScale(p), offset = m.GetTextureOffset(p) });
        }
        m.EnableKeyword("_TEXTURE_TRANSFORM");
    }

    // ---------------------------------------------------------------- commands

    // the rules for a plant at pose (the laptop root on the floor) next to server
    public bool CanPlant(UplinkServer target, Pose pose)
    {
        if (target == null || Current != State.Carried) return false;
        if ((pose.rotation * Vector3.up).y < minGroundNormalY) return false;
        return target.CanAccept(this, pose.position);
    }

    public bool BeginPlant(UplinkServer target, Pose pose)
    {
        if (!CanPlant(target, pose)) return false;
        if (!target.Claim(this, pose.position)) return false;
        if (detachOnPlant) transform.SetParent(null, true);
        transform.SetPositionAndRotation(pose.position, pose.rotation);
        server = target;
        floorY = pose.position.y;
        plantT = 0f; uploadT = 0f; disableT = 0f; litShown = 0;
        seatedDone = handshakeDone = false;
        SetProgressValue(0f);
        plugMode = PlugMode.Clip;
        SetState(State.Planting);
        PlayClip("deploy", 0.15f);
        Play(deploySound);
        return true;
    }

    // cancels a plant: while planting or linking, and also from Uploading or Disabling, so a cancel from the
    // authority that arrives after this client's own plant timer ran out still cancels cleanly
    public void CancelPlant()
    {
        if (Current != State.Planting && Current != State.Linking && Current != State.Uploading && Current != State.Disabling) return;
        if (Current == State.Planting)
        {
            // the plug is still in the bay: deploy runs back to the carry pose
            if (server != null) server.Release(this);
            server = null;
            var s = anim["deploy"];
            if (s != null) { s.speed = -ReverseSpeed; packT = s.time / ReverseSpeed; } else packT = 0f;
            packPhase = PackPhase.Reverse;
        }
        else
        {
            // the link clip holds where it is (the reel stops) while the plug is pulled out and reeled back; the
            // server closes its door (Close: a cancel is not a disable, so no abort sound and no onAborted)
            var ls = anim["link"];
            if (Current == State.Linking && ls != null) ls.speed = 0f;
            if (Current == State.Disabling && holdSource != null) holdSource.Stop();
            uploadT = 0f; disableT = 0f;
            SetProgressValue(0f);
            if (server != null) server.Close(this);
            StartMove(PlugMode.Recall);
            packPhase = PackPhase.Recall;
        }
        StopLoops();
        SetState(State.Packing);
        onPlantCancelled.Invoke();
        if (OnPlantCancelled != null) OnPlantCancelled(this);
    }

    public bool BeginDisable()
    {
        if (Current != State.Uploading) return false;
        disableT = 0f;
        SetState(State.Disabling);
        if (disableHoldLoop != null) { holdSource.clip = disableHoldLoop; holdSource.Play(); }
        onDisableStarted.Invoke();
        return true;
    }

    public void CancelDisable()
    {
        if (Current != State.Disabling) return;
        disableT = 0f;
        holdSource.Stop();
        SetState(State.Uploading);
        onDisableCancelled.Invoke();
    }

    // destroyed: disabled at once (from any planted or planting state except Complete)
    public void Kill()
    {
        if (Current == State.Planting || Current == State.Linking || Current == State.Uploading || Current == State.Disabling) Disable();
    }

    // networking: the authority's upload progress 0..1
    public void SetUploadProgress(float p)
    {
        if (Current != State.Uploading && Current != State.Disabling) return;
        uploadT = Mathf.Clamp01(p) * uploadSeconds;
        ApplyProgress();
    }

    // networking: the authority's disable hold 0..1 (0 cancels, 1 disables)
    public void SetDisableProgress(float p)
    {
        if (p > 0f && Current == State.Uploading) BeginDisable();
        if (Current != State.Disabling) return;
        if (p <= 0f) { CancelDisable(); return; }
        disableT = Mathf.Clamp01(p) * disableSeconds;
        if (p >= 1f) Disable();
    }

    // packs it up: while planting (as CancelPlant) or after Complete; false otherwise
    public bool Pickup()
    {
        if (Current == State.Planting || Current == State.Linking) { CancelPlant(); return true; }
        if (Current != State.Complete) return false;
        // the plug is pulled out and reeled back; the server door closes once it is clear (ServerCloseAt)
        closePending = server != null;
        StartMove(PlugMode.Recall);
        packPhase = PackPhase.Recall;
        StopLoops();
        SetState(State.Packing);
        return true;
    }

    // new round: closed, carry pose, no server, lights out
    public void ResetLaptop()
    {
        closePending = false;
        // a server still linked to this laptop closes its door too, so it never stays busy without ResetServer
        if (server != null) { if (server.Current == UplinkServer.State.Idle) server.Release(this); else server.Close(this); }
        server = null;
        plantT = uploadT = disableT = 0f; litShown = 0;
        SetProgressValue(0f);
        plugMode = PlugMode.Clip;
        StopLoops();
        anim.Stop();
        SamplePose("carry", 0f);
        var s = anim["carry"];
        if (s != null) { anim.Play("carry", PlayMode.StopSameLayer); s.time = 0f; s.speed = 1f; }
        SetState(State.Carried);
        SetCableVisible(false);
    }

    public bool InDisableRange(Vector3 position)
    {
        return (position - transform.position).sqrMagnitude <= disableRange * disableRange;
    }

    // a plant pose at floorPoint whose rear faces the server's port (the operator kneels in front, +Z)
    public static Pose PlantPoseFacing(UplinkServer target, Vector3 floorPoint, Vector3 floorNormal)
    {
        var up = floorNormal.sqrMagnitude > 1e-6f ? floorNormal.normalized : Vector3.up;
        var away = target != null && target.Port != null ? floorPoint - target.Port.position : Vector3.forward;
        var fwd = Vector3.ProjectOnPlane(away, up);
        if (fwd.sqrMagnitude < 1e-6f && target != null) fwd = Vector3.ProjectOnPlane(target.Front, up);
        if (fwd.sqrMagnitude < 1e-6f) fwd = Vector3.ProjectOnPlane(Vector3.forward, up);
        return new Pose(floorPoint, Quaternion.LookRotation(fwd.normalized, up));
    }

    // ---------------------------------------------------------------- running

    void Update()
    {
        var dt = Time.deltaTime;
        stateT += dt; now += dt;
        switch (Current)
        {
            case State.Planting:
            case State.Linking:
                plantT += dt;
                StepPlant();
                break;
            case State.Uploading:
            case State.Disabling:
                if (!driveUploadExternally) { uploadT += dt; ApplyProgress(); }
                if (Current == State.Disabling)
                {
                    disableT += dt;
                    holdSource.pitch = 0.8f + 0.7f * DisableProgress;   // the whine rises with the hold
                    if (disableT >= disableSeconds) Disable();
                }
                break;
            case State.Packing:
                StepPack(dt);
                break;
        }
        if (plugMode == PlugMode.Yanked || plugMode == PlugMode.Recall) moveT += dt;
    }

    void StepPlant()
    {
        if (Current == State.Planting && plantT >= deploySeconds)
        {
            SetState(State.Linking);
            PlayClip("link", 0.05f);
            plugMode = PlugMode.Flight;
            if (server != null) server.BeginLink(this);
            Play(cablePaySound);
        }
        if (Current != State.Linking) return;
        if (!seatedDone && LinkT >= PushEnd) { seatedDone = true; Play(plugLockSound); }
        if (!handshakeDone && LinkT >= LinkClip) { handshakeDone = true; Play(handshakeSound); }
        if (plantT >= PlantLength) FinishPlant();
    }

    void FinishPlant()
    {
        plugMode = PlugMode.Port;
        SetState(State.Uploading);
        PlayClip("upload", 0.2f);
        if (server != null) server.BeginUpload(this);
        if (uploadLoop != null) { uploadSource.clip = uploadLoop; uploadSource.Play(); }
        onPlanted.Invoke();
        if (OnPlanted != null) OnPlanted(this);
        ApplyProgress();
    }

    void ApplyProgress()
    {
        var p = Mathf.Clamp01(uploadT / Mathf.Max(0.01f, uploadSeconds));
        SetProgressValue(p);
        var lit = Mathf.FloorToInt(p * Segments + 1e-6f);
        if (lit > litShown) { litShown = lit; Play(progressTick); }
        if (p >= 1f) CompleteUpload();
    }

    void SetProgressValue(float p)
    {
        if (Mathf.Approximately(p, progress)) return;
        progress = p;
        if (server != null) server.SetProgress(this, p);
        if (OnProgress != null) OnProgress(this, p);
    }

    void CompleteUpload()
    {
        holdSource.Stop(); uploadSource.Stop();
        SetState(State.Complete);
        PlayClip("complete", 0.15f);
        if (server != null) server.Complete(this);
        Play(completeSound);
        onCompleted.Invoke();
        if (OnCompleted != null) OnCompleted(this);
    }

    void Disable()
    {
        var from = Current;
        var plugOut = plugMode != PlugMode.Clip;
        if (plugOut) StartMove(PlugMode.Yanked);
        StopLoops();
        SetState(State.Disabled);
        // killed while planting: deploy freezes where it is (disable starts from the deployed pose, so cross-fading
        // into it would swing the lid and the feet open first)
        if (from == State.Planting) { var ds = anim["deploy"]; if (ds != null) ds.speed = 0f; }
        else PlayClip("disable", 0.1f);
        if (server != null) { if (server.Current == UplinkServer.State.Idle) server.Release(this); else server.Abort(this); }
        server = null;
        Play(disableSound);
        if (plugOut) Play(plugEjectSound);
        if (sparksPrefab != null && fxSparks != null) Instantiate(sparksPrefab, fxSparks.position, fxSparks.rotation, fxSparks);
        onDisabled.Invoke();
        if (OnDisabled != null) OnDisabled(this);
    }

    void StepPack(float dt)
    {
        switch (packPhase)
        {
            case PackPhase.Reverse:
                packT -= dt;
                if (packT <= 0f) ToCarry();
                break;
            case PackPhase.Recall:
                if (closePending && moveT >= ServerCloseAt) CloseServer();
                if (moveT >= YankTime + RecallTime)
                {
                    plugMode = PlugMode.Clip;
                    SetPlugLocal(poppedPos, poppedRot);
                    packPhase = PackPhase.Pack; packT = 0f;
                    PlayClip("pack", 0.15f);
                    Play(packSound);
                }
                break;
            case PackPhase.Pack:
                packT += dt;
                if (packT >= Length("pack")) ToCarry();
                break;
        }
    }

    void CloseServer()
    {
        closePending = false;
        if (server == null) return;
        if (server.Current == UplinkServer.State.Complete) server.Close(this); else server.Release(this);
    }

    void ToCarry()
    {
        if (closePending) CloseServer();
        plugMode = PlugMode.Clip;
        server = null;
        var s = anim["carry"];
        if (s != null) { anim.Play("carry", PlayMode.StopSameLayer); s.time = 0f; s.speed = 1f; }
        SetState(State.Carried);
        onPacked.Invoke();
        if (OnPacked != null) OnPacked(this);
    }

    void LateUpdate()
    {
        UpdatePlug();
        UpdateCable();
        UpdateLights();
    }

    // ---------------------------------------------------------------- the plug

    void StartMove(PlugMode mode)
    {
        moveT = 0f;
        moveFrom = plug != null ? plug.position : transform.position;
        moveRot = plug != null ? plug.rotation : transform.rotation;
        var port = server != null ? server.Port : null;
        moveDir = PlugSeated && port != null ? port.forward : Vector3.zero;   // pulled straight out of the socket first
        if (mode == PlugMode.Yanked) floorY = transform.position.y;
        plugMode = mode;
    }

    void PoppedWorld(out Vector3 p, out Quaternion q)
    {
        var parent = plug.parent;
        if (parent == null) { p = poppedPos; q = poppedRot; return; }
        p = parent.TransformPoint(poppedPos); q = parent.rotation * poppedRot;
    }

    void SetPlugLocal(Vector3 p, Quaternion q)
    {
        if (plug == null) return;
        plug.localPosition = p; plug.localRotation = q;
    }

    void UpdatePlug()
    {
        if (plug == null || plugMode == PlugMode.Clip) return;
        var port = server != null ? server.Port : null;
        Vector3 pos; Quaternion rot;
        switch (plugMode)
        {
            case PlugMode.Flight:
                {
                    if (port == null) return;
                    var t = LinkT;
                    Vector3 pS; Quaternion qS;
                    PoppedWorld(out pS, out qS);
                    var pE = port.position; var qE = port.rotation; var zE = port.forward;
                    var pA = pE + zE * Approach;
                    if (t < FlightStart) { pos = pS; rot = qS; }
                    else if (t < FlightEnd)
                    {
                        // out of the bay side first (clear of the lid), then round to the front of the port
                        var u = Ease(Lin(t, FlightStart, FlightEnd)); var a = 1f - u;
                        var outDir = plug.parent != null ? plug.parent.TransformDirection(new Vector3(bayX, 0f, 0f)) : Vector3.left;
                        outDir.y = 0f; outDir = outDir.sqrMagnitude > 1e-8f ? outDir.normalized : Vector3.zero;
                        var pC = pS + outDir * 0.20f + Vector3.up * 0.12f;
                        var pD = pA + zE * 0.30f + Vector3.up * 0.15f;
                        pos = pS * (a * a * a) + pC * (3f * a * a * u) + pD * (3f * a * u * u) + pA * (u * u * u);
                        rot = Quaternion.Slerp(qS, qE, Ease(u));
                    }
                    else if (t < PushEnd) { pos = Vector3.Lerp(pA, pE, EaseOut(Lin(t, PushStart, PushEnd))); rot = qE; }
                    else { pos = pE; rot = qE; }
                    break;
                }
            case PlugMode.Port:
                if (port == null) return;
                pos = port.position; rot = port.rotation;
                break;
            case PlugMode.Yanked:
                {
                    // out 4 cm along the port's +Z, then it falls, rolls flat and bounces once
                    var t = moveT; var tau = Mathf.Max(0f, t - YankTime);
                    var yF = floorY + PlugRestHeight;
                    pos = moveFrom + moveDir * (YankOut * EaseOut(Lin(t, 0f, YankTime)) + YankDrift * (1f - Mathf.Exp(-3f * tau)));
                    var yFall = moveFrom.y - 4.9f * tau * tau;
                    var tLand = Mathf.Sqrt(Mathf.Max(0f, (moveFrom.y - yF) / 4.9f));
                    pos.y = yFall > yF ? yFall : yF + 0.012f * Bump(tau - tLand, 0.14f);
                    var e = EaseOut(Mathf.Clamp01(tau / 0.6f));
                    var fwd = moveRot * Vector3.forward; fwd.y = 0f;
                    var flat = fwd.sqrMagnitude > 1e-6f ? Quaternion.LookRotation(fwd.normalized, Vector3.up) : moveRot;
                    rot = Quaternion.AngleAxis(50f * e, Vector3.up) * Quaternion.Slerp(moveRot, flat, e);
                    break;
                }
            case PlugMode.Recall:
                {
                    // out of the socket, then back to the popped pose by the bay
                    var t = moveT;
                    var start = moveFrom + moveDir * (YankOut * EaseOut(Lin(t, 0f, YankTime)));
                    Vector3 pP; Quaternion qP;
                    PoppedWorld(out pP, out qP);
                    var u = Ease(Lin(t, YankTime, YankTime + RecallTime));
                    pos = Vector3.Lerp(start, pP, u) + Vector3.up * (RecallLift * Mathf.Sin(Mathf.PI * u));
                    rot = Quaternion.Slerp(moveRot, qP, u);
                    break;
                }
            default:
                return;
        }
        plug.SetPositionAndRotation(pos, rot);
    }

    // ---------------------------------------------------------------- the cable

    GameObject tubeGo, pulseGo;
    Mesh tubeMesh, pulseMesh;
    MeshRenderer tubeRenderer, pulseRenderer;
    LineRenderer cableLine, pulseLine;
    Material lineMat, pulseMat;
    Texture2D pulseTex;
    MaterialPropertyBlock block;
    Vector3[] pts, verts, pulseVerts, normals;
    Vector2[] uvs, pulseUvs;
    Vector3 lastP0, lastP3, lastT0, lastT3;
    float lastFloor = float.NaN;
    bool cableShown, pulseWarned, ownPulseTexture;
    int builtSegs, builtSides;

    void BuildCable()
    {
        block = new MaterialPropertyBlock();
        MakePulseTexture();
        pulseMat = pulseMaterial != null ? pulseMaterial : MakePulseMaterial();
        ownPulseTexture = pulseMat != null && !HasTexture(pulseMat, "_MainTex") && !HasTexture(pulseMat, "_BaseMap");
        tubeGo = new GameObject("uplink_cable");
        tubeGo.transform.SetParent(transform, false);
        pulseGo = new GameObject("uplink_cable_pulse");
        pulseGo.transform.SetParent(transform, false);
        if (useLineRenderer)
        {
            cableLine = tubeGo.AddComponent<LineRenderer>();
            lineMat = armourMat != null ? new Material(armourMat) { name = "cable_line" } : null;
            if (lineMat != null)
            {
                owned.Add(lineMat);
                // Tile repeats the texture per metre: scale it to one repeat per armourTile
                foreach (var p in new[] { "_MainTex", "_BaseMap", "_BumpMap", "baseColorTexture", "normalTexture", "metallicRoughnessTexture", "occlusionTexture" })
                    if (lineMat.HasProperty(p)) lineMat.SetTextureScale(p, new Vector2(1f / Mathf.Max(1e-4f, armourTile), 1f));
                lineMat.EnableKeyword("_TEXTURE_TRANSFORM");
            }
            SetupLine(cableLine, lineMat, 2f * cableRadius, LineTextureMode.Tile, true);
            pulseLine = pulseGo.AddComponent<LineRenderer>();
            SetupLine(pulseLine, pulseMat, 2.5f * cableRadius, LineTextureMode.Stretch, false);
        }
        else
        {
            tubeMesh = NewMesh("uplink_cable");
            pulseMesh = NewMesh("uplink_cable_pulse");
            tubeGo.AddComponent<MeshFilter>().sharedMesh = tubeMesh;
            tubeRenderer = tubeGo.AddComponent<MeshRenderer>();
            tubeRenderer.sharedMaterial = armourMat;
            tubeRenderer.shadowCastingMode = ShadowCastingMode.On; tubeRenderer.receiveShadows = true;
            pulseGo.AddComponent<MeshFilter>().sharedMesh = pulseMesh;
            pulseRenderer = pulseGo.AddComponent<MeshRenderer>();
            pulseRenderer.sharedMaterial = pulseMat;
            pulseRenderer.shadowCastingMode = ShadowCastingMode.Off; pulseRenderer.receiveShadows = false;
        }
        cableShown = true;
        SetCableVisible(false);
    }

    static bool HasTexture(Material m, string prop) { return m.HasProperty(prop) && m.GetTexture(prop) != null; }

    static Mesh NewMesh(string n)
    {
        var m = new Mesh { name = n };
        m.MarkDynamic();
        return m;
    }

    static void SetupLine(LineRenderer l, Material m, float width, LineTextureMode mode, bool lit)
    {
        l.useWorldSpace = true;
        l.sharedMaterial = m;
        l.widthMultiplier = width;
        l.textureMode = mode;
        l.numCapVertices = 2; l.numCornerVertices = 2;
        l.alignment = LineAlignment.View;
        l.generateLightingData = lit;
        l.shadowCastingMode = lit ? ShadowCastingMode.On : ShadowCastingMode.Off;
        l.receiveShadows = lit;
        l.positionCount = 0;
    }

    // the band profile along one pulse spacing: a sharp front towards the laptop, a soft tail
    void MakePulseTexture()
    {
        const int W = 256;
        pulseTex = new Texture2D(W, 1, TextureFormat.RGBA32, false) { name = "uplink_pulse", filterMode = FilterMode.Bilinear };
        pulseTex.wrapModeU = TextureWrapMode.Repeat; pulseTex.wrapModeV = TextureWrapMode.Clamp;
        var px = new Color[W];
        for (var i = 0; i < W; i++)
        {
            var f = (i + 0.5f) / W;
            var b = SStep(0f, 0.015f, f) * (1f - SStep(0.015f, 0.13f, f));
            px[i] = new Color(b, b, b, b);
        }
        pulseTex.SetPixels(px);
        pulseTex.Apply(false, true);
    }

    Material MakePulseMaterial()
    {
        Shader sh = null;
        var srp = GraphicsSettings.currentRenderPipeline != null;
        if (srp) sh = Shader.Find("Universal Render Pipeline/Particles/Unlit");
        if (sh == null) sh = Shader.Find("Legacy Shaders/Particles/Additive");
        if (sh == null) sh = Shader.Find("Sprites/Default");
        if (sh == null) return null;
        var m = new Material(sh) { name = "cable_pulse" };
        owned.Add(m);
        if (sh.name.StartsWith("Universal Render Pipeline"))
        {
            // transparent, additive
            m.SetFloat("_Surface", 1f); m.SetFloat("_Blend", 2f);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); m.SetFloat("_DstBlend", (float)BlendMode.One);
            m.SetFloat("_ZWrite", 0f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
        }
        m.renderQueue = (int)RenderQueue.Transparent;
        return m;
    }

    void SetCableVisible(bool on)
    {
        if (on == cableShown) return;
        cableShown = on;
        if (tubeRenderer != null) tubeRenderer.enabled = on;
        if (cableLine != null) cableLine.enabled = on;
        if (!on)
        {
            if (pulseRenderer != null) pulseRenderer.enabled = false;
            if (pulseLine != null) pulseLine.enabled = false;
            CableLength = 0f;
        }
    }

    float DoorAngle()
    {
        return cableDoor != null ? Quaternion.Angle(Quaternion.identity, cableDoor.localRotation) : 180f;   // closed = identity
    }

    void UpdateCable()
    {
        var on = anchor != null && plugTail != null && plugMode != PlugMode.Clip && DoorAngle() > DoorShowAngle && Current != State.Carried;
        if (on && (plugTail.position - anchor.position).sqrMagnitude < 4e-6f) on = false;   // popped pose: no length
        if (!on) { SetCableVisible(false); return; }
        var p0 = anchor.position; var t0 = anchor.forward; var p3 = plugTail.position; var t3 = plugTail.forward;
        if (Current == State.Planting || Current == State.Linking || Current == State.Uploading || Current == State.Disabling || Current == State.Complete)
            floorY = transform.position.y;
        var segs = Mathf.Max(2, cableSegments); var sides = Mathf.Max(3, cableSides);
        var moved = !cableShown || segs != builtSegs || sides != builtSides || (p0 - lastP0).sqrMagnitude > 1e-10f || (p3 - lastP3).sqrMagnitude > 1e-10f
            || (t0 - lastT0).sqrMagnitude > 1e-8f || (t3 - lastT3).sqrMagnitude > 1e-8f || !Mathf.Approximately(floorY, lastFloor);
        if (moved)
        {
            lastP0 = p0; lastP3 = p3; lastT0 = t0; lastT3 = t3; lastFloor = floorY;
            CablePoints(p0, t0, p3, t3, segs);
            if (cableLine != null) UpdateLines(segs); else if (tubeMesh != null) UpdateTube(segs, sides, t0);
        }
        SetCableVisible(true);
        UpdatePulse();
    }

    // the centre line (DESIGN 9): the single span for a low plug, the two spans for a plug up at the port, blended
    // point by point by the plug's height above the floor
    Vector3[] twoPts, smoothTmp;
    void CablePoints(Vector3 p0, Vector3 t0, Vector3 p3, Vector3 t3, int n)
    {
        if (pts == null || pts.Length != n + 1) pts = new Vector3[n + 1];
        var f = floorY + cableRadius;
        var h = p3.y - f;
        var wH = SStep(hangHeight.x, Mathf.Max(hangHeight.x + 1e-3f, hangHeight.y), h);
        if (wH < 1f)
        {
            var d = Vector3.Distance(p0, p3);
            var t3d = t3; t3d.y -= cableDroop; t3d = t3d.sqrMagnitude > 1e-8f ? t3d.normalized : t3;
            var L = cableSlack * d + cableSlackExtra * SStep(0.05f, 0.6f, d);
            Span(p0, t0, Mathf.Min(0.4f * d, anchorHandle), p3, t3d, Mathf.Min(0.4f * d, plugHandle), L, Vector3.down, n, pts, 0, false);
            for (var i = 1; i < n; i++) pts[i].y = SoftFloor(pts[i].y, f);
        }
        if (wH <= 0f) return;
        if (twoPts == null || twoPts.Length != n + 1) { twoPts = new Vector3[n + 1]; smoothTmp = new Vector3[n + 1]; }
        var A = new Vector3(p0.x - p3.x, 0f, p0.z - p3.z); var hd = A.magnitude;
        var fH = new Vector3(t3.x, 0f, t3.z);
        if (hd > 1e-6f) A /= hd; else A = new Vector3(-fH.x, 0f, -fH.z).normalized;
        fH = fH.sqrMagnitude < 1e-8f ? A : fH.normalized;
        var F = (fH + touchdownToward * A).normalized;
        var T = new Vector3(p3.x, f, p3.z) + F * Mathf.Min(touchdown, 0.6f * hd);
        var tT = (Vector3.up - dropLean * A).normalized;              // from T back up the drop
        var dTA = new Vector3(p0.x - T.x, 0f, p0.z - T.z);
        dTA = dTA.sqrMagnitude < 1e-10f ? A : dTA.normalized;
        var dL = Vector3.Distance(p0, T);
        var side = new Vector3(dTA.z, 0f, -dTA.x); if (Vector3.Dot(side, fH) < 0f) side = -side;   // bow out on the side the port faces
        var sag = (side * floorBow + 0.5f * Vector3.down).normalized;
        var lenU = 1.1f * Mathf.Sqrt(h * h + (T.x - p3.x) * (T.x - p3.x) + (T.z - p3.z) * (T.z - p3.z));
        var lenL = floorSlack * dL + floorSlackExtra;
        var nU = Mathf.Clamp(Mathf.RoundToInt(n * lenU / Mathf.Max(1e-5f, lenU + lenL)), Mathf.Min(6, n / 2), Mathf.Max(n / 2, n - 6));
        var nL = n - nU;
        Span(p0, t0, Mathf.Min(0.4f * dL, anchorHandle), T, dTA, Mathf.Min(0.4f * dL, plugHandle), lenL, sag, nL, twoPts, 0, false);
        Span(p3, t3, bootHandle, T, tT, dropHandle * Mathf.Max(0f, h), 0f, sag, nU, twoPts, nL, true);
        for (var i = 1; i < n; i++) twoPts[i].y = SoftFloor(twoPts[i].y, f);
        for (var it = 0; it < cableSmoothing; it++)
        {
            System.Array.Copy(twoPts, smoothTmp, n + 1);
            for (var i = 2; i <= n - 2; i++) twoPts[i] = 0.25f * smoothTmp[i - 1] + 0.5f * smoothTmp[i] + 0.25f * smoothTmp[i + 1];
        }
        for (var i = 1; i < n; i++) twoPts[i].y = SoftFloor(twoPts[i].y, f);
        for (var i = 0; i <= n; i++) pts[i] = wH >= 1f ? twoPts[i] : Vector3.Lerp(pts[i], twoPts[i], wH);
    }

    // one span into o[at .. at + n] (reversed: o[at + n - i]): a cubic Bezier from a (along ta, handle ha) to b
    // (tb points from b back into the cable, handle hb), plus a sag of the slack L - d along sagDir, eased in from a
    void Span(Vector3 a, Vector3 ta, float ha, Vector3 b, Vector3 tb, float hb, float L, Vector3 sagDir, int n, Vector3[] o, int at, bool rev)
    {
        var d = Vector3.Distance(a, b);
        var s = Mathf.Sqrt(Mathf.Max(0f, 3f * d * (L - d) / 8f));
        var c1 = a + ta * ha; var c2 = b + tb * hb;
        var lip = Mathf.Max(1e-4f, anchorLip);
        for (var i = 0; i <= n; i++)
        {
            float u = (float)i / Mathf.Max(1, n), w1 = 1f - u;
            var P = a * (w1 * w1 * w1) + c1 * (3f * w1 * w1 * u) + c2 * (3f * w1 * u * u) + b * (u * u * u);
            if (s > 0f && i > 0 && i < n)
            {
                var w = SStep(0f, lip, Vector3.Distance(P, a));
                P += sagDir * (s * 4f * u * w1 * w * w);
            }
            o[at + (rev ? n - i : i)] = P;
        }
    }

    float SoftFloor(float y, float f)
    {
        var k = Mathf.Max(1e-4f, floorSoftness);
        var z = (y - f) / k;
        return f + k * (z > 30f ? z : Mathf.Log(1f + Mathf.Exp(z)));
    }

    void UpdateTube(int n, int sides, Vector3 t0)
    {
        var nv = (n + 1) * (sides + 1);
        var rebuild = n != builtSegs || sides != builtSides || verts == null;
        if (rebuild)
        {
            verts = new Vector3[nv]; pulseVerts = new Vector3[nv]; normals = new Vector3[nv];
            uvs = new Vector2[nv]; pulseUvs = new Vector2[nv];
        }
        var tr = tubeGo.transform;
        var N = Vector3.up; var len = 0f;
        var rp = cableRadius * 1.12f;
        for (var i = 0; i <= n; i++)
        {
            var T = pts[Mathf.Min(n, i + 1)] - pts[Mathf.Max(0, i - 1)];
            T = T.sqrMagnitude < 1e-14f ? t0 : T.normalized;
            if (i == 0) { N = Mathf.Abs(T.y) > 0.9f ? Vector3.right : Vector3.up; }
            N = (N - T * Vector3.Dot(N, T)).normalized;   // parallel transport
            var B = Vector3.Cross(T, N);
            if (i > 0) len += Vector3.Distance(pts[i], pts[i - 1]);
            for (var j = 0; j <= sides; j++)
            {
                var th = (float)j / sides * Mathf.PI * 2f;
                var dir = N * Mathf.Cos(th) + B * Mathf.Sin(th);
                var o = i * (sides + 1) + j;
                verts[o] = tr.InverseTransformPoint(pts[i] + dir * cableRadius);
                pulseVerts[o] = tr.InverseTransformPoint(pts[i] + dir * rp);
                normals[o] = tr.InverseTransformDirection(dir);
                uvs[o] = new Vector2(len / Mathf.Max(1e-4f, armourTile), (float)j / sides);
                pulseUvs[o] = new Vector2(len / Mathf.Max(1e-4f, pulseSpacing), (float)j / sides);
            }
        }
        CableLength = len;
        if (rebuild)
        {
            tubeMesh.Clear(); pulseMesh.Clear();
            tubeMesh.vertices = verts; tubeMesh.normals = normals; tubeMesh.uv = uvs;
            pulseMesh.vertices = pulseVerts; pulseMesh.normals = normals; pulseMesh.uv = pulseUvs;
            var white = new Color[nv];
            for (var i = 0; i < nv; i++) white[i] = Color.white;
            pulseMesh.colors = white;
            // Unity's front faces wind clockwise: these face outwards
            var tris = new int[n * sides * 6];
            var q = 0;
            for (var i = 0; i < n; i++)
                for (var j = 0; j < sides; j++)
                {
                    var a = i * (sides + 1) + j; var b = a + sides + 1;
                    tris[q++] = a; tris[q++] = a + 1; tris[q++] = b;
                    tris[q++] = b; tris[q++] = a + 1; tris[q++] = b + 1;
                }
            tubeMesh.triangles = tris; pulseMesh.triangles = tris;
            builtSegs = n; builtSides = sides;
        }
        else
        {
            tubeMesh.vertices = verts; tubeMesh.normals = normals; tubeMesh.uv = uvs;
            pulseMesh.vertices = pulseVerts; pulseMesh.normals = normals; pulseMesh.uv = pulseUvs;
        }
        tubeMesh.RecalculateTangents();   // the armour has a normal map
        tubeMesh.RecalculateBounds(); pulseMesh.RecalculateBounds();
    }

    void UpdateLines(int n)
    {
        var len = 0f;
        for (var i = 1; i <= n; i++) len += Vector3.Distance(pts[i], pts[i - 1]);
        CableLength = len;
        cableLine.positionCount = n + 1; cableLine.SetPositions(pts);
        pulseLine.positionCount = n + 1; pulseLine.SetPositions(pts);
        builtSegs = n; builtSides = cableSides;
    }

    // pulse strength now (DESIGN: handshake 0.25 flickering, upload 0.8, complete a 1.3 surge then off by 0.8 s)
    float PulseStrength()
    {
        switch (Current)
        {
            case State.Linking:
                return LinkT > PushEnd ? pulseHandshake * (0.6f + 0.4f * Mathf.Sin(now * 23f) * Mathf.Sin(now * 7f)) : 0f;
            case State.Uploading:
            case State.Disabling:
                return pulseUpload;
            case State.Complete:
                return stateT < 0.3f ? Mathf.Lerp(pulseUpload, pulseSurge, stateT / 0.3f) : pulseSurge * (1f - SStep(0.3f, 0.8f, stateT));
            default:
                return 0f;
        }
    }

    void UpdatePulse()
    {
        var line = pulseLine != null;
        var r = line ? (Renderer)pulseLine : pulseRenderer;
        if (r == null) return;
        var k = PulseStrength();
        if (pulseMat == null)
        {
            if (k > 0f && !pulseWarned) { pulseWarned = true; Debug.LogWarning("UplinkLaptop: no shader for the cable pulses; assign pulseMaterial", this); }
            r.enabled = false; return;
        }
        if (k <= 1e-3f) { r.enabled = false; return; }
        r.enabled = true;
        // texture coordinate along the cable = s / spacing + o = (speed t - x) / spacing, x from the plug end
        var o = Mathf.Repeat((pulseSpeed * now - CableLength) / Mathf.Max(1e-4f, pulseSpacing), 1f);
        var tiling = line ? CableLength / Mathf.Max(1e-4f, pulseSpacing) : 1f;
        var st = new Vector4(tiling, 1f, o, 0f);
        var c = pulseColor * (k * pulseIntensity); c.a = 1f;
        r.GetPropertyBlock(block);
        if (ownPulseTexture)
        {
            block.SetTexture("_MainTex", pulseTex);
            if (pulseMat.HasProperty("_BaseMap")) block.SetTexture("_BaseMap", pulseTex);
        }
        block.SetVector("_MainTex_ST", st);
        block.SetVector("_BaseMap_ST", st);
        block.SetColor("_BaseColor", c);
        block.SetColor("_Color", c);
        var tint = c * 0.5f; tint.a = 0.5f;   // Legacy Particles/Additive doubles the tint and uses its alpha
        block.SetColor("_TintColor", tint);
        r.SetPropertyBlock(block);
    }

    // ---------------------------------------------------------------- lights, screen, segments

    void UpdateLights()
    {
        // progress segments: shown when p >= i / 10; the next one blinks at 2 Hz while uploading
        var uploading = Current == State.Uploading || Current == State.Disabling;
        var lit = Current == State.Complete ? Segments : uploading ? Mathf.FloorToInt(progress * Segments + 1e-6f) : 0;
        var blink = uploading && Mathf.Sin(now * Mathf.PI * 4f) > 0f;
        for (var i = 0; i < Segments; i++)
            if (segments[i] != null) segments[i].localScale = Vector3.one * (i < lit || (blink && i == lit) ? 1f : Hidden);

        // screen cell
        int cell;
        switch (Current)
        {
            case State.Planting: cell = Mathf.FloorToInt(now * 4f) % 2 == 1 ? CellBootB : CellBootA; break;
            case State.Linking: cell = LinkT >= ScreenLinkAt ? CellLink : (Mathf.FloorToInt(now * 3f) % 2 == 1 ? CellSearchB : CellSearchA); break;
            case State.Uploading:
            case State.Disabling: cell = CellUpload + 2 * Mathf.Min(3, Mathf.FloorToInt(progress * 4f)) + Mathf.FloorToInt(now * 4f) % 2; break;
            case State.Complete: cell = CellComplete; break;
            case State.Disabled: cell = CellDisabled; break;
            default: cell = CellOff; break;
        }
        SetCell(cell);

        // status LED
        Color hue = idleColor; float k;
        switch (Current)
        {
            case State.Planting: k = Mathf.Sin(now * Mathf.PI * 4f) > 0f ? 1f : 0.15f; break;
            case State.Linking: k = Mathf.Sin(now * Mathf.PI * (LinkT >= LinkClip ? 8f : 4f)) > 0f ? 1f : 0.15f; break;
            case State.Uploading:
            case State.Disabling: k = Mathf.Repeat(now, 1f) < 0.1f ? 0.1f : 1f; break;
            case State.Complete: hue = completeColor; k = 1f; break;
            case State.Disabled: hue = alarmColor; k = stateT < 1.5f ? (Mathf.Sin(now * Mathf.PI * 8f) > 0f ? 1f : 0.1f) : 0.4f; break;
            default: k = 0f; break;
        }
        var status = hue * k;
        if (Changed(status, lastStatus)) { WriteGlow(statusGlow, hue, k * glowIntensity); lastStatus = status; }
        // the activity shuttle and the lever tell go dark when it dies
        var led = Current == State.Disabled ? 1f - Mathf.Clamp01(stateT / 0.3f) : 1f;
        if (Mathf.Abs(led - lastLed) > 0.01f) { WriteGlow(ledGlow, idleColor, led * glowIntensity); lastLed = led; }
    }

    // shows atlas cell 0..15: a whole-cell step in glTF UV space (v runs down the atlas), mapped through the imported
    // scale; glTFast flips V on the mesh, so cell (col, row) is offset (col / 4, -row / 4) from the imported offset
    public void SetCell(int cell)
    {
        cell = Mathf.Clamp(cell, 0, 15);
        if (cell == shownCell) return;
        shownCell = cell;
        float col = cell % 4, row = cell / 4;
        foreach (var a in atlas)
        {
            var o = a.offset + new Vector2(a.scale.x * col * 0.25f, -a.scale.y * row * 0.25f);
            a.mat.SetTextureOffset(a.prop, o);
            if (a.mat.HasProperty(a.prop + "_ST")) a.mat.SetVector(a.prop + "_ST", new Vector4(a.scale.x, a.scale.y, o.x, o.y));
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

    void StopLoops()
    {
        if (uploadSource != null) uploadSource.Stop();
        if (holdSource != null) holdSource.Stop();
    }

    void PlayClip(string clip, float fade)
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

    static float Clamp01(float x) { return Mathf.Clamp01(x); }
    static float Lin(float t, float a, float b) { return Clamp01((t - a) / (b - a)); }
    static float Ease(float t) { return t < 0.5f ? 4f * t * t * t : 1f - Mathf.Pow(-2f * t + 2f, 3f) / 2f; }
    static float EaseOut(float t) { return 1f - Mathf.Pow(1f - t, 3f); }
    static float SStep(float a, float b, float x) { var t = Clamp01((x - a) / (b - a)); return t * t * (3f - 2f * t); }
    static float Bump(float x, float w) { if (x <= 0f || x >= w) return 0f; var s = Mathf.Sin(Mathf.PI * x / w); return s * s; }

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
