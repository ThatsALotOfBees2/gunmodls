# N1CK

![N1CK](preview.png)

A playable operator: a 1.85 m robot built for warmth, with a curved display for a face. He is an agile soldier-robot, lean
and athletic, with a clear V-taper: squared but not bulky shoulders, a narrow exposed waist and long, slim limbs. His
armour is sleek and angular: a few big planar facets per plate with crisp chamfered edges, layered and overlapping
(a wedge knee cap under a lip plate, a layered fauld at the pelvis, stepped back plates), with tight panel gaps and
recessed panel lines, over a slim dark mechanical frame that shows at the gaps (a segmented ab stack and spine
column at the waist, cable bundles, small pistons, and exposed actuators at the elbows, knees and hips, where a
machined ball sits in a faceted socket cup). The armour is clean matte paint in two tones: dark slate on most plates,
warm light grey on the layered chest plates, the upper thigh plates, the forearm tops, the shin fronts, the scapulas
and the head, so he reads at range from the front and the back. Wear is light: a few clusters of chipped paint on
exposed edges and plate corners down to dull grey metal, faint scuffs, a little grime in the panel lines. Chrome
appears only on the piston rods. His hands have a dorsal armour plate on every finger segment (a nail bevel at the
tip) over a slim dark core, and a knuckle guard over the back of the hand. His boots are slim armoured tactical boots
with a lugged rubber sole, a ridged, tapered toe cap and a raked cuff round the ankle.

Over the armour he wears tactical gear: a 50 mm duty belt with two magazine pouches at his left hip (one in front of
it, one behind, clear of the thigh in a crouch), a zip utility pouch, a D-ring and MOLLE loops; a chest harness
(chest band, shoulder straps with ladder locks and daisy loops, a radio pouch on the right strap, a back yoke and
strap); and a drop-leg panel with a magazine pouch on his right thigh. The webbing is near-black nylon with stitched
edges, so the gear reads as a dark band against the slate paint, the pouches are a fine-weave fabric, and the
side-release buckles and sliders are black polymer.

His head is a rounded-angular helmet form in the body's design language, narrowing to the jaw. Behind the display
the shell breaks into a few broad flat facets that meet in clean, narrow creases: flat sides where the ear hubs sit, crown
sides whose crease runs back from the display's top corners, a flat top, and crown-back, rear and occiput facets. A
raised dark keel runs down the middle of the crown. The whole front is one continuous curved display, flattest across the eye band: deep black
glass from the brow down over the jaw, wrapping about 78° round each side, with no bezel or frame. It stands 1 mm
proud and its rolled edge laps over the shell, so where they meet you see a dark line, never a lit frame; only its
thin clear-coated cover glass reflects. The shell holds it from behind in the body's paint and chamfers: a light
crown, light side plates and a light rear with a raised, screwed panel crossed by a panel line, and a dark chin bar that wraps under the
display and sweeps up behind it into a round boss at each ear. A speaker hub sits on his left ear, a microphone hub
with a stub antenna on his right; a dark core shows in every panel gap, and a faceted collar sits under the head on
the exposed, segmented neck. His face is abstract luminous glyphs where eyes would be (no mouth, no smiley): ^ ^ when
happy, v v when sad, a red ! ! on alert. Dark red energy with purple edges glows faintly in the two Nullfield emitters on his upper back
(recessed behind thin radial blades; they flare a hotter red when the field is up) and in the Veinite power cell low on his back.
The cell sits in a bright brushed stainless cage, the one bright metal on him (stainless blocks Veinite's hivemind
effect). A thin dark red line shows under the shut chest door, and a purple hairline glows in his neck. The hinged
chest door (recessed, with a barrel hinge and a finger notch) hides the only writing on him: "Nick", scratched in a
child's hand.

140.3k triangles (head 18.5k, torso 37.3k, arms 27.8k, legs 34.0k, gear 22.8k). Rigid parts on a
Unity-Humanoid-mappable skeleton; the Unity copy merges them into one skinned mesh per LOD. Rest pose is a T-pose.

