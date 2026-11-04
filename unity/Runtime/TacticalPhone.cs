// The tactical phone: a rugged operator smartphone held in the left hand (screen toward the holder, thumb on the
// glass, the right hand stays on the weapon). Put it on the root of the tactical-phone prefab (built from
// unity/tactical-phone.glb with Tools > Gunmodls > Build Prefabs From Selection; import with Animation: Legacy).
//   Draw() / Holster()          the holder's draw and holster: draw sound, Wake() (and Unlock() if autoUnlock);
//                               holster sound, PowerOff() or ScreenOff() (powerOffOnHolster)
//   Wake(), Unlock()            boot to the lock screen, then into the current app
//   Tap(uv)                     a thumb tap on the glass (uv 0..1, (0, 0) = bottom left as the holder sees it):
//                               tick sound, onTap with the world point; unlocks a locked phone
//   Scan()                      the action key: the lug flashes, onScan fires 0.3 s in (do the ability's query
//                               then; ScanOrigin is the fx_scan locator), onScanResult at 1.0 s (lock_on cell 1.5 s)
//   SetAlert(on)                alert loop: red LEDs, alert cells, alert sound
//   LowBattery()                3 s of the amber battery cell, then back to the app
//   PowerOff(), ScreenOff()     shutdown animation to off / straight to a dark screen
//   SetPorts(open)              swing both rubber port flaps open or shut (any time, on top of the other clips)
//   SetApp(app), SetCell(c)     the app idle shows (Map, Drone, Scan, Home) / force an atlas cell (-1 = automatic)
//   SetTorch(on)                rear flash as a torch (emission + an optional spot light at fx_flash)
// Screen: 4 x 4 atlas cells (272 x 512 px each) on the 'screen' material's emissive map; a cell is shown by
// moving the texture offset by whole cells on a material copy owned by this component (glTFast applies *_ST with
// _TEXTURE_TRANSFORM, which the glb's identity KHR_texture_transform turns on). glTFast flips V on import, so
// cell (col, row) is the imported offset + (scale.x * col / 4, -scale.y * row / 4). droneFeed (a RenderTexture of
// the drone camera) replaces the drone cells while the Drone app is up.
// LEDs: the clips blink led_status / led_lug by scale (STEP keys); their tint comes from here, on copies of the
// 'led_status' and 'led_accent' materials (emissiveFactor for glTFast shaders, _EmissionColor for Standard / URP
// Lit, both in linear terms). glTF cannot animate emission.
// Clips (Legacy Animation): idle (2 s loop), wake 0.6, unlock 0.7, scan 1.2, alert (1 s loop), power_off 1.2,
// port_open 0.45. glTFast imports every clip as a loop and plays the first one on its own: Awake turns
// playAutomatically off and sets the wrap modes. Every clip keys all nine moving nodes, so this script drives
// the port flaps itself in LateUpdate (between the poses sampled from port_open at 0 and its end) and they stay
// open whatever clip plays. glTFast negates X on import (the holder's left is +X in the glb, -X in Unity; rotations
// about Y and Z flip sign); everything here reads poses from the imported nodes and clips, so nothing needs a sign.
using System;
using UnityEngine;
using UnityEngine.Events;

[RequireComponent(typeof(Animation))]
public class TacticalPhone : MonoBehaviour
{
    public enum App { Map, Drone, Scan, Home }
    public enum State { Off, Waking, Locked, Unlocking, Idle, Scanning, Alert, LowBattery, PoweringOff }

    [Header("Behaviour")]
    public App app = App.Map;
    public bool autoUnlock = true;               // Draw() goes straight through the lock screen
    public bool powerOffOnHolster = false;       // Holster(): the shutdown animation, or just a dark screen
    public bool startOn = false;                 // start in Idle (a phone already out) instead of Off

    [Header("Screen")]
    public float screenBrightness = 1.2f;
    public Texture droneFeed;                    // optional live drone camera; shown instead of the drone cells
    public bool flipFeed;                        // tick if the feed shows upside down on your import

