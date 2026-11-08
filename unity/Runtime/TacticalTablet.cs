// The tactical tablet: a rugged 8-inch tablet (131.6 x 212 x 15.8 mm over the corner bumpers; the Tactical Phone's
// construction at tablet scale: an anodised mid-frame under a TPU overmould, four TPU corner bumpers on Torx screws, a
// nylon back cover with a battery door, the same black-glass camera window) held in the left hand under the back strap,
// screen toward the holder. Put it on the root of the tactical-tablet prefab (built from unity/tactical-tablet.glb with
// Tools > Gunmodls > Build Prefabs From Selection; import with Animation: Legacy). Same API shape as TacticalPhone (plus SetStrap and the touch trigger).
//   Draw() / Holster()          draw sound, Wake() (and Unlock() if autoUnlock) / holster sound, PowerOff() or ScreenOff()
//   Wake(), Unlock()            boot to the lock screen, then into the current app
//   Tap(uv)                     a touch on the glass (uv 0..1, (0, 0) = bottom left as the holder sees it): tick, onTap
//                               (no arguments) and the Tapped event (with the world point); unlocks a locked tablet.
//                               TouchCollider is a thin trigger box in front of the glass (made on start; the imported
//                               screen_COL sits inside body_COL and is switched off): raycast it, then Tap(TouchUV(hit.point))
//   Scan()                      the programmable top key: thermal scan; onScan fires 0.3 s in (ScanOrigin is the
//                               fx_scan locator at the thermal window), onScanResult at 1.0 s (lock_on cell for 1.5 s)
//   PttDown() / PttUp()         push-to-talk on the violet side key: key-up chirp, the radio talk screen, the key held
//                               (the ptt clip loops 0.3-1.3 s while held), then the release beep and back to the app.
//                               During an alert the radio keys up under the alert screen (key held down); when the alert
//                               ends with the key still held, the talk screen takes over (an unlocked tablet)
//   SetAlert(on), LowBattery()  red alert loop (screen and LED both at 4 Hz, in phase) / the battery warning shown
//                               steady for 3 s, then back
//   PowerOff(), ScreenOff()     power menu and shutdown to off (onPowerOff) / straight to a dark screen (onScreenOff;
//                               Holster() with powerOffOnHolster off takes this path, so it fires onScreenOff only).
//                               Anything that ends a held PTT other than PttUp() (PowerOff, ScreenOff, Holster, LowBattery,
//                               the end of an alert raised before unlock) releases it first: onPttUp always follows onPttDown.
//                               A PTT held when an alert starts stays keyed through it.
//   SetFlap(open), SetPorts(o)  swing the USB-C flap open or shut (any time, on top of the other clips); SetPorts is the
//                               phone script's name for the same call
//   SetStrap(on)                show or hide the back hand strap (hand_strap)
//   SetApp(app), SetCell(c)     the app idle shows (Map, Drone, Scan, Home, Radio) / force an atlas cell (-1 = automatic)
//   SetTorch(on)                rear flash as a torch (emission + an optional spot light at fx_flash)
// Screen: 5 x 4 atlas cells (320 x 512 px each) on the 'screen' material's emissive map; a cell is shown by moving the
// texture offset by whole cells on a material copy owned by this component (glTFast applies *_ST with
// _TEXTURE_TRANSFORM, which the glb's KHR_texture_transform turns on). The glb ships showing the lock cell (offset
// [0.4, 0]); that column is taken back out on start. glTFast flips V on import, so cell (col, row) is the cell-0 offset
// + (scale.x * col / 5, -scale.y * row / 4). droneFeed (a RenderTexture) replaces the drone cells while the Drone app is up.
// LED: one status LED in the top bezel (left of the ALS window); the clips blink led_status by scale (STEP keys) and its tint
// comes from here, on a copy of the
// 'led_status' material (emissiveFactor for glTFast shaders, _EmissionColor for Standard / URP Lit, in linear terms).
// The PTT key is pigment (ptt_accent), not a light. glTF cannot animate emission.
// Clips (Legacy Animation): idle (2 s loop), wake 0.6, unlock 0.7, ptt 1.6, scan 1.2, alert (1 s loop), power_off 1.2,
// flap_open 0.45. glTFast imports every clip as a loop and plays the first one on its own: Awake turns
// playAutomatically off and sets the wrap modes. Every clip keys all seven moving nodes, so this script drives the USB
// flap itself in LateUpdate (between the poses sampled from flap_open at 0 and its end) and it stays open whatever clip
// plays. glTFast negates X on import (the holder's left is +X in the glb, -X in Unity); everything here reads poses
// from the imported nodes and clips, so nothing needs a sign.
using System;
using UnityEngine;
using UnityEngine.Events;

