# Haneul Tower furniture pack

![Sample room](preview.png)

Breakable furniture for the Haneul Tower map: the upper floors of a 2111 Seoul supertall by the river, at night,
in the rain. You place every piece yourself; nothing here is placed in the map. Warm wood, hanji paper panels,
celadon, brass, dark alloy and stone, with tech pieces (render racks, holo console, broadcast desk) in graphite and
dark alloy with a few purple `#8a4dff` lights. Batch G adds the outside: roof plant, terrace furniture and vents,
weathered for the rain. No text, logos, numbers or symbols anywhere.

**94 pieces** (64 interior, 30 exterior), one `.glb` each. Every piece is built from named parts (935 in all) that
come apart. The 217 parts that would shatter (wood tops, glass, ceramic, screens, stone, paper, soil) carry pre-cut chunk sets
(1,814 chunks in all) that the game swaps in when that part breaks, plus a few debris bits. Wood splits along the
grain with saw-toothed ends (board by board), glass breaks radially round an impact (tempered glass dices), screens
crack in their housings, hanji tears into ragged strips (a border strip stays on the frame), upholstery tears along
its seams with recessed foam, and chunks of lights and screens are dark.
Each part has a material class (for impact sounds and effects), a mass, a health value and collider proxies.
797,492 triangles intact across the pack, 416,706 in the chunk sets.

![Catalogue](catalogue.png)

**Batch E:** `holo_cylinder` (stepped alloy projector plinth with purple LED lines, eight emitter heads and a lens array under a see-through layered purple hologram column with a wireframe model of the tower; the hologram casts no shadow and switches off when the lens is shot), `japanese_shrine` (indoor shrine pavilion for double-height rooms, 3.2 × 3.8 × 3.2 m: vermilion pillars, bracketed head beams and an irimoya hip-and-gable tiled roof with upturned corners over a walnut deck on a granite plinth; mirror altar, sakaki vases, paper andon, suzu bell and rope, offering box, purple LED cove; about 29k triangles, over the 15k guideline as a room-sized hero piece) and `maple_tree` (cloud-pruned red Japanese maple on a gnarled trunk with six flat leaf pads of 2D alpha cards, in a low basalt bed with raked gravel, moss, stones and a warm LED washer). Same naming, parts, chunks and colliders as every other piece; their entries are in `parts.json` and their parts tables in `INTEGRATION.md`.

| id | Piece | Size (m) | kg | Cover | Triangles | Parts |
| --- | --- | --- | --- | --- | --- | --- |
| `holo_cylinder` | Hologram cylinder | 1.12 × 2.02 × 1.13 | 159.6 | none | 13,784 / 18,326 | 4 |
| `japanese_shrine` | Japanese shrine pavilion | 3.19 × 3.78 × 3.19 | 3,087.7 | soft | 29,248 / 36,934 | 27 |
| `maple_tree` | Red maple in a garden bed | 2.30 × 2.33 × 1.63 | 453 | soft | 13,102 / 13,476 | 9 |

**Batch F (27 pieces):** an executive floor (`ceo_desk`, `ceo_chair`, `guest_chair`, `credenza`, `trophy_wall`, `boardroom_table`, `boardroom_chair`, `office_safe`), server and hardware pieces for the render-farm row, the vault core cage and the plant room (`server_rack`, `server_rack_open`, `storage_array`, `ups_cabinet`, `cooling_unit`, `cable_tray_run`, `workstation_tower`, `crash_cart`, `hardware_bench`), and the fixtures every tower has (`umbrella_stand`, `vending_machine`, `water_dispenser`, `copier`, `karaoke_machine`, `grand_piano`, `aquarium`, `locker_bank`, `wine_fridge`, `fire_cabinet`). Same naming, parts, chunks and colliders as every other piece. Two new behaviours, both in `parts.json` and handled by `BreakableFurniture.cs`: the safe door is `breach_only` (bullets do nothing; a breach charge blows it off) and the aquarium water is `liquid` (it drains away the moment a pane breaks). `cable_tray_run` hangs from the ceiling: put its origin at ceiling height − 0.70 m. Their full rows are in the table below and their parts tables in `INTEGRATION.md`.

