# AK-47 (AKM pattern)

![AK-47](preview.png)

A matte black Kalashnikov in the AKM pattern, the form most people mean by "AK-47": a stamped
1 mm receiver with a ribbed dust cover, a 45-degree gas block, the slant compensator, a tangent-leaf
rear sight, black polymer furniture with palm-swell handguards, and a curved 30-round magazine.

## Specs

| | |
| --- | --- |
| Cartridge | 7.62×39 mm |
| Barrel | 415 mm (16.3"), breech face to muzzle |
| Overall length | 897 mm (35.3") over the slant compensator; 880 mm to the muzzle |
| Sight radius | 378 mm (14.9"), sight line 48.5 mm above the bore |
| Length of pull | 12.6" (Warsaw-length stock) |
| Height with magazine | 265 mm (10.4") |
| Charging handle travel | 90 mm |

Dimensions come from spec listings, armorer layout prints and forum caliper measurements: the
receiver and trunnion rivet layout, fire-control pin positions, barrel journal diameters, gas-tube
and handguard lengths, front-sight-base and compensator sizes, and stock and magazine envelopes.
Small details that no source measured (rib counts, grip shape) are close approximations.

## Files

| File | Contents |
| --- | --- |
| `ak47.glb` | The rifle: 0.897 m long, 79 named meshes, about 174k triangles, with named parts and three animations: `charge` (the carrier and charging handle run back 90 mm and slam home), `selector_safe_auto_semi` (the lever steps down through AUTO to SEMI) and `magazine_release` (the magazine rocks forward off its catch and drops). |
| `cartridge-7.62x39.glb` | A 7.62×39 mm round: brass case with extractor groove and 15-degree shoulder, copper-jacketed boat-tail bullet, 56 mm long. Origin at the centre of the case head, bullet toward +Z. |
| `viewer.html` | Interactive viewer and the procedural source of both files. |
| `preview.png` | Still render. |

## Parts

Nodes in `ak47.glb`. Where a part is made of several meshes they are numbered (`front_sight_2`, ...).

- **Moving:** `bolt_carrier_assembly` (`bolt_carrier`, `bolt`, `charging_handle`), `selector_assembly`
  (`selector_lever`), `magazine_assembly` (`magazine_body`, `magazine_ribs`, `magazine_floorplate`,
  `magazine_catches`, `magazine_top_round`)
- **Receiver group:** `receiver`, `trunnions`, `receiver_cavity`, `rivets`, `fire_control_pins`,
  `dust_cover`, `dust_cover_bead`, `recoil_spring_button`
- **Trigger group:** `trigger_guard`, `trigger`, `magazine_release`, `pistol_grip`, `grip_screw`
- **Barrel group:** `barrel`, `rear_sight_block`, `rear_sight_base`, `rear_sight_leaf`, `rear_sight_slider`,
  `gas_tube_lever`, `gas_tube`, `gas_block`, `gas_block_pin`, `front_sight`, `muzzle_brake`, `cleaning_rod`
- **Furniture:** `upper_handguard`, `lower_handguard`, `handguard_ferrule`, `ferrule_lever`, `front_sling_loop`,
  `stock`, `stock_tang`, `stock_screws`, `buttplate`, `buttplate_ribs`, `buttplate_trapdoor`, `buttplate_screws`,
  `rear_sling_loop`, `sling_loop_screws`

Every screw head has a real slotted drive recess cut into it.

## Viewer

Open `viewer.html` in a browser.

- Drag to orbit, scroll to zoom, right-drag to pan.
- **Charge** (R or Space) pulls the charging handle and ejects a round. On SAFE the selector blocks it.
- **Selector** (F) steps through safe, auto (АВ) and semi (ОД).
- **Drop mag** (M) rocks the magazine off its catch and drops it; press again to insert it.
- Furniture: matte black (as exported), wood or tan. Part labels, preset views and a turntable.
