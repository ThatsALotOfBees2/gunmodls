"""Shared helpers for operators/human-rig module builds (FROZEN after the design phase; see rig/DESIGN.md §4).

Typical module script (rig/build/mod_<id>.py):

    import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import common as C, matlib
    ctx = C.load_base()                              # opens rig/base/rig_base.blend (rest A-pose)
    col = C.new_collection('belt')                   # -> GEAR_belt
    ob = C.mesh_object('BELT_Sleeve', verts, faces, col)   # or C.object_from_bmesh(name, bm, col)
    C.uv_box(ob, 'MAT_Cordura'); matlib.assign(ob, ['MAT_Cordura', 'MAT_Webbing'])
    C.conform(ob, min_mm=2)                          # stay outside the base-clothing envelope
    C.skin_from_body(ob, smooth=4)                   # or C.skin_rigid(ob, 'Head'), C.skin_canonical(ob, 'front_panel')
    C.bake_vertex_ao([ob]); C.finalize(ob)
    hides = C.hidden_body_faces([ob])                # only modules that really cover skin
    C.write_module('belt', 'loadbearing', [ob], attach_bone='Hips', hides_body_faces=hides, ...)
    C.save_module('belt'); C.quick_render('belt')

Coordinates: Blender metres, Z up, character faces -Y, his left is +X, ground z = 0, rest A-pose.
"""
import os, sys, json, math, time
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, kdtree, bvhtree
from mathutils.interpolate import poly_3d_calc

BUILD = os.path.dirname(os.path.abspath(__file__))
RIG = os.path.dirname(BUILD)
H = os.path.dirname(RIG)                                    # the prototype root (venv, mh, final, ...)
BASE_BLEND = os.path.join(RIG, 'base', 'rig_base.blend')
MOUNTS_JSON = os.path.join(RIG, 'base', 'mounts.json')
MODS = os.path.join(RIG, 'mods')
sys.path.insert(0, BUILD)
import matlib  # noqa: E402

# ---------------------------------------------------------------------------------------------- registry
# id -> (group, mesh-name prefix, LOD0 triangle budget, default_on)
MODULES = {
    'body':            ('base', 'BODY', 23000, True),     # reused, lives in rig_base.blend
    'shirt':           ('base', 'SHRT', 8000, True),
    'trousers':        ('base', 'TROU', 6500, True),
    'boots':           ('base', 'BOOT', 6500, True),
    'gloves':          ('base', 'GLOV', 4500, True),
    'kneepads':        ('base', 'KNEE', 2000, True),
    'elbowpads':       ('base', 'ELBW', 1500, True),
    'carrier':         ('armor', 'CARR', 12000, True),
    'helmet':          ('armor', 'HELM', 7000, True),
    'neck_groin':      ('armor', 'NKGR', 2500, False),
    'belt':            ('loadbearing', 'BELT', 4000, True),
    'rifle_mags':      ('loadbearing', 'RMAG', 5500, True),
    'pistol_mags':     ('loadbearing', 'PMAG', 2500, True),
    'chest_rig':       ('loadbearing', 'CRIG', 8000, False),
    'dump':            ('loadbearing', 'DUMP', 1500, True),
    'ifak':            ('loadbearing', 'IFAK', 3000, True),
    'radio':           ('loadbearing', 'RADI', 3000, True),
    'admin_hydration': ('loadbearing', 'ADMN', 2500, True),
    'holster_drop':    ('sidearm_misc', 'HOLD', 4000, True),
    'holster_belt':    ('sidearm_misc', 'HOLB', 3500, False),
    'sling':           ('sidearm_misc', 'SLNG', 1500, True),
    'headset':         ('sidearm_misc', 'HSET', 3200, True),     # integration: smooth 8-sided boom + downlead (+~650 tris)
    'eyewear':         ('sidearm_misc', 'EYEW', 1500, True),
    'bang_pouches':    ('sidearm_misc', 'BANG', 1800, True),
    'knife':           ('sidearm_misc', 'KNIF', 1200, True),
    'test':            ('base', 'TEST', 5000, False),     # design-phase smoke test only
}
MAX_SLOTS = 3                                             # material slots per module mesh
TOTAL_BUDGET = 110000


def argv():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]


def log(*a):
    print(f'[{time.strftime("%H:%M:%S")}]', *a, flush=True)


# ---------------------------------------------------------------------------------------------- base
_CTX = {}


def load_base(path=BASE_BLEND):
    """open the shared base (Rig + Body + head parts + MOUNTS + PROXY collections). returns ctx dict."""
    bpy.ops.wm.open_mainfile(filepath=path)
    _CTX.clear()
    _CTX['rig'] = bpy.data.objects['Rig']
    _CTX['body'] = bpy.data.objects['Body']
    _CTX['mounts'] = json.load(open(MOUNTS_JSON)) if os.path.exists(MOUNTS_JSON) else {}
    if _CTX['mounts']: _belt_fit(_CTX['mounts'])
    return _CTX


# fixA: the design belt ring floated 5-14 mm over the trousers. Radial take-in (mm) per theta (deg), measured from
# the built trousers (target ~2.5 mm air at the inner-belt face; stiff belt: 30 deg min-window, smoothed, so it
# bridges the spine furrow). Applied in memory to rings.belt (outer + inner) and every MNT_belt_* mount, so all
# belt-mounted modules follow. mounts.json itself is unchanged.
BELT_TAKE_IN = {-180: 7.7, -170: 6.6, -160: 5.3, -150: 4.9, -140: 5.2, -130: 5.2, -120: 5.0, -110: 4.4, -100: 3.9,
                -90: 3.4, -80: 2.9, -70: 2.6, -60: 2.5, -50: 3.1, -40: 4.4, -30: 6.4, -20: 8.4, -10: 9.4, 0: 9.6,
                10: 9.5, 20: 8.4, 30: 6.1, 40: 3.7, 50: 2.5, 60: 2.4, 70: 2.5, 80: 2.6, 90: 2.9, 100: 3.2, 110: 3.8,
                120: 4.4, 130: 5.0, 140: 5.4, 150: 5.5, 160: 5.9, 170: 7.1}


