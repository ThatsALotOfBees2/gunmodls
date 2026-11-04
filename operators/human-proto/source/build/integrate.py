"""Stage 4: integrate body + head + gear into the game character (called by build_all.py).

Run:  $H/venv/bin/python $H/build/integrate.py [--stage final/stage/human_gear.blend] [--out final] [--no-export]
In:   the combined blend from head_build.py + gear_build.py (Body/Rig/Eyes/Mouth/hair/brows/lashes/gear)
Does: game textures (JPEG, 2K/1K) + realtime material fixes; animation clips (anim.py);
      poke-through check across clip frames and fix (inner layer pushed in); LOD1/LOD2 meshes;
      saves final/human_proto.blend and exports
        final/human-proto.glb        LOD0 + all clips + game textures
        final/human-proto_lods.glb   LOD0/1/2 meshes (*_LOD0/1/2) + clips (Unity copy)
        final/human-proto_web.glb    same as _lods with web textures (viewer source, before gltfpack)
      final/report.json (tris per LOD, clips, poke-through counts)
"""
import os, sys, json, time, math, argparse
import numpy as np
import bpy, bmesh
from mathutils import Vector, bvhtree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anim

T0 = time.time()
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--stage', default=os.path.join(H, 'final', 'stage', 'human_gear.blend'))
ap.add_argument('--out', default=os.path.join(H, 'final'))
ap.add_argument('--no-export', action='store_true')
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
OUT = a.out; os.makedirs(OUT, exist_ok=True)
REPORT = {}

bpy.ops.wm.open_mainfile(filepath=a.stage)
scn = bpy.context.scene
objs = bpy.data.objects
rig = objs['Rig']
for o in list(objs):            # helper never ships
    if o.name == 'LashHelper': bpy.data.objects.remove(o)

# ------------------------------------------------------------------ 1. game textures
from PIL import Image
TEXSETS = {
    # name: (source, game size, web size, mode)
    'skin_basecolor': (f'{H}/head/textures/skin_basecolor.jpg', 2048, 2048, 'RGB'),
    'skin_normal':    (f'{H}/head/textures/skin_normal.jpg', 2048, 1024, 'RGB'),
    'skin_orm':       (f'{H}/head/textures/skin_orm.jpg', 2048, 1024, 'RGB'),
    'hair_rgba':      (f'{H}/head/textures/hair_rgba.png', 2048, 1024, 'RGBA'),
    'eye_basecolor':  (f'{H}/head/textures/eye_basecolor.png', 1024, 512, 'RGB'),
    'clothing_albedo': (f'{H}/gear/textures/clothing_albedo.png', 2048, 1024, 'RGB'),
    'clothing_normal': (f'{H}/gear/textures/clothing_normal.png', 2048, 1024, 'RGB'),
    'cordura_albedo':  (f'{H}/gear/textures/cordura_albedo.png', 2048, 1024, 'RGB'),
    'cordura_normal':  (f'{H}/gear/textures/cordura_normal.png', 2048, 1024, 'RGB'),
    'boots_albedo':    (f'{H}/gear/textures/boots_albedo.png', 1024, 512, 'RGB'),
    'boots_normal':    (f'{H}/gear/textures/boots_normal.png', 1024, 512, 'RGB'),
}
ROUGH = {'clothing_orm': f'{H}/gear/textures/clothing_rough.png', 'cordura_orm': f'{H}/gear/textures/cordura_rough.png',
         'boots_orm': f'{H}/gear/textures/boots_rough.png'}
TDIR = {'game': os.path.join(OUT, 'textures'), 'web': os.path.join(OUT, 'textures_web')}
for d in TDIR.values(): os.makedirs(d, exist_ok=True)


def write_tex(name, im, kind, size):
    im = im.resize((size, size), Image.LANCZOS) if im.size[0] != size else im
    if im.mode == 'RGBA':
        p = os.path.join(TDIR[kind], name + '.png'); im.save(p, optimize=True)
    else:
        p = os.path.join(TDIR[kind], name + '.jpg'); im.convert('RGB').save(p, quality=88 if 'normal' not in name else 92)
    return p


