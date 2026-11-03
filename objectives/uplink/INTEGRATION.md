# Uplink: integration guide

This guide is for anyone, or any session, wiring the Uplink objective into the game or changing it.

- `viewer.html` is the reference: both models, every clip, the game flow, the plug flight, the runtime cable
  and the sounds.
- `../../unity/Runtime/UplinkServer.cs` and `../../unity/Runtime/UplinkLaptop.cs` are a working Unity version.

**Units:** metres and degrees, unless a line says otherwise.

**Axes:** positions are in glTF space unless a line says Unity. Both models are +Y up, with the front facing +Z.
An object's own left is +X (`_l` = +X, `_r` = -X), as if it faced you. glTFast negates X on import:

- glTF +X is Unity -X.
- Rotations about X stay the same; rotations about Y and Z flip sign.

The scripts only read imported transforms, so they need no special case for this.

## 1. What the objective is

| Prop | Role | What it does |
| --- | --- | --- |
| Uplink Server (`uplink-server.glb`) | the "bomb" | An ordinary 18U rack cabinet, two per site. Defenders protect it. |
| Uplink Laptop (`uplink-laptop.glb`) | the "defuser" | A rugged field laptop the attackers carry, plant on the floor near a server and plug into it. |

The link is a physical armoured data cable. There are no antennas and nothing wireless. Data flows from the
server to the laptop.

The laptop's plug is part of the laptop. While it is out of the bay, the game moves it to the server's
`uplink_port` and draws the cable between the laptop's `cable_anchor` and the plug every frame (section 6).

## 2. Server rig

The root is `uplink_server`, with its origin on the floor under the middle of the footprint. `body` is static
and holds every non-moving mesh: cabinet, rack equipment, cables, casters and feet. Everything below is a
child of `body`.

The pivots below are each node's origin at rest, in body space.

| Node | Pivot | Motion |
| --- | --- | --- |
| `door` | (-0.262, 0.155, 0.398) | Hinged about Y on the -X front post. `rotation.y` is 0 closed and -100° open: the free edge swings out to +Z, and the leaf ends up beside the cabinet's -X front. |
| `door/door_handle` | (0.492, 0.405, -0.002) in door space | A swing lever about door-space Z. 0 is latched, -90° unlatched. |
| `fan_top_1`, `fan_top_2` | (0, 1.022, ±0.150) | 7-blade rotors under the top grilles. They spin about Y; `fan_top_2` runs a third of a turn behind. |
| `drive_1` … `drive_24` | sled front-face centres at z 0.323 | Unkeyed. Each holds its sled meshes and a child `drive_led_i` at (0.042, 0.007, 0.006). |
| `link_led_1` … `link_led_12` | (x_c, 0.9522, 0.3235), x_c = -0.180 + 0.0145 c (+0.010 for c ≥ 6), c = 0..11 | Switch link LEDs above the top row of ports. |
| `port_shutter` | hinge axis X at (0.120, 0.5548, 0.3335) | The sprung dust shutter over the port. 0 is closed, -115° open (it swings out and up). |
| `port_lock` | hinge axis Z at (0.150, 0.531, 0.3245) | A small lever beside the port. 0 is locked, -40° released. |
| `uplink_port` | (0.120, 0.5378, 0.332), identity | A locator with no mesh, never keyed. +Z points out of the socket. When the laptop is connected, its `plug` node sits exactly on this pose. |
| `status_strip` | identity | Unkeyed. Holds the `status_glow` meshes: a 12 mm frosted bar in the header's front face (x ±0.200, y 0.998–1.010, standing 1 mm proud so it reads from above and the side), the same bar at the rear, a short bar on each side of the header (z ±0.200), and a ring light round the port. |

**Rack layout, U1 at the bottom:**

| U | Unit |
| --- | --- |
| 1–2 | UPS |
| 3 | blank |
| 4–5 | UPS battery |
| 6 | blank |
| 7–8 | `storage_2`, drives 13–24 |
| 9 | I/O panel, with the uplink port at x +0.120 |
| 10–11 | `storage_1`, drives 1–12 |
| 12 | blank |
| 13–14 | two compute servers |
| 15 | blank |
| 16 | patch panel |
| 17 | cable manager |
| 18 | switch |

**Drive numbering.** Each storage server has 12 sleds in 4 columns × 3 rows. The number is
`drive_i, i = 12k + 4·row + col + 1`, where:

- k = 0 is `storage_1` and k = 1 is `storage_2`;
- row 0 is the top row;
- col 0 is the -X column.

The upload race runs in that order.

**The port** sits on the I/O panel (U9), centred at (0.120, 0.5378). Its mouth is at z 0.332 and its bore has
radius 0.0105. A connected plug fills the cylinder of radius 0.014 from z 0.320 to 0.402, so the door cannot
close while the plug is in: eject the plug first. The port is reachable with the door open.

**Rest pose** (no clip playing) is closed and idle: door, handle, shutter and lock all at 0, and every LED
lit.

**Side panels** carry a pressed 2 mm stiffening field round the pull grip and a `grime_decal` material:
alpha-blended decal quads 0.4 mm off the paint (dust round the vent bands, hand marks round the grip). In
Unity give it a transparent shader with no depth write (glTFast does this for alphaMode BLEND).

## 3. Laptop rig

The root is `uplink_laptop`, with its origin on the floor under the middle of the closed laptop.
`base` is the body and it is keyed. The operator kneels in front (+Z) and looks at the screen. The battery
is in the +X side, and the cable bay is in the -X side, on the operator's left.

The pivots below are each node's origin, in base space.

