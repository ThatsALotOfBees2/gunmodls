"""Stage 3b helper: strand geometry for eyebrows and eyelashes (thin tapered ribbons, skinned).

Called from head_build.apply(); can also be used on its own inside a Blender session:
    import head_strands; head_strands.brows(body, rig, 'head/textures/brow_roots.npz'); head_strands.lashes(lash_helper, rig)
Every hair is a 4-segment ribbon (8 tris) facing the skin normal, root sunk 0.15 mm into the
subdivided skin surface, weights copied from the nearest skin / lash-helper vertex.
"""
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
from mathutils import Vector

SEG = 4

def _ribbon_mesh(name, paths, widths, normals, rig, src_obj, src_co, mat):
    """paths (H,S+1,3), widths (H,S+1), normals (H,3) -> skinned mesh object copying weights from src."""
    Hn, S1, _ = paths.shape
    d = np.gradient(paths, axis=1)
    side = np.cross(normals[:, None, :], d)
    side /= np.linalg.norm(side, axis=2, keepdims=True) + 1e-12
    L = paths - side * widths[..., None] / 2
    R = paths + side * widths[..., None] / 2
    verts = np.stack([L, R], 2).reshape(-1, 3)              # (H*(S+1)*2)
    faces = []
    for h in range(Hn):
        b = h * S1 * 2
        for s in range(S1 - 1):
            a = b + s * 2
            faces.append((a, a + 1, a + 3, a + 2))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces)
    # UV: u across, v along the hair (root 0 -> tip 1), handy for a gradient in engine
    uvl = me.uv_layers.new(name='UVMap')
    uv = np.zeros((len(me.loops), 2), np.float32)
    lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    local = lv % (S1 * 2)
    uv[:, 0] = local % 2; uv[:, 1] = (local // 2) / (S1 - 1)
    uvl.data.foreach_set('uv', uv.ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    for c in src_obj.users_collection: c.objects.link(ob)
    ob.parent = rig; ob.matrix_world = src_obj.matrix_world.copy()
    mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    # weights: per hair, copy the nearest source vertex's groups (root)
    roots = paths[:, 0]
    idx = np.array([int(np.argmin(np.sum((src_co - r) ** 2, 1))) for r in roots])
    gname = {g.index: g.name for g in src_obj.vertex_groups}
    groups = {}
    for h in range(Hn):
        sv = src_obj.data.vertices[int(idx[h])]
        vids = list(range(h * S1 * 2, (h + 1) * S1 * 2))
        for ge in sv.groups:
            if ge.weight <= 1e-4: continue
            n = gname[ge.group]
            if n not in groups: groups[n] = ob.vertex_groups.new(name=n)
            groups[n].add(vids, ge.weight, 'REPLACE')
    return ob

def _hair_mat(name, color, rough):
    old = bpy.data.materials.get(name)
    if old: old.name = name + '_old'
    mt = bpy.data.materials.new(name); mt.use_nodes = True
    bs = mt.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Specular IOR Level'].default_value = 0.45
    bs.inputs['Coat Weight'].default_value = 0.0
    mt.use_backface_culling = False
    return mt

def _surface_bvh(body):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    co = [v.co.copy() for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return BVHTree.FromPolygons(co, polys)

def brows(body, rig, roots_npz, seed=7):
    d = np.load(roots_npz)
    P, N, F, T, M = d['pos'], d['nrm'], d['flow'], d['t'], d['m']
    rng = np.random.default_rng(seed)
    bvh = _surface_bvh(body)
    Hn = len(P)
    paths = np.zeros((Hn, SEG + 1, 3)); nrms = np.zeros((Hn, 3)); widths = np.zeros((Hn, SEG + 1))
    for i in range(Hn):
        loc, n, _, _ = bvh.find_nearest(Vector(P[i]))
        if loc is None: loc, n = Vector(P[i]), Vector(N[i])
        n = np.array(n); n /= np.linalg.norm(n)
        f = F[i] - n * np.dot(F[i], n); f /= np.linalg.norm(f) + 1e-9
        side = np.cross(n, f)
        ang = rng.normal(0, 0.28)                                   # +-16 deg scatter
        f = f * np.cos(ang) + side * np.sin(ang)
        # inner brow: short, upright; body: longer, flatter; tail: short again
        t = T[i]
        L = (0.0045 + 0.0025 * np.sin(np.pi * min(t * 1.2, 1.0))) * rng.uniform(0.7, 1.1)
        lift = 0.14 + 0.18 * (1 - min(t * 3, 1))                    # initial elevation
        s = np.linspace(0, 1, SEG + 1)
        h = L * (lift * s - (lift * 0.9) * s ** 2) + 0.00012 - 0.00025 * (s == 0)
        bend = side[None] * (rng.normal(0, 0.12) * L * s ** 2)[:, None]
        paths[i] = np.array(loc)[None] + f[None] * (L * s)[:, None] + n[None] * h[:, None] + bend
        nrms[i] = n
        widths[i] = (0.00011 * rng.uniform(0.8, 1.2)) * (1 - 0.8 * s ** 1.2)
    mt = _hair_mat('BrowHair', (0.034, 0.024, 0.018), 0.42)
    co = np.array([v.co[:] for v in body.data.vertices])
    return _ribbon_mesh('Brows', paths, widths, nrms, rig, body, co, mt)

def lashes(helper, rig, seed=11, eye_names=('LeftEye', 'RightEye')):
    """Strand lashes grown along the MakeHuman lash helper strips (4 strips: upper/lower x L/R)."""
    import bmesh
    me = helper.data
    co = np.array([v.co[:] for v in me.vertices])
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    comp = -np.ones(len(co), int); c = 0
    for v in bm.verts:
        if comp[v.index] >= 0: continue
        st = [v]; comp[v.index] = c
        while st:
            w = st.pop()
            for e in w.link_edges:
                o = e.other_vert(w)
                if comp[o.index] < 0: comp[o.index] = c; st.append(o)
        c += 1
    bm.free()
    eyes = [np.array(rig.data.bones[n].head_local[:]) for n in eye_names]
    rng = np.random.default_rng(seed)
    allp, alln, allw = [], [], []
    for k in range(c):
        m = co[comp == k]
        e = eyes[0] if m[:, 0].mean() > 0 else eyes[1]
        upper = m[:, 2].max() > e[2] + 0.002          # upper strips reach ~4 mm above the eye centre
        rel = m - e
        ang = np.arctan2(rel[:, 2], rel[:, 0])
        dist = np.linalg.norm(rel, axis=1)
        # base/tip polylines vs angle
        bins = np.linspace(ang.min(), ang.max(), 14)
        ba, bb, bt = [], [], []
        for a0, a1 in zip(bins[:-1], bins[1:]):
            s = (ang >= a0) & (ang <= a1)
            if s.sum() < 2: continue
            ba.append(ang[s].mean()); bb.append(m[s][np.argmin(dist[s])]); bt.append(m[s][np.argmax(dist[s])])
        ba = np.array(ba); o = np.argsort(ba); ba = ba[o]; bb = np.array(bb)[o]; bt = np.array(bt)[o]
        n_l = 120 if upper else 40
        for j in range(n_l):
            u = (j + rng.uniform(0.1, 0.9)) / n_l
            a = ba[0] + (ba[-1] - ba[0]) * (0.03 + 0.94 * u)
            root = np.array([np.interp(a, ba, bb[:, q]) for q in range(3)])
            tip = np.array([np.interp(a, ba, bt[:, q]) for q in range(3)])
            dvec = tip - root
            # length: longest at the centre of the lid, short at the corners
            prof = np.sin(np.pi * (0.08 + 0.84 * u)) ** 0.7
            L = np.linalg.norm(dvec) * (0.85 + 0.45 * prof) * rng.uniform(0.75, 1.1) * (1.15 if upper else 0.55)
            dirn = dvec / (np.linalg.norm(dvec) + 1e-9)
            fwd = np.array([0, -1.0, 0])
            up = np.array([0, 0, 1.0 if upper else -1.0])
            # lashes leave the lid forward, then curl away from the eye (up for upper, down for lower)
            dirn = dirn * 0.55 + fwd * 0.45; dirn /= np.linalg.norm(dirn)
            s = np.linspace(0, 1, SEG + 1)
            curl = (up * L * 0.38 + rng.normal(0, 0.06, 3) * L)[None] * (s ** 2)[:, None]
            path = root[None] + dirn[None] * (L * s)[:, None] + curl
            path = path - dirn[None] * 0.0004                        # root inside the lid margin
            # clumping: pull towards neighbours' common tip every ~4 lashes
            nrm = np.cross(dirn, np.array([1.0, 0, 0])); nrm /= np.linalg.norm(nrm) + 1e-9
            allp.append(path); alln.append(nrm)
            allw.append((0.000085 if upper else 0.00006) * rng.uniform(0.8, 1.2) * (1 - 0.85 * s ** 1.3))
    mt = _hair_mat('LashHair', (0.018, 0.014, 0.012), 0.38)
    return _ribbon_mesh('Lashes', np.array(allp), np.array(allw), np.array(alln), rig, helper, co, mt)
