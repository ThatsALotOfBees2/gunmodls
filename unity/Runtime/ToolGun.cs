// The tool gun: a long six-shot revolver frame (vented barrel shroud, slotted top rib, fluted bronze cylinder whose
// chambers hold energy cells) carrying a tool gun's kit: a tilted rear display over the hammer, a thumb wheel for picking
// tools, a pronged emitter at the muzzle. Put it on the root of the tool-gun prefab (built from unity/tool-gun.glb with
// Tools > Gunmodls > Build Prefabs From Selection; import with Animation: Legacy, or set `animator` and give its
// controller states named like the clips).
//   NextTool() / PreviousTool() / SelectTool(i)   switch_tool clip, the select frame on the screen, then the tool's cell;
//                                                  onToolChanged(index)
//   Fire()                                         raycast from aimFrom (a camera; null = the muzzle) up to `range`.
//                                                  Valid hit: fire clip, the beam (LineRenderer) from the muzzle locator
//                                                  to the hit at the hammer drop (fireDelay), a spark (sparkPrefab) and
//                                                  the tool's onFire(hit) + onHit(hit). Nothing hit: tools that need a
//                                                  target are Denied(); the others (light, balloon) fire to full range,
//                                                  raise their onFire with a synthetic hit (point = the end of the ray,
//                                                  normal = -ray, collider null) and then onMiss.
//                                                  Returns false while cooling down (per-tool cooldown).
//   Deny()                                         dry fire: the deny clip (trigger, hammer, cylinder, no emitter flash),
//                                                  the error frame for 0.8 s, denyClip, onDenied
//   Inspect(), Boot()                              inspect clip / the boot sequence on the screen (boot, tool menu)
//   SetCell(c)                                     force an atlas cell (-1 = automatic)
// Screen: a 4 x 4 atlas (256 x 192 px cells, art in the inner 244 x 180 px inside a 6 px gutter) on the 'screen'
// material's emissive map. Cells: 0 boot, 1 idle (tool menu), 2 select, 3 fire, 4 error, 5-15 the tools (remover,
// weld, rope, balloon, color, material, hold, thruster, light, wheel, duplicate). No text anywhere, only pictograms.
// A cell is shown by moving the texture offset by whole cells on a material copy owned by this component (glTFast
// applies *_ST with _TEXTURE_TRANSFORM, which the glb's KHR_texture_transform turns on). The glb ships showing the idle
// cell (offset [0.25, 0]); that column is taken back out on start. glTFast flips V on import, so cell (col, row) is
// the cell-0 offset + (scale.x * col / 4, -scale.y * row / 4).
// Clips: idle (2 s loop), fire 0.6 (hammer drops and the flash peaks at 0.125 s), deny 0.6 (the same action, no flash),
// switch_tool 0.45 (swap the cell at 0.2 s), inspect 2.6. glTFast imports every clip as a loop and plays the first one on its own: Awake turns
// playAutomatically off and sets the wrap modes. Locators: muzzle (beam origin, +Z forward), screen_center, grip_attach.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

public class ToolGun : MonoBehaviour
{
    [Serializable] public class HitEvent : UnityEvent<RaycastHit> { }
    [Serializable] public class IndexEvent : UnityEvent<int> { }

    public const int GridX = 4, GridY = 4, DefaultCell = 1;
    public const int CellBoot = 0, CellIdle = 1, CellSelect = 2, CellFire = 3, CellError = 4, FirstToolCell = 5;
    public static readonly string[] AtlasTools = { "remover", "weld", "rope", "balloon", "color", "material", "hold", "thruster", "light", "wheel", "duplicate" };

    [Serializable]
    public class Tool
    {
        public string name = "tool";
        [Tooltip("Atlas cell with this tool's pictogram (5..15)")] public int atlasCell = FirstToolCell;
        [Tooltip("Seconds before the next shot")] public float cooldown = 0.35f;
        [Tooltip("Deny the shot when the ray hits nothing")] public bool needsTarget = true;
        [Tooltip("Raised at the hammer drop. On a miss (only when needsTarget is off) the hit is synthetic: point = end of the ray, normal = -ray, collider = null")]
        public HitEvent onFire = new HitEvent();
    }