| id | Piece | Size (m) | kg | Cover | Triangles | Parts |
| --- | --- | --- | --- | --- | --- | --- |
| `ceo_desk` | Executive desk | 2.40 × 1.17 × 1.00 | 446 | hard | 6,408 / 11,157 | 13 |
| `ceo_chair` | Executive chair, high back | 0.67 × 1.29 × 0.81 | 24.7 | none | 14,964 / 0 | 7 |
| `guest_chair` | Visitor armchair | 0.58 × 0.80 × 0.54 | 11.6 | none | 5,720 / 1,648 | 7 |
| `credenza` | Executive credenza | 2.24 × 1.07 × 0.53 | 205.9 | soft | 6,328 / 7,382 | 11 |
| `trophy_wall` | Trophy and display wall | 2.00 × 2.40 × 0.42 | 230 | soft | 11,936 / 11,697 | 21 |
| `boardroom_table` | Boardroom table, 3.6 m | 3.61 × 0.74 × 1.31 | 878 | hard | 3,724 / 7,422 | 10 |
| `boardroom_chair` | Boardroom swivel chair | 0.62 × 0.94 × 0.67 | 17.8 | none | 11,860 / 0 | 7 |
| `office_safe` | Office floor safe | 0.62 × 0.90 × 0.62 | 349 | hard | 4,380 / 0 | 3 |
| `server_rack` | Server rack, 42U, perforated doors | 0.61 × 2.00 × 1.13 | 585.7 | hard | 15,052 / 0 | 22 |
| `server_rack_open` | Open two-post network rack with cable managers | 0.88 × 2.00 × 0.55 | 135.9 | soft | 14,764 / 0 | 16 |
| `storage_array` | Storage array cabinet, glass door | 0.81 × 2.01 × 1.17 | 697.8 | hard | 14,590 / 537 | 15 |
| `ups_cabinet` | UPS and battery cabinet | 0.60 × 2.00 × 0.87 | 718.4 | hard | 7,634 / 548 | 8 |
| `cooling_unit` | In-row precision cooling unit | 0.60 × 2.19 × 1.12 | 209.3 | soft | 12,502 / 554 | 10 |
| `cable_tray_run` | Overhead ladder cable tray, 2 m run | 2.00 × 0.70 × 0.64 | 37 | none | 6,232 / 0 | 6 |
| `workstation_tower` | Workstation tower, mesh front and glass side | 0.25 × 0.60 × 0.57 | 21.2 | none | 8,042 / 1,064 | 9 |
| `crash_cart` | KVM crash cart | 0.66 × 1.26 × 0.70 | 40.1 | none | 4,708 / 346 | 11 |
| `hardware_bench` | Electronics repair bench | 1.80 × 1.91 × 0.77 | 159.9 | soft | 12,322 / 2,668 | 20 |
| `umbrella_stand` | Lobby umbrella stand with wet umbrellas | 0.43 × 1.01 × 0.28 | 10.8 | none | 10,016 / 622 | 7 |
| `vending_machine` | Slim drinks and snack vending machine | 0.75 × 1.92 × 0.86 | 268.1 | soft | 14,912 / 586 | 15 |
| `water_dispenser` | Filtered water dispenser | 0.42 × 1.08 × 0.44 | 25.3 | none | 6,492 / 483 | 8 |
| `copier` | Office multifunction copier with finisher | 1.47 × 1.27 × 0.82 | 243 | soft | 6,768 / 461 | 15 |
| `karaoke_machine` | Noraebang karaoke console on a cabinet | 0.92 × 1.22 × 0.52 | 70.1 | soft | 10,228 / 1,902 | 15 |
| `grand_piano` | Black grand piano with bench | 1.51 × 1.88 × 2.33 | 314.1 | soft | 10,140 / 3,977 | 11 |
| `aquarium` | Aquarium on a walnut cabinet | 1.21 × 1.47 × 0.52 | 262.2 | soft | 6,508 / 3,504 | 19 |
| `locker_bank` | Four-door steel locker bank | 1.20 × 1.88 × 0.65 | 95.2 | soft | 7,128 / 0 | 6 |
| `wine_fridge` | Dual-zone wine cooler | 0.60 × 1.85 × 0.74 | 185 | soft | 14,952 / 12,227 | 23 |
| `fire_cabinet` | Fire hose and extinguisher cabinet | 0.75 × 1.72 × 0.27 | 84.1 | soft | 8,952 / 917 | 12 |

**Batch G (30 exterior pieces):** roof plant for the neighbour roofs where attackers spawn, the Crane Deck and the
bridge roof (`hvac_condenser`, `cooling_tower`, `water_tank`, `comm_mast`, `bmu_cradle`, `exhaust_stack`,
`generator_enclosure`, `drone_dock`, `roof_hatch_box`, `pallet_stack`), Sky Terrace and skybridge furniture
(`terrace_sofa`, `parasol_table`, `sun_lounger`, `patio_heater`, `fire_table`, `bamboo_planter`, `pergola_canopy`,
`bollard_light`, `security_camera_pole`, `holo_pylon`) and vents for roofs, ledges and plant rooms (`turbine_vents`,
`mushroom_vent`, `upblast_fan`, `gooseneck_vents`, `louvred_penthouse`, `duct_run`, `wall_louvre`, `relief_vent`,
`ac_cassette_row`, `grate_vent`). Powder-coated and galvanised steel, concrete, weathered teak, stone and faded
fabric, with wet up-faces, rain streaks, grime at the foot and rust only at fasteners. Hard cover: the generator,
condenser, water tank, hatch box, pallet load, fire table, planter trough, holo pylon column and grate plinth.
Turbine heads and AC fans carry `spin` hints and the grate's steam cards an `fx` hint (see INTEGRATION.md,
**Exterior pieces**).

