"""Stage 3: clothing + plate carrier fitted to the base body.

Run:  $H/venv/bin/python $H/build/gear_build.py [--base base/human_base.blend] [--no-bake] [--no-export]
Out:  $H/gear/human_gear.blend, human_gear.glb (base res), human_gear_hero.glb (subdiv applied),
      gear/textures/*.png, gear/hidden_body_faces.json, gear/gear_report.json

Integrator hook: everything is derived from the base .blend only (Body/Rig/Eyes/Mouth), never edits
base scripts. `hidden_body_faces.json` lists Body polygon indices (base mesh order) deleted under clothing.
"""
import os, sys, json, math, time
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, kdtree, bvhtree

T0 = time.time()
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
BASE = argv[argv.index('--base') + 1] if '--base' in argv else os.path.join(H, 'base', 'human_base.blend')
TEX = os.path.join(H, 'gear', 'textures')          # baked gear maps always live here
OUT = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(H, 'gear')   # blend/glb/report
os.makedirs(OUT, exist_ok=True)
os.makedirs(TEX, exist_ok=True)
BAKE = '--no-bake' not in argv
BAKE_RES = 2048

bpy.ops.wm.open_mainfile(filepath=BASE)
scn = bpy.context.scene
rig = bpy.data.objects['Rig']; body = bpy.data.objects['Body']
for o in list(scn.objects):
    if o.name == 'Eyelashes': bpy.data.objects.remove(o)
me = body.data
NV = len(me.vertices)
co = np.array([v.co[:] for v in me.vertices]); nrm = np.array([v.normal[:] for v in me.vertices])
faces = [tuple(p.vertices) for p in me.polygons]
uvl = me.uv_layers['UVMap'].data
face_uv = [[tuple(uvl[li].uv) for li in p.loop_indices] for p in me.polygons]
gnames = [g.name for g in body.vertex_groups]
W = [dict() for _ in range(NV)]
for v in me.vertices:
    for g in v.groups:
        if g.weight > 1e-4: W[v.index][gnames[g.group]] = g.weight
adj = [set() for _ in range(NV)]
for e in me.edges:
    a, b = e.vertices; adj[a].add(b); adj[b].add(a)

def wsum(keys):
    return np.array([sum(w for n, w in W[i].items() if any(k in n for k in keys)) for i in range(NV)])
w_hand = wsum(['Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Little', 'metacarpal'])
w_leg = wsum(['UpperLeg', 'LowerLeg', 'Foot', 'Toes', 'toe', 'pelvis'])
w_arm = wsum(['UpperArm', 'LowerArm'])
w_head = wsum(['Head', 'Jaw', 'Eye', 'Neck', 'neck', 'oris', 'levator', 'orbicularis', 'tongue', 'temporalis',
               'eyebrows', 'cheek', 'nose', 'risorius', 'mandible', 'special', 'lip'])
x, y, z = co[:, 0], co[:, 1], co[:, 2]

def bone(n, end='head'):
    b = rig.data.bones[n]; return np.array(b.head_local if end == 'head' else b.tail_local)
# forearm parameter t (0 at elbow, 1 at wrist) per side
t_arm = np.zeros(NV); t_up = np.zeros(NV)
for s, sg in (('Left', 1), ('Right', -1)):
    e, h, sh = bone(f'{s}LowerArm'), bone(f'{s}Hand'), bone(f'{s}UpperArm')
    m = (x * sg) > 0.12
    d = h - e; t_arm[m] = ((co[m] - e) @ d) / (d @ d)
    d2 = e - sh; t_up[m] = ((co[m] - sh) @ d2) / (d2 @ d2)

def smooth01(a): a = np.clip(a, 0, 1); return a * a * (3 - 2 * a)
# ---------------------------------------------------------------- region masks (per body vertex)
not_head = w_head < 0.5
m_glove = (w_hand > 0.5) | ((w_arm > 0.3) & (t_arm > 0.84))
w_skull = wsum(['Head', 'Jaw', 'Eye', 'oris', 'levator', 'orbicularis', 'tongue', 'temporalis', 'eyebrows', 'cheek', 'nose',
                'risorius', 'mandible', 'special', 'lip'])
def collar_z(yy, xx=0.0):
    # crew collar: low front, higher back; rises away from the neck so the cut follows the trapezius slope
    r = np.sqrt(np.asarray(xx) ** 2 + (np.asarray(yy) + 0.01) ** 2)
    return 1.522 + 0.042 * smooth01((yy + 0.02) / 0.09) + 0.85 * np.maximum(0.0, r - 0.072)
m_sleeve_torso = (z > 0.92) & (z < collar_z(y, x)) & (w_skull < 0.3) & (w_hand < 0.25) & (w_leg < 0.6) & ~((w_arm > 0.3) & (t_arm > 0.92))
m_shirt = m_sleeve_torso
m_trous = (z < 1.05) & (z > 0.165) & (w_hand < 0.05) & (w_arm < 0.05) & (np.abs(x) < 0.33)
m_boot = (z < 0.225) & (w_leg > 0.5)