| Node | Pivot | Motion |
| --- | --- | --- |
| `base` | keyed (position + rotation) | Carry sway, set-down, knocks. Deployed, it tilts on its feet by about 4.6° (rear up), about its front bottom edge (z 0.150, y 0): `base.position = (0, 0.15 sin a, 0.15 - 0.15 cos a)`, `rotation.x = a`. The rest values are (0, 0.0121, 0.0005) and 4.63°. |
| `lid` | hinge axis X at (0, 0.052, -0.128) | 0 is closed, -105° open. Holds the screen (material `screen`) and the cover glass. |
| `handle` | hinge axis X at (0, 0.012, 0.146) | 0 is folded flat up the front face; +90° for carry, where it sticks out along +Z. |
| `handle/grip` | (0, 0.038, 0) | The grip bar centre: the hand attach point. A locator. |
| `latch_l`, `latch_r` | hinge axis X at (±0.125, 0.034, 0.146) | 0 is closed, +70° open. |
| `foot_l`, `foot_r` | hinge axis X at (±0.150, 0.004, -0.112) | 0 is folded, +100° deployed. |
| `cable_door` | hinge axis Z at (-0.188, 0.010, -0.0105) | The armoured bay door. 0 (identity) is closed, +92° open: it drops outwards and lies flat. |
| `reel` | (-0.165, 0.027, 0.040), drum axis X | Paying out is negative (link 0 → -3 turns). `upload`, `complete` and `disable` hold -3 turns, and reeling in is positive (pack -3 → 0). Each clip starts at the angle the clip before it ends on, so no quaternion flips sign at a boundary and cross-fades stay clean. |
| `cable_anchor` | (-0.192, 0.034, -0.030), rotated -85° about Y | The bay mouth, where the cable leaves the laptop. Its +Z points out of the -X side (5° forward), the way the cable leaves, over the dropped bay door. Inside the bay a static cable span (part of `base`) runs from the reel through the guide eyelet at (-0.165, 0.030, 0.008) to this point. A locator, never keyed. |
| `plug` | holster (-0.165, 0.030, -0.062), identity; popped (-0.2617, 0.034, -0.0239), Ry +95° (the nose points out of the bay side, the tail sits on `cable_anchor`) | The cable's plug. Plug +Z is the direction from the nose to the tail. Keyed only by `carry`, `deploy` and `pack`; otherwise game-owned (section 6). |
| `plug/plug_collar` | (0, 0, 0.014) | The twist-lock ring. 0 is unlocked, +30° (about Z) locked. |
| `plug/plug_tail` | (0, 0, 0.070) | A locator at the end of the boot. +Z is the cable's direction leaving the plug. In the popped pose it coincides with `cable_anchor` (position, and +Z opposite to the anchor's). |
| `lock_lever` | hinge axis X at (0.158, 0.0465, -0.1145) | A small flag lever. 0 lies flat; at -75° it stands up (on `complete`). |
| `progress_1` … `progress_10` | deck, z -0.105, x -0.0945 … +0.0945 (0.021 pitch) | Progress segments, one mesh each (`progress_glow`). `progress_1` is at -X, the operator's left. Game-owned (section 5). |
| `status_led` | (0.125, 0.0461, -0.105) | The status light (`status_led`). Game-owned. |
| `fan` | (0.10, 0.026, -0.139), axis Z | The rear fan rotor. |
| `activity` | (0, 0.0455, -0.096) | A glowing shuttle (`led`) that slides along X in its slot. |
| `fx_sparks` | (0, 0.06, -0.12) | A game-owned locator for the disable sparks, with no mesh. |

The plug's whole envelope lies within radius 0.014. The positions above are also stored in the root's
extras as `plug_poses_base_space`.

**Rest pose** (no clip playing) is the end of `deploy`:

- lid at -105°, feet out, base tilted, latches open, handle folded;
- bay door open and plug popped;
- reel, collar, lever, fan and shuttle at 0;
- all progress segments and the status LED shown.

**Carry attach.** Parent the root to the hand so that `grip` sits in the palm. The laptop hangs with its
front edge up, its bottom against the carrier's leg and the cable bay towards the rear:

- In glTF terms, the laptop's +Z points up and its +X along the carrier's forward. This is for the left hand,
  as the viewer carries it.
- In Unity, for the left hand, use `Quaternion.LookRotation(carrierUp, outwardFromLeg)` relative to the hand.
- For the right hand, turn that 180° about the carrier's up so the bay still faces the rear (or accept the
  bay facing forward).

Then move the root by `hand.position - laptop.Grip.position`. `carry` swings the laptop about the grip, so the
grip itself does not move.

## 4. Clips

Every clip is sampled at 30 fps from the pose functions in `viewer.html`. No clip has root motion.

**glTFast import:**

- glTFast imports every clip as a loop and auto-plays the first one: `idle` on the server, `carry` on the
  laptop.
- The scripts switch auto-play off and set each clip's wrap mode and layer in `Awake`.
- Import with Animation set to Legacy.

### Server

The server's nodes fall into two sets:

- **Loop set L:** `fan_top_1` and `fan_top_2` (rotation), `drive_led_1..24` and `link_led_1..12` (scale, with
  STEP keys: 1 lit, 0.0001 off).
- **One-shot set O:** `door`, `door_handle`, `port_shutter` and `port_lock` (rotation).

| Clip | Keys | Starts | Ends / beats |
| --- | --- | --- | --- |
| `idle` 4.0 s loop | L | Fans at 0, every LED lit. | The fans turn +3 each (0.75 rev/s). Drive LEDs blink off 2–4 times for 0.1 s; link LEDs flicker off 3–6 times for 2 frames, at seeded, loop-seamless times. |
| `link` 1.2 s | O | Closed (all 0). | 0.00–0.20 the handle turns to -90°. 0.18–0.28 the door pops ajar to -5°. 0.28–0.85 it swings to -100° (ease-out), with a 3° rebound at 0.85–0.97. 0.77–0.93 the shutter flips to about -122° (a quarter-sine, under 40° per 30 fps key), settling to -115° by 1.05. Ends with door -100°, handle -90°, shutter -115°, lock 0. |
| `upload` 2.0 s loop | L | O held at the end of `link`. | The fans turn +6 each (3 rev/s). Drive LED i is lit while `wrap01(t / 1.0 - (i - 1) / 24) < 0.25`: a band of 6 runs `drive_1` → `drive_24`, twice per loop. Link LEDs flicker 8–12 times per loop. |
| `complete` 1.2 s | L + O | Upload at t 0, door open. | 0.00–0.30 the race runs on. 0.30–0.40 every drive LED is off. From 0.40, drive_i relights at `0.40 + 0.35 (i - 1) / 23` and stays lit. Link LEDs are steady from 0.30. The fans slow from 3 to 0.75 rev/s. 0.85–1.00 `port_lock` springs to -40°. |
| `abort` 1.0 s | O | The end of `link` (the plug has been ejected). | 0.00–0.06 the lock kicks to -40°, then returns to 0 over 0.30–0.45. 0.05–0.20 the shutter snaps shut, with a 6° rebound. 0.30–0.80 the door swings shut, with a 2° rebound. 0.85–1.00 the handle relatches. Ends closed (the rest pose). |

**Layers.** `idle` and `upload` key exactly the same nodes, so a cross-fade between them is clean.

| Layer | Clips | How they play |
| --- | --- | --- |
| 0 | `idle`, `upload` | Loop; cross-fade 0.4 s between them. |
| 1 | `link`, `complete`, `abort` | ClampForever. |

`complete` is cross-faded in on layer 1 over 0.25 s, after which the layer-0 loops are stopped.

**A new round:** stop everything, sample `abort` at its end and `idle` at 0, then play `idle`
(`ResetServer()` does this).

### Laptop

The laptop's nodes fall into two sets:

- **Set A:** `base` (position and rotation); `lid`, `handle`, `latch_l`, `latch_r`, `foot_l`, `foot_r`,
  `cable_door`, `reel`, `plug_collar`, `lock_lever` and `fan` (rotation); `activity` (position).
- **Set P:** `plug` (position and rotation).

No clip keys `cable_anchor`, `plug_tail`, `grip`, `progress_*`, `status_led` or `fx_sparks`. All clips play on
one layer, and each starts at the previous clip's end pose.

