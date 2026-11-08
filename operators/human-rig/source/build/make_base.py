"""Design phase: build rig/base/rig_base.blend + rig/base/mounts.json from the human prototype.

Run:  $H/venv/bin/python $H/rig/build/make_base.py
In:   $H/final/stage/human_head.blend (full un-holed Body + head parts + Rig, rest A-pose)
      $H/final/human_proto.blend (the 5 clips, appended as fake-user actions for pose checks)
      $H/final/textures/*.jpg|png (2K game textures of skin / hair / eyes)
Out:  rig/base/rig_base.blend   collections BASE (Rig, Body, Eyes, Mouth, Brows, Lashes, HairShell1..5),
                                MOUNTS (MNT_* empties parented to bones), PROXY (PRX_* fit proxies, never exported)
      rig/base/mounts.json      mounts, rings (belt / cummerbund), panels (front / back plate bags), helmet rim,
                                canonical weights, envelope table
Body attributes added: 'region' (int, per vertex, see REGIONS) and 'env_mm' (float: max offset of the base-clothing
layer from the skin at that vertex).  PRX_Envelope = Body pushed out by env_mm (what gear must clear).
"""
import os, sys, json, math, time, shutil
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, bvhtree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

T0 = time.time()
H, RIG = C.H, C.RIG
SRC = os.path.join(H, 'final', 'stage', 'human_head.blend')
ANIM = os.path.join(H, 'final', 'human_proto.blend')
TEXSRC = os.path.join(H, 'final', 'textures')
TEXDST = os.path.join(RIG, 'textures', 'base')
os.makedirs(TEXDST, exist_ok=True); os.makedirs(os.path.join(RIG, 'base'), exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=SRC)
scn = bpy.context.scene
rig = bpy.data.objects['Rig']; body = bpy.data.objects['Body']
for o in list(bpy.data.objects):
    if o.name in ('LashHelper', 'Eyelashes'): bpy.data.objects.remove(o)

# ------------------------------------------------------------------ 1. textures -> 2K game copies, BASE_ materials
for f in os.listdir(TEXSRC):
    if f.split('_')[0] in ('skin', 'hair', 'eye'): shutil.copy(os.path.join(TEXSRC, f), os.path.join(TEXDST, f))
def retex(mat, mapping):
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            for key, fn in mapping.items():
                if key in n.image.name:
                    cs = n.image.colorspace_settings.name
                    n.image = bpy.data.images.load(os.path.join(TEXDST, fn), check_existing=True)
                    n.image.colorspace_settings.name = cs
M = bpy.data.materials
retex(M['Skin'], {'skin_basecolor': 'skin_basecolor.jpg', 'skin_normal': 'skin_normal.jpg', 'skin_orm': 'skin_orm.jpg'})
retex(M['Eyes'], {'eye_basecolor': 'eye_basecolor.jpg'})
for m in M:
    if m.name.startswith('Hair'): retex(m, {'hair_rgba': 'hair_rgba.png'})
for m in list(M):
    if not m.name.startswith('BASE_'): m.name = 'BASE_' + m.name
for im in list(bpy.data.images):
    if im.users == 0: bpy.data.images.remove(im)

# ------------------------------------------------------------------ 2. clips (fake-user actions, for pose checks)
with bpy.data.libraries.load(ANIM, link=False) as (src, dst):
    dst.actions = [a for a in src.actions if a in ('Idle', 'Ready', 'Walk', 'CrouchIdle', 'LookAround')]
for a in dst.actions: a.use_fake_user = True
if rig.animation_data: rig.animation_data.action = None
for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)

# ------------------------------------------------------------------ 3. collections
def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in scn.collection.children: scn.collection.children.link(c)
    return c
BASE = coll('BASE'); MOUNTS = coll('MOUNTS'); PROXY = coll('PROXY')
for o in list(scn.objects):
    for c in list(o.users_collection): c.objects.unlink(o)
    BASE.objects.link(o)
for c in list(bpy.data.collections):
    if c.name not in ('BASE', 'MOUNTS', 'PROXY'): bpy.data.collections.remove(c)

