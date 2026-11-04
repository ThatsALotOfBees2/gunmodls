// Runtime setup for the human operator prototype (operators/human-proto). Put it on the root of the imported
// unity/human-proto.glb (glTFast, Animation: Legacy). On Awake it:
//   - builds a LODGroup from the meshes named *_LOD0 / *_LOD1 / *_LOD2 (LOD0 68.5k, LOD1 27.7k, LOD2 11.7k triangles)
//   - fixes the materials glTFast cannot fully express: the LED strip's emissive strength (KHR_materials_emissive_strength,
//     6x, which glTFast ignores), the alpha-tested hair shells, brows and lashes (double sided, alpha clip), the clear
//     cornea (transparent, no depth write, drawn after the eye) and a slightly softer skin
//   - prepares the Legacy Animation clips (Idle, Ready, Walk, CrouchIdle, LookAround: all loops, in place)
//   Play(clip, fade)   crossfade to a clip; Walk is in place: move the root at WalkSpeed while it plays
//   ForceLod(i)        -1 = automatic, 0..2 = force a LOD
// For Mecanim / Humanoid retargeting use Tools > Gunmodls > Human Proto > Build Humanoid Avatar (Editor script
// HumanOperatorProtoAvatar.cs), which maps the bones (already named after Unity's human bones) and enforces a T-pose.
// Works with glTFast's own shaders (glTF names: baseColorFactor, emissiveFactor, alphaCutoff) and with URP Lit / HDRP Lit
// / Standard (Unity names); properties a shader lacks are skipped. Unity 2021.3 LTS to Unity 6.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

public class HumanOperatorProto : MonoBehaviour
{
    public const float WalkSpeed = 0.94f;               // m/s: the Walk clip's planted foot slides back at this speed
    public static readonly string[] ClipNames = { "Idle", "Ready", "Walk", "CrouchIdle", "LookAround" };

    public string startClip = "Idle";
    public float defaultFade = 0.3f;
    [Tooltip("LOD switch points as screen-relative height (LOD0 above the first, culled below the last)")]
    public float[] lodScreenHeights = { 0.45f, 0.18f, 0.015f };
    [Range(0f, 10f)] public float ledStrength = 6f;    // matches the .glb's KHR_materials_emissive_strength

    Animation anim;
    LODGroup lodGroup;
    readonly List<Renderer>[] lodRenderers = { new List<Renderer>(), new List<Renderer>(), new List<Renderer>() };

    public string CurrentClip { get; private set; }

    static bool LinearSpace { get { return QualitySettings.activeColorSpace == ColorSpace.Linear; } }

    void Awake()
    {
        anim = GetComponentInChildren<Animation>(true);
        if (anim != null)
        {
            anim.playAutomatically = false;        // glTFast imports every clip and plays the first on its own
            anim.Stop();
            foreach (var n in ClipNames)
                if (anim[n] != null) anim[n].wrapMode = WrapMode.Loop;
        }
        BuildLods();
        FixMaterials();
    }

    void Start()
    {
        if (!string.IsNullOrEmpty(startClip)) Play(startClip, 0f);
    }

    /* ------------------------------------------------------------------ public API */

    public void Play(string clip, float fade = -1f)
    {
        if (anim == null || anim[clip] == null) { Debug.LogWarning("HumanOperatorProto: no clip " + clip); return; }
        if (fade < 0f) fade = defaultFade;
        if (fade <= 0f) anim.Play(clip); else anim.CrossFade(clip, fade);
        CurrentClip = clip;
    }

    public void ForceLod(int index)
    {
        if (lodGroup != null) lodGroup.ForceLOD(index);
    }

    /* ------------------------------------------------------------------ LODs */

