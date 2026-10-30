# Conductive Lattice

![Conductive Lattice](preview.png)

A wall electrification gadget. The defender sticks a hex capacitor node to their side of a wall; it
sprays liquid metal that runs out across the wall as a circuit of traces and pads and cures in about
3 seconds. From then on the lattice pulses: live for 1 s (glowing traces, crawling arcs), off for 2 s.
It works on a soft wall and over the Wall Fortification; destroying the node kills the whole lattice.

## Files

| File | Contents |
| --- | --- |
| `conductive-lattice-soft.glb` | Node and lattice for a soft wall: covers 1.9 m × 2.1 m, traces on the wall surface (z = 0.002), node at 0.95 m. |
| `conductive-lattice-reinforced.glb` | Node and lattice on the panel faces of a standard (1.5 m) Wall Fortification (z = 0.157). Place it at the same origin as the reinforcement. |
| `unity/*.glb` | Game-ready copies (merged meshes, UVs, LODs, a collider on the node). |
| `lattice-paths.json` | Every trace segment of both variants (x0, y0, x1, y1, spray distance), for arcs and hit tests. |
| `sounds/` | `deploy`, `pulse`, `idle` (loop), `power_down`, and `generate_sounds.py`. |
| `INTEGRATION.md` | How it works in game and how to wire it up. |
| `viewer.html` | Interactive viewer (soft wall and reinforced, with the real Wall Fortification) and the procedural source. |

Each `.glb` has two clips: `deploy` (about 3.3 s: the node presses on, the spray head spins, the traces
appear as the spray front reaches them, about 0.9 m/s) and `pulse` (3 s loop: the glowing core of the
traces on for 1 s, off for 2 s).

## Viewer

**Deploy** (D or Space) places the node and sprays; press again to clear the wall. **Soft wall** (1) /
**Reinforced** (2) switch the surface. **Pulsing** (E) turns the power on or off. Views ¾, Front, Close.
