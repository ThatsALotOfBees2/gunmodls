// Runtime setup for the modular human operator rig (operators/human-rig). Put it on the root of the imported
// unity/human-rig.glb (glTFast, Animation: Legacy). One skeleton, every module / part / variant is its own skinned mesh
// node (LOD0/1/2 = *_LOD0, *_LOD1, *_LOD2). Assault 100,724 / 42,778 / 18,648 tris.
// On Awake it:
//   - builds a LODGroup from the *_LOD0/1/2 renderers (only the renderers of modules that are on are shown)
//   - applies a loadout preset (Assault by default) with module requires / mutual exclusion, the Body mask chunks
//     (Body__shirt is hidden while the shirt is on, ...), the hair shells inside the helmet, part rules (the headset
//     headband hides under the helmet, its helmet rails need the helmet, the downlead needs the radio, goggles need
//     the helmet) and the boots' ground offset (the whole model drops 25 mm when the boots are off)
//   - fixes materials glTFast cannot fully express (LED emissive strength, alpha-tested hair, cornea, lens)
//   - finds the sockets: SOCKET_RightHandGrip (RightHand), SOCKET_PistolHolster, SOCKET_PistolBelt, SOCKET_RifleSling,
//     and the prop bones PropPistolDrop / PropPistolBelt / PropMag that the Holster / HolsterBelt / Reload clips animate
// API
//   ApplyPreset("Body"|"Base"|"Light"|"Assault"|"Full"), SetModule(id, on), SetVariant(id, variant), IsOn(id),
//   SetHolster(belt), Play(clip, fade), PlayOnce(clip, then), ForceLod(i), Attach(go, socket)
// Unity 2021.3 LTS to Unity 6, glTFast shaders or URP/HDRP Lit / Standard (properties a shader lacks are skipped).
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

public class HumanRig : MonoBehaviour
{
    public const float WalkSpeed = 0.94f;              // m/s: Walk is in place, move the root at this speed
    public const float GroundOffset = 0.025f;      // boots: rig is lifted by this in the file
    public static readonly string[] ClipNames = { "Idle", "Ready", "Walk", "CrouchIdle", "LookAround", "Holster", "HolsterBelt", "Reload" };
    public static readonly string[] Sockets = { "SOCKET_RightHandGrip", "SOCKET_PistolHolster", "SOCKET_PistolBelt", "SOCKET_RifleSling" };

    public struct Module
    {
        public string id, group, defaultVariant; public string[] variants, requires, exclusive; public int tris;
        public Module(string id, string group, string dv, string[] v, string[] r, string[] x, int t)
        { this.id = id; this.group = group; defaultVariant = dv; variants = v; requires = r; exclusive = x; tris = t; }
    }
    public struct Node
    {
        public string name, module, variant; public string[] requires, hiddenWith;
        public Node(string n, string m, string v, string[] r, string[] h) { name = n; module = m; variant = v; requires = r; hiddenWith = h; }
    }

