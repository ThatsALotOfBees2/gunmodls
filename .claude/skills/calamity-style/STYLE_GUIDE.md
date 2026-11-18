# Calamity-spirit style guide for original 3D weapons, creatures and VFX

This guide condenses three research notes (`weapons.md`, `addons.md`, `bossvfx.md` in this folder) into rules we can design from. It covers the Calamity mod and its addons. It describes design language only. Every concept we build must be our own; section 7 sets the limits.

---

## 1. Core design DNA

1. **Silhouette first.** Each weapon reads as one bold, asymmetric shape from a single 45-degree view: a thin, dark grip and a big head that takes about 60–75% of the length. If the shape doesn't read in solid black, the design isn't done.
2. **Built core, living overgrowth.** Fuse a manufactured part (shaft, socket, plate) with something organic or elemental growing on it: horns, feathers, thorns, flame tongues, crystal shards, tentacles. At the top tier, reverse this and wrap the tech in crystal veins.
3. **Dark body, bright accents.** Most of the object stays dark and quiet. Glow goes only on gems, seams, edges and veins, and there is one hottest spot, near white, per object. Contrast does more work than raw brightness.
4. **Shade with hue, not just value.** Shadows drift toward blue or purple and highlights toward yellow or cyan. Outlines are a dark version of the local hue, never pure black.
5. **Tier is visible.** Size, glow area, number of hues and effect layers all go up with progression. You should be able to tell a weapon's tier from across the room.
6. **One palette per theme.** Two or three hues plus black and white, built as a ramp from dark through saturated to near-white. Drive every part of a boss or weapon set from that ramp.
7. **A crisp object with soft energy.** Each effect has three layers: a hard, readable object, smooth additive glow around it, and short-lived streaks and sparks. That mix is the signature look.
8. **Telegraph, strike, linger.** Every big attack warns first, hits hard, then fades slowly. The bigger the threat, the longer the warning.
9. **Screen effects are punctuation.** Shake, flash, chromatic split and distortion are brief, centred on the impact and saved for peaks.
10. **Restraint is a tool.** The final tier deliberately pulls glow back, and a plain shape with a huge effect is a valid design. Not everything should get louder.

---

## 2. Tier ladder

Hex values are approximate; ones marked * are converted from RGB constants in the mod's code. Size refers to the source sprites; in 3D, treat it as relative footprint and number of secondary parts.

| Tier (our name) | Theme palette (approx. hex) | Materials | Glow area | Silhouette | Effect intensity |
|---|---|---|---|---|---|
| **T1 Early / natural** | sea-glass teal `#4FB8B0`, sand `#C8B07A`, bone `#E6DCC3`, flesh red `#A8434A`, sky blue `#9CCFF0`, brass `#B08A3E` | wood, bone, shell, rough iron, sea glass | ~0% (one gem at most) | classic proportions, straight blade, simple guard; 1x size | dust puffs, simple projectile |
| **T2 Mid / elemental** | ice `#DDF6FF` + cyan `#5FD8F0`; plague green `#7FC23A` + black; astral-like violet-grey `#4A3F5C` + mint `#5FE0C8` + coral `#F59A6B` | worked steel, frozen machinery, crystal inlays, plating | 5–10% (gems, edges) | ~1.7x, curves, crescents, winged guards | coloured beams, homing or splitting shots, first custom particles |
| **T3 Holy / solar** | char brown `#4A2E18`, orange `#FF8C1A`, gold `#E8B23A`, cream-white `#FFF4D6`; enraged alt: cyan `#40F0D0` | burnished gold over charred metal | 15–25% (cores, flame edges) | ~2.5x, flame-licked, halo and sun motifs, cathedral spikes | holy fire, spark sprays, bloom, rings |
| **T4 Cosmic / void** | navy-black `#140F2E`, violet `#67428A`*, deep bloom violet `#412657`*, magenta `#FF3FD0`, cyan `#4FD8FF` | glossy black-violet metal with neon seams | 20–30% (seams, cores) | extremes only: razor-thin or massively heavy | portals, rifts, reality cracks, distortion, dual-tone beams |
| **T5 Regal / phoenix** | dark bronze `#9D6E0B`*, flame orange `#FF7A1A`, gold `#FFD24A`, wine `#4D0021`*, teal-plume accent `#2FB5A5` | gilded metal + feathers, horns, scales, flame crests | 25–30% | ~3–3.5x, layered fins along the whole length, high detail | firestorms, ember-tail fireballs, fire rings, lightning arcs |
| **T6 Prismatic tech** | steel `#9AA3B5`, lavender `#B9B0D8`, aqua `#69F0DC`*, deep violet `#392E73`*, coral `#F27048`*; sheen cycling red `#FF6B6B`* / blue `#7DC4E1`* / lime `#D3EB6C`* | pale alloy plates + iridescent crystal veins and prism tips | up to ~40% | largest (~3.5–5x), spiky, radiating, open crescent loops | noise-textured slash ribbons, rainbow sparks, crystal streaks, screen effects |
| **T7 Ash / ember (final)** | charcoal `#1A1517`, iron grey `#4A4446`, ember `#FF8A2A`, blood red `#F21B1B`*, crimson-pink bloom `#B4144B`*, accent purple `#71009F`* | blackened iron, ash, molten cracks, runes | ~10% (deliberately low) | thinner, gothic, elegant; long tridents, sleek crossbows | red flame, blood bursts, sigils, magic circles; menace through darkness |