    void BuildLods()
    {
        foreach (var r in GetComponentsInChildren<Renderer>(true))
        {
            var level = LodLevel(r.transform);
            if (level < 0) continue;
            lodRenderers[level].Add(r);
            var smr = r as SkinnedMeshRenderer;
            if (smr != null)
            {
                // the meshes are skinned from the A-pose; give them generous bounds so crouch / walk never cull early
                smr.updateWhenOffscreen = false;
                smr.localBounds = new Bounds(smr.localBounds.center, smr.localBounds.size + Vector3.one * 0.6f);
            }
        }
        if (lodRenderers[1].Count == 0 && lodRenderers[2].Count == 0) return;   // the LOD0-only human-proto.glb
        lodGroup = GetComponent<LODGroup>();
        if (lodGroup == null) lodGroup = gameObject.AddComponent<LODGroup>();
        var lods = new LOD[3];
        for (var i = 0; i < 3; i++) lods[i] = new LOD(lodScreenHeights[Mathf.Min(i, lodScreenHeights.Length - 1)], lodRenderers[i].ToArray());
        lodGroup.SetLODs(lods);
        lodGroup.RecalculateBounds();
    }

    // *_LOD1 on the mesh's own node or on its parent (glTFast puts a primitive under a node named after the mesh)
    static int LodLevel(Transform t)
    {
        for (var p = t; p != null; p = p.parent)
        {
            var n = p.name;
            var k = n.LastIndexOf("_LOD");
            if (k >= 0 && k + 4 < n.Length)
            {
                var c = n[k + 4];
                if (c >= '0' && c <= '2') return c - '0';
            }
        }
        return -1;
    }

    /* ------------------------------------------------------------------ materials */

    void FixMaterials()
    {
        var done = new HashSet<Material>();
        foreach (var r in GetComponentsInChildren<Renderer>(true))
        {
            var mats = r.sharedMaterials;
            for (var i = 0; i < mats.Length; i++)
            {
                var m = mats[i];
                if (m == null || !done.Add(m)) continue;
                var n = m.name.Replace(" (Instance)", "");
                if (n.StartsWith("Hair") || n == "BrowHair" || n == "LashHair")
                {
                    // alpha-tested strands and shells: double sided, alpha clip, no shadows from the thin strands
                    SetFloat(m, "_Cull", (float)CullMode.Off);
                    SetFloat(m, "_CullMode", (float)CullMode.Off);
                    SetFloat(m, "_AlphaClip", 1f);
                    m.EnableKeyword("_ALPHATEST_ON");
                    m.renderQueue = (int)RenderQueue.AlphaTest;
                    if (n != "Hair1") r.shadowCastingMode = ShadowCastingMode.Off;
                }
                else if (n == "Cornea")
                {
                    // thin clear shell over the iris: transparent, no depth write, after the eye ball
                    m.SetOverrideTag("RenderType", "Transparent");
                    SetFloat(m, "_ZWrite", 0f);
                    m.renderQueue = (int)RenderQueue.Transparent + 10;
                    r.shadowCastingMode = ShadowCastingMode.Off;
                }
                else if (n == "Eyes")
                {
                    r.shadowCastingMode = ShadowCastingMode.Off;
                }
                else if (n == "LED")
                {
                    // purple status strip (#8a4dff); glTFast keeps only emissiveFactor (strength 1)
                    var c = new Color(0.541f, 0.302f, 1f) * ledStrength;
                    WriteHdr(m, "emissiveFactor", c);
                    WriteHdr(m, "_EmissionColor", c);
                    m.EnableKeyword("_EMISSION");
                    m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
                }
                else if (n == "Skin")
                {
                    // a touch less specular than the glTF default (no subsurface in glTF; use a skin shader for hero shots)
                    if (m.HasProperty("_Smoothness") && m.GetFloat("_Smoothness") > 0.6f) m.SetFloat("_Smoothness", 0.6f);
                }
            }
        }
    }

    static void SetFloat(Material m, string prop, float v)
    {
        if (m.HasProperty(prop)) m.SetFloat(prop, v);
    }

    // c is a linear HDR colour; Material.SetColor takes sRGB-encoded values in a Linear project
    static void WriteHdr(Material m, string prop, Color c)
    {
        if (m.HasProperty(prop)) m.SetColor(prop, LinearSpace ? c.gamma : c);
    }
}