| id | Piece | Size (m) | kg | Cover | Triangles | Parts |
| --- | --- | --- | --- | --- | --- | --- |
| `hvac_condenser` | Rooftop condenser unit on dunnage | 3.07 × 1.82 × 1.22 | 715 | hard | 12,148 / 0 | 13 |
| `cooling_tower` | Packaged cooling tower | 2.18 × 3.08 × 1.78 | 613 | soft | 8,616 / 452 | 12 |
| `water_tank` | Elevated sectional water tank | 3.00 × 4.21 × 2.64 | 1,668 | hard | 12,036 / 0 | 7 |
| `comm_mast` | Lattice communications mast | 2.08 × 6.75 × 2.08 | 1,566.4 | soft | 14,428 / 1,555 | 13 |
| `bmu_cradle` | Window-cleaning cradle on its roof rail | 3.56 × 4.90 × 1.20 | 842 | none | 8,604 / 0 | 11 |
| `exhaust_stack` | Guyed exhaust stacks on a louvred plenum | 3.54 × 3.67 × 3.32 | 398.9 | soft | 5,160 / 0 | 13 |
| `generator_enclosure` | Containerised standby generator | 4.05 × 3.24 × 1.84 | 3,553.6 | hard | 6,164 / 322 | 11 |
| `drone_dock` | Drone dock with parked quadcopter | 1.73 × 1.62 × 1.58 | 191.5 | soft | 7,384 / 4,709 | 6 |
| `roof_hatch_box` | Roof access stair box | 1.76 × 2.85 × 2.19 | 5,637.3 | hard | 2,492 / 733 | 9 |
| `pallet_stack` | Pallet of blocks, cable drum and tarp | 2.13 × 1.19 × 1.67 | 1,018 | hard | 13,068 / 2,006 | 10 |
| `terrace_sofa` | Terrace sofa, weatherproof three-seat module | 2.11 × 0.86 × 0.94 | 51.9 | soft | 10,884 / 0 | 14 |
| `parasol_table` | Cantilever parasol, half-closed in the rain, with an outdoor table | 2.77 × 2.69 × 1.83 | 190.1 | soft | 7,808 / 3,231 | 9 |
| `sun_lounger` | Sun lounger, teak and aluminium | 0.84 × 0.90 × 1.96 | 24.9 | soft | 7,988 / 2,916 | 8 |
| `patio_heater` | Patio heater, glass flame column | 0.60 × 2.29 × 0.60 | 48.3 | none | 2,816 / 1,504 | 7 |
| `fire_table` | Gas fire table, cast concrete | 1.55 × 0.58 × 0.87 | 254.4 | hard | 5,374 / 8,435 | 11 |
| `bamboo_planter` | Long cast-stone planter with bamboo | 2.54 × 3.12 × 1.38 | 640.8 | hard | 13,688 / 9,949 | 7 |
| `pergola_canopy` | Louvred pergola, 3 x 3 m | 3.12 × 2.70 × 3.14 | 240.2 | none | 7,120 / 0 | 10 |
| `bollard_light` | Path bollard lights, pair | 1.20 × 0.84 × 0.20 | 106.4 | none | 1,872 / 2,208 | 6 |
| `security_camera_pole` | Exterior security camera pole | 0.30 × 3.42 × 0.84 | 92.7 | none | 5,364 / 1,196 | 9 |
| `holo_pylon` | Exterior holo advert pylon | 0.72 × 3.50 × 0.66 | 401.6 | hard | 4,112 / 6,224 | 6 |
| `turbine_vents` | Turbine ventilators, cluster of three | 1.63 × 1.08 × 1.27 | 70.6 | soft | 14,604 / 0 | 9 |
| `mushroom_vent` | Mushroom-cap roof exhaust fan | 1.25 × 1.02 × 1.25 | 91.5 | soft | 7,872 / 0 | 5 |
| `upblast_fan` | Kitchen upblast exhaust fan | 1.13 × 1.18 × 0.91 | 92.2 | soft | 7,188 / 0 | 5 |
| `gooseneck_vents` | Gooseneck intakes and J-pipe | 1.38 × 0.98 × 0.87 | 44.6 | none | 10,900 / 0 | 8 |
| `louvred_penthouse` | Louvred intake penthouse | 1.31 × 1.21 × 1.11 | 163 | soft | 4,056 / 0 | 8 |
| `duct_run` | Clad rooftop duct run | 3.19 × 2.30 × 0.98 | 102.3 | soft | 7,084 / 0 | 10 |
| `wall_louvre` | Facade louvre panel | 2.04 × 1.51 × 0.20 | 95.8 | none | 2,422 / 0 | 26 |
| `relief_vent` | Plumbing vent stacks through flashing boots | 1.01 × 0.76 × 0.55 | 17.6 | none | 4,458 / 0 | 9 |
| `ac_cassette_row` | Split-AC outdoor units on a ledge stand | 2.87 × 1.20 × 0.45 | 160.8 | soft | 14,922 / 0 | 12 |
| `grate_vent` | Exhaust grate on a concrete plinth | 1.65 × 1.59 × 1.00 | 1,257.1 | hard | 2,196 / 2,921 | 7 |

## Files

| File | Contents |
| --- | --- |
| `glb/<id>.glb` | One piece per file. Origin on the floor under the middle of the footprint, front +Z, up +Y, metres, real size. Parts, hidden chunk sets, hidden debris and `col_*` collider proxies, all by name. Metadata in the glTF extras. |
| `unity/<id>.glb` | Game-ready copies: meshes merged per node, LOD0–2, `_COL` boxes and `_HULL` convex hulls (one per chunk). Driven in Unity by `../../unity/Runtime/BreakableFurniture.cs` (which also turns the batch G `spin` parts and breathes the steam cards). |
| `parts.json` | Every piece's metadata: parts, material class, mass, health, break type, support links, bullet stopping, chunks, debris, colliders; plus the class and material tables. `BreakableFurniture.cs` reads it. |
| `sounds/` | A hit and a break sound for each material class, and rifle, shotgun and frag sounds (44.1 kHz mono WAV), plus `generate_sounds.py`, which makes them. |
| `catalogue.png` | Contact sheet of all 94 pieces (10 columns of 300 × 250 tiles, in pack order: the 64 interior pieces with white names, then the 30 exterior pieces of batch G from row 8 with light-blue names). |
| `INTEGRATION.md` | How to place pieces, the naming contract, how breaking works, the Unity script, a parts table for every piece, and how to rebuild. |
| `viewer.html` | The catalogue viewer, and the procedural source every file is exported from. |

## Pieces

Size is W × H × D in metres (x × y × z). Cover: **none** (does not hide a body), **soft** (hides you, never stops
bullets: ordinary furniture, as in Siege), **hard** (has parts that stop bullets; outside, see INTEGRATION.md
**Exterior pieces** for which). The garden bench is soft cover,
but its two granite plinths stop bullets. Hard batch F pieces stop bullets only through their cores: the CEO desk
through the steel plate in its modesty panel, the boardroom table through its basalt spine and steel core, the UPS
through its battery bay, the racks through their frames and servers. Triangles are intact / chunk sets.

