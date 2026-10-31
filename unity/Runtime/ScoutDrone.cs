// Drives the scout drone. Put it on the root of the scout-drone prefab (built from unity/scout-drone.glb with
// Tools > Gunmodls; import with Animation: Legacy). It adds a Rigidbody and one BoxCollider if there are none.
//   Hold()                in the hand: folded, kinematic, collider off, no feed
//   Throw(velocity)       when it leaves the hand: it tumbles, and when it lands on its belly it plays 'deploy' and stands up
//   Drive(throttle, turn) every frame, both -1..1 (turn > 0 turns right); ignored until it has stood up
//   Hop()                 the belly thumper fires and the drone jumps about 25 cm
//   Shutdown()            destroyed or picked up: sags onto its belly, lights out, feed cut
//   SetFeed(texture)      the RenderTexture the nose camera draws into; null switches the camera off
// Throw() and Hold() undo Shutdown(). A drone placed in the level starts standing (Ready).
// While it drives, the wheels spin from the distance each side covers and each arm swings so its wheel stays on the
// ground (a raycast per wheel). A camera on fx_lens_nose renders the feed while the drone is deploying or ready.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

[RequireComponent(typeof(Animation))]
public class ScoutDrone : MonoBehaviour
{
    [Header("Driving")]
    public float maxSpeed = 1.5f;          // m/s
    public float turnRate = 180f;          // deg/s
    public float acceleration = 5f;        // m/s^2
    public float hopSpeed = 2.25f;         // m/s up when the thumper fires: 0.23 * |gravity|, so it touches down at 0.6 s with the clip
    public LayerMask ground = ~0;
    [Header("Feed (applied in Awake; at runtime use SetFeed and FeedCamera)")]
    public RenderTexture feed;
    public float fieldOfView = 92f;        // vertical, as in the viewer
    [Header("Sound")]
    public AudioClip throwSound, landSound, deploySound, motorLoop, hopSound, shutdownSound;
    public UnityEvent onDeployed = new UnityEvent(), onLanded = new UnityEvent(), onShutdown = new UnityEvent();

    public enum State { InHand, Thrown, Deploying, Ready, Off }
    public State Current { get; private set; }
    public Camera FeedCamera { get; private set; }
    public float Speed { get { return speed; } }

    // the same numbers as the viewer (glTF metres)
    const float R = 0.043f, L = 0.07f, WX = 0.098f, RideAngle = 40f, StowAngle = -2.2f, HopLaunch = 0.14f;
    // the deploy clip rolls the wheels in as the arms swing down: it ends with the front wheels at -21.8 deg, the rear at +21.8
    static readonly float DeployRoll = L * (Mathf.Cos(RideAngle * Mathf.Deg2Rad) - Mathf.Cos(StowAngle * Mathf.Deg2Rad)) / R * Mathf.Rad2Deg;
    static readonly string[] Wheels = { "fl", "fr", "rl", "rr" };
    static readonly int[] Side = { 1, -1, 1, -1 };   // +1 = left wheels
    static readonly int[] End = { 1, 1, -1, -1 };    // +1 = front wheels

    // an led_purple material and its glow as imported, so Throw() can light it again after Shutdown()
    struct Led { public Material mat; public Color factor, color; public bool emissive, emission; }

    Animation anim;
    Rigidbody rb;
    Collider box;
    Transform body, antenna;
    readonly Transform[] arms = new Transform[4], wheels = new Transform[4];
    readonly float[] spin = new float[4], armAngle = new float[4];
    readonly List<Led> leds = new List<Led>();
    readonly RaycastHit[] hits = new RaycastHit[8];
    AudioSource oneShot, motor;
    float throttle, turn, speed, yawRate, lastSpeed, pitch, roll, antAngle = -11.5f, antVel, stateT, hopT = -1;
    bool launched, wasGrounded = true;
    Vector3 bodyRest;
    RigidbodyInterpolation interpolation;

