"""Stage 1: MakeHuman base mesh -> morphed, rigged Blender human (A-pose).

Run:  $H/venv/bin/python $H/build/mh_body.py
Out:  $H/base/human_base.blend, $H/base/human_base.glb (base res), $H/base/human_hero.glb (1x subdiv)

All MakeHuman data used is CC0 (base.obj, targets, default rig + weights, high-poly eyes).
Units: MakeHuman decimetres, Y-up -> Blender metres, Z-up  (x, y, z) -> (x, -z, y) * 0.1
"""
import os, sys, json, time, math
import numpy as np
import bpy
from mathutils import Vector

T0 = time.time()
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MH = os.path.join(H, 'mh', 'makehuman', 'data')
OUT = os.path.join(H, 'base')
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- character
MACRO = dict(
    gender=1.0,                 # 1 = male
    age=0.5 + (30 - 25) / 130,  # MH: 0.5 = 25 y, 1.0 = 90 y  -> 30 y
    muscle=0.82,                # athletic
    weight=0.58,                # lean-normal
    height=0.54,                # ~1.82 m
    proportions=0.85,           # towards "ideal" proportions
    african=0.12, asian=0.08, caucasian=0.80,
)
# (target path relative to data/targets, weight). l-/r- pairs written via LR().
def LR(name, w):
    return [(name.replace('{s}', 'l'), w), (name.replace('{s}', 'r'), w)]

DETAIL = [
    # skull / jaw: squarer, stronger jaw and chin
    ('head/head-square.target', 0.30),
    ('head/head-fat-decr.target', 0.30),
    ('head/head-scale-vert-decr.target', 0.15),
    ('head/head-back-scale-depth-decr.target', 0.25),
    ('chin/chin-width-incr.target', 0.35),
    ('chin/chin-prominent-incr.target', 0.50),
    ('chin/chin-prognathism-incr.target', 0.20),
    ('chin/chin-bones-incr.target', 0.35),
    ('chin/chin-height-incr.target', 0.15),
    ('chin/chin-cleft-incr.target', 0.15),
    # brow
    ('eyebrows/eyebrows-trans-down.target', 0.25),
    ('eyebrows/eyebrows-angle-down.target', 0.25),
    ('forehead/forehead-trans-forward.target', 0.15),
    ('forehead/forehead-temple-decr.target', 0.20),
    # cheekbones / lean face
    *LR('cheek/{s}-cheek-bones-incr.target', 0.40),
    *LR('cheek/{s}-cheek-volume-decr.target', 0.35),
    *LR('cheek/{s}-cheek-inner-decr.target', 0.20),
    # nose: slightly longer, a little hump, narrower tip
    ('nose/nose-hump-incr.target', 0.30),
    ('nose/nose-scale-vert-incr.target', 0.15),
    ('nose/nose-point-width-decr.target', 0.25),
    ('nose/nose-nostrils-width-decr.target', 0.15),
    ('nose/nose-trans-forward.target', 0.10),
    ('nose/nose-septumangle-decr.target', 0.15),
    # mouth
    ('mouth/mouth-upperlip-volume-decr.target', 0.20),
    ('mouth/mouth-lowerlip-volume-incr.target', 0.10),
    ('mouth/mouth-scale-horiz-incr.target', 0.20),
    ('mouth/mouth-laugh-lines-in.target', 0.25),
    # eyes: slightly hooded, narrower
    *LR('eyes/{s}-eye-eyefold-down.target', 0.25),
    *LR('eyes/{s}-eye-height2-decr.target', 0.15),
    *LR('eyes/{s}-eye-bag-decr.target', 0.20),
    # neck / torso / arms: athletic operator
    ('neck/neck-scale-horiz-incr.target', 0.35),
    ('neck/neck-scale-depth-incr.target', 0.15),
    ('torso/torso-vshape-incr.target', 0.30),
    ('torso/torso-muscle-dorsi-incr.target', 0.25),
    ('torso/torso-muscle-pectoral-incr.target', 0.20),
    *LR('armslegs/{s}-upperarm-muscle-incr.target', 0.20),
    *LR('armslegs/{s}-upperarm-shoulder-muscle-incr.target', 0.40),
    *LR('armslegs/{s}-upperleg-muscle-incr.target', 0.25),
    *LR('armslegs/{s}-lowerleg-muscle-incr.target', 0.15),
    ('neck/neck-scale-vert-decr.target', 0.20),
    ('torso/torso-scale-depth-incr.target', 0.15),
    *LR('armslegs/{s}-lowerarm-muscle-incr.target', 0.15),
    *LR('ears/{s}-ear-flap-decr.target', 0.25),
]