**Scaling rules across the ladder**

- **Hue count:** grows from 1 theme hue plus neutrals to 3–5 hues.
- **Effect layers:** dust, then a projectile, then projectile + trail, then trail + sparks + bloom + ring + screen effect.
- **Animation:** top tiers animate even at rest, with pulsing emissives, hue-cycling glow, orbiting or floating parts.

---

## 3. Weapon class shape language

| Class | Shape | Effect signature |
|---|---|---|
| **Swords** | Oversized flared or crescent blade, separate glowing edge, winged quillons, pommel ending in a point, gem or hook | Wind-up, fast crescent smear, overshoot. Often launches a blade or beam. A multi-mode blade can code each mode as a colour. |
| **Spears / lances** | Long, thin, diagonal. Forked or winged head, spiral or banded shaft | Straight streak plus a forward burst on thrust. |
| **Flails / yoyos / maces** | Radially symmetric spiky head (urchin, star, gear) on a thin handle | Short orbit ribbons with dust. |
| **Guns / cannons** | Long horizontal stack of rails, fins, vents. Late tiers expose a glowing cell or charge ball | Directional muzzle flare with a spark fan; tiny bright bullets with afterimages. |
| **Bows** | Tall recurved limbs made of wings, horns, feathers or crystal; string is a single bright line | Long tapered arrow trails, splitting or homing shots. |
| **Staves** | Thin shaft, large ornate head (cage, crescent, star, eye) | Haloed orbs, thick-core lasers with soft edges, magic circles. |
| **Tomes** | Small square book with a glowing sigil or edge | Page flips, pulsing glow. |
| **Summoner items** | Simpler item with a creature-hinting head (eye, skull, flower, mask) | The minion carries the visuals. Whips are segmented with a bright tip. |
| **Throwables** | Compact, symmetric, tumbling: daggers, discs, stars, flasks, orbs | A "charged" throw upgrades into a bigger trail, split or shard burst. |

**Faction lines (from the addons).** Design weapon families that share a silhouette rule, a material set and an emissive colour, like one manufacturer's catalogue: rifle, railgun, tesla gun, missile pod, energy katana, drone. With modular weapons, give each attachment its own small effect motif.

---

## 4. Addon flavours: ideas worth borrowing

**Infernum Mode: cinematic presentation.** It keeps the base creatures but stages every fight like a film: a title card in a two-colour gradient for each boss (a calm pair and an enraged pair), letterbox bars, arena borders, takeover skies, rising lava floors, radial blur with a flash on big impacts, and long white-out deaths. **Borrow:** presentation as a layer you can add to existing enemies, and a calm/fury gradient pair per boss.

**Wrath of the Gods: surreal religious gods.** One god is a collage of swappable symbolic parts (antlers, moth wings, clock hands, wheels, flowers) bound by white-gold light, and it fights with light daggers, flower-shaped lasers and starbursts. Its counterpart is funerary void horror: a hollow mask, far too many long jointed limbs, lanterns and bells as the only lights, red rifts and blood fog. The screen itself is sliced, shattered, put through a kaleidoscope, framed with manga focus lines and censored. **Borrow:** paired opposite deities (excess light against absence), bosses built from symbolic modules, and treating the whole screen as part of the fight.

