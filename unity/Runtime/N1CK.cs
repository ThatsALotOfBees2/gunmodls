// Drives N1CK, the operator in angular painted armour and tactical gear: his display face, the alarm tint, the Nullfield
// emitters, the power-cell glow and his animation clips. Put it on the root of the n1ck prefab (unity/n1ck.glb or
// n1ck.glb imported with glTFast, Animation: Legacy). It finds the Animation component on itself or a child.
//   Play(clip, fade)      crossfades to a clip (idle, walk, talk_gesture, wave, laugh, sad, worried, alert,
//                         nullfield_activate); one-shots crossfade back to idle when they end
//   SetFace(name)         holds an expression (neutral, happy, worried, laughing, sad, alert, talk, focus, off) or an
//                         atlas cell name (happy_blink, laughing_b, ...); SetFace(null) hands the face back to the clips
//   Blink()               one blink now (also automatic while an expression is held)
//   Alarm(on)             the face display tints toward dark red
//   Nullfield(on)         the two emitter discs on his back flare
//   cellGlow              power-cell brightness (1 = as exported); it breathes slowly. energy_core also lights the
//                         thin strip deep in the bottom gap of the shut chest door and the capacitor caps behind it,
//                         so they breathe with the cell
// Faces are glyphs (chevrons, bars, brackets, dots) from a 4 x 4 atlas of 288 x 192 px cells on the screen_face material (stored
// upright, same as textures/face-atlas.png). The display UVs cover cell 0 (top-left); a face is shown by moving the
// texture offset by whole cells (a quarter of the atlas each way), relative to the scale and offset glTFast imported.
// Each clip carries a face timeline (below; the same data is in the .glb extras and in face_ctrl.position.x).
// walk is in place: move the root forward at WalkSpeed (1.3 m/s) while it plays. Its face has no blink of its own (the
// loop is 1.1 s), so the same 2.6 to 5 s blink timer as a held expression runs while it (or any clip without a blink)
// plays.
// Colours: Unity takes material colours in sRGB terms and converts them in a Linear project, so the tint and glow math
// here reads and writes through ReadLinear / WriteLinear and works in linear, like the viewer. The display is exported
// as black metal (metallic 1, base colour black), so it has no specular or reflections of its own in any shader,
// glTFast's included, and only the cover glass (screen_glass) reflects, as in the viewer. Where the shader also has the
// reflection toggles (URP Lit, Standard) they are switched off too, which removes the last grazing-angle sheen.
// Give the same object a NullfieldCarrier (from Nullfield.cs) so Nullfield sensors ignore him: add it in code with
// gameObject.AddComponent<NullfieldCarrier>() (the Inspector only lists a MonoBehaviour whose file has its name).
using System.Collections.Generic;
using UnityEngine;

public class N1CK : MonoBehaviour
{
    public const float WalkSpeed = 1.3f;          // m/s: the walk clip's planted foot moves back at this speed
    public string startClip = "idle";
    public float defaultFade = 0.3f;
    [Range(0f, 3f)] public float cellGlow = 1f;    // power cell brightness multiplier
    public Color alarmColor = new Color(0.847f, 0.078f, 0.102f);   // #d8141a

    // atlas cells, index = row * 4 + column from the top-left
    public static readonly string[] Cells = {
        "neutral", "neutral_blink", "happy", "happy_blink",
        "worried", "worried_blink", "laughing_a", "laughing_b",
        "sad", "sad_blink", "alert", "alert_blink",
        "talk_a", "talk_b", "focus", "off" };

    class ClipInfo
    {
        public readonly string name; public readonly float length; public readonly bool loop;
        public readonly float[] times; public readonly string[] faces;
        public readonly bool hasBlink;            // the timeline blinks on its own; otherwise the blink timer runs
        public float[] tint, field;               // [t0, v0, t1, v1, ...], linear between keys
        public ClipInfo(string name, float length, bool loop, float[] times, string[] faces)
        {
            this.name = name; this.length = length; this.loop = loop; this.times = times; this.faces = faces;
            foreach (var f in faces) if (f.EndsWith("_blink")) hasBlink = true;
        }
    }

