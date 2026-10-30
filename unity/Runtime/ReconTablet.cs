// The recon tablet ability: every pulse it finds enemies inside a cone ahead of the holder (through walls) and
// draws them on the tablet's screen as blips that appear when the sweep passes them and fade out.
// Put it on the tablet prefab's root (glTFast import with Animation set to Legacy for the clips).
// Assign `holder` (the player's camera or head: its forward is "where the player faces") and either fill
// `targets` or set `enemyTag`. Call Deploy(), Stow() and Pulse() from your ability code, or tick autoPulse.
using System.Collections.Generic;
using UnityEngine;

public class ReconTablet : MonoBehaviour
{
    [Header("Scan")]
    public Transform holder;
    public float range = 25f;
    [Range(10f, 180f)] public float fovDegrees = 90f;
    public bool autoPulse = true;
    public float pulseInterval = 2.5f;
    public float floorCaretHeight = 2f;          // show a caret for enemies this far above or below
    public List<Transform> targets = new List<Transform>();
    public string enemyTag = "";                 // used when targets is empty

    [Header("Sound")]
    public AudioClip powerOn, powerOff, scanSound, blipSound;

    [Header("Screen")]
    public int screenWidth = 320, screenHeight = 210;
    public float screenBrightness = 1.4f;
    public bool flipVertical, flipHorizontal;      // if the radar shows upside down or mirrored on your import

    struct Blip { public float angle, dist, dy, seen; public bool shown; }
    readonly List<Blip> blips = new List<Blip>();
    Texture2D tex;
    Color32[] px;
    Animation anim;
    AudioSource audioSource;
    Transform cone;
    bool deployed;
    float pulseT = -1, nextPulse;

    const float SweepStart = 0.15f, SweepLength = 0.9f, BlipLife = 2.2f, ScanLength = 1.4f;