    public static readonly Module[] Modules = {
        new Module("shirt", "base", "", new string[0], new string[0], new string[0], 8080),
        new Module("trousers", "base", "", new string[0], new string[0], new string[0], 6406),
        new Module("boots", "base", "", new string[0], new string[0], new string[0], 6782),
        new Module("gloves", "base", "", new string[0], new string[0], new string[0], 4629),
        new Module("kneepads", "base", "", new string[0], new string[0], new string[0], 2048),
        new Module("elbowpads", "base", "", new string[0], new string[0], new string[0], 1560),
        new Module("carrier", "armor", "", new string[0], new string[0], new string[] { "chest_rig" }, 12264),
        new Module("helmet", "armor", "cover", new string[] { "bare", "cover" }, new string[0], new string[0], 5563),
        new Module("neck_groin", "armor", "", new string[0], new string[] { "carrier" }, new string[0], 2428),
        new Module("belt", "loadbearing", "", new string[0], new string[0], new string[0], 3896),
        new Module("rifle_mags", "loadbearing", "", new string[0], new string[] { "carrier" }, new string[0], 5388),
        new Module("pistol_mags", "loadbearing", "", new string[0], new string[] { "belt" }, new string[0], 2528),
        new Module("chest_rig", "loadbearing", "", new string[0], new string[0], new string[] { "carrier", "rifle_mags", "admin_hydration", "radio", "bang_pouches", "sling" }, 8208),
        new Module("dump", "loadbearing", "", new string[0], new string[] { "belt" }, new string[0], 1420),
        new Module("ifak", "loadbearing", "", new string[0], new string[] { "belt" }, new string[0], 2636),
        new Module("radio", "loadbearing", "", new string[0], new string[] { "carrier" }, new string[0], 2256),
        new Module("admin_hydration", "loadbearing", "", new string[0], new string[] { "carrier" }, new string[0], 2348),
        new Module("holster_drop", "sidearm_misc", "", new string[0], new string[] { "belt" }, new string[] { "holster_belt" }, 3806),
        new Module("holster_belt", "sidearm_misc", "", new string[0], new string[] { "belt" }, new string[] { "holster_drop" }, 2610),
        new Module("sling", "sidearm_misc", "", new string[0], new string[] { "carrier" }, new string[0], 1286),
        new Module("headset", "sidearm_misc", "", new string[0], new string[0], new string[0], 3024),
        new Module("eyewear", "sidearm_misc", "glasses", new string[] { "glasses", "goggles" }, new string[0], new string[0], 752),
        new Module("bang_pouches", "sidearm_misc", "", new string[0], new string[] { "carrier" }, new string[0], 1840),
        new Module("knife", "sidearm_misc", "knife", new string[] { "knife", "multitool" }, new string[] { "belt" }, new string[0], 772),
    };
    // gear nodes (Body chunks and hair shells are recognised by name: Body__shirt__gloves, HairShell3__helmet)
    public static readonly Node[] GearNodes = {
        new Node("admin_hydration-admin", "admin_hydration", "", new string[0], new string[0]),
        new Node("admin_hydration-hydration", "admin_hydration", "", new string[0], new string[0]),
        new Node("bang_pouches", "bang_pouches", "", new string[0], new string[0]),
        new Node("belt", "belt", "", new string[0], new string[0]),
        new Node("boots", "boots", "", new string[0], new string[0]),
        new Node("carrier", "carrier", "", new string[0], new string[0]),
        new Node("carrier-led", "carrier", "", new string[0], new string[0]),
        new Node("chest_rig", "chest_rig", "", new string[0], new string[0]),
        new Node("dump", "dump", "", new string[0], new string[0]),
        new Node("elbowpads", "elbowpads", "", new string[0], new string[0]),
        new Node("eyewear-glasses", "eyewear", "glasses", new string[0], new string[0]),
        new Node("eyewear-goggles", "eyewear", "goggles", new string[] { "helmet" }, new string[0]),
        new Node("gloves", "gloves", "", new string[0], new string[0]),
        new Node("headset", "headset", "", new string[0], new string[0]),
        new Node("headset-downlead", "headset", "", new string[] { "radio" }, new string[0]),
        new Node("headset-headband", "headset", "", new string[0], new string[] { "helmet" }),
        new Node("headset-rails", "headset", "", new string[] { "helmet" }, new string[0]),
        new Node("helmet", "helmet", "", new string[0], new string[0]),
        new Node("helmet-bare", "helmet", "bare", new string[0], new string[0]),
        new Node("helmet-cover", "helmet", "cover", new string[0], new string[0]),
        new Node("holster_belt", "holster_belt", "", new string[0], new string[0]),
        new Node("holster_belt-pistol", "holster_belt", "", new string[0], new string[0]),
        new Node("holster_drop", "holster_drop", "", new string[0], new string[0]),
        new Node("holster_drop-pistol", "holster_drop", "", new string[0], new string[0]),
        new Node("ifak-ifak", "ifak", "", new string[0], new string[0]),
        new Node("ifak-tq", "ifak", "", new string[0], new string[0]),
        new Node("kneepads", "kneepads", "", new string[0], new string[0]),
        new Node("knife-knife", "knife", "knife", new string[0], new string[0]),
        new Node("knife-multitool", "knife", "multitool", new string[0], new string[0]),
        new Node("neck_groin-groin", "neck_groin", "", new string[] { "carrier" }, new string[0]),
        new Node("neck_groin-neck", "neck_groin", "", new string[] { "carrier" }, new string[0]),
        new Node("pistol_mags", "pistol_mags", "", new string[0], new string[0]),
        new Node("radio", "radio", "", new string[0], new string[0]),
        new Node("rifle_mags", "rifle_mags", "", new string[0], new string[0]),
        new Node("rifle_mags-reload_mag", "rifle_mags", "", new string[0], new string[0]),
        new Node("shirt", "shirt", "", new string[0], new string[0]),
        new Node("sling", "sling", "", new string[0], new string[0]),
        new Node("trousers", "trousers", "", new string[0], new string[0]),
    };
    public static readonly Dictionary<string, Dictionary<string, string>> Presets = new Dictionary<string, Dictionary<string, string>> {
        { "Body", new Dictionary<string, string> {  } },
        { "Base", new Dictionary<string, string> { { "shirt", "" }, { "trousers", "" }, { "boots", "" }, { "gloves", "" } } },
        { "Light", new Dictionary<string, string> { { "shirt", "" }, { "trousers", "" }, { "boots", "" }, { "gloves", "" }, { "kneepads", "" }, { "chest_rig", "" }, { "belt", "" }, { "pistol_mags", "" }, { "holster_drop", "" }, { "ifak", "" }, { "dump", "" }, { "headset", "" }, { "eyewear", "glasses" } } },
        { "Assault", new Dictionary<string, string> { { "shirt", "" }, { "trousers", "" }, { "boots", "" }, { "gloves", "" }, { "kneepads", "" }, { "elbowpads", "" }, { "carrier", "" }, { "helmet", "cover" }, { "belt", "" }, { "rifle_mags", "" }, { "pistol_mags", "" }, { "dump", "" }, { "ifak", "" }, { "radio", "" }, { "admin_hydration", "" }, { "holster_drop", "" }, { "sling", "" }, { "headset", "" }, { "eyewear", "glasses" }, { "bang_pouches", "" }, { "knife", "knife" } } },
        { "Full", new Dictionary<string, string> { { "shirt", "" }, { "trousers", "" }, { "boots", "" }, { "gloves", "" }, { "kneepads", "" }, { "elbowpads", "" }, { "carrier", "" }, { "helmet", "cover" }, { "belt", "" }, { "rifle_mags", "" }, { "pistol_mags", "" }, { "dump", "" }, { "ifak", "" }, { "radio", "" }, { "admin_hydration", "" }, { "holster_drop", "" }, { "sling", "" }, { "headset", "" }, { "eyewear", "glasses" }, { "bang_pouches", "" }, { "knife", "knife" }, { "neck_groin", "" } } },
    };

