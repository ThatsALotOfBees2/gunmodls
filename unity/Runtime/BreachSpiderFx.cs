// Plays the breach spider: its 'deploy' and 'breach' clips, breach.wav, and the particle effects and lights
// described in gadgets/breach-spider/fx/breach-fx.json, then fires onDetonate and hides the spider.
// Put it on the spider prefab's root (the GameObject with the legacy Animation component that glTFast creates
// when the .glb's Animation import setting is Legacy). Assign the JSON, the four textures and the sound.
// Particle materials: assign your pipeline's particle materials (additive and alpha-blended) for the best look;
// if left empty, Sprites/Default is used for both.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

public class BreachSpiderFx : MonoBehaviour
{
    [Serializable] public class Emitter
    {
        public string name, locator, texture, blend;
        public float start, stop, rate, grow = 1, gravity, drag, cone, radius, alpha0 = 1, alpha1;
        public int burst;
        public bool hemisphere;
        public float[] lifetime, speed, size;
        public string color0, color1;
    }
    [Serializable] public class FxLight
    {
        public string name, locator, color;
        public float start, stop, intensity, flicker, range;
        public float[] offset, decay;
    }
    [Serializable] public class Spec
    {
        public float deploy_s, breach_s, laser_on, laser_off, detonate;
        public Emitter[] emitters;
        public FxLight[] lights;
    }

    public TextAsset fxJson;
    public AudioClip breachSound;
    public Texture2D spark, glow, smoke, flash;
    public Material additiveMaterial, alphaMaterial;
    public bool playOnStart = true;
    public UnityEvent onDetonate = new UnityEvent();

    Spec spec;
    float t = -1;
    bool detonated;
    readonly List<KeyValuePair<Emitter, ParticleSystem>> systems = new List<KeyValuePair<Emitter, ParticleSystem>>();
    readonly List<KeyValuePair<FxLight, Light>> lights = new List<KeyValuePair<FxLight, Light>>();
    readonly HashSet<ParticleSystem> fired = new HashSet<ParticleSystem>();
    AudioSource audioSource;

    void Start()
    {
        if (playOnStart) Play();
    }

    public void Play()
    {
        spec = JsonUtility.FromJson<Spec>(fxJson.text);
        Build();
        var anim = GetComponent<Animation>();
        if (anim != null && anim.GetClip("deploy") != null)
        {
            anim.Play("deploy");
            anim.PlayQueued("breach", QueueMode.CompleteOthers);
        }
        if (breachSound != null)
        {
            audioSource = gameObject.GetComponent<AudioSource>();
            if (audioSource == null) audioSource = gameObject.AddComponent<AudioSource>();
            audioSource.spatialBlend = 1f;
            audioSource.PlayOneShot(breachSound);
        }
        t = 0;
        detonated = false;
    }

    void Update()
    {
        if (t < 0 || spec == null) return;
        t += Time.deltaTime;
        foreach (var kv in systems)
        {
            var e = kv.Key; var ps = kv.Value;
            if (e.burst > 0)
            {
                if (t >= e.start && !fired.Contains(ps)) { fired.Add(ps); ps.Play(); }
            }
            else
            {
                var on = t >= e.start && t < e.stop;
                if (on && !ps.isEmitting) ps.Play();
                else if (!on && ps.isEmitting) ps.Stop(false, ParticleSystemStopBehavior.StopEmitting);
            }
        }
        foreach (var kv in lights)
        {
            var l = kv.Key; var light = kv.Value;
            var on = t >= l.start && t < l.stop;
            var k = 0f;
            if (on)
            {
                k = 1f;
                if (l.decay != null && l.decay.Length == 2)
                {
                    var s = t - l.start;
                    k = 0.92f * Mathf.Exp(-s / l.decay[0]) + 0.08f * Mathf.Exp(-s / l.decay[1]);
                }
                if (l.flicker > 0) k *= 1f - l.flicker * 0.5f + l.flicker * Mathf.PerlinNoise(t * 25f, 0.3f);
            }
            light.enabled = k > 0.001f;
            light.intensity = l.intensity * k;
        }
        if (!detonated && t >= spec.detonate)
        {
            detonated = true;
            // the spider is gone; the effects (parented to locators) stay, so only hide the meshes
            foreach (var r in GetComponentsInChildren<Renderer>())
                if (!(r is ParticleSystemRenderer)) r.enabled = false;
            onDetonate.Invoke();
        }
    }