C._CTX.update(rig=rig, body=body, mounts={})

# ------------------------------------------------------------------ 4. regions + envelope
me = body.data; NV = len(me.vertices)
co = np.array([v.co[:] for v in me.vertices]); nrm = np.array([v.normal[:] for v in me.vertices])
gn = [g.name for g in body.vertex_groups]
Wd = [dict() for _ in range(NV)]
for v in me.vertices:
    for g in v.groups:
        if g.weight > 1e-4: Wd[v.index][gn[g.group]] = g.weight
def wsum(keys): return np.array([sum(w for n, w in Wd[i].items() if any(k in n for k in keys)) for i in range(NV)])
w_hand = wsum(['Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Little', 'metacarpal'])
w_leg = wsum(['UpperLeg', 'LowerLeg', 'Foot', 'Toes', 'toe'])
w_arm = wsum(['UpperArm', 'LowerArm'])
w_skull = wsum(['Head', 'Jaw', 'Eye', 'oris', 'levator', 'orbicularis', 'tongue', 'temporalis', 'eyebrows', 'cheek',
                'nose', 'risorius', 'mandible', 'special', 'lip'])
w_neck = wsum(['Neck', 'neck'])
x, y, z = co.T
def bone(n, end='head'):
    b = rig.data.bones[n]; return np.array(b.head_local if end == 'head' else b.tail_local)
t_arm = np.zeros(NV)
for s, sg in (('Left', 1), ('Right', -1)):
    e, h = bone(f'{s}LowerArm'), bone(f'{s}Hand'); m = (x * sg) > 0.12
    d = h - e; t_arm[m] = ((co[m] - e) @ d) / (d @ d)
def smooth01(a): a = np.clip(a, 0, 1); return a * a * (3 - 2 * a)
def collar_z(yy, xx=0.0):                     # the proto shirt's crew-collar line (gear_build.py)
    r = np.sqrt(np.asarray(xx) ** 2 + (np.asarray(yy) + 0.01) ** 2)
    return 1.522 + 0.042 * smooth01((yy + 0.02) / 0.09) + 0.85 * np.maximum(0.0, r - 0.072)
knee_z = bone('LeftLowerLeg')[2]
REGIONS = ['head', 'neck', 'torso', 'waist', 'upperarm', 'forearm', 'wrist', 'hand', 'thigh', 'knee', 'shin', 'ankle', 'foot']
ENV = {'head': 6, 'neck': 0, 'collar': 6, 'torso': 7, 'waist': 9, 'upperarm': 14, 'forearm': 12, 'wrist': 10, 'hand': 6,
       'thigh': 18, 'cargo': 28, 'knee': 14, 'shin': 16, 'ankle': 20, 'foot': 45}
reg = np.full(NV, REGIONS.index('torso'))
reg[(z > 0.93) & (z < 1.07)] = REGIONS.index('waist')
legm = (w_leg > 0.5) & (z < 0.93)
reg[legm] = REGIONS.index('thigh')
reg[legm & (np.abs(z - knee_z) < 0.07)] = REGIONS.index('knee')
reg[legm & (z < knee_z - 0.07)] = REGIONS.index('shin')
reg[(w_leg > 0.3) & (z < 0.25)] = REGIONS.index('ankle')
reg[(w_leg > 0.3) & (z < 0.12)] = REGIONS.index('foot')
armm = w_arm > 0.4
reg[armm] = REGIONS.index('upperarm')
reg[armm & (t_arm > 0.0) & (np.abs(x) > 0.3)] = REGIONS.index('forearm')
reg[armm & (t_arm > 0.80)] = REGIONS.index('wrist')
reg[w_hand > 0.5] = REGIONS.index('hand')
reg[w_neck + w_skull > 0.5] = REGIONS.index('neck')
reg[w_skull > 0.5] = REGIONS.index('head')
env = np.array([ENV[REGIONS[r]] for r in reg], float)
neck = reg == REGIONS.index('neck')
env[neck & (z < collar_z(y, x))] = ENV['collar']
# cargo pockets: lateral-front thigh between 0.58 and 0.80 m
for s, sg in (('Left', 1), ('Right', -1)):
    hp, kn = bone(f'{s}UpperLeg'), bone(f'{s}LowerLeg')
    m = (reg == REGIONS.index('thigh')) & (x * sg > 0) & (z > 0.58) & (z < 0.80)
    tt = (z[m] - hp[2]) / (kn[2] - hp[2]); ax = hp[None] + (kn - hp)[None] * tt[:, None]
    d = co[m] - ax; d[:, 2] = 0; d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    lat = d @ np.array([sg * 0.9, -0.44, 0])
    idx = np.nonzero(m)[0][lat > 0.55]; env[idx] = ENV['cargo']
