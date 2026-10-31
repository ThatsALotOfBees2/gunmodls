// The conductive lattice, thrown anywhere. Put this on the root of the node prefab (conductive-lattice-node.glb), the
// object that holds the Animation component. When the thrown node hits a wall, call Stick(hitPoint, hitNormal,
// wallCollider): the node snaps onto the surface and plays its 'deploy' clip (clip time 0 = contact), and a
// liquid-metal circuit grows outward from it inside a square of ±reach metres around the node, cut down to the wall
// collider's box. The metal cures (LiveAt seconds after Stick), then pulses: live for pulseOn seconds, off for
// pulseOff. While live it glows, crawls arcs along the traces and raises onLiveStart / onLiveEnd so gameplay can hurt
// players touching the wall (see Covers) and fry gadgets on it. Kill() (the node was shot) ends it; the traces stay
// behind, dead. Destroying the node without Kill() also ends it, without the power-down sound.
// The circuit rules are a hand port of makeLattice in gadgets/conductive-lattice/viewer.html: change both together.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

public class ConductiveLattice : MonoBehaviour
{
    [Header("Spread")]
    public float reach = 1.0f;                  // the circuit stays within ±reach metres of the node, across and up the wall
    public float spraySpeed = 0.9f;             // m/s of the spray front
    public float sprayDelay = 0.45f, cureTime = 0.7f;   // the spray starts sprayDelay after Stick; live cureTime after it ends
    public float surfaceOffset = 0.002f;        // traces sit this far off the wall
    public int primaryTraces = 20;
    [Header("Pulse")]
    public float pulseOn = 1f, pulseOff = 2f;
    public int arcCount = 7;
    [Header("Look")]
    public Material metalMaterial, glowMaterial, arcMaterial;
    [Header("Sound")]
    public AudioClip deploySound, pulseSound, idleLoop, powerDownSound;
    // onLive fires every frame while live; onKilled fires once, from Kill()
    public UnityEvent onLive = new UnityEvent(), onLiveStart = new UnityEvent(), onLiveEnd = new UnityEvent(), onKilled = new UnityEvent();

    struct Seg { public Vector2 a, b; public float w, d0, d1; }
    struct Pad { public Vector2 p; public float r, d; }
    readonly List<Seg> segs = new List<Seg>();
    readonly List<Pad> pads = new List<Pad>();
    readonly List<Vector2> occupied = new List<Vector2>();
    readonly List<LineRenderer> arcs = new List<LineRenderer>();
    Rect area;                                   // the covered square, in the lattice's local space (+Z out of the wall)
    GameObject lattice;
    Mesh metalMesh, glowMesh;
    MeshRenderer glowRenderer;
    AudioSource audioSource, hum;
    Animation anim;
    System.Random rng;
    float t = -1, maxD;
    bool live, dead;
    int lastFrame = -1;

    public bool IsLive { get { return live && !dead; } }
    public bool IsDeployed { get { return t >= 0; } }
    // seconds after Stick when the lattice first goes live; it depends on the pattern, so read it after Stick
    public float LiveAt { get { return sprayDelay + maxD / spraySpeed + cureTime; } }
    // the generated metal, glow and arcs: placed at the node's pose by Stick and parented to the wall, not to the node
    public Transform Lattice { get { return lattice != null ? lattice.transform : null; } }

    // True while live if worldPoint is over the covered square and no more than `behind` metres behind the lattice
    // (into and through the wall) or `front` metres in front of it (the room side). It tests the square, not the traces.
    public bool Covers(Vector3 worldPoint, float behind = 0.5f, float front = 0.3f)
    {
        if (!IsLive || lattice == null) return false;
        var l = lattice.transform.InverseTransformPoint(worldPoint);
        return l.z > -behind && l.z < front && area.Contains(new Vector2(l.x, l.y));
    }

    // Call this when the thrown node hits a surface. Single player: the seed comes from the hit point.
    public void Stick(Vector3 point, Vector3 normal, Collider wall)
    {
        Stick(point, normal, wall, point.GetHashCode());
    }

