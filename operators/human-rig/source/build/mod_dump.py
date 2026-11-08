"""loadbearing / dump (DUMP): stowed roll-up dump pouch on the battle belt at MNT_belt_dump (+131 deg, between the
pistol mags and the IFAK; fixB: was 150 mm long at +118 deg, shortened to a compact 72 mm roll when the pistol mags
moved back to the left hip).

Cordura backing 76 x 72 x 3 mm (bound edges) wrapped on the belt sleeve; the pouch is rolled into a 72 x 70 x 55 mm
roll (2.2 turns of 2.4 mm fabric, so the ends show the spiral and the outer flap edge) that follows the belt
curve; a 3.8 mm shock-cord loop round the roll closes in a polymer cord lock with a short tail; two 25 mm PALS
straps leave the backing and wrap under the belt edge with snap tabs.
Skin: C.skin_from_point(mount). Requires belt.
Run: $H/venv/bin/python $R/build/mod_dump.py [--no-render]
"""
import os, sys, math, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C, matlib
import bpy, bmesh
from mathutils import Vector, Matrix
import common_loadbearing as L
from common_loadbearing import CB, WB, EL, PL, MH

T0 = time.time()
ctx = C.load_base()
col = C.new_collection('dump')
TH0 = ctx['mounts']['mounts']['MNT_belt_dump'].get('theta_deg', 118.0)
LEN, HT, DP = float(os.environ.get('DUMP_LEN', 0.072)), 0.070, 0.055
BK = 0.003                       # backing thickness
CY, CZ = 0.002, BK + DP / 2       # roll axis (belt-local y, z)

mb = L.MB([CB, WB, EL]); mh = L.MB([PL, MH])
# ---------------------------------------------------------------- backing (bound edges)
i0 = len(mb.V)
pts, _ = L.rrect(LEN + 0.004, 0.072, 0.008, 2)
outline = [(x, y - 0.036) for x, y in pts]
r0 = [Vector((x, y, 0.0)) for x, y in outline]
r1 = [Vector((x, y, BK)) for x, y in outline]
L.plate(mb, outline, BK, step=0.025, nrings=1)
# ---------------------------------------------------------------- roll: spiral strip swept along x
TURNS, NPT, TF = 2.2, 11, 0.0024
def spiral(t):                           # t 0..1 from the core to the outer edge -> (y, z) offsets
    ph = 2 * math.pi * TURNS * t + 0.6
    s = 0.40 + 0.60 * t
    return Vector((0, (HT / 2 - TF) * s * math.sin(ph), (DP / 2 - TF) * s * math.cos(ph)))
N = int(TURNS * NPT)
outer = [spiral(k / N) for k in range(N + 1)]
inner = []
for k in range(N + 1):
    p = outer[k]; q = outer[min(N, k + 1)] - outer[max(0, k - 1)]
    nrm = Vector((0, -q.z, q.y)).normalized()
    if nrm.dot(p) > 0: nrm = -nrm
    inner.append(p + nrm * TF)
prof = outer + inner[::-1]
XS = [-LEN / 2, -LEN / 2 + 0.004, -LEN * 0.23, 0.0, LEN * 0.23, LEN / 2 - 0.004, LEN / 2]
rings = []
for x in XS:
    sq = 0.965 if abs(x) > LEN / 2 - 0.001 else 1.0           # ends slightly squashed (soft roll)
    rings.append([Vector((x, CY + p.y * sq, CZ + p.z * sq)) for p in prof])
L.loft(mb, rings, CB, cap0=CB, cap1=CB)
# ---------------------------------------------------------------- shock cord loop + cord lock
CR = 0.0019
def around(x, grow):
    P = []
    for k in range(18):
        a = 2 * math.pi * k / 18
        P.append(Vector((x, CY + (HT / 2 + grow) * math.sin(a), CZ + (DP / 2 + grow) * math.cos(a))))
    return P