**Hunt of the Old God: iridescent slime.** A blobby, almost goofy slime god whose colour is a scrolling oil-slick rainbow held between two black stops, with biome-tinted minion slimes and liquid physics instead of sharp energy. **Borrow:** a gradient map that scrolls over greyscale textures and starts and ends on black, so a rainbow looks eldritch rather than festive. Also the idea that a silly shape can carry serious effects.

**Calamity Entropy / Call of Void: void sci-fi.** Void beams, singularities, anti-void trails, depth fog and hologram rim halos, plus an industrial-military weapon line. **Borrow:** a consistent faction weapon set, and "anti" variants of effects (inverted colours, light that subtracts).

**Calamity Overhaul: themed effect schools.** Japanese ink (ink wipes, paper burn and peel, petals, torii-gate dissolves), umbrella and ghost folklore (talismans, wisp fire), cyber glitch (data arcs, CRT panels, bullet time), and weapons that evolve as the player progresses. **Borrow:** a cultural or graphic medium (ink, paper, CRT) as an effect school, and weapons that grow through visible stages.

**Calamity's Vanities: cosmetics.** Hats, pets, furniture and dyes that carry each boss's motif and material. **Borrow:** extend every theme into props, wearables and UI so a theme feels like a whole world.

**Clamity and others.** Element inversions: a fire twin of an ice boss, a mechanical twin of a flesh wall. **Borrow:** mirrored variants as a cheap way to multiply content (unverified; only changelog snippets seen).

---

## 5. Boss and VFX principles

### 5.1 Layering recipe (every hit, beam or projectile)

| Layer | What it is | Colour | Opacity / size | Notes |
|---|---|---|---|---|
| **Core** | Small solid shape | White or near-white | ~100%, 1x | The hottest point. Only one per effect. |
| **Glow** | Soft additive blob | Saturated palette colour | 60% at ~2–3x, then 20% at ~6x, then 10% at up to 14x | Stack 3–4 copies of one soft sprite. |
| **Trail** | Ribbon mesh along the path | Gradient from white to palette colour to transparent, head to tail | Wide at the head, tapering | Two scrolling noise textures at different tiling and speed, multiplied; edges feathered with a pow falloff; tip fades over the last ~25%. |
| **Particles** | Sparks, embers, shards, rings | Darker shade of the same hue; harmless ones greyer and softer | Short-lived | Sparks stretched along velocity, tangent to arcs; one expanding thin ring on impact. |
| **Screen** | Shake, flash, chromatic split, distortion, vignette, colour grade | Neutral or theme tint | 0.1–0.5 s, decaying fast | Centred on the impact, capped, and turned off by a photosensitivity setting. |

**Brightness order:** core, then hostile projectiles, then boss glowmask, then boss body, then background. Never put bright bullets on a bright background: dim the background when patterns get dense.

### 5.2 Beam and deathray template

1. **Telegraph.** A thin, translucent, flickering line in the beam's hue. Width goes thin, thick, thin. Colour shows state, for example yellow normally and cyan when enraged.
2. **Charge.** Stacked bloom at the source; a focal flare fades in over the last ~3 frames (0.05 s).
3. **Fire.** The beam grows outward from the source instead of appearing at full length. It is a textured strip, not a stretched sprite.
4. **Grace window.** A few frames where it is visible but harmless.
5. **Sustain.** Capped shake at the source, periodic outward pulse rings, hit sparks, and scene light tinted to the beam.
6. **End.** Width eases down to nothing; it never pops off.
7. **Volley variety.** Each beam in a volley takes a slightly different hue from a narrow range.

### 5.3 Timings (60 fps reference)

| Beat | Seconds |
|---|---|
| Small shot / slice telegraph | 0.4–0.5 |
| Beam telegraph | 0.6–1.0 |
| Laser fires after telegraph ends | ~0.5 |
| Wind-up before a punch or lunge | ~0.7 |
| Big-beam charge-up | ~2.3 |
| Gap between attacks | 1.2–1.4 |
| Gap before a set-piece | ~3.5 |
| Screen-filling super attack | 2–3.5 s build-up, up to ~9 s total |
| Screen effects (shake, CA, blur) | 0.1–0.5 |