    public string startPreset = "Assault";
    public string startClip = "Idle";
    public float defaultFade = 0.3f;
    [Tooltip("LOD switch points as screen-relative height (LOD0 above the first, culled below the last)")]
    public float[] lodScreenHeights = { 0.45f, 0.18f, 0.015f };
    [Range(0f, 10f)] public float ledStrength = 6f;
    [Tooltip("Transform moved down by GroundOffset when the boots are off (default: the first child, the glTF scene)")]
    public Transform modelRoot;

    Animation anim;
    LODGroup lodGroup;
    readonly Dictionary<string, string> loadout = new Dictionary<string, string>();   // module -> variant
    readonly List<KeyValuePair<Renderer, string>> renderers = new List<KeyValuePair<Renderer, string>>(); // renderer, node name
    readonly List<Renderer>[] lodRenderers = { new List<Renderer>(), new List<Renderer>(), new List<Renderer>() };
    readonly Dictionary<string, Transform> sockets = new Dictionary<string, Transform>();
    Dictionary<string, Module> modById;
    Dictionary<string, Node> nodeByName;
    Vector3 rootPos;

    public string CurrentClip { get; private set; }
    public IEnumerable<string> Loadout { get { return loadout.Keys; } }

    static bool LinearSpace { get { return QualitySettings.activeColorSpace == ColorSpace.Linear; } }

    void Awake()
    {
        modById = new Dictionary<string, Module>(); foreach (var m in Modules) modById[m.id] = m;
        nodeByName = new Dictionary<string, Node>(); foreach (var n in GearNodes) nodeByName[n.name] = n;
        if (modelRoot == null && transform.childCount > 0) modelRoot = transform.GetChild(0);
        if (modelRoot != null) rootPos = modelRoot.localPosition;
        anim = GetComponentInChildren<Animation>(true);
        if (anim != null)
        {
            anim.playAutomatically = false; anim.Stop();
            foreach (var n in ClipNames) if (anim[n] != null) anim[n].wrapMode = WrapMode.Loop;
        }
        foreach (var t in GetComponentsInChildren<Transform>(true))
            if (t.name.StartsWith("SOCKET_") || t.name.StartsWith("Prop")) sockets[t.name] = t;
        CollectRenderers();
        FixMaterials();
        ApplyPreset(startPreset);
    }

    void Start() { if (!string.IsNullOrEmpty(startClip)) Play(startClip, 0f); }

