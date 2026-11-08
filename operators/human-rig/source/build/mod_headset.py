"""headset (HSET): generic active hearing protection (no logos).
Main: oval polymer cups 80 x 60 x 40 on MNT_ear_L/R, 15 mm gel seals whose contact face follows the head envelope
(the ear sits in the seal opening, cup inner face >= 10 mm off the ear), volume knob + battery door on the cups,
120 mm boom mic on the left cup (pivot hub, wire boom, foam windscreen).
Parts: 'headband' (25 mm padded sprung band over the crown, wire yokes into the cups; hide it with the helmet),
'rails' (ARC-style rail adapters from MNT_helm_rail_L/R down to the cup pivots; requires helmet),
'downlead' (4 mm cable from the left cup to a plug at MNT_ptt; requires radio).
Cups, band, rails rigid on Head; the downlead blends Head -> Neck -> UpperChest.
Run: $H/venv/bin/python $R/build/mod_headset.py [--no-render]
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C, matlib
import bpy
import numpy as np
from mathutils import Vector, Matrix
import common_sidearm_misc as S

ID = 'headset'
ctx = C.load_base(); rig = ctx['rig']
col = C.new_collection(ID)
ENV = C.body_bvh('envelope'); BODY = C.body_bvh('body')
mbC = S.MB(['MAT_Polymer', 'MAT_Rubber', 'MAT_MetalHW'])
mbB = S.MB(['MAT_Rubber', 'MAT_Polymer', 'MAT_MetalHW'])
mbR = S.MB(['MAT_Polymer', 'MAT_MetalHW'])
mbD = S.MB(['MAT_Rubber', 'MAT_Polymer', 'MAT_MetalHW'])
CUPH, CUPW = 0.080, 0.060                        # outer oval (tall x wide)
SEAL = 0.015; CUPD = 0.030
NS = 16
cup_info = {}


def oval(a, b, n=NS, phase=0.0):
    return [(a * math.cos(2 * math.pi * i / n + phase), b * math.sin(2 * math.pi * i / n + phase)) for i in range(n)]


for side, sg in (('L', 1), ('R', -1)):
    Me = C.mount(f'MNT_ear_{side}'); o = Vector(Me.col[3][:3])
    out = Vector((sg, 0, 0))
    up = Vector((0, 0, 1)); fw = up.cross(out).normalized()          # local x across (fore/aft), y up, z out
    M = S.frame(o + Vector((0, -0.004, 0.002)), fw, up, out)
    # ---- seal: contact face follows the envelope (+0.5 mm), outer face flat at the cup base
    def contact(u, v):
        p = M @ Vector((u, v, 0.08))
        loc, n, fi, d = ENV.ray_cast(p, -out, 0.2)
        return (loc.x if loc is not None else o.x) * sg
    rin_a, rin_b = 0.029, 0.020                  # opening (tall, wide) half-axes
    rout_a, rout_b = CUPH / 2, CUPW / 2
    cin = [contact(b_, a_) for a_, b_ in oval(rin_a, rin_b)]
    cout = [contact(b_, a_) for a_, b_ in oval(rout_a, rout_b)]
    ear_x = max(cin) * 1.0                       # local depth of the deepest contact (head bulge/ear rim)
    base = max(max(cin), max(cout)) + 0.004      # flat seal top (cup base), local distance from x = 0
    zof = (o.x * sg)
    rows = []
    for k, (ra, rb, which) in enumerate(((rin_a, rin_b, 'cin'), (rout_a, rout_b, 'cout'), (rout_a + 0.0015, rout_b + 0.0015, 'mid'),
                                          (rout_a, rout_b, 'top'), (rin_a + 0.002, rin_b + 0.002, 'top'), (rin_a - 0.001, rin_b - 0.001, 'mid2'))):
        ring = []
        for i, (a_, b_) in enumerate(oval(ra, rb)):
            if which == 'cin': d = cin[i] + 0.0005
            elif which == 'cout': d = cout[i] + 0.0005
            elif which == 'mid': d = (cout[i] + base) / 2
            elif which == 'mid2': d = (cin[i] + base) / 2
            else: d = base + SEAL - max(0.0, base - min(cin + cout)) * 0.0
            ring.append(M @ Vector((b_, a_, d - zof)))
        rows.append(ring)
    seal_top = base + SEAL
    # make the seal at least SEAL thick everywhere: top ring at max(contact)+SEAL
    S.loft(mbC, rows + [rows[0]], 'MAT_Rubber', closed=True, uv=('box', M))
    # ---- cup shell (dome) from the seal top outward
    secs = []
    for dz, s_ in ((0.0, 1.0), (0.004, 1.025), (0.016, 1.02), (0.026, 0.94), (0.031, 0.82), (0.033, 0.6)):
        secs.append([M @ Vector((b_ * s_, a_ * s_, seal_top - zof + dz)) for a_, b_ in oval(CUPH / 2, CUPW / 2)])
    S.loft(mbC, secs, 'MAT_Polymer', closed=True, cap0=True, cap1=True, uv=('box', M))
    top_z = seal_top - zof + 0.033
    # parting line band (thin rubber bumper) where the cup meets the seal ring
    # battery door (raised oval plate, screw) on the outer face; volume knob on the right cup's front
    cup_info[side] = dict(M=M, zof=zof, seal_top=seal_top, top_z=top_z, o=o)
    if side == 'L':
        S.prism(mbC, M @ Matrix.Translation((0.0, -0.004, top_z - 0.003)), S.rrect(0.030, 0.042, 0.010, seg=2), 0.004,
                'MAT_Polymer', chamfer=0.0012)
        S.screw_head(mbC, M @ Matrix.Translation((0.0, -0.016, top_z + 0.001)), d=0.006, h=0.0012, n=6)
    else:
        S.prism(mbC, M @ Matrix.Translation((0.0, 0.0, top_z - 0.003)), S.rrect(0.032, 0.046, 0.012, seg=2), 0.003,
                'MAT_Polymer', chamfer=0.001)
        kn = M @ S.frame((CUPW / 2 * 0.92, -0.006, seal_top - zof + 0.016), (0, 1, 0), (0, 0, 1), (1, 0, 0))
        S.cyl(mbC, kn, 0.0065, 0.008, 'MAT_Rubber', n=10, chamfer=0.001)
        S.cyl(mbC, M @ S.frame((CUPW / 2 * 0.92, 0.010, seal_top - zof + 0.016), (0, 1, 0), (0, 0, 1), (1, 0, 0)), 0.004, 0.0055, 'MAT_Rubber', n=8)
    # top pivot block (headband yoke / rail arm socket)
    S.box(mbC, M @ Matrix.Translation((0, CUPH / 2 - 0.004, seal_top - zof + 0.014)), 0.018, 0.012, 0.016, 'MAT_Polymer', bevel=0.002)

# ---- boom mic on the left cup: hub, wire boom curving to 15 mm in front of the mouth corner, foam windscreen
L = cup_info['L']; M = L['M']; zl = L['seal_top'] - L['zof']
hub = M @ S.frame((-0.020, -0.012, zl + 0.022), (1, 0, 0), (0, 1, 0), (0, 0, 1))
S.cyl(mbC, hub, 0.010, 0.010, 'MAT_Polymer', n=12, chamfer=0.0015)
_l, _n, _f, _d = BODY.ray_cast(Vector((0.024, -0.30, 1.598)), Vector((0, 1, 0)), 0.3)
mouth = Vector((0.028, (_l.y if _l is not None else -0.135) - 0.018, 1.606))
C.log('lips y', _l)
start = hub @ Vector((0, 0, 0.010))
ctrl = [start, start + Vector((0.004, -0.030, -0.018)), Vector((0.078, mouth.y + 0.040, 1.608)), Vector((0.050, mouth.y + 0.008, 1.600)), mouth]
# integration: dense spline + 8-sided tube (45 deg between faces, under the 50 deg sharp angle -> smooth shaded)
P = S.resample(S.catmull(S.resample(S.catmull(ctrl, 12), 0.01), 6), 0.0055)
S.tube(mbC, P, 0.0022, 'MAT_MetalHW', k=8)
T = (P[-1] - P[-2]).normalized()
Mm = S.frame(mouth - T * 0.004, T.orthogonal(), T.orthogonal().cross(T) * -1, T) if False else None
Tm = (P[-1] - P[-3]).normalized()
up_ = Vector((0, 0, 1)); xm = up_.cross(Tm).normalized(); ym = Tm.cross(xm)
Mmic = S.frame(mouth - Tm * 0.020, xm, ym, Tm)
S.cyl(mbC, Mmic, 0.0075, 0.024, 'MAT_Rubber', n=10, chamfer=0.003)              # foam windscreen
HC = mbC.build('HSET_Cups', col, sharp_deg=50)

# ---- headband (part 'headband'): padded 25 mm band over the crown + wire yokes
hc = Vector((0.0, -0.045, 1.700))
band = []; bups = []
for t in np.linspace(-1, 1, 21):
    ang = t * math.radians(80)
    d = Vector((math.sin(ang), 0.0, math.cos(ang)))
    hit = S.ray_out(hc, d, ENV, 0.2)
    p = (hit if hit is not None else hc + d * 0.1) + d * 0.004
    band.append(p); bups.append(d)
# ends drop vertically onto the cup pivot blocks
for side, sg in (('L', 1), ('R', -1)):
    ci = cup_info[side]; M = ci['M']
    piv = M @ Vector((0, CUPH / 2 + 0.002, ci['seal_top'] - ci['zof'] + 0.014))
    if sg > 0:
        band = band + [Vector((max(band[-1].x, piv.x), band[-1].y, (band[-1].z + piv.z) / 2 + 0.012))]
        bups = bups + [Vector((1, 0, 0.2)).normalized()]
    else:
        band = [Vector((min(band[0].x, piv.x), band[0].y, (band[0].z + piv.z) / 2 + 0.012))] + band
        bups = [Vector((-1, 0, 0.2)).normalized()] + bups
S.strap(mbB, band, bups, 0.026, 0.0045, 'MAT_Rubber', side_shift=0.0, caps=True)
# sprung steel wires inside the slider (visible on the sides): two rods from the band ends into the pivot blocks
for side, sg in (('L', 1), ('R', -1)):
    ci = cup_info[side]; M = ci['M']
    piv = M @ Vector((0, CUPH / 2 + 0.004, ci['seal_top'] - ci['zof'] + 0.014))
    end = band[-1] if sg > 0 else band[0]
    for dy in (-0.006, 0.006):
        a = end + Vector((sg * 0.0015, dy, -0.002)); b = piv + Vector((0, dy, 0.004))
        S.tube(mbB, [a, b], 0.0013, 'MAT_MetalHW', k=5)
    S.box(mbB, S.frame(end + Vector((sg * 0.002, 0, -0.004)), (0, 1, 0), (0, 0, 1), (sg, 0, 0)), 0.024, 0.012, 0.006,
          'MAT_Polymer', bevel=0.0015)
HB = mbB.build('HSET_Headband', col, sharp_deg=50)
HB['part'] = 'headband'

# ---- ARC rail adapters (part 'rails')
for side, sg in (('L', 1), ('R', -1)):
    Mr = C.mount(f'MNT_helm_rail_{side}'); ro = Vector(Mr.col[3][:3]); rz = Vector(Mr.col[2][:3])
    ci = cup_info[side]; M = ci['M']
    piv = M @ Vector((0, CUPH / 2 + 0.002, ci['seal_top'] - ci['zof'] + 0.014))
    blk = ro + rz * 0.0085
    Mb = S.frame(blk, Vector((0, -1, 0)), Vector((0, 0, 1)), rz)
    S.box(mbR, Mb, 0.034, 0.018, 0.012, 'MAT_Polymer', bevel=0.002, z0=0.0)            # rail clamp
    S.screw_head(mbR, Mb @ Matrix.Translation((0.008, 0, 0.012)), d=0.007, h=0.0016, n=6)
    S.cyl(mbR, Mb @ S.frame((-0.008, 0.0, 0.012), (1, 0, 0), (0, 1, 0), (0, 0, 1)), 0.0045, 0.004, 'MAT_MetalHW', n=8)  # lever pivot
    a = blk + rz * 0.006 + Vector((0, 0, -0.008)); b = piv + Vector((0, 0, 0.006))
    mid = (a + b) / 2 + rz * 0.006
    arm = S.resample(S.catmull([a, mid, b], 4), 0.008)
    S.strap(mbR, arm, [Vector((0, -1, 0))] * len(arm), 0.0035, 0.010, 'MAT_Polymer', side_shift=0.0, caps=True)
    S.cyl(mbR, S.frame(b + Vector((0, 0.0055, 0)), (1, 0, 0), (0, 0, 1), (0, -1, 0)), 0.005, 0.011, 'MAT_MetalHW', n=8)
HR = mbR.build('HSET_Rails', col, sharp_deg=45)
HR['part'] = 'rails'

# ---- downlead (part 'downlead'): left cup bottom -> neck side -> plug at MNT_ptt
ci = cup_info['L']; M = ci['M']
c0 = M @ Vector((0.006, -CUPH / 2 + 0.006, ci['seal_top'] - ci['zof'] + 0.012))
Mp = C.mount('MNT_ptt'); po = Vector(Mp.col[3][:3]); pz = Vector(Mp.col[2][:3])
plug_top = po + pz * 0.030 + Vector((0, 0, 0.030))
G = [c0, c0 + Vector((0.002, 0.0, -0.025)), Vector((0.098, -0.030, 1.590)), Vector((0.108, -0.040, 1.555)), plug_top]
P = S.resample(S.catmull(G, 12), 0.008)
U3 = S.union_bvh(('PRX_Envelope',))
# integration: push out, then relax (Laplacian) and push again so the cable hangs as one smooth curve, no kinks
for _it in range(6):
    P = [P[0], P[1]] + S.push_out(P[2:-1], U3, 4.0) + [P[-1]]
    P = [P[0], P[1]] + [P[i].lerp((P[i - 1] + P[i + 1]) / 2, 0.6) for i in range(2, len(P) - 1)] + [P[-1]]
P = [P[0], P[1]] + S.push_out(P[2:-1], U3, 4.0) + [P[-1]]
P = S.resample(S.catmull(P, 4), 0.0075)
S.tube(mbD, P, 0.0022, 'MAT_Rubber', k=8)
S.cyl(mbD, S.frame(c0 + Vector((0, 0, 0.002)), (1, 0, 0), (0, 1, 0), (0, 0, -1)), 0.0045, 0.012, 'MAT_Rubber', n=8, r1=0.0028)  # strain relief
Tp = (P[-1] - P[-2]).normalized(); xp = Tp.orthogonal()
S.cyl(mbD, S.frame(plug_top - Tp * 0.002, xp, Tp.cross(xp), Tp), 0.0065, 0.026, 'MAT_Polymer', n=10, chamfer=0.0015)
S.cyl(mbD, S.frame(plug_top + Tp * 0.024, xp, Tp.cross(xp), Tp), 0.0072, 0.006, 'MAT_MetalHW', n=10)
HD = mbD.build('HSET_Downlead', col, sharp_deg=50)
HD['part'] = 'downlead'

obs = [HC, HB, HR, HD]
for o in (HB,):
    C.log(o.name, 'shift', round(S.shift_group([o], ENV, 1.0, test=[o]), 2))
C.log('tris', {o.name: C.tris(o) for o in obs}, sum(C.tris(o) for o in obs))
W, names = C.body_weights()
Whead = S.weights_dict({'Head': 1.0})
Wneck = S.weights_dict({'Neck': 0.6, 'Head': 0.4}) if 'Neck' in names else Whead
Wptt, _ = S.weights_at(po)


def rigid(o): C.skin_rigid(o, 'Head')


def lead(o):
    def fn(p):
        if p.z > 1.63: return Whead
        if p.z > 1.57:
            t = (1.63 - p.z) / 0.06; return (1 - t) * Whead + t * Wneck
        t = min(1.0, (1.57 - p.z) / 0.05); return (1 - t) * Wneck + t * Wptt
    S.skin_rows(o, fn)


S.finish(ID, obs, {'HSET_Cups': rigid, 'HSET_Headband': rigid, 'HSET_Rails': rigid, 'HSET_Downlead': lead}, 'Head',
         dict(mounts_used=['MNT_ear_L', 'MNT_ear_R', 'MNT_helm_rail_L', 'MNT_helm_rail_R', 'MNT_ptt'],
              parts={'main': {'default': True, 'requires': []},
                     'headband': {'default': True, 'requires': [], 'hidden_with': ['helmet']},
                     'rails': {'default': True, 'requires': ['helmet']},
                     'downlead': {'default': True, 'requires': ['radio']}},
              lod_ratios=(1.0, 0.5, 0.25),
              notes='Generic active hearing protection: oval cups 80x60 (33 mm shell) on 15 mm gel seals conformed '
                    'to the head envelope, rubber parting bumper, battery door, volume knob, 120 mm wire boom mic '
                    'with foam windscreen (left). Parts: headband (hide when the helmet is on: hidden_with), rails '
                    '(ARC clamps on MNT_helm_rail_L/R, requires helmet), downlead (cable + plug to MNT_ptt, requires '
                    'radio). Rigid Head; downlead blends Head->Neck->PTT.'),
         focus=((0.0, -0.06, 1.66), 0.34), hide=('HSET_Rails',), hide_full=('HSET_Headband',),
         full_kw=dict(views=('front34', 'side_l'), with_mods=('helmet',), focus=((0.0, -0.05, 1.62), 0.45), full_body=False))