TEXPATH = {'game': {}, 'web': {}}
for name, (src, gs, ws, mode) in TEXSETS.items():
    im = Image.open(src).convert(mode)
    TEXPATH['game'][name] = write_tex(name, im, 'game', gs)
    TEXPATH['web'][name] = write_tex(name, im, 'web', ws)
for name, src in ROUGH.items():          # glTF metallicRoughness: R=1 (no AO), G=roughness, B=metal 0
    r = Image.open(src).convert('L')
    orm = Image.merge('RGB', (Image.new('L', r.size, 255), r, Image.new('L', r.size, 0)))
    gs = 1024 if name.startswith('boots') else 2048
    TEXPATH['game'][name] = write_tex(name, orm, 'game', gs)
    TEXPATH['web'][name] = write_tex(name, orm, 'web', gs // 2)


def img(name, kind='game'):
    p = TEXPATH[kind][name]
    im = bpy.data.images.load(p, check_existing=True)
    if 'normal' in name or 'orm' in name: im.colorspace_settings.name = 'Non-Color'
    return im


def retarget_images(kind):
    """point every texture node at the game/web copies (same image datablocks, new files)."""
    for m in bpy.data.materials:
        if not m.node_tree: continue
        for n in m.node_tree.nodes:
            if n.type != 'TEX_IMAGE' or not n.image: continue
            key = n.get('tex_key')
            if key:
                n.image = img(key, kind)


def gear_material(mt, prefix):
    """swap the gear material onto JPEG albedo/normal + packed ORM (so glTF needs no repacking)."""
    nt = mt.node_tree; N, L = nt.nodes, nt.links
    bs = N['Principled BSDF']
    for n in list(N):
        if n.type == 'TEX_IMAGE':
            nm = n.image.name
            if 'albedo' in nm: n.image = img(prefix + '_albedo'); n['tex_key'] = prefix + '_albedo'
            elif 'normal' in nm: n.image = img(prefix + '_normal'); n['tex_key'] = prefix + '_normal'
            elif 'rough' in nm:
                n.image = img(prefix + '_orm'); n['tex_key'] = prefix + '_orm'
                sep = N.new('ShaderNodeSeparateColor'); L.new(n.outputs['Color'], sep.inputs['Color'])
                L.new(sep.outputs['Green'], bs.inputs['Roughness']); L.new(sep.outputs['Blue'], bs.inputs['Metallic'])
    for n in N:
        if n.type == 'NORMAL_MAP': n.inputs['Strength'].default_value = 1.0


M = bpy.data.materials
gear_material(M['Clothing'], 'clothing'); gear_material(M['Cordura'], 'cordura'); gear_material(M['Boots'], 'boots')
for mname, key in (('Skin', None), ('Eyes', 'eye_basecolor')):
    for n in M[mname].node_tree.nodes:
        if n.type == 'TEX_IMAGE':
            k = key or next(k for k in ('skin_basecolor', 'skin_normal', 'skin_orm') if k in n.image.name)
            n.image = img(k); n['tex_key'] = k
for m in M:
    if m.name.startswith('Hair') and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE': n.image = img('hair_rgba'); n['tex_key'] = 'hair_rgba'
# realtime cornea: thin clear alpha-blended shell (no transmission: glTFast / mobile have none)
bc = M['Cornea'].node_tree.nodes['Principled BSDF']
bc.inputs['Transmission Weight'].default_value = 0.0
bc.inputs['Alpha'].default_value = 0.12
bc.inputs['Roughness'].default_value = 0.02
bc.inputs['Specular IOR Level'].default_value = 1.0
M['Cornea'].surface_render_method = 'BLENDED'
M['Cornea'].use_backface_culling = True
# Polymer: tiny value lift so it separates from Cordura in realtime; LED stays the only emissive
M['Polymer'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.62

# ------------------------------------------------------------------ 2. animation
acts = anim.build_clips(rig)
REPORT['clips'] = {n: {'frames': int(round(T * anim.FPS)) + 1, 'seconds': T, 'loop': True} for n, T in anim.CLIPS.items()}
print('clips', list(acts), round(time.time() - T0, 1), 's', flush=True)

# ------------------------------------------------------------------ 2b. collar: shirt follows the skin exactly
def copy_weights_near(dst, src, mask, k=3):
    """dst verts in mask get the inverse-distance blend of the k nearest src vertices' weights."""
    from mathutils import kdtree
    sme = src.data; gn = {g.index: g.name for g in src.vertex_groups}
    # only neck/torso skin can lend weights: never the jaw, head or face (a collar on Jaw pulls spikes)
    ok = [v for v in sme.vertices if v.co.z < 1.585 and
          sum(g.weight for g in v.groups if gn[g.group] in ('Head', 'Jaw', 'neck03') or gn[g.group].startswith(('oris', 'levator', 'special', 'mandible'))) < 0.05]
    kd = kdtree.KDTree(len(ok))
    for v in ok: kd.insert(v.co, v.index)
    kd.balance()
    for i in np.nonzero(mask)[0]:
        v = dst.data.vertices[int(i)]
        acc = {}
        for co, j, d in kd.find_n(v.co, k):
            wgt = 1.0 / max(d, 1e-4)
            for g in sme.vertices[j].groups:
                acc[gn[g.group]] = acc.get(gn[g.group], 0.0) + wgt * g.weight
        tot = sum(acc.values())
        top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]; tt = sum(w for _, w in top)
        for g in list(v.groups): dst.vertex_groups[g.group].remove([v.index])
        for nm, wv in top:
            vg = dst.vertex_groups.get(nm) or dst.vertex_groups.new(name=nm)
            vg.add([v.index], wv / tt, 'REPLACE')


_u = objs['Uniform']; _b = objs['Body']
_ubm = bmesh.new(); _ubm.from_mesh(_u.data)
_ucol = np.array([v.co.z > 1.40 and any(e.is_boundary for e in v.link_edges) for v in _ubm.verts])
_ubm.free()
_uco = np.array([v.co[:] for v in _u.data.vertices])
_cpts = _uco[_ucol]
_dcol = np.array([np.min(np.linalg.norm(_cpts - c, axis=1)) for c in _uco]) if len(_cpts) else np.full(len(_uco), 9.0)
copy_weights_near(_u, _b, (_dcol < 0.07) & (_uco[:, 2] > 1.30))
REPORT['collar_reweighted_verts'] = int(((_dcol < 0.07) & (_uco[:, 2] > 1.30)).sum())
# skin right under the collar band sinks 2.5 mm (hidden by the band, keeps clear when shrugging)
_bco = np.array([v.co[:] for v in _b.data.vertices])
from mathutils import kdtree as _kdt
_ukd = _kdt.KDTree(len(_uco))
for i, c in enumerate(_uco): _ukd.insert(Vector(c), i)
_ukd.balance()
SINK_COLLAR_SKIN = False      # off: sinking opened slivers at the throat; the collar re-weight is enough
_n = 0
for i, c in enumerate(_bco):
    if c[2] < 1.40: continue
    co_u, j, d = _ukd.find(Vector(c))
    if SINK_COLLAR_SKIN and d < 0.02 and _dcol[j] < 0.05 and _dcol[j] > 0.004:
        v = _b.data.vertices[i]; nrm = _u.data.vertices[j].normal
        if (v.co - co_u).dot(nrm) < 0.004:
            v.co -= nrm * 0.0025 * min(1.0, (_dcol[j] - 0.004) / 0.008); _n += 1
_b.data.update(); REPORT['collar_skin_sunk'] = _n

# ------------------------------------------------------------------ 3. poke-through check + fix
GEAR_LAYERS = [('Body', 'Uniform', 'shell', 0.025), ('Uniform', 'CarrierSoft', 'solid', 0.03),
               ('Uniform', 'Pads', 'solid', 0.02), ('Body', 'CarrierSoft', 'solid', 0.03)]
CHECK_FRAMES = [(c, f) for c in anim.CLIPS for f in (1, int(anim.CLIPS[c] * anim.FPS * 0.25) + 1,
                                                     int(anim.CLIPS[c] * anim.FPS * 0.5) + 1,
                                                     int(anim.CLIPS[c] * anim.FPS * 0.75) + 1)]


def set_clip(name, frame):
    rig.animation_data.action = bpy.data.actions[name] if name else None
    scn.frame_set(frame)
    if not name:
        for pb in rig.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    bpy.context.view_layer.update()


def evaluated(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg); me = ev.to_mesh()
    co = np.array([v.co[:] for v in me.vertices]); nr = np.array([v.normal[:] for v in me.vertices])
    tris = [tuple(t.vertices) for t in me.loop_triangles] if me.loop_triangles else None
    if tris is None:
        me.calc_loop_triangles(); tris = [tuple(t.vertices) for t in me.loop_triangles]
    ev.to_mesh_clear()
    return co, nr, tris


subs = {}
for o in objs:
    if o.type == 'MESH' and 'Subdiv' in o.modifiers:
        subs[o.name] = o.modifiers['Subdiv'].show_viewport; o.modifiers['Subdiv'].show_viewport = False


def poke_scan(frames):
    worst = {}
    counts = {}
    for clip, f in frames:
        set_clip(clip, f)
        cache = {}
        for inner, outer, kind, rad in GEAR_LAYERS:
            if inner not in cache: cache[inner] = evaluated(objs[inner])
            if outer not in cache: cache[outer] = evaluated(objs[outer])
            ci, ni, _ = cache[inner]; co, no, to = cache[outer]
            tree = bvhtree.BVHTree.FromPolygons([Vector(p) for p in co], to)
            key = (inner, outer)
            w = worst.setdefault(key, np.zeros(len(ci)))
            n = 0
            for i, p in enumerate(ci):
                hit = tree.find_nearest(Vector(p), rad)
                if hit[0] is None: continue
                d = Vector(p) - hit[0]
                s = d.dot(hit[1])
                depth = s if kind == 'shell' else -s      # shell: inner must stay under; solid: never inside
                if kind == 'solid' and Vector(ni[i]).dot(hit[1]) > 0.3 and s < 0:
                    pass                                    # inner vertex behind the outer's front face
                if depth > 0.0005:
                    # 'solid': only count real penetration (inside the volume, close to the surface)
                    if kind == 'solid' and depth > 0.012: continue
                    w[i] = max(w[i], depth); n += 1
            counts.setdefault(f'{inner}>{outer}', {})[f'{clip}:{f}'] = n
    return worst, counts


worst, counts_before = poke_scan([(None, 1)] + CHECK_FRAMES)
fixed = {}


def vert_adj(me):
    adj = [[] for _ in me.vertices]
    for e in me.edges:
        i, j = e.vertices; adj[i].append(j); adj[j].append(i)
    return adj


def push_in(ob, push, cap):
    me = ob.data; adj = vert_adj(me)
    for _ in range(2):                                           # feather two rings out
        nxt = push.copy()
        for i in np.nonzero(push > 0)[0]:
            for j in adj[i]: nxt[j] = max(nxt[j], push[i] * 0.5)
        push = nxt
    push = np.minimum(push + 0.0015 * (push > 0), cap)
    for i in np.nonzero(push > 0)[0]:
        v = me.vertices[i]; v.co -= v.normal * float(push[i])
    me.update()
    return int((push > 0).sum())


# A: fabric under the carrier / pads (small cap: the shirt must not sink under the skin)
_ubm = bmesh.new(); _ubm.from_mesh(objs['Uniform'].data)
_ub = [v.co.copy() for v in _ubm.verts if any(e.is_boundary for e in v.link_edges)]
_uall = [v.co.copy() for v in _ubm.verts]; _ubm.free()
from mathutils import kdtree
_kd = kdtree.KDTree(len(_ub))
for i, c in enumerate(_ub): _kd.insert(c, i)
_kd.balance()
near_hem = np.array([_kd.find(c)[2] < 0.025 for c in _uall])     # hems/collar keep their exact fit
for key in (('Uniform', 'CarrierSoft'), ('Uniform', 'Pads')):
    w = worst[key].copy(); w[near_hem] = 0.0
    fixed['>'.join(key)] = push_in(objs[key[0]], w, 0.005)
# B: re-scan skin against the corrected shirt; skin covered by cloth (away from the hems) also gets a
#    constant 3 mm sink so shoulder shrugs / arm raises never show skin through the shirt
worst_b, _ = poke_scan([(None, 1)] + CHECK_FRAMES)
set_clip(None, 1)
bco, bnr, _ = evaluated(objs['Body']); uco, unr, utr = evaluated(objs['Uniform'])
ubm = bmesh.new(); ubm.from_mesh(objs['Uniform'].data)
ub = np.array([any(e.is_boundary for e in v.link_edges) for v in ubm.verts]); ubm.free()
kd = kdtree.KDTree(int(ub.sum()))
for i in np.nonzero(ub)[0]: kd.insert(Vector(uco[i]), int(i))
kd.balance()
utree = bvhtree.BVHTree.FromPolygons([Vector(p) for p in uco], utr)
base = np.zeros(len(bco))
under = np.zeros(len(bco), bool)      # skin that the shirt covers at rest (only this may be pushed in)
for i, p in enumerate(bco):
    hit = utree.find_nearest(Vector(p), 0.025)
    if hit[0] is None or (Vector(p) - hit[0]).dot(hit[1]) > 0.002: continue
    if kd.find(Vector(p))[2] > (Vector(p) - hit[0]).length + 0.005: under[i] = True
for i, p in enumerate(bco):
    hit = utree.find_nearest(Vector(p), 0.025)
    if hit[0] is None or (Vector(p) - hit[0]).dot(hit[1]) > 0.002: continue
    dh = kd.find(Vector(p))[2]
    ds = (Vector(p) - hit[0]).length
    # really under the cloth: the hem is much farther away than the cloth surface (skin beside a hem, e.g. the
    # neck above the collar, has the hem as its nearest cloth point and is left alone)
    if dh > 0.012 and dh > ds + 0.01: base[i] = 0.003 * min(1.0, (dh - 0.012) / 0.01)
push = np.maximum(base, np.maximum(worst_b[('Body', 'Uniform')], worst_b[('Body', 'CarrierSoft')]) * under)
fixed['Body'] = push_in(objs['Body'], push, 0.015)
# C: skin faces fully under the shirt and >7 mm from any hem are never visible: delete them
covered = np.zeros(len(bco), bool)
for i, p in enumerate(bco):
    hit = utree.find_nearest(Vector(p), 0.03)
    if hit[0] is None or (Vector(p) - hit[0]).dot(hit[1]) >= 0: continue
    dh = kd.find(Vector(p))[2]
    if dh > 0.007 and dh > (Vector(p) - hit[0]).length + 0.01: covered[i] = True
bm = bmesh.new(); bm.from_mesh(objs['Body'].data); bm.faces.ensure_lookup_table()
dead = [f for f in bm.faces if all(covered[v.index] for v in f.verts)]
bmesh.ops.delete(bm, geom=dead, context='FACES'); bm.to_mesh(objs['Body'].data); bm.free()
fixed['Body_faces_deleted'] = len(dead)
worst2, counts_after = poke_scan([(None, 1)] + CHECK_FRAMES)
REPORT['poke'] = {'pushed_verts': fixed,
                  'before_total': {k: sum(v.values()) for k, v in counts_before.items()},
                  'after_total': {k: sum(v.values()) for k, v in counts_after.items()},
                  'after_worst_frame': {k: max(v.items(), key=lambda kv: kv[1]) for k, v in counts_after.items()}}
print('poke', json.dumps(REPORT['poke']), flush=True)
for n, s in subs.items(): objs[n].modifiers['Subdiv'].show_viewport = s
set_clip(None, 1); rig.animation_data.action = None

# ------------------------------------------------------------------ 4. LODs
LOD0 = [o for o in objs if o.type == 'MESH' and not o.hide_render]
RATIO = {1: {'Body': 0.5, 'Uniform': 0.45, 'Boots': 0.3, 'Pads': 0.45, 'CarrierSoft': 0.45, 'CarrierHard': 0.6,
             'Eyes': 1.0, 'Mouth': 1.0},
         2: {'Body': 0.22, 'Uniform': 0.2, 'Boots': 0.12, 'Pads': 0.2, 'CarrierSoft': 0.18, 'CarrierHard': 0.3,
             'Eyes': 0.35}}
KEEP_SHELLS = {1: (1, 3, 5), 2: (1, 4)}


def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)