# smooth the envelope one ring so the proxy has no steps
adj = [[] for _ in range(NV)]
for e in me.edges:
    a, b = e.vertices; adj[a].append(b); adj[b].append(a)
for _ in range(3):
    env = np.array([0.5 * env[i] + 0.5 * np.mean(env[adj[i]]) if adj[i] else env[i] for i in range(NV)])
for nm_, arr, typ in (('region', reg, 'INT'), ('env_mm', env, 'FLOAT')):
    if nm_ in me.attributes: me.attributes.remove(me.attributes[nm_])
    at = me.attributes.new(nm_, typ, 'POINT'); at.data.foreach_set('value', arr.astype(int if typ == 'INT' else float))

envme = me.copy(); envme.name = 'PRX_Envelope'
for a in [a.name for a in envme.attributes if a.name in ('region', 'env_mm')]: pass
envme.vertices.foreach_set('co', (co + nrm * env[:, None] * 1e-3).ravel())
envob = bpy.data.objects.new('PRX_Envelope', envme); PROXY.objects.link(envob)
envme.materials.clear()
C._BVH.clear()
TE = C.body_bvh('envelope'); TB = C.body_bvh('body')
C.log('regions/envelope done', {r: int((reg == i).sum()) for i, r in enumerate(REGIONS)})

# ------------------------------------------------------------------ 5. plate bags (front / back)
def ray(T, o, d, dist=2.0):
    loc, n, fi, dd = T.ray_cast(Vector(o), Vector(d).normalized(), dist)
    return loc
# suprasternal notch: most posterior point of the front midline between neck and chest
prof = []
for zz in np.arange(1.42, 1.58, 0.0025):
    h = ray(TB, (0, -1, zz), (0, 1, 0))
    if h: prof.append((zz, h.y))
prof = np.array(prof)
notch_z = float(prof[np.argmax(prof[:, 1]), 0])
PW, PH, CUT = 0.260, 0.340, 0.050        # plate-bag face 260 x 340 mm (ESAPI-M 241 x 318 plate + cover), 2" shooter's cut
PLATE_T, IN_T, OUT_T = 0.022, 0.002, 0.003
R_CURVE = 0.40                          # multi-curve plate, horizontal radius ~16"