| Clip | Keys | Starts | Ends / beats |
| --- | --- | --- | --- |
| `carry` 2.0 s loop | A + P | Closed and latched, feet folded, door shut, plug holstered, reel 0, handle +90°. | Sways about the grip: ±1.5° about X and ±1° about Z, a quarter cycle apart. |
| `deploy` 2.4 s | A + P | `carry` at 0. | 0.00–0.30 the sway settles and the base lands (from +1 cm). 0.25–0.55 the handle folds. 0.55–0.75 `latch_l` pops and 0.62–0.82 `latch_r`. 0.80–1.40 the lid opens to -105°, overshooting to about -108° and settling by 1.55. 1.30–1.70 the feet kick out and the base tilts to 4.6°. 1.65–2.00 the bay door drops to +92°, with a 6° bounce at 2.00–2.12. 2.00–2.35 the plug springs from the holster to the popped pose. Ends at the rest pose. |
| `link` 1.6 s | A | The rest pose. | 0.05–1.20 the reel pays out 0 → -3 turns (smoothstep, peaks about 47° per 30 fps key), with an 8° overrun that settles back by 1.40. 0.15–0.60 a 0.6° yaw tug on the base. 1.35–1.55 the collar springs to +30° (locked). Ends with reel -3 turns and collar +30°. |
| `upload` 2.0 s loop | A | The end of `link`. | The fan turns 6 times and the shuttle runs ±0.09 twice. Collar +30°. |
| `complete` 1.2 s | A | Upload. | 0.00–0.30 the shuttle parks at 0. 0.30–0.70 the lever springs to -75° (overshoot, settled by 0.70). 0.50–0.70 a 1 mm clunk of the base. The fan spins down to a stop by 1.2. Collar stays +30°. |
| `disable` 1.2 s | A | Upload or link. | 0.00–0.08 a knock: the base drops 3 mm and rolls 2°, recovering by 0.30. 0.02–0.12 the collar snaps to 0. 0.05–0.40 the lid is slammed to -45°, bouncing to about -52° near 0.5. 0.05–0.35 the bay door rattles (dipping to about +78°). 0.08–0.30 the reel jerks +0.35 turn from -3 and wobbles. The fan stops by 0.6. Ends: lid -45°, collar 0, reel -2.65 turns. |
| `pack` 1.8 s | A + P | The rest pose, with the plug at the popped pose (lever and collar at 0). | 0.00–0.95 the reel winds in from -3 turns to 0 (smoothstep, peaks about 57° per 30 fps key). 0.10–0.40 the plug goes popped → holster. 0.40–0.62 the door swings shut, with a small bounce. 0.65–0.90 the feet fold and the base levels. 0.90–1.35 the lid closes. 1.35–1.47 `latch_r` closes, then 1.43–1.55 `latch_l`. 1.55–1.80 the handle swings out. Ends exactly at `carry` t 0. |

**Wrap modes:** `carry` and `upload` loop; the other clips are ClampForever.

**Cross-fades:**

| Script | Cross-fade |
| --- | --- |
| UplinkLaptop | 0.15 s into `deploy`, `pack` and `complete`; 0.05 s into `link`; 0.2 s into `upload`; 0.1 s into `disable` (killed while planting, `deploy` freezes instead) |
| Viewer | 0.25 s for every change |

## 5. Screen, progress segments and lights

### Screen atlas

The screen uses a texture atlas on the `screen` material:

- **Texture:** 1536 × 1024 px, 4 × 4 cells of 384 × 256, each cell with an 8 px black margin. It is the
  `emissiveTexture` of `screen` (emissive factor 1, base colour near black).
- **Cell position:** cell i is at column i % 4, row floor(i / 4), counted from the top-left.
- **UVs:** the screen mesh's UVs cover cell 0.
- **Texture transform:** the file carries an identity `KHR_texture_transform` on the texture, so glTFast
  builds the material with texture transforms on.
- **Extras:** the cell list and the layout are also stored in the laptop root's extras as `screen_atlas`.

| Row | Col 0 | Col 1 | Col 2 | Col 3 |
| --- | --- | --- | --- | --- |
| 0 | 0 `off` | 1 `boot_a` | 2 `boot_b` | 3 `search_a` |
| 1 | 4 `search_b` | 5 `link` | 6 `upload_1a` | 7 `upload_1b` |
| 2 | 8 `upload_2a` | 9 `upload_2b` | 10 `upload_3a` | 11 `upload_3b` |
| 3 | 12 `upload_4a` | 13 `upload_4b` | 14 `complete` | 15 `disabled` |

The art is abstract: rings, bars, waveforms, dot grids and dashed traces. `disabled` is dim red.

**Showing cell i:**

| Where | Offset |
| --- | --- |
| three.js and glTF | `(col / 4, row / 4)` |
| Unity | glTFast flips V, so the offset is the imported offset `+ (scale.x · col / 4, −scale.y · row / 4)` |

In Unity, `UplinkLaptop.SetCell(i)` does this on its own copy of the material, for every slot that moves the
emission map:

- `emissiveTexture` (glTFast shaders);
- `_EmissionMap`, `_BaseMap` and `_MainTex` (Standard and URP Lit move the emission map with the base map's
  tiling).

It also enables `_TEXTURE_TRANSFORM`.

**Which cell to show** (t is the time in the state, `now` any running clock):

| State | Cell |
| --- | --- |
| Carried, packing | 0 `off` |
| Deploy (plant 0–2.4 s) | `boot_a` / `boot_b`, alternating at 4 Hz (`floor(now · 4) % 2`) |
| Link, plant 2.4–3.8 s (link time < 1.4) | `search_a` / `search_b` at 3 Hz |
| Plant 3.8–6.0 s (plug locked, handshake) | 5 `link` |
| Upload (and while a defender holds disable) | `6 + 2q + (floor(now · 4) % 2)`, with q = min(3, floor(4p)) and p the upload progress |
| Complete | 14 |
| Disabled | 15 |

### Progress segments

The segments are the nodes `progress_1..10`. Show one at scale 1 and hide it at scale 0.0001.

- **Uploading:** segment i is shown when p ≥ i / 10. The next one (i = floor(10p) + 1) blinks at 2 Hz:
  shown while `sin(now · 4π) > 0`.
- **Complete:** all shown.
- **Any other state:** all hidden.

`progress_tick.wav` plays as each segment fills, every 4.5 s.

### Status lights

The game tints these lights. The models export them purple.

Glow colours, all as emissive:

| Name | Colour |
| --- | --- |
| purple | `#8a4dff` |
| alarm red | `#ff2a3a` |
| lilac | `#b89cff` |

**`status_led` (laptop):**

| State | Colour | Level |
| --- | --- | --- |
| Carried, packing | — | off |
| Deploy, link | purple | blinks at 2 Hz (1 / 0.15) |
| Handshake (plant 4.0–6.0 s) | purple | blinks at 4 Hz |
| Upload | purple | on, with a 0.1 s dip to 0.1 every second |
| Complete | lilac | steady |
| Disabled | red | blinks at 4 Hz for 1.5 s, then 40 % |

**`status_glow` (server: header bars and port ring):**

| State | Colour | Level |
| --- | --- | --- |
| Idle | purple | `0.85 + 0.15 sin(0.5π now)` |
| Linking / handshake | purple | `0.6 + 0.4 sin(6π now)` |
| Uploading | alarm red | `0.4 + 0.6 (0.5 + 0.5 sin(3π now))` |
| Complete | red | steady |
| Abort | from the current colour back to purple | over 0.5 s |

**Drive and link LEDs (`drive_led` material):** blinked by the clips (scale); they stay purple.
UplinkServer's `tintDriveLeds` option turns them red with the strip.

