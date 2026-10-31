# Conductive Lattice

![Conductive Lattice](preview.png)

A wall electrification gadget. The defender throws a hex capacitor node at any point on their side of a
wall; it sticks, sprays liquid metal that runs out from it as a circuit of traces and pads (up to 1 m in
every direction, stopping at the wall's edges) and cures. From then on the lattice pulses: live for 1 s
(glowing traces, crawling arcs), off for 2 s. It works on a soft wall and over the Wall Fortification;
destroying the node kills the whole lattice.

The circuit is not baked: it is generated where the node lands, so every throw gives a different pattern
that fits the spot (in a corner it only grows into the wall).

## Files

| File | Contents |
| --- | --- |
| `conductive-lattice-node.glb` | The node, with its `deploy` clip (about 2.9 s: it presses onto the wall, the spray head spins while the metal runs out, then it settles). Origin at the contact point on the wall, facing +Z (out of the wall). |
| `unity/conductive-lattice-node.glb` | Game-ready copy (merged meshes, UVs, LODs, a collider). |
| `sounds/` | `deploy`, `pulse`, `idle` (loop), `power_down`, and `generate_sounds.py`. |
| `INTEGRATION.md` | How it works in game and how to wire it up. |
| `viewer.html` | Interactive viewer (soft wall and reinforced, with the real Wall Fortification) and the procedural source of the node and the circuit generator. |

## Viewer

Click anywhere on the wall to throw a node there; **Throw** (D or Space) throws at a demo spot or clears
the wall. **Soft wall** (1) / **Reinforced** (2) switch the surface. **Pulsing** (E) turns the power on or
off. Views ¾, Front, Close.