    /* ------------------------------------------------------------------ loadout API */

    public void ApplyPreset(string name)
    {
        Dictionary<string, string> p;
        if (!Presets.TryGetValue(name, out p)) { Debug.LogWarning("HumanRig: no preset " + name); return; }
        loadout.Clear();
        foreach (var kv in p) loadout[kv.Key] = kv.Value;
        Refresh();
    }

    public bool IsOn(string id) { return loadout.ContainsKey(id); }

    public void SetModule(string id, bool on)
    {
        Module m;
        if (!modById.TryGetValue(id, out m)) { Debug.LogWarning("HumanRig: no module " + id); return; }
        if (on)
        {
            if (!loadout.ContainsKey(id)) loadout[id] = m.defaultVariant;
            foreach (var x in m.exclusive) loadout.Remove(x);                       // e.g. carrier <-> chest_rig
            foreach (var o in Modules) if (Array.IndexOf(o.exclusive, id) >= 0) loadout.Remove(o.id);
        }
        else loadout.Remove(id);
        Refresh();
    }

    public void SetVariant(string id, string variant)
    {
        if (!loadout.ContainsKey(id)) SetModule(id, true);
        loadout[id] = variant;
        if (id == "eyewear" && variant == "goggles" && !loadout.ContainsKey("helmet")) SetModule("helmet", true);
        Refresh();
    }

    /// <summary>drop-leg (false) or belt (true) holster; play Holster / HolsterBelt to match.</summary>
    public void SetHolster(bool belt) { SetModule(belt ? "holster_belt" : "holster_drop", true); }

    // modules whose requirements are off are dropped from what shows (they stay in the loadout)
    HashSet<string> Resolved()
    {
        var on = new HashSet<string>(loadout.Keys);
        var changed = true;
        while (changed)
        {
            changed = false;
            foreach (var id in new List<string>(on))
                foreach (var r in modById[id].requires)
                    if (!on.Contains(r)) { on.Remove(id); changed = true; break; }
        }
        return on;
    }

    bool NodeVisible(string node, HashSet<string> on)
    {
        if (node.StartsWith("Body") || node.StartsWith("HairShell"))
        {
            var parts = node.Split(new[] { "__" }, StringSplitOptions.RemoveEmptyEntries);
            for (var i = 1; i < parts.Length; i++) if (on.Contains(parts[i])) return false;   // a hiding module is on
            return true;
        }
        Node n;
        if (!nodeByName.TryGetValue(node, out n)) return true;          // head parts etc.
        if (!on.Contains(n.module)) return false;
        var want = loadout.ContainsKey(n.module) && loadout[n.module] != "" ? loadout[n.module] : modById[n.module].defaultVariant;
        if (n.variant != "" && n.variant != want) return false;
        foreach (var r in n.requires) if (!on.Contains(r)) return false;
        foreach (var h in n.hiddenWith) if (on.Contains(h)) return false;
        return true;
    }

    public void Refresh()
    {
        var on = Resolved();
        foreach (var kv in renderers) kv.Key.enabled = NodeVisible(kv.Value, on);
        if (modelRoot != null) modelRoot.localPosition = rootPos + (on.Contains("boots") ? Vector3.zero : Vector3.down * GroundOffset);
        if (lodGroup != null) lodGroup.RecalculateBounds();
    }

    /* ------------------------------------------------------------------ clips + sockets */

    public void Play(string clip, float fade = -1f)
    {
        if (anim == null || anim[clip] == null) { Debug.LogWarning("HumanRig: no clip " + clip); return; }
        if (fade < 0f) fade = defaultFade;
        anim[clip].wrapMode = WrapMode.Loop;
        if (fade <= 0f) anim.Play(clip); else anim.CrossFade(clip, fade);
        CurrentClip = clip;
    }

    /// <summary>play a clip once (e.g. Reload, Holster), then crossfade to `then`.</summary>
    public void PlayOnce(string clip, string then = "Ready", float fade = -1f)
    {
        if (anim == null || anim[clip] == null) return;
        if (fade < 0f) fade = defaultFade;
        anim[clip].wrapMode = WrapMode.Once;
        anim.CrossFade(clip, fade);
        anim.CrossFadeQueued(then, fade, QueueMode.CompleteOthers);
        CurrentClip = clip;
    }

    public Transform Socket(string name) { Transform t; return sockets.TryGetValue(name, out t) ? t : null; }

