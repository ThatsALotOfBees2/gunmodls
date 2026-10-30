// Aims a security or sticky camera and gives you its view. Put it on the camera prefab's root (the nodes
// "pan", "tilt" and "fx_lens" are found by name). Aim(pan, tilt) in degrees within the limits; a Unity Camera is
// created on fx_lens (it looks along +Z there) and renders into `feed` (or to the screen if feed is empty).
// For the sticky cam, Deploy() plays its 'deploy' clip; Destroyed() cuts the feed.
using UnityEngine;

public class DeviceCamera : MonoBehaviour
{
    public Vector2 panLimits = new Vector2(-70, 70), tiltLimits = new Vector2(-60, 20);
    public float aimSpeed = 90f;                 // degrees per second the servos can turn
    public float fieldOfView = 92f;
    public RenderTexture feed;
    public bool feedEnabled = true;
    public AudioClip servoLoop, boot, openSound, staticBurst;

    public float Pan { get; private set; }
    public float Tilt { get; private set; }
    public Camera FeedCamera { get; private set; }

    Transform pan, tilt, lens;
    float targetPan, targetTilt;
    AudioSource servo, oneShot;
    bool alive = true;

    void Awake()
    {
        foreach (var t in GetComponentsInChildren<Transform>(true))
        {
            if (t.name == "pan") pan = t;
            else if (t.name == "tilt") tilt = t;
            else if (t.name == "fx_lens") lens = t;
        }
        servo = gameObject.AddComponent<AudioSource>(); servo.loop = true; servo.clip = servoLoop; servo.spatialBlend = 1f; servo.volume = 0f;
        oneShot = gameObject.AddComponent<AudioSource>(); oneShot.spatialBlend = 1f;
        if (lens != null)
        {
            var go = new GameObject("feed_camera");
            go.transform.SetParent(lens, false);
            FeedCamera = go.AddComponent<Camera>();
            FeedCamera.fieldOfView = fieldOfView;
            FeedCamera.nearClipPlane = 0.02f;
            FeedCamera.targetTexture = feed;
            FeedCamera.enabled = feedEnabled;
        }
    }

    public void Aim(float panDeg, float tiltDeg)
    {
        targetPan = Mathf.Clamp(panDeg, panLimits.x, panLimits.y);
        targetTilt = Mathf.Clamp(tiltDeg, tiltLimits.x, tiltLimits.y);
    }

    public void Look(float dPan, float dTilt) { Aim(targetPan + dPan, targetTilt + dTilt); }

    public void Deploy()
    {
        var anim = GetComponent<Animation>();
        if (anim != null && anim.GetClip("deploy") != null) anim.Play("deploy");
        if (openSound != null) oneShot.PlayOneShot(openSound);
        if (boot != null) oneShot.PlayOneShot(boot);
    }

    public void Destroyed()
    {
        alive = false;
        if (FeedCamera != null) FeedCamera.enabled = false;
        if (staticBurst != null) oneShot.PlayOneShot(staticBurst);
        servo.Stop();
    }

    void Update()
    {
        if (!alive || pan == null || tilt == null) return;
        var step = aimSpeed * Time.deltaTime;
        var moving = Mathf.Abs(Pan - targetPan) > 0.05f || Mathf.Abs(Tilt - targetTilt) > 0.05f;
        Pan = Mathf.MoveTowards(Pan, targetPan, step);
        Tilt = Mathf.MoveTowards(Tilt, targetTilt, step);
        // glTF -> Unity (glTFast) mirrors X, so a turn toward glTF +X is a negative yaw here
        pan.localRotation = Quaternion.Euler(0f, -Pan, 0f);
        tilt.localRotation = Quaternion.Euler(-Tilt, 0f, 0f);
        if (servo.clip != null)
        {
            if (moving && !servo.isPlaying) servo.Play();
            servo.volume = Mathf.MoveTowards(servo.volume, moving ? 0.6f : 0f, Time.deltaTime * 6f);
            if (!moving && servo.volume <= 0f && servo.isPlaying) servo.Stop();
        }
    }
}