| id | Piece | Size (m) | kg | Cover | Triangles | Parts | File | Rooms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `coffee_table` | Coffee table, glass top | 1.20 × 0.37 × 0.70 | 33.4 | soft | 6,556 / 6,543 | 7 | 897 KB | F2 River Lounge, F2 VIP Lounge, F2 Green Room, F3 Suite Lounge |
| `celadon_vase_stand` | Celadon vase on stand | 0.40 × 1.00 × 0.40 | 11 | soft | 9,084 / 10,957 | 8 | 1167 KB | F3 Exec Hall, F1 Tea Room, F2 Reception, F3 Boardroom |
| `lounge_sofa` | Low lounge sofa, 3 seat | 2.20 × 0.80 × 0.92 | 59.5 | soft | 13,464 / 16,280 | 10 | 1447 KB | F2 River Lounge, F2 VIP Lounge, F2 Green Room, F2 Noraebang, F2 Booth 1, F2 Booth 2, F3 Suite Lounge |
| `armchair` | Oak-frame lounge armchair | 0.81 × 0.80 × 0.85 | 13.7 | soft | 8,056 / 4,456 | 7 | 884 KB | F2 VIP Lounge, F2 River Lounge, F2 Green Room, F3 Exec Office, F3 Suite Lounge |
| `club_chair` | Leather club chair | 0.90 × 0.78 × 0.92 | 28.2 | soft | 9,988 / 22,847 | 6 | 1520 KB | F2 Cigar Room, F2 Wine Room, F2 Lounge Bar, F3 Exec Office |
| `bar_counter` | Bar counter module (2 m, fluted front) | 2.00 × 1.10 × 0.71 | 165.5 | soft | 5,256 / 12,279 | 6 | 1437 KB | F2 Lounge Bar, F2 Wine Room, F2 Noraebang, F3 Foyer |
| `bar_stool` | Bar stool | 0.44 × 0.78 × 0.44 | 13 | none | 3,448 / 0 | 4 | 256 KB | F2 Lounge Bar, F2 Wine Room, F3 Foyer |
| `bottle_shelf` | Back-bar bottle shelf, backlit | 1.60 × 2.21 × 0.41 | 78.4 | soft | 15,024 / 29,908 | 29 | 3646 KB | F2 Lounge Bar, F2 Wine Room, F2 Noraebang |
| `cigar_humidor` | Cigar humidor cabinet, glass doors | 0.92 × 2.00 × 0.54 | 72.9 | soft | 13,352 / 2,755 | 16 | 1410 KB | F2 Cigar Room, F2 Wine Room |
| `bed` | Platform bed with hanji headboard | 1.80 × 1.05 × 2.20 | 82.8 | soft | 6,692 / 9,370 | 8 | 1311 KB | F3 Bedroom |
| `nightstand` | Nightstand with drawer | 0.50 × 0.52 × 0.43 | 16.5 | soft | 1,704 / 1,539 | 3 | 650 KB | F3 Bedroom, F3 Suite Lounge |
| `wardrobe` | Wardrobe, lattice-and-hanji doors | 1.20 × 2.20 × 0.61 | 87.6 | soft | 5,448 / 9,738 | 8 | 1450 KB | F3 Bedroom, F3 Suite Bath, F2 Wardrobe, F2 Cloakroom |
| `low_tea_table` | Low tea table with celadon tea set | 1.20 × 0.46 × 0.70 | 21.5 | soft | 7,724 / 12,002 | 12 | 1647 KB | F1 Tea Room, F1 Ondol Lounge, F2 VIP Lounge |
| `floor_cushion_set` | Ondol floor cushion set | 1.36 × 0.45 × 1.02 | 9.3 | none | 12,840 / 0 | 7 | 657 KB | F1 Ondol Lounge, F1 Tea Room |
| `folding_screen` | Four-panel hanji folding screen | 1.98 × 1.80 × 0.44 | 13.2 | soft | 4,548 / 7,352 | 8 | 1261 KB | F1 Tea Room, F1 Ondol Lounge, F2 River Lounge, F3 Suite Lounge |
| `ondol_chest` | Low ondol cabinet (bandaji-style chest) | 1.05 × 0.60 × 0.46 | 38 | soft | 10,600 / 4,884 | 5 | 1023 KB | F1 Ondol Lounge, F1 Tea Room, F3 Exec Hall |
| `spa_lounger` | Spa lounger | 0.77 × 0.87 × 1.96 | 23.6 | soft | 7,472 / 2,931 | 4 | 877 KB | F1 Bathhouse, F1 Steam Room, F1 Treatment, F1 Veranda |
| `towel_rack` | Free-standing towel rack | 0.58 × 1.50 × 0.43 | 26.2 | none | 2,836 / 691 | 5 | 397 KB | F1 Changing, F1 Bathhouse, F1 Steam Room, F1 Lockers, F3 Suite Bath |
| `desk_monitors` | Desk with two monitors | 1.60 × 1.20 × 0.80 | 44.3 | soft | 5,768 / 2,446 | 12 | 956 KB | F3 Newsroom, F3 Edit Bay, F3 Edit 1, F3 Edit 2, F3 Writers Room, F3 Exec Office, F3 Podcast |
| `office_chair` | Task chair | 0.66 × 1.15 × 0.69 | 12.6 | none | 11,588 / 0 | 7 | 605 KB | F3 Newsroom, F3 Edit Bay, F3 Control Room, F3 Writers Room, F3 Podcast |
| `filing_cabinet` | Four-drawer filing cabinet | 0.45 × 1.30 × 0.64 | 45 | soft | 3,264 / 0 | 5 | 175 KB | F3 Archive, F3 Writers Room, F3 Newsroom, F3 Exec Office |
| `render_rack` | Render-farm rack | 0.60 × 2.20 × 1.10 | 217 | hard | 14,660 / 950 | 14 | 1026 KB | F3 Render Farm, F3 Edit 2, F3 Projection, F2 Studio |
| `holo_console` | Holo stage console | 1.20 × 1.05 × 0.80 | 57.5 | soft | 3,620 / 2,436 | 6 | 541 KB | F3 Control Room, F3 Screening, F2 Studio |
| `control_desk` | Broadcast control desk module | 1.80 × 1.30 × 0.95 | 71 | soft | 7,440 / 5,453 | 9 | 1153 KB | F3 Control Room, F3 Edit Bay, F3 Projection |
| `vault_shelving` | Deposit-box shelving | 1.20 × 2.10 × 0.61 | 214 | hard | 9,948 / 0 | 17 | 531 KB | F2 Deposit, F2 Concierge, F3 Archive |
| `media_wall` | Media wall unit | 2.40 × 2.00 × 0.46 | 75.8 | soft | 5,412 / 8,867 | 9 | 1543 KB | F3 Suite Lounge, F3 Exec Office, F3 Boardroom, F3 Foyer, F2 Green Room, F2 VIP Lounge |
| `planter_large` | Large basalt planter with shrub | 1.27 × 1.70 × 0.61 | 289 | hard | 8,644 / 13,633 | 5 | 1384 KB | F2 Gallery, F2 Reception, F2 Bridge Lobby, F1 Veranda, F1 Garden |
| `garden_bench` | Stone and oak garden bench | 1.80 × 0.45 × 0.50 | 188 | soft | 1,632 / 1,613 | 3 | 470 KB | F1 Garden, F1 Veranda, F2 Bridge Lobby, F2 Gallery |
| `potted_tree` | Potted tree | 1.04 × 2.45 × 0.80 | 57 | soft | 4,508 / 5,676 | 6 | 764 KB | F2 Reception, F2 River Lounge, F2 Lounge Bar, F3 Exec Hall, F3 Suite Lounge |
| `reception_desk` | Reception desk (stone front) | 2.40 × 1.10 × 0.85 | 172.5 | soft | 2,812 / 4,524 | 8 | 891 KB | F2 Reception, F2 Concierge, F2 Security, F2 Cloakroom, F3 Foyer |
| `lobby_bench` | Lift-lobby bench | 1.80 × 0.44 × 0.55 | 27 | soft | 5,256 / 3,816 | 4 | 824 KB | F1 Garden Lifts, F2 Sky Lifts, F3 Media Lifts, F2 Bridge Lobby, F3 Archive Hall |
| `floor_lamp` | Hanji lantern floor lamp | 0.45 × 1.65 × 0.45 | 11.3 | none | 3,172 / 3,604 | 5 | 703 KB | F1 Tea Room, F1 Ondol Lounge, F2 River Lounge, F2 VIP Lounge, F3 Bedroom, F3 Suite Lounge |
| `service_trolley` | Service trolley | 0.88 × 0.99 × 0.58 | 18.4 | soft | 9,344 / 11,363 | 10 | 1214 KB | F1 Kitchen, F1 Servery, F1 Kitchen Pass, F1 Laundry, F1 Dining Room, F2 Backstage |
| `crate_stack` | Stacked crates and a flight case | 1.21 × 1.40 × 0.80 | 41 | soft | 10,108 / 10,994 | 4 | 1468 KB | F1 Plant Room, F1 Staff Entry, F1 Laundry, F1 Kitchen, F2 Studio, F2 Backstage, F2 Wardrobe |
| `ceo_desk` | Executive desk | 2.40 × 1.17 × 1.00 | 446 | hard | 6,408 / 11,157 | 13 | 1876 KB | F3 Exec Office |
| `ceo_chair` | Executive chair, high back | 0.67 × 1.29 × 0.81 | 24.7 | none | 14,964 / 0 | 7 | 748 KB | F3 Exec Office |
| `guest_chair` | Visitor armchair | 0.58 × 0.80 × 0.54 | 11.6 | none | 5,720 / 1,648 | 7 | 820 KB | F3 Exec Office, F3 Exec Hall, F3 Boardroom |
| `credenza` | Executive credenza | 2.24 × 1.07 × 0.53 | 205.9 | soft | 6,328 / 7,382 | 11 | 1641 KB | F3 Exec Office, F3 Exec Hall, F3 Boardroom |
| `trophy_wall` | Trophy and display wall | 2.00 × 2.40 × 0.42 | 230 | soft | 11,936 / 11,697 | 21 | 2312 KB | F3 Exec Office, F3 Exec Hall, F3 Boardroom |
| `boardroom_table` | Boardroom table, 3.6 m | 3.61 × 0.74 × 1.31 | 878 | hard | 3,724 / 7,422 | 10 | 1191 KB | F3 Boardroom |
| `boardroom_chair` | Boardroom swivel chair | 0.62 × 0.94 × 0.67 | 17.8 | none | 11,860 / 0 | 7 | 717 KB | F3 Boardroom, F3 Exec Office |
| `office_safe` | Office floor safe | 0.62 × 0.90 × 0.62 | 349 | hard | 4,380 / 0 | 3 | 331 KB | F3 Exec Office, F2 Vault Hall, F3 Archive Hall |
| `server_rack` | Server rack, 42U, perforated doors | 0.61 × 2.00 × 1.13 | 585.7 | hard | 15,052 / 0 | 22 | 1133 KB | F3 Control Room (render farm row), F2 Vault Hall (core cage), F3 Archive Hall, F1 Plant Room |
| `server_rack_open` | Open two-post network rack with cable managers | 0.88 × 2.00 × 0.55 | 135.9 | soft | 14,764 / 0 | 16 | 1039 KB | F3 Control Room, F3 Media Hall (comms closet), F1 Plant Room, F2 Vault Hall |
| `storage_array` | Storage array cabinet, glass door | 0.81 × 2.01 × 1.17 | 697.8 | hard | 14,590 / 537 | 15 | 1236 KB | F2 Vault Hall (core cage), F3 Archive Hall, F3 Control Room (render farm row) |
| `ups_cabinet` | UPS and battery cabinet | 0.60 × 2.00 × 0.87 | 718.4 | hard | 7,634 / 548 | 8 | 628 KB | F1 Plant Room, F3 Control Room, F2 Vault Hall (core cage), F3 Archive Hall |
| `cooling_unit` | In-row precision cooling unit | 0.60 × 2.19 × 1.12 | 209.3 | soft | 12,502 / 554 | 10 | 955 KB | F3 Control Room (render farm row), F2 Vault Hall (core cage), F1 Plant Room |
| `cable_tray_run` | Overhead ladder cable tray, 2 m run | 2.00 × 0.70 × 0.64 | 37 | none | 6,232 / 0 | 6 | 368 KB | F3 Control Room (over the rack row), F2 Vault Hall (core cage), F1 Plant Room, F3 Archive Hall, F3 Media Hall |
| `workstation_tower` | Workstation tower, mesh front and glass side | 0.25 × 0.60 × 0.57 | 21.2 | none | 8,042 / 1,064 | 9 | 681 KB | F3 Control Room, F3 Media Hall, F3 Archive Hall, F3 Exec Office |
| `crash_cart` | KVM crash cart | 0.66 × 1.26 × 0.70 | 40.1 | none | 4,708 / 346 | 11 | 461 KB | F3 Control Room, F2 Vault Hall (core cage), F3 Archive Hall, F1 Plant Room |
| `hardware_bench` | Electronics repair bench | 1.80 × 1.91 × 0.77 | 159.9 | soft | 12,322 / 2,668 | 20 | 1423 KB | F3 Control Room (tech corner), F1 Plant Room, F3 Archive Hall, F3 Media Hall |
| `umbrella_stand` | Lobby umbrella stand with wet umbrellas | 0.43 × 1.01 × 0.28 | 10.8 | none | 10,016 / 622 | 7 | 943 KB | F2 Sky Lobby, F2 Bridge Lobby, F1 Garden Lobby |
| `vending_machine` | Slim drinks and snack vending machine | 0.75 × 1.92 × 0.86 | 268.1 | soft | 14,912 / 586 | 15 | 941 KB | F1 Service Hall, F1 Locker Hall, F2 Green Room, F3 Media Hall |
| `water_dispenser` | Filtered water dispenser | 0.42 × 1.08 × 0.44 | 25.3 | none | 6,492 / 483 | 8 | 358 KB | F1 Service Hall, F1 Locker Hall, F1 Spa Hall, F3 Writers Room, F3 News Hall, F2 Green Room |
| `copier` | Office multifunction copier with finisher | 1.47 × 1.27 × 0.82 | 243 | soft | 6,768 / 461 | 15 | 637 KB | F3 Writers Room, F3 News Hall, F3 Archive Hall, F3 Exec Office |
| `karaoke_machine` | Noraebang karaoke console on a cabinet | 0.92 × 1.22 × 0.52 | 70.1 | soft | 10,228 / 1,902 | 15 | 1287 KB | F2 Noraebang, F2 VIP Lounge, F2 Green Room |
| `grand_piano` | Black grand piano with bench | 1.51 × 1.88 × 2.33 | 314.1 | soft | 10,140 / 3,977 | 11 | 1395 KB | F2 VIP Lounge, F2 Sky Lobby, F2 Bridge Lobby, F3 Suite Lounge |
| `aquarium` | Aquarium on a walnut cabinet | 1.21 × 1.47 × 0.52 | 262.2 | soft | 6,508 / 3,504 | 19 | 1311 KB | F3 Exec Hall, F3 Suite Lounge, F3 Exec Office, F2 VIP Lounge |
| `locker_bank` | Four-door steel locker bank | 1.20 × 1.88 × 0.65 | 95.2 | soft | 7,128 / 0 | 6 | 462 KB | F1 Locker Hall, F1 Spa Hall, F1 Plant Room, F2 Green Room |
| `wine_fridge` | Dual-zone wine cooler | 0.60 × 1.85 × 0.74 | 185 | soft | 14,952 / 12,227 | 23 | 2017 KB | F2 Wine Room, F2 Lounge Bar, F2 VIP Lounge, F3 Exec Office |
| `fire_cabinet` | Fire hose and extinguisher cabinet | 0.75 × 1.72 × 0.27 | 84.1 | soft | 8,952 / 917 | 12 | 742 KB | F1 Service Hall, F1 Locker Hall, F2 Bridge Lobby, F3 Exec Hall, F3 News Hall, F3 Archive Hall, F3 Media Hall |
| `hvac_condenser` | Rooftop condenser unit on dunnage | 3.07 × 1.82 × 1.22 | 715 | hard | 12,148 / 0 | 13 | 942 KB | A2 West Roof (plant room lee), A3 Bridge Roof, A4 Crane Deck, F1 Sky Terrace service corner |
| `cooling_tower` | Packaged cooling tower | 2.18 × 3.08 × 1.78 | 613 | soft | 8,616 / 452 | 12 | 772 KB | A2 West Roof (beside the plant room), A4 Crane Deck, A3 Bridge Roof |
| `water_tank` | Elevated sectional water tank | 3.00 × 4.21 × 2.64 | 1,668 | hard | 12,036 / 0 | 7 | 876 KB | A2 West Roof (by the plant room), A4 Crane Deck, A3 Bridge Roof |
| `comm_mast` | Lattice communications mast | 2.08 × 6.75 × 2.08 | 1,566.4 | soft | 14,428 / 1,555 | 13 | 1083 KB | A2 West Roof, A4 Crane Deck, A3 Bridge Roof (east tower) |
| `bmu_cradle` | Window-cleaning cradle on its roof rail | 3.56 × 4.90 × 1.20 | 842 | none | 8,604 / 0 | 11 | 766 KB | A3 Bridge Roof, F2-F3 ledges (the moving cradle), A2 West Roof |
| `exhaust_stack` | Guyed exhaust stacks on a louvred plenum | 3.54 × 3.67 × 3.32 | 398.9 | soft | 5,160 / 0 | 13 | 543 KB | A2 West Roof (plant room), A4 Crane Deck, A3 Bridge Roof |
| `generator_enclosure` | Containerised standby generator | 4.05 × 3.24 × 1.84 | 3,553.6 | hard | 6,164 / 322 | 11 | 748 KB | A2 West Roof (plant room lee), A4 Crane Deck, A3 Bridge Roof |
| `drone_dock` | Drone dock with parked quadcopter | 1.73 × 1.62 × 1.58 | 191.5 | soft | 7,384 / 4,709 | 6 | 765 KB | A3 Bridge Roof, F1 Sky Terrace, A4 Crane Deck, A2 West Roof |
| `roof_hatch_box` | Roof access stair box | 1.76 × 2.85 × 2.19 | 5,637.3 | hard | 2,492 / 733 | 9 | 485 KB | A2 West Roof (plant room door), A4 Crane Deck, A3 Bridge Roof, F1 Sky Terrace |
| `pallet_stack` | Pallet of blocks, cable drum and tarp | 2.13 × 1.19 × 1.67 | 1,018 | hard | 13,068 / 2,006 | 10 | 1359 KB | A4 Crane Deck, A2 West Roof, A3 Bridge Roof, F1 Sky Terrace (works corner) |
| `terrace_sofa` | Terrace sofa, weatherproof three-seat module | 2.11 × 0.86 × 0.94 | 51.9 | soft | 10,884 / 0 | 14 | 619 KB | F1 Sky Terrace, F1 Sky Terrace (A1 canopy), Bridge roof lounge |
| `parasol_table` | Cantilever parasol, half-closed in the rain, with an outdoor table | 2.77 × 2.69 × 1.83 | 190.1 | soft | 7,808 / 3,231 | 9 | 1201 KB | F1 Sky Terrace, Bridge roof lounge, A2 West Roof (helipad edge) |
| `sun_lounger` | Sun lounger, teak and aluminium | 0.84 × 0.90 × 1.96 | 24.9 | soft | 7,988 / 2,916 | 8 | 818 KB | F1 Sky Terrace, F1 Veranda, Bridge roof lounge |
| `patio_heater` | Patio heater, glass flame column | 0.60 × 2.29 × 0.60 | 48.3 | none | 2,816 / 1,504 | 7 | 340 KB | F1 Sky Terrace, F1 Sky Terrace (A1 canopy), Bridge roof lounge |
| `fire_table` | Gas fire table, cast concrete | 1.55 × 0.58 × 0.87 | 254.4 | hard | 5,374 / 8,435 | 11 | 1145 KB | F1 Sky Terrace, F1 Sky Terrace (A1 canopy), Bridge roof lounge |
| `bamboo_planter` | Long cast-stone planter with bamboo | 2.54 × 3.12 × 1.38 | 640.8 | hard | 13,688 / 9,949 | 7 | 2040 KB | F1 Sky Terrace, F1 Garden, Bridge roof lounge, A2 West Roof |
| `pergola_canopy` | Louvred pergola, 3 x 3 m | 3.12 × 2.70 × 3.14 | 240.2 | none | 7,120 / 0 | 10 | 471 KB | F1 Sky Terrace, Bridge roof lounge, A2 West Roof |
| `bollard_light` | Path bollard lights, pair | 1.20 × 0.84 × 0.20 | 106.4 | none | 1,872 / 2,208 | 6 | 492 KB | F1 Sky Terrace, Skybridge approach, A2 West Roof (helipad edge), Bridge roof |
| `security_camera_pole` | Exterior security camera pole | 0.30 × 3.42 × 0.84 | 92.7 | none | 5,364 / 1,196 | 9 | 457 KB | A2 West Roof (plant room), Skybridge mouth, NW gantry, F1 Sky Terrace (kiosk) |
| `holo_pylon` | Exterior holo advert pylon | 0.72 × 3.50 × 0.66 | 401.6 | hard | 4,112 / 6,224 | 6 | 884 KB | F1 Sky Terrace, Skybridge approach (East Tower hall), Bridge roof, A2 West Roof |
| `turbine_vents` | Turbine ventilators, cluster of three | 1.63 × 1.08 × 1.27 | 70.6 | soft | 14,604 / 0 | 9 | 851 KB | A2 West Roof (plant room lee), Bridge Roof, A4 Crane Deck, West Roof plant room exterior |
| `mushroom_vent` | Mushroom-cap roof exhaust fan | 1.25 × 1.02 × 1.25 | 91.5 | soft | 7,872 / 0 | 5 | 545 KB | A2 West Roof (plant room lee), West Roof plant room exterior, Bridge Roof, A1 Sky Terrace (service corner) |
| `upblast_fan` | Kitchen upblast exhaust fan | 1.13 × 1.18 × 0.91 | 92.2 | soft | 7,188 / 0 | 5 | 500 KB | A2 West Roof (plant room lee), West Roof plant room exterior, F1 Kitchen roof / Sky Terrace service yard |
| `gooseneck_vents` | Gooseneck intakes and J-pipe | 1.38 × 0.98 × 0.87 | 44.6 | none | 10,900 / 0 | 8 | 608 KB | A2 West Roof (plant room lee), Bridge Roof, F2/F3 ledge ends, NW gantry landing |
| `louvred_penthouse` | Louvred intake penthouse | 1.31 × 1.21 × 1.11 | 163 | soft | 4,056 / 0 | 8 | 423 KB | A2 West Roof (plant room lee), West Roof plant room exterior, Bridge Roof, A4 Crane Deck |
| `duct_run` | Clad rooftop duct run | 3.19 × 2.30 × 0.98 | 102.3 | soft | 7,084 / 0 | 10 | 575 KB | A2 West Roof (plant room lee), West Roof plant room exterior, Bridge Roof, A4 Crane Deck |
| `wall_louvre` | Facade louvre panel | 2.04 × 1.51 × 0.20 | 95.8 | none | 2,422 / 0 | 26 | 408 KB | West Roof plant room walls, F1 Plant Room exterior wall, F2/F3 ledge plant-room openings, A4 Crane Deck site hut |
| `relief_vent` | Plumbing vent stacks through flashing boots | 1.01 × 0.76 × 0.55 | 17.6 | none | 4,458 / 0 | 9 | 382 KB | A2 West Roof, Bridge Roof, A1 Sky Terrace (service corner), F1/F2 ledge corners |
| `ac_cassette_row` | Split-AC outdoor units on a ledge stand | 2.87 × 1.20 × 0.45 | 160.8 | soft | 14,922 / 0 | 12 | 950 KB | A4 Crane Deck site hut wall, West Roof plant room exterior, A3 Skybridge hall exterior, F2/F3 ledge corners (only where the ledge is wider) |
| `grate_vent` | Exhaust grate on a concrete plinth | 1.65 × 1.59 × 1.00 | 1,257.1 | hard | 2,196 / 2,921 | 7 | 830 KB | A1 Sky Terrace (service corner), A2 West Roof (plant room lee), Bridge Roof, A4 Crane Deck |