    [Header("Tools")]
    public List<Tool> tools = DefaultTools();
    public int toolIndex = 0;

    [Header("Firing")]
    [Tooltip("Aim ray origin, usually the player camera; empty = the muzzle locator")] public Transform aimFrom;
    public float range = 60f;
    public LayerMask hitMask = ~0;
    public QueryTriggerInteraction triggers = QueryTriggerInteraction.Ignore;
    [Tooltip("Seconds from Fire() to the beam (the hammer drop in the fire clip)")] public float fireDelay = 0.12f;
    public float beamTime = 0.14f, beamWidth = 0.008f;
    public Color beamColor = new Color(0.72f, 0.58f, 1f, 1f);
    [Tooltip("Optional; one is made at runtime when empty (Sprites/Default shader)")] public LineRenderer beam;
    [Tooltip("Optional spark effect spawned at the hit, facing the surface normal")] public GameObject sparkPrefab;
    public float sparkLifetime = 1.5f;

    [Header("Screen")]
    public bool bootOnStart = true;
    public float screenBrightness = 1.15f;
    [Range(0f, 0.5f)] public float screenPulse = 0.1f;

    [Header("Animation")]
    [Tooltip("Optional: drive an Animator with states named idle / fire / deny / switch_tool / inspect instead of the legacy Animation")] public Animator animator;

    [Header("Audio (optional)")]
    public AudioSource audioSource;
    public AudioClip fireClip, switchClip, denyClip;

    [Header("Events")]
    public HitEvent onHit = new HitEvent();
    public UnityEvent onMiss = new UnityEvent();
    public UnityEvent onDenied = new UnityEvent();
    public IndexEvent onToolChanged = new IndexEvent();

    public Transform Muzzle { get; private set; }
    public Transform ScreenCenter { get; private set; }
    public Transform GripAttach { get; private set; }
    public Tool CurrentTool { get { return tools.Count > 0 ? tools[Mathf.Clamp(toolIndex, 0, tools.Count - 1)] : null; } }
    public bool CoolingDown { get { return Time.time < cooldownUntil; } }

    static readonly string[] AtlasProps = { "emissiveTexture", "baseColorTexture", "_EmissionMap", "_BaseMap", "_MainTex" };
    static readonly string[] EmissionProps = { "emissiveFactor", "_EmissionColor" };
    struct AtlasSlot { public Material mat; public string prop; public Vector2 scale, offset; }
    readonly List<AtlasSlot> atlas = new List<AtlasSlot>();
    readonly List<Material> screenMats = new List<Material>();
    static readonly Dictionary<string, float> ClipLength = new Dictionary<string, float> { { "idle", 2f }, { "fire", 0.6f }, { "deny", 0.6f }, { "switch_tool", 0.45f }, { "inspect", 2.6f } };

    Animation anim;
    string clip = "idle";
    float clipT, cooldownUntil, bootT = 99f, tempUntil, beamT = 99f, pendingT = -1f, switchT = -1f, pulseT;
    int tempCell = -1, forcedCell = -1, shownCell = -2;
    Vector3 beamTo;
    RaycastHit pendingHit;
    bool pendingHasHit;
    Tool pendingTool;

    public static List<Tool> DefaultTools()
    {
        var l = new List<Tool>();
        for (int i = 0; i < AtlasTools.Length; i++) l.Add(new Tool { name = AtlasTools[i], atlasCell = FirstToolCell + i, needsTarget = AtlasTools[i] != "light" && AtlasTools[i] != "balloon" });
        return l;
    }

    void Awake()
    {
        Muzzle = Find(transform, "muzzle"); ScreenCenter = Find(transform, "screen_center"); GripAttach = Find(transform, "grip_attach");
        if (Muzzle == null) { Debug.LogWarning("ToolGun: no 'muzzle' locator under " + name, this); Muzzle = transform; }
        anim = GetComponent<Animation>();
        if (anim != null && animator == null)
        {
            anim.playAutomatically = false;
            foreach (AnimationState s in anim) s.wrapMode = s.name == "idle" ? WrapMode.Loop : WrapMode.ClampForever;
        }
        SetupScreen();
        if (beam == null)
        {
            var go = new GameObject("tool_beam"); go.transform.SetParent(transform, false);
            beam = go.AddComponent<LineRenderer>();
            beam.material = new Material(Shader.Find("Sprites/Default"));
            beam.useWorldSpace = true; beam.positionCount = 2; beam.numCapVertices = 2;
        }
        beam.enabled = false;
    }