    [Header("LEDs and torch")]
    public Color ledColor = new Color(0.541f, 0.302f, 1f);         // #8a4dff
    public Color alertColor = new Color(1f, 0.227f, 0.267f);       // #ff3a44
    public Color lowBatteryColor = new Color(1f, 0.702f, 0.278f);  // #ffb347
    public float glowIntensity = 1.5f;
    public float torchIntensity = 3f;
    public bool createTorchLight = true;
    public Light torchLight;                     // optional; made at fx_flash when createTorchLight

    [Header("Sound")]
    public AudioClip wake, unlock, tap, scan, scanResult, alert, lowBattery, powerOff, button, flapOpen, flapClose, draw, holster;

    [Header("Events")]
    public UnityEvent onWake, onUnlock, onScan, onScanResult, onAlert, onPowerOff, onTap;
    public event Action<Vector3> Tapped;         // world point on the glass

    public State Current { get; private set; }
    public float StateTime { get { return stateT; } }
    public Transform ScanOrigin { get { return fxScan; } }       // the lug tip
    public Transform TouchPoint { get { return fxTouch; } }      // thumb IK target on the glass
    public Transform Grip { get { return grip; } }               // the palm: parent this to the left hand bone
    public Transform RearCamera { get { return camRear; } }
    public Transform FrontCamera { get { return camFront; } }
    public bool TorchOn { get { return torchOn; } }

    // atlas cells (DESIGN 7): index = column + 4 * row from the top left
    public static readonly string[] Cells = { "off", "boot_a", "boot_b", "lock", "home", "map_a", "map_b", "drone_a", "drone_b", "scan_a", "scan_b", "lock_on", "alert_a", "alert_b", "low_battery", "shutdown" };
    const int Off = 0, BootA = 1, BootB = 2, LockCell = 3, HomeCell = 4, MapA = 5, MapB = 6, DroneA = 7, DroneB = 8, ScanA = 9, ScanB = 10, LockOn = 11, AlertA = 12, AlertB = 13, LowBat = 14, Shutdown = 15;
    const float ScreenW = 0.068f, ScreenH = 0.128f;

    static readonly string[] AtlasProps = { "emissiveTexture", "baseColorTexture", "_EmissionMap", "_BaseMap", "_MainTex" };
    struct AtlasSlot { public Material mat; public string prop; public Vector2 scale, offset; public Texture tex; }
    struct Glow { public Material mat; public float factorMax, colorMax; }

    Animation anim;
    AudioSource oneShot, loopSource;
    Transform screen, fxScan, fxTouch, fxFlash, grip, camRear, camFront, flapPort, flapSide;
    Quaternion portClosed, portOpen, sideClosed, sideOpen;
    readonly System.Collections.Generic.List<AtlasSlot> atlas = new System.Collections.Generic.List<AtlasSlot>();
    readonly System.Collections.Generic.List<Glow> statusGlow = new System.Collections.Generic.List<Glow>(), accentGlow = new System.Collections.Generic.List<Glow>(), flashGlow = new System.Collections.Generic.List<Glow>();
    readonly System.Collections.Generic.List<Material> owned = new System.Collections.Generic.List<Material>();
    State resumeState = State.Idle;
    float stateT, portT, portTarget, clock;
    int forcedCell = -1, shownCell = -1;
    bool feedShown, torchOn, scanFired, resultFired;
    Color lastStatus = new Color(-1f, 0f, 0f, 0f), lastAccent = new Color(-1f, 0f, 0f, 0f);