## Viewer

Open `viewer.html` in a browser (it needs the network for three.js). It is a dark high-rise room with rain on the
window and the city behind it. **Piece** view puts one piece on a turntable; pick any of the 94 from the list (grouped **Interior** and **Exterior**) or with ← →.
Modes:

- **Intact**
- **Parts**: pulled apart
- **Chunks**: the pre-cut chunk sets spread out, with the debris beside them
- **Colliders**: the proxies as wireframes
- **Break**: a looping demo of everything breaking at once
- **Shoot**: click a part to damage it with **Rifle** (40 per round), **Shotgun** (8 pellets of 12) or **Frag** (300 at the centre, falling to nothing at 4 m)

In Shoot mode the parts table shows each part's health as it drops. A part comes loose or swaps to chunks at 0,
following its break type and support links, and falls with simple gravity, bounce and spin (there is no physics
library and loose bodies do not collide with each other). A loose glass, ceramic or electronic part that lands
hard takes damage. Broken lights and screens go dark.

The turbine vent heads and the split-AC fans turn in Intact and Shoot mode (their `spin` hints) until they are shot
loose. The safe door ignores rifle and shotgun fire in Shoot mode (only a frag wears it down), and the aquarium water
drains away as soon as a pane breaks.

**Room** view lays out a sample suite with 23 copies of the pieces: a lounge facing the media wall, a bar, a
cigar corner and a tea corner by the window. You can shoot it too. Keys: 1–6 modes, R reset. There are **Spin**
(turntable) and **Sound** toggles.

