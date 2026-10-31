// Drives the scout drone. Put it on the root of the scout-drone prefab (built from unity/scout-drone.glb with
// Tools > Gunmodls; import with Animation: Legacy). It adds a Rigidbody and one BoxCollider if there are none.
//   Throw(velocity)       when it leaves the hand: it tumbles, and when it lands on its belly it plays 'deploy' and stands up
//   Drive(throttle, turn) every frame, both -1..1 (turn > 0 turns right); ignored until it has stood up
//   Hop()                 the belly thumper fires and the drone jumps about 25 cm
//   Shutdown()            destroyed or picked up: sags onto its belly, lights out, feed cut
// While it drives, the wheels spin from the distance each side covers and each arm swings so its wheel stays on the
// ground (a raycast per wheel). A camera on fx_lens_nose renders the feed into `feed`.
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
    public float hopSpeed = 2.25f;         // m/s up when the thumper fires (about 0.26 m high)
    public LayerMask ground = ~0;
    [Header("Feed")]
    public RenderTexture feed;
    public float fieldOfView = 92f;
    [Header("Sound")]
    public AudioClip throwSound, landSound, deploySound, motorLoop, hopSound, shutdownSound;
    public UnityEvent onDeployed = new UnityEvent(), onLanded = new UnityEvent(), onShutdown = new UnityEvent();

    public enum State { InHand, Thrown, Deploying, Ready, Off }
    public State Current { get; private set; }
    public Camera FeedCamera { get; private set; }
    public float Speed { get { return speed; } }

    // the same numbers as the viewer (glTF metres)
    const float R = 0.043f, L = 0.07f, WX = 0.098f, RideAngle = 40f, StowAngle = -2.2f, HopLaunch = 0.14f;
    static readonly string[] Wheels = { "fl", "fr", "rl", "rr" };
    static readonly int[] Side = { 1, -1, 1, -1 };   // +1 = left wheels
    static readonly int[] End = { 1, 1, -1, -1 };    // +1 = front wheels

    Animation anim;
    Rigidbody rb;
    Transform body, antenna;
    readonly Transform[] arms = new Transform[4], wheels = new Transform[4];
    readonly float[] spin = new float[4], armAngle = new float[4];
    readonly List<Material> leds = new List<Material>();
    readonly RaycastHit[] hits = new RaycastHit[8];
    AudioSource oneShot, motor;
    float throttle, turn, speed, yawRate, lastSpeed, pitch, roll, antAngle = -11.5f, antVel, stateT, hopT = -1;
    bool launched;
    Vector3 bodyRest;

    void Awake()
    {
        anim = GetComponent<Animation>();
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
            foreach (var m in r.materials) if (m.name.StartsWith("led_purple")) leds.Add(m);
        if (body != null) bodyRest = body.localPosition;
        rb = GetComponent<Rigidbody>();
        if (rb == null) { rb = gameObject.AddComponent<Rigidbody>(); rb.mass = 1.6f; rb.interpolation = RigidbodyInterpolation.Interpolate; }
        if (GetComponent<Collider>() == null)
        {
            // one box for the whole drone, from the ground up; the per-part boxes from the prefab builder are turned off
            foreach (var c in GetComponentsInChildren<Collider>(true)) c.enabled = false;
            var box = gameObject.AddComponent<BoxCollider>();
            box.center = new Vector3(0, 0.068f, 0); box.size = new Vector3(0.22f, 0.13f, 0.3f);
#if UNITY_6000_0_OR_NEWER
            box.material = new PhysicsMaterial { dynamicFriction = 0.05f, staticFriction = 0.05f, frictionCombine = PhysicsMaterialCombine.Minimum };
#else
            box.material = new PhysicMaterial { dynamicFriction = 0.05f, staticFriction = 0.05f, frictionCombine = PhysicMaterialCombine.Minimum };
#endif
        }
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f;
        motor = gameObject.AddComponent<AudioSource>(); motor.spatialBlend = 1f; motor.loop = true; motor.clip = motorLoop; motor.volume = 0f;
        for (var i = 0; i < 4; i++) armAngle[i] = RideAngle;
        Current = State.Ready;   // placed in the level standing; call Throw() to start from the hand
    }

    Camera MakeCamera(Transform lens)
    {
        var go = new GameObject("feed_camera");
        go.transform.SetParent(lens, false);   // the lens looks along +Z
        var cam = go.AddComponent<Camera>();
        cam.fieldOfView = fieldOfView; cam.nearClipPlane = 0.01f; cam.targetTexture = feed;
        return cam;
    }

    // ---------------------------------------------------------------- commands

    public void Throw(Vector3 velocity)
    {
        Current = State.Thrown; stateT = 0;
        SamplePose("deploy", 0f);   // folded: arms up, shutters shut, antenna down
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
        Current = State.Off; stateT = 0; hopT = -1; throttle = turn = 0;
        anim.Stop(); anim.Play("shutdown");
        foreach (var m in leds) { m.SetColor("_EmissionColor", Color.black); m.DisableKeyword("_EMISSION"); }
        if (FeedCamera != null) FeedCamera.enabled = false;
        motor.Stop();
        if (shutdownSound != null) oneShot.PlayOneShot(shutdownSound);
        onShutdown.Invoke();
    }

    // ---------------------------------------------------------------- running

    void OnCollisionEnter(Collision c)
    {
        if (Current != State.Thrown) return;
        foreach (var p in c.contacts)
        {
            if (p.normal.y < 0.6f) continue;
            // landed: sit upright on the belly, keep the heading
            var fwd = Vector3.ProjectOnPlane(transform.forward, Vector3.up);
            if (fwd.sqrMagnitude < 1e-4f) fwd = Vector3.ProjectOnPlane(transform.up, Vector3.up);
            rb.angularVelocity = Vector3.zero; SetVelocity(Vector3.zero);
            rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
            transform.SetPositionAndRotation(new Vector3(transform.position.x, p.point.y, transform.position.z), Quaternion.LookRotation(fwd.normalized, Vector3.up));
            Current = State.Deploying; stateT = 0;
            anim.Play("deploy");
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
        var run = Mathf.Clamp01(Mathf.Abs(speed) / maxSpeed + Mathf.Abs(yawRate) / turnRate * 0.6f);
        if (motor.clip != null)
        {
            if (!motor.isPlaying) motor.Play();
            motor.pitch = 0.75f + 0.75f * run;
            motor.volume = Mathf.MoveTowards(motor.volume, run > 0.02f ? 0.15f + 0.45f * run : 0f, dt * 4f);
        }
        if (hopT >= 0) return;   // the hop clip owns the body, arms and antenna

        // body: leans back when it speeds up, out of a turn
        var acc = (speed - lastSpeed) / Mathf.Max(dt, 1e-4f); lastSpeed = speed;
        pitch = Mathf.Lerp(pitch, Mathf.Clamp(-acc * 0.7f, -3.5f, 3.5f), 1 - Mathf.Exp(-dt * 8));
        roll = Mathf.Lerp(roll, Mathf.Clamp(yawRate * Mathf.Deg2Rad * speed * 1.4f, -3.5f, 3.5f), 1 - Mathf.Exp(-dt * 8));
        if (body != null) { body.localPosition = bodyRest; body.localRotation = Quaternion.Euler(pitch, 0, roll); }
        // arms: swing each wheel down onto the ground under it
        for (var i = 0; i < 4; i++)
        {
            if (arms[i] == null) continue;
            var target = RideAngle;
            var probe = arms[i].parent.TransformPoint(arms[i].localPosition + new Vector3(0, 0, End[i] * L * Mathf.Cos(RideAngle * Mathf.Deg2Rad)));
            float h;
            if (GroundBelow(probe + Vector3.up * 0.1f, 0.35f, out h))
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

    void DampHorizontal() { var v = GetVelocity(); v.x *= 0.8f; v.z *= 0.8f; SetVelocity(v); }

#if UNITY_6000_0_OR_NEWER
    Vector3 GetVelocity() { return rb.linearVelocity; }
    void SetVelocity(Vector3 v) { rb.linearVelocity = v; }
#else
    Vector3 GetVelocity() { return rb.velocity; }
    void SetVelocity(Vector3 v) { rb.velocity = v; }
#endif
}