Telegraph length is the main difficulty dial. Keep the visuals; shorten the warning for harder modes. Store timings and palettes in data files (JSON or ScriptableObjects) so they can be tuned without code changes.

### 5.4 Telegraph vocabulary

Lines (dash, beam, slice paths), cones (soft wedge with a bright edge), zones (a disc that fills from rim to centre), cracks and rifts that open before something comes through, portal gates, particle previews of the danger area, depth previews (projectiles appear small and dim in the background, then dive forward), and body language (wind-ups, pupils contracting).

### 5.5 Bullet patterns

Patterns are geometric: radial starbursts, converging star outlines, clock and constellation layouts that link into a picture before firing, rows of portals left behind a dash, spinning "blender" beams.

### 5.6 Bodies

- **Backglow:** an enlarged, blurred, tinted copy behind the boss to separate it from the scene.
- **Glowmasks:** emissive eyes, cracks and runes. The eye is a recurring focal point.
- **Afterimages:** 4–8 fading copies along recent positions in the glow colour.
- **Goo, blood, shadow and lava:** merged metaball blobs with a hard edge colour and a scrolling fill.
- **Cloth and chains:** simulated robes, chains and tendrils.

### 5.7 Phases and deaths

- **Transitions:** withdraw (the boss vanishes, turns invulnerable or bursts into particles), change the world (sky, colour grade, music winds down to silence), then re-enter on a signature beat (scream, flash, shockwave, letterbox).
- **Deaths:** build-up (shake grows, energy converges), a peak flash, a shockwave or burst, then a long fade with lingering particles.

### 5.8 Engine mapping

| Need | Unity | Roblox |
|---|---|---|
| Trail with scrolling noise | Shader Graph on a Trail/Line Renderer or custom strip mesh (UV.x along, UV.y across) | `Beam` with `TextureSpeed`; two stacked beams (core + wide glow, `LightEmission` 1); `Trail` |
| Sparks, embers, rings | VFX Graph / Particle System, stretched billboards | `ParticleEmitter` (Squash, LightEmission) |
| Screen punctuation | URP/HDRP Volume (Chromatic Aberration, Lens Distortion, Vignette, Color Adjustments) on a weight curve; Cinemachine Impulse | `ColorCorrectionEffect`, `BlurEffect`, `BloomEffect`, Atmosphere via TweenService; camera CFrame offsets |
| Metaballs | Particles to RenderTexture, threshold + outline pass | Overlapping Neon spheres + `Highlight`, or flipbooks |

---

## 6. Translating 2D pixel art to 3D

| Pixel-art trait | Keep or reinterpret | 3D approach |
|---|---|---|
| **Readable silhouette at small size** | Keep | Exaggerate proportions (thin grip, huge head, asymmetric flares). Check every model in solid black from the hero angle. |
| **Tinted dark outline** | Reinterpret | Inverted-hull outline tinted by the local hue, or dark trim pieces and chamfers. Use an outline only if the whole project is stylised; otherwise use a dark rim. |
| **Hue-shifted shading** | Keep | Gradient-ramp or toon shader with warm lights and cool shadows, or bake the hue shift into albedo. Avoid neutral grey shading. |
| **1-px edge highlight** | Reinterpret | Flat-ish blades with strong bevels so one bright edge catches the light; a rim-light term in the shader (fresnel tinted to the tier colour). |
| **One hottest pixel cluster** | Keep | One emissive hotspot per model (tip, core gem or edge), brighter than everything else. |
| **Glowmask layer** | Keep | Emissive map painted only on gems, seams, veins and edges. Use the tier ladder's glow-area percentage as a budget. |
| **Smooth bloom over crisp sprite** | Keep | Post-process bloom with a threshold that only the emissives cross, so the body stays crisp. |
| **Limited colour count (4–6 shades per material)** | Reinterpret | Low-roughness-variation stylised PBR or hand-painted textures, with a small palette per material. |
| **Crystal shards** | Reinterpret | Low-poly faceted geometry, so shards stay readable at a distance. |
| **Inventory animation** | Reinterpret | Pulsing emissive, rotating rings, floating or orbiting parts, hue-cycling for the prismatic tier (view-angle iridescence on veins). |
| **Pixelated effects** | Optional | If the game is low-poly or pixel-styled, quantise or pixelate the VFX to match texel density. |