## Files

| File | Contents |
| --- | --- |
| `n1ck.glb` | The rig at rest (T-pose) with every mesh under its bone (499 meshes; the gear meshes are named `gear_*`), 19 PBR materials with embedded maps, the face display as its own mesh (`screen`, material `screen_face`) with a thin clear-coated cover glass in front (`screen_glass`), and all 9 clips. Origin on the ground between his feet, facing +Z, up +Y, his left +X. 15.9 MB. |
| `unity/n1ck.glb` | Game-ready copy: one skinned mesh per LOD (every part 100% on its bone), LOD0/1/2 with 140.3k / 50.5k / 34.5k triangles and 19 / 18 / 16 draw calls (the stainless shroud, the glows, the webbing, the pouches, the head and the hips are kept at every LOD; the cover glass stays, unsimplified, to LOD1; the simplifier adds no flipped triangles), 20 box colliders (hitboxes) on the body bones. 23.4 MB. |
| `textures/` | `face-atlas.png` (the expression atlas, 1152 × 768) and every texture sheet as PNG (albedo, normal, ORM per material family; glow gradients; the "Nick" scratch), each identical to the image embedded in the .glb files (same orientation). |
| `INTEGRATION.md` | Rig, gear, materials, face atlas, clips, Unity setup and how to rebuild. |
| `viewer.html` | Interactive viewer and the procedural source of everything above. |

Unity: `../../unity/Runtime/N1CK.cs` (faces, alarm, emitters, cell glow, clips), `../../unity/Editor/N1CKAvatarBuilder.cs`
(Humanoid Avatar for retargeting). Give him a `NullfieldCarrier` (from `../../unity/Runtime/Nullfield.cs`) too, added
in code with `AddComponent<NullfieldCarrier>()` (see INTEGRATION.md, Unity setup).

## Clips

| Clip | Length | Loop | What happens | Face |
| --- | --- | --- | --- | --- |
| `idle` | 4.0 s | yes | Weight on his left leg (pelvis shifted and rolled over it), right foot easy, forward and turned out, chest lifted and counter-turned, arms hanging close with soft elbows; one breath, a weight settle, a curious look round | neutral, 3 blinks |
| `walk` | 1.1 s | yes | One full cycle in place at 1.3 m/s (move the root), arms swing | happy (the loop has no blink of its own; N1CK.cs blinks it every 2.6 to 5 s, the viewer every 3.7 s) |
| `talk_gesture` | 4.0 s | yes | In front of the chest: palms-up offer, a beat with a wrist flick, an index point, a two-hand frame, palm to the chest, explaining chops; the chest turns toward the gesturing hand and leans into the points, shoulders lift on the beats, nods | the eye glyphs pulse per syllable (talk_a / talk_b, about 5 Hz), neutral between words, two happy beats |
| `wave` | 2.4 s | no | Weight onto the left leg, right arm up and out, hand above the head, three waves from the elbow, head tilted toward the hand, the free arm easy in front, back down | happy |
| `laugh` | 2.0 s | no | Leans back with the head thrown back, then folds well forward, left hand flat on his stomach above the belt, slaps his thigh; the shoulders bounce in step with the face | laughing_a / _b at about 7 Hz |
| `sad` | 3.0 s | no | A slump through the whole spine, shoulders dropped and rolled forward, head down, knees soft, arms heavy, a slow sigh, the right hand closes and lets go | sad |
| `worried` | 2.6 s | no | Hunched with the shoulders up, hands wringing in front of the chest (palms a few cm apart, thumbs and fingers rubbing), glances left and right | worried |
| `alert` | 1.6 s | no | Startled hop into a ready stance loaded forward (hips back, trunk leaning in, face level), hands up in loose fists, looks around | alert (red), face tint up to 0.8 |
| `nullfield_activate` | 1.8 s | no | Braces in the knees, fists close in front of his stomach, shoulders roll well back to bare the emitters, chest out with the trunk still loaded forward; the fists arc over the front pouch and plant on his hips, knuckles on the belt | focus, emitters 0 → 1 at 0.9 s → 0.6 |