**`led` (laptop: the activity shuttle and the lever tell):** fades out over 0.3 s when the laptop is disabled.

**How the scripts write emission:** they set `emissiveFactor` (glTFast) and `_EmissionColor` (Standard / URP)
in linear terms, on material copies the component owns. They keep the imported strength.

**Every emissive in the files** (`led`, `drive_led`, `status_glow`, `status_led`, `progress_glow`) has
`emissiveFactor` [0.2542, 0.0742, 1.0], which is `#8a4dff` in linear. No file uses
`KHR_materials_emissive_strength`. The viewer boosts the glows for bloom only (`material.userData.glow`).

## 6. Plug, port and cable (the contract)

The plug stays a child of the laptop (`base/plug`), so the clip bindings keep working. While it is out of the
bay, the game writes its **world** pose every frame, after the animation; Unity does this in `LateUpdate`.

Notation used below:

| Symbol | Meaning |
| --- | --- |
| S | The popped pose (the end of `deploy`), in world space. |
| E | The `uplink_port` world pose. |
| F | The port's +Z, in world space. |
| A | The approach point, E + 0.10 F. |
| out | The laptop's bay side (glTF -X), made horizontal. |

| Phase (laptop link time t) | Plug world pose |
| --- | --- |
| carry, deploy, pack | The clip's own pose. |
| link 0.00–0.10 | S. |
| link 0.10–1.15 (plant 2.5–3.55) | A cubic Bezier S → A with controls S + 0.20 out + 0.12 Y and A + 0.30 F + 0.15 Y: it leaves the bay sideways, clear of the lid, and arrives square to the port. u = ease(lin(t, 0.10, 1.15)) on the curve; rotation slerp(S, E, ease(u)). |
| link 1.15–1.35 (plant 3.55–3.75) | Pushed in from A to E along -F (ease-out). |
| link 1.35 → end of upload / complete | Exactly E. The collar twists 1.35–1.55; the plug is locked at plant 3.95 s. |
| disable | Yanked. 0–0.06 s it comes 0.04 m out along F, and drifts a further 0.22 (1 − e^(−3τ)). It falls under g 9.8 (y = start − 4.9 τ², with τ = t − 0.06) to floor + 0.014, then bounces 12 mm over 0.14 s. It turns 50° about Y over 0.6 s (ease-out), and stays there. |
| plant cancelled after the plug left the bay, or pick-up after complete | Reeled back to S over 0.5 s (eased), lifted 0.07 m at mid-way, then `pack` plays (cross-fade 0.15 s). UplinkLaptop first pulls it 0.04 m out along F over 0.06 s, when it was seated. |

`ease` is the cubic in-out, `easeOut(x) = 1 − (1 − x)³`, and `lin(t, a, b)` is the clamped linear 0 → 1.

### Cable path

The endpoints:

- p0 = `cable_anchor` world position, t0 = its world +Z;
- p3 = `plug_tail` world position, t3 = its world +Z.