## Batch F: known weaknesses

- **Wide pieces** (`boardroom_table` 3.6 m, `trophy_wall`, `ceo_desk`, `credenza`, `grand_piano`, `copier`,
  `aquarium`) do not pass a 0.9 m door: they are assembled in place.
- **Racks have no shatter parts**: servers, switches and doors only come out whole. Drive sleds are flat faces on
  one backing box per bank (no recess between sleds), to keep the racks near 15k triangles.
- **Colliders inside colliders**: on the copier's touch panel, the crash cart and karaoke monitors and the piano
  keys the inner part's box sits inside its housing's box (as on the shipped desks), and the aquarium water's box
  encloses the fish, plants and stones. A single-hit raycast reaches the housing (or the water) first; use
  `RaycastAll` or blasts to reach the inner part.
- **`KHR_materials_specular`** keeps the piano lid satin in three.js and Blender; an engine that ignores it shows
  the lid a little brighter. Glass is alpha-blended (`glass_dark` 34 %), not refractive.
- **Heavy chunk sets**: the wine fridge's bottles all shatter (12k chunk triangles, a 4.9 MB Unity copy).
- **Radial and tempered panes** give up to 18 chunks (aquarium, fire cabinet, vending, storage array, wine fridge and workstation glass), over the 12 of the
  original contract, like the shipped glass.