    void Awake()
    {
        anim = GetComponent<Animation>();
        // glTFast imports every clip as a loop and plays the first one (deploy) on its own. deploy and shutdown hold
        // their last frame until this script stops them; hop plays once.
        anim.playAutomatically = false; anim.Stop();
        foreach (var clip in new[] { "deploy", "shutdown" }) if (anim[clip] != null) anim[clip].wrapMode = WrapMode.ClampForever;
        if (anim["hop"] != null) anim["hop"].wrapMode = WrapMode.Once;
        foreach (var t in GetComponentsInChildren<Transform>(true))
        {
            if (t.name == "body") body = t;
            else if (t.name == "antenna") antenna = t;
            else if (t.name == "fx_lens_nose") FeedCamera = MakeCamera(t);
            for (var i = 0; i < 4; i++)
            {
                if (t.name == "arm_" + Wheels[i]) arms[i] = t;
                if (t.name == "wheel_" + Wheels[i]) wheels[i] = t;
            }
        }
        foreach (var r in GetComponentsInChildren<Renderer>(true))
            foreach (var m in r.materials)
                if (m.name.StartsWith("led_purple"))
                    leds.Add(new Led
                    {
                        mat = m,
                        factor = m.HasProperty("emissiveFactor") ? m.GetColor("emissiveFactor") : Color.black,
                        color = m.HasProperty("_EmissionColor") ? m.GetColor("_EmissionColor") : Color.black,
                        emissive = m.IsKeywordEnabled("_EMISSIVE"),
                        emission = m.IsKeywordEnabled("_EMISSION"),
                    });
        if (body != null) bodyRest = body.localPosition;
        rb = GetComponent<Rigidbody>();
        if (rb == null) { rb = gameObject.AddComponent<Rigidbody>(); rb.mass = 1.6f; rb.interpolation = RigidbodyInterpolation.Interpolate; }
        rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;   // standing; Throw() frees it for the tumble
        interpolation = rb.interpolation;
        box = GetComponent<Collider>();
        if (box == null)
        {
            // one box for the whole drone, from the ground up; the per-part boxes from the prefab builder are turned off
            foreach (var c in GetComponentsInChildren<Collider>(true)) c.enabled = false;
            var b = gameObject.AddComponent<BoxCollider>();
            b.center = new Vector3(0, 0.068f, 0); b.size = new Vector3(0.22f, 0.13f, 0.3f);
#if UNITY_6000_0_OR_NEWER
            b.material = new PhysicsMaterial { dynamicFriction = 0.05f, staticFriction = 0.05f, frictionCombine = PhysicsMaterialCombine.Minimum };
#else
            b.material = new PhysicMaterial { dynamicFriction = 0.05f, staticFriction = 0.05f, frictionCombine = PhysicMaterialCombine.Minimum };
#endif
            box = b;
        }
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f;
        motor = gameObject.AddComponent<AudioSource>(); motor.spatialBlend = 1f; motor.loop = true; motor.clip = motorLoop; motor.volume = 0f;
        for (var i = 0; i < 4; i++) armAngle[i] = RideAngle;
        Current = State.Ready;   // placed in the level standing; call Hold() or Throw() to start from the hand
    }

    Camera MakeCamera(Transform lens)
    {
        var go = new GameObject("feed_camera");
        go.transform.SetParent(lens, false);   // the lens looks along +Z
        var cam = go.AddComponent<Camera>();
        cam.fieldOfView = fieldOfView; cam.nearClipPlane = 0.01f; cam.targetTexture = feed;
        cam.enabled = feed != null;   // without a texture it would draw over the player's view
        return cam;
    }

    // ---------------------------------------------------------------- commands

    public void Hold()
    {
        Wake();
        Current = State.InHand;
        rb.isKinematic = true; rb.interpolation = RigidbodyInterpolation.None;   // it follows the hand it is parented to
        if (box != null) box.enabled = false;
    }

    public void Throw(Vector3 velocity)
    {
        Wake();
        Current = State.Thrown;
        rb.constraints = RigidbodyConstraints.None;
        SetVelocity(velocity);
        rb.angularVelocity = Random.insideUnitSphere * 8f;
        if (throwSound != null) oneShot.PlayOneShot(throwSound);
    }

    public void Drive(float throttleInput, float turnInput)
    {
        throttle = Mathf.Clamp(throttleInput, -1f, 1f); turn = Mathf.Clamp(turnInput, -1f, 1f);
    }

    public void Hop()
    {
        if (Current != State.Ready || hopT >= 0 || !Grounded()) return;
        hopT = 0; launched = false;
        anim.Stop(); anim.Play("hop");
        if (hopSound != null) oneShot.PlayOneShot(hopSound);
    }

    public void Shutdown()
    {
        if (Current == State.Off) return;
        var was = Current;
        Current = State.Off; stateT = 0; hopT = -1; throttle = turn = speed = yawRate = 0;
        if (was == State.Deploying) anim.CrossFade("shutdown", 0.4f);   // blend out of the half-done deploy instead of jumping to the standing pose
        else
        {
            anim.Stop();
            // hop at 0 s puts the thumper back if it was mid-hop; the shutdown clip starts from the standing pose
            if (was == State.Ready) { SamplePose("hop", 0f); anim.Play("shutdown"); }
        }
        SetLights(false);
        ShowFeed(false);
        motor.Stop();
        if (shutdownSound != null) oneShot.PlayOneShot(shutdownSound);
        onShutdown.Invoke();
    }