    /// <summary>parent `go` to a socket (SOCKET_*) or prop bone (PropPistolDrop, PropMag, ...) at zero offset.</summary>
    public void Attach(GameObject go, string socket)
    {
        var t = Socket(socket);
        if (t == null) { Debug.LogWarning("HumanRig: no socket " + socket); return; }
        go.transform.SetParent(t, false);
        go.transform.localPosition = Vector3.zero; go.transform.localRotation = Quaternion.identity;
    }

    public void ForceLod(int index) { if (lodGroup != null) lodGroup.ForceLOD(index); }

    /* ------------------------------------------------------------------ LODs */

    void CollectRenderers()
    {
        foreach (var r in GetComponentsInChildren<Renderer>(true))
        {
            int level; var node = NodeName(r.transform, out level);
            if (node == null) continue;
            renderers.Add(new KeyValuePair<Renderer, string>(r, node));
            lodRenderers[level].Add(r);
            var smr = r as SkinnedMeshRenderer;
            if (smr != null) smr.localBounds = new Bounds(smr.localBounds.center, smr.localBounds.size + Vector3.one * 0.6f);
        }
        if (lodRenderers[1].Count == 0) return;           // the LOD0-only human-rig.glb
        lodGroup = GetComponent<LODGroup>();
        if (lodGroup == null) lodGroup = gameObject.AddComponent<LODGroup>();
        var lods = new LOD[3];
        for (var i = 0; i < 3; i++) lods[i] = new LOD(lodScreenHeights[Mathf.Min(i, lodScreenHeights.Length - 1)], lodRenderers[i].ToArray());
        lodGroup.SetLODs(lods);
        lodGroup.RecalculateBounds();
    }

    // node name without the _LODn suffix, from the renderer or its parent (glTFast puts primitives under the node)
    static string NodeName(Transform t, out int level)
    {
        for (var p = t; p != null; p = p.parent)
        {
            var n = p.name; var k = n.LastIndexOf("_LOD");
            if (k >= 0 && k + 5 == n.Length && n[k + 4] >= '0' && n[k + 4] <= '2') { level = n[k + 4] - '0'; return n.Substring(0, k); }
        }
        level = 0;
        return t.GetComponent<Renderer>() != null ? t.name : null;
    }

    /* ------------------------------------------------------------------ materials */

    void FixMaterials()
    {
        var done = new HashSet<Material>();
        foreach (var r in GetComponentsInChildren<Renderer>(true))
        {
            foreach (var m in r.sharedMaterials)
            {
                if (m == null || !done.Add(m)) continue;
                var n = m.name.Replace(" (Instance)", "");
                if (n.StartsWith("BASE_Hair") || n == "BASE_BrowHair" || n == "BASE_LashHair")
                {
                    SetFloat(m, "_Cull", (float)CullMode.Off); SetFloat(m, "_CullMode", (float)CullMode.Off);
                    SetFloat(m, "_AlphaClip", 1f); m.EnableKeyword("_ALPHATEST_ON");
                    m.renderQueue = (int)RenderQueue.AlphaTest;
                }
                else if (n == "BASE_Cornea" || n == "MAT_Lens")
                {
                    m.SetOverrideTag("RenderType", "Transparent");
                    SetFloat(m, "_ZWrite", 0f);
                    m.renderQueue = (int)RenderQueue.Transparent + (n == "MAT_Lens" ? 20 : 10);
                }
                else if (n == "MAT_LED")
                {
                    var c = new Color(0.541f, 0.302f, 1f) * ledStrength;   // the one #8a4dff emitter
                    WriteHdr(m, "emissiveFactor", c); WriteHdr(m, "_EmissionColor", c);
                    m.EnableKeyword("_EMISSION");
                    m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
                }
                else if (n == "BASE_Skin")
                {
                    if (m.HasProperty("_Smoothness") && m.GetFloat("_Smoothness") > 0.6f) m.SetFloat("_Smoothness", 0.6f);
                }
            }
            var nm = r.transform.name;
            if (nm.StartsWith("Brows") || nm.StartsWith("Lashes") || nm.StartsWith("HairShell") || nm.StartsWith("Eyes") || nm.StartsWith("eyewear"))
                r.shadowCastingMode = ShadowCastingMode.Off;
        }
    }

    static void SetFloat(Material m, string prop, float v) { if (m.HasProperty(prop)) m.SetFloat(prop, v); }

    static void WriteHdr(Material m, string prop, Color c) { if (m.HasProperty(prop)) m.SetColor(prop, LinearSpace ? c.gamma : c); }
}
