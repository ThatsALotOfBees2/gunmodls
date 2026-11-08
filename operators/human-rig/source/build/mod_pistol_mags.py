"""loadbearing / pistol_mags (PMAG): two kydex open-top pistol-mag carriers on polymer belt clips.

Each carrier (MNT_belt_pmag1 / _pmag2 at +93 / +106.5 deg, his left hip; fixB: were +40 / +58 on the front of the
belt, where the left thigh folded up through the rigid kydex in the crouch; 45 x 100 x 30 mm): 2 mm haircell kydex tube moulded round the mag (flared
mouth, open bottom drain), rear flange (two layers) with 2 rolled eyelets and a tension screw; a 3 mm polymer belt
clip behind it hooks over the battle-belt top edge and 25 mm down the inside.
Generic 9 mm double-stack mags 128 x 32 x 22 mm (polymer jacket, tapered single-feed top, baseplate with toe,
top round), carried baseplate-up with the bullets forward, 35 mm proud of the kydex.
Skin: C.skin_from_point(mount) (rigid on the belt). Requires belt.
Run: $H/venv/bin/python $R/build/mod_pistol_mags.py [--no-render]
"""
import os, sys, math, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C, matlib
import bpy, bmesh
from mathutils import Vector, Matrix
import common_loadbearing as L
from common_loadbearing import KY, MH, PL, RB

T0 = time.time()
ctx = C.load_base()
col = C.new_collection('pistol_mags')

H_TOP, H_BOT = 0.040, -0.060          # carrier top / bottom (mount y; belt centre ~ 0, belt top +0.032)
ZC = 0.017                            # mag centre out from the belt face
MAG_PROUD = 0.035
BELT_TOP = 0.0328
INNER = -0.0140                       # clip leg inner face (belt inner belt face is at -0.0125)


Y_FEED = H_TOP + MAG_PROUD - 0.129


def shell_ring(M, y, off, scoop=True):
    """kydex ring at mount height y: the mag section there (mag is inverted: local y = Y_FEED - y), offset outward
    by `off` (0.5 mm clearance + wall), placed like the mag (front toward -x, width along z)."""
    yl = Y_FEED - y
    sec = L.pm_sec(min(0.0, yl))
    P = L.offset_poly(sec, -off) if off else sec
    out = []
    for x, z in P:
        X, Z = -x, ZC + z
        yy = y
        if scoop and y >= H_TOP - 0.0045 and Z > ZC + 0.004:          # thumb scoop in the outer face of the mouth
            yy -= 0.012 * max(0.0, 1 - (X / 0.016) ** 2) ** 0.8
        out.append(M @ Vector((X, yy, Z)))
    return out