def belt_take_in(theta_rad):
    d = sorted(BELT_TAKE_IN); v = [BELT_TAKE_IN[k] for k in d]
    return float(np.interp(math.degrees(theta_rad), d, v, period=360)) * 1e-3


def _belt_fit(M):
    R = M['rings']['belt']
    if R.get('_fit'): return
    th = R['theta']; c = R['center']
    for lay in ('outer', 'inner'):
        R[lay] = [r - belt_take_in(t) for r, t in zip(R[lay], th)]
    for name, m in M['mounts'].items():
        if not name.startswith('MNT_belt_'): continue
        x, y, z = m['loc']; t = math.atan2(x - c[0], -(y - c[1]))
        d = belt_take_in(t)
        m['loc'] = [x - math.sin(t) * d, y + math.cos(t) * d, z]
    R['_fit'] = True


def ctx():
    if not _CTX: raise RuntimeError('call common.load_base() first')
    return _CTX


def new_collection(mod_id):
    name = f'GEAR_{mod_id}'
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def mesh_object(name, verts, faces, col, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(); me.update()
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return ob


def object_from_bmesh(name, bm, col, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); me.update()
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return ob


def verts_np(ob):
    a = np.zeros(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def set_verts_np(ob, co):
    ob.data.vertices.foreach_set('co', np.asarray(co, dtype=float).ravel()); ob.data.update()


# ---------------------------------------------------------------------------------------------- BVHs
_BVH = {}


def body_bvh(kind='body'):
    """BVH of the rest-pose Body cage ('body') or of the base-clothing envelope ('envelope' = PRX_Envelope)."""
    if kind in _BVH: return _BVH[kind]
    ob = ctx()['body'] if kind == 'body' else bpy.data.objects['PRX_Envelope']
    me = ob.data
    t = bvhtree.BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    _BVH[kind] = t
    return t


def obj_bvh(obs):
    """one BVH over several (rest-pose, world-space) mesh objects."""
    V, F, off = [], [], 0
    for ob in obs:
        mw = ob.matrix_world
        V += [mw @ v.co for v in ob.data.vertices]
        F += [tuple(i + off for i in p.vertices) for p in ob.data.polygons]
        off += len(ob.data.vertices)
    return bvhtree.BVHTree.FromPolygons(V, F)


def body_weights():
    """(NV, G) dense weight matrix of Body + group names (deform bones only)."""
    if 'W' in _CTX: return _CTX['W'], _CTX['Wn']
    body, rig = ctx()['body'], ctx()['rig']
    names = [g.name for g in body.vertex_groups]
    W = np.zeros((len(body.data.vertices), len(names)))
    for v in body.data.vertices:
        for g in v.groups: W[v.index, g.group] = g.weight
    keep = [i for i, n in enumerate(names) if n in rig.data.bones and rig.data.bones[n].use_deform and W[:, i].max() > 0]
    _CTX['W'], _CTX['Wn'] = W[:, keep], [names[i] for i in keep]
    return _CTX['W'], _CTX['Wn']


def body_attr(name):
    me = ctx()['body'].data
    a = me.attributes[name]
    out = np.zeros(len(a.data)); a.data.foreach_get('value', out)
    return out


# ---------------------------------------------------------------------------------------------- mounts
def mount(name):
    """4x4 world matrix of a named mount (rest pose). columns: x, y (up along the surface), z (outward normal)."""
    m = ctx()['mounts']['mounts'][name]
    M = Matrix.Identity(4)
    for i, k in enumerate(('x', 'y', 'z')): M.col[i][:3] = m[k]
    M.col[3][:3] = m['loc']
    return M


def _ring_frame(ring, theta_deg, dz, layer):
    R = ctx()['mounts']['rings'][ring]
    th = np.array(R['theta']); r = np.array(R[layer]); c = R['center']        # theta stored in radians
    t = math.radians(theta_deg)
    rr = float(np.interp(t, th, r, period=2 * np.pi))
    e = 1e-3
    def p(a):
        q = float(np.interp(a, th, r, period=2 * np.pi))
        return Vector((c[0] + q * math.sin(a), c[1] - q * math.cos(a), 0))
    tan = (p(t + e) - p(t - e)).normalized()                    # increasing theta: front -> his left -> back
    up = Vector((0, 0, 1))
    nrm = tan.cross(up).normalized()
    if nrm.dot(Vector((math.sin(t), -math.cos(t), 0))) < 0: nrm = -nrm
    x = up.cross(nrm)
    M = Matrix.Identity(4)
    M.col[0][:3], M.col[1][:3], M.col[2][:3] = x, up, nrm
    M.col[3][:3] = Vector((c[0] + rr * math.sin(t), c[1] - rr * math.cos(t), R['z'] + dz))
    return M


def belt_frame(theta_deg, dz=0.0, layer='outer'):
    """frame on the battle-belt surface. theta 0 = front centre (buckle), +90 = his left hip, 180 = spine,
    -90 = right hip. dz from the belt centre line (z = rings.belt.z). layer 'outer' (PALS face) or 'inner'."""
    return _ring_frame('belt', theta_deg, dz, layer)


def cumb_frame(theta_deg, dz=0.0, layer='outer'):
    """frame on the carrier cummerbund (valid for 35 < |theta| < 145). Same conventions as belt_frame."""
    return _ring_frame('cumb', theta_deg, dz, layer)


PANEL_BEND = {'front': (0.035, 0.09, 0.012), 'back': (0.03, 0.205, 0.025)}   # (v0, slope, hinge radius)


def panel_frame(side, u, v, layer='outer'):
    """frame on the front/back plate-bag face (single-curve, radius R about the panel's vertical axis, tilted
    like the plate). u metres across in the panel's own X (front: + = his left/+X; back: + = his right/-X),
    v metres up from the panel centre. Returned columns: x = across, y = up along the panel, z = outward."""
    P = ctx()['mounts']['panels'][side]
    X, Y, Z = Vector(P['X']), Vector(P['Y']), Vector(P['Z'])
    O = Vector(P['origin_' + layer]); R = P['R']
    a = u / R
    loc = O + X * (R * math.sin(a)) - Z * (R - R * math.cos(a)) + Y * v
    nrm = (X * math.sin(a) + Z * math.cos(a)).normalized()
    x = (X * math.cos(a) - Z * math.sin(a)).normalized()
    # fixA: the lower plate bag kicks in toward the body (soft hinge; multi-curve plate + bag sag) so its bottom
    # edge sits <= ~12 mm over the shirt instead of 20-40 mm. Every module on the panel follows it.
    v0, ka, kr = PANEL_BEND[side]
    d = max(0.0, v0 - v)
    off = ka * (math.sqrt(d * d + kr * kr) - kr); slope = ka * d / math.sqrt(d * d + kr * kr)
    loc = loc - nrm * off
    y = (Y + nrm * slope).normalized()
    nrm = x.cross(y).normalized()
    M = Matrix.Identity(4)
    M.col[0][:3], M.col[1][:3], M.col[2][:3] = x, y, nrm
    M.col[3][:3] = loc
    return M


def grid_slot(side, col, row, layer='outer'):
    """centre of a laser-cut PALS slot on a plate-bag face. col 0..cols-1 left->right as seen from outside,
    row 0 = top row. pitch 38.1 mm (1.5") across, 25.4 mm (1") down."""
    G = ctx()['mounts']['panels'][side]['grid']
    u = G['u0'] + col * 0.0381          # u0 < 0: col 0 is the leftmost slot as seen from outside, both panels
    v = G['v0'] - row * 0.0254
    return panel_frame(side, u, v, layer)


# ---------------------------------------------------------------------------------------------- fitting
def conform(ob, min_mm=2.0, layer='envelope', mode='vertex', mask=None, max_dist=0.15):
    """push geometry outside `layer` ('envelope' = base clothing max, 'body' = skin) by at least min_mm.
    mode 'vertex': each vertex independently (soft goods); 'shift': translate each connected island by its
    worst penetration along the island's mean outward normal (rigid parts keep their shape).
    mask: optional bool array of vertices to consider. returns max correction in mm."""
    t = body_bvh(layer)
    co = verts_np(ob); mw = ob.matrix_world; imw = mw.inverted()
    W = np.array([mw @ Vector(c) for c in co])
    need = np.zeros(len(co)); nrm = np.zeros((len(co), 3))
    for i, p in enumerate(W):
        if mask is not None and not mask[i]: continue
        loc, n, fi, d = t.find_nearest(Vector(p), max_dist)
        if loc is None: continue
        s = (Vector(p) - loc).dot(n)
        if s < min_mm * 1e-3: need[i] = min_mm * 1e-3 - s; nrm[i] = n
    if mode == 'vertex':
        W2 = W + nrm * need[:, None]
    else:
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
        isl = np.full(len(co), -1); k = 0
        for v in bm.verts:
            if isl[v.index] >= 0: continue
            st = [v]; isl[v.index] = k
            while st:
                a = st.pop()
                for e in a.link_edges:
                    b = e.other_vert(a)
                    if isl[b.index] < 0: isl[b.index] = k; st.append(b)
            k += 1
        bm.free(); W2 = W.copy()
        for j in range(k):
            m = isl == j
            if need[m].max() <= 0: continue
            dn = nrm[m][need[m] > 0].mean(0); dn /= np.linalg.norm(dn) + 1e-9
            W2[m] += dn * need[m].max() / max(0.3, float(np.min(nrm[m][need[m] > 0] @ dn)))
    set_verts_np(ob, [imw @ Vector(p) for p in W2])
    return float(need.max() * 1e3)


def shell_offset(ob, mm):
    """push every vertex along its normal (fabric thickness for solidify-free shells)."""
    ob.data.update()
    co = verts_np(ob); n = np.array([v.normal[:] for v in ob.data.vertices])
    set_verts_np(ob, co + n * mm * 1e-3)


def surface_point(origin, direction, layer='envelope', max_dist=1.0):
    """first hit of a ray against Body ('body') or PRX_Envelope ('envelope'). returns (loc, normal) or (None, None)."""
    loc, n, fi, d = body_bvh(layer).ray_cast(Vector(origin), Vector(direction).normalized(), max_dist)
    return loc, n


def limb_ring(bone_a, bone_b, t, n=32, layer='envelope', offset_mm=2.0, ref=None):
    """ring of n surface points around the limb segment bone_a.head -> bone_b.head at parameter t (0..1),
    cast FROM THE BONE AXIS OUTWARD (casting inward from outside hits the other leg / the torso first).
    returns (points [Vector], axis_point, axis_dir). offset_mm pushes each point out along its ray."""
    bones = ctx()['rig'].data.bones
    a, b = Vector(bones[bone_a].head_local), Vector(bones[bone_b].head_local)
    ax = (b - a).normalized(); c = a + (b - a) * t
    r1 = (Vector(ref) - ax * Vector(ref).dot(ax)).normalized() if ref else ax.orthogonal().normalized()
    r2 = ax.cross(r1)
    pts = []
    for i in range(n):
        ang = 2 * math.pi * i / n; d = r1 * math.cos(ang) + r2 * math.sin(ang)
        loc, nn, fi, dist = body_bvh(layer).ray_cast(c, d, 0.4)
        if loc is None: loc = c + d * 0.05
        pts.append(loc + d * offset_mm * 1e-3)
    return pts, c, ax


# ---------------------------------------------------------------------------------------------- skinning
def _clear_groups(ob):
    for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)


def _write_weights(ob, Wv, names, limit=4):
    _clear_groups(ob)
    groups = {}
    for i in range(Wv.shape[0]):
        row = Wv[i]
        idx = np.argsort(-row)[:limit]
        tot = row[idx].sum()
        if tot <= 0: continue
        for j in idx:
            w = row[j] / tot
            if w < 1e-3: continue
            n = names[j]
            if n not in groups: groups[n] = ob.vertex_groups.new(name=n)
            groups[n].add([i], float(w), 'REPLACE')


def _adjacency(ob):
    adj = [[] for _ in ob.data.vertices]
    for e in ob.data.edges:
        a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    return adj


def sample_body_weights(points):
    """interpolated Body weights at the nearest skin point of each world point. returns (N, G), names."""
    W, names = body_weights()
    body = ctx()['body']; me = body.data; t = body_bvh('body')
    out = np.zeros((len(points), W.shape[1]))
    for i, p in enumerate(points):
        loc, n, fi, d = t.find_nearest(Vector(p))
        poly = me.polygons[fi]
        vs = [me.vertices[k].co for k in poly.vertices]
        bw = poly_3d_calc(vs, loc)
        out[i] = sum(w * W[k] for w, k in zip(bw, poly.vertices))
    return out, names


def skin_from_body(ob, smooth=2, rigid=0.0, mask=None):
    """data-transfer skinning: nearest-surface interpolated Body weights, Laplacian-smoothed `smooth` times over
    the module mesh, then blended toward the mesh-average weights by `rigid` (0 = cloth, 1 = rigid block)."""
    mw = ob.matrix_world
    pts = [mw @ v.co for v in ob.data.vertices]
    Wv, names = sample_body_weights(pts)
    if smooth:
        adj = _adjacency(ob)
        for _ in range(smooth):
            Wn = Wv.copy()
            for i, nb in enumerate(adj):
                if nb: Wn[i] = 0.5 * Wv[i] + 0.5 * Wv[nb].mean(0)
            Wv = Wn
    if rigid > 0:
        Wv = (1 - rigid) * Wv + rigid * Wv.mean(0)[None]
    if mask is not None:                                          # keep existing weights outside the mask
        raise NotImplementedError('mask: build the masked part as its own object, then join after skinning')
    _write_weights(ob, Wv, names)


def skin_from_point(ob, point):
    """every vertex gets the Body weights at `point` (a pouch rides rigidly with the skin under its mount)."""
    Wv, names = sample_body_weights([point])
    _write_weights(ob, np.repeat(Wv, len(ob.data.vertices), 0), names)


def skin_rigid(ob, bone):
    _clear_groups(ob)
    g = ob.vertex_groups.new(name=bone); g.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')


def skin_canonical(ob, key):
    """canonical weight sets shared by every module (mounts.json canonical_weights): 'front_panel',
    'back_panel', 'head'. Everything riding on the plate bags uses the same set so it moves as one piece."""
    cw = ctx()['mounts']['canonical_weights'][key]
    _clear_groups(ob)
    idx = list(range(len(ob.data.vertices)))
    for n, w in cw.items():
        ob.vertex_groups.new(name=n).add(idx, float(w), 'REPLACE')


# ---------------------------------------------------------------------------------------------- UVs
def _faces(ob, faces):
    return [ob.data.polygons[i] for i in faces] if faces is not None else list(ob.data.polygons)


def _uv_layer(ob):
    me = ob.data
    if 'UVMap' not in me.uv_layers: me.uv_layers.new(name='UVMap')
    return me.uv_layers['UVMap'].data


def uv_box(ob, mat, faces=None, offset=(0, 0)):
    """tile-unit box projection (world metres / matlib tile) for a tiling material."""
    t = matlib.tile(mat); uvd = _uv_layer(ob); mw = ob.matrix_world; n3 = mw.to_3x3()
    for p in _faces(ob, faces):
        n = n3 @ p.normal; ax = max(range(3), key=lambda k: abs(n[k]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for li in p.loop_indices:
            co = mw @ ob.data.vertices[ob.data.loops[li].vertex_index].co
            uvd[li].uv = (co[a] / t + offset[0], co[b] / t + offset[1])


def uv_cyl(ob, mat, origin, axis, faces=None):
    """tile-unit cylindrical projection around `axis` through `origin` (straps around limbs, cords, mag bodies).
    u = arc length (at each vertex's own radius), v = distance along the axis."""
    t = matlib.tile(mat); uvd = _uv_layer(ob); mw = ob.matrix_world
    o = Vector(origin); ax = Vector(axis).normalized()
    ref = ax.orthogonal().normalized(); ref2 = ax.cross(ref)
    for p in _faces(ob, faces):
        angs = []
        for li in p.loop_indices:
            d = mw @ ob.data.vertices[ob.data.loops[li].vertex_index].co - o
            h = d.dot(ax); r = (d - ax * h)
            a = math.atan2(r.dot(ref2), r.dot(ref)); angs.append((li, a, r.length, h))
        a0 = angs[0][1]
        for li, a, r, h in angs:
            while a - a0 > math.pi: a -= 2 * math.pi
            while a - a0 < -math.pi: a += 2 * math.pi
            uvd[li].uv = (a * max(r, 1e-4) / t, h / t)


def uv_trim_path(ob, row, path, faces=None, flip=False):
    """map a strap/edge strip onto a MAT_Webbing trim row. `path` = polyline (world points) along the strap
    centre; U = arc length / 0.256 m, V = signed lateral offset mapped across the row's band (row width in
    matlib.TRIM_ROWS). Vertices further out than the row half-width clamp to the row edge."""
    v0, v1, wmm = matlib.TRIM_ROWS[row]
    P = [Vector(p) for p in path]
    seg = [(P[i], P[i + 1]) for i in range(len(P) - 1)]
    acc = [0.0]
    for a, b in seg: acc.append(acc[-1] + (b - a).length)
    uvd = _uv_layer(ob); mw = ob.matrix_world
    me = ob.data; me.update()
    for p in _faces(ob, faces):
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            q = mw @ me.vertices[vi].co; nq = (mw.to_3x3() @ me.vertices[vi].normal).normalized()
            best = None
            for k, (a, b) in enumerate(seg):
                ab = b - a; L2 = max(ab.length_squared, 1e-12)
                s = max(0.0, min(1.0, (q - a).dot(ab) / L2)); c = a + ab * s
                d = (q - c).length
                if best is None or d < best[0]: best = (d, k, s, c, ab.normalized())
            d, k, s, c, tg = best
            side = tg.cross(nq)
            lat = (q - c).dot(side.normalized()) if side.length > 1e-6 else 0.0
            if flip: lat = -lat
            f = 0.5 + lat / (wmm * 1e-3)
            f = min(1.0, max(0.0, f))
            uvd[li].uv = ((acc[k] + s * (acc[k + 1] - acc[k])) / matlib.tile('MAT_Webbing'), v0 + f * (v1 - v0))


# ---------------------------------------------------------------------------------------------- AO, finish
def ensure_ao(ob):
    me = ob.data
    if 'AO' not in me.color_attributes:
        a = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
        a.data.foreach_set('color', [1.0] * (len(a.data) * 4))
    me.color_attributes.active_color = me.color_attributes['AO']
    me.color_attributes.render_color_index = list(me.color_attributes).index(me.color_attributes['AO'])
    return me.color_attributes['AO']


def bake_vertex_ao(obs, rays=24, dist=0.05, strength=0.75, include_body=True, extra=()):
    """ray-traced vertex AO into colour attribute 'AO' (multiplied into base colour by every matlib material).
    occluders: the module objects themselves + the Body (+ `extra` objects, e.g. the PRX proxies)."""
    occ = list(obs) + list(extra) + ([ctx()['body']] if include_body else [])
    T = obj_bvh(occ)
    rng = np.random.default_rng(7)
    dirs = rng.standard_normal((rays, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    for ob in obs:
        me = ob.data; me.update(); mw = ob.matrix_world; n3 = mw.to_3x3()
        occl = np.zeros(len(me.vertices))
        for v in me.vertices:
            p = mw @ v.co; n = (n3 @ v.normal).normalized()
            hit = 0; tot = 0
            for d in dirs:
                dd = Vector(d)
                c = dd.dot(n)
                if c <= 0: dd = -dd; c = -c
                tot += c
                loc, _, _, h = T.ray_cast(p + n * 6e-4, dd, dist)
                if loc is not None: hit += c * (1 - h / dist) ** 0.5
            occl[v.index] = hit / max(tot, 1e-6)
        ao = np.clip(1 - strength * occl, 0.3, 1.0)
        a = ensure_ao(ob)
        cols = np.ones((len(me.loops), 4))
        vi = np.zeros(len(me.loops), dtype=int); me.loops.foreach_get('vertex_index', vi)
        cols[:, :3] = ao[vi][:, None]
        a.data.foreach_set('color', cols.ravel())
        me.color_attributes.active_color = a
        bake_vertex_wear(ob, occl)


def _hash3(P, cell):
    """smooth-ish value noise in [0,1] from world positions (trilinear over a hashed lattice)."""
    q = P / cell; i0 = np.floor(q).astype(np.int64); f = q - i0; f = f * f * (3 - 2 * f)
    def h(ix, iy, iz):
        v = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)
        return ((v * 2654435761) % 4294967296) / 4294967296.0
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * h(i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz)
    return out


def bake_vertex_wear(ob, occl=None, max_cover=0.08):
    """fixA: colour attribute 'WEAR' (not the render/active colour; matlib reads it via an Attribute node).
    R = edge abrasion: convex dihedral on SHORT edges (bevels, binding rolls, baseplate lips, kydex mouths),
        open borders, broken up by world-space noise; scaled so <= max_cover of the area exceeds the
        shader threshold. G = dust/fading: cavities (from AO), upward faces, more the lower it sits."""
    me = ob.data; mw = ob.matrix_world
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update()
    nv = len(bm.verts); edge = np.zeros(nv)
    for e in bm.edges:
        L = e.calc_length()
        if len(e.link_faces) == 2:
            a = e.calc_face_angle_signed(0.0)
            c = np.clip(a / 1.0, 0, 1)
        elif len(e.link_faces) == 1: c = 0.6
        else: c = 0
        if c <= 0: continue
        short = np.clip(0.012 / max(L, 1e-5), 0.15, 1.0)      # long edges on big flat faces barely count
        for v in e.verts: edge[v.index] = max(edge[v.index], c * short)
    co = np.array([mw @ v.co for v in bm.verts]); nrm = np.array([(mw.to_3x3() @ v.normal).normalized() for v in bm.verts])
    area = np.zeros(nv)
    for f in bm.faces:
        A = f.calc_area() / len(f.verts)
        for v in f.verts: area[v.index] += A
    bm.free()
    nz = _hash3(co, 0.018) * 0.6 + _hash3(co + 3.1, 0.006) * 0.4
    R = edge * (0.55 + 0.9 * nz)
    # keep the worn area subtle: the shader shows R*(0.4..1.6) above ~0.45; cap coverage at max_cover
    eff = R > 0.5
    cov = (area * eff).sum() / max(area.sum(), 1e-9)
    if cov > max_cover:                                         # area-weighted quantile -> rescale
        o = np.argsort(-R); acc = np.cumsum(area[o]) / max(area.sum(), 1e-9)
        thr = R[o][min(np.searchsorted(acc, max_cover), len(o) - 1)]
        R = R * (0.5 / max(thr, 1e-6))
    cav = np.clip((occl if occl is not None else np.zeros(nv)) * 1.6, 0, 1)
    up = np.clip(nrm[:, 2], 0, 1) ** 2
    low = np.clip((1.35 - co[:, 2]) / 1.2, 0.2, 1.0)
    G = np.clip((0.6 * cav + 0.25 * up) * low * (0.6 + 0.8 * _hash3(co + 7.7, 0.04)), 0, 1)
    if 'WEAR' in me.color_attributes: me.color_attributes.remove(me.color_attributes['WEAR'])
    a = me.color_attributes.new('WEAR', 'BYTE_COLOR', 'CORNER')
    vi = np.zeros(len(me.loops), dtype=int); me.loops.foreach_get('vertex_index', vi)
    cols = np.ones((len(me.loops), 4)); cols[:, 0] = np.clip(R, 0, 1)[vi]; cols[:, 1] = G[vi]; cols[:, 2] = 0
    a.data.foreach_set('color', cols.ravel())
    ao = me.color_attributes['AO']
    me.color_attributes.active_color = ao
    me.color_attributes.render_color_index = list(me.color_attributes).index(ao)
    return float(cov)


def finalize(ob, triangulate_ngons=True):
    """contract hygiene: identity transform applied, ngons (>4) triangulated, AO attribute, <=4 normalised
    weights, parented to Rig with an 'Armature' modifier, no other modifiers."""
    rig = ctx()['rig']
    if ob.matrix_world != Matrix.Identity(4):
        ob.data.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4)
    if triangulate_ngons:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        ng = [f for f in bm.faces if len(f.verts) > 4]
        if ng: bmesh.ops.triangulate(bm, faces=ng)
        bm.to_mesh(ob.data); bm.free()
    ensure_ao(ob)
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    if ob.vertex_groups:
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    ob.parent = rig; ob.matrix_parent_inverse = Matrix.Identity(4)
    mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    ob.data.name = ob.name


# ---------------------------------------------------------------------------------------------- body masks
def hidden_body_faces(obs, max_dist=0.035, erode=1):
    """Body polygon indices (rig_base Body order) fully covered by `obs` in the rest pose: a Body vertex is
    covered when a ray along its normal hits the module within max_dist; a face is hidden when all its verts
    are covered; then `erode` rings are given back next to visible skin (hems never open a gap in motion)."""
    body = ctx()['body']; me = body.data
    T = obj_bvh(obs)
    cov = np.zeros(len(me.vertices), bool)
    for v in me.vertices:
        loc, n, fi, d = T.ray_cast(v.co - v.normal * 0.002, v.normal, max_dist)
        cov[v.index] = loc is not None
    hid = np.array([all(cov[k] for k in p.vertices) for p in me.polygons])
    v2f = [[] for _ in me.vertices]
    for p in me.polygons:
        for k in p.vertices: v2f[k].append(p.index)
    for _ in range(erode):
        vis_v = np.zeros(len(me.vertices), bool)
        for p in me.polygons:
            if not hid[p.index]:
                for k in p.vertices: vis_v[k] = True
        new = hid.copy()
        for p in me.polygons:
            if hid[p.index] and any(vis_v[k] for k in p.vertices): new[p.index] = False
        hid = new
    return [int(i) for i in np.nonzero(hid)[0]]


# ---------------------------------------------------------------------------------------------- checks
def tris(ob): return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def check_module(mod_id, obs):
    """returns a list of contract violations (empty = OK)."""
    prob = []
    grp, pre, budget, _ = MODULES[mod_id]
    rig = ctx()['rig']
    for ob in obs:
        if not ob.name.startswith(pre + '_'): prob.append(f'{ob.name}: name must start with {pre}_')
        if ob.data.name != ob.name: prob.append(f'{ob.name}: mesh data name differs')
        if ob.parent != rig: prob.append(f'{ob.name}: not parented to Rig')
        mods = [m.type for m in ob.modifiers]
        if mods != ['ARMATURE']: prob.append(f'{ob.name}: modifiers {mods} (only one Armature allowed)')
        if any(abs(a - b) > 1e-6 for r1, r2 in zip(ob.matrix_world, Matrix.Identity(4)) for a, b in zip(r1, r2)):
            prob.append(f'{ob.name}: transform not applied')
        if len(ob.data.materials) > MAX_SLOTS: prob.append(f'{ob.name}: {len(ob.data.materials)} material slots > {MAX_SLOTS}')
        for m in ob.data.materials:
            if m is None or m.name not in matlib.MATS: prob.append(f'{ob.name}: material {m.name if m else None} not in matlib')
        if 'UVMap' not in ob.data.uv_layers: prob.append(f'{ob.name}: no UVMap')
        if 'AO' not in ob.data.color_attributes: prob.append(f'{ob.name}: no AO colour attribute')
        if any(len(p.vertices) > 4 for p in ob.data.polygons): prob.append(f'{ob.name}: ngons')
        bad = [g.name for g in ob.vertex_groups if g.name not in rig.data.bones]
        if bad: prob.append(f'{ob.name}: groups not bones {bad[:4]}')
        if not ob.vertex_groups: prob.append(f'{ob.name}: not skinned')
        nz = [sum(1 for g in v.groups if g.weight > 1e-4) for v in ob.data.vertices]
        if nz and max(nz) > 4: prob.append(f'{ob.name}: >4 influences')
        if nz and min(nz) == 0: prob.append(f'{ob.name}: {nz.count(0)} unweighted verts')
    t = sum(tris(o) for o in obs)
    if t > budget * 1.05: prob.append(f'tris {t} > budget {budget}')
    return prob


def set_pose(action=None, frame=1):
    rig = ctx()['rig']
    if rig.animation_data is None: rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions[action] if action else None
    if action and rig.animation_data.action_slot is None and len(rig.animation_data.action.slots):
        rig.animation_data.action_slot = rig.animation_data.action.slots[0]
    if not action:
        for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


POSE_FRAMES = [('Ready', 1), ('Walk', 9), ('Walk', 26), ('CrouchIdle', 60), ('LookAround', 46), ('LookAround', 136)]


def penetration(obs, frames=POSE_FRAMES, tol_mm=1.0, against='Body'):
    """count module vertices that end up inside the skin (> tol_mm) in deformed poses. {frame: count}."""
    body = bpy.data.objects[against]
    sub = [m for m in body.modifiers if m.type == 'SUBSURF']
    for m in sub: m.show_viewport = False
    out = {}
    for act, fr in frames:
        set_pose(act, fr)
        dg = bpy.context.evaluated_depsgraph_get()
        be = body.evaluated_get(dg); bme = be.to_mesh()
        T = bvhtree.BVHTree.FromPolygons([v.co.copy() for v in bme.vertices], [tuple(p.vertices) for p in bme.polygons])
        be.to_mesh_clear()
        n = 0
        for ob in obs:
            oe = ob.evaluated_get(dg); me = oe.to_mesh()
            for v in me.vertices:
                loc, nn, fi, d = T.find_nearest(v.co, 0.05)
                if loc is not None and (v.co - loc).dot(nn) < -tol_mm * 1e-3: n += 1
            oe.to_mesh_clear()
        out[f'{act}:{fr}'] = n
    set_pose(None)
    for m in sub: m.show_viewport = True
    return out


# ---------------------------------------------------------------------------------------------- output
def write_module(mod_id, obs, attach_bone, hides_body_faces=(), hides_base=None, exclusive_with=(), requires=(),
                 mounts_used=(), parts=None, variants=None, default_variant=None, ground_offset_m=0.0,
                 lod_ratios=(1.0, 0.45, 0.2), notes='', pose_check=True, extra=None):
    """writes rig/mods/<id>.json (the module manifest the integrator reads). returns the dict."""
    grp, pre, budget, default_on = MODULES[mod_id]
    meshes = []
    for ob in obs:
        bones = sorted({g.name for g in ob.vertex_groups})
        meshes.append(dict(name=ob.name, tris=tris(ob), verts=len(ob.data.vertices),
                           materials=[m.name for m in ob.data.materials], bones=bones,
                           part=ob.get('part', 'main'), variant=ob.get('variant')))
    pts = np.concatenate([verts_np(o) for o in obs]) if obs else np.zeros((1, 3))
    var_tris = {}
    for m in meshes:
        if m['variant']: var_tris[m['variant']] = var_tris.get(m['variant'], 0) + m['tris']
    common_t = sum(m['tris'] for m in meshes if not m['variant'])
    worst = common_t + (max(var_tris.values()) if var_tris else 0)
    d = dict(id=mod_id, group=grp, collection=f'GEAR_{mod_id}', blend=f'mods/{mod_id}.blend', default_on=default_on,
             tris=worst, tris_budget=budget, verts=int(sum(m['verts'] for m in meshes)),
             materials=sorted({x for m in meshes for x in m['materials']}), meshes=meshes,
             attach_bone=attach_bone, mounts_used=list(mounts_used), requires=list(requires),
             exclusive_with=list(exclusive_with), parts=parts or {'main': {'default': True, 'requires': []}},
             variants=variants or {}, default_variant=default_variant,
             hides_body_faces=sorted(int(i) for i in hides_body_faces), hides_base=hides_base or {},
             ground_offset_m=ground_offset_m, lod_ratios=list(lod_ratios),
             bbox=[pts.min(0).round(4).tolist(), pts.max(0).round(4).tolist()],
             problems=check_module(mod_id, obs), notes=notes, built=time.strftime('%Y-%m-%d %H:%M:%S'))
    if pose_check: d['penetration'] = penetration(obs)
    if extra: d.update(extra)
    os.makedirs(MODS, exist_ok=True)
    json.dump(d, open(os.path.join(MODS, f'{mod_id}.json'), 'w'), indent=1)
    log('module', mod_id, 'tris', worst, '/', budget, 'problems', d['problems'])
    return d


def save_module(mod_id):
    p = os.path.join(MODS, f'{mod_id}.blend')
    set_pose(None)
    bpy.ops.wm.save_as_mainfile(filepath=p, compress=True)
    if os.path.exists(p + '1'): os.remove(p + '1')
    log('saved', p)
    return p


def load_module(mod_id):
    """append GEAR_<id> from rig/mods/<id>.blend into the open base (for renders / fit checks against another
    module). rebinds parents + armature modifiers to this file's Rig. returns the objects (or [] if missing)."""
    p = os.path.join(MODS, f'{mod_id}.blend')
    if not os.path.exists(p): return []
    name = f'GEAR_{mod_id}'
    if name in bpy.data.collections: return list(bpy.data.collections[name].objects)
    with bpy.data.libraries.load(p, link=False) as (src, dst):
        dst.collections = [name]
    col = dst.collections[0]
    bpy.context.scene.collection.children.link(col)
    rig = ctx()['rig']
    for ob in col.objects:
        ob.parent = rig; ob.matrix_parent_inverse = Matrix.Identity(4)
        for m in ob.modifiers:
            if m.type == 'ARMATURE': m.object = rig
    for o in list(bpy.data.objects):                              # stray Rig copies dragged in by the append
        if o.type == 'ARMATURE' and o != rig and o.users_collection == (): bpy.data.objects.remove(o)
    return list(col.objects)


# ---------------------------------------------------------------------------------------------- quick render
def quick_render(mod_id, out=None, views=('front34', 'back34'), res=960, samples=16, with_mods=(), focus=None,
                 show_proxies=(), full_body=False, threads=2):
    """cheap Cycles check render of GEAR_<id> on the body (Workbench/EEVEE have no GPU context headless).
    Writes one PNG with the views side by side (default rig/mods/<id>.png). with_mods: other module ids to
    append if their .blend exists (else the matching PRX_* proxy is shown in a ghost material when listed in
    show_proxies). focus: (center, size) override; full_body frames the whole character."""
    from PIL import Image
    scn = bpy.context.scene
    obs = list(bpy.data.collections[f'GEAR_{mod_id}'].objects)
    for m in with_mods: obs_extra = load_module(m)
    for o in bpy.data.objects:
        if o.name.startswith('PRX_'):
            o.hide_render = o.name not in show_proxies
    ghost = bpy.data.materials.get('PRX_Ghost') or bpy.data.materials.new('PRX_Ghost')
    ghost.use_nodes = True
    gb = ghost.node_tree.nodes['Principled BSDF']; gb.inputs['Base Color'].default_value = (0.25, 0.22, 0.35, 1)
    gb.inputs['Roughness'].default_value = 0.6
    for n in show_proxies:
        o = bpy.data.objects.get(n)
        if o: o.data.materials.clear(); o.data.materials.append(ghost)
    body = ctx()['body']
    for m in body.modifiers:
        if m.type == 'SUBSURF': m.show_render = False
    r = scn.render
    r.engine = 'CYCLES'; scn.cycles.device = 'CPU'; scn.cycles.samples = samples
    scn.cycles.use_denoising = True; scn.cycles.use_adaptive_sampling = True
    scn.cycles.max_bounces = 4
    r.threads_mode = 'FIXED'; r.threads = threads
    r.film_transparent = False; r.image_settings.file_format = 'PNG'
    scn.view_settings.view_transform = 'AgX'
    for o in [o for o in scn.objects if o.type in ('LIGHT', 'CAMERA') or o.name == 'QR_Floor']:
        bpy.data.objects.remove(o)
    w = bpy.data.worlds.get('QR_World') or bpy.data.worlds.new('QR_World'); scn.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.42, 0.45, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    fme = bpy.data.meshes.new('QR_Floor')
    fme.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
    fl = bpy.data.objects.new('QR_Floor', fme); scn.collection.objects.link(fl)
    fm = bpy.data.materials.get('QR_Floor') or bpy.data.materials.new('QR_Floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.16, 0.17, 1)
    fme.materials.append(fm)
    def area(name, loc, power, size, col=(1, 1, 1)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = power; ld.size = size; ld.color = col
        o = bpy.data.objects.new(name, ld); scn.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 1.1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    area('QR_Key', (-2.6, -3.2, 3.4), 300, 2.0, (1, 0.97, 0.93)); area('QR_Fill', (3.0, -2.8, 1.6), 90, 2.5)
    area('QR_RimL', (-2.2, 2.6, 2.6), 170, 1.2); area('QR_RimR', (2.4, 2.4, 2.2), 140, 1.2)
    if full_body or not obs:
        c, size = Vector((0, -0.03, 0.9)), 2.0
    elif focus:
        c, size = Vector(focus[0]), focus[1]
    else:
        P = np.concatenate([verts_np(o) for o in obs])
        lo, hi = P.min(0), P.max(0)
        c = Vector(((lo + hi) / 2).tolist()); size = max(0.3, float((hi - lo).max()) * 1.35)
    dirs = {'front': Vector((0, -1, 0.05)), 'front34': Vector((-1, -1.1, 0.25)), 'side_l': Vector((1, 0, 0.1)),
            'side_r': Vector((-1, 0, 0.1)), 'back34': Vector((1, 1.1, 0.3)), 'back': Vector((0, 1, 0.1)),
            'top': Vector((0.05, -0.3, 1))}
    tiles = []
    out = out or os.path.join(MODS, f'{mod_id}.png')
    for vname in views:
        cd = bpy.data.cameras.new('QR_Cam'); cd.lens = 85; cd.sensor_width = 36
        cam = bpy.data.objects.new('QR_Cam', cd); scn.collection.objects.link(cam)
        d = dirs[vname].normalized(); dist = size / 2 / math.tan(cd.angle / 2)
        cam.location = c + d * dist
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cd.clip_start = 0.02; cd.clip_end = 100
        scn.camera = cam
        r.resolution_x = r.resolution_y = res
        tmp = out[:-4] + f'_{vname}.png'
        r.filepath = tmp
        t = time.time(); bpy.ops.render.render(write_still=True); log('render', vname, round(time.time() - t, 1), 's')
        tiles.append(Image.open(tmp).convert('RGB')); os.remove(tmp)
        bpy.data.objects.remove(cam)
    sheet = Image.new('RGB', (res * len(tiles), res))
    for i, im in enumerate(tiles): sheet.paste(im, (i * res, 0))
    sheet.save(out)
    log('wrote', out)
    return out