    public void SetFeed(RenderTexture texture)
    {
        feed = texture;
        if (FeedCamera == null) return;
        FeedCamera.targetTexture = texture;
        ShowFeed(Current == State.Ready || Current == State.Deploying);
    }

    // ---------------------------------------------------------------- running

    void OnCollisionEnter(Collision c) { TryLand(c); }
    void OnCollisionStay(Collision c) { TryLand(c); }   // it can slide off a wall onto the floor of the same collider

    void TryLand(Collision c)
    {
        // contacts in the first 0.2 s after Throw() don't count: a drone thrown from the floor still touches it
        if (Current != State.Thrown || stateT < 0.2f) return;
        foreach (var p in c.contacts)
        {
            if (p.normal.y < 0.6f) continue;
            // landed: sit upright on the belly, keep the heading
            var fwd = Vector3.ProjectOnPlane(transform.forward, Vector3.up);
            if (fwd.sqrMagnitude < 1e-4f) fwd = Vector3.ProjectOnPlane(transform.up, Vector3.up);
            rb.angularVelocity = Vector3.zero; SetVelocity(Vector3.zero);
            rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
            transform.SetPositionAndRotation(new Vector3(transform.position.x, p.point.y, transform.position.z), Quaternion.LookRotation(fwd.normalized, Vector3.up));
            Current = State.Deploying; stateT = 0; wasGrounded = true;
            anim.Play("deploy");
            ShowFeed(true);
            if (landSound != null) oneShot.PlayOneShot(landSound);
            if (deploySound != null) oneShot.PlayOneShot(deploySound);
            onLanded.Invoke();
            return;
        }
    }

    void FixedUpdate()
    {
        if (Current != State.Ready) { if (Current == State.Deploying || Current == State.Off) DampHorizontal(); return; }
        var dt = Time.fixedDeltaTime;
        var grounded = Grounded();
        if (grounded && !wasGrounded && landSound != null) oneShot.PlayOneShot(landSound);   // touch-down after a hop or a drop
        wasGrounded = grounded;
        if (grounded && hopT < 0)
        {
            speed = Mathf.MoveTowards(speed, throttle * maxSpeed, acceleration * dt);
            yawRate = Mathf.MoveTowards(yawRate, turn * turnRate, turnRate * 4f * dt);
        }
        if (hopT >= HopLaunch && !launched) { launched = true; var v = GetVelocity(); v.y = hopSpeed; SetVelocity(v); }
        var vel = transform.forward * speed; vel.y = GetVelocity().y;
        SetVelocity(vel);
        rb.MoveRotation(rb.rotation * Quaternion.Euler(0, yawRate * dt, 0));
    }

    void Update()
    {
        var dt = Time.deltaTime;
        stateT += dt;
        if (Current == State.Deploying && stateT >= anim["deploy"].length)
        {
            Current = State.Ready;
            anim.Stop();   // deploy held its last frame until now; from here this script poses the drone
            for (var i = 0; i < 4; i++) spin[i] = End[i] * DeployRoll;   // carry on from where the clip left the wheels
            onDeployed.Invoke();
        }
        if (Current != State.Ready) return;
        if (hopT >= 0) { hopT += dt; if (hopT >= anim["hop"].length) hopT = -1; }

        // wheels: each side turns by the distance it covers (turning right, the left wheels go forward)
        var w = yawRate * Mathf.Deg2Rad;
        var left = (speed + w * WX) * dt, right = (speed - w * WX) * dt;
        for (var i = 0; i < 4; i++)
        {
            spin[i] += (Side[i] > 0 ? left : right) / R * Mathf.Rad2Deg;
            if (wheels[i] != null) wheels[i].localRotation = Quaternion.Euler(spin[i], 0, 0);
        }
        // motor sound
        if (motor.clip != motorLoop) { motor.Stop(); motor.clip = motorLoop; }
        var run = Mathf.Clamp01(Mathf.Abs(speed) / maxSpeed + Mathf.Abs(yawRate) / turnRate * 0.6f);
        if (motor.clip != null)
        {
            if (!motor.isPlaying) motor.Play();
            motor.pitch = 0.75f + 0.75f * run;
            motor.volume = Mathf.MoveTowards(motor.volume, run > 0.02f ? 0.15f + 0.45f * run : 0f, dt * 4f);
        }
        if (hopT >= 0) return;   // the hop clip owns the body, arms and antenna

        // body: leans back when it speeds up and into a turn (as the viewer)
        var acc = (speed - lastSpeed) / Mathf.Max(dt, 1e-4f); lastSpeed = speed;
        pitch = Mathf.Lerp(pitch, Mathf.Clamp(-acc * 0.7f, -3.5f, 3.5f), 1 - Mathf.Exp(-dt * 8));
        roll = Mathf.Lerp(roll, Mathf.Clamp(-yawRate * Mathf.Deg2Rad * speed * 1.4f, -3.5f, 3.5f), 1 - Mathf.Exp(-dt * 8));
        if (body != null) { body.localPosition = bodyRest; body.localRotation = Quaternion.Euler(pitch, 0, roll); }
        // arms: swing each wheel down onto the ground under it
        for (var i = 0; i < 4; i++)
        {
            if (arms[i] == null) continue;
            var target = RideAngle;
            var probe = arms[i].parent.TransformPoint(arms[i].localPosition + new Vector3(0, 0, End[i] * L * Mathf.Cos(RideAngle * Mathf.Deg2Rad)));
            float h;
            // start just above the pivot, so an overhang above the drone is not taken for the floor
            if (GroundBelow(probe + Vector3.up * 0.02f, 0.25f, out h))
            {
                var pivotHeight = arms[i].position.y - h;
                target = Mathf.Asin(Mathf.Clamp((pivotHeight - R) / L, -1f, 1f)) * Mathf.Rad2Deg;
            }
            else target = 58f;   // hanging
            armAngle[i] = Mathf.Lerp(armAngle[i], Mathf.Clamp(target, StowAngle, 60f), 1 - Mathf.Exp(-dt * 20));
            arms[i].localRotation = Quaternion.Euler(End[i] * armAngle[i], 0, 0);
        }
        // antenna: a damped spring pushed by the body's motion
        if (antenna != null)
        {
            var rest = -11.5f - 10f * Mathf.Abs(speed) / maxSpeed;
            antVel += ((rest - antAngle) * 160f - antVel * 6f + acc * 34f) * dt;
            antAngle += antVel * dt;
            antenna.localRotation = Quaternion.Euler(antAngle, 0, 0);
        }
    }