[RequireComponent(typeof(Animation))]
public class TacticalTablet : MonoBehaviour
{
    public enum App { Map, Drone, Scan, Home, Radio }
    public enum State { Off, Waking, Locked, Unlocking, Idle, Scanning, Talking, Alert, LowBattery, PoweringOff }

    [Header("Behaviour")]
    public App app = App.Map;
    public bool autoUnlock = true;               // Draw() goes straight through the lock screen
    public bool powerOffOnHolster = false;       // Holster(): the shutdown animation, or just a dark screen
    public bool startOn = false;                 // start in Idle (a tablet already out) instead of Off
    public bool showStrap = true;                // the back hand strap

    [Header("Screen")]
    public float screenBrightness = 1.1f;
    public Texture droneFeed;                    // optional live drone camera; shown instead of the drone cells
    public bool flipFeed;                        // tick if the feed shows upside down on your import

    [Header("LED and torch")]
    public Color ledColor = new Color(0.184f, 0.761f, 0.420f);     // #2fc26b
    public Color alertColor = new Color(1f, 0.227f, 0.267f);       // #ff3a44
    public Color lowBatteryColor = new Color(1f, 0.702f, 0.278f);  // #ffb347
    public float glowIntensity = 1.5f;
    public float torchIntensity = 3f;
    public bool createTorchLight = true;
    public Light torchLight;                     // optional; made at fx_flash when createTorchLight

    [Header("Sound")]
    public AudioClip wake, unlock, tap, scan, scanResult, alert, lowBattery, powerOff, button, flapOpen, flapClose, draw, holster, pttChirp, pttRelease;

    [Header("Events")]
    public UnityEvent onWake, onUnlock, onScan, onScanResult, onAlert, onPowerOff, onScreenOff, onTap, onPttDown, onPttUp;
    public event Action<Vector3> Tapped;         // world point on the glass (onTap carries no arguments)

    [Header("Touch")]
    public bool makeTouchCollider = true;        // a thin trigger box from the glass to 0.5 mm in front of the bumper lip, over the display
    public int touchLayer = -1;                  // layer for it (-1 = this object's layer); keep body_COL on another layer

    public State Current { get; private set; }
    public float StateTime { get { return stateT; } }
    public Transform ScanOrigin { get { return fxScan; } }       // the thermal window
    public Transform TouchPoint { get { return fxTouch; } }      // thumb IK target on the glass
    public Transform Grip { get { return grip; } }               // the palm under the strap: parent this to the left hand bone
    public Transform RearCamera { get { return camRear; } }
    public Transform ThermalCamera { get { return camThermal; } }
    public Transform FrontCamera { get { return camFront; } }
    public Transform PttKey { get { return fxPtt; } }            // the PTT key face (right-hand or thumb IK target)
    public bool TorchOn { get { return torchOn; } }
    public bool Talking { get { return Current == State.Talking; } }
    public bool PttHeld { get { return pttHeld; } }
    public BoxCollider TouchCollider { get { return touch; } }