def fbm3(p, scale, octaves=3):
    from mathutils import noise
    return np.array([noise.fractal(Vector(q * scale), 0.6, 2.0, octaves) for q in p])


# ---------------------------------------------------------------- offsets (fit + folds)
n_lo = fbm3(co, 9.0); n_hi = fbm3(co, 31.0)
off_shirt = 0.0045 + 0.0015 * n_lo
sleeve = (w_arm > 0.3)
# sleeves looser, folds bunched near elbow and above the cuff
off_shirt = np.where(sleeve, 0.0075 + 0.002 * n_lo, off_shirt)
el = np.exp(-((t_arm) / 0.22) ** 2) * (t_arm > -0.35)
cuff = smooth01((t_arm - 0.55) / 0.3)
fold_s = np.sin((t_arm * 0.28 / 0.03) * 2 * np.pi + n_hi * 4) * (0.5 + 0.5 * n_lo)
off_shirt = off_shirt + sleeve * (el * 0.0035 + cuff * 0.003) * (0.6 + 0.4 * fold_s)
# shirt blousing just above the belt
off_shirt = off_shirt + 0.006 * smooth01((1.10 - z) / 0.1) * (z > 0.92) * (0.6 + 0.4 * np.sin(np.arctan2(y, x) * 9 + n_lo * 3))

off_shirt = off_shirt + 0.0025 * smooth01((z - (collar_z(y, x) - 0.03)) / 0.02) * (w_arm < 0.3)

off_tr = 0.010 + 0.006 * smooth01((0.95 - z) / 0.2) - 0.004 * smooth01((z - 0.95) / 0.07)
off_tr += 0.0025 * n_lo
knee_z = bone('LeftLowerLeg')[2]
kn = np.exp(-((z - knee_z) / 0.06) ** 2)
ank = smooth01((0.34 - z) / 0.16)
fold_t = np.sin(z / 0.028 * 2 * np.pi + n_hi * 5 + np.arctan2(y, x) * 1.5)
off_tr += (kn * 0.003 + ank * 0.006) * (0.55 + 0.45 * fold_t) + ank * 0.004
# crotch / inner thigh: pull in so legs don't fuse
off_tr -= 0.004 * smooth01((np.abs(x) - 0.03) / -0.03 + 1) * (z < 0.9)

off_glove = 0.0022 + 0.0006 * n_hi
off_boot = 0.0075 + 0.004 * smooth01((z - 0.15) / 0.03)

# ---------------------------------------------------------------- mesh builder
def build_layer(name, vmask, off, extra=None, hem=0.0025, mat_slots=None, snap=None):
    keep = [fi for fi, f in enumerate(faces) if all(vmask[v] for v in f)]
    used = sorted({v for fi in keep for v in faces[fi]})
    rm = {v: i for i, v in enumerate(used)}
    P = co[used] + nrm[used] * off[used][:, None]
    if extra is not None: P = extra(P, np.array(used))
    F = [tuple(rm[v] for v in faces[fi]) for fi in keep]
    U = [face_uv[fi] for fi in keep]
    src = list(used)
    if snap is not None:
        ec = {}
        for f in F:
            for k in range(len(f)):
                e = frozenset((f[k], f[(k + 1) % len(f)])); ec[e] = ec.get(e, 0) + 1
        bverts = np.array(sorted({v for e, c in ec.items() if c == 1 for v in e}))
        P[bverts] = snap(P[bverts], co[np.array(used)[bverts]])
    if hem:
        ecount = {}
        for fi, f in zip(keep, F):
            for k in range(len(f)):
                a, b = f[k], f[(k + 1) % len(f)]
                ecount.setdefault(frozenset((a, b)), []).append((a, b, fi, k))
        inner = {}
        Pl = list(P)
        for key, lst in ecount.items():
            if len(lst) != 1: continue
            a, b, fi, k = lst[0]
            for v in (a, b):
                if v not in inner:
                    inner[v] = len(Pl); Pl.append(P[v] - nrm[src[v]] * (off[src[v]] + hem)); src.append(src[v])
            uva = face_uv[fi][k]; uvb = face_uv[fi][(k + 1) % len(faces[fi])]
            F.append((b, a, inner[a], inner[b])); U.append([uvb, uva, uva, uvb])
        P = np.array(Pl)
    m = bpy.data.meshes.new(name)
    m.from_pydata([tuple(p) for p in P], [], F)
    uv = m.uv_layers.new(name='UVMap')
    li = 0
    for f, us in zip(F, U):
        for u in us: uv.data[li].uv = u; li += 1
    m.polygons.foreach_set('use_smooth', [True] * len(m.polygons))
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    for i, sv in enumerate(src):
        for gn, w in W[sv].items():
            vg = ob.vertex_groups.get(gn) or ob.vertex_groups.new(name=gn)
            vg.add([i], w, 'REPLACE')
    ob['src'] = src
    return ob, keep, np.array(src)