    void Awake()
    {
        anim = GetComponent<Animation>();
        anim.playAutomatically = false; anim.Stop();
        foreach (AnimationState s in anim)
        {
            s.layer = 0;
            s.wrapMode = s.name == "idle" || s.name == "alert" ? WrapMode.Loop : WrapMode.ClampForever;
        }
        foreach (var t in GetComponentsInChildren<Transform>(true))
        {
            switch (t.name)
            {
                case "screen": screen = t; break;
                case "fx_scan": fxScan = t; break;
                case "fx_touch": fxTouch = t; break;
                case "fx_flash": fxFlash = t; break;
                case "grip_left_hand": grip = t; break;
                case "cam_rear": camRear = t; break;
                case "cam_front": camFront = t; break;
                case "flap_port": flapPort = t; break;
                case "flap_side": flapSide = t; break;
            }
        }
        if (screen == null || fxScan == null) Debug.LogWarning("TacticalPhone: screen or fx_scan missing under " + name, this);
        // the flaps' closed and open poses, read from the clip so the import's mirroring is in them
        if (anim["port_open"] != null && flapPort != null && flapSide != null)
        {
            SamplePose("port_open", anim["port_open"].length);
            portOpen = flapPort.localRotation; sideOpen = flapSide.localRotation;
            SamplePose("port_open", 0f);
            portClosed = flapPort.localRotation; sideClosed = flapSide.localRotation;
        }
        else if (flapPort != null && flapSide != null) { portClosed = portOpen = flapPort.localRotation; sideClosed = sideOpen = flapSide.localRotation; }
        CollectMaterials();
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f; oneShot.playOnAwake = false;
        loopSource = gameObject.AddComponent<AudioSource>(); loopSource.spatialBlend = 1f; loopSource.loop = true; loopSource.playOnAwake = false;
        if (startOn) { Current = State.Idle; PlayClip("idle", 0f); }
        else { Current = State.Off; PlayClip("power_off", 0f); var s = anim["power_off"]; if (s != null) s.time = s.length; }
        WriteScreenBrightness();
    }

    void OnDestroy()
    {
        foreach (var m in owned) if (m != null) Destroy(m);
    }

    // one material copy per imported material it drives, shared by every renderer (and LOD) that used it
    void CollectMaterials()
    {
        var copies = new System.Collections.Generic.Dictionary<Material, Material>();
        foreach (var r in GetComponentsInChildren<Renderer>(true))
        {
            var mats = r.sharedMaterials;
            var changed = false;
            for (var i = 0; i < mats.Length; i++)
            {
                var m = mats[i];
                if (m == null) continue;
                var kind = NameIs(m.name, "screen") ? 1 : NameIs(m.name, "led_status") ? 2 : NameIs(m.name, "led_accent") ? 3 : NameIs(m.name, "flash_diffuser") ? 4 : 0;
                if (kind == 0) continue;
                Material copy;
                if (!copies.TryGetValue(m, out copy))
                {
                    copy = new Material(m) { name = m.name };
                    copies[m] = copy; owned.Add(copy);
                    copy.EnableKeyword("_EMISSIVE"); copy.EnableKeyword("_EMISSION");
                    if (kind == 1) AddAtlas(copy);
                    else
                    {
                        var g = new Glow { mat = copy, factorMax = MaxOf(ReadLinear(copy, "emissiveFactor")), colorMax = MaxOf(ReadLinear(copy, "_EmissionColor")) };
                        if (kind == 4) { g.factorMax = 1f; g.colorMax = 1f; flashGlow.Add(g); }
                        else if (kind == 2) statusGlow.Add(g); else accentGlow.Add(g);
                    }
                }
                mats[i] = copy;
                changed = true;
            }
            if (changed) r.sharedMaterials = mats;
        }
        if (atlas.Count == 0) Debug.LogWarning("TacticalPhone: no 'screen' material with an atlas under " + name, this);
    }

    void AddAtlas(Material m)
    {
        foreach (var p in AtlasProps)
        {
            // Standard and URP Lit move the emission map with the base map's tiling and offset, even when the base
            // map slot is empty, so _MainTex / _BaseMap count whenever the shader has them
            var shared = p == "_MainTex" || p == "_BaseMap";
            if (!m.HasProperty(p) || (!shared && m.GetTexture(p) == null)) continue;
            atlas.Add(new AtlasSlot { mat = m, prop = p, scale = m.GetTextureScale(p), offset = m.GetTextureOffset(p), tex = m.GetTexture(p) });
        }
        m.EnableKeyword("_TEXTURE_TRANSFORM");
    }