With f = floor y + r and h = p3.y − f (the plug's height above the floor), the soft floor is
y = f + k ln(1 + exp((y − f) / k)), k = 0.01. There are two shapes, blended point by point with
wH = smoothstep(0.10, 0.30, h). A plug on the floor uses the first; a plug in the port uses the second.

**Single span** (the plug in the bay, carried low or dropped):

```
d    = |p3 - p0|
h0   = min(0.4 d, 0.18)        h3 = min(0.4 d, 0.12)       (the cable bows out of the bay side, clear of the shell)
t3d  = normalize(t3 - 0.6 Y)                                the plug end bends down
B(u) = cubic Bezier(p0, p0 + h0 t0, p3 + h3 t3d, p3), u in 0..1
L    = 1.22 d + 0.18 smoothstep(0.05, 0.6, d)               free length
s    = sqrt(3 d (L - d) / 8)                                sag of a parabola of that length
w    = smoothstep(0, 0.12, |B(u) - p0|)                     the sag eases in near the anchor, over the bay door
P(u) = B(u) - Y s 4u(1 - u) w^2, then the soft floor        (interior points only)
```

**Two spans** (the plug up at the port). The heavy cable leaves the boot nearly level and turns down within
about 10 cm. It drops almost vertically, touches the floor about 0.28 m in front of the rack, then runs along the
floor to the bay:

```
A    = horizontal unit (p0 - p3)                            towards the laptop
F    = normalize(horizontal unit t3 + 0.5 A)                the port's forward made level, turned towards the laptop
T    = (p3.x, f, p3.z) + min(0.28, 0.6 |horizontal (p0 - p3)|) F       the touchdown point
drop = Bezier(p3, p3 + 0.07 t3, T + 0.55 h normalize(Y - 0.35 A), T), no sag
dL   = |p0 - T|,  L = 1.15 dL + 0.10
S    = horizontal perpendicular of (p0 - T), on the side t3 points to
floor= Bezier(p0, p0 + min(0.4 dL, 0.18) t0, T + min(0.4 dL, 0.12) horizontal unit (p0 - T), T)
       + sag sqrt(3 dL (L - dL) / 8) 4u(1 - u) w^2 along normalize(0.9 S - 0.5 Y)     a gentle bow out into the room
```

The drop gets round(n · 1.1|p3 − T| / (1.1|p3 − T| + L)) of the n = 48 segments, with at least 6 for each span.
The points run anchor → T → plug. Then apply the soft floor, then 3 passes of
p[i] = 0.25 p[i−1] + 0.5 p[i] + 0.25 p[i+1] for i = 2..n−2, which rounds the touchdown and keeps the tangents at
the bay and the boot. Apply the soft floor again. The arc length runs over the joined list, so the pulse distance
x stays continuous across the touchdown.

- **Tube:** radius r = 0.0045 (9 mm), 48 segments × 10 sides. Frames by parallel transport from t0, with
  triangles facing outwards.
- **UVs:** u = arc length from the anchor / 0.024, v = 0..1 around, so the `cable` armour texture (no texture
  transform) keeps its helix pitch.
- **Floor:** the floor y is the laptop root's height.
- **Drawn only while the game owns the plug:** from `link` (carried, in the port, yanked, reeled back) until
  the plug is back at the popped pose. In `carry`, `deploy` and `pack` the clip moves the plug between the
  holster and the popped pose and the bay's static span is the cable. Also hidden when the cable door is open
  less than 20°, or when the endpoints are within 2 mm of each other (the popped pose).
- **Reach:** the reel holds 3.5 m and plants are refused beyond 3.0 m, so L never runs out.

### Data pulses

The pulses run from the server to the laptop. With x the distance from the plug end along the cable:

```
f = fract((0.9 t - x) / 0.30)
b = smoothstep(0, 0.015, f) (1 - smoothstep(0.015, 0.13, f))
```

That gives bands every 0.30 m, about 4 cm long, with a sharp front towards the laptop. They move at 0.9 m/s,
coloured `#8a4dff`.

| State | Pulse strength |
| --- | --- |
| Handshake (link t > 1.35) | `0.25 (0.6 + 0.4 sin(23 now) sin(7 now))` |
| Upload (and while being disabled) | 0.8 |
| Complete | Rises from 0.8 to 1.3 over 0–0.3 s, then fades to 0 by 0.8 s. |
| Otherwise, including disabled and reel-back | 0 |

### In Unity

`UplinkLaptop` builds the cable itself. It adds two child objects, `uplink_cable` and `uplink_cable_pulse`; there
is no separate cable component.

- **Tube** (`useLineRenderer` off, the default):
  - It generates a 41 × 11 vertex mesh with the laptop's own `cable` material, or `cableMaterial` if one is
    set.
  - It rebuilds the mesh only when an endpoint, tangent or the floor moved, and recalculates tangents for the
    normal map.
  - The pulses are a second tube at 1.12 × the radius with an additive material and a generated 256 × 1 band
    texture.
  - The band is scrolled through `_MainTex_ST` / `_BaseMap_ST` in a MaterialPropertyBlock, with
    `offset = repeat((0.9 now − length) / 0.30)`.
- **LineRenderer fallback** (`useLineRenderer` on, read in `Awake`):
  - The armour line uses Tile mode, on a copy of the cable material with texture scale 1 / 0.024.
  - The pulse line uses Stretch mode, with tiling of length / 0.30.

**Pulse material.** For player builds, assign `pulseMaterial`: any unlit additive shader with a main texture
and a colour. Without one, the script looks up these shaders by name, in this order:

1. `Universal Render Pipeline/Particles/Unlit` (URP only)
2. `Legacy Shaders/Particles/Additive`
3. `Sprites/Default`

Only shaders that are included in the build can be found this way.

The viewer's cable (`CableTube` and `cablePoints`) is drawn the same way. Neither cable is in the `.glb` files.

## 7. Effects

| What | Where | Notes |
| --- | --- | --- |
| Disable sparks and smoke | `fx_sparks` | Viewer: a first burst of about 40 sparks over 0.02–0.12 s, then small bursts (about 9 a second, 3–7 sparks each) until 1.6 s. Sparks are velocity-stretched streaks (4 mm wide, 8–45 mm long), live 0.25–0.75 s, fall under gravity and bounce off the floor. A warm point light 16 cm above the locator peaks at 1.5 for 0.15 s, then flickers under 0.5. Three dark-grey smoke puffs at 0.05 s and about 3.5 a second more until 1.2 s rise about 0.2 m over 1.3–1.7 s and grow from 5 to 20 cm. UplinkLaptop instantiates `sparksPrefab` at `fx_sparks` (as its child) on disable; give the prefab the same streaks and smoke. |
| Complete flash | (viewer only) | A purple point light in front of the port bumps for 1.4 s. |
| Cable pulses | the runtime cable | See section 6. |

## 8. Sounds

`sounds/*.wav` are 44.1 kHz mono 16-bit files made by `python3 objectives/uplink/sounds/generate_sounds.py`.
The script needs numpy and writes its output next to itself; its docstring describes each sound. The viewer
plays MP3 copies embedded as base64 in `const SOUND_DATA` in `viewer.html`.

| Sound | Length | Viewer: when (game phase time) | Unity field |
| --- | --- | --- | --- |
| `server_hum` | 4.0 s loop | Always. Louder near the server; pitch 1.08 while the server plays `upload`. | UplinkServer `humLoop` (same pitch rule) |
| `server_open` | 1.95 s | Plant 2.4 (server `link`). | UplinkServer `openSound`, in `BeginLink` |
| `shutter` | 0.55 s | Not used by the viewer. A spare spring snap. | — |
| `server_close` | 1.8 s | Disable 0.1; cancel after the plug left 0.1; pick-up 1.3. | UplinkServer `closeSound`, in `Abort` / `Close` |
| `alarm` | 0.5 s | At upload start, then every 1.5 s while uploading. | UplinkServer `alarmSound`, every `alarmInterval` 1.5 |
| `abort` | 1.2 s | Disable 0.25. | UplinkServer `abortSound`, in `Abort` only (not `Close`) |
| `set_down` | 0.8 s | Plant 0.22. | — (`deploy` covers it) |
| `latches` | 0.35 s | Plant 0.55. | — |
| `lid_open` | 1.2 s | Plant 0.8. | — |
| `cable_door` | 0.9 s | Plant 1.65. | — |
| `deploy` | 2.6 s | The `deploy` clip in the clip preview: set down, latches, lid, feet, bay door, plug pop. | UplinkLaptop `deploySound`, in `BeginPlant` |
| `cable_pay` | 1.75 s | Plant 2.45; cancel after the plug left 0; pick-up 1.0. | `cablePaySound`, at plant 2.4 |
| `plug_lock` | 0.9 s | Plant 3.68. | `plugLockSound`, at plant 3.75 (link 1.35) |
| `handshake` | 0.5 s | Plant 4.0. | `handshakeSound`, at plant 4.0 |
| `upload_loop` | 2.0 s loop | While the laptop plays `upload`; pitch 1.12 at ×5. | `uploadLoop`, while uploading and disabling |
| `progress_tick` | 0.14 s | Each segment filled. | `progressTick` |
| `disable_hold` | 1.0 s loop | While a defender holds disable; pitch 0.8 → 1.5 with the hold. | `disableHoldLoop` (same pitch rule) |
| `disable` | 2.05 s | Disable 0. | `disableSound` |
| `plug_eject` | 1.3 s | Disable 0.04. | `plugEjectSound`, on disable when the plug was out |
| `complete` | 2.15 s | Complete 0. | `completeSound` |
| `pack` | 2.35 s | Pick-up 1.5; cancel after the plug left 0.5; cancel during deploy 0. | `packSound`, when `pack` starts (not on an early cancel) |

**Viewer gains:** hum 0.3 (scaled by distance), upload 0.3, hold 0.28, alarm 0.35, tick 0.5, and the
one-shots 0.45–0.95 (`CUES` in `viewer.html`).

**Unity audio sources.** UplinkServer adds two 3D AudioSources: one-shots and hum. UplinkLaptop adds three:
one-shots, the upload loop and the hold loop. Both use Unity's default rolloff. Set the rolloff and mixer
group through `GetComponents<AudioSource>()` after `Awake`.

## 9. Gameplay rules and counterplay

| Rule | Value | Where |
| --- | --- | --- |
| Plant hold | 6.0 s, crouched; releasing cancels | `plantSeconds` (at least `deploySeconds` + 1.6) |
| Deploy | 0–2.4 s; link starts at 2.4 | `deploySeconds` |
| Upload | 45 s; p = elapsed / 45 | `uploadSeconds` |
| Disable hold | 6.0 s; releasing resets it to 0; the upload keeps running | `disableSeconds` |
| Disable reach | Defender within 1.5 m of the laptop root | `disableRange`, `InDisableRange(pos)` |
| Floor | Ground normal y ≥ 0.9 | `minGroundNormalY` |
| Cable reach | Horizontal distance from the laptop root to `uplink_port` ≤ 3.0 m | `cableReach` (server) |
| Height | Height difference from the laptop root to the port ≤ 0.5 m | `maxHeightDifference` |
| In front | (laptop − port) · server front ≥ 0.2 m | `minFrontDistance` |
| One per server | The server must be idle and unclaimed; it is claimed from the start of the plant | `CanAccept`, `Claim` |
| On disable | The laptop plays `disable`; the plug is yanked and drops; the server plays `abort`, then goes idle and free. The laptop is dead and cannot be re-planted (`ResetLaptop` for a new round). | |
| On complete | Attackers win the round. The laptop can be picked up: it reels in, the server door closes, it packs. | |

**Counterplay.** Defenders have several tells and options:

- The server's status strip and port ring turn alarm red and pulse at 1.5 Hz during the upload.
- The door stands open with a cable in the port.
- The alarm chirps every 1.5 s, and the upload hum and progress ticks are loud.
- Data pulses run along the cable.
- Shooting the laptop (`Kill()`) disables it at once, from planting through uploading.
- The cable is not an interaction target. The scripts give it no collider.

**Attacker side.** The laptop can stand anywhere within 3 m in front of the server, so attackers can plant it
behind cover. The plant cannot be sped up. A cancel after 2.4 s costs the time it takes to reel back and pack
(about 2.3 s).

**Colliders.** The Unity copies carry `_COL` boxes on the moving parts (`base_COL`, `lid_COL`, `plug_COL`,
`door_COL` and so on). The prefab builder turns them into BoxColliders. The scripts never touch them. While
the laptop is carried, put them on a layer that does not hit the carrier, or turn them off.

## 10. Unity

### Quick start

1. Import `unity/uplink-server.glb` and `unity/uplink-laptop.glb` with glTFast, with Animation set to Legacy.
   Build their prefabs with Tools > Gunmodls > Build Prefabs From Selection (see the root README's Unity
   section).
2. Add `UplinkServer` to the server prefab root and `UplinkLaptop` to the laptop prefab root. Assign the
   sounds, a `sparksPrefab`, and a `pulseMaterial` for builds.
3. Set the perforated doors' material (`perforated`) to Alpha To Mask (MSAA), or tick Mip Maps Preserve
   Coverage on its texture. Plain alpha test makes the door look like clear glass at range.
4. **Carrying:** parent the laptop to the attacker's hand (section 3). It starts `Carried`, playing `carry`.
5. **Planting:**
   - Find a server: `UplinkServer.FindPlantable(laptop, floorPoint)`.
   - Make a pose: `UplinkLaptop.PlantPoseFacing(server, floorPoint, floorNormal)`.
   - Check it: `laptop.CanPlant(server, pose)`.
   - On interact press, call `BeginPlant(server, pose)`. This unparents the laptop (`detachOnPlant`) and
     moves it to the pose.
   - On release before `onPlanted`, call `CancelPlant()`. Then re-parent the laptop to the hand on
     `onPacked`; the script leaves it on the floor.
6. **Defending:** when a defender within `InDisableRange` presses interact, call `BeginDisable()`; on release,
   call `CancelDisable()`. Call `Kill()` when the laptop is destroyed.
7. **Winning:** `onCompleted` (attackers) or `onDisabled` (defenders). Listen on the laptop, or on the server
   (`onCompleted` / `onAborted`, or `OnStateChanged`). On the server, `onAborted` means the laptop was
   disabled; a cancelled plant or a pick-up closes the server without it.
8. **New round:** call `ResetServer()` on every server and `ResetLaptop()` on the laptop.

Rebuilding a prefab removes the components and their settings. Use Copy Component before you rebuild and
Paste Component As New after.

### UplinkServer reference

`[RequireComponent(typeof(Animation))]`, on the uplink-server prefab root.

| Member | What it does |
| --- | --- |
| `Current` | `Idle`, `Linking`, `Uploading`, `Complete` or `Aborted`. `Aborted` covers the door closing, then it goes back to `Idle`. |
| `Laptop`, `UploadProgress`, `Busy` | The claiming laptop; progress 0..1 as the laptop reports it; `Busy` is true when it has a laptop or is not idle. |
| `Port`, `Door`, `StatusStrip`, `Front` | The `uplink_port` (required), `door` and `status_strip` transforms, and `Front`, the port's flat forward. |
| `static All`, `static FindPlantable(laptop, pos)` | Every enabled server, and the nearest one (by distance to its port) that would accept the laptop at pos. |
| `DistanceToPort(pos)`, `InReach(pos)` | Flat distance to the port; the reach rule (3 m flat, 0.5 m height, ≥ 0.2 m in front). |
| `CanAccept(laptop)`, `CanAccept(laptop, pos)` | Enabled, `interactable`, `Idle`, no other laptop, and in reach. |
| `Claim`, `Release`, `BeginLink`, `BeginUpload`, `SetProgress`, `Complete`, `Abort`, `Close` | Called by UplinkLaptop. Call them yourself only if you write your own laptop logic. |
| `Abort(laptop)` | The laptop was disabled. Plays `abort`, or, if `link` has not finished yet, runs `link` backwards at 1.6× (it stops exactly on frame 0 when it gets there). Plays `closeSound` and `abortSound` and fires `onAborted`. |
| `Close(laptop)` | The same motion, without `abortSound` and without `onAborted`. Used for a plant cancelled after the door opened, and for a pick-up after a completed upload. |
| `ResetServer()` | New round: door shut, `idle`, no laptop. |
| `event OnStateChanged(server, from, to)` | |
| `onLinked`, `onUploadStarted`, `onCompleted`, `onAborted` | UnityEvents. |

**Fields and defaults:**

| Group | Fields |
| --- | --- |
| Rules | `cableReach` 3, `maxHeightDifference` 0.5, `minFrontDistance` 0.2, `interactable` true |
| Lights | `idleColor` `#8a4dff`, `alarmColor` `#ff2a3a`, `glowIntensity` 1, `tintDriveLeds` false |
| Animation | `loopFade` 0.4, `completeFade` 0.25 |
| Sounds | `openSound`, `closeSound`, `alarmSound`, `abortSound`, `humLoop`, `alarmInterval` 1.5 |

**Materials driven.** It works on copies of `status_glow` and `drive_led`. A material matches when its name
is the exact name, or the name followed by a space, `(` or `.`.

### UplinkLaptop reference

`[RequireComponent(typeof(Animation))]`, on the uplink-laptop prefab root.

Destroying the GameObject closes the server quietly (no abort sound, no `onAborted`); call `Kill()` first if the destruction is a disable.

| Member | What it does |
| --- | --- |
| `Current` | `Carried`, `Planting` (0–2.4 s), `Linking` (2.4–6.0 s), `Uploading`, `Disabling`, `Complete`, `Disabled` or `Packing`. |
| `CanPlant(server, pose)` | `Carried`, the pose's up has y ≥ `minGroundNormalY`, and `server.CanAccept(this, pose.position)`. |
| `BeginPlant(server, pose)` | Claims the server, unparents (`detachOnPlant`), moves to the pose, and plays `deploy`. The 6 s plant then runs by itself: `link` at 2.4 s (with the server's `link`), the plug flight, `upload` at 6.0 s. Returns false if refused. |
| `CancelPlant()` | **Before 2.4 s:** `deploy` runs backwards at 1.6× into the carry pose and the server is released. **After 2.4 s** (also from `Uploading` or `Disabling`, so a late network cancel still cancels): the link clip freezes, progress goes to 0 and the server closes (`Close`: no abort sound, no `onAborted`); the plug comes 4 cm out of the port when it was seated, then flies back to the popped pose over 0.5 s, and `pack` plays. Ends `Carried`, on the floor. |
| `BeginDisable()`, `CancelDisable()` | Only from `Uploading`. The hold counts `disableSeconds`; the upload keeps running. |
| `Kill()` | Disabled at once, from `Planting`, `Linking`, `Uploading` or `Disabling`. Killed while `Planting`, `deploy` freezes where it is instead of playing `disable` (which starts fully deployed). |
| `Pickup()` | While planting it is the same as `CancelPlant`. After `Complete`, the plug is reeled back, `server.Close` runs 0.3 s into the reel-back, then `pack` plays. False otherwise. |
| `ResetLaptop()` | New round: carry pose, no server, lights out. A server still linked to it closes its door (`Close`), so it never stays busy if `ResetServer` is not called. |
| `SetUploadProgress(p)`, `SetDisableProgress(p)` | For networking (see section 11). |
| `InDisableRange(pos)`, `SetCell(i)`, `static PlantPoseFacing(server, floorPoint, floorNormal)` | The pose puts the laptop's rear towards the port; the operator kneels at its +Z. |
| `Server`, `PlantProgress`, `PlantTime`, `UploadProgress`, `DisableProgress`, `IsPlanted`, `PlugSeated`, `CableLength` | State readouts. |
| `Grip`, `Plug`, `CableAnchor`, `FxSparks`, `static Cells` | Transforms, and the 16 atlas cell names. |
| `event OnStateChanged`, `OnProgress`, `OnPlanted`, `OnPlantCancelled`, `OnCompleted`, `OnDisabled`, `OnPacked` | C# events. |
| `onPlanted`, `onPlantCancelled`, `onCompleted`, `onDisabled`, `onPacked`, `onDisableStarted`, `onDisableCancelled` | UnityEvents. |

**Fields and defaults:**

| Group | Fields |
| --- | --- |
| Rules | `plantSeconds` 6, `deploySeconds` 2.4, `uploadSeconds` 45, `disableSeconds` 6, `disableRange` 1.5, `minGroundNormalY` 0.9, `driveUploadExternally` false, `detachOnPlant` true |
| Cable | `useLineRenderer` false, `cableRadius` 0.0045, `cableSegments` 48, `cableSides` 10, `cableSlack` 1.22, `cableSlackExtra` 0.18, `anchorHandle` 0.18, `plugHandle` 0.12, `cableDroop` 0.6, `anchorLip` 0.12, `floorSoftness` 0.01, `armourTile` 0.024, `cableMaterial`; hanging from the port: `touchdown` 0.28, `touchdownToward` 0.5, `bootHandle` 0.07, `dropHandle` 0.55, `dropLean` 0.35, `floorSlack` 1.15, `floorSlackExtra` 0.10, `floorBow` 0.9, `hangHeight` (0.10, 0.30), `cableSmoothing` 3 |
| Pulses | `pulseMaterial`, `pulseColor` `#8a4dff`, `pulseIntensity` 2, `pulseSpacing` 0.30, `pulseSpeed` 0.9, `pulseHandshake` 0.25, `pulseUpload` 0.8, `pulseSurge` 1.3 |
| Lights | `idleColor`, `alarmColor`, `completeColor` `#b89cff`, `glowIntensity` 1 |
| Sounds | `deploySound`, `cablePaySound`, `plugLockSound`, `handshakeSound`, `uploadLoop`, `progressTick`, `disableHoldLoop`, `disableSound`, `plugEjectSound`, `completeSound`, `packSound` |
| Effects | `sparksPrefab` |

**Nodes it needs:** `plug`, `plug_tail` and `cable_anchor` (required), plus `cable_door`, `grip`, `fx_sparks`
and `progress_1..10`.

**Materials it drives:** `screen`, `status_led` and `led` (copies), and `cable` (used as is by the runtime
cable).

**Read in `Awake`:**

- The plug's holster and popped poses, from `carry` at 0 and the end of `deploy`. glTFast's mirroring is
  already in them.
- The bay side, from the sign of `cable_door`'s local x.

**Plug timing constants** (C# consts): link clip 1.6, flight 0.10–1.15, push 1.15–1.35, screen `link` from 1.4,
approach 0.10 m, yank 0.04 m / 0.06 s, drift 0.22, rest height 0.014, reel-back 0.5 s with 0.07 m lift, cancel
reverse 1.6×, server close on pick-up 0.3 s, cable shown from 20° of door.

## 11. Multiplayer

- **Authority.** Run the rules (plant and disable holds, reach checks, completion) on the authority, and
  replicate events:
  - plant started (server id, pose);
  - plant cancelled;
  - disable started and cancelled;
  - killed;
  - picked up;
  - round reset.

  On every client, call the matching method, so every client plays the same clips and the same plug flight.
- **Upload progress.** Set `driveUploadExternally` on clients and feed `SetUploadProgress(p)` from the
  authority at a low rate. The script advances nothing on its own then. `SetUploadProgress(1)` completes it.
  The authority runs with `driveUploadExternally` off, or drives it the same way.
- **Disable hold.** `SetDisableProgress(p)` mirrors the defender's hold: p > 0 starts it, 0 cancels it, 1
  disables. Disabling, the yank and the server abort follow locally.
- **The plant runs on local time.** It is 6 s from `BeginPlant`. A cancel event that arrives late still
  cancels cleanly: `CancelPlant()` also works from `Uploading` and `Disabling`, for a client whose own plant
  timer already ran out.
- **The plug and the cable are deterministic** from the laptop's state, the server's port and the clocks.
  Nothing about them needs to be sent.
- **Late joiners.** There is no API to jump straight into a running plant. A late joiner who arrives during
  the upload can call `BeginPlant` and then, once it reaches `Uploading` (6 s later), `SetUploadProgress`.
  Before that, show the laptop with your own pose, or accept the 6 s replay.
- **The screen and LED clocks** are local (`now`) and need no sync.

## 12. Changing it

### Where things live in viewer.html

`viewer.html` is self-contained and is both the demo and the procedural source of the two `.glb` files. It
embeds base64 sounds on one very long line, so search it by name rather than opening it whole.

| What | Where |
| --- | --- |
| Shared helpers | `V3`, `deg`, `ease`, `easeOut`, `seg`, `lin`, `springK`, `bump`, `wrap`, `prng` and the texture painters, at the top of the core section. |
| Materials | `MAT_NAMES`, `buildMaterials()`, `pbr()`, `glowMat()`, `coverageAlpha()` (the perforation's alpha-to-coverage). |
| Cable | `CABLE` (radius, tile, segments, sides, handles, slack, floor k, reach, stock, pulse spacing, speed, colour and strengths), `cablePoints()`, `tubeUV()`, `CableTube`. |
| Rules and extras | `GAME_RULES` and `CABLE_EXTRAS`, written into the roots' extras. `exportScenesFor()` builds the scenes and samples clips with `sampleClip()` (30 fps). `makeDebugSet()` is the `debug.set` switch. |
| Server | `SV` (every dimension: posts, rails, door, port, strip, drives, PDU, the `rack` unit list) and `buildServer()`. Inside it: `idleL`, `uploadL`, `completeL` (loop set) and `linkO`, `completeO`, `abortO` (one-shot set), `apply()`, `pose(clip, t)`, the `clips` table and `order`. |
| Laptop | `LP` (every dimension and range: lid, hinge, handle, latch, foot, bay, door, reel, anchor, plug, lever, progress, LED, fan, sparks), `SCREEN_CELLS`, `paintScreenAtlas()` (the atlas art) and `buildLaptop()`. Inside it: `CARRY`, `DEPLOYED`, `carry`, `deploy`, `link`, `upload`, `complete`, `disable`, `pack`, `apply()`, `pose()`, `setCell()`, the `clips` table and `plugPoses`. |
| Demo scene | `ROOM`, `RM`, `LIGHTS`, `LAYOUT` (laptop at (0.50, 0, 1.30), yaw 25°) and `VIEWS`. |
| Plug and cable at runtime | `plugTarget()` / `applyPlug()` (section 6), `CABLE_VIEW`, `pulseFor()`, `updateCable()`. |
| Lights and screen | `updateLights()` (segments, screen cell, status tints). |
| Game flow | `RULES` (plant 6.0, deploy 2.4, link end 4.0, upload 45, disable 6.0, ff 5), `GAME`, `gameStep()` (phases carry, plant, cancel, upload, complete, disabled, pickup), `CUES` (sound times), the mannequin (`DUMMY`, `poseDummy`), `SPARKS` and `fxStep()`. |
| Sounds and HUD | `SOUND_DATA`, `playSfx()`, `loopTick()` (hum, upload and hold loops), `hudState()` / `updateHud()`. |
| Page | `preview()` (the preview.png framing), `exportScenes()`, `exportGLB()`, and `window.__model.debug` (`set`, `game`, `simulate`, `stats`). |

### Numbers duplicated between viewer.html and the C# scripts

The scripts do not read the `.glb` extras. They take clip lengths and the plug poses from the imported clips;
everything else is copied by hand. Change these numbers in both places, and in this guide, together.

| C# | viewer.html |
| --- | --- |
| `plantSeconds` 6, `deploySeconds` 2.4, `uploadSeconds` 45, `disableSeconds` 6 | `RULES`, `GAME_RULES` |
| `cableReach` 3, `maxHeightDifference` 0.5, `minFrontDistance` 0.2, `disableRange` 1.5, `minGroundNormalY` 0.9 | `GAME_RULES` (the viewer does not test them) |
| `LinkClip` 1.6, `FlightStart` 0.10, `FlightEnd` / `PushStart` 1.15, `PushEnd` 1.35 | `plugTarget()`, the `link` clip length |
| `ScreenLinkAt` 1.4 | `updateLights()` (`lt >= 1.4`) |
| `Approach` 0.10 and the Bezier offsets 0.20 / 0.12 / 0.30 / 0.15 | `plugTarget()` |
| `YankOut` 0.04, `YankTime` 0.06, `YankDrift` 0.22, `PlugRestHeight` 0.014, 4.9, bounce 0.012 / 0.14, 50° over 0.6 s | `plugTarget()` (disable) |
| `RecallTime` 0.5, `RecallLift` 0.07 | `PLAY.plugRet` (0.5 s in `gameStep`, 0.07 in `plugTarget()`) |
| `ReverseSpeed` 1.6 (laptop), `LinkReverseSpeed` 1.6 (server) | `gameStep()` cancel (`1.6 * T`) |
| `ServerCloseAt` 0.3 | `gameStep()` pickup (reel-back from 1.0, server `abort` from 1.3) |
| `DoorShowAngle` 20, 2 mm hide | `updateCable()` |
| `cableRadius`, `cableSegments`, `cableSides`, `cableSlack`, `cableSlackExtra`, `anchorHandle`, `plugHandle`, `cableDroop`, `anchorLip`, `floorSoftness`, `armourTile`; `touchdown`, `touchdownToward`, `bootHandle`, `dropHandle`, `dropLean`, `floorSlack`, `floorSlackExtra`, `floorBow`, `hangHeight`, `cableSmoothing` | `CABLE` (`r`, `segs`, `sides`, `slack`, `handle`, `droop`, `lip`, `floorK`, `tile`; `hang`: `touch`, `toward`, `bootHandle`, `dropHandle`, `lean`, `slack`, `bow`, `height`, `smooth`) |
| `pulseSpacing`, `pulseSpeed`, `pulseHandshake`, `pulseUpload`, `pulseSurge`, the flicker `sin(23t) sin(7t)`, the band profile | `CABLE.pulse`, `pulseFor()`, the cable shader in `CABLE_VIEW` |
| Status rates and levels, colours `#8a4dff` / `#ff2a3a` / `#b89cff` | `updateLights()`, `TINT` |
| `alarmInterval` 1.5, hum pitch 1.08, hold pitch 0.8 + 0.7 × hold | `gameStep()` (alarm), `loopTick()` |
| `Cells` (16 names), the Unity offset rule | `SCREEN_CELLS`, `setCell()` |

### Rebuilding

Install the tools once:

```bash
cd tools && npm install && npx playwright install chromium && cd ..
```

Then, from the repo root:

```bash
node tools/export-glb.js objectives/uplink/viewer.html            # uplink-server.glb + uplink-laptop.glb
node tools/unity-export.js objectives/uplink/uplink-server.glb objectives/uplink/uplink-laptop.glb   # unity/
node tools/render-preview.js objectives/uplink/viewer.html        # preview.png
node tools/check-glb.js objectives/uplink/uplink-laptop.glb       # nodes, materials, extras, clips
python3 objectives/uplink/sounds/generate_sounds.py               # sounds/*.wav
```

**Load time.** The page takes a while to build in a software renderer: about 10–20 s here.

**File sizes:**

| File | Size | Notes |
| --- | --- | --- |
| `uplink-server.glb` | 11.0 MB | 131k triangles; many vertices because of flat-shaded creases, plus about 2.5 MB of textures. |
| `unity/uplink-server.glb` | 16.9 MB | LODs 131k / 65k / 24k triangles (stronger LOD targets from the root's `unity.lod` extras). |
| `uplink-laptop.glb` | 5.8 MB | 54k triangles. |
| `unity/uplink-laptop.glb` | 9.4 MB | LODs 54k / 38k / 18k triangles. |

**Validation.** Both `.glb` files and both Unity copies pass the Khronos glTF validator with 0 errors. The only
warnings are about generated tangent space; the infos (UNUSED_OBJECT, NODE_EMPTY, IMAGE_NPOT_DIMENSIONS) are
expected.

**Sounds.** After regenerating a sound, update the viewer's embedded copy:

1. Re-encode it: `ffmpeg -i x.wav -codec:a libmp3lame -b:a 80k -ac 1 x.mp3`.
2. Base64 it: `base64 -w0 x.mp3`.
3. Replace that key's `data:audio/mpeg;base64,…` string in `SOUND_DATA`.

No tool does these steps.

**Unity after a rebuild.** Copy the new `unity/*.glb` files over the project's copies and run Build Prefabs
From Selection again. This removes the components, so use Copy Component first and Paste Component As New
afterwards.