def boot_shape(P, idx):
    zz = co[idx, 2]
    low = smooth01((0.045 - zz) / 0.045)
    hn = nrm[idx].copy(); hn[:, 2] = 0
    hn /= np.maximum(np.linalg.norm(hn, axis=1)[:, None], 1e-6)
    P = P + hn * (0.006 * low)[:, None]
    P[:, 2] -= 0.016 * low
    # flat tread
    P[:, 2] = np.where(P[:, 2] < -0.008, -0.016, P[:, 2])
    return P

def neck_snap(P, C):
    m = P[:, 2] > 1.42
    P[m, 2] = collar_z(P[m, 1], P[m, 0])
    return P
shirt, k_shirt, _ = build_layer('Shirt', m_shirt, off_shirt, snap=neck_snap)
trous, k_tr, _ = build_layer('Trousers', m_trous, off_tr)
gloves, k_gl, _ = build_layer('Gloves', m_glove, off_glove, hem=0.002)
# boots: built later in gear_boots.py (hull + voxel remesh)

# patches: cargo pockets, knee pads, elbow pads (dome offsets on top of the garment)
def ellipse_patch(name, center, axis_n, axis_u, ru, rv, base_off, height, power=0.6, flat=False, nmin=0.25):
    c = np.array(center); n = np.array(axis_n) / np.linalg.norm(axis_n); u = np.array(axis_u)
    u = u - n * (u @ n); u /= np.linalg.norm(u); v = np.cross(n, u)
    d = co - c
    du, dv = d @ u / ru, d @ v / rv
    r = np.maximum(np.abs(du), np.abs(dv)) if flat else np.sqrt(du ** 2 + dv ** 2)
    m = (r < 1.0) & (nrm @ n > nmin) & (np.abs(d @ n) < 0.08)
    prof = (1 - np.clip(r, 0, 1) ** 2) ** power if not flat else smooth01((1 - r) / 0.12)
    off = base_off + 0.0025 + height * prof
    ob, _, _ = build_layer(name, m, off, hem=0.003)
    return ob

def surf_point(origin, direction, tree):
    hit = tree.ray_cast(Vector(origin), Vector(direction))
    return np.array(hit[0]) if hit[0] else None

def tree_of(ob):
    m = ob.data
    return bvhtree.BVHTree.FromPolygons([v.co[:] for v in m.vertices], [p.vertices[:] for p in m.polygons])

body_tree = bvhtree.BVHTree.FromPolygons([tuple(p) for p in co], faces)
pads = []
for s, sg in (('Left', 1), ('Right', -1)):
    kz = bone(f'{s}LowerLeg')
    kp = surf_point((kz[0], -0.6, kz[2] + 0.015), (0, 1, 0), body_tree)
    pads.append(('knee', s, kp, (0, -1, 0.05), (0, 0, 1), 0.072, 0.056, 0.016))
    e, sh, hnd = bone(f'{s}LowerArm'), bone(f'{s}UpperArm'), bone(f'{s}Hand')
    du = (e - sh) / np.linalg.norm(e - sh); df = (hnd - e) / np.linalg.norm(hnd - e)
    dn = du - df; dn /= np.linalg.norm(dn)
    ep = surf_point(e + dn * 0.3, -dn, body_tree)
    pads.append(('elbow', s, ep, dn, df, 0.058, 0.044, 0.011))
    # cargo pocket, outer thigh
    cz = 0.70; cp = surf_point((sg * 0.6, 0.0, cz), (-sg, 0, 0), body_tree)
    pk = ellipse_patch(f'CargoPocket{s}', cp, (sg, 0, 0), (0, 0, 1), 0.085, 0.075, off_tr, 0.006, flat=True, nmin=0.35)
    pk['cloth'] = 1
    pads.append(pk)