    // face timelines (blinks included), as in the viewer and the .glb extras
    static readonly ClipInfo[] Clips = {
        new ClipInfo("idle", 4f, true,
            new[] { 0f, 1.3f, 1.421f, 3.25f, 3.371f, 3.5f, 3.621f },
            new[] { "neutral", "neutral_blink", "neutral", "neutral_blink", "neutral", "neutral_blink", "neutral" }),
        new ClipInfo("walk", 1.1f, true,
            new[] { 0f },
            new[] { "happy" }),
        new ClipInfo("talk_gesture", 4f, true,
            new[] { 0f, 0.2f, 0.321f, 0.4f, 0.521f, 0.6f, 0.7f, 0.833f, 0.912f, 1.033f, 1.113f, 1.233f, 1.313f, 1.421f, 1.621f, 1.742f, 1.9f, 2.021f, 2.1f, 2.242f, 2.321f, 2.421f, 2.542f, 2.621f, 2.742f, 2.862f, 2.983f, 3.083f, 3.2f, 3.283f, 3.45f, 3.621f, 3.742f, 3.85f },
            new[] { "neutral", "talk_a", "talk_b", "talk_a", "talk_b", "neutral", "talk_a", "talk_b", "talk_a", "talk_b", "talk_a", "talk_b", "neutral", "happy", "happy_blink", "happy", "talk_a", "talk_b", "talk_a", "talk_b", "neutral", "talk_a", "talk_b", "talk_a", "talk_b", "talk_a", "talk_b", "talk_a", "talk_b", "neutral", "happy", "happy_blink", "happy", "neutral" }),
        new ClipInfo("wave", 2.4f, false,
            new[] { 0f, 0.121f, 0.85f, 1.35f, 1.95f, 2.071f, 2.25f },
            new[] { "neutral", "happy", "happy_blink", "happy", "happy_blink", "happy", "neutral" }),
        new ClipInfo("laugh", 2f, false,
            new[] { 0f, 0.1f, 0.3f, 0.446f, 0.588f, 0.729f, 0.875f, 1.017f, 1.158f, 1.3f, 1.446f, 1.587f, 1.621f, 1.721f, 1.842f, 1.95f },
            new[] { "neutral", "happy", "laughing_a", "laughing_b", "laughing_a", "laughing_b", "laughing_a", "laughing_b", "laughing_a", "laughing_b", "laughing_a", "laughing_b", "happy", "happy_blink", "happy", "neutral" }),
        new ClipInfo("sad", 3f, false,
            new[] { 0f, 0.15f, 0.9f, 1.1f, 2.15f, 2.35f, 2.75f },
            new[] { "neutral", "sad", "sad_blink", "sad", "sad_blink", "sad", "neutral" }),
        new ClipInfo("worried", 2.6f, false,
            new[] { 0f, 0.121f, 0.662f, 0.783f, 1.421f, 1.542f, 2.021f, 2.142f, 2.45f },
            new[] { "neutral", "worried", "worried_blink", "worried", "worried_blink", "worried", "worried_blink", "worried", "neutral" }),
        new ClipInfo("alert", 1.6f, false,
            new[] { 0f, 0.05f, 0.621f, 0.742f, 1.4f },
            new[] { "neutral", "alert", "alert_blink", "alert", "neutral" })
            { tint = new[] { 0f, 0f, 0.12f, 0.8f, 1.15f, 0.8f, 1.3f, 0.55f, 1.45f, 0.13f, 1.6f, 0f } },
        new ClipInfo("nullfield_activate", 1.8f, false,
            new[] { 0f, 0.121f, 1.621f },
            new[] { "neutral", "focus", "neutral" })
            { field = new[] { 0f, 0f, 0.45f, 0f, 0.56f, 0.15f, 0.675f, 0.5f, 0.79f, 0.85f, 0.9f, 1f, 1.04f, 0.935f, 1.175f, 0.8f, 1.31f, 0.665f, 1.45f, 0.6f, 1.8f, 0.6f } },
    };