    // Multiplayer: every client passes the same point, normal, wall and seed (picked once per throw by the server) and
    // the seconds since the stick on the server, so the pattern, the time it goes live and the pulse phase match.
    public void Stick(Vector3 point, Vector3 normal, Collider wall, int seed, float elapsed = 0f)
    {
        normal.Normalize();
        var up = Vector3.ProjectOnPlane(Vector3.up, normal);
        if (up.sqrMagnitude < 1e-4f) up = Vector3.ProjectOnPlane(Vector3.forward, normal);   // floor or ceiling
        var rot = Quaternion.LookRotation(normal, up.normalized);
        transform.SetPositionAndRotation(point, rot);
        if (wall != null) transform.SetParent(wall.transform, true);

        // the area: a square of ±reach around the node, cut down to the wall collider's box
        area = new Rect(-reach, -reach, reach * 2, reach * 2);
        if (wall != null)
        {
            var min = new Vector2(float.MaxValue, float.MaxValue); var max = new Vector2(float.MinValue, float.MinValue);
            foreach (var c in Corners(wall))
            {
                var l = transform.InverseTransformPoint(c);
                min = Vector2.Min(min, new Vector2(l.x, l.y)); max = Vector2.Max(max, new Vector2(l.x, l.y));
            }
            var x0 = Mathf.Max(-reach, min.x); var y0 = Mathf.Max(-reach, min.y);
            var x1 = Mathf.Min(reach, max.x); var y1 = Mathf.Min(reach, max.y);
            if (x1 > x0 && y1 > y0) area = Rect.MinMaxRect(x0, y0, x1, y1);
        }
        rng = new System.Random(seed & 0x7fffffff);
        Generate();
        BuildObjects();

        // a late start (multiplayer) picks the clip and the sound up where they would be; past the clip's end the
        // prefab's rest pose is already the clip's last frame
        elapsed = Mathf.Max(0f, elapsed);
        if (anim != null && anim["deploy"] != null)
        {
            var state = anim["deploy"];
            if (elapsed < state.length) { anim.Play("deploy"); state.time = elapsed; }
        }
        if (deploySound != null && elapsed < deploySound.length)
        {
            audioSource.clip = deploySound;
            audioSource.Play();
            if (elapsed > 0f) audioSource.time = elapsed;
        }
        t = elapsed; dead = false; live = false; lastFrame = -1;
    }