def carrier(M, mbk, mbc):
    """fixA: thermoformed kydex: 2 mm wall over the mag with 0.5 mm clearance (~37 x 27 mm outside), following
    the mag's rounded front spine and its feed-end taper at the bottom, rolled + flared 3 mm mouth, open drain
    bottom. Taco seam flange behind the mag rear: 2 eyelets, tension screw with a rubber washer stack."""
    ys = [H_BOT, H_BOT + 0.010, H_BOT + 0.024, -0.010, H_TOP - 0.010]
    CL, WALL = 0.0005, 0.002
    outer = [shell_ring(M, y, CL + WALL) for y in ys] + [shell_ring(M, H_TOP - 0.0012, CL + WALL + 0.0012)]
    lip = shell_ring(M, H_TOP + 0.0004, CL + WALL * 0.5 + 0.0016)
    inner = [shell_ring(M, H_TOP - 0.0012, CL + 0.0012), shell_ring(M, H_TOP - 0.006, CL + 0.0002)] + \
            [shell_ring(M, y, CL) for y in (-0.010, H_BOT + 0.024, H_BOT + 0.010, H_BOT)]
    ids = L.loft(mbk, outer + [lip] + inner, KY)
    a, b = ids[0], ids[-1]
    n = len(a)
    for i in range(n):                                   # bottom edge (open drain)
        i2 = (i + 1) % n
        mbk.f([b[i], b[i2], a[i2], a[i]], KY)
    # ---- seam flange (two layers), behind the mag rear (+x), on the belt plane
    rx = 0.016 + CL + WALL
    L.part(mbk, M, 'box', (0.0115, H_TOP - H_BOT - 0.006, 0.0044), KY, bevel=0.0014, loc=(rx + 0.0045, (H_TOP + H_BOT) / 2 - 0.003, ZC))
    Mf = M @ Matrix.Translation((rx + 0.0055, 0, ZC + 0.0022)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    Mf = M @ Matrix.Translation((rx + 0.0052, 0, ZC + 0.0022))
    for y in (H_BOT + 0.011, H_TOP - 0.014):
        L.grommet(mbk, Mf, r_out=0.0034, r_in=0.0017, h=0.0009, loc=(0, y, 0), n=8)
    # tension screw through the flange with a 10 mm rubber washer stack (adjusts retention)
    L.part(mbc, Mf, 'cyl', (0.0050, 0.0030), RB, segs=10, loc=(0, -0.010, 0.0015))
    L.part(mbc, Mf, 'cyl', (0.0050, 0.0030), RB, segs=10, loc=(0, -0.010, 0.0045))
    L.screw(mbk, Mf @ Matrix.Translation((0, 0, 0.006)), d=0.0064, h=0.0018, loc=(0, -0.010, 0.0), n=8)
    # ---- polymer belt clip: back plate, hook over the belt top, leg down the inside
    L.part(mbc, M, 'box', (0.034, 0.074, 0.0028), PL, bevel=0.0009, loc=(0.0, -0.002, 0.0015))
    L.part(mbc, M, 'box', (0.030, 0.0030, -INNER + 0.0030), PL, bevel=0.0009, loc=(0.0, BELT_TOP + 0.0042, (INNER + 0.0030) / 2))
    L.part(mbc, M, 'box', (0.030, 0.026, 0.0016), PL, bevel=0.0006, loc=(0.0, BELT_TOP + 0.0049 - 0.013, INNER + 0.0004))


mbk = L.MB([KY, MH]); mbc = L.MB([PL, RB]); mbm = L.MB([PL, MH])
mounts = ['MNT_belt_pmag1', 'MNT_belt_pmag2']
for name in mounts:
    M = C.mount(name)
    carrier(M, mbk, mbc)
    # mag: baseplate up, bullets toward the buckle (-x of the belt frame) -> rotate 180 deg about the frame z
    y_feed = Y_FEED
    Mm = M @ Matrix.Translation((0.0, y_feed, ZC)) @ Matrix.Rotation(math.pi, 4, 'Z')
    L.pistol_mag(mbm, mbm, Mm)

shells = mbk.build('PMAG_Carriers', col, sharp=35)
clips = mbc.build('PMAG_Clips', col, sharp=35)
mags = mbm.build('PMAG_Mags', col, sharp=35)
for o, m in ((shells, 'carrier'), (clips, 'carrier'), (mags, 'mags')): o['part'] = 'main'
C.log('tris', mbk.ntris(), mbc.ntris(), mbm.ntris())
obs = [shells, clips, mags]
for o in obs:
    m = C.conform(o, min_mm=6.5, layer='body', mode='shift')    # fixA: belt now sits on the trousers (inside the envelope)
    C.log('conform', o.name, round(m, 2))
# skin: rigid on the belt under each mount (split by nearest mount)
mp = [Vector(C.mount(n).col[3][:3]) for n in mounts]
for o in obs:
    P = C.verts_np(o)
    Wa, names = C.sample_body_weights(mp)
    side = np.array([0 if (Vector(p) - mp[0]).length < (Vector(p) - mp[1]).length else 1 for p in P])
    Wv = Wa[side]
    C._write_weights(o, Wv, names)
L.finish(obs)
if os.environ.get('LB_DIAG'): L.pen_where(obs)
d = C.write_module('pistol_mags', obs, attach_bone='Hips', requires=['belt'], mounts_used=mounts,
                   lod_ratios=[1.0, 0.5, 0.25],
                   notes='2 kydex carriers (tube + rear flange, eyelets, tension screw) on polymer clips hooked over the '
                         'belt top; generic 9 mm double-stack mags carried baseplate-up, bullets forward, 35 mm proud. '
                         'Each carrier rides rigidly with the skin under its mount (skin_from_point per carrier).')
C.save_module('pistol_mags')
C.log('done', round(time.time() - T0, 1), 's', d['tris'], d['penetration'])
if '--no-render' not in C.argv():
    C.quick_render('pistol_mags', with_mods=('belt',))