    // glTFast shader graphs use the glTF names; Standard / URP Lit use the Unity names
    static readonly string[] AtlasProps = { "emissiveTexture", "baseColorTexture", "_EmissionMap", "_BaseMap", "_MainTex" };
    // emissive strengths above 1 that the .glb keeps in KHR_materials_emissive_strength, which glTFast ignores
    // (every strength up to 1 is already baked into emissiveFactor): applied here when the import left them out
    static readonly Dictionary<string, float> EmissiveStrength = new Dictionary<string, float> { { "energy_rim", 1.8f }, { "screen_face", 1.05f } };
    // shader toggles that switch a material's own specular highlights and environment reflections off (URP Lit, Standard)
    static readonly string[,] NoReflections = { { "_SpecularHighlights", "_SPECULARHIGHLIGHTS_OFF" }, { "_EnvironmentReflections", "_ENVIRONMENTREFLECTIONS_OFF" }, { "_GlossyReflections", "_GLOSSYREFLECTIONS_OFF" } };

    struct AtlasSlot { public Material mat; public string prop; public Vector2 scale, offset; }
    struct Glow { public Material mat; public Color factor, color; }

    Animation anim;
    ClipInfo current;
    string currentName;
    readonly Dictionary<string, ClipInfo> clipInfo = new Dictionary<string, ClipInfo>();
    readonly List<AtlasSlot> atlas = new List<AtlasSlot>();
    readonly List<Glow> screen = new List<Glow>(), field = new List<Glow>(), fieldRim = new List<Glow>(), core = new List<Glow>(), rim = new List<Glow>();
    Transform faceCtrl;
    string heldFace;
    float alarm, clipTint, clipField, fieldGlow, blinkUntil = -1f, nextBlink, exprTime;
    bool alarmOn, fieldOn;
    int shownCell = -1;
    Color shownTint = Color.clear;

    public string CurrentClip { get { return currentName; } }
    public string CurrentFace { get; private set; }
    public bool AlarmOn { get { return alarmOn; } }
    public bool NullfieldOn { get { return fieldOn; } }

    void Awake()
    {
        foreach (var c in Clips) clipInfo[c.name] = c;
        anim = GetComponentInChildren<Animation>(true);
        if (anim != null)
        {
            // glTFast imports every clip as a loop and plays the first one on its own
            anim.playAutomatically = false;
            anim.Stop();
            foreach (var c in Clips)
                if (anim[c.name] != null) anim[c.name].wrapMode = c.loop ? WrapMode.Loop : WrapMode.ClampForever;
        }
        foreach (var t in GetComponentsInChildren<Transform>(true))
            if (t.name == "face_ctrl") { faceCtrl = t; break; }
        CollectMaterials();
        nextBlink = 2f + Random.value * 2f;
    }

    void Start()
    {
        if (!string.IsNullOrEmpty(startClip)) Play(startClip, 0f);
        Apply(0f);
    }

