# exec'd inside gear_build.py (after the kd-tree / nearest_weights section).
# Boots: union of two convex hulls (foot below the ankle + ankle shaft) -> voxel remesh -> smooth ->
# offset -> decimate -> open top. This removes the toes entirely (the old per-vertex offset of the
# MakeHuman foot kept toe gaps and read as socks). Plus a separate rubber sole (Polymer) per boot.
# Also pushes the trouser cuffs out over the boot shaft.
BOOT_TOP = 0.235
def join(objs, name):
    for o in bpy.context.view_layer.objects: o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    return ob

def _hull_into(bm, pts):
    vs = [bm.verts.new(tuple(p)) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.delete(bm, geom=list(set(res['geom_interior']) | set(res['geom_unused'])), context='VERTS')

def _eval_mesh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    m = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear(); old = ob.data; ob.data = m; bpy.data.meshes.remove(old)

def make_boot(s, sg):
    side = (x * sg > 0.02) & (w_leg > 0.5)
    bm = bmesh.new()
    _hull_into(bm, co[side & (z < 0.105)])
    sh = co[side & (z > 0.055) & (z < BOOT_TOP + 0.02)]
    _hull_into(bm, sh)
    m = bpy.data.meshes.new(f'Boot{s}'); bm.to_mesh(m); bm.free()
    ob = bpy.data.objects.new(f'Boot{s}', m); scn.collection.objects.link(ob)
    r = ob.modifiers.new('rm', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.004; r.adaptivity = 0.0
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.8; sm.iterations = 14
    _eval_mesh(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.0045
        if v.co.z < 0.004: v.co.z = 0.004 - (0.004 - v.co.z) * 0.15
    bm.to_mesh(ob.data); bm.free()
    d = ob.modifiers.new('dc', 'DECIMATE'); d.ratio = min(1.0, 2600 / max(1, len(ob.data.polygons)))
    _eval_mesh(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > BOOT_TOP], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(ob.data); bm.free()
    ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons))
    return ob

def make_sole(s, boot):
    P = np.array([v.co[:] for v in boot.data.vertices])
    lo = P[P[:, 2] < 0.03][:, :2]
    from scipy.spatial import ConvexHull
    hv = lo[ConvexHull(lo).vertices]
    # resample hull outline evenly, offset outward 4 mm
    seg = np.r_[hv, hv[:1]]; L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(seg, axis=0), axis=1))]
    t = np.linspace(0, L[-1], 64, endpoint=False)
    ring = np.c_[np.interp(t, L, seg[:, 0]), np.interp(t, L, seg[:, 1])]
    c = ring.mean(0); dvec = ring - c; ring = ring + dvec / np.linalg.norm(dvec, axis=1)[:, None] * 0.004
    bm = bmesh.new()
    rows = []
    for zz, sc in ((0.0, 0.997), (0.004, 1.0), (0.024, 1.0), (0.030, 0.985)):
        rows.append([bm.verts.new((c[0] + (p[0] - c[0]) * sc, c[1] + (p[1] - c[1]) * sc, zz)) for p in ring])
    n = len(ring)
    for a, b in zip(rows[:-1], rows[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    bm.faces.new(rows[0][::-1]); bm.faces.new(rows[-1])
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = bpy.data.meshes.new(f'Sole{s}'); bm.to_mesh(m); bm.free()
    m.polygons.foreach_set('use_smooth', [True] * len(m.polygons))
    ob = bpy.data.objects.new(f'Sole{s}', m); scn.collection.objects.link(ob)
    return ob

boot_objs, sole_objs = [], []
for s, sg in (('Left', 1), ('Right', -1)):
    b = make_boot(s, sg); boot_objs.append(b); sole_objs.append(make_sole(s, b))
boots = join(boot_objs, 'Boots')
# UVs (body atlas, barycentric from nearest body face), src = nearest body vertex, skin weights
bP = np.array([v.co[:] for v in boots.data.vertices])
src = [kd.find(Vector(p))[1] for p in bP]; boots['src'] = src
# own UVs (smart project) -> own baked texture set 'boots_*'
boots.data.uv_layers.new(name='UVMap')
for o in bpy.context.view_layer.objects: o.select_set(o == boots)
bpy.context.view_layer.objects.active = boots
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
bpy.ops.object.mode_set(mode='OBJECT')
set_weights(boots, nearest_weights)
for so in sole_objs: set_weights(so, nearest_weights)
boots.name = 'Boots'

# push trouser cuffs outside the boot shaft (min 5 mm clearance)
_bt = tree_of(boots)
_tm = trous.data
for v in _tm.vertices:
    if v.co.z > BOOT_TOP + 0.03: continue
    loc, n_, fi, dist = _bt.find_nearest(v.co)
    if loc is None: continue
    sd = (v.co - loc).dot(n_)
    if sd < 0.005:
        dirn = Vector((v.co.x - loc.x, v.co.y - loc.y, 0)); dirn = Vector((n_.x, n_.y, 0)) if sd < 0 or dirn.length < 1e-6 else dirn
        dirn.normalize()
        v.co = Vector((loc.x, loc.y, v.co.z)) + dirn * 0.0065 if sd < 0 else v.co + dirn * (0.005 - sd)