    // Only a BoxCollider gives the wall's real edges; any other collider falls back to its world-space bounding box.
    static IEnumerable<Vector3> Corners(Collider c)
    {
        var box = c as BoxCollider;
        if (box != null)
        {
            for (var i = 0; i < 8; i++)
            {
                var o = new Vector3((i & 1) == 0 ? -0.5f : 0.5f, (i & 2) == 0 ? -0.5f : 0.5f, (i & 4) == 0 ? -0.5f : 0.5f);
                yield return box.transform.TransformPoint(box.center + Vector3.Scale(o, box.size));
            }
            yield break;
        }
        var b = c.bounds;
        for (var i = 0; i < 8; i++)
            yield return b.center + Vector3.Scale(b.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
    }

    // The node was shot. The lattice goes dead for good; the traces stay (half-grown if it was still spraying).
    // Kill does not hide or remove the node. power_down plays on its own object, so the node can be destroyed right after.
    // Before Stick (the node is in flight) it does nothing.
    public void Kill()
    {
        if (!GoDead()) return;
        if (anim != null) anim.Stop();                 // the node freezes where it is: the head stops turning
        if (audioSource != null) audioSource.Stop();   // cuts the deploy or pulse sound
        if (powerDownSound != null) PlayDetached(powerDownSound);
        onKilled.Invoke();
    }

    // Destroying the node (or the wall it sits on) without Kill(): hide the glow and arcs and end a live pulse, but play
    // nothing and spawn nothing, since this also runs when the scene unloads.
    void OnDestroy()
    {
        GoDead();
    }

    bool GoDead()
    {
        if (dead || t < 0) return false;
        dead = true;
        if (live) { live = false; onLiveEnd.Invoke(); }
        foreach (var a in arcs) if (a != null) a.enabled = false;
        if (glowRenderer != null) glowRenderer.enabled = false;
        if (hum != null) hum.Stop();
        return true;
    }

    void PlayDetached(AudioClip clip)
    {
        var go = new GameObject("lattice_power_down");
        go.transform.position = transform.position;
        var s = go.AddComponent<AudioSource>();
        s.spatialBlend = 1f;
        if (audioSource != null) { s.outputAudioMixerGroup = audioSource.outputAudioMixerGroup; s.volume = audioSource.volume; }
        s.clip = clip; s.Play();
        Destroy(go, clip.length + 0.1f);
    }

    void Awake()
    {
        audioSource = gameObject.AddComponent<AudioSource>(); audioSource.spatialBlend = 1f; audioSource.playOnAwake = false;
        hum = gameObject.AddComponent<AudioSource>(); hum.spatialBlend = 1f; hum.loop = true; hum.volume = 0.5f; hum.playOnAwake = false;
        anim = GetComponent<Animation>();
        if (anim != null)
        {
            // glTFast imports every clip as a loop and plays the first one (deploy) on its own
            anim.playAutomatically = false; anim.Stop();
            if (anim["deploy"] != null) anim["deploy"].wrapMode = WrapMode.ClampForever;
        }
    }

    // ---------------------------------------------------------------- the circuit (same rules as the viewer's makeLattice)

    float R() { return (float)rng.NextDouble(); }
    bool Inside(Vector2 p, float m) { return p.x > area.xMin + m && p.x < area.xMax - m && p.y > area.yMin + m && p.y < area.yMax - m; }
    bool Near(Vector2 p) { foreach (var q in occupied) if (Mathf.Abs(q.x - p.x) < 0.035f && Mathf.Abs(q.y - p.y) < 0.035f) return true; return false; }

    void Generate()
    {
        segs.Clear(); pads.Clear(); occupied.Clear();
        var span = Mathf.Max(area.width, area.height);
        for (var k = 0; k < primaryTraces; k++)
        {
            var a = k / (float)primaryTraces * Mathf.PI * 2 + 0.13f;
            var start = new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * 0.075f;
            Walk(start, a, 0.075f, 0.009f + R() * 0.004f, 0, span * (1.1f + R() * 1.1f));
        }
        maxD = 0; foreach (var s in segs) maxD = Mathf.Max(maxD, s.d1);
    }

    void Walk(Vector2 p, float dir, float d, float w, int depth, float budget)
    {
        var len = 0f;
        while (len < budget)
        {
            var step = 0.05f + R() * 0.1f;
            if (R() < 0.28f) dir += (R() < 0.5f ? 1 : -1) * Mathf.PI / 4;
            var away = Mathf.Atan2(p.y, p.x);
            var da = Mathf.Atan2(Mathf.Sin(away - dir), Mathf.Cos(away - dir));
            if (Mathf.Abs(da) > Mathf.PI * 0.6f) dir += Mathf.Sign(da) * Mathf.PI / 4;
            dir = Mathf.Round(dir / (Mathf.PI / 4)) * (Mathf.PI / 4);
            var q = p + new Vector2(Mathf.Cos(dir), Mathf.Sin(dir)) * step;
            // only the step's end point is checked against other traces, so traces can still cross
            if (!Inside(q, 0.02f) || (len > 0.1f && Near(q))) break;
            segs.Add(new Seg { a = p, b = q, w = w, d0 = d, d1 = d + step });
            for (var k = 1; k <= 3; k++) occupied.Add(Vector2.Lerp(p, q, k / 3f));
            d += step; len += step; p = q;
            if (depth < 3 && R() < 0.2f)
            {
                pads.Add(new Pad { p = p, r = w * 1.5f, d = d });
                Walk(p, dir + (R() < 0.5f ? 1 : -1) * Mathf.PI / 4 * (R() < 0.4f ? 2 : 1), d, w * 0.75f, depth + 1, budget * 0.6f);
            }
        }
        pads.Add(new Pad { p = p, r = w * 1.35f, d = d });
    }

    void BuildObjects()
    {
        if (lattice != null) Destroy(lattice);
        lattice = new GameObject("lattice");
        lattice.transform.SetPositionAndRotation(transform.position, transform.rotation);
        lattice.transform.SetParent(transform.parent, true);   // on the wall, so it stays if the node is destroyed
        metalMesh = new Mesh { name = "lattice_metal" }; glowMesh = new Mesh { name = "lattice_glow" };
        var m = new GameObject("lattice_metal"); m.transform.SetParent(lattice.transform, false);
        m.AddComponent<MeshFilter>().sharedMesh = metalMesh;
        var mr = m.AddComponent<MeshRenderer>(); mr.sharedMaterial = metalMaterial; mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        var g = new GameObject("lattice_glow"); g.transform.SetParent(lattice.transform, false);
        g.AddComponent<MeshFilter>().sharedMesh = glowMesh;
        glowRenderer = g.AddComponent<MeshRenderer>(); glowRenderer.sharedMaterial = glowMaterial; glowRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        glowRenderer.enabled = false;
        Fill(glowMesh, float.MaxValue, 0.32f, surfaceOffset + 0.001f);
        arcs.Clear();
        var mat = arcMaterial != null ? arcMaterial : new Material(Shader.Find("Sprites/Default"));
        for (var i = 0; i < arcCount; i++)
        {
            var go = new GameObject("arc_" + i); go.transform.SetParent(lattice.transform, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.useWorldSpace = false; lr.positionCount = 10; lr.widthMultiplier = 0.006f; lr.sharedMaterial = mat;
            lr.startColor = lr.endColor = new Color(0.85f, 0.78f, 1f, 1f); lr.enabled = false;
            arcs.Add(lr);
        }
    }

    // Traces revealed up to the spray front (whole segments plus the growing tip of the ones it is crossing).
    // Flat, facing +Z (out of the wall). UV0.x holds each vertex's spray distance (metres of trace from the node),
    // for a shader that crawls a band along the traces; there are no texture UVs.
    void Fill(Mesh mesh, float front, float widthScale, float z)
    {
        var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
        foreach (var s in segs)
        {
            if (s.d0 >= front) continue;
            var whole = s.d1 <= front;
            var b = whole ? s.b : Vector2.Lerp(s.a, s.b, (front - s.d0) / (s.d1 - s.d0));
            var db = whole ? s.d1 : front;
            var dir = (b - s.a).normalized; var n = new Vector2(-dir.y, dir.x) * s.w * widthScale / 2; var ext = dir * s.w * widthScale / 2;
            var a = s.a - ext; b += ext;
            var i = v.Count;
            v.Add(new Vector3(a.x - n.x, a.y - n.y, z)); v.Add(new Vector3(a.x + n.x, a.y + n.y, z));
            v.Add(new Vector3(b.x - n.x, b.y - n.y, z)); v.Add(new Vector3(b.x + n.x, b.y + n.y, z));
            uv.Add(new Vector2(s.d0, 0)); uv.Add(new Vector2(s.d0, 0)); uv.Add(new Vector2(db, 0)); uv.Add(new Vector2(db, 0));
            // Unity's front face is the side Cross(v1 - v0, v2 - v0) points to: this order faces +Z
            tri.Add(i); tri.Add(i + 2); tri.Add(i + 1); tri.Add(i + 1); tri.Add(i + 2); tri.Add(i + 3);
        }
        foreach (var p in pads)
        {
            if (p.d > front) continue;
            var r = p.r * (widthScale < 1 ? 0.45f : 1f); var c = v.Count;
            v.Add(new Vector3(p.p.x, p.p.y, z + 0.0002f)); uv.Add(new Vector2(p.d, 0));
            for (var k = 0; k <= 14; k++)
            {
                var a = k / 14f * Mathf.PI * 2;
                v.Add(new Vector3(p.p.x + Mathf.Cos(a) * r, p.p.y + Mathf.Sin(a) * r, z + 0.0002f)); uv.Add(new Vector2(p.d, 0));
            }
            for (var k = 0; k < 14; k++) { tri.Add(c); tri.Add(c + 1 + k); tri.Add(c + 2 + k); }
        }
        mesh.Clear(); mesh.SetVertices(v); mesh.SetUVs(0, uv); mesh.SetTriangles(tri, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds();
    }

    // ---------------------------------------------------------------- running

    void Update()
    {
        if (t < 0 || dead) return;
        t += Time.deltaTime;
        var sprayEnd = sprayDelay + maxD / spraySpeed;
        if (t < sprayEnd + cureTime)
        {
            if (t >= sprayDelay) Fill(metalMesh, (t - sprayDelay) * spraySpeed, 1f, surfaceOffset);
            return;
        }
        if (metalMesh.vertexCount == 0 || t - Time.deltaTime < sprayEnd + cureTime) Fill(metalMesh, float.MaxValue, 1f, surfaceOffset);
        if (!hum.isPlaying && idleLoop != null) { hum.clip = idleLoop; hum.Play(); }
        var c = (t - sprayEnd - cureTime) % (pulseOn + pulseOff);
        var on = c < pulseOn;
        if (on != live)
        {
            live = on;
            glowRenderer.enabled = on;
            if (on) { onLiveStart.Invoke(); if (pulseSound != null) audioSource.PlayOneShot(pulseSound); }
            else onLiveEnd.Invoke();
        }
        if (on) onLive.Invoke();
        var frame = Mathf.FloorToInt(t * 20);
        if (on && segs.Count > 0 && frame != lastFrame)
        {
            lastFrame = frame;
            foreach (var lr in arcs)
            {
                var a = segs[rng.Next(segs.Count)]; var b = segs[rng.Next(segs.Count)];
                var p0 = Vector2.Lerp(a.a, a.b, R()); var p1 = Vector2.Lerp(b.a, b.b, R());
                if ((p1 - p0).magnitude > 0.35f) p1 = p0 + (p1 - p0).normalized * (0.12f + 0.2f * R());
                var n = new Vector2(-(p1 - p0).y, (p1 - p0).x).normalized;
                for (var i = 0; i < lr.positionCount; i++)
                {
                    var k = i / (float)(lr.positionCount - 1);
                    var edge = i == 0 || i == lr.positionCount - 1;
                    var p = Vector2.Lerp(p0, p1, k) + n * (edge ? 0f : (R() - 0.5f) * 0.05f);
                    lr.SetPosition(i, new Vector3(p.x, p.y, surfaceOffset + 0.004f + (edge ? 0f : R() * 0.02f)));
                }
                lr.enabled = true;
            }
        }
        if (!on) foreach (var lr in arcs) lr.enabled = false;
    }
}