    // ---------------------------------------------------------------- commands

    public void Draw() { Play(draw); Wake(); }

    public void Holster()
    {
        Play(holster);
        if (powerOffOnHolster) PowerOff(); else ScreenOff();
    }

    public void Wake()
    {
        if (Current != State.Off && Current != State.PoweringOff) return;
        SetState(State.Waking);
        PlayClip("wake", 0.05f);
        Play(button);
        loopSource.Stop();
        if (onWake != null) onWake.Invoke();
    }

    public void Unlock()
    {
        if (Current == State.Waking) { pendingUnlock = true; return; }
        if (Current != State.Locked) return;
        SetState(State.Unlocking);
        PlayClip("unlock", 0.1f);
        Play(unlock);
        if (onUnlock != null) onUnlock.Invoke();
    }
    bool pendingUnlock;

    public void Tap(Vector2 uv)
    {
        if (Current == State.Off || Current == State.PoweringOff || Current == State.Waking) return;
        Play(tap);
        var p = TapPoint(uv);
        if (onTap != null) onTap.Invoke();
        if (Tapped != null) Tapped(p);
        if (Current == State.Locked) Unlock();
    }

    // the world point on the glass for uv (0..1, (0, 0) at the bottom left as the holder sees it). In Unity the
    // holder's right is the phone's local +X (glTFast negated X), up is +Y, and the glass faces -Z.
    public Vector3 TapPoint(Vector2 uv)
    {
        if (screen == null) return transform.position;
        return screen.TransformPoint(new Vector3((uv.x - 0.5f) * ScreenW, (uv.y - 0.5f) * ScreenH, -0.0006f));
    }

    public void Scan()
    {
        if (Current != State.Idle && Current != State.Scanning) return;
        SetState(State.Scanning);
        scanFired = resultFired = false;
        PlayClip("scan", 0.05f);
        Play(button);
    }

    public void SetAlert(bool on)
    {
        if (on)
        {
            if (Current == State.Off || Current == State.PoweringOff || Current == State.Alert) return;
            SetState(State.Alert);
            PlayClip("alert", 0.1f);
            if (alert != null) { loopSource.clip = alert; loopSource.Play(); }
            if (onAlert != null) onAlert.Invoke();
        }
        else if (Current == State.Alert)
        {
            loopSource.Stop();
            SetState(State.Idle);
            PlayClip("idle", 0.15f);
        }
    }

    public void LowBattery()
    {
        if (Current == State.Off || Current == State.PoweringOff || Current == State.LowBattery) return;
        resumeState = Current == State.Alert ? State.Alert : State.Idle;
        SetState(State.LowBattery);
        Play(lowBattery);
    }

    public void PowerOff()
    {
        if (Current == State.Off || Current == State.PoweringOff) return;
        loopSource.Stop();
        SetState(State.PoweringOff);
        PlayClip("power_off", 0.05f);
        Play(button);
        if (onPowerOff != null) onPowerOff.Invoke();
    }

    public void ScreenOff()
    {
        if (Current == State.Off) return;
        loopSource.Stop();
        SetState(State.Off);
        // the end of power_off: keys out, LEDs hidden
        PlayClip("power_off", 0f);
        var s = anim["power_off"]; if (s != null) s.time = s.length;
        if (onPowerOff != null) onPowerOff.Invoke();
    }

    public void SetPorts(bool open)
    {
        var target = open ? 1f : 0f;
        if (Mathf.Approximately(target, portTarget)) return;
        portTarget = target;
        Play(open ? flapOpen : flapClose);
    }

    public void SetApp(App a) { app = a; }

    // force atlas cell 0..15 (or by name); -1 hands the screen back to the state machine
    public void SetCell(int cell) { forcedCell = cell < 0 ? -1 : Mathf.Clamp(cell, 0, 15); }
    public void SetCell(string cellName) { SetCell(Array.IndexOf(Cells, cellName)); }