def fit_panel(side, z_top):
    zc = z_top - PH / 2
    Xw = Vector((1, 0, 0)) if side == 'front' else Vector((-1, 0, 0))
    best = None
    for tdeg in np.arange(-12, 2.1, 1.0):          # top-in or vertical only (straps pull the top in)
        t = math.radians(tdeg)
        Y = Vector((0, -math.sin(t), math.cos(t))) if side == 'front' else Vector((0, math.sin(t), math.cos(t)))
        Z = Xw.cross(Y).normalized()
        O = Vector((0, 0, zc))
        ks, ds, wts = [], [], []
        for s in np.linspace(-PW / 2 + 0.01, PW / 2 - 0.01, 17):
            for v in np.linspace(-PH / 2 + 0.01, PH / 2 - 0.01, 21):
                a_, b_ = abs(s) - (PW / 2 - CUT), v - (PH / 2 - CUT)
                if a_ > 0 and b_ > 0 and a_ + b_ > CUT: continue
                a = s / R_CURVE
                p0 = O + Xw * (R_CURVE * math.sin(a)) - Z * (R_CURVE - R_CURVE * math.cos(a)) + Y * v
                h = ray(TE, p0 + Z * 1.0, -Z)
                if h is None: continue
                ds.append((h - p0).dot(Z)); wts.append(4.0 if v > PH / 6 else 1.0)
        ds = np.array(ds); k = ds.max() + 0.002
        # shoulder straps pull the top edge in: weight the upper third's gap 4x (else the fit pivots on
        # pecs + belly and the top flares away from the sternum)
        gap = float(np.average(k - ds, weights=wts))
        if best is None or gap < best[0]: best = (gap, tdeg, k, Y, Z)
    gap, tdeg, k, Y, Z = best
    O_in = Vector((0, 0, zc)) + Z * k
    O_out = O_in + Z * (IN_T + PLATE_T + OUT_T)
    rows = 11
    return dict(side=side, tilt_deg=float(tdeg), mean_gap_mm=round(gap * 1e3, 1), R=R_CURVE, w=PW, h=PH, cut=CUT,
                z_top=float(z_top), zc=float(zc), X=list(Xw), Y=list(Y), Z=list(Z),
                origin_inner=list(O_in), origin_outer=list(O_out),
                thickness_m=IN_T + PLATE_T + OUT_T, plate=dict(w=0.241, h=0.318, t=PLATE_T, kind='ESAPI-M multi-curve'),
                grid=dict(cols=6, rows=rows, u0=-2.5 * 0.0381, v0=PH / 2 - 0.045, pitch_u=0.0381, pitch_v=0.0254,
                          slot_mm=[30, 9]))

STATURE = float(np.max(co[:, 2]))
front_top = min(notch_z - 0.010, 0.818 * STATURE)   # plate top at the suprasternal notch (0.818 x stature)
panels = {'front': fit_panel('front', front_top), 'back': fit_panel('back', front_top + 0.020)}
C._CTX['mounts'] = {'panels': panels}
C.log('panels', {k: (v['tilt_deg'], v['mean_gap_mm'], round(v['zc'], 3)) for k, v in panels.items()}, 'notch', round(notch_z, 3))

# ------------------------------------------------------------------ 6. rings: belt + cummerbund
torso_like = np.isin(reg, [REGIONS.index(r) for r in ('torso', 'waist', 'thigh', 'neck')])
envco = co + nrm * env[:, None] * 1e-3
def section(zz):
    pts = []
    for e in me.edges:
        a, b = e.vertices
        if not (torso_like[a] and torso_like[b]): continue
        za, zb = envco[a, 2], envco[b, 2]
        if (za - zz) * (zb - zz) <= 0 and za != zb:
            t = (zz - za) / (zb - za); pts.append(envco[a, :2] + t * (envco[b, :2] - envco[a, :2]))
    return np.array(pts)