    void Start()
    {
        if (bootOnStart) Boot(); else bootT = 99f;
        PlayClip("idle");
        UpdateScreen(true);
    }

    static Transform Find(Transform t, string n)
    {
        if (t.name == n) return t;
        for (int i = 0; i < t.childCount; i++) { var r = Find(t.GetChild(i), n); if (r != null) return r; }
        return null;
    }

    // ---------------------------------------------------------------- commands

    public void NextTool() { SelectTool(toolIndex + 1); }
    public void PreviousTool() { SelectTool(toolIndex - 1); }

    public void SelectTool(int i)
    {
        if (tools.Count == 0) return;
        toolIndex = ((i % tools.Count) + tools.Count) % tools.Count;
        bootT = 99f; PlayClip("switch_tool"); switchT = 0f;
        Sound(switchClip);
        onToolChanged.Invoke(toolIndex);
    }

    public bool Fire()
    {
        var tool = CurrentTool;
        if (tool == null || CoolingDown || pendingT >= 0f) return false;
        Vector3 o = aimFrom != null ? aimFrom.position : Muzzle.position, d = aimFrom != null ? aimFrom.forward : Muzzle.forward;
        RaycastHit hit;
        bool got = Physics.Raycast(o, d, out hit, range, hitMask, triggers);
        if (!got && tool.needsTarget) { Deny(); cooldownUntil = Time.time + tool.cooldown; return false; }
        bootT = 99f; PlayClip("fire"); Sound(fireClip);
        ShowTemp(CellFire, 0.4f);
        pendingT = 0f; pendingHit = hit; pendingHasHit = got; pendingTool = tool;
        beamTo = got ? hit.point : o + d * range;
        if (!got) { pendingHit = new RaycastHit(); pendingHit.point = beamTo; pendingHit.normal = d * -1f; }
        cooldownUntil = Time.time + Mathf.Max(tool.cooldown, fireDelay + 0.05f);
        return true;
    }

    public void Deny()
    {
        bootT = 99f; PlayClip("deny"); Sound(denyClip);
        ShowTemp(CellError, 0.8f);
        onDenied.Invoke();
    }

    public void Inspect() { bootT = 99f; PlayClip("inspect"); }
    public void Boot() { bootT = 0f; }
    public void SetCell(int c) { forcedCell = c; UpdateScreen(true); }

    // ---------------------------------------------------------------- frame

    void Update()
    {
        float dt = Time.deltaTime;
        bootT += dt; clipT += dt; pulseT += dt;
        if (clip != "idle" && clipT >= Len(clip)) PlayClip("idle");
        if (switchT >= 0f) { switchT += dt; if (switchT >= 0.2f) switchT = -1f; }
        if (pendingT >= 0f)
        {
            pendingT += dt;
            if (pendingT >= fireDelay)
            {
                pendingT = -1f;
                beamT = 0f; beam.enabled = true;
                if (pendingHasHit)
                {
                    if (sparkPrefab != null) { var s = Instantiate(sparkPrefab, pendingHit.point, Quaternion.LookRotation(pendingHit.normal)); Destroy(s, sparkLifetime); }
                    if (pendingTool != null) pendingTool.onFire.Invoke(pendingHit);
                    onHit.Invoke(pendingHit);
                }
                else
                {
                    // needsTarget = false tools (light, balloon) still act, at the end of the ray
                    if (pendingTool != null) pendingTool.onFire.Invoke(pendingHit);
                    onMiss.Invoke();
                }
            }
        }
        if (beam.enabled)
        {
            beamT += dt;
            float a = 1f - Mathf.Clamp01(beamT / beamTime);
            if (a <= 0f) beam.enabled = false;
            else
            {
                beam.SetPosition(0, Muzzle.position); beam.SetPosition(1, beamTo);
                beam.startWidth = beam.endWidth = beamWidth * (0.4f + a);
                var c = beamColor; c.a = a; beam.startColor = c; beam.endColor = c;
            }
        }
        UpdateScreen(false);
    }