def make_lod(src, lvl, ratio):
    ob = src.copy(); ob.data = src.data.copy(); ob.name = f'{src.name}_LOD{lvl}'; ob.data.name = ob.name
    for c in src.users_collection: c.objects.link(ob)
    for m in list(ob.modifiers):
        if m.type == 'SUBSURF': ob.modifiers.remove(m)
    if ratio < 0.999:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4]); bm.to_mesh(ob.data); bm.free()
        dec = ob.modifiers.new('Dec', 'DECIMATE'); dec.ratio = ratio; dec.use_collapse_triangulate = True
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        bpy.ops.object.modifier_move_to_index(modifier='Dec', index=0)
        bpy.ops.object.modifier_apply(modifier='Dec')
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    return ob


lods = {0: LOD0, 1: [], 2: []}
for lvl in (1, 2):
    for o in LOD0:
        n = o.name
        if n in ('Brows', 'Lashes'): continue
        if n == 'Mouth' and lvl == 2: continue
        if n.startswith('HairShell'):
            if int(n[-1]) in KEEP_SHELLS[lvl]: lods[lvl].append(make_lod(o, lvl, 1.0))
            continue
        lods[lvl].append(make_lod(o, lvl, RATIO[lvl].get(n, 0.5)))
for o in LOD0:
    o.name = o.name + '_LOD0'; o.data.name = o.name