# ---------------------------------------------------------------- OBJ parse
def parse_obj(path):
    v, vt, faces = [], [], []          # faces: (group, [vi], [ti])
    g = None
    for line in open(path):
        if line.startswith('v '):
            v.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            vt.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '):
            g = line.split()[1]
        elif line.startswith('f '):
            vi, ti = [], []
            for tok in line.split()[1:]:
                p = tok.split('/')
                vi.append(int(p[0]) - 1)
                ti.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
            faces.append((g, vi, ti))
    return np.array(v, np.float64), np.array(vt, np.float64), faces

base_v, base_vt, base_f = parse_obj(os.path.join(MH, '3dobjs', 'base.obj'))
NV = len(base_v)
print('base.obj verts', NV, 'faces', len(base_f))

# ---------------------------------------------------------------- targets
_tcache = {}
def load_target(rel):
    p = os.path.join(MH, 'targets', rel)
    if p not in _tcache:
        rows = [l.split() for l in open(p) if l.strip() and not l.startswith('#')]
        idx = np.array([int(r[0]) for r in rows], np.int64)
        d = np.array([[float(x) for x in r[1:4]] for r in rows], np.float64).reshape(-1, 3)
        _tcache[p] = (idx, d)
    return _tcache[p]

def ramp(x):  # MH min/avg/max split
    mx = max(0.0, x * 2 - 1); mn = max(0.0, 1 - x * 2)
    return mn, 1 - (mn + mx), mx

m = MACRO
gw = {'male': m['gender'], 'female': 1 - m['gender']}
a = m['age']
if a < 0.5:
    young = max(0.0, (a - 0.1875) * 3.2); baby = max(0.0, 1 - a * 5.333)
    aw = {'baby': baby, 'child': max(0.0, min(1.0, 5.333 * a) - young), 'young': young, 'old': 0.0}
else:
    old = max(0.0, a * 2 - 1)
    aw = {'baby': 0.0, 'child': 0.0, 'young': 1 - old, 'old': old}
mn, av, mx = ramp(m['muscle']); mw = {'minmuscle': mn, 'averagemuscle': av, 'maxmuscle': mx}
mn, av, mx = ramp(m['weight']); ww = {'minweight': mn, 'averageweight': av, 'maxweight': mx}
mn, _, mx = ramp(m['height']); hw = {'minheight': mn, 'maxheight': mx}
mn, _, mx = ramp(m['proportions']); pw = {'uncommonproportions': mn, 'idealproportions': mx}
rw = {'african': m['african'], 'asian': m['asian'], 'caucasian': m['caucasian']}

applied = []
for gk, g_ in gw.items():
    for ak, a_ in aw.items():
        for rk, r_ in rw.items():                                    # race-gender-age
            applied.append((f'macrodetails/{rk}-{gk}-{ak}.target', g_ * a_ * r_))
        for mk, m_ in mw.items():
            for wk, w_ in ww.items():
                base_w = g_ * a_ * m_ * w_
                applied.append((f'macrodetails/universal-{gk}-{ak}-{mk}-{wk}.target', base_w))
                for hk, h_ in hw.items():
                    applied.append((f'macrodetails/height/{gk}-{ak}-{mk}-{wk}-{hk}.target', base_w * h_))
                if ak != 'baby':
                    for pk, p_ in pw.items():
                        applied.append((f'macrodetails/proportions/{gk}-{ak}-{mk}-{wk}-{pk}.target', base_w * p_))