    float Len(string c) { float l; if (anim != null && animator == null && anim[c] != null) return anim[c].length; return ClipLength.TryGetValue(c, out l) ? l : 1f; }

    void PlayClip(string c)
    {
        clip = c; clipT = 0f;
        if (animator != null) { animator.CrossFade(c, 0.05f, 0, 0f); return; }
        if (anim == null || anim[c] == null) return;
        anim.Stop(); anim[c].time = 0f; anim.Play(c);
    }

    void Sound(AudioClip c) { if (audioSource != null && c != null) audioSource.PlayOneShot(c); }

    void ShowTemp(int cell, float seconds) { tempCell = cell; tempUntil = Time.time + seconds; }

    // ---------------------------------------------------------------- screen

    void SetupScreen()
    {
        foreach (var r in GetComponentsInChildren<Renderer>(true))
        {
            var mats = r.sharedMaterials; bool changed = false;
            for (int i = 0; i < mats.Length; i++)
            {
                var m = mats[i];
                // only the panel material ('screen', or 'screen (Instance)' / 'screen 1' copies): not screen_glass or screen_scanline
                if (m == null || !(m.name == "screen" || m.name.StartsWith("screen (") || m.name.StartsWith("screen "))) continue;
                var copy = new Material(m) { name = m.name + " (ToolGun)" };
                foreach (var p in AtlasProps)
                {
                    bool shared = p == "_MainTex" || p == "_BaseMap";
                    if (!copy.HasProperty(p) || (!shared && copy.GetTexture(p) == null)) continue;
                    var sc = copy.GetTextureScale(p);
                    // the glb ships showing the idle cell (column 1, row 0): take its column back out so offset is cell 0's
                    atlas.Add(new AtlasSlot { mat = copy, prop = p, scale = sc, offset = copy.GetTextureOffset(p) - new Vector2(sc.x * (DefaultCell % GridX) / (float)GridX, 0f) });
                }
                copy.EnableKeyword("_TEXTURE_TRANSFORM"); copy.EnableKeyword("_EMISSION");
                screenMats.Add(copy); mats[i] = copy; changed = true;
            }
            if (changed) r.sharedMaterials = mats;
        }
        if (atlas.Count == 0) Debug.LogWarning("ToolGun: no 'screen' material with an atlas under " + name, this);
    }

    int CellNow()
    {
        if (forcedCell >= 0) return forcedCell;
        if (bootT < 0.9f) return CellBoot;
        if (bootT < 1.8f) return CellIdle;
        if (Time.time < tempUntil && tempCell >= 0) return tempCell;
        if (switchT >= 0f && switchT > 0.04f) return CellSelect;
        var t = CurrentTool; return t != null ? Mathf.Clamp(t.atlasCell, 0, GridX * GridY - 1) : CellIdle;
    }

    void UpdateScreen(bool force)
    {
        int cell = CellNow();
        if (force || cell != shownCell)
        {
            shownCell = cell;
            float col = cell % GridX, row = cell / GridX;
            foreach (var a in atlas)
            {
                var o = a.offset + new Vector2(a.scale.x * col / GridX, -a.scale.y * row / GridY);
                a.mat.SetTextureOffset(a.prop, o);
                if (a.mat.HasProperty(a.prop + "_ST")) a.mat.SetVector(a.prop + "_ST", new Vector4(a.scale.x, a.scale.y, o.x, o.y));
            }
        }
        // backlight: a slow pulse, brighter on the fire frame (emission in linear terms)
        float k = screenBrightness * (1f - screenPulse + screenPulse * Mathf.Sin(pulseT * 2.6f)) * (cell == CellFire ? 1.3f : 1f);
        var e = new Color(k, k, k, 1f);
        foreach (var m in screenMats) foreach (var p in EmissionProps) if (m.HasProperty(p)) m.SetColor(p, e);
    }
}