    // atlas cells (DESIGN 6): index = column + 5 * row from the top left; the same names and order as TacticalPhone
    public static readonly string[] Cells = { "off", "boot", "lock", "home", "app_open", "map_a", "map_b", "scan_a", "scan_b", "lock_on",
        "drone_a", "drone_b", "ptt_idle", "ptt_talk", "call_in", "alert_a", "alert_b", "low_battery", "power_menu", "shutdown" };
    const int Off = 0, Boot = 1, LockCell = 2, HomeCell = 3, AppOpen = 4, MapA = 5, MapB = 6, ScanA = 7, ScanB = 8, LockOn = 9,
        DroneA = 10, DroneB = 11, PttIdle = 12, PttTalk = 13, CallIn = 14, AlertA = 15, AlertB = 16, LowBat = 17, PowerMenu = 18, Shutdown = 19;
    const int GridX = 5, GridY = 4;
    // each cell's art fills its inner area; an 8 px (of 320) / 13 px (of 512) gutter of edge pixels surrounds it, and the
    // screen mesh's UVs cover only that inner area (so mip levels never bleed a neighbouring cell into the screen)
    const float GutterU = 8f / 320f, GutterV = 13f / 512f;
    const int DefaultCell = LockCell;           // the cell the glb's KHR_texture_transform shows without this script
    const float ScreenW = 0.1077f, ScreenH = 0.1723f;
    // the touch trigger, in the screen node's frame (the display plane is at z 0; the glass front 1.07 mm toward -Z, the
    // overmould lip 1.67 mm and the bumpers' lip 2.27 mm): from the glass front to 0.5 mm in front of the bumper lip
    const float TouchZ0 = -0.00107f, TouchZ1 = -0.00277f;
    const float PttHoldFrom = 0.3f, PttHoldTo = 1.3f, PttRelease = 1.4f;

    static readonly string[] AtlasProps = { "emissiveTexture", "baseColorTexture", "_EmissionMap", "_BaseMap", "_MainTex" };
    struct AtlasSlot { public Material mat; public string prop; public Vector2 scale, offset; public Texture tex; }
    struct Glow { public Material mat; public float factorMax, colorMax; }