def dome_pad(name, tree, c, n, u, ru, rv, h, nr=7, na=28, base=0.0025):
    c = np.array(c); n = np.array(n, float); n /= np.linalg.norm(n); u = np.array(u, float)
    u = u - n * (u @ n); u /= np.linalg.norm(u); v = np.cross(n, u)
    bm = bmesh.new(); G = {}
    for layer in (0, 1):
        for i in range(nr + 1):
            r = i / nr
            for j in range(na if i else 1):
                a = 2 * math.pi * j / na
                q = c + (u * ru * math.cos(a) + v * rv * math.sin(a)) * r
                hit = tree.ray_cast(Vector(q + n * 0.15), Vector(-n))
                p = np.array(hit[0]) if hit[0] else q
                t = base + (h * (1 - r ** 2.2) ** 0.55 + 0.004 if layer else 0.0)
                G[layer, i, j] = bm.verts.new(tuple(p + n * t))
    for layer in (0, 1):
        for i in range(nr):
            for j in range(na):
                j2 = (j + 1) % na
                if i == 0: q = [G[layer, 0, 0], G[layer, 1, j], G[layer, 1, j2]]
                else: q = [G[layer, i, j], G[layer, i + 1, j], G[layer, i + 1, j2], G[layer, i, j2]]
                if layer == 0: q = q[::-1]
                bm.faces.new(q)
    for j in range(na):
        j2 = (j + 1) % na
        bm.faces.new([G[0, nr, j], G[0, nr, j2], G[1, nr, j2], G[1, nr, j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    edges = [e for e in bm.edges if e.calc_face_angle(0) > math.radians(55)]
    bmesh.ops.bevel(bm, geom=edges, offset=0.003, segments=2, affect='EDGES')
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    m.polygons.foreach_set('use_smooth', [True] * len(m.polygons))
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    return ob
_tr_tree = tree_of(trous); _sh_tree = tree_of(shirt)
_pads = []
for item in pads:
    if isinstance(item, tuple):
        kind, s_, c_, n_, u_, ru, rv, hh = item
        _pads.append(dome_pad(f'{kind.title()}Pad{s_}', _tr_tree if kind == 'knee' else _sh_tree, c_, n_, u_, ru, rv, hh))
    else: _pads.append(item)
pads = _pads
# ---------------------------------------------------------------- hidden body faces (eroded union)
cover = m_shirt | m_trous | m_glove | m_boot
er = cover.copy()
for _ in range(2):
    nb = er.copy()
    for i in np.where(er)[0]:
        if not all(er[j] for j in adj[i]): nb[i] = False
    er = nb
hidden = [fi for fi, f in enumerate(faces) if all(er[v] for v in f)]

# ---------------------------------------------------------------- plate carrier (procedural)
shirt_tree = tree_of(shirt)
def plate(name, side, zc, Wd=0.27, Hh=0.345, T=0.028, R=0.34, gap=0.013, cut=(0.06, 0.075)):
    # side = -1 front (camera -y), +1 back. Curved bag following a cylinder fitted to the shirt.
    NX, NZ = 15, 19
    zs = np.linspace(zc - Hh / 2, zc + Hh / 2, NZ)
    def half(zv):
        k = np.clip((zv - (zc + Hh / 2 - cut[1])) / cut[1], 0, 1)
        return Wd / 2 - cut[0] * k
    samples = []
    for zv in zs[::2]:
        for xv in np.linspace(-half(zv), half(zv), 9):
            p = surf_point((xv, side * 0.8, zv), (0, -side, 0), shirt_tree)
            if p is not None: samples.append((xv, zv, p[1]))
    S = np.array(samples)
    # surface: y = y0 + b (z-zc) - side * x^2/2R  (sides curve toward the body)
    A = np.c_[np.ones(len(S)), S[:, 1] - zc]
    yy = S[:, 2] + side * S[:, 0] ** 2 / (2 * R)
    b = np.linalg.lstsq(A, yy, rcond=None)[0][1]
    resid = yy - b * (S[:, 1] - zc)
    y0 = (resid.min() - gap) if side < 0 else (resid.max() + gap)
    def ysurf(xv, zv, t):
        return y0 + b * (zv - zc) - side * xv ** 2 / (2 * R) + side * t
    bm = bmesh.new()
    grid = {}
    for layer, t in ((0, 0.0), (1, T)):
        for j, zv in enumerate(zs):
            hw = half(zv)
            for i, xv in enumerate(np.linspace(-hw, hw, NX)):
                grid[layer, i, j] = bm.verts.new((xv, ysurf(xv, zv, t), zv))
    for layer in (0, 1):
        for j in range(NZ - 1):
            for i in range(NX - 1):
                q = [grid[layer, i, j], grid[layer, i + 1, j], grid[layer, i + 1, j + 1], grid[layer, i, j + 1]]
                if (layer == 1) == (side < 0): q = q[::-1]
                bm.faces.new(q)
    ring = [(i, 0) for i in range(NX - 1)] + [(NX - 1, j) for j in range(NZ - 1)] + \
           [(i, NZ - 1) for i in range(NX - 1, 0, -1)] + [(0, j) for j in range(NZ - 1, 0, -1)]
    for k in range(len(ring)):
        a, c2 = ring[k], ring[(k + 1) % len(ring)]
        q = [grid[0, a[0], a[1]], grid[0, c2[0], c2[1]], grid[1, c2[0], c2[1]], grid[1, a[0], a[1]]]
        if side > 0: q = q[::-1]
        bm.faces.new(q)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    edges = [e for e in bm.edges if e.calc_face_angle(0) > math.radians(50)]
    bmesh.ops.bevel(bm, geom=edges, offset=0.0055, segments=3, affect='EDGES', profile=0.5)
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    m.polygons.foreach_set('use_smooth', [True] * len(m.polygons))
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    info = dict(y0=y0, b=b, R=R, zc=zc, T=T, side=side, half=half, Hh=Hh, Wd=Wd, ysurf=ysurf)
    return ob, info

front, FI = plate('PlateFront', -1, 1.272)
back, BI = plate('PlateBack', +1, 1.295, cut=(0.045, 0.06))

def plate_frame(I, xv, zv):
    p = np.array((xv, I['ysurf'](xv, zv, I['T']), zv))
    fx = -I['side'] * xv / I['R']; fz = I['b']
    n = np.array((-fx, -1.0, -fz)) * (1 if I['side'] < 0 else -1)
    n /= np.linalg.norm(n)
    up = np.array((0, 0, 1.0)); up -= n * (up @ n); up /= np.linalg.norm(up)
    return p, n, up

# ring band around the shirt/trousers (cummerbund, belt)
def ring_band(name, src_tree, z0, z1, off, thick, nth=72, nz=7, ycen=None):
    bm = bmesh.new(); G = {}
    zs = np.linspace(z0, z1, nz)
    for j, zv in enumerate(zs):
        f = surf_point((0.0013, -0.8, zv), (0, 1, 0), src_tree); bk = surf_point((0.0013, 0.8, zv), (0, -1, 0), src_tree)
        yc = ((f[1] + bk[1]) / 2 if (f is not None and bk is not None) else 0.0) if ycen is None else ycen
        for i in range(nth):
            a = 2 * math.pi * i / nth
            d = np.array((math.sin(a), -math.cos(a), 0))
            p = surf_point((0, yc, zv), d, src_tree)
            if p is None: p = np.array((0, yc, zv)) + d * 0.15
            for layer, t in ((0, off), (1, off + thick)):
                G[layer, i, j] = bm.verts.new(tuple(p + d * t))
    for layer in (0, 1):
        for j in range(nz - 1):
            for i in range(nth):
                q = [G[layer, i, j], G[layer, (i + 1) % nth, j], G[layer, (i + 1) % nth, j + 1], G[layer, i, j + 1]]
                if layer == 0: q = q[::-1]
                bm.faces.new(q)
    for j, flip in ((0, False), (nz - 1, True)):
        for i in range(nth):
            q = [G[0, i, j], G[0, (i + 1) % nth, j], G[1, (i + 1) % nth, j], G[1, i, j]]
            if flip: q = q[::-1]
            bm.faces.new(q)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    edges = [e for e in bm.edges if e.calc_face_angle(0) > math.radians(60)]
    bmesh.ops.bevel(bm, geom=edges, offset=min(0.003, thick * 0.4), segments=2, affect='EDGES')
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    m.polygons.foreach_set('use_smooth', [True] * len(m.polygons))
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    return ob

cummer = ring_band('Cummerbund', shirt_tree, 1.115, 1.275, 0.002, 0.009)
tr_tree = tree_of(trous)
belt = ring_band('Belt', tr_tree, 0.975, 1.017, 0.001, 0.006, nth=72, nz=4)

# shoulder straps: arcs over the trapezius from front plate top to back plate top
def strap(name, xs, wid=0.052, off=0.002, thick=0.013, nphi=34):
    zc_ = 1.39
    f = surf_point((xs, -0.8, zc_), (0, 1, 0), shirt_tree); bk = surf_point((xs, 0.8, zc_), (0, -1, 0), shirt_tree)
    yc = (f[1] + bk[1]) / 2
    bm = bmesh.new(); G = {}
    phis = np.radians(np.linspace(-18, 198, nphi))
    cols = np.linspace(-wid / 2, wid / 2, 4)
    for j, ph in enumerate(phis):
        d = np.array((0, -math.cos(ph), math.sin(ph)))
        for i, dx in enumerate(cols):
            p = surf_point((xs + dx, yc, zc_), d, shirt_tree)
            if p is None: p = np.array((xs + dx, yc, zc_)) + d * 0.1
            for layer, t in ((0, off), (1, off + thick * (1 - 0.35 * (abs(dx) / (wid / 2)) ** 2))):
                G[layer, i, j] = bm.verts.new(tuple(p + d * t))
    for layer in (0, 1):
        for j in range(nphi - 1):
            for i in range(3):
                q = [G[layer, i, j], G[layer, i + 1, j], G[layer, i + 1, j + 1], G[layer, i, j + 1]]
                if layer == 1: q = q[::-1]
                bm.faces.new(q)
    for j in range(nphi - 1):
        for i, flip in ((0, False), (3, True)):
            q = [G[0, i, j], G[0, i, j + 1], G[1, i, j + 1], G[1, i, j]]
            if flip: q = q[::-1]
            bm.faces.new(q)
    for j, flip in ((0, False), (nphi - 1, True)):
        for i in range(3):
            q = [G[0, i, j], G[1, i, j], G[1, i + 1, j], G[0, i + 1, j]]
            if flip: q = q[::-1]
            bm.faces.new(q)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    m.polygons.foreach_set('use_smooth', [True] * len(m.polygons))
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    return ob

straps = [strap('StrapL', 0.094), strap('StrapR', -0.094)]

# boxes (pouches, mags, buckles, radio...) on a local frame
def box(name, center, n, up, w, h, d, bev=0.006, seg=3, taper=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= w; v.co.z *= h; v.co.y *= d
        if taper and v.co.y < 0: v.co.x *= (1 - taper); v.co.z *= (1 - taper * 0.5)
    if bev:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bev, d * 0.45, w * 0.45, h * 0.45), segments=seg, affect='EDGES', profile=0.55)
    n = np.array(n) / np.linalg.norm(n); up = np.array(up); up = up - n * (up @ n); up /= np.linalg.norm(up)
    xr = np.cross(n, up)  # local X
    M = Matrix(((xr[0], -n[0], up[0], center[0]), (xr[1], -n[1], up[1], center[1]), (xr[2], -n[2], up[2], center[2]), (0, 0, 0, 1)))
    # local -Y faces outward (n): we built with y in [-d/2,d/2]; shift so back face sits on the surface
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, -d / 2, 0))
    bm.transform(M)
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    for p in m.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    return ob