applied = [(t, w) for t, w in applied if w > 1e-6]
applied += DETAIL

coords = base_v.copy()
for rel, w in applied:
    idx, d = load_target(rel)
    coords[idx] += d * w
print(f'applied {len(applied)} targets  ({time.time()-T0:.1f}s)')

# ---------------------------------------------------------------- to Blender space
def to_bl(c):
    c = np.asarray(c, np.float64)
    return np.stack([c[..., 0], -c[..., 2], c[..., 1]], -1) * 0.1

bl = to_bl(coords)
body_vis = sorted({i for g, vi, _ in base_f if g == 'body' for i in vi})
ground = bl[body_vis, 2].min()
bl[:, 2] -= ground

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.unit_settings.system = 'METRIC'

def make_mesh(name, groups, coords_bl, uv_src, faces, remap_out=None):
    fs = [(vi, ti) for g, vi, ti in faces if g in groups]
    used = sorted({i for vi, _ in fs for i in vi})
    remap = {o: n for n, o in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(coords_bl[i]) for i in used], [], [[remap[i] for i in vi] for vi, _ in fs])
    uvl = me.uv_layers.new(name='UVMap')
    uvs = [uv_src[t] for _, ti in fs for t in ti]
    uvl.data.foreach_set('uv', np.array(uvs, np.float32).ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    scn.collection.objects.link(ob)
    if remap_out is not None:
        remap_out.update(remap)
    return ob, remap

body_remap = {}
body, _ = make_mesh('Body', {'body'}, bl, base_vt, base_f, body_remap)
mouth_remap = {}
mouth, _ = make_mesh('Mouth', {'helper-upper-teeth', 'helper-lower-teeth', 'helper-tongue'}, bl, base_vt, base_f, mouth_remap)
lash_groups = {g for g, _, _ in base_f if 'eyelashes' in g}
lash_remap = {}
lashes, _ = make_mesh('Eyelashes', lash_groups, bl, base_vt, base_f, lash_remap)
# MH helper lash strips need an alpha lash texture (none shipped): kept hidden for a later stage, not exported
lashes.hide_render = True; lashes.hide_set(True)

# ---------------------------------------------------------------- high-poly eyes (mhclo fit)
def fit_proxy(mhclo_path, hcoord):
    refs, ws, offs, scl = [], [], [], [None] * 3
    in_verts = False; objf = None
    for line in open(mhclo_path):
        w = line.split()
        if not w or w[0].startswith('#'):
            continue
        if in_verts and len(w) in (1, 9) and w[0].lstrip('-').isdigit():
            if len(w) == 1:
                refs.append([int(w[0])] * 3); ws.append([1, 0, 0]); offs.append([0, 0, 0])
            else:
                refs.append([int(x) for x in w[:3]]); ws.append([float(x) for x in w[3:6]]); offs.append([float(x) for x in w[6:9]])
            continue
        k = w[0]
        if k == 'obj_file': objf = w[1]
        elif k in ('x_scale', 'y_scale', 'z_scale'):
            scl['xyz'.index(k[0])] = (int(w[1]), int(w[2]), float(w[3]))
        elif k == 'verts': in_verts = True
    refs = np.array(refs); ws = np.array(ws); offs = np.array(offs)
    S = np.ones(3)
    for i, s in enumerate(scl):
        if s: S[i] = abs(hcoord[s[0], i] - hcoord[s[1], i]) / s[2]
    c = (hcoord[refs[:, 0]] * ws[:, 0, None] + hcoord[refs[:, 1]] * ws[:, 1, None]
         + hcoord[refs[:, 2]] * ws[:, 2, None] + offs * S)
    return c, os.path.join(os.path.dirname(mhclo_path), objf)

eye_c, eye_obj = fit_proxy(os.path.join(MH, 'eyes', 'high-poly', 'high-poly.mhclo'), coords)
ev, evt, ef = parse_obj(eye_obj)
eye_bl = to_bl(eye_c); eye_bl[:, 2] -= ground
eyes, _ = make_mesh('Eyes', {None} | {g for g, _, _ in ef}, eye_bl, evt, ef)

# ---------------------------------------------------------------- skeleton
skel = json.load(open(os.path.join(MH, 'rigs', 'default.mhskel')))
joints = {k: bl[v].mean(0) for k, v in skel['joints'].items()}

def jpos(name):
    return Vector(joints[name])

# Unity Humanoid naming (Mecanim auto-maps these). Everything else keeps MH name.
HUMANOID = {
    'root': 'Hips', 'spine05': 'Spine', 'spine03': 'Chest', 'spine01': 'UpperChest',
    'neck01': 'Neck', 'head': 'Head', 'jaw': 'Jaw', 'eye.L': 'LeftEye', 'eye.R': 'RightEye',
}
for s, S in (('L', 'Left'), ('R', 'Right')):
    HUMANOID.update({
        f'clavicle.{s}': f'{S}Shoulder', f'upperarm01.{s}': f'{S}UpperArm', f'lowerarm01.{s}': f'{S}LowerArm',
        f'wrist.{s}': f'{S}Hand', f'upperleg01.{s}': f'{S}UpperLeg', f'lowerleg01.{s}': f'{S}LowerLeg',
        f'foot.{s}': f'{S}Foot', f'toe1-1.{s}': f'{S}Toes',
        f'upperarm02.{s}': f'{S}UpperArmTwist', f'lowerarm02.{s}': f'{S}LowerArmTwist',
        f'upperleg02.{s}': f'{S}UpperLegTwist', f'lowerleg02.{s}': f'{S}LowerLegTwist',
    })
    for fi, fn in enumerate(['Thumb', 'Index', 'Middle', 'Ring', 'Little'], 1):
        for seg, sn in enumerate(['Proximal', 'Intermediate', 'Distal'], 1):
            HUMANOID[f'finger{fi}-{seg}.{s}'] = f'{S}{fn}{sn}'
def bname(n):
    return HUMANOID.get(n, n)

arm_data = bpy.data.armatures.new('Rig')
rig = bpy.data.objects.new('Rig', arm_data)
scn.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
for n, b in skel['bones'].items():
    eb = arm_data.edit_bones.new(bname(n))
    eb.head = jpos(b['head']); eb.tail = jpos(b['tail'])
    if (eb.tail - eb.head).length < 1e-4:
        eb.tail = eb.head + Vector((0, 0, 0.01))
    ebs[n] = eb
for n, b in skel['bones'].items():
    if b['parent']:
        ebs[n].parent = ebs[b['parent']]
    # MH roll: plane normal = bone local X  -> Blender align_roll wants local Z = X x Y
    planes = b['rotation_plane'] if isinstance(b['rotation_plane'], list) else [b['rotation_plane']]
    nrm = Vector((0, 0, 0))
    for pl in planes:
        if pl in skel['planes']:
            p1, p2, p3 = [jpos(j) for j in skel['planes'][pl]]
            nrm += (p3 - p2).normalized().cross((p2 - p1).normalized()).normalized()
    if nrm.length > 1e-6:
        y = (ebs[n].tail - ebs[n].head).normalized()
        z = nrm.normalized().cross(y)
        if z.length > 1e-6:
            ebs[n].align_roll(z)
    # connect when child head == parent tail (cleaner chains in Unity)
    if b['parent'] and (ebs[n].head - ebs[b['parent']].tail).length < 1e-5:
        ebs[n].use_connect = True
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- skin weights
wts = json.load(open(os.path.join(MH, 'rigs', 'default_weights.mhw')))['weights']
def skin(ob, remap, rigid=None):
    if rigid:
        for vg_name, verts in rigid.items():
            vg = ob.vertex_groups.new(name=vg_name); vg.add(verts, 1.0, 'REPLACE')
    else:
        for bn, lst in wts.items():
            sel = [(remap[i], w) for i, w in lst if i in remap]
            if not sel: continue
            vg = ob.vertex_groups.get(bname(bn)) or ob.vertex_groups.new(name=bname(bn))
            for i, w in sel:
                vg.add([i], w, 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    ob.parent = rig

skin(body, body_remap)
skin(mouth, mouth_remap)
skin(lashes, lash_remap)
# eyes: rigid per side (x>0 = MH left = character's left)
ex = np.array([v.co.x for v in eyes.data.vertices])
skin(eyes, None, rigid={'LeftEye': list(np.where(ex > 0)[0].tolist()), 'RightEye': list(np.where(ex <= 0)[0].tolist())})

# normalize & limit to 4 influences (Unity default skin weights)
for ob in (body, mouth, lashes):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

# ---------------------------------------------------------------- placeholder materials
def mat(name, color, rough=0.5, sss=0.0, tex=None, alpha=None):
    mt = bpy.data.materials.new(name); mt.use_nodes = True
    bs = mt.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    if sss:
        bs.inputs['Subsurface Weight'].default_value = sss
        bs.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
        bs.inputs['Subsurface Scale'].default_value = 0.012
    if tex:
        tn = mt.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = bpy.data.images.load(tex)
        mt.node_tree.links.new(tn.outputs['Color'], bs.inputs['Base Color'])
        mt.node_tree.links.new(tn.outputs['Alpha'], bs.inputs['Alpha'])   # MH eye: cornea shell is alpha
    if alpha is not None:
        bs.inputs['Alpha'].default_value = alpha
    return mt

body.data.materials.append(mat('Skin', (0.62, 0.44, 0.35), 0.48, sss=0.25))
mouth.data.materials.append(mat('Mouth', (0.55, 0.30, 0.28), 0.4))
lashes.data.materials.append(mat('Lashes', (0.03, 0.02, 0.015), 0.6, alpha=0.6))
eyes.data.materials.append(mat('Eyes', (1, 1, 1), 0.08, tex=os.path.join(MH, 'eyes', 'materials', 'brown_eye.png')))

# ---------------------------------------------------------------- save / export
body.modifiers.new('Subdiv', 'SUBSURF').levels = 1          # hero: viewport/render subdiv
body.modifiers['Subdiv'].render_levels = 1
# keep armature first, subdiv after (deform then smooth)
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_move_to_index(modifier='Subdiv', index=1)

me = body.data
print('Body verts', len(me.vertices), 'tris', sum(len(p.vertices) - 2 for p in me.polygons))
for ob in (eyes, mouth, lashes):
    print(ob.name, 'verts', len(ob.data.vertices), 'tris', sum(len(p.vertices) - 2 for p in ob.data.polygons))
print('bones', len(arm_data.bones))
z = [v.co.z for v in me.vertices]; print('height m', max(z) - min(z))

json.dump({'macro': MACRO, 'targets': applied, 'humanoid': HUMANOID},
          open(os.path.join(OUT, 'human_targets.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'human_base.blend'), compress=True)
if os.path.exists(os.path.join(OUT, 'human_base.blend1')): os.remove(os.path.join(OUT, 'human_base.blend1'))

def export(path, subdiv):
    # meshes as scene-root siblings of the rig (glTF best practice: avoids NODE_SKINNED_MESH_NON_ROOT)
    for o in (body, eyes, mouth):
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    body.modifiers['Subdiv'].show_viewport = subdiv
    for o in bpy.context.view_layer.objects: o.select_set(o in (rig, body, eyes, mouth))
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_skins=True, export_apply=subdiv, export_animations=False,
                              export_morph=False, export_all_influences=False)
if '--no-export' not in sys.argv:
    export(os.path.join(OUT, 'human_base.glb'), False)
    export(os.path.join(OUT, 'human_hero.glb'), True)
    body.modifiers['Subdiv'].show_viewport = True
print(f'done {time.time()-T0:.1f}s')
