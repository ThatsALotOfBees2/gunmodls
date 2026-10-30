// The conductive lattice: plays 'deploy' (spray and cure), then pulses: live for pulseOn seconds, off for
// pulseOff. While live it shows the glowing traces, crawls arcs along them and raises onLiveStart/onLiveEnd so
// gameplay can damage players touching the wall and fry gadgets on it. Kill() (the node was shot) ends it.
// Put it on the lattice prefab root (glTFast import with Animation set to Legacy). Assign lattice-paths.json and
// set `variant` to the prefab's file name without .glb (conductive-lattice-soft or conductive-lattice-reinforced).
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

public class ConductiveLattice : MonoBehaviour
{
    public TextAsset pathsJson;
    public string variant = "conductive-lattice-soft";
    public float pulseOn = 1f, pulseOff = 2f;
    public AudioClip deploySound, pulseSound, idleLoop, powerDownSound;
    public Material arcMaterial;                 // additive, purple-white; Sprites/Default is used if empty
    public int arcCount = 7;
    public bool gltfMirrorX = true;             // glTFast negates X when it converts glTF axes to Unity's
    public bool deployOnStart = true;
    public UnityEvent onLive = new UnityEvent(), onLiveStart = new UnityEvent(), onLiveEnd = new UnityEvent(), onKilled = new UnityEvent();

    [Serializable] class Variant { public float z; public float[] node; public float deploy_s; public float[] segments_flat; }
    readonly List<Vector4> segs = new List<Vector4>();   // x0, y0, x1, y1 in the root's local space
    float z, deployLen = 3.5f, t = -1;
    bool live, dead;
    Transform glow;
    Animation anim;
    AudioSource audioSource, hum;
    readonly List<LineRenderer> arcs = new List<LineRenderer>();
    System.Random rng = new System.Random(7);

    public bool IsLive { get { return live && !dead; } }

    void Awake()
    {
        anim = GetComponent<Animation>();
        foreach (var tr in GetComponentsInChildren<Transform>(true)) if (tr.name == "lattice_glow") glow = tr;
        audioSource = gameObject.AddComponent<AudioSource>(); audioSource.spatialBlend = 1f;
        hum = gameObject.AddComponent<AudioSource>(); hum.spatialBlend = 1f; hum.loop = true; hum.clip = idleLoop; hum.volume = 0.5f;
        LoadPaths();
        var mat = arcMaterial != null ? arcMaterial : new Material(Shader.Find("Sprites/Default"));
        for (var i = 0; i < arcCount; i++)
        {
            var go = new GameObject("arc_" + i); go.transform.SetParent(transform, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.useWorldSpace = false; lr.positionCount = 10; lr.widthMultiplier = 0.006f; lr.sharedMaterial = mat;
            lr.startColor = lr.endColor = new Color(0.85f, 0.78f, 1f, 1f); lr.enabled = false;
            arcs.Add(lr);
        }
    }

    // lattice-paths.json: { "<variant>": { "z": .., "node": [x, y, z], "deploy_s": .., "segments_x0y0x1y1d": [[x0, y0, x1, y1, d], ...] } }
    void LoadPaths()
    {
        if (pathsJson == null) return;
        // JsonUtility cannot read nested arrays, so pick the numbers out of this variant's block by hand
        var text = pathsJson.text;
        var at = text.IndexOf("\"" + variant + "\"", StringComparison.Ordinal);
        if (at < 0) return;
        z = Number(text, "\"z\":", at);
        deployLen = Number(text, "\"deploy_s\":", at);
        var start = text.IndexOf("[[", text.IndexOf("segments_x0y0x1y1d", at, StringComparison.Ordinal), StringComparison.Ordinal);
        var end = text.IndexOf("]]", start, StringComparison.Ordinal);
        foreach (var row in text.Substring(start + 2, end - start - 2).Split(new[] { "], [", "],[" }, StringSplitOptions.None))
        {
            var v = row.Split(',');
            if (v.Length < 4) continue;
            var sx = gltfMirrorX ? -1f : 1f;
            segs.Add(new Vector4(sx * F(v[0]), F(v[1]), sx * F(v[2]), F(v[3])));
        }
    }
    static float F(string s) { return float.Parse(s.Trim(), System.Globalization.CultureInfo.InvariantCulture); }
    static float Number(string text, string key, int from)
    {
        var i = text.IndexOf(key, from, StringComparison.Ordinal) + key.Length;
        var j = i; while (j < text.Length && "-0123456789.eE ".IndexOf(text[j]) >= 0) j++;
        return F(text.Substring(i, j - i));
    }

    void Start() { if (deployOnStart) Deploy(); }

    public void Deploy()
    {
        dead = false; t = 0;
        if (anim != null && anim.GetClip("deploy") != null) anim.Play("deploy");
        if (deploySound != null) audioSource.PlayOneShot(deploySound);
        if (glow != null) glow.localScale = Vector3.zero;
    }

    public void Kill()
    {
        if (dead) return;
        dead = true;
        if (live) { live = false; onLiveEnd.Invoke(); }
        foreach (var a in arcs) a.enabled = false;
        if (glow != null) glow.localScale = Vector3.zero;
        hum.Stop();
        if (powerDownSound != null) audioSource.PlayOneShot(powerDownSound);
        onKilled.Invoke();
    }

    void Update()
    {
        if (t < 0 || dead) return;
        t += Time.deltaTime;
        if (t < deployLen) return;
        if (!hum.isPlaying && hum.clip != null) hum.Play();
        var c = (t - deployLen) % (pulseOn + pulseOff);
        var on = c < pulseOn;
        if (on != live)
        {
            live = on;
            if (on) { onLiveStart.Invoke(); if (pulseSound != null) audioSource.PlayOneShot(pulseSound); }
            else onLiveEnd.Invoke();
            if (glow != null) glow.localScale = on ? Vector3.one : Vector3.zero;
        }
        if (on) onLive.Invoke();
        // arcs: jagged lines jumping along and between the traces, reshuffled 20 times a second
        var frame = Mathf.FloorToInt(t * 20);
        if (on && segs.Count > 0 && frame != lastFrame)
        {
            lastFrame = frame;
            foreach (var lr in arcs)
            {
                var a = segs[rng.Next(segs.Count)]; var b = segs[rng.Next(segs.Count)];
                var p0 = Vector2.Lerp(new Vector2(a.x, a.y), new Vector2(a.z, a.w), (float)rng.NextDouble());
                var p1 = Vector2.Lerp(new Vector2(b.x, b.y), new Vector2(b.z, b.w), (float)rng.NextDouble());
                if ((p1 - p0).magnitude > 0.35f) p1 = p0 + (p1 - p0).normalized * (0.12f + 0.2f * (float)rng.NextDouble());
                var n = new Vector2(-(p1 - p0).y, (p1 - p0).x).normalized;
                for (var i = 0; i < lr.positionCount; i++)
                {
                    var k = i / (float)(lr.positionCount - 1);
                    var off = (i == 0 || i == lr.positionCount - 1) ? 0f : ((float)rng.NextDouble() - 0.5f) * 0.05f;
                    var p = Vector2.Lerp(p0, p1, k) + n * off;
                    lr.SetPosition(i, new Vector3(p.x, p.y, z + 0.006f + (off != 0 ? (float)rng.NextDouble() * 0.02f : 0f)));
                }
                lr.enabled = true;
            }
        }
        if (!on) foreach (var lr in arcs) lr.enabled = false;
    }
    int lastFrame = -1;
}