**Material recipes by tier:** holy (gold-brown metal, orange-white emissive); cosmic (glossy black-violet, magenta and cyan emissive); regal (brass-orange metal, feather and flame meshes); prismatic (pale alloy, iridescent vein emissive); ash (charcoal, ember-crack emissive).

---

## 7. How to stay original

**Do not copy:**

- Specific item, boss or creature designs: a recognisable weapon's silhouette, a boss's body plan, a signature attack staged the same way.
- Names, including near-misses and puns on Calamity or addon names.
- Sprites, textures, shader code, sound or music. Calamity's README says its code and art are proprietary (Azafure, LLC); Infernum requires the authors' permission for reuse. Do not trace, upscale or use as a texture base.
- The exact code colour sets as a whole identity. For example, don't take the Exoblade triad or the three Exo mech colours together as one brand.
- Lore beats and characters.
- The contact sheets and repo clones in the scratchpad. These are reference only and must never be shipped or committed.

**Fine to use (general language, not ownable):**

- Broad palette families: gold and white for holy, magenta and cyan for void, ember on charcoal for hellfire, a rainbow between blacks. Pick our own exact values.
- Motifs: crescents, halos, eyes, feathers, crystal veins, clock imagery, masks, rifts.
- Mechanics ideas: multi-mode weapons coded by colour, charged throws, evolving weapons, faction lines.
- Techniques: layered bloom, noise-scrolled trails, telegraph-strike-linger, metaball goo, afterimages, data-driven timings.
- Structure: tier ladders, calm and fury palettes, phase-transition beats.

**Originality check before sign-off:**

1. Show it to someone who knows the mod. Can they name a specific item or boss it came from? If yes, redesign.
2. Is the theme combination our own? Mix two motifs that the mod didn't pair.
3. Did we invent the name, silhouette and palette values ourselves?

---

## 8. Six original concept seeds

**1. Tidewright's Hook (T1, sword).** A short cutlass whose blade is a single curved whale rib, lashed with tarred rope to a driftwood grip, with a barnacle cluster as the pommel. The palette is bone `#E6DCC3`, kelp brown `#5A4A2E` and one sea-glass bead `#4FB8B0` that is its only emissive. The swing throws a small arc of spray droplets that bead and drop. A charged swing leaves a brief puddle ring on the ground. Glow under 2%: it should feel humble, as a starting point.

**2. Orrery Lance (T4, spear).** A long black-violet lance (`#140F2E`) whose head is an open armillary sphere: three nested rings around a small captive star (`#FFF4FF` core, `#4FD8FF` halo). The shaft has a spiral magenta seam (`#E040C0`). On thrust, the rings unlock and spin outward along the streak, leaving a short-lived ring of orbit lines that pull small enemies toward the centre. The spinning rings act as a telegraph for the pull. Effects: dual-tone ribbon, pulse ring on impact, faint lens distortion at the star. Clockwork and astronomy, not void horror, keeps it ours.

**3. Last Lantern (T7, staff).** A tall, thin staff of soot-black iron (`#1A1517`) ending in a caged funeral lantern. The cage bars are cracked and leak ember light (`#FF8A2A`); the flame inside is a cold pale violet (`#C8B8FF`) instead of the expected red. Glow budget around 10%: only the lantern and the cracks. Casting swings the lantern on a verlet chain; each swing sheds violet wisps that drift and then dive at targets, and the cage cracks a little more with each cast until a full charge shatters it into a ring of ember shards. Ash and ember restraint with a contrasting cold flame.

**4. The Cartographer (creature, mid-to-late boss).** A drifting giant made of folded paper maps and brass survey instruments: a body of layered map sheets, compasses for eyes, sextant arms and a theodolite head that swivels to aim. The palette is parchment `#E8DCB8`, ink navy `#1C2340` and a gold-leaf accent `#E8B23A`, with ink lines on the maps that glow when it attacks. Telegraphs are drawn: dotted route lines and compass-rose zones inked onto the ground, which fill in before they erupt. Phase transition: it unfolds into a flat map of the arena, the sky turns to parchment, and it redraws the arena layout. Death: it burns from the edges like paper, embers curling up.