    void Awake()
    {
        anim = GetComponent<Animation>();
        audioSource = GetComponent<AudioSource>();
        if (audioSource == null) { audioSource = gameObject.AddComponent<AudioSource>(); audioSource.spatialBlend = 1f; }
        tex = new Texture2D(screenWidth, screenHeight, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        px = new Color32[screenWidth * screenHeight];
        foreach (var tr in GetComponentsInChildren<Transform>(true))
        {
            if (tr.name == "fx_scan_cone") cone = tr;
            if (tr.name.StartsWith("screen") && !tr.name.Contains("glass"))
                foreach (var r in tr.GetComponentsInChildren<Renderer>(true)) AssignScreen(r);
        }
    }

    void AssignScreen(Renderer r)
    {
        var m = r.material;
        foreach (var p in new[] { "_BaseMap", "_MainTex", "_EmissionMap", "baseColorTexture", "emissiveTexture" })
            if (m.HasProperty(p)) m.SetTexture(p, tex);
        if (m.HasProperty("_EmissionColor")) { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", Color.white * screenBrightness); }
        if (m.HasProperty("emissiveFactor")) m.SetColor("emissiveFactor", Color.white * screenBrightness);
    }

    public void Deploy()
    {
        if (deployed) return;
        deployed = true;
        PlayClip("deploy", 1f);
        Play(powerOn);
        nextPulse = Time.time + 0.9f;
    }

    public void Stow()
    {
        if (!deployed) return;
        deployed = false;
        pulseT = -1;
        PlayClip("deploy", -1f);   // the deploy clip played backwards
        Play(powerOff);
    }

    public void Pulse()
    {
        if (!deployed || pulseT >= 0) return;
        pulseT = 0;
        PlayClip("scan", 1f);
        Play(scanSound);
        // the scan freezes where everyone is now; the sweep reveals them one by one
        var fwd = holder != null ? holder.forward : transform.forward;
        fwd.y = 0;
        if (fwd.sqrMagnitude < 1e-6f) fwd = Vector3.forward;
        fwd.Normalize();
        var origin = holder != null ? holder.position : transform.position;
        blips.Clear();
        foreach (var t in Targets())
        {
            if (t == null) continue;
            var d = t.position - origin;
            var flat = new Vector3(d.x, 0, d.z);
            var dist = flat.magnitude;
            if (dist > range || dist < 0.01f) continue;
            var a = Vector3.SignedAngle(fwd, flat, Vector3.up);       // + to the right
            if (Mathf.Abs(a) > fovDegrees / 2) continue;
            blips.Add(new Blip { angle = a, dist = dist, dy = d.y, seen = -1 });
        }
    }

    IEnumerable<Transform> Targets()
    {
        if (targets.Count > 0) return targets;
        var list = new List<Transform>();
        if (!string.IsNullOrEmpty(enemyTag)) foreach (var go in GameObject.FindGameObjectsWithTag(enemyTag)) list.Add(go.transform);
        return list;
    }

    void PlayClip(string name, float speed)
    {
        if (anim == null || anim.GetClip(name) == null) return;
        var s = anim[name];
        s.speed = speed;
        if (speed < 0) s.time = s.length;
        anim.Play(name);
    }

    void Play(AudioClip c) { if (c != null) audioSource.PlayOneShot(c); }

    void Update()
    {
        if (deployed && autoPulse && pulseT < 0 && Time.time >= nextPulse) { nextPulse = Time.time + pulseInterval; Pulse(); }
        var sweep = -1f;
        if (pulseT >= 0)
        {
            pulseT += Time.deltaTime;
            sweep = Mathf.Clamp01((pulseT - SweepStart) / SweepLength);
            // the sweep runs from the left edge of the cone to the right; a blip appears when it is passed
            var edge = -fovDegrees / 2 + sweep * fovDegrees;
            for (var i = 0; i < blips.Count; i++)
            {
                var b = blips[i];
                if (!b.shown && b.angle <= edge) { b.shown = true; b.seen = Time.time; blips[i] = b; Play(blipSound); }
            }
            if (cone != null)   // keep the pulse fan level, pointing where the tablet points
            {
                var f = Vector3.ProjectOnPlane(cone.parent.forward, Vector3.up);
                if (f.sqrMagnitude > 1e-6f) cone.rotation = Quaternion.LookRotation(f.normalized, Vector3.up);
            }
            if (pulseT > ScanLength) pulseT = -1;
        }
        Draw(deployed ? 1f : 0f, sweep);
    }

    // ---------------------------------------------------------------- drawing (matches the viewer's radar)

    void Draw(float power, float sweep)
    {
        var bg = new Color32(5, 4, 10, 255);
        for (var i = 0; i < px.Length; i++) px[i] = bg;
        if (power > 0)
        {
            int w = screenWidth, h = screenHeight;
            float ox = w / 2f, oy = 14f, R = h - 26f, half = fovDegrees * Mathf.Deg2Rad / 2;
            var edge = new Color32(167, 123, 255, 220);
            // cone fill, arcs and edges, drawn per pixel (y up from the bottom of the texture)
            for (var y = 0; y < h; y++)
                for (var x = 0; x < w; x++)
                {
                    float dx = x - ox, dy = y - oy, r = Mathf.Sqrt(dx * dx + dy * dy);
                    if (r > R + 1 || dy < -1) continue;
                    var a = Mathf.Atan2(dx, dy);
                    if (Mathf.Abs(a) > half + 0.01f) continue;
                    var c = new Color32((byte)(14 + 20 * (1 - r / R)), (byte)(8 + 10 * (1 - r / R)), (byte)(30 + 40 * (1 - r / R)), 255);
                    var ring = (r / R) * range;
                    if (Mathf.Abs(ring - Mathf.Round(ring / 5) * 5) * R / range < 0.6f && ring > 2) c = Mathf.RoundToInt(ring) % 10 == 0 ? new Color32(80, 58, 130, 255) : new Color32(50, 36, 85, 255);
                    if (Mathf.Abs(Mathf.Abs(a) - half) * r < 1.1f || Mathf.Abs(r - R) < 1.1f) c = edge;
                    if (sweep >= 0 && sweep <= 1)
                    {
                        var sa = -half + sweep * half * 2;
                        var lag = a - sa;
                        if (lag <= 0 && lag > -0.18f) { var k = 1 + lag / 0.18f; c = Lerp(c, new Color32(214, 190, 255, 255), 0.6f * k); }
                    }
                    px[y * w + x] = c;
                }
            foreach (var b in blips)
            {
                if (!b.shown) continue;
                var age = Time.time - b.seen;
                if (age > BlipLife) continue;
                var k = 1 - age / BlipLife;
                var ang = b.angle * Mathf.Deg2Rad;
                float bx = ox + Mathf.Sin(ang) * b.dist / range * R, by = oy + Mathf.Cos(ang) * b.dist / range * R;
                var s = 3 + 3 * (1 - b.dist / range);
                Disc(bx, by, s * 2.2f, new Color32(255, 90, 40, 255), 0.25f * k);
                Disc(bx, by, s, new Color32(255, 120, 70, 255), k);
                if (Mathf.Abs(b.dy) > floorCaretHeight)
                {
                    var up = b.dy > 0;
                    Caret(bx, by + (up ? s + 5 : -s - 5), up, new Color32(255, 170, 120, 255), k);
                }
            }
            Disc(ox, oy, 4, new Color32(226, 214, 255, 255), 1);
        }
        if (flipVertical || flipHorizontal)
        {
            var o = new Color32[px.Length];
            for (var y = 0; y < screenHeight; y++)
                for (var x = 0; x < screenWidth; x++)
                    o[(flipVertical ? screenHeight - 1 - y : y) * screenWidth + (flipHorizontal ? screenWidth - 1 - x : x)] = px[y * screenWidth + x];
            tex.SetPixels32(o);
        }
        else tex.SetPixels32(px);
        tex.Apply(false);
    }

    static Color32 Lerp(Color32 a, Color32 b, float t) { return Color32.Lerp(a, b, t); }

    void Disc(float cx, float cy, float r, Color32 c, float alpha)
    {
        int x0 = Mathf.Max(0, (int)(cx - r - 1)), x1 = Mathf.Min(screenWidth - 1, (int)(cx + r + 1));
        int y0 = Mathf.Max(0, (int)(cy - r - 1)), y1 = Mathf.Min(screenHeight - 1, (int)(cy + r + 1));
        for (var y = y0; y <= y1; y++)
            for (var x = x0; x <= x1; x++)
            {
                var d = Mathf.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                var cover = Mathf.Clamp01(r - d + 0.5f) * alpha;
                if (cover <= 0) continue;
                var i = y * screenWidth + x;
                px[i] = Color32.Lerp(px[i], c, cover);
            }
    }

    void Caret(float cx, float cy, bool up, Color32 c, float alpha)
    {
        for (var i = -5; i <= 5; i++)
        {
            var y = cy + (up ? -Mathf.Abs(i) * 0.6f : Mathf.Abs(i) * 0.6f);
            Disc(cx + i, y, 1.1f, c, alpha);
        }
    }
}