    public void SetTorch(bool on)
    {
        torchOn = on;
        if (on && torchLight == null && createTorchLight && fxFlash != null)
        {
            var go = new GameObject("torch_light");
            go.transform.SetParent(fxFlash, false);
            go.transform.localRotation = Quaternion.identity;     // fx_flash looks along the phone's +Z (out of the back)
            torchLight = go.AddComponent<Light>();
            torchLight.type = LightType.Spot; torchLight.spotAngle = 70f; torchLight.range = 12f; torchLight.intensity = torchIntensity;
            torchLight.color = new Color(1f, 0.96f, 0.9f);
        }
        if (torchLight != null) torchLight.enabled = on;
        WriteGlow(flashGlow, new Color(1f, 0.96f, 0.9f), on ? torchIntensity : 0f);
    }

    public void SetBrightness(float b) { screenBrightness = b; WriteScreenBrightness(); }

    // ---------------------------------------------------------------- state machine

    void Update()
    {
        var dt = Time.deltaTime;
        stateT += dt; clock += dt;
        switch (Current)
        {
            case State.Waking:
                if (stateT >= Length("wake"))
                {
                    SetState(State.Locked); PlayClip("idle", 0.1f);
                    if (pendingUnlock || autoUnlock) { pendingUnlock = false; Unlock(); }
                }
                break;
            case State.Unlocking:
                if (stateT >= Length("unlock")) { SetState(State.Idle); PlayClip("idle", 0.1f); }
                break;
            case State.Scanning:
                if (!scanFired && stateT >= 0.3f) { scanFired = true; Play(scan); if (onScan != null) onScan.Invoke(); }
                if (!resultFired && stateT >= 1.0f) { resultFired = true; Play(scanResult); if (onScanResult != null) onScanResult.Invoke(); }
                if (stateT >= Length("scan") && anim["scan"] != null && anim.IsPlaying("scan")) PlayClip("idle", 0.15f);
                if (stateT >= 2.5f) SetState(State.Idle);
                break;
            case State.LowBattery:
                if (stateT >= 3f) { SetState(resumeState); if (resumeState == State.Idle && !anim.IsPlaying("idle")) PlayClip("idle", 0.1f); }
                break;
            case State.PoweringOff:
                if (stateT >= Length("power_off")) SetState(State.Off);
                break;
        }
        var cell = forcedCell >= 0 ? forcedCell : CellFor();
        ShowCell(cell);
        UpdateLeds();
        if (!Mathf.Approximately(portT, portTarget)) portT = Mathf.MoveTowards(portT, portTarget, dt / 0.45f);
    }

    void LateUpdate()
    {
        // the flaps follow portT on top of whatever clip plays (every clip keys them closed)
        if (flapPort == null || flapSide == null || portT <= 0f) return;
        // the same stagger as port_open: the USB flap over 0-0.35 s, the side flap over 0.1-0.45 s
        flapPort.localRotation = Quaternion.Slerp(portClosed, portOpen, Ease(Lin(portT, 0f, 0.78f)));
        flapSide.localRotation = Quaternion.Slerp(sideClosed, sideOpen, Ease(Lin(portT, 0.22f, 1f)));
    }

    // DESIGN 7: the cell sequencing table
    int CellFor()
    {
        var t = stateT;
        switch (Current)
        {
            case State.Off: return Off;
            case State.Waking: return t < 0.25f ? Off : t < 0.5f ? Blink(BootA, BootB, 8f, t) : LockCell;
            case State.Locked: return LockCell;
            case State.Unlocking: return t < 0.45f ? LockCell : HomeCell;
            case State.Scanning: return t < 0.25f ? AppCell(clock, true) : t < 1.0f ? Blink(ScanA, ScanB, 6f, t) : LockOn;
            case State.Alert: return Blink(AlertA, AlertB, 4f, t);
            case State.LowBattery: return Blink(LowBat, Off, 1f, t);
            case State.PoweringOff: return t < 0.6f ? AppCell(clock, true) : t < 0.95f ? Shutdown : Off;
            default: return AppCell(clock, false);
        }
    }