REPORT['lods'] = {}
for lvl, L in lods.items():
    # LOD0 counts at base resolution (Subdiv is a hero/offline option only)
    REPORT['lods'][f'LOD{lvl}'] = {'tris': sum(tris(o) for o in L), 'meshes': {o.name: tris(o) for o in L},
                                   'draw_calls': sum(len(o.data.materials) for o in L)}
print(json.dumps({k: v['tris'] for k, v in REPORT['lods'].items()}), flush=True)
for o in lods[1] + lods[2]: o.hide_render = True; o.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'human_proto.blend'), compress=True)
if os.path.exists(os.path.join(OUT, 'human_proto.blend1')): os.remove(os.path.join(OUT, 'human_proto.blend1'))


# ------------------------------------------------------------------ 5. export
def export(path, meshes, kind):
    retarget_images(kind)
    saved = {}
    for o in [x for L in lods.values() for x in L]:
        saved[o.name] = (o.parent, o.matrix_world.copy(), o.hide_render, o.hide_get())
        if 'Subdiv' in o.modifiers: o.modifiers['Subdiv'].show_viewport = False
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        o.hide_set(False); o.hide_render = False
    for o in bpy.context.view_layer.objects: o.select_set(o in meshes or o == rig)
    for tr in rig.animation_data.nla_tracks: tr.mute = False
    rig.animation_data.action = None
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_skins=True, export_apply=False, export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                              export_optimize_animation_size=True, export_anim_single_armature=True,
                              export_reset_pose_bones=True, export_def_bones=False,
                              export_morph=False, export_all_influences=False, export_tangents=True,
                              export_image_format='AUTO', export_jpeg_quality=90)
    for tr in rig.animation_data.nla_tracks: tr.mute = True
    for o in [x for L in lods.values() for x in L]:
        p, mw, hr, hv = saved[o.name]
        o.parent = p; o.matrix_world = mw; o.hide_render = hr; o.hide_set(hv)
        if 'Subdiv' in o.modifiers: o.modifiers['Subdiv'].show_viewport = True
    retarget_images('game')
    print('exported', path, round(os.path.getsize(path) / 1e6, 2), 'MB', flush=True)


if not a.no_export:
    allm = lods[0] + lods[1] + lods[2]
    export(os.path.join(OUT, 'human-proto.glb'), lods[0], 'game')
    export(os.path.join(OUT, 'human-proto_lods.glb'), allm, 'game')
    export(os.path.join(OUT, 'human-proto_web.glb'), allm, 'web')
REPORT['build_s'] = round(time.time() - T0, 1)
json.dump(REPORT, open(os.path.join(OUT, 'report.json'), 'w'), indent=1)
print('done', REPORT['build_s'])