    // one material instance per imported material, shared by every renderer (and LOD) that used it
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
                var n = m.name;
                var kind = n.StartsWith("screen_face") ? 1 : n.StartsWith("nullfield_glow") ? 2 : n.StartsWith("nullfield_rim") ? 3 : n.StartsWith("energy_core") ? 4 : n.StartsWith("energy_rim") ? 5 : 0;
                if (kind == 0) continue;
                Material copy;
                if (!copies.TryGetValue(m, out copy))
                {
                    copy = new Material(m) { name = n };
                    copies[m] = copy;
                    var g = new Glow { mat = copy, factor = ReadLinear(copy, "emissiveFactor"), color = ReadLinear(copy, "_EmissionColor") };
                    // restore an HDR strength the importer dropped (the imported factor is then still at most 1)
                    foreach (var kv in EmissiveStrength)
                        if (n.StartsWith(kv.Key) && g.factor.maxColorComponent <= 1.001f && g.color.maxColorComponent <= 1.001f)
                        {
                            g.factor *= kv.Value; g.color *= kv.Value;
                            SetGlow(new List<Glow> { g }, 1f);
                        }
                    if (kind == 1) { screen.Add(g); AddAtlas(copy); NoOwnReflections(copy); }
                    else if (kind == 2) field.Add(g);
                    else if (kind == 3) fieldRim.Add(g);
                    else if (kind == 4) core.Add(g);
                    else rim.Add(g);
                }
                mats[i] = copy;
                changed = true;
            }
            if (changed) r.sharedMaterials = mats;
        }
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
        // glTFast applies *_ST only with this keyword; the .glb gives the atlas an identity KHR_texture_transform, so
        // glTFast already turns it on at import and the shader variant survives into player builds
        m.EnableKeyword("_TEXTURE_TRANSFORM");
    }

    // only the cover glass reflects: the display is black metal already; this also drops its grazing sheen where the
    // shader has the toggles. They are shader_feature keywords, so a player build keeps them only if some material
    // used them at build time; without them the display simply stays black metal (no visible change face-on)
    static void NoOwnReflections(Material m)
    {
        for (var i = 0; i < NoReflections.GetLength(0); i++)
            if (m.HasProperty(NoReflections[i, 0])) { m.SetFloat(NoReflections[i, 0], 0f); m.EnableKeyword(NoReflections[i, 1]); }
    }

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

    /* ------------------------------------------------------------------ public API */

    public void Play(string clip, float fade = -1f)
    {
        if (anim == null || anim[clip] == null) { Debug.LogWarning("N1CK: no clip " + clip); return; }
        if (fade < 0f) fade = defaultFade;
        ClipInfo info;
        clipInfo.TryGetValue(clip, out info);
        current = info;
        currentName = clip;
        anim[clip].time = 0f;
        if (fade <= 0f) anim.Play(clip, PlayMode.StopAll);
        else anim.CrossFade(clip, fade, PlayMode.StopAll);
    }

    public void SetFace(string name)
    {
        heldFace = string.IsNullOrEmpty(name) ? null : name;
        exprTime = 0f;
    }

    public void Blink() { blinkUntil = Time.time + 0.12f; }

    public void Alarm(bool on) { alarmOn = on; }

    public void Nullfield(bool on) { fieldOn = on; }

    // shows atlas cell index (0..15) right away, ignoring clips and expressions until the next frame's update
    public void ShowCell(int cell, float tint = 0f) { SetCell(cell, tint); }

    public static int CellIndex(string name)
    {
        for (var i = 0; i < Cells.Length; i++) if (Cells[i] == name) return i;
        return -1;
    }

    /* ------------------------------------------------------------------ per frame */

    void Update()
    {
        var dt = Time.deltaTime;
        // one-shots hold their last frame (which is the idle pose) and hand over to idle
        if (anim != null && current != null && !current.loop)
        {
            var s = anim[current.name];
            if (s != null && s.time >= s.length - defaultFade * 0.5f) Play("idle");
        }
        Apply(dt);
    }

    void Apply(float dt)
    {
        var t = ClipTime();
        string face = null;
        float tint = 0f, fld = 0f;
        if (current != null)
        {
            face = FaceAt(current, t);
            if (current.tint != null) tint = Curve(current.tint, t);
            if (current.field != null) fld = Curve(current.field, t);
        }
        else if (faceCtrl != null)
        {
            // a clip without a table (or one played from elsewhere): read the face channel (glTFast negates x)
            var p = faceCtrl.localPosition;
            var i = Mathf.Clamp(Mathf.RoundToInt(Mathf.Abs(p.x)), 0, Cells.Length - 1);
            face = Cells[i]; tint = p.y; fld = p.z;
        }
        if (heldFace != null) { exprTime += dt; face = Expression(heldFace, exprTime); }
        if (Time.time < blinkUntil && face != null && CellIndex(face + "_blink") >= 0) face = face + "_blink";
        // a held expression, or a clip with no blink of its own (walk), blinks every 2.6 to 5 s
        if ((heldFace != null || (current != null && !current.hasBlink)) && Time.time > nextBlink) { Blink(); nextBlink = Time.time + 2.6f + Random.value * 2.4f; }

        // a clip's tint and glow fade out (rather than cut) when the next clip takes over
        clipTint = Mathf.Max(tint, clipTint - dt * 2.5f);
        clipField = Mathf.Max(fld, clipField - dt * 1.2f);
        alarm = Mathf.MoveTowards(alarm, alarmOn ? 1f : 0f, dt * 4f);
        fieldGlow = Mathf.MoveTowards(fieldGlow, fieldOn ? 1f : 0f, dt * 3f);

        var cell = CellIndex(face ?? "neutral");
        SetCell(cell < 0 ? 0 : cell, Mathf.Max(alarm, clipTint));
        CurrentFace = face ?? "neutral";

        var f = Mathf.Max(fieldGlow, clipField);
        var pulse = 0.85f + 0.15f * Mathf.Sin(Time.time * 9f);
        // the discs glow a faint dark red at rest (as exported) and flare about 5x, a hotter red, as in the viewer
        SetGlow(field, 1f + 4.5f * f * pulse);
        SetGlow(fieldRim, 1f + 4f * f * pulse);
        SetGlow(core, cellGlow * (0.92f + 0.08f * Mathf.Sin(Time.time * 2.1f)));
    }

    float ClipTime()
    {
        if (anim == null || current == null) return 0f;
        var s = anim[current.name];
        if (s == null) return 0f;
        var t = s.time;
        return current.loop ? Mathf.Repeat(t, current.length) : Mathf.Min(t, current.length);
    }

    static string FaceAt(ClipInfo c, float t)
    {
        var f = c.faces[0];
        for (var i = 0; i < c.times.Length && c.times[i] <= t; i++) f = c.faces[i];
        return f;
    }

    static float Curve(float[] k, float t)
    {
        if (t <= k[0]) return k[1];
        for (var i = 2; i < k.Length; i += 2)
            if (t <= k[i]) return Mathf.Lerp(k[i - 1], k[i + 1], (t - k[i - 2]) / Mathf.Max(1e-5f, k[i] - k[i - 2]));
        return k[k.Length - 1];
    }

    // a held expression: laughing flips its two frames at 7 Hz, talk at 8 Hz; cell names pass through
    static string Expression(string e, float t)
    {
        if (e == "laughing") return Mathf.FloorToInt(t * 7f) % 2 == 1 ? "laughing_b" : "laughing_a";
        if (e == "talk") return Mathf.FloorToInt(t * 8f) % 2 == 1 ? "talk_b" : "talk_a";
        return e;
    }

    void SetCell(int cell, float tint)
    {
        if (cell != shownCell)
        {
            shownCell = cell;
            float col = cell % 4, row = cell / 4;
            foreach (var a in atlas)
            {
                // a whole-cell step in glTF UV space (v runs down the atlas), mapped through the imported scale;
                // glTFast flips V on the mesh and imports a PNG with identity scale and offset, so cell (col, row) is
                // offset (col / 4, -row / 4); a KTX texture comes in with scale (1, -1) and offset (0, 1) instead
                var o = a.offset + new Vector2(a.scale.x * col * 0.25f, -a.scale.y * row * 0.25f);
                a.mat.SetTextureOffset(a.prop, o);
                if (a.mat.HasProperty(a.prop + "_ST")) a.mat.SetVector(a.prop + "_ST", new Vector4(a.scale.x, a.scale.y, o.x, o.y));
            }
        }
        var k = Mathf.Clamp01(tint);
        var c = new Color(k, 0, 0, 0);
        if (c == shownTint) return;
        shownTint = c;
        // in linear, like the viewer (the factors are read in linear, so the red is too)
        var red = LinearSpace ? alarmColor.linear : alarmColor;
        foreach (var g in screen)
        {
            WriteLinear(g.mat, "emissiveFactor", Tint(g.factor, red, k));   // glTFast shaders
            WriteLinear(g.mat, "_EmissionColor", Tint(g.color, red, k));    // Standard / URP Lit
        }
    }

    // toward dark red, keeping the HDR strength of the imported colour
    static Color Tint(Color from, Color red, float k)
    {
        var s = Mathf.Max(from.maxColorComponent, 1e-4f);
        return Color.Lerp(from, red * s, k);
    }

    static void SetGlow(List<Glow> list, float mul)
    {
        foreach (var g in list)
        {
            WriteLinear(g.mat, "emissiveFactor", g.factor * mul);
            WriteLinear(g.mat, "_EmissionColor", g.color * mul);
            if (mul > 0f) { g.mat.EnableKeyword("_EMISSIVE"); g.mat.EnableKeyword("_EMISSION"); }
        }
    }

    void OnDestroy()
    {
        var done = new HashSet<Material>();
        foreach (var list in new[] { screen, field, fieldRim, core, rim })
            foreach (var g in list)
                if (g.mat != null && done.Add(g.mat)) Destroy(g.mat);
    }
}