Every one-shot starts and ends on `idle` at 0 s, so crossfades are clean. No clip has root motion, and planted feet
never slide or lift off the floor.

## Faces

The faces are abstract glyphs where eyes would be, so he still reads as looking at you: chevrons, bars, brackets and
dots in warm off-white (`#ffdcac`), the alert pair in red (`#ff3a2c`). There is no mouth anywhere; talking shows as
the eyes turning into pulsing voice meters. Each glyph is drawn on a 48 × 32 grid of display pixels: 5 px strokes,
eyes 14–15 px wide and up to 15 px tall (the alert ! 16), with smooth edges (a diagonal ramps over one pixel), a faint pixel
structure that only shows up close and a soft glow baked round every stroke. Each mood has its own silhouette and
mass (neutral is a fat block, worried a steep 31° slant, focus thin slits in heavy brackets), so up to about 7 m every
mood reads; at 10 m (720p, 60° field of view, the head about 13 px wide) alert, off, neutral, focus and happy / sad
still separate, while worried, laughing and talk lean on the clip around them; beyond about 15 m only colour is left
(alert red, off dark). The atlas is 4 × 4 cells of 288 × 192 px (1152 × 768,
3:2 like the display's face area). The glyphs stay in the middle 70 % × 60 % of a cell, a little above its centre,
and every cell keeps a black margin with an 8 px gutter, so the display's wrap round the sides, brow and jaw reads as
unlit glass. The display UVs cover cell 0, in proportion to arc length along the curve (the glyph area is within 1.7 % of true scale and 0.5° of shear; it is a uniform 1 % small because the display stands 1 mm proud of the surface the scale is measured on); offset the
texture by whole cells to swap faces.

| # | Cell | Glyph |
| --- | --- | --- |
| 0 | `neutral` | two level blocks (the fattest bars in the set) |
| 1 | `neutral_blink` | the blocks collapse to thin lines |
| 2 | `happy` | tall, pointed ^ ^ |
| 3 | `happy_blink` | a thin, flatter ^ ^ (a squint) |
| 4 | `worried` | dashes tilted 31°, inner ends raised (`/ \`) |
| 5 | `worried_blink` | the same tilt as thin lines |
| 6 | `laughing_a` | wide, flat ^ ^ squeezed shut, raised |
| 7 | `laughing_b` | the same flat ^ ^ a little higher and taller (the pair bounces) |
| 8 | `sad` | deep v v, set a little low |
| 9 | `sad_blink` | a heavy lid: a flat bar set low, its outer end drooping |
| 10 | `alert` | red ! ! |
| 11 | `alert_blink` | a shorter, dimmer red ! ! |
| 12 | `talk_a` | each eye a three-bar voice meter (levels 5, 8, 5 px) |
| 13 | `talk_b` | the same meter at 7, 5, 7: only the levels move, so speech flickers gently |
| 14 | `focus` | thin slits held in heavy outer brackets, `[—  —]` |
| 15 | `off` | black, with one dim standby tick between the eyes |

| | col 0 | col 1 | col 2 | col 3 |
| --- | --- | --- | --- | --- |
| row 0 | 0 `neutral` | 1 `neutral_blink` | 2 `happy` | 3 `happy_blink` |
| row 1 | 4 `worried` | 5 `worried_blink` | 6 `laughing_a` | 7 `laughing_b` |
| row 2 | 8 `sad` | 9 `sad_blink` | 10 `alert` | 11 `alert_blink` |
| row 3 | 12 `talk_a` | 13 `talk_b` | 14 `focus` | 15 `off` |

Alarm tints every glyph toward dark red (`#d8141a`).

## Viewer

Clip buttons, expressions (Auto follows the clip), toggles for Alarm, Nullfield (emitters flare), Chest (opens the
panel and frames "Nick") and Gear (off shows the bare armour), views Full, Face, Hands and Back, and Orbit (slow
turntable).
