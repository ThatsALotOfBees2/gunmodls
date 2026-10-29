# Mossberg 590A1

![Mossberg 590A1](preview.png)

A 12-gauge pump-action shotgun set up the way the owner's gun is: a plain 20" heavy barrel with no heat
shield, an M-LOK forend, a Picatinny rail on the receiver carrying a ghost ring rear sight, a protected
front post, a metal trigger guard, a synthetic stock with a semi-pistol grip, a bayonet-lug band and a
knurled magazine cap with a sling stud.

It is finished in the faction's sci-fi look (the same as the
[Wall Fortification](../../gadgets/wall-fortification/)): the same gun with the same outline and
dimensions, but with new surfaces.

- **Receiver:** chamfered edges, with a faceted step where the stock meets it. A panel seam splits the
  right side behind the ejection port. On the left, an inset panel takes the place of the old logo field.
- **LEDs:** a purple strip sits in a channel along the side seam on both sides. Three status pips sit
  above the trigger guard on the right, and a four-segment ammo indicator sits on the left.
- **Forend:** an octagonal composite piece with chamfered ends and a wedge under the nose. Its two
  staggered rows of M-LOK slots are cut as raked vents, and an LED line runs along each upper facet.
- **Magazine tube, bands and cap:** the tube has twelve machined flats, and the barrel lug and bayonet
  band are faceted. The cap is a fluted 16-flat ring with a faceted nose and a hex-based sling stud.
- **Stock:** an angular composite butt with pressed side panels and a panel seam where the butt meets the
  grip. The grip stays round where the hand goes. It has a rubber recoil pad.
- **Sights:** purple tritium-style dots on the front post and at 3 and 9 o'clock on the ghost ring.
- **Hardware:** every screw has a hex socket, and the trigger-group pins have hex-socket heads.
  Engraved marks beside the tang safety show its positions: a dot for safe (back) and a bar for fire (forward).

There is no text, logo or marking anywhere on the gun or the shell.

## Specs

Published figures for the real gun, the 590A1 M-LOK 9-shot with fixed stock (Mossberg #50768):

| | |
| --- | --- |
| Gauge | 12, 3" chamber |
| Barrel | 20" heavy-walled, cylinder bore |
| Overall length | 41.0" (1.041 m) |
| Length of pull | 13.87" |
| Weight | 7 lb (3.2 kg), unloaded |
| Capacity | 8 + 1 with 2 3/4" shells |
| Sights | ghost ring on the receiver rail, protected front post |
| Forend | M-LOK, two staggered rows of slots |
| Pump stroke | 3.6" (91 mm), as modelled |

Sources: [Mossberg 590A1 M-LOK #50768](https://www.mossberg.com/590a1-m-lok-50768.html) (overall
length, length of pull, barrel, chamber, weight), [Gun Tests](https://www.gun-tests.com/news/long_guns/Mossberg-590A1-Tactical-Shotguns_11030-1.html)
and [Sportsman's Warehouse](https://www.sportsmans.com/shooting-gear-gun-supplies/shotguns/mossberg-590a1-parkerized-12-gauge-3in-pump-action-shotgun-20in/p/1477346).
The model is exactly 41.0" (1.041 m) long. The rest of its proportions were traced from a reference photo
of the real gun, and this restyle kept them unchanged. Small details are close approximations.

## Files

| File | Contents |
| --- | --- |
| `m590a1.glb` | The shotgun (1.7 MB). 1.041 m long, 55 named meshes, about 68k triangles. One animation, `rack` (0.47 s): the forend and bolt slide back 91 mm and return. |
| `shell-12ga.glb` | A 2 3/4" 12-gauge shell, unfired (128 KB): 63.8 mm long, 22.2 mm rim. Brass head, primer, hull and an 8-point star crimp, with no headstamp or print. Origin at the centre of the base, crimp toward +Z. |
| `viewer.html` | Interactive viewer and the procedural source of both files. |
| `preview.png` | Still render. |

## Parts

Nodes in `m590a1.glb`. Where a part is made of several meshes, they are numbered (`front_sight_2`, ...).

- **Moving:** `forend_assembly` (`forend`, `forend_led`, `action_bars`), `bolt_assembly` (`bolt`)
- **Receiver group:** `receiver`, `receiver_cavity`, `receiver_led`, `status_pips`, `ammo_indicator`,
  `rail`, `rail_screws`, `rear_sight`, `rear_sight_dots`, `rear_sight_clamp_screw`, `safety`, `elevator`,
  `chamber`, `trigger_pins`
- **Trigger group:** `trigger_housing`, `trigger_guard`, `trigger`, `action_lock_lever`
- **Barrel and tube:** `barrel`, `bore_plug`, `front_sight`, `front_sight_dot`, `front_sight_screw`,
  `barrel_lug`, `bayonet_band`, `bayonet_lug`, `magazine_tube`, `magazine_cap`
- **Stock:** `stock`, `recoil_pad`, `sling_stud_rear`

The ammo indicator is four separate meshes, `ammo_indicator` to `ammo_indicator_4`, running from rear to
front, and each segment stands for two shells in the tube. All four ship lit; hide or dim them to show
the count.

Materials: `frame_alloy`, `shell_composite`, `barrel_steel`, `black_steel`, `fasteners`, `led_purple`
(emissive, `KHR_materials_emissive_strength` 2.6), `rubber` and `void`. The shell uses `shell_brass`,
`shell_primer`, `shell_hull` and `void`.

## Viewer

Open `viewer.html` in a browser.

- Drag to orbit, scroll to zoom, right-drag to pan.
- **Rack** (R or Space) cycles the pump: it ejects the chambered shell and feeds the next one. The ammo
  indicator and the Tube and Chamber readouts count down.
- **Load** (L) tops the tube up to 8, one shell at a time.
- The furniture comes in Graphite (as exported), Arctic and Sand. The LEDs stay purple.
- Part labels (a label for one side shows only from that side), preset views (three-quarter, right,
  left, top) and a turntable.