    // ---------------------------------------------------------------- helpers

    // back to a fresh drone, folded: undoes Shutdown() and stops whatever it was doing
    void Wake()
    {
        stateT = 0; hopT = -1; launched = false; wasGrounded = true;
        throttle = turn = speed = yawRate = lastSpeed = pitch = roll = 0;
        antAngle = -11.5f; antVel = 0;
        for (var i = 0; i < 4; i++) armAngle[i] = RideAngle;
        anim.Stop();
        SamplePose("hop", 0f);      // only hop moves the thumper: this puts it back
        SamplePose("deploy", 0f);   // folded: arms up, shutters shut, antenna down
        SetLights(true);
        ShowFeed(false);            // back on when it lands
        motor.Stop(); motor.volume = 0f;
        rb.isKinematic = false; rb.interpolation = interpolation;
        if (box != null) box.enabled = true;
    }

    void ShowFeed(bool on)
    {
        if (FeedCamera != null) FeedCamera.enabled = on && FeedCamera.targetTexture != null;
    }

    void SetLights(bool on)
    {
        foreach (var l in leds)
        {
            var m = l.mat;
            if (m.HasProperty("emissiveFactor")) m.SetColor("emissiveFactor", on ? l.factor : Color.black);   // glTFast shaders
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", on ? l.color : Color.black);    // Standard / URP Lit
            if (on && l.emissive) m.EnableKeyword("_EMISSIVE"); else m.DisableKeyword("_EMISSIVE");
            if (on && l.emission) m.EnableKeyword("_EMISSION"); else m.DisableKeyword("_EMISSION");
        }
    }

    void SamplePose(string clip, float time)
    {
        var s = anim[clip]; if (s == null) return;
        s.enabled = true; s.time = time; s.weight = 1f; anim.Sample(); s.enabled = false;
    }

    bool Grounded() { float h; return GroundBelow(transform.position + Vector3.up * 0.05f, 0.09f, out h); }

    bool GroundBelow(Vector3 from, float distance, out float height)
    {
        height = 0;
        var n = Physics.RaycastNonAlloc(from, Vector3.down, hits, distance, ground, QueryTriggerInteraction.Ignore);
        var best = float.MaxValue;
        for (var i = 0; i < n; i++)
        {
            if (hits[i].collider.transform.IsChildOf(transform)) continue;
            if (hits[i].distance < best) { best = hits[i].distance; height = hits[i].point.y; }
        }
        return best < float.MaxValue;
    }

    void DampHorizontal()
    {
        if (rb.isKinematic) return;
        var v = GetVelocity(); v.x *= 0.8f; v.z *= 0.8f; SetVelocity(v);
    }

#if UNITY_6000_0_OR_NEWER
    Vector3 GetVelocity() { return rb.linearVelocity; }
    void SetVelocity(Vector3 v) { rb.linearVelocity = v; }
#else
    Vector3 GetVelocity() { return rb.velocity; }
    void SetVelocity(Vector3 v) { rb.velocity = v; }
#endif
}