XC = min(0.030, LEN * 0.2)                    # shock cord loop / cord lock position along the roll
loop = around(XC, CR + 0.0002)
# keep the strand off the backing: clamp z
loop = [Vector((p.x, p.y, max(p.z, BK + CR + 0.0005))) for p in loop]
L.sweep_tube(mb, loop + [loop[0]], CR, 6, EL, up=(1, 0, 0), caps=False, closed=False)
# cord lock on the front (top-front quadrant): barrel 18 x 12 x 10 with the tail and a knot
a = math.radians(40)
lockp = Vector((XC, CY + (HT / 2 + 0.006) * math.sin(a), CZ + (DP / 2 + 0.006) * math.cos(a)))
Ml = Matrix.Translation(lockp) @ Matrix.Rotation(-a, 4, 'X')
L.part(mh, Ml, 'box', (0.012, 0.010, 0.018), PL, bevel=0.003, loc=(0, 0, 0))
L.part(mh, Ml, 'cyl', (0.0035, 0.004), PL, segs=8, loc=(0, 0.0065, 0.0), rot=Matrix.Rotation(math.pi / 2, 3, 'X'))
tail = [Ml @ Vector((0, 0.002, -0.004 - k * 0.006)) for k in range(5)]
tail = [Ml @ Vector((0.0, 0.0, 0.0))] + [Ml @ Vector((0.002 * k, -0.002 * k, 0.010 + 0.006 * k)) for k in range(1, 5)]
L.sweep_tube(mb, tail, CR * 0.95, 6, EL, up=(1, 0, 0))
L.part(mh, Ml, 'cyl', (0.0034, 0.005), PL, segs=8, loc=(0.008, -0.008, 0.035), rot=Matrix.Rotation(math.pi / 2, 3, 'Y') @ Matrix.Rotation(0, 3, 'X'))
# ---------------------------------------------------------------- PALS straps: backing bottom, under the belt edge, snap tab
for xs in (-(LEN / 2 - 0.018), LEN / 2 - 0.018):
    P = [Vector((xs, -0.030, BK * 0.5)), Vector((xs, -0.040, BK * 0.5)), Vector((xs, -0.0335, -0.0002)) if False else Vector((xs, -0.0368, -0.0005)),
         Vector((xs, -0.0372, -0.0040)), Vector((xs, -0.0350, -0.0075))]
    P = [Vector((xs, -0.028, BK * 0.4)), Vector((xs, -0.0395, BK * 0.4)), Vector((xs, -0.0415, -0.0012)), Vector((xs, -0.0405, -0.0055)),
         Vector((xs, -0.0372, -0.0085))]
    L.sweep_strap(mb, P, (0, 0, 1), 0.025, 0.0014, row='web25_stitched')
    Ms = Matrix.Translation((xs, -0.0402, 0.0016))
    L.part(mh, Ms, 'cyl', (0.0055, 0.0018), MH, segs=10, loc=(0, 0, 0.0))
# wrap everything onto the belt
L.wrap_belt(mb, i0, TH0, flat=0.0)
L.wrap_belt(mh, 0, TH0, flat=0.0)
roll = mb.build('DUMP_Roll', col, sharp=55)
hw = mh.build('DUMP_Hardware', col, sharp=40)
C.log('tris', mb.ntris(), mh.ntris())
obs = [roll, hw]
for o in obs: C.log('conform', o.name, round(C.conform(o, min_mm=2, mode='shift'), 2))
Tb = L.foreign_bvh('belt')
if Tb:
    for o in obs: C.log('inside belt', o.name, L.inside_count([o], Tb, tol=0.0006, maxd=0.01))
mp = C.mount('MNT_belt_dump').col[3][:3]
for o in obs: C.skin_from_point(o, mp)
L.finish(obs)
if os.environ.get('LB_DIAG'): L.pen_where(obs)
d = C.write_module('dump', obs, attach_bone='Hips', requires=['belt'], mounts_used=['MNT_belt_dump'],
                   lod_ratios=[1.0, 0.5, 0.25],
                   notes='Rolled dump pouch following the belt curve; spiral roll ends, shock cord + cord lock, 2 PALS '
                         'straps wrapping under the belt edge with snaps. Rigid on the skin under the mount.')
C.save_module('dump')
C.log('done', round(time.time() - T0, 1), 's', d['tris'], d['penetration'])
if '--no-render' not in C.argv():
    C.quick_render('dump', with_mods=('belt',))