    int AppCell(float t, bool still)
    {
        switch (app)
        {
            case App.Drone: return still ? DroneA : Blink(DroneA, DroneB, 6f, t);
            case App.Scan: return still ? ScanA : Blink(ScanA, ScanB, 6f, t);
            case App.Home: return HomeCell;
            default: return still ? MapA : Blink(MapA, MapB, 2f, t);
        }
    }

    static int Blink(int a, int b, float hz, float t) { return ((int)Mathf.Floor(t * hz)) % 2 == 1 ? b : a; }

    void UpdateLeds()
    {
        var status = Current == State.Alert ? alertColor : Current == State.LowBattery ? lowBatteryColor : ledColor;
        var accent = Current == State.Alert ? alertColor : ledColor;
        var k = Current == State.Off ? 0f : glowIntensity;
        var sc = status * k; var ac = accent * k;
        if (Changed(sc, lastStatus)) { WriteGlow(statusGlow, status, k); lastStatus = sc; }
        if (Changed(ac, lastAccent)) { WriteGlow(accentGlow, accent, k); lastAccent = ac; }
    }

    // ---------------------------------------------------------------- screen

    void ShowCell(int cell)
    {
        var feed = droneFeed != null && (cell == DroneA || cell == DroneB);
        if (feed)
        {
            if (feedShown) return;
            feedShown = true; shownCell = -1;
            foreach (var a in atlas)
            {
                // the mesh's UVs cover one cell: stretch the whole feed over that cell's range
                var s = new Vector2(a.scale.x * 4f, a.scale.y * 4f);
                var o = new Vector2(a.offset.x * 4f, a.offset.y * 4f - 3f * Mathf.Sign(a.scale.y));
                if (flipFeed) { s.y = -s.y; o.y = 1f - o.y; }
                Apply(a, droneFeed, s, o);
            }
            return;
        }
        if (cell == shownCell && !feedShown) return;
        feedShown = false; shownCell = cell;
        float col = cell % 4, row = cell / 4;
        foreach (var a in atlas) Apply(a, a.tex, a.scale, a.offset + new Vector2(a.scale.x * col * 0.25f, -a.scale.y * row * 0.25f));
    }

    static void Apply(AtlasSlot a, Texture tex, Vector2 s, Vector2 o)
    {
        if (tex != null && a.mat.GetTexture(a.prop) != tex) a.mat.SetTexture(a.prop, tex);
        a.mat.SetTextureScale(a.prop, s);
        a.mat.SetTextureOffset(a.prop, o);
        if (a.mat.HasProperty(a.prop + "_ST")) a.mat.SetVector(a.prop + "_ST", new Vector4(s.x, s.y, o.x, o.y));
    }

    void WriteScreenBrightness()
    {
        var seen = new System.Collections.Generic.HashSet<Material>();
        foreach (var a in atlas)
        {
            if (!seen.Add(a.mat)) continue;
            WriteLinear(a.mat, "emissiveFactor", Color.white * screenBrightness);
            WriteLinear(a.mat, "_EmissionColor", Color.white * screenBrightness);
        }
    }

    // ---------------------------------------------------------------- helpers

    void SetState(State s) { Current = s; stateT = 0f; }

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

    void Play(AudioClip c) { if (c != null && oneShot != null) oneShot.PlayOneShot(c); }

    static float Lin(float t, float a, float b) { return Mathf.Clamp01((t - a) / (b - a)); }
    static float Ease(float t) { return t < 0.5f ? 4f * t * t * t : 1f - Mathf.Pow(-2f * t + 2f, 3f) / 2f; }

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

    static void WriteGlow(System.Collections.Generic.List<Glow> list, Color hue, float k)
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