def hull(P):
    P = sorted(map(tuple, P))
    def cr(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return np.array(lo[:-1] + up[:-1])
TH = np.radians(np.arange(-180, 180, 2.0))
def radial(Hp, c):
    out = []
    for t in TH:
        d = np.array([math.sin(t), -math.cos(t)]); best = 0
        for i in range(len(Hp)):
            p, q = Hp[i] - c, Hp[(i + 1) % len(Hp)] - c
            M2 = np.array([d, p - q]).T
            if abs(np.linalg.det(M2)) < 1e-12: continue
            s, u = np.linalg.solve(M2, p)
            if s > 0 and 0 <= u <= 1: best = max(best, s)
        out.append(best)
    return np.array(out)
def ring(z0, z1, n, clear, thick, side_bump=0.0, lateral_only=None):
    zs = np.linspace(z0, z1, n)
    hulls = [hull(section(zz)) for zz in zs]
    allp = np.concatenate(hulls); c = np.array([0.0, float(allp[:, 1].mean())])
    r = np.max([radial(Hp, c) for Hp in hulls], axis=0)
    inner = r + clear
    bump = side_bump * np.exp(-((np.abs(np.degrees(TH)) - 90) / 22) ** 2)
    outer = inner + thick + bump
    return dict(z=float((z0 + z1) / 2), z0=float(z0), z1=float(z1), center=[float(c[0]), float(c[1])],
                theta=[float(t) for t in TH], inner=[float(v) for v in inner], outer=[float(v) for v in outer])
rings = {
    # battle belt: 65 mm padded sleeve over a 45 mm inner belt, on the trouser waistband
    'belt': ring(0.985, 1.050, 5, 0.001, 0.016),
    # cummerbund: 150 mm laser-cut laminate, side-plate pockets (6x8" landscape) add 12 mm over the hips' sides
    'cumb': ring(panels['front']['z_top'] - PH + 0.006, panels['front']['z_top'] - PH + 0.156, 5, 0.002, 0.009, 0.012),
}
C._CTX['mounts']['rings'] = rings
C.log('rings', {k: (round(v['z'], 3), round(min(v['inner']), 3), round(max(v['outer']), 3)) for k, v in rings.items()})

# ------------------------------------------------------------------ 7. helmet proxy (high-cut shell outer surface)
head_obs = [body] + [bpy.data.objects[f'HairShell{i}'] for i in range(1, 6)]
TH_ = C.obj_bvh(head_obs)
HC = Vector((0, -0.050, 1.700))
RIM = [(0, 1.738), (40, 1.735), (70, 1.726), (95, 1.724), (120, 1.700), (150, 1.676), (180, 1.666)]
def z_rim(phi_deg):
    a = abs(((phi_deg + 180) % 360) - 180)
    return float(np.interp(a, [p for p, _ in RIM], [zz for _, zz in RIM]))
STANDOFF = 0.028                         # hair surface -> shell outer: 19 mm pads + 8 mm shell + 1 mm
def shell_pt(phi, el):
    d = Vector((math.sin(phi) * math.cos(el), -math.cos(phi) * math.cos(el), math.sin(el)))
    h = ray(TH_, HC + d * 0.5, -d, 1.0)
    rr = (h - HC).length if h else 0.11
    return HC + d * (rr + STANDOFF), d
PHIS = np.radians(np.arange(-180, 180, 7.5)); NE = 12
grid = []
for phi in PHIS:
    els = np.radians(np.arange(-45, 89, 1.0))
    zz = [shell_pt(phi, e)[0].z for e in els]
    e_rim = float(np.interp(z_rim(math.degrees(phi)), zz, els))
    row = [shell_pt(phi, e)[0] for e in np.linspace(e_rim, math.radians(84), NE)]
    grid.append(row)
top = shell_pt(0, math.radians(90))[0]
hv = [tuple(p) for row in grid for p in row] + [tuple(top)]
hf = []
NP = len(PHIS)
for i in range(NP):
    j = (i + 1) % NP
    for k in range(NE - 1): hf.append((i * NE + k, j * NE + k, j * NE + k + 1, i * NE + k + 1))
    hf.append((i * NE + NE - 1, j * NE + NE - 1, len(hv) - 1))
helm = C.mesh_object('PRX_Helmet', hv, hf, PROXY)
helm_bvh = C.obj_bvh([helm])
def helm_frame(phi_deg, dz_above_rim):
    """point on the proxy shell at azimuth phi (0 front, +90 his left), dz above the rim line."""
    phi = math.radians(phi_deg); zt = z_rim(phi_deg) + dz_above_rim
    els = np.radians(np.arange(-45, 89, 0.5))
    zz = [shell_pt(phi, e)[0].z for e in els]
    e = float(np.interp(zt, zz, els)); p, d = shell_pt(phi, e)
    p2, _ = shell_pt(phi + 0.02, e); p3, _ = shell_pt(phi, e + 0.02)
    n = (p2 - p).cross(p3 - p).normalized()
    if n.dot(d) < 0: n = -n
    return p, n

# ------------------------------------------------------------------ 8. mounts
mounts = {}
def add_mount(name, M, purpose, owner, bone=None):
    loc = Vector(M.col[3][:3])
    if bone is None:
        Wv, names = C.sample_body_weights([loc]); bone = names[int(np.argmax(Wv[0]))]
    mounts[name] = dict(loc=[round(v, 5) for v in loc], x=[round(v, 5) for v in M.col[0][:3]],
                        y=[round(v, 5) for v in M.col[1][:3]], z=[round(v, 5) for v in M.col[2][:3]],
                        bone=bone, purpose=purpose, owner=owner)
def frame(loc, zdir, ydir=(0, 0, 1)):
    zv = Vector(zdir).normalized(); yv = Vector(ydir); yv = (yv - zv * yv.dot(zv)).normalized(); xv = yv.cross(zv)
    M = Matrix.Identity(4); M.col[0][:3], M.col[1][:3], M.col[2][:3] = xv, yv, zv; M.col[3][:3] = loc; return M

PF = C.panel_frame
add_mount('MNT_car_front', PF('front', 0, 0), 'front plate-bag outer face centre (laser-cut PALS 6 cols x 11 rows)', 'armor', 'spine02')
add_mount('MNT_car_back', PF('back', 0, 0), 'back plate-bag outer face centre (laser-cut PALS 6 x 11)', 'armor', 'spine02')
add_mount('MNT_rifle_mags', PF('front', 0, -0.105), 'centre of the triple 5.56 pouch back panel (front rows 6-10)', 'loadbearing', 'spine02')
add_mount('MNT_admin', PF('front', 0, 0.085), 'admin pouch back panel centre (front rows 0-3)', 'loadbearing', 'spine02')
add_mount('MNT_sling_front', PF('front', 0.098, 0.118), 'sling front attach loop (his left, upper front panel)', 'sidearm_misc', 'spine02')
add_mount('MNT_drag', PF('back', 0, PH / 2 + 0.012), 'drag handle centre (top edge of back panel)', 'armor', 'spine02')
add_mount('MNT_hydration', PF('back', 0, -0.005), 'hydration carrier back panel centre', 'loadbearing', 'spine02')
# fixB: pistol mags 40/58 -> 93/106.5 (left hip, clear of the thigh in the crouch), dump 118 -> 131
for nm_, th, ow, why in (('MNT_belt_buckle', 0, 'loadbearing', 'cobra-style buckle centre'),
                        ('MNT_belt_pmag1', 93, 'loadbearing', 'pistol mag pouch 1'),
                        ('MNT_belt_pmag2', 106.5, 'loadbearing', 'pistol mag pouch 2'),
                        ('MNT_belt_knife', 78, 'sidearm_misc', 'knife / multitool sheath (vertical)'),
                        ('MNT_belt_dump', 131, 'loadbearing', 'rolled dump pouch'),
                        ('MNT_belt_ifak', 180, 'loadbearing', 'rip-away IFAK (horizontal, rear centre)'),
                        ('MNT_belt_tq', -146, 'loadbearing', 'tourniquet holder (vertical, rear right)'),
                        ('MNT_belt_holster', -95, 'sidearm_misc', 'belt holster / drop-leg hanger (right hip)')):
    add_mount(nm_, C._ring_frame('belt', th, 0.0, 'outer'), why, ow)
add_mount('MNT_cumb_radio', C._ring_frame('cumb', 100, 0.0, 'outer'), 'radio pouch on left cummerbund', 'loadbearing')
add_mount('MNT_cumb_bang1', C._ring_frame('cumb', -80, 0.0, 'outer'), 'flashbang pouch 1, right cummerbund', 'sidearm_misc')
add_mount('MNT_cumb_bang2', C._ring_frame('cumb', -102, 0.0, 'outer'), 'flashbang pouch 2, right cummerbund', 'sidearm_misc')
# shoulder straps (top of the trapezius) + PTT on the left strap front
for s, sg in (('L', 1), ('R', -1)):
    h = ray(TE, (sg * 0.10, 0.0, 2.0), (0, 0, -1))
    add_mount(f'MNT_car_shoulder_{s}', frame(h + Vector((0, 0, 0.012)), (0, 0, 1), (0, -1, 0)),
              f'top of the {s} shoulder strap (pad outer face, 12 mm)', 'armor', 'UpperChest')
h = ray(TE, (0.095, -1, panels['front']['z_top'] + 0.045), (0, 1, 0))
add_mount('MNT_ptt', frame(h + Vector((0, -0.012, 0)), (0, -1, 0.35)), 'PTT on the left shoulder strap front', 'loadbearing', 'UpperChest')
# head
add_mount('MNT_helm_rail_L', frame(*helm_frame(95, 0.022), (0, 0, 1)), 'left accessory rail centre on shell', 'armor', 'Head')
add_mount('MNT_helm_rail_R', frame(*helm_frame(-95, 0.022), (0, 0, 1)), 'right accessory rail centre on shell', 'armor', 'Head')
p, n = helm_frame(0, 0.030)
add_mount('MNT_helm_shroud', frame(p, n, (0, 0, 1)), 'NVG shroud centre on shell front', 'armor', 'Head')
add_mount('MNT_helm_crown', frame(top, (0, 0, 1), (0, -1, 0)), 'crown (top of shell)', 'armor', 'Head')
for s, sg in (('L', 1), ('R', -1)):
    m = (x * sg > 0.068) & (z > 1.62) & (z < 1.72) & (y > -0.085) & (y < 0.005) & (w_skull > 0.5)
    ear = co[m].mean(0)
    add_mount(f'MNT_ear_{s}', frame(Vector(ear), (sg, 0, 0)), f'{s} ear (headset cup centre axis)', 'sidearm_misc', 'Head')
eyes = (bone('LeftEye') + bone('RightEye')) / 2
add_mount('MNT_eyes', frame(Vector(eyes), (0, -1, 0)), 'midpoint of the eyeball centres (eyewear)', 'sidearm_misc', 'Head')
# knees / elbows / thigh
for s, sg in (('L', 1), ('R', -1)):
    side = 'Left' if s == 'L' else 'Right'
    kj = bone(f'{side}LowerLeg')
    h = ray(TE, (kj[0], -1, kj[2] + 0.015), (0, 1, 0))
    add_mount(f'MNT_knee_{s}', frame(h, (0, -1, 0)), f'{s} knee pad centre (patella, on trousers envelope)', 'base', f'{side}LowerLeg')
    ej = Vector(bone(f'{side}LowerArm')); ua = (ej - Vector(bone(f'{side}UpperArm'))).normalized()
    fa = (Vector(bone(f'{side}Hand')) - ej).normalized(); d = (ua - fa).normalized()
    h = ray(TE, ej + d * 0.4, -d)
    add_mount(f'MNT_elbow_{s}', frame(h, d, ua), f'{s} elbow pad centre (olecranon, on sleeve envelope)', 'base', f'{side}LowerArm')
hp, kn = bone('RightUpperLeg'), bone('RightLowerLeg')
zt = 0.775; tt = (zt - hp[2]) / (kn[2] - hp[2]); axp = Vector(hp + (kn - hp) * tt)
d = Vector((-math.cos(math.radians(18)), -math.sin(math.radians(18)), 0))
h = ray(TE, axp + d * 0.5, -d)
add_mount('MNT_thigh_R', frame(h, d), 'drop-leg platform centre (right thigh, over the cargo pocket)', 'sidearm_misc', 'RightUpperLeg')

# canonical weights for rigid plate bags
def canon(side):
    pts = [Vector(PF(side, u, v, 'inner').col[3][:3]) for u in np.linspace(-0.11, 0.11, 7) for v in np.linspace(-0.15, 0.15, 9)]
    Wv, names = C.sample_body_weights(pts)
    m = Wv.mean(0); idx = np.argsort(-m)[:4]; tot = m[idx].sum()
    return {names[i]: round(float(m[i] / tot), 4) for i in idx}
canonical = {'front_panel': canon('front'), 'back_panel': canon('back'), 'head': {'Head': 1.0}}

# MOUNTS empties
for nm_, md in mounts.items():
    e = bpy.data.objects.new(nm_, None); e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.03
    MOUNTS.objects.link(e)
    Mx = Matrix.Identity(4)
    for i, k in enumerate(('x', 'y', 'z')): Mx.col[i][:3] = md[k]
    Mx.col[3][:3] = md['loc']
    e.parent = rig; e.parent_type = 'BONE'; e.parent_bone = md['bone']
    bpy.context.view_layer.update()
    e.matrix_world = Mx
    e.hide_render = True

# ------------------------------------------------------------------ 9. carrier / belt proxies
def slab(name, side):
    V, F = [], []
    us = np.linspace(-PW / 2, PW / 2, 9); vs = np.linspace(-PH / 2, PH / 2, 9)
    for layer in ('inner', 'outer'):
        for v in vs:
            for u in us: V.append(tuple(PF(side, u, v, layer).col[3][:3]))
    n = len(us); L = n * len(vs)
    for j in range(len(vs) - 1):
        for i in range(n - 1):
            a = j * n + i; F.append((a, a + 1, a + n + 1, a + n)); F.append((L + a, L + a + n, L + a + n + 1, L + a + 1))
    border = [j * n for j in range(len(vs))][::-1] + list(range(n)) + [j * n + n - 1 for j in range(len(vs))] + [L - n + i for i in range(n)][::-1]
    ring_ = list(range(0, n)) + [j * n + n - 1 for j in range(1, len(vs))] + [(len(vs) - 1) * n + i for i in range(n - 2, -1, -1)] + [j * n for j in range(len(vs) - 2, 0, -1)]
    for k in range(len(ring_)):
        a, b = ring_[k], ring_[(k + 1) % len(ring_)]; F.append((a, b, L + b, L + a))
    return V, F
def band(R, arcs, nz=3):
    V, F = [], []
    th = np.array(R['theta']); c = R['center']
    for (a0, a1) in arcs:
        ts = np.radians(np.arange(a0, a1 + 0.1, 3.0)); base = len(V)
        for layer in ('inner', 'outer'):
            r = np.interp(ts, th, np.array(R[layer]), period=2 * np.pi)
            for zz in np.linspace(R['z0'], R['z1'], nz):
                for t, rr in zip(ts, r): V.append((c[0] + rr * math.sin(t), c[1] - rr * math.cos(t), zz))
        nt = len(ts); L = nt * nz
        for layer_off in (0, L):
            for j in range(nz - 1):
                for i in range(nt - 1):
                    a = base + layer_off + j * nt + i; F.append((a, a + 1, a + nt + 1, a + nt))
    return V, F
CV, CF = [], []
for part in (slab('f', 'front'), slab('b', 'back'), band(rings['cumb'], [(32, 150), (-150, -32)])):
    off = len(CV); CV += part[0]; CF += [tuple(i + off for i in f) for f in part[1]]
C.mesh_object('PRX_Carrier', CV, CF, PROXY, smooth=False)
BV, BF = band(rings['belt'], [(-180, 178)], 3)
C.mesh_object('PRX_Belt', BV, BF, PROXY, smooth=False)
for o in PROXY.objects: o.hide_render = True; o.display_type = 'WIRE'

# ------------------------------------------------------------------ 10. save
data = dict(note='rig_base mounts (rest A-pose, Blender metres, Z up, faces -Y, his left = +X). See DESIGN.md.',
            notch_z=notch_z, mounts=mounts, rings=rings, panels=panels, canonical_weights=canonical,
            helmet=dict(center=list(HC), standoff_m=STANDOFF, rim=RIM),
            envelope=dict(mm=ENV, regions=REGIONS, note='base clothing must stay <= env_mm from skin; gear >= env_mm + 2'))
json.dump(data, open(C.MOUNTS_JSON, 'w'), indent=1)
for o in [rig, body]: o.select_set(False)
scn.render.engine = 'CYCLES'
scn.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=C.BASE_BLEND, compress=True)
if os.path.exists(C.BASE_BLEND + '1'): os.remove(C.BASE_BLEND + '1')
tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
C.log('saved', C.BASE_BLEND, 'base tris', {o.name: tri(o) for o in BASE.objects if o.type == 'MESH'},
      'mounts', len(mounts), 'canon', canonical, round(time.time() - T0, 1), 's')