def cyl(name, p0, p1, r, seg=12):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r * 0.8, depth=1.0)
    d = Vector(p1) - Vector(p0)
    M = Matrix.Translation((Vector(p0) + Vector(p1)) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4() @ Matrix.Diagonal((1, 1, d.length, 1))
    bm.transform(M)
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    for p in m.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    return ob

parts = {'cordura': [], 'polymer': [], 'metal': [], 'led': []}
zb = FI['zc'] - FI['Hh'] / 2
# three rifle-mag pouches, low on the front plate, mags showing at the top
for k, xv in enumerate((-0.082, 0.0, 0.082)):
    p, n, up = plate_frame(FI, xv, zb + 0.075)
    parts['cordura'].append(box(f'MagPouch{k}', p, n, up, 0.078, 0.118, 0.034, bev=0.007))
    pt, nt, upt = plate_frame(FI, xv, zb + 0.128)
    parts['cordura'].append(box(f'MagBand{k}', pt - nt * 0.0, nt, upt, 0.081, 0.024, 0.037, bev=0.005))
    pm, _, _ = plate_frame(FI, xv, zb + 0.152)
    parts['polymer'].append(box(f'MagTop{k}', pm + n * 0.004, n, up, 0.066, 0.052, 0.026, bev=0.006))
    parts['polymer'].append(box(f'MagBase{k}', pm + n * 0.0025 + up * 0.026, n, up, 0.072, 0.009, 0.031, bev=0.003))
    parts['polymer'].append(box(f'PullTab{k}', pm + n * 0.012 + up * 0.035 - up * 0.0, n, up, 0.022, 0.016, 0.006, bev=0.0025))
# admin pouch above the mags
p, n, up = plate_frame(FI, 0.0, zb + 0.235)
parts['cordura'].append(box('AdminPouch', p, n, up, 0.19, 0.095, 0.022, bev=0.006))
parts['metal'].append(box('AdminZip', p + n * 0.0215 + up * 0.036, n, up, 0.17, 0.0035, 0.002, bev=0.0008, seg=1))
parts['metal'].append(box('AdminZipPull', p + n * 0.022 + up * 0.03 + np.cross(n, up) * 0.07, n, up, 0.008, 0.016, 0.003, bev=0.001, seg=1))
# side pouches on the cummerbund: radio (left), medical (right)
cb_tree = tree_of(cummer)
for s, sg in (('L', 1), ('R', -1)):
    a = math.radians(98)
    d = np.array((sg * math.sin(a), -math.cos(a), 0))
    zp = 1.205
    hit = cb_tree.ray_cast(Vector((0.6 * d[0], 0.6 * d[1], zp)), Vector(-d))
    p = np.array(hit[0]); n = np.array(hit[1])
    if s == 'L':
        parts['cordura'].append(box('RadioPouch', p, n, (0, 0, 1), 0.072, 0.15, 0.042, bev=0.007))
        top = p + n * 0.023 + np.array((0, 0, 0.075))
        parts['polymer'].append(box('Radio', top, n, (0, 0, 1), 0.062, 0.05, 0.034, bev=0.005))
        parts['polymer'].append(cyl('RadioKnob', top + np.array((0, 0, 0.022)) + n * 0.008, top + np.array((0, 0, 0.038)) + n * 0.008, 0.007))
        parts['polymer'].append(cyl('Antenna', top + np.array((0, 0, 0.02)) - n * 0.004, top + np.array((0.0, 0.035, 0.20)), 0.0055, seg=10))
        parts['led'].append(box('RadioLED', top + n * 0.0345 + np.array((0, 0, 0.012)), n, (0, 0, 1), 0.012, 0.004, 0.0015, bev=0.0006, seg=1))
    else:
        parts['cordura'].append(box('MedPouch', p, n, (0, 0, 1), 0.13, 0.11, 0.058, bev=0.014, seg=4))
        for k, dz in enumerate((0.02, -0.02)):
            parts['polymer'].append(box(f'MedHandle{k}', p + n * 0.059 + np.array((0, 0, dz)), n, (0, 0, 1), 0.05, 0.009, 0.006, bev=0.002))
# buckles where the shoulder straps meet the front plate; LED strip on the left strap
for s, xs in (('L', 0.094), ('R', -0.094)):
    p, n, up = plate_frame(FI, xs * 0.92, FI['zc'] + FI['Hh'] / 2 - 0.012)
    parts['metal'].append(box(f'StrapBuckle{s}', p + n * 0.002, n, up, 0.05, 0.026, 0.006, bev=0.0015))
    parts['cordura'].append(box(f'StrapPadEnd{s}', p - n * 0.001 - up * 0.02, n, up, 0.06, 0.04, 0.008, bev=0.004))
hitL = tree_of(straps[0]).ray_cast(Vector((0.094, -0.8, 1.47)), Vector((0, 1, 0.0)))
pL = np.array(hitL[0]); nL = np.array(hitL[1])
parts['led'].append(box('StrapLED', pL - nL * 0.0005, nL, (0, 0.35, 1), 0.006, 0.04, 0.002, bev=0.0008, seg=1))
# belt buckle
bh = tr_tree.ray_cast(Vector((0.0013, -0.8, 0.996)), Vector((0, 1, 0)))
parts['metal'].append(box('BeltBuckle', np.array(bh[0]) + np.array((0, -0.006, 0)), (0, -1, 0.0), (0, 0, 1), 0.05, 0.038, 0.008, bev=0.003))
# back: small utility pouch + grab handle
p, n, up = plate_frame(BI, 0.0, BI['zc'] - 0.06)
parts['cordura'].append(box('BackPouch', p, n, up, 0.17, 0.12, 0.03, bev=0.008))
p, n, up = plate_frame(BI, 0.0, BI['zc'] + BI['Hh'] / 2 - 0.03)
parts['cordura'].append(box('DragHandle', p, n, up, 0.11, 0.022, 0.012, bev=0.005))

# ---------------------------------------------------------------- weights for procedural parts
kd = kdtree.KDTree(NV)
for i, p in enumerate(co): kd.insert(p, i)
kd.balance()
def nearest_weights(p, k=6):
    acc = {}
    for (q, i, dist) in kd.find_n(Vector(p), k):
        w = 1.0 / max(dist, 0.004)
        for g, ww in W[i].items(): acc[g] = acc.get(g, 0) + ww * w
    s = sum(acc.values()); return {g: v / s for g, v in acc.items()}
def set_weights(ob, fn):
    for v in ob.data.vertices:
        for g, w in fn(ob.matrix_world @ v.co).items():
            vg = ob.vertex_groups.get(g) or ob.vertex_groups.new(name=g); vg.add([v.index], w, 'REPLACE')
RIGID_FRONT = {'Chest': 0.45, 'spine02': 0.3, 'UpperChest': 0.25}
RIGID_BACK = {'Chest': 0.45, 'spine02': 0.3, 'UpperChest': 0.25}
for ob in (front, back): set_weights(ob, lambda p: RIGID_FRONT)
for ob in [cummer, belt] + straps + [p for p in pads if not p.get('cloth')]: set_weights(ob, nearest_weights)
for kind, lst in parts.items():
    for ob in lst:
        if ob.name.startswith(('Radio', 'Antenna', 'MedPouch', 'MedHandle')):
            c = np.mean([v.co[:] for v in ob.data.vertices], 0); wfix = nearest_weights(c, 12)
            set_weights(ob, lambda p, w=wfix: w)
        elif ob.name.startswith('Belt'):
            set_weights(ob, nearest_weights)
        else:
            set_weights(ob, lambda p: RIGID_FRONT)

exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gear_boots.py')).read())
# ---------------------------------------------------------------- attributes for the bake shaders
def add_attr(ob, name, vals):
    a = ob.data.attributes.new(name, 'FLOAT', 'POINT'); a.data.foreach_set('value', np.asarray(vals, dtype=np.float32))
cloth_objs = [shirt, trous, gloves] + [p for p in pads if p.get('cloth')]
pad_objs = [p for p in pads if not p.get('cloth')] + sole_objs
for ob in cloth_objs + [boots]:
    src = np.array(ob['src']); P = np.array([v.co[:] for v in ob.data.vertices])
    zz = P[:, 2]
    dust = np.clip(smooth01((0.55 - zz) / 0.45) * 0.85 + 0.25 * kn[src] + 0.1, 0, 1)
    if ob.name == 'Boots': dust = np.clip(0.55 + smooth01((0.08 - zz) / 0.08) * 0.45, 0, 1)
    if ob.name in ('Shirt', 'Gloves'): dust = 0.08 + 0.15 * smooth01((1.2 - zz) / 0.3)
    add_attr(ob, 'dust', dust)
    # seam distance field (metres): side seams, inseam/outseam, armhole, cuffs, waistband, boot welt
    seam = np.full(len(P), 1.0)
    if ob.name == 'Shirt':
        yc = 0.01
        seam = np.where(w_arm[src] < 0.3, np.abs(P[:, 1] - yc) + 0.04 * (np.abs(P[:, 0]) < 0.08), 1.0)
        seam = np.minimum(seam, np.abs(w_arm[src] - 0.5) * 0.05)
        seam = np.minimum(seam, np.where(w_arm[src] > 0.3, np.abs(t_arm[src] - 0.80) * 0.25, 1.0))
    elif ob.name == 'Trousers':
        lc = np.where(P[:, 0] > 0, 1, -1) * 0.1
        seam = np.where(zz < 0.88, np.abs(P[:, 1] - (-0.01 + 0.0 * zz)), 1.0)
        seam = np.minimum(seam, np.abs(zz - 0.975))
        seam = np.minimum(seam, np.abs(zz - 0.16) + 0.0)
    elif ob.name == 'Boots':
        seam = np.minimum(np.abs(zz - 0.012), np.abs(zz - 0.075) + 0.002)
    elif ob.name == 'Gloves':
        seam = np.where(t_arm[src] > 0.84, np.abs(t_arm[src] - 0.93) * 0.25, 1.0)
    add_attr(ob, 'seam', seam)
    add_attr(ob, 'zpos', zz)
    add_attr(ob, 'gid', np.full(len(P), {'Shirt': 0, 'Trousers': 1, 'Gloves': 2, 'Boots': 3}.get(ob.name, 1 if ob.get('cloth') else 5), dtype=float))

# MOLLE coordinates (metres) + panel mask for carrier parts
def molle_attrs(ob, mode):
    P = np.array([v.co[:] for v in ob.data.vertices]); Nn = np.array([v.normal[:] for v in ob.data.vertices])
    if mode == 'front' or mode == 'back':
        I = FI if mode == 'front' else BI
        u = P[:, 0]; vv = P[:, 2]
        outer = (Nn[:, 1] * I['side'] > 0.75) & (np.abs(P[:, 1] - I['ysurf'](P[:, 0], P[:, 2], I['T'])) < 0.006)
        hw = np.array([I['half'](q) for q in vv])
        inside = (np.abs(u) < hw - 0.022) & (vv > I['zc'] - I['Hh'] / 2 + 0.02) & (vv < I['zc'] + I['Hh'] / 2 - 0.045)
        mask = (outer & inside).astype(float)
    elif mode == 'ring':
        ang = np.arctan2(P[:, 0], -P[:, 1]); u = ang * 0.17; vv = P[:, 2]
        outer = (np.sum(Nn[:, :2] * np.c_[P[:, 0], P[:, 1]], 1) > 0)
        mask = (outer & (np.abs(np.abs(ang) - math.pi / 2) < 0.9) & (vv > 1.13) & (vv < 1.26)).astype(float)
    else:
        u = np.zeros(len(P)); vv = np.zeros(len(P)); mask = np.zeros(len(P))
    add_attr(ob, 'mask', mask)
    uvm = ob.data.uv_layers.new(name='MolleUV')
    for p in ob.data.polygons:
        for li, vi in zip(p.loop_indices, p.vertices): uvm.data[li].uv = (u[vi], vv[vi])
molle_attrs(front, 'front'); molle_attrs(back, 'back'); molle_attrs(cummer, 'ring')
for ob in [belt] + straps + parts['cordura']: molle_attrs(ob, 'none')

# ---------------------------------------------------------------- join into export objects
def join(objs, name):
    for o in bpy.context.view_layer.objects: o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    return ob

def material(name, color, rough, metal=0.0, emit=None):
    mt = bpy.data.materials.new(name); mt.use_nodes = True
    bs = mt.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*color, 1); bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if emit:
        bs.inputs['Emission Color'].default_value = (*emit, 1); bs.inputs['Emission Strength'].default_value = 6.0
    return mt
M_POLY = material('Polymer', (0.022, 0.022, 0.024), 0.62)
M_METAL = material('Metal', (0.16, 0.16, 0.17), 0.42, metal=0.85)
M_LED = material('LED', (0.25, 0.15, 0.6), 0.3, emit=(0.254, 0.074, 1.0))   # #8a4dff in linear
for o in pad_objs: o.data.materials.append(M_POLY)

uniform = join(cloth_objs, 'Uniform')
pads_ob = join(pad_objs, 'Pads')
carrier_cloth = join([front, back, cummer, belt] + straps + parts['cordura'], 'CarrierSoft')
for o in parts['polymer']: o.data.materials.append(M_POLY)
for o in parts['metal']: o.data.materials.append(M_METAL)
for o in parts['led']: o.data.materials.append(M_LED)
hard = join(parts['polymer'] + parts['metal'] + parts['led'], 'CarrierHard')
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gear_finish.py')).read())