    void Build()
    {
        foreach (var kv in systems) if (kv.Value != null) Destroy(kv.Value.gameObject);
        foreach (var kv in lights) if (kv.Value != null) Destroy(kv.Value.gameObject);
        systems.Clear(); lights.Clear(); fired.Clear();
        foreach (var e in spec.emitters) systems.Add(new KeyValuePair<Emitter, ParticleSystem>(e, MakeSystem(e)));
        foreach (var l in spec.lights) lights.Add(new KeyValuePair<FxLight, Light>(l, MakeLight(l)));
    }

    Transform Locator(string name)
    {
        foreach (var tr in GetComponentsInChildren<Transform>(true)) if (tr.name == name) return tr;
        return transform;
    }

    static Color Hex(string hex)
    {
        Color c;
        return ColorUtility.TryParseHtmlString(hex, out c) ? c : Color.white;
    }

    Texture2D Tex(string name)
    {
        switch (name) { case "spark": return spark; case "glow": return glow; case "smoke": return smoke; case "flash": return flash; }
        return null;
    }

    Material MaterialFor(Emitter e)
    {
        var baseMat = e.blend == "additive" ? additiveMaterial : alphaMaterial;
        var m = baseMat != null ? new Material(baseMat) : new Material(Shader.Find("Sprites/Default"));
        var tex = Tex(e.texture);
        if (tex != null)
        {
            if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", tex);
            if (m.HasProperty("_MainTex")) m.SetTexture("_MainTex", tex);
        }
        return m;
    }

    ParticleSystem MakeSystem(Emitter e)
    {
        var go = new GameObject("fx_" + e.name);
        go.transform.SetParent(Locator(e.locator), false);
        var ps = go.AddComponent<ParticleSystem>();
        ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
        var main = ps.main;
        main.playOnAwake = false;
        main.loop = e.burst == 0;
        main.duration = e.burst == 0 ? 1f : Mathf.Max(0.1f, e.lifetime[1]);
        main.startLifetime = new ParticleSystem.MinMaxCurve(e.lifetime[0], e.lifetime[1]);
        main.startSpeed = new ParticleSystem.MinMaxCurve(e.speed[0], e.speed[1]);
        main.startSize = new ParticleSystem.MinMaxCurve(e.size[0], e.size[1]);
        main.gravityModifier = e.gravity;
        main.simulationSpace = ParticleSystemSimulationSpace.World;
        main.maxParticles = Mathf.Max(e.burst, Mathf.CeilToInt(e.rate * e.lifetime[1]) + 16);
        var emission = ps.emission;
        emission.rateOverTime = e.rate;
        if (e.burst > 0) emission.SetBursts(new[] { new ParticleSystem.Burst(0f, (short)e.burst) });
        var shape = ps.shape;
        shape.enabled = true;
        if (e.hemisphere) { shape.shapeType = ParticleSystemShapeType.Hemisphere; shape.radius = Mathf.Max(0.01f, e.radius); }
        else { shape.shapeType = ParticleSystemShapeType.Cone; shape.angle = e.cone; shape.radius = Mathf.Max(0.001f, e.radius); }
        var col = ps.colorOverLifetime;
        col.enabled = true;
        var g = new Gradient();
        g.SetKeys(new[] { new GradientColorKey(Hex(e.color0), 0f), new GradientColorKey(Hex(e.color1), 1f) },
                  new[] { new GradientAlphaKey(e.alpha0, 0f), new GradientAlphaKey(e.alpha1, 1f) });
        col.color = new ParticleSystem.MinMaxGradient(g);
        if (Mathf.Abs(e.grow - 1f) > 0.01f)
        {
            var sol = ps.sizeOverLifetime;
            sol.enabled = true;
            sol.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 1f / e.grow, 1f, 1f));
            main.startSize = new ParticleSystem.MinMaxCurve(e.size[0] * e.grow, e.size[1] * e.grow);
        }
        if (e.drag > 0)
        {
            var lv = ps.limitVelocityOverLifetime;
            lv.enabled = true;
            lv.drag = e.drag;
        }
        var r = go.GetComponent<ParticleSystemRenderer>();
        r.renderMode = ParticleSystemRenderMode.Billboard;
        r.sharedMaterial = MaterialFor(e);
        return ps;
    }

    Light MakeLight(FxLight l)
    {
        var go = new GameObject("fx_" + l.name);
        go.transform.SetParent(Locator(l.locator), false);
        if (l.offset != null && l.offset.Length == 3) go.transform.localPosition = new Vector3(l.offset[0], l.offset[1], l.offset[2]);
        var light = go.AddComponent<Light>();
        light.type = LightType.Point;
        light.color = Hex(l.color);
        light.range = l.range;
        light.intensity = 0;
        light.enabled = false;
        return light;
    }
}