    Animation anim;
    AudioSource oneShot, loopSource;
    Transform screen, fxScan, fxTouch, fxFlash, fxPtt, grip, camRear, camThermal, camFront, flapUsb, strap, btnPtt;
    Quaternion flapClosed, flapOpenPose;
    Vector3 pttDownPos;
    readonly System.Collections.Generic.List<AtlasSlot> atlas = new System.Collections.Generic.List<AtlasSlot>();
    readonly System.Collections.Generic.List<Glow> statusGlow = new System.Collections.Generic.List<Glow>(), flashGlow = new System.Collections.Generic.List<Glow>();
    readonly System.Collections.Generic.List<Material> owned = new System.Collections.Generic.List<Material>();
    State resumeState = State.Idle, alertResume = State.Idle;
    BoxCollider touch;
    float stateT, flapT, flapTarget, clock;
    int forcedCell = -1, shownCell = -1;
    bool feedShown, feedFlip, torchOn, scanFired, resultFired, scanToIdle, pttHeld, pendingUnlock;
    Texture feedTex;                             // the feed texture last applied (a new droneFeed is picked up at once)
    int cues;                                   // timed sound cues already played in this state (bit per cue)
    Color lastStatus = new Color(-1f, 0f, 0f, 0f);

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
                case "fx_ptt": fxPtt = t; break;
                case "grip_left_hand": grip = t; break;
                case "cam_rear": camRear = t; break;
                case "cam_thermal": camThermal = t; break;
                case "cam_front": camFront = t; break;
                case "flap_usb": flapUsb = t; break;
                case "hand_strap": strap = t; break;
                case "btn_ptt": btnPtt = t; break;
            }
        }
        if (screen == null || fxScan == null) Debug.LogWarning("TacticalTablet: screen or fx_scan missing under " + name, this);
        // the flap's closed and open poses, read from the clip so the import's mirroring is in them
        if (flapUsb != null)
        {
            if (anim["flap_open"] != null)
            {
                SamplePose("flap_open", anim["flap_open"].length); flapOpenPose = flapUsb.localRotation;
                SamplePose("flap_open", 0f); flapClosed = flapUsb.localRotation;
            }
            else flapClosed = flapOpenPose = flapUsb.localRotation;
        }
        if (btnPtt != null) { if (anim["ptt"] != null) SamplePose("ptt", 0.8f); pttDownPos = btnPtt.localPosition; }
        CollectMaterials();
        if (makeTouchCollider) MakeTouchCollider();
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f; oneShot.playOnAwake = false;
        loopSource = gameObject.AddComponent<AudioSource>(); loopSource.spatialBlend = 1f; loopSource.loop = true; loopSource.playOnAwake = false;
        SetStrap(showStrap);
        if (startOn) { Current = State.Idle; PlayClip("idle", 0f); }
        else { Current = State.Off; PlayClip("power_off", 0f); var s = anim["power_off"]; if (s != null) s.time = s.length; }
        WriteScreenBrightness();
    }

    // switch off the imported screen_COL (it lies inside body_COL, so no ray from outside can reach it) and put a thin
    // trigger in front of the glass instead
    void MakeTouchCollider()
    {
        if (screen == null) return;
        foreach (var t in GetComponentsInChildren<Transform>(true))
            if (t.name == "screen_COL") foreach (var c in t.GetComponents<Collider>()) c.enabled = false;
        var go = new GameObject("screen_touch");
        go.transform.SetParent(screen, false);
        go.layer = touchLayer >= 0 ? touchLayer : gameObject.layer;
        touch = go.AddComponent<BoxCollider>();
        touch.isTrigger = true;
        touch.center = new Vector3(0f, 0f, (TouchZ0 + TouchZ1) * 0.5f);
        touch.size = new Vector3(ScreenW, ScreenH, Mathf.Abs(TouchZ1 - TouchZ0));
    }

    // uv (0..1, (0, 0) bottom left as the holder sees it) of a world point on or near the glass, for Tap(TouchUV(hit.point))
    public Vector2 TouchUV(Vector3 world)
    {
        if (screen == null) return new Vector2(0.5f, 0.5f);
        var p = screen.InverseTransformPoint(world);
        return new Vector2(Mathf.Clamp01(p.x / ScreenW + 0.5f), Mathf.Clamp01(p.y / ScreenH + 0.5f));
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
                var kind = NameIs(m.name, "screen") ? 1 : NameIs(m.name, "led_status") ? 2 : NameIs(m.name, "flash_diffuser") ? 3 : 0;
                if (kind == 0) continue;
                Material copy;
                if (!copies.TryGetValue(m, out copy))
                {
                    copy = new Material(m) { name = m.name };
                    copies[m] = copy; owned.Add(copy);
                    copy.EnableKeyword("_EMISSIVE"); copy.EnableKeyword("_EMISSION");
                    if (kind == 1) AddAtlas(copy);
                    else if (kind == 2) statusGlow.Add(new Glow { mat = copy, factorMax = MaxOf(ReadLinear(copy, "emissiveFactor")), colorMax = MaxOf(ReadLinear(copy, "_EmissionColor")) });
                    else flashGlow.Add(new Glow { mat = copy, factorMax = 1f, colorMax = 1f });
                }
                mats[i] = copy;
                changed = true;
            }
            if (changed) r.sharedMaterials = mats;
        }
        if (atlas.Count == 0) Debug.LogWarning("TacticalTablet: no 'screen' material with an atlas under " + name, this);
    }

    void AddAtlas(Material m)
    {
        // the emissive slot carries the imported transform (KHR_texture_transform): the glb ships showing the lock cell
        // (DefaultCell, row 0), so its column is taken back out to get cell 0's offset
        var hasRef = false; Vector2 refScale = Vector2.one, refOffset = Vector2.zero;
        foreach (var p in AtlasProps)
        {
            var shared = p == "_MainTex" || p == "_BaseMap";
            if (shared || !m.HasProperty(p) || m.GetTexture(p) == null) continue;
            var sc = m.GetTextureScale(p);
            var off = m.GetTextureOffset(p) - new Vector2(sc.x * (DefaultCell % GridX) / (float)GridX, 0f);
            if (!hasRef) { hasRef = true; refScale = sc; refOffset = off; }
            atlas.Add(new AtlasSlot { mat = m, prop = p, scale = sc, offset = off, tex = m.GetTexture(p) });
        }
        // Standard and URP Lit move the emission map with the base map's tiling and offset, even when the base map slot
        // is empty, so _MainTex / _BaseMap are driven too; they take the emissive slot's transform (after a shader or
        // material conversion they can come in as (1, 1) / (0, 0), which would put the screen two columns off)
        foreach (var p in AtlasProps)
        {
            var shared = p == "_MainTex" || p == "_BaseMap";
            if (!shared || !m.HasProperty(p)) continue;
            Vector2 sc, off;
            if (hasRef) { sc = refScale; off = refOffset; }
            else { sc = m.GetTextureScale(p); off = m.GetTextureOffset(p) - new Vector2(sc.x * (DefaultCell % GridX) / (float)GridX, 0f); }
            atlas.Add(new AtlasSlot { mat = m, prop = p, scale = sc, offset = off, tex = m.GetTexture(p) });
        }
        m.EnableKeyword("_TEXTURE_TRANSFORM");
    }

    // ---------------------------------------------------------------- commands

    public void Draw() { Play(draw); Wake(); }

    public void Holster()
    {
        if (Current == State.Off) return;          // already dark: nothing to put away, no sound
        Play(holster);
        ReleasePtt();
        if (powerOffOnHolster) PowerOff(); else ScreenOff();
    }

    public void Wake()
    {
        if (Current != State.Off && Current != State.PoweringOff) return;
        SetState(State.Waking);
        pendingUnlock = false;
        PlayClip("wake", 0.05f);              // button at 0.05 s and wake at 0.25 s (Update)
        loopSource.Stop();
        if (onWake != null) onWake.Invoke();
    }

    public void Unlock()
    {
        if (Current == State.Waking) { pendingUnlock = true; return; }
        // an alert raised before unlock hands back to the lock screen: remember the unlock for then
        if (Current == State.Alert && alertResume == State.Locked) { pendingUnlock = true; return; }
        if (Current == State.LowBattery && resumeState == State.Locked) { pendingUnlock = true; return; }
        if (Current != State.Locked) return;
        SetState(State.Unlocking);
        PlayClip("unlock", 0.1f);             // tap at 0.3 s and unlock at 0.42 s (Update)
        if (onUnlock != null) onUnlock.Invoke();
    }

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
    // holder's right is the tablet's local +X (glTFast negated X), up is +Y, and the glass faces -Z.
    public Vector3 TapPoint(Vector2 uv)
    {
        if (screen == null) return transform.position;
        return screen.TransformPoint(new Vector3((uv.x - 0.5f) * ScreenW, (uv.y - 0.5f) * ScreenH, -0.0012f));
    }

    public void Scan()
    {
        if (Current != State.Idle && Current != State.Scanning) return;
        SetState(State.Scanning);
        scanFired = resultFired = scanToIdle = false;
        PlayClip("scan", 0.05f);              // button at 0.05 s, scan 0.3 s, scan_result 1.0 s (Update)
    }

    // push-to-talk: key down. Works from Idle and Scanning (an alert keeps its screen; the radio still keys up).
    public void PttDown()
    {
        if (Current != State.Idle && Current != State.Scanning && Current != State.Alert) return;
        if (Current == State.Alert)
        {
            if (pttHeld) return;
            pttHeld = true; Play(button); Play(pttChirp);     // the key is held down in LateUpdate under the alert clip
            if (onPttDown != null) onPttDown.Invoke();
            return;
        }
        SetState(State.Talking);
        pttHeld = true;
        PlayClip("ptt", 0.05f);               // the key goes down at 0.05 s
        Play(button); Play(pttChirp);
        if (onPttDown != null) onPttDown.Invoke();
    }

    public void PttUp()
    {
        if (!pttHeld) return;
        ReleasePtt();
        if (Current != State.Talking) return;
        // jump to the release part of the clip (the key comes back out at 1.4 s)
        var s = anim["ptt"];
        if (s != null && s.time < PttHoldTo) s.time = PttHoldTo;
        stateT = Mathf.Max(stateT, PttHoldTo);
    }

    // ends a held PTT whatever ends it: the release beep and onPttUp, so the game's radio never stays keyed
    void ReleasePtt()
    {
        if (!pttHeld) return;
        pttHeld = false;
        Play(pttRelease);
        if (onPttUp != null) onPttUp.Invoke();
    }

    public void SetAlert(bool on)
    {
        if (on)
        {
            if (Current == State.Off || Current == State.PoweringOff || Current == State.Alert) return;
            // a held PTT stays keyed through the alert (the same as a PTT pressed during it); LateUpdate holds the key down
            // where the alert hands back to: a tablet that was not yet unlocked goes back to its lock screen
            alertResume = Current <= State.Unlocking || (Current == State.LowBattery && resumeState == State.Locked) ? State.Locked : State.Idle;
            SetState(State.Alert);
            PlayClip("alert", 0.1f);
            if (alert != null) { loopSource.clip = alert; loopSource.Play(); }
            if (onAlert != null) onAlert.Invoke();
        }
        else if (Current == State.Alert)
        {
            loopSource.Stop();
            if (pttHeld && alertResume == State.Idle)
            {
                // the key is still held: hand over to the talk screen with the ptt clip in its held span
                SetState(State.Talking);
                PlayClip("ptt", 0.1f);
                var s = anim["ptt"]; if (s != null) s.time = PttHoldFrom;
                stateT = PttHoldFrom;
                return;
            }
            ReleasePtt();                         // an alert raised before unlock goes back to the lock screen: unkey
            SetState(alertResume);
            PlayClip("idle", 0.15f);
            if (alertResume == State.Locked && (pendingUnlock || autoUnlock)) { pendingUnlock = false; Unlock(); }
        }
        else if (Current == State.LowBattery && resumeState == State.Alert)
        {
            loopSource.Stop();
            resumeState = alertResume;
            PlayClip("idle", 0.15f);
        }
    }

    public void LowBattery()
    {
        if (Current == State.Off || Current == State.PoweringOff || Current == State.LowBattery) return;
        if (Current == State.Talking) PttUp(); else ReleasePtt();
        resumeState = Current == State.Alert ? State.Alert : Current == State.Waking || Current == State.Locked || Current == State.Unlocking ? State.Locked : State.Idle;
        SetState(State.LowBattery);
        Play(lowBattery);
    }

    public void PowerOff()
    {
        if (Current == State.Off || Current == State.PoweringOff) return;
        ReleasePtt();
        loopSource.Stop();
        SetState(State.PoweringOff);
        PlayClip("power_off", 0.05f);         // button at 0.05 s and power_off at 0.6 s (Update)
        if (onPowerOff != null) onPowerOff.Invoke();
    }

    public void ScreenOff()
    {
        if (Current == State.Off) return;
        ReleasePtt();
        loopSource.Stop();
        SetState(State.Off);
        PlayClip("power_off", 0f);            // the end of power_off: keys out, LED hidden
        var s = anim["power_off"]; if (s != null) s.time = s.length;
        if (onScreenOff != null) onScreenOff.Invoke();
    }

    public void SetFlap(bool open)
    {
        var target = open ? 1f : 0f;
        if (Mathf.Approximately(target, flapTarget)) return;
        flapTarget = target;
        Play(open ? flapOpen : flapClose);
    }

    // the phone's name for the same call (TacticalPhone.SetPorts), so shared code can drive either gadget
    public void SetPorts(bool open) { SetFlap(open); }

    public void SetStrap(bool on) { showStrap = on; if (strap != null) strap.gameObject.SetActive(on); }

    public void SetApp(App a) { app = a; }

    // force atlas cell 0..19 (or by name); -1 hands the screen back to the state machine
    public void SetCell(int cell) { forcedCell = cell < 0 ? -1 : Mathf.Clamp(cell, 0, Cells.Length - 1); }
    public void SetCell(string cellName) { SetCell(Array.IndexOf(Cells, cellName)); }

    public void SetTorch(bool on)
    {
        torchOn = on;
        if (on && torchLight == null && createTorchLight && fxFlash != null)
        {
            var go = new GameObject("torch_light");
            go.transform.SetParent(fxFlash, false);
            go.transform.localRotation = Quaternion.identity;     // fx_flash looks along the tablet's +Z (out of the back)
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
                Cue(0, 0.05f, button); Cue(1, 0.25f, wake);
                if (stateT >= Length("wake"))
                {
                    SetState(State.Locked); PlayClip("idle", 0.1f);
                    if (pendingUnlock || autoUnlock) { pendingUnlock = false; Unlock(); }
                }
                break;
            case State.Unlocking:
                Cue(0, 0.3f, tap); Cue(1, 0.42f, unlock);
                if (stateT >= Length("unlock")) { SetState(State.Idle); PlayClip("idle", 0.1f); }
                break;
            case State.Scanning:
                Cue(0, 0.05f, button);
                if (!scanFired && stateT >= 0.3f) { scanFired = true; Play(scan); if (onScan != null) onScan.Invoke(); }
                if (!resultFired && stateT >= 1.0f) { resultFired = true; Play(scanResult); if (onScanResult != null) onScanResult.Invoke(); }
                // hand back to idle once: IsPlaying("scan") stays true through the cross-fade, so testing it here every
                // frame restarted idle at time 0 for the whole fade
                if (!scanToIdle && stateT >= Length("scan")) { scanToIdle = true; PlayClip("idle", 0.15f); }
                if (stateT >= 2.5f) SetState(State.Idle);
                break;
            case State.Talking:
                {
                    var s = anim["ptt"];
                    // hold: loop the key-down span while the key is held
                    if (pttHeld && s != null && s.time >= PttHoldTo) { s.time = PttHoldFrom; stateT = PttHoldFrom; }
                    if (!pttHeld && stateT >= Length("ptt")) { SetState(State.Idle); PlayClip("idle", 0.15f); }
                }
                break;
            case State.LowBattery:
                if (stateT >= 3f)
                {
                    SetState(resumeState);
                    if (resumeState != State.Alert && !anim.IsPlaying("idle")) PlayClip("idle", 0.1f);
                    if (resumeState == State.Locked && (pendingUnlock || autoUnlock)) { pendingUnlock = false; Unlock(); }
                }
                break;
            case State.PoweringOff:
                Cue(0, 0.05f, button); Cue(1, 0.6f, powerOff);
                if (stateT >= Length("power_off")) SetState(State.Off);
                break;
        }
        var cell = forcedCell >= 0 ? forcedCell : CellFor();
        ShowCell(cell);
        UpdateLed();
        if (!Mathf.Approximately(flapT, flapTarget)) flapT = Mathf.MoveTowards(flapT, flapTarget, dt / 0.45f);
    }

    void LateUpdate()
    {
        // a PTT held during an alert: the alert clip keys btn_ptt out, so hold the key down here (the ptt clip's held pose)
        if (pttHeld && Current == State.Alert && btnPtt != null) btnPtt.localPosition = pttDownPos;
        // the flap follows flapT on top of whatever clip plays (every clip keys it closed)
        if (flapUsb == null || flapT <= 0f) return;
        flapUsb.localRotation = Quaternion.Slerp(flapClosed, flapOpenPose, Ease(Lin(flapT, 0f, 0.9f)));
    }

    // DESIGN 7: the cell sequencing table
    int CellFor()
    {
        var t = stateT;
        switch (Current)
        {
            case State.Off: return Off;
            case State.Waking: return t < 0.25f ? Off : t < 0.5f ? Boot : LockCell;
            case State.Locked: return LockCell;
            case State.Unlocking: return t < 0.45f ? LockCell : HomeCell;
            case State.Scanning: return t < 0.3f ? AppOpen : t < 1.0f ? Blink(ScanA, ScanB, 6f, t) : LockOn;
            case State.Talking: return t > 0.12f && t < PttRelease + 0.02f ? PttTalk : PttIdle;
            case State.Alert: return Blink(AlertA, AlertB, 4f, t);
            case State.LowBattery: return LowBat;               // steady for its 3 s (no full-screen strobe)
            case State.PoweringOff: return t < 0.6f ? PowerMenu : t < 0.95f ? Shutdown : Off;
            default: return AppCell(clock);
        }
    }

    int AppCell(float t)
    {
        switch (app)
        {
            case App.Drone: return Blink(DroneA, DroneB, 6f, t);
            case App.Scan: return Blink(ScanA, ScanB, 6f, t);
            case App.Home: return HomeCell;
            case App.Radio: return PttIdle;
            default: return Blink(MapA, MapB, 2f, t);
        }
    }

    static int Blink(int a, int b, float hz, float t) { return ((int)Mathf.Floor(t * hz)) % 2 == 1 ? b : a; }

    void UpdateLed()
    {
        var status = Current == State.Alert ? alertColor : Current == State.LowBattery ? lowBatteryColor : ledColor;
        var k = Current == State.Off ? 0f : glowIntensity;
        var sc = status * k;
        if (Changed(sc, lastStatus)) { WriteGlow(statusGlow, status, k); lastStatus = sc; }
    }

    // ---------------------------------------------------------------- screen

    void ShowCell(int cell)
    {
        var feed = droneFeed != null && (cell == DroneA || cell == DroneB);
        if (feed)
        {
            if (feedShown && feedTex == droneFeed && feedFlip == flipFeed) return;
            feedShown = true; shownCell = -1; feedTex = droneFeed; feedFlip = flipFeed;
            foreach (var a in atlas)
            {
                // the mesh's UVs cover one cell: stretch the whole feed over that cell's range
                var s = new Vector2(a.scale.x * GridX, a.scale.y * GridY);
                var o = new Vector2(a.offset.x * GridX, a.offset.y * GridY - (GridY - 1) * Mathf.Sign(a.scale.y));
                // the UVs cover the cell's inner area only: stretch that to the whole feed
                s = new Vector2(s.x / (1f - 2f * GutterU), s.y / (1f - 2f * GutterV));
                o = new Vector2((o.x - GutterU) / (1f - 2f * GutterU), (o.y - GutterV) / (1f - 2f * GutterV));
                if (flipFeed) { s.y = -s.y; o.y = 1f - o.y; }
                Apply(a, a.tex != null ? droneFeed : null, s, o);
            }
            return;
        }
        if (cell == shownCell && !feedShown) return;
        feedShown = false; feedTex = null; shownCell = cell;
        float col = cell % GridX, row = cell / GridX;
        foreach (var a in atlas) Apply(a, a.tex, a.scale, a.offset + new Vector2(a.scale.x * col / GridX, -a.scale.y * row / GridY));
    }

    static void Apply(AtlasSlot a, Texture tex, Vector2 s, Vector2 o)
    {
        if (a.mat.GetTexture(a.prop) != tex) a.mat.SetTexture(a.prop, tex);
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

    void SetState(State s) { Current = s; stateT = 0f; cues = 0; if (s == State.Off) pendingUnlock = false; }

    void Cue(int bit, float t, AudioClip c) { if ((cues & (1 << bit)) == 0 && stateT >= t) { cues |= 1 << bit; Play(c); } }

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
            WriteLinear(g.mat, "emissiveFactor", f);
            WriteLinear(g.mat, "_EmissionColor", e);
        }
    }
}