**5. VFX set "Glass Choir" (prismatic, for T6 weapons and a boss).** Every hit spawns faceted low-poly crystal shards that ring like bells: a white core flash, then a prism split where the bloom separates into three offset hue copies (our own triad: `#7CF5FF`, `#FFB86B`, `#C59BFF`) for 0.15 s, then shards that refract the background (screen-space distortion masked by shard meshes). Trails are a ribbon with a scrolling caustic noise texture and a gradient that hue-shifts with view angle. Big attacks: a 1 s telegraph of thin spectral lines, a beam that grows out with stacked bloom, then a 0.3 s chromatic punctuation. Include a reduced mode that removes distortion and splitting.

**6. VFX set "Inkfall" (elemental, reusable across tiers).** Effects as living ink on a paper world: slashes are brush strokes (ribbon with dry-brush noise and a pow-shaped edge that frays), impacts are ink splatter metaballs with a hard dark edge and a wet highlight, and enemies dissolve with a paper-burn edge. Telegraphs are thin pencil sketch lines that get inked in when the attack lands. The palette is ink black `#121018`, paper `#F2EAD8` and one theme accent per tier (vermilion `#E2442F` early, gold later, a violet ink at the top). Screen punctuation: a brief desaturation to two tones and a 0.2 s ink-wipe vignette on big hits. This differs from existing ink-themed mods by using sketch-then-ink telegraphs and paper-world framing; check it against references before final approval.

---

## 9. Sources and gaps

**Sources (code was read through public git clones; file names, shader names, colour constants and comments only):**

- Calamity: https://github.com/CalamityTeam/CalamityModPublic. README: code and art proprietary (Azafure, LLC).
- Infernum Mode: https://github.com/InfernumTeam/InfernumMode
- Wrath of the Gods: https://github.com/LucilleKarma/WrathOfTheGodsPublic (the addons note cited https://github.com/TheFifthCircle/WrathOfTheGodsPublic; likely the same project under a renamed owner, not verified)
- Luminance rendering library: https://github.com/LucilleKarma/Luminance
- Hunt of the Old God: https://github.com/GinYuH/CalamityHunt (the addons note cited https://github.com/TohruKobayashi/CalamityHunt; same question)
- Calamity Entropy / Call of Void: https://github.com/hocha113/CalamityEntropy
- Calamity Overhaul: https://github.com/hocha113/CalamityOverhaul
- Calamity's Vanities: https://github.com/GinYuH/CalValEX
- Calamity Community Remix: https://github.com/GinYuH/CalRemix
- Catalyst: https://github.com/apotofkoolaid/CatalystMod
- Steam Workshop (search snippets only): Clamity https://steamcommunity.com/sharedfiles/filedetails/changelog/3028584450 ; Calamity: Fables https://steamcommunity.com/sharedfiles/filedetails/changelog/3449156562 ; https://steamcommunity.com/sharedfiles/filedetails/?id=3316697363 ; Calamity Texture Pack https://steamcommunity.com/sharedfiles/filedetails/?id=2445323408
- Wikis (search snippets only): https://calamitymod.wiki.gg/wiki/Community_modifications , https://terrariamods.wiki.gg/wiki/Wrath_of_the_Gods , https://infernummod.wiki.gg/

**Gaps and cautions:**

- **Not opened:** calamitymod.wiki.gg, calamitymod.fandom.com, terrariamods.wiki.gg and steamcommunity.com (DNS or host blocks). infernummod.wiki.gg, YouTube and Reddit were not tried. The GitHub API returned 403; plain clones worked.
- **No gameplay footage.** Motion and feel are inferred from code and comments. Check timings and how effects read against videos before relying on them.
- **Estimates.** Sprite sizes and glow-area percentages come from about 45 sprites the researcher looked at, not from measuring every weapon. Non-starred hex values are approximations by eye.
- **Unverified groupings.** Tier and boss groupings are from memory of the mod. Clamity's palettes and Catalyst's theme are unverified. Calamity: Fables, Ranger Expansion and the Fargo's Souls DLC were not studied.
- **Licensing.** The repos are proprietary or permission-gated. Nothing from them should enter our assets, and the local clones and contact sheets in the scratchpad (`calrepo/`, `calamity-style/clones/`) are reference only and must not be committed or shipped.
