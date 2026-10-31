# Conductive Lattice: integration guide

For anyone (or any session) wiring the lattice into the game. `viewer.html` is the reference for the look and
the timing. The Unity version is `unity/Runtime/ConductiveLattice.cs` at the repo root
(`../../unity/Runtime/ConductiveLattice.cs` from here). It is a hand port of the viewer's circuit generator, so
the rules live in two places: see [Changing it](#changing-it).

## How it plays

- Defender gadget, thrown. The node sticks where it hits a wall (a soft wall, or the panels of the Wall
  Fortification), sprays liquid metal that runs out from it as a circuit, cures, then pulses: live for 1.0 s,
  off for 2.0 s. Attackers can time their pushes on the off beat.
- Shooting the node kills the lattice for good. The cured metal stays on the wall as dead traces.
- Only the node is a model. The circuit is generated at runtime where the node lands.

## The circuit

Origin on the hit point, +Z along the surface normal (out of the wall, toward the defender).

- **Area:** a 2 × 2 m square centred on the node: ±1.0 m (`reach`) along the wall's horizontal and vertical,
  so about 1.41 m from the node along the diagonals. It is cut down to the face of the wall it hit, so a corner
  throw gives a quarter-sized lattice.
- **Traces:** 20 primary traces leave the node's rim (7.5 cm out) and walk outward in 5–15 cm steps on 45°
  angles, like a circuit board. They turn now and then (chance 0.28 per step) and steer away from the node.
- **Crossings:** a step stops its trace if its end point lands within 3.5 cm (a box test) of a point on an
  existing trace. The check is skipped for the first 0.1 m of every walk (branches included), and segments
  are never tested against each other, so traces do cross, mostly near the node.
- **Branches:** chance 0.2 per step, up to three levels deep. Each branch is 0.75× as wide and gets 0.6× the
  length budget. Round pads sit at every branch point and every trace end.
- **Width:** primary traces are 9–13 mm wide. The glow is 0.32× the trace width (pads 0.45×).
- **Spray distance:** each segment stores the length of trace from the node to its ends. The spray front
  reveals traces by this distance. The longest one, maxD, sets how long the spray takes.
- **Height:** traces 2 mm off the surface (`surfaceOffset`), glow 1 mm above them.
- **Seed:** the viewer and the Unity script use different random generators and seeds, so the same spot
  gives a different pattern in each.

## Timing

Time 0 is the moment of contact, which is when you call `Stick` and the `deploy` clip's time 0.

The node's `deploy` clip is fixed (2.928 s):

| Clip time | Node |
| --- | --- |
| 0 s | Contact. The body (`lattice_node`) is 1 cm off the wall (local +Z 0.01). |
| 0–0.35 s | The body seats onto the wall. |
| 0.40–2.23 s | `spray_head` makes three turns. |
| 2.23–2.93 s | It holds. The last frame is the prefab's rest pose. |

The lattice's timing depends on the pattern:

| Time after `Stick` | Lattice | Field |
| --- | --- | --- |
| 0.45 s | The spray front leaves the node at 0.9 m/s. Each trace appears as the front passes along it. | `sprayDelay`, `spraySpeed` |
| 0.45 + maxD / 0.9 s | The spray ends. | |
| 0.7 s later | Cured: the first live pulse. `LiveAt` returns this time. | `cureTime` |
| then | Live 1.0 s, off 2.0 s, until `Kill()`. | `pulseOn`, `pulseOff` |

- maxD is usually 1.3–2.4 m: median about 2.0 m on an open wall and 1.6 m on the fortification face. So the
  lattice usually goes live 2.6–3.8 s after contact (median about 3.4 s on an open wall, 2.9 s on the
  fortification face).
- These are not bounds. A node in a corner can give a maxD of 0.6 m (live after 1.8 s), and rare throws
  reach 3.5 m or more (live after 5 s or more). The numbers come from running the script's generator over
  6000 random throws per surface. Read `LiveAt` rather than relying on them.
- The clip is timed for 1.6 m of spray (viewer `T_NODE`), so on most throws the head stops while the metal
  is still running out. Don't scale the clip to match: read `LiveAt`.
- `deploy.wav` is 4.4 s long (spray sound 0.45–3.05 s, cure sound 3.0–3.9 s). It does not follow the pattern
  either.

## Unity setup

1. Follow the root README's Unity steps: install glTFast and copy `unity/Editor/GunmodlsPrefabBuilder.cs` into
   an `Editor` folder. Copy `unity/Runtime/ConductiveLattice.cs` (repo root) into the project.
2. Import `gadgets/conductive-lattice/unity/conductive-lattice-node.glb` (Animation: Legacy) and run
   Tools > Gunmodls > Build Prefabs From Selection.
3. Make a **prefab variant** of the result. Rebuilding saves over the base prefab and would drop anything
   you added to it.
4. On the variant's root (the object with the Animation component) add a Rigidbody and `ConductiveLattice`.
   Assign the three materials (see [Materials and effects](#materials-and-effects)) and the four WAVs from
   `gadgets/conductive-lattice/sounds/`.
5. The node has two box colliders: `lattice_node_COL` (the body, which moves 1 cm during `deploy`) and
   `spray_head_COL` (which turns during `deploy`). Send hits on either to `Kill()`, for example
   `hit.collider.GetComponentInParent<ConductiveLattice>().Kill()`.

glTFast imports every clip as a loop and plays the first one on its own. The script's `Awake` turns that off
and sets `deploy` to ClampForever, so the node stays seated after the clip.

### Throw and stick

Throw the node as a rigidbody. On its first hit with a wall, make it kinematic and call `Stick`:

```csharp
using UnityEngine;

// On the node prefab root, next to ConductiveLattice and the Rigidbody.
public class LatticeNodeThrow : MonoBehaviour
{
    public LayerMask wallMask;          // layers the node may stick to (the sealed fortification yes, the animated one no)
    public LayerMask latticeFaceMask;   // the layer of the lattice_face colliders (see Wall Fortification)

    void OnCollisionEnter(Collision c)
    {
        var lattice = GetComponent<ConductiveLattice>();
        if (lattice.IsDeployed) return;
        if ((wallMask.value & (1 << c.collider.gameObject.layer)) == 0) return;   // not a wall it may stick to
        var hit = c.GetContact(0);
        if (Mathf.Abs(hit.normal.y) > 0.7f) return;            // walls only: it bounces off floors and ceilings
        Vector3 point = hit.point, normal = hit.normal;
        Collider wall = c.collider;
        // over a sealed Wall Fortification, land on its panel faces instead
        RaycastHit f;
        if (Physics.Raycast(point + normal * 0.1f, -normal, out f, 0.3f, latticeFaceMask, QueryTriggerInteraction.Collide)
            && Vector3.Dot(f.normal, f.collider.transform.forward) > 0.9f)
        {
            point = f.point; normal = f.normal; wall = f.collider;
        }
        else if (wall.name == "body_COL") return;              // the fortification's frame, outside the panels
        GetComponent<Rigidbody>().isKinematic = true;
        lattice.Stick(point, normal, wall);
    }
}
```

`Stick` puts the node's root on the point with +Z along the normal and plays `deploy` from 0 (the clip starts
at contact, so nothing needs offsetting). It parents the node to the collider's transform and builds the
lattice beside it, also under that transform. Destroying the wall destroys both.

### Script reference

| Member | What it does |
| --- | --- |
| `Stick(point, normal, wall)` | Sticks the node and starts the lattice. The seed comes from the hit point. |
| `Stick(point, normal, wall, seed, elapsed = 0)` | The same with a given seed. `elapsed` is the seconds since the stick, for a late start (see [Multiplayer](#multiplayer)). |
| `Kill()` | Ends the lattice for good. Does nothing before `Stick`. See below. |
| `IsDeployed` | True from `Stick` on, also after `Kill()`. |
| `IsLive` | True during a live pulse. |
| `LiveAt` | Seconds after `Stick` of the first live pulse. Read it after `Stick`. |
| `Covers(point, behind = 0.5f, front = 0.3f)` | True while live if the point is over the covered square, near the wall. See [Damage and frying](#damage-and-frying). |
| `Lattice` | The generated `lattice` object (metal, glow, arcs). Null before `Stick`. |
| `onLiveStart`, `onLiveEnd` | The start and end of each live pulse. |
| `onLive` | Every frame while live. |
| `onKilled` | Once, from `Kill()`. |

Fields: `reach`, `spraySpeed`, `sprayDelay`, `cureTime`, `surfaceOffset`, `primaryTraces`, `pulseOn`,
`pulseOff`, `arcCount` (see [Changing it](#changing-it)), the three materials and the four sounds.

**Killing it:**

- `Kill()` hides the glow and arcs, stops the `deploy` clip where it is, stops the deploy or pulse sound and
  the hum, plays `power_down`, fires `onLiveEnd` (if it was live) and then `onKilled`. It does not hide or
  remove the node: do that yourself.
- With the clip stopped, the spray head stops turning. Killed in the first 0.35 s, the body stays where it
  was, up to 1 cm off the wall.
- `power_down` plays on its own temporary object at the node, so you can destroy the node straight after
  `Kill()`.
- Destroying the node (or the wall) without `Kill()` still hides the glow and arcs and fires `onLiveEnd` if it
  was live. It plays no sound and does not fire `onKilled`.
- Killed before it cures, the metal sprayed so far stays on the wall, half-grown.
- Before `Stick` (while it is in flight) `Kill()` does nothing, and the node still deploys when it lands.
  Destroy the node instead, or check `IsDeployed` before calling `Kill()`.

## Surfaces

### Wall colliders

- The lattice's edges come from the collider passed to `Stick`. Give each wall face that can be electrified
  its own BoxCollider, aligned with the wall. Any other collider type (a MeshCollider, one big level collider)
  falls back to its world-space bounding box, and traces can then run past the wall's edges.
- The script also sticks to floors and ceilings. The snippet above skips them with `Mathf.Abs(normal.y) > 0.7f`.
- The script sticks to any collider it is given and parents the node and the lattice to it. The snippet only
  sticks to colliders on a `wallMask` layer, so the node bounces off players, props and the animated
  fortification.

### Wall Fortification

In the viewer the node sits 0.1545 m out from the wall surface (`SURF.reinforced.nodeZ`), 4.5 mm in front
of the panel faces, which are at 0.150 m (`Z_PANEL` 0.105 + 0.045). Its traces are drawn at 0.1581 m
(`SURF.reinforced.z` + 1.6 mm). The covered face is x ±0.655 m, y 0.09–1.91 m. On a soft wall it sits on the
surface itself. With the setup below, the Unity node sits on the panel faces, with no gap.

The fortification has two Unity prefabs (see `gadgets/wall-fortification/README.md` and the root README): the
animated one plays `deploy` and `eject`, then the game swaps in the sealed one. Neither has a collider that
matches the panel faces:

| Prefab | Colliders | Sticking to it directly |
| --- | --- | --- |
| Animated | One `panel_rR_cC_COL` per panel, 0.66 × 0.37 m, front at z 0.150 | The lattice is clipped to the one panel it hit, and it is destroyed with the prefab when that is swapped out. |
| Sealed | One `body_COL`: x ±0.748, y −0.093–2.093, z −0.358–0.194 | The node floats 4 cm in front of the panels, and the box takes in the frame and reaches 9 cm below the floor. |

Numbers are for the standard (1.5 m) size. On the other sizes the panels are 0.41 m (small), 0.71 m (large)
or 0.64 m (xl) wide, and `body_COL` is ±(width/2 − 0.002) m in x.

What to do:

1. Only let the node stick to the sealed prefab: put the animated one on a layer that is not in `wallMask`.
   It is swapped out and would take the lattice with it.
2. Add a child `lattice_face` to the sealed prefab, under the same parent as `body_COL` (that parent's
   transform is identity in the .glb). Give it a BoxCollider with **Is Trigger** on, on its own layer:
   center (0, 1.0, 0.148), size from the table below. Its front is at z 0.150, the panel faces.
3. On a hit, raycast back onto `lattice_face` and pass that collider to `Stick`. The snippet above does this
   and skips hits on `body_COL` that miss the face (the frame around the panels). The node then lands on the
   panel faces, and the lattice covers the panel face as in the viewer and dies with the sealed prefab.

| Size | Width | `lattice_face` size |
| --- | --- | --- |
| small | 1.0 m | (0.81, 1.82, 0.004) |
| standard | 1.5 m | (1.31, 1.82, 0.004) |
| large | 3.0 m | (2.81, 1.82, 0.004) |
| xl | 4.0 m | (3.81, 1.82, 0.004) |

- The viewer only has the standard size. The other widths keep its 0.095 m margin from each side (the panels
  end 0.0855 m in from each side on every size). The box is centred on x = 0, so glTFast's X flip does not
  change it.
- The hatch lies on the floor and is not covered.
- With the node on the panel faces, its colliders reach z 0.1965 m (body) and 0.213 m (head), in front of
  `body_COL`'s 0.194 m, so shots from the front still hit the node.

## Damage and frying

Gameplay owns the numbers: neither the viewer nor the script sets damage, stun or a touch distance.

- `Covers(point, behind, front)` is true while live if the point is over the covered square and at most
  `front` metres in front of the lattice (the room side, +Z) or `behind` metres behind it (into the wall and
  out the far side). It tests the square, not the individual traces.
- `behind` is measured from the lattice, so it has to reach through the wall: for a wall T metres thick, pass
  `T + 0.3f` to catch hands on the attacker side. On the fortification the lattice sits 0.150 m out from the
  wall surface, so add that too.
- Suggested: on `onLiveStart`, hit each player whose hand or body point passes `Covers`, once per pulse. For
  damage per second, use `onLive` (every live frame) with `Time.deltaTime`.
- To fry gadgets on the wall: on `onLiveStart`, take the colliders from
  `Physics.OverlapSphere(lattice.Lattice.position, lattice.reach * 1.5f)` and keep the gadgets whose position
  passes `Covers`. Then:

| Gadget | Call |
| --- | --- |
| Scout Drone | `ScoutDrone.Shutdown()` |
| Cameras | `DeviceCamera.Destroyed()` |
| Breach Spider | `BreachSpiderFx` has no abort (its public API is `Play()` and `onDetonate`). Add a `Stop()` that stops its Animation, particle systems, lights and AudioSource, or destroy the spider. |

## Multiplayer

- The server (or whoever owns the throw) decides the stick. It runs the collision, picks one int seed per
  throw and sends the point, the normal, an id your game maps back to the wall collider, the seed and the
  server time of the stick.
- Every client calls `Stick(point, normal, wall, seed, serverNow - stickTime)` with those values, not with
  its own contact. The pattern, `LiveAt` and the pulse phase then match. A late joiner picks up the rest of
  the clip and of `deploy.wav`, or none of them once they are over.
- Don't seed from each client's own contact point. The 3-argument `Stick` hashes the raw float bits of the
  point, and a one-bit difference gives a completely different pattern.
- Damage and frying run on the server only, from its own `IsLive` or `Covers`. Clients only show it. The arcs
  are cosmetic and differ per client.
- Replicate `Kill()`.
- Each client's pulse clock runs on its own `Time.deltaTime` from its `Stick` call.

## Materials and effects

The .glb holds only the node's materials (`black_steel`, `frame_alloy`, `capacitor_coil`, `joint_steel`,
`led_purple`, `fasteners`). Make the lattice's three yourself. The values are from `viewer.html` (`LM`,
`glowMat`, `arcMat`):

| Field | Viewer | Unity |
| --- | --- | --- |
| `metalMaterial` | `liquid_metal`: #b9bcc4, metalness 1, roughness 0.22 | Lit, base #b9bcc4, metallic 1, smoothness 0.78, untextured |
| `glowMaterial` | `lattice_glow`: emissive #b48cff × 3.2; the live shader draws rgb(0.62, 0.44, 1.0) | Unlit or emissive #b48cff, intensity about 3, Bloom on |
| `arcMaterial` | additive #d9c6ff, no depth write, double-sided | Additive and using vertex colour (the script sets the lines to (0.85, 0.78, 1)) |

- #8a4dff is the node's LEDs (`led_purple`), not the glow.
- The generated meshes face +Z (out of the wall) and have no texture UVs. UV0.x holds each vertex's spray
  distance in metres.
- Assign `arcMaterial`. Without it the script makes a `Sprites/Default` material.
- The script shows the glow only while live. The viewer also draws it dimly (0.05) while not live.

Viewer effects the script does not do:

- **Crawling band:** while live a bright band runs outward along the glow:
  `band = pow(0.5 + 0.5 * sin(d * 9 - t * 14), 6)`, brightness `0.35 + 1.4 * band`, where d is the spray
  distance and t the time since the first pulse. In Unity, d is UV0.x of the glow mesh, so a custom shader can
  do the same.
- **Coil:** the `capacitor_coil` emissive intensity goes 0.4 → 2.9 over the cure (0.4 + 2.5 × cure), 5 while
  live, 1.6 + 0.6 × sin(3t) between pulses, 0.3 when powered off.
- **Light:** a point light #a77bff, range 3.5 m, intensity random 0.7–1.2 each frame, only while live,
  0.9 m in front of the traces at the covered area's vertical centre (the viewer uses x = 0).

## Sounds

`sounds/` holds 44.1 kHz mono 16-bit WAVs:

| File | Length | Plays | Field |
| --- | --- | --- | --- |
| `deploy.wav` | 4.4 s | On `Stick`: clamp at 0 s, spray 0.45–3.05 s, cure 3.0–3.9 s | `deploySound` |
| `pulse.wav` | 1.35 s | At each live start; it rings 0.35 s into the off beat | `pulseSound` |
| `idle.wav` | 2.0 s, seamless loop | From the first pulse until `Kill()`, under the pulses too (volume 0.5) | `idleLoop` |
| `power_down.wav` | 1.25 s | On `Kill()`, on a temporary object at the node | `powerDownSound` |

- The script adds two 3D AudioSources to the node in `Awake` (spatialBlend 1, default rolloff, no mixer
  group). To use a mixer, set them after `Instantiate`:
  `foreach (var s in node.GetComponents<AudioSource>()) s.outputAudioMixerGroup = group;`.
  `power_down` copies the first one's mixer group and volume.
- Regenerate with `pip install numpy`, then `python3 gadgets/conductive-lattice/sounds/generate_sounds.py`. It
  uses a fixed seed (7), so the output is the same each run, and it writes only the WAVs.
- The viewer plays its own MP3 copies, stored as base64 in `SOUND_DATA` in `viewer.html` (`deploy`, `pulse`,
  `power_down`; no `idle`). No tool updates them. After regenerating, re-encode each one
  (`ffmpeg -i deploy.wav -b:a 96k deploy.mp3`), base64 it and replace its `data:audio/mpeg;base64,` string, or
  the viewer keeps playing the old sounds.

## Changing it

The circuit and the timing live in two places. Change both:

| `viewer.html` | `ConductiveLattice.cs` | Controls |
| --- | --- | --- |
| `REACH` | `reach` | Half-size of the covered square |
| `SPRAY_V` | `spraySpeed` | Spray front speed |
| `T_SPRAY0` | `sprayDelay` | When the spray starts |
| `T_CURE` | `cureTime` | Cure time |
| `PULSE_ON`, `PULSE_OFF` | `pulseOn`, `pulseOff` | The pulse |
| `makeLattice` (20 traces) | `Generate`, `Walk` (`primaryTraces`) | The pattern |
| `ARCS` | `arcCount` | Number of arcs |
| `PRESS`, `T_PLACE` | none | The clip's 1 cm press-on |

- The clip length is `T_NODE = T_SPRAY0 + REACH * 1.6 / SPRAY_V + T_CURE`. The head turns from
  `T_SPRAY0 - 0.05` to `T_NODE - T_CURE`.
- `deploy()` in `sounds/generate_sounds.py` has its own times (clamp at 0 s, spray at 0.45 s for 2.6 s, cure
  at 3.0 s). Update it if the timing changes.
- The .glb extras (`reach_m`, `spray_m_per_s`, `pulse_on_s`, `pulse_off_s`) are labels. The script never
  reads them.
- A prefab keeps its serialized field values, so a new default in the C# does not reach an existing prefab.
  Change the fields on the prefab variant too.

After editing the viewer, rebuild from the repo root (tool install: root README, "Rebuilding the files"):

```bash
node tools/export-glb.js gadgets/conductive-lattice/viewer.html
node tools/unity-export.js gadgets/conductive-lattice/conductive-lattice-node.glb
node tools/render-preview.js gadgets/conductive-lattice/viewer.html
node tools/check-glb.js gadgets/conductive-lattice/unity/conductive-lattice-node.glb
```

`unity-export.js` needs the .glb path and writes `gadgets/conductive-lattice/unity/`. `check-glb.js` should
list the clip `deploy` (2.928 s with the current constants) with the tracks `lattice_node.position` and
`spray_head.quaternion`, and the parts `lattice_node_COL` and `spray_head_COL`. Then copy the new unity .glb
into the game, run Build Prefabs From Selection again and check that the prefab variant still has its
components and assignments.