- The **room view** and `preview.png` still show the original suite; batch F pieces are in Piece view and the
  catalogue only.

## Batch G: known weaknesses

- **The wet look is material only**: darker, smoother up-faces and rain streaks in the textures. No puddles, drips
  or running water; rain and wet decals are the map's job.
- **Steam cards need the game**: `grate_vent`'s steam is three static crossed cards. The Unity script only breathes
  them (scale and sway); fading and scrolling the `steam_card` material is up to the game. In engines that sort
  blended surfaces per object they can pop in front of or behind other transparent things.
- **Spin hints only on the vents**: the turbine heads and AC fans turn; the condenser and cooling tower fans do not
  (their motor bars are in the same part, so they would turn too). In Unity a turning part's static colliders move
  every frame; turn `animateSpin` off at range if many are in view.
- **Tall and wide pieces are outdoor only**: `comm_mast` 6.75 m, `bmu_cradle` ropes cut off at 4.9 m (hide the ends
  under an overhang), `water_tank` 4.2 m, `generator_enclosure` 4.05 m wide, `pergola_canopy` and `parasol_table`
  are assembled in place. The viewer's room crops the tallest in Piece view.
- **Thin colliders**: `exhaust_stack` guy wires and `comm_mast` cables are thin hulls a player can snag on; the
  comm mast's panel boxes are a little loose (boxes round turned panels).
- **Light parts** (`patio_heater` and `fire_table` flames, the `holo_pylon` hologram) are shatter parts with no
  chunks that just switch off, as batch E's hologram. The viewer's Break demo throws the heater's glow card around.
- **Light-coloured metal still catches a strong overhead light**: the galvanised, spun-aluminium and clad surfaces
  were toned down (rougher, darker, wet twins only slightly glossy), but a hard spot straight above a curved
  surface (the duct riser elbow, the mushroom hood) still shows a bright highlight.
- **Shared look, separate sheets**: the three sets share galvanised steel, weathered concrete and rust, but each set
  keeps some sheets of its own (powder coats, teak, louvre paint), so files carry 11–34 textures. `bamboo_planter`
  is the largest file (2.0 MB, 4.2 MB Unity copy: leaf cards and soil chunks); `pallet_stack` and the turbine and AC
  pieces are the heaviest in triangles (13–15k).
- **No text, checked in renders**: the BMU guard rails have plain chevrons; the camera pole's IR lamp is a
  round dim cluster behind smoked glass; the condenser and generator controller windows are abstract light fields.
- The **room view** and `preview.png` still show the original indoor suite; exterior pieces are in Piece view and
  the catalogue only.
