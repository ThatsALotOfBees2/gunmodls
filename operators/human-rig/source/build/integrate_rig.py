"""operators/human-rig integrator (DESIGN.md section 9).

Run (each stage reads the previous stage's .blend in rig/final/stage/, or use --all):
    $H/venv/bin/python $R/build/integrate_rig.py --all            # assemble -> anim -> fix -> pack -> lods -> export
    $H/venv/bin/python $R/build/integrate_rig.py --stage assemble   # one stage
Stages
  assemble  base + every mods/<id>.blend (GEAR_<id>) onto the one Rig; fresh matlib materials (dedup by name);
            rig + meshes lifted by the boots' ground_offset_m; prop bones PropPistolDrop / PropPistolBelt /
            PropMag for the Holster / Reload clips; socket empties.          -> final/stage/1_assembled.blend
  anim      the 7 clips (anim_rig.py) baked onto the Rig as NLA strips.     -> final/stage/2_anim.blend
  fix       clip-frame penetration scan per module, corrective weights (belt / pouch lower rows), shirt skin
            sink + armpit mask growth, report.                                -> final/stage/3_fix.blend
  pack      body mask chunks (Body / Body__<mods>), hair-shell helmet chunks, one joined skinned mesh per
            module / part / variant, glTF extras, Assault visibility.        -> final/stage/4_pack.blend
  lods      LOD1 / LOD2 (silhouette-protected decimate, small parts dropped) -> final/human_rig.blend
  export    deliver/operators/human-rig/human-rig.glb (LOD0), unity/human-rig.glb (LOD0-2), web GLB, textures/
"""
import os, sys, json, math, time, argparse, re, shutil
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion, kdtree, bvhtree

BUILD = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BUILD)
import common as C  # noqa: E402
import matlib  # noqa: E402

RIG = C.RIG
FINAL = os.path.join(RIG, 'final'); STAGE = os.path.join(FINAL, 'stage')
DELIVER = os.path.join(RIG, 'deliver', 'operators', 'human-rig')
os.makedirs(STAGE, exist_ok=True)
T0 = time.time()
REPORT_PATH = os.path.join(FINAL, 'report.json')


def log(*a): print(f'[{time.time() - T0:7.1f}s]', *a, flush=True)


def load_report():
    return json.load(open(REPORT_PATH)) if os.path.exists(REPORT_PATH) else {}


def save_report(R):
    json.dump(R, open(REPORT_PATH, 'w'), indent=1)


def save(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    if os.path.exists(path + '1'): os.remove(path + '1')
    log('saved', path)


def stage_path(n): return os.path.join(STAGE, n)


# ------------------------------------------------------------------------------------------------ module registry
MODS = [m for m in C.MODULES if m not in ('body', 'test')]
MAN = {m: json.load(open(os.path.join(C.MODS, f'{m}.json'))) for m in list(MODS) + ['body']}
HIDERS = ['shirt', 'trousers', 'gloves', 'boots']               # modules that hide Body faces (mask bits)
GROUND = max(MAN[m].get('ground_offset_m', 0.0) for m in MODS)  # boots: 0.025
# variant / part rules the integrator adds on top of the manifests
EXTRA_RULES = {
    ('eyewear', 'goggles'): {'requires': ['helmet']},          # the goggle strap is fitted around the helmet shell
}

# loadout presets: module -> variant (None = default variant / no variants). Parts follow their rules.
ASSAULT = {m: MAN[m].get('default_variant') for m in MODS if MAN[m]['default_on']}
PRESETS = {
    'Body': {},
    'Base': {m: None for m in ('shirt', 'trousers', 'boots', 'gloves')},
    'Light': {**{m: None for m in ('shirt', 'trousers', 'boots', 'gloves', 'kneepads', 'chest_rig', 'belt',
                                   'pistol_mags', 'holster_drop', 'ifak', 'dump', 'headset')}, 'eyewear': 'glasses'},
    'Assault': dict(ASSAULT),
    'Full': {**ASSAULT, 'neck_groin': None},
}


# ================================================================================================ stage: assemble
def _fresh_materials():
    """every MAT_* slot -> a freshly built matlib material (current textures + shader), one per name."""
    for m in list(bpy.data.materials):
        if m.name.startswith('MAT_'): m.name = 'OLD_' + m.name
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        for i, m in enumerate(o.data.materials):
            if m and m.name.startswith('OLD_MAT_'):
                base = re.sub(r'\.\d+$', '', m.name[4:])
                o.data.materials[i] = matlib.get(base)
    for m in list(bpy.data.materials):
        if m.name.startswith('OLD_') and m.users == 0: bpy.data.materials.remove(m)
    for im in list(bpy.data.images):
        if im.users == 0: bpy.data.images.remove(im)


def _edit_rig(rig):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    return rig.data.edit_bones


def _pca_frame(P):
    c = P.mean(0); U, S, Vt = np.linalg.svd(P - c, full_matrices=False)
    return c, Vt  # rows: principal axes, longest first


def stage_assemble():
    ctx = C.load_base()
    rig, body = ctx['rig'], ctx['body']
    R = {'modules': {}}
    for m in MODS:
        obs = C.load_module(m)
        for o in obs:
            o['module'] = m
            o.hide_render = False; o.hide_set(False)
        R['modules'][m] = [o.name for o in obs]
        log('appended', m, len(obs))
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent == rig and 'module' not in o: o['module'] = 'body'
    _fresh_materials()
    # strip hero-only subdivision (chunk splitting + realtime: base cage only)
    for o in bpy.data.objects:
        if o.type == 'MESH':
            for md in list(o.modifiers):
                if md.type == 'SUBSURF': o.modifiers.remove(md)
    # ---- lift everything by the boots' ground offset (sole bottom on z = 0)
    T = Matrix.Translation((0, 0, GROUND))
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent == rig: o.data.transform(T)
        elif o.type == 'MESH' and o.name.startswith('PRX_'): o.data.transform(T)
    eb = _edit_rig(rig)
    for b in eb: b.head.z += GROUND; b.tail.z += GROUND
    bpy.ops.object.mode_set(mode='OBJECT')
    R['ground_offset_m'] = GROUND
    log('lifted', GROUND)
    # ---- prop bones: pistols (drawn in Holster / HolsterBelt) + one rifle mag (Reload)
    obj = bpy.data.objects
    props = {}
    # split one magazine (his left-most = closest to the support hand) out of RMAG_Mags into RMAG_ReloadMag
    mg = obj['RMAG_Mags']
    bm = bmesh.new(); bm.from_mesh(mg.data); bm.verts.ensure_lookup_table()
    isl = []; seen = set()
    for v in bm.verts:
        if v.index in seen: continue
        st = [v]; comp = []; seen.add(v.index)
        while st:
            a = st.pop(); comp.append(a.index)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen: seen.add(b.index); st.append(b)
        isl.append(comp)
    co = np.array([v.co[:] for v in mg.data.vertices])
    # group islands into 3 magazines by x (cells 75 mm apart)
    cx = np.array([co[c, 0].mean() for c in isl])
    left = [c for c, x in zip(isl, cx) if x > co[:, 0].max() - 0.075]
    sel = set(i for c in left for i in c)
    bm.free()
    # duplicate + separate
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = mg; mg.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for v in mg.data.vertices: v.select = v.index in sel
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='VERT'); bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    rm = [o for o in bpy.context.selected_objects if o != mg][0]
    rm.name = 'RMAG_ReloadMag'; rm.data.name = rm.name; rm['part'] = 'reload_mag'; rm['module'] = 'rifle_mags'
    R['modules']['rifle_mags'].append(rm.name)
    # frames of the props (rest, lifted): pistol from PCA (bore = longest axis), mag from PCA
    def frame_of(o, mats_hint=None):
        P = np.array([v.co[:] for v in o.data.vertices]); c, Vt = _pca_frame(P)
        return P, c, Vt
    pdefs = {}
    for name, ob_name, parent in (('PropPistolDrop', 'HOLD_Pistol', 'RightUpperLegTwist'),
                                  ('PropPistolBelt', 'HOLB_Pistol', None),
                                  ('PropMag', 'RMAG_ReloadMag', 'spine02')):
        o = obj[ob_name]
        P, c, Vt = frame_of(o)
        ax = Vector(Vt[0])                    # longest: pistol slide / mag body
        if ax.z > 0: ax = -ax                 # bone points down (muzzle / mag feed end down in the holster/pouch)
        a2 = Vector(Vt[1])
        if name.startswith('PropPistol'):
            # bone Z must point to the grip (the slide = MAT_MetalHW faces sit on -Z), same frame for both pistols
            me = o.data; mi = [i for i, m in enumerate(me.materials) if m and m.name.startswith('MAT_MetalHW')]
            sv = sorted({k for p in me.polygons if p.material_index in mi for k in p.vertices})
            if (Vector(P[sv].mean(0)) - Vector(c)).dot(a2) > 0: a2 = -a2
        else:
            if a2.x < 0: a2 = -a2             # mag front (bullet tips) toward his left = +Z
        pdefs[name] = (o, Vector(c), ax, a2, parent)
    # PropPistolBelt parent = dominant bone of the belt holster weights
    hb = obj['HOLB_Pistol']; acc = {}
    for v in hb.data.vertices:
        for g in v.groups: acc[hb.vertex_groups[g.group].name] = acc.get(hb.vertex_groups[g.group].name, 0) + g.weight
    o, c, ax, a2, _ = pdefs['PropPistolBelt']; pdefs['PropPistolBelt'] = (o, c, ax, a2, 'Hips')
    eb = _edit_rig(rig)
    for name, (o, c, ax, a2, parent) in pdefs.items():
        b = eb.new(name); b.head = c; b.tail = c + ax * 0.08
        b.align_roll(a2); b.parent = eb[parent]; b.use_deform = True; b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    # constant blend weights each prop had (the anim bakes this blend as a rigid follow when not in hand)
    for name, (o, c, ax, a2, parent) in pdefs.items():
        acc = {}
        for v in o.data.vertices:
            for g in v.groups:
                n = o.vertex_groups[g.group].name; acc[n] = acc.get(n, 0.0) + g.weight
        tot = sum(acc.values()); follow = {k: v / tot for k, v in acc.items() if v / tot > 1e-3}
        props[name] = {'mesh': o.name, 'follow': follow, 'parent': parent,
                       'rest_head': list(c), 'axis': list(ax)}
        for g in list(o.vertex_groups): o.vertex_groups.remove(g)
        vg = o.vertex_groups.new(name=name); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    R['props'] = props
    log('props', {k: v['follow'] for k, v in props.items()})
    # ---- sockets (empties parented to bones; exported as child nodes of the joints)
    def socket(name, bone, world):
        e = bpy.data.objects.new(name, None); e.empty_display_size = 0.05; e.empty_display_type = 'ARROWS'
        bpy.context.scene.collection.objects.link(e)
        e.parent = rig; e.parent_type = 'BONE'; e.parent_bone = bone
        bpose = rig.data.bones[bone].matrix_local
        # BONE parenting is relative to the bone TAIL
        tail = Matrix.Translation(rig.data.bones[bone].tail_local - rig.data.bones[bone].head_local)
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_world = world
        return e
    rb = rig.data.bones
    # right-hand grip: palm centre, x = across the knuckles, y = along the fingers (Blender frame of the hand)
    h = rb['RightHand']; mp = rb['RightMiddleProximal'].head_local; ip = rb['RightIndexProximal'].head_local
    lp = rb['RightLittleProximal'].head_local
    f = (mp - h.head_local).normalized(); across = (ip - lp).normalized(); nrm = f.cross(across).normalized()
    grip = h.head_local.lerp(mp, 0.55) - nrm * 0.018
    M = Matrix((across, f, -nrm)).transposed().to_4x4(); M.translation = grip
    sockets = {'SOCKET_RightHandGrip': ('RightHand', M)}
    for name, prop in (('SOCKET_PistolHolster', 'PropPistolDrop'), ('SOCKET_PistolBelt', 'PropPistolBelt')):
        sockets[name] = (props[prop]['parent'], rb[prop].matrix_local.copy())
    # sling rifle end (QD swivel parked on the belt at belt_frame(-35)) -> dominant bone of the sling there
    sm = C.belt_frame(-35).copy(); sm.translation.z += GROUND
    sl = obj['SLNG_Hardware']; best = min(sl.data.vertices, key=lambda v: (v.co - sm.translation).length)
    bone = max(best.groups, key=lambda g: g.weight); bone = sl.vertex_groups[bone.group].name
    sockets['SOCKET_RifleSling'] = (bone, sm)
    for name, (bone, M) in sockets.items():
        socket(name, bone, M)
    R['sockets'] = {k: {'bone': b, 'pos': [round(x, 4) for x in M.translation]} for k, (b, M) in sockets.items()}
    # record mounts (lifted) for docs
    R['mounts'] = {o.name: [round(x, 4) for x in o.matrix_world.translation] for o in obj if o.name.startswith('MNT_')}
    # clean: proxies + mounts never ship; old clips are rebuilt by the anim stage
    for o in list(obj):
        if o.name.startswith(('PRX_', 'MNT_')): bpy.data.objects.remove(o)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    for cn in ('PROXY', 'MOUNTS'):
        if cn in bpy.data.collections: bpy.data.collections.remove(bpy.data.collections[cn])
    for o in obj:
        if o.type == 'MESH' and 'module' in o:
            mid = o['module']
            if mid != 'body':
                mm = next((x for x in MAN[mid]['meshes'] if x['name'] == o.name), None)
                if mm:
                    o['part'] = mm.get('part') or 'main'
                    if mm.get('variant'): o['variant'] = mm['variant']
            else:
                o['part'] = 'main'
    rpt = load_report(); rpt.update(R); save_report(rpt)
    save(stage_path('1_assembled.blend'))


# ================================================================================================ stage: anim
def stage_anim(src=None):
    bpy.ops.wm.open_mainfile(filepath=src or stage_path('1_assembled.blend'))
    import anim_rig
    rig = bpy.data.objects['Rig']
    rpt = load_report()
    acts = anim_rig.build_clips(rig, props=rpt['props'])
    rpt['clips'] = {n: {'frames': int(round(T * anim_rig.FPS)) + 1, 'seconds': T, 'loop': True}
                    for n, T in anim_rig.CLIPS.items()}
    save_report(rpt)
    save(stage_path('2_anim.blend'))



# ================================================================================================ stage: fix
def blend_weight(ob, share, bone):
    """per-vertex: w <- w * (1 - share[i]) + share[i] on `bone`; keep the 4 largest, normalised."""
    vg = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
    names = {g.index: g.name for g in ob.vertex_groups}
    for v in ob.data.vertices:
        s_ = float(share[v.index])
        if s_ <= 1e-4: continue
        w = {names[g.group]: g.weight * (1 - s_) for g in v.groups}
        w[bone] = w.get(bone, 0.0) + s_
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; tot = sum(x for _, x in top)
        for g in list(v.groups): ob.vertex_groups[g.group].remove([v.index])
        for n, x in top: ob.vertex_groups[n].add([v.index], x / tot, 'REPLACE')


# corrective weights: rigid hip pouches ride partly on the thigh (in a deep crouch the thigh pushes them up and
# out, as real kydex on a padded belt does); the lowest belt-sleeve row follows the thigh at the front sides.
CORRECTIVE = [
    # (pistol mags tested at 0.15-0.45 LeftUpperLeg / Hips: no help in CrouchIdle and worse standing -> left as built)
    ('KNIF_Sheath', 'LeftUpperLeg', 0.30), ('KNIF_Knife', 'LeftUpperLeg', 0.30), ('KNIF_ToolPouch', 'LeftUpperLeg', 0.30),
]


def apply_corrective():
    obj = bpy.data.objects; done = {}
    for name, bone, sh in CORRECTIVE:
        o = obj.get(name)
        if not o: continue
        blend_weight(o, np.full(len(o.data.vertices), sh), bone); done[name] = [bone, sh]
    # belt lower rows: verts below the belt centre line, front sides (|x| > 0.04, y < 0.02) -> thigh ramp
    zc = 1.018 + GROUND
    for name in ('BELT_Sleeve', 'BELT_Webbing', 'HOLD_Hanger'):
        o = obj.get(name)
        if not o: continue
        co = np.array([v.co[:] for v in o.data.vertices])
        low = np.clip((zc - 0.004 - co[:, 2]) / 0.025, 0, 1)
        front = np.clip((0.03 - co[:, 1]) / 0.08, 0, 1) * np.clip((np.abs(co[:, 0]) - 0.03) / 0.05, 0, 1)
        sh = 0.40 * low * front
        if name == 'HOLD_Hanger': sh = 0.25 * low * front
        for side, bone in ((1, 'LeftUpperLeg'), (-1, 'RightUpperLeg')):
            m = np.sign(co[:, 0]) == side
            blend_weight(o, np.where(m, sh, 0.0), bone)
        done[name] = 'lower-row thigh ramp <= 0.40'
    return done


def skin_poke_masks(frames):
    """Body faces outside the four base garments' masks that poke through the garment in any checked frame (and sit
    > 20 mm from the garment's open hems) join that garment's mask. -> final/extra_masks.json"""
    import pen_rig
    obj = bpy.data.objects; body = obj['Body']; rig = obj['Rig']
    nb = len(body.data.polygons)
    hid = {m: set(MAN[m]['hides_body_faces']) for m in HIDERS}
    allhid = set().union(*hid.values())
    gar = {'shirt': ['SHRT_Shirt'], 'trousers': ['TROU_Trousers'], 'gloves': ['GLOV_Glove'], 'boots': ['BOOT_Upper']}
    # hem points (open boundary verts) at rest
    hem = {}
    for m, names in gar.items():
        pts = []
        for n in names:
            bm = bmesh.new(); bm.from_mesh(obj[n].data)
            pts += [v.co.copy() for v in bm.verts if v.is_boundary]; bm.free()
        kd = kdtree.KDTree(len(pts))
        for i, p in enumerate(pts): kd.insert(p, i)
        kd.balance(); hem[m] = kd
    bco0 = np.array([v.co[:] for v in body.data.vertices])
    add = {m: set() for m in gar}
    for act, fr in [(None, 1)] + frames:
        rig.animation_data.action = bpy.data.actions[act] if act else None
        if act and rig.animation_data.action_slot is None: rig.animation_data.action_slot = rig.animation_data.action.slots[0]
        if not act:
            for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
        bpy.context.scene.frame_set(fr); bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        bco, _ = pen_rig.ev_coords(body, dg)
        for m, names in gar.items():
            for n in names:
                gco, _ = pen_rig.ev_coords(obj[n], dg)
                oe = obj[n].evaluated_get(dg); me = oe.to_mesh(); me.calc_loop_triangles()
                tri = [tuple(t.vertices) for t in me.loop_triangles]; oe.to_mesh_clear()
                T = bvhtree.BVHTree.FromPolygons([Vector(p) for p in gco], tri)
                for p in body.data.polygons:
                    if p.index in allhid or p.index in add[m]: continue
                    out_ = False
                    for c in [Vector(bco[list(p.vertices)].mean(0))] + [Vector(bco[k]) for k in p.vertices]:
                        loc, nn, fi, d = T.find_nearest(c, 0.03)
                        if loc is not None and (c - loc).dot(nn) > -0.0005: out_ = True; break
                    if not out_: continue                                         # under the cloth: fine
                    c0 = Vector(bco0[list(p.vertices)].mean(0))
                    if hem[m].find(c0)[2] < 0.020: continue                     # at a hem: stays visible
                    # rest-pose: is this face under the garment (cloth over it within 30 mm along the normal)?
                    add[m].add(p.index)
    rig.animation_data.action = None
    # keep only faces that are under the garment at rest (ray along the normal hits it) -> no growth into open skin
    out = {}
    for m, names in gar.items():
        T = C.obj_bvh([obj[n] for n in names]) if hasattr(C, 'obj_bvh') else None
        keep = []
        for i in add[m]:
            p = body.data.polygons[i]
            c = p.center; nrm = p.normal
            loc, _, _, _ = T.ray_cast(c - nrm * 0.002, nrm, 0.04)
            if loc is not None: keep.append(i)
        out[m] = sorted(keep)
    return out


def stage_fix():
    bpy.ops.wm.open_mainfile(filepath=stage_path('2_anim.blend'))
    import pen_rig
    rpt = load_report()
    rpt['corrective_weights'] = apply_corrective()
    clips = [a.name for a in bpy.data.actions]
    frames = pen_rig.frames_for(clips, 8)
    extra = skin_poke_masks(frames)
    json.dump(extra, open(os.path.join(FINAL, 'extra_masks.json'), 'w'))
    rpt['extra_masks'] = {m: len(v) for m, v in extra.items()}
    log('extra masks', rpt['extra_masks'])
    # final penetration scan: Assault set per clip (HolsterBelt clip: belt holster instead of the drop-leg)
    import pen_rig as PR
    res_all, who_all = {}, {}
    for c in clips:
        mods = list(PR.ASSAULT)
        if c == 'HolsterBelt': mods = [m for m in mods if m != 'holster_drop'] + ['holster_belt']
        res, who = PR.scan(PR.module_objects(mods), PR.frames_for([c], 12))
        for m in res:
            res_all.setdefault(m, {}).update(res[m]); who_all.setdefault(m, {}).update(who[m])
    # optional modules over the clips that matter (neck_groin, chest_rig in place of the carrier set)
    for extra_mod in ('neck_groin', 'chest_rig'):
        res, who = PR.scan(PR.module_objects([extra_mod]), PR.frames_for(clips, 6))
        res_all.update(res); who_all.update(who)
    PR.print_table(res_all, who_all)
    rpt['penetration'] = {m: {'worst': max(v.values()) if v else 0,
                              'worst_frame': max(v.items(), key=lambda kv: kv[1])[0] if v else None,
                              'frames_over_20': sum(1 for x in v.values() if x > 20), 'frames': len(v),
                              'per_clip_worst': {c: max([x for k, x in v.items() if k.startswith(c + ':')] or [0]) for c in clips},
                              'who': who_all.get(m, {}).get(max(v.items(), key=lambda kv: kv[1])[0]) if v else None}
                          for m, v in res_all.items()}
    save_report(rpt)
    save(stage_path('3_fix.blend'))


# ================================================================================================ stage: pack
def node_name(mod, part, variant):
    n = mod
    if part and part != 'main': n += '-' + part
    if variant: n += '-' + variant
    return n


def _select(obs, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = active


def split_by_face_value(ob, values, name_of, props_of):
    """duplicate ob once per distinct face value; each copy keeps only its faces. returns {value: object}."""
    out = {}
    for val in sorted(set(values)):
        o = ob.copy(); o.data = ob.data.copy(); o.name = name_of(val); o.data.name = o.name
        for c in ob.users_collection: c.objects.link(o)
        bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if values[f.index] != val], context='FACES')
        bm.to_mesh(o.data); bm.free()
        for k, v in props_of(val).items(): o[k] = v
        out[val] = o
    return out


def body_masks():
    extra = json.load(open(os.path.join(FINAL, 'extra_masks.json')))
    mask = np.zeros(len(bpy.data.objects['Body'].data.polygons), dtype=np.int32)
    for bit, m in enumerate(HIDERS):
        for i in list(MAN[m]['hides_body_faces']) + list(extra.get(m, [])): mask[i] |= 1 << bit
    return mask


def mask_mods(val): return [m for bit, m in enumerate(HIDERS) if val >> bit & 1]


def chunk_name(val, base='Body'): return base if not val else base + '__' + '__'.join(mask_mods(val))


def stage_pack():
    bpy.ops.wm.open_mainfile(filepath=stage_path('3_fix.blend'))
    obj = bpy.data.objects; rig = obj['Rig']
    rpt = load_report()
    # ---- Body: store the hide mask as a face attribute (the LOD stage decimates once, then splits every level)
    body = obj['Body']; mask = body_masks()
    at = body.data.attributes.new('hidemask', 'INT', 'FACE'); at.data.foreach_set('value', mask)
    body['module'] = 'body'; body['part'] = 'skin'
    vals, cnt = np.unique(mask, return_counts=True)
    rpt['body_chunks'] = {chunk_name(int(v)): {'hidden_by': mask_mods(int(v)), 'faces': int(c)} for v, c in zip(vals, cnt)}
    log('body chunks', rpt['body_chunks'])
    # ---- hair shells: faces inside the helmet -> HairShellN__helmet (hidden while the helmet is on)
    hb = MAN['helmet']['hides_base']
    for i in range(1, 6):
        n = f'HairShell{i}'; o = obj[n]
        v = np.zeros(len(o.data.polygons), dtype=np.int32); v[hb.get(n, [])] = 1
        parts = split_by_face_value(o, v, lambda x, n=n: n if x == 0 else n + '__helmet',
                                    lambda x: {'module': 'body', 'part': 'hair', 'hidden_by': 'helmet' if x else ''})
        bpy.data.objects.remove(o)
        for o2 in parts.values(): o2.name = o2.name.split('.')[0]; o2.data.name = o2.name
    for n in ('Eyes', 'Mouth', 'Brows', 'Lashes'):
        obj[n]['module'] = 'body'; obj[n]['part'] = n.lower()
    # ---- one joined skinned mesh per module / part / variant
    groups = {}
    for o in list(obj):
        if o.type != 'MESH' or o.get('module') in (None, 'body'): continue
        key = (o['module'], o.get('part', 'main'), o.get('variant'))
        groups.setdefault(key, []).append(o)
    nodes = {}
    for (m, part, var), obs in sorted(groups.items(), key=lambda kv: str(kv[0])):
        obs.sort(key=lambda o: o.name)
        src = [o.name for o in obs]
        if len(obs) > 1:
            _select(obs, obs[0]); bpy.ops.object.join()
        o = obs[0]; nm = node_name(m, part, var)
        o.name = nm; o.data.name = nm
        o['module'] = m; o['part'] = part
        if var: o['variant'] = var
        prt = MAN[m].get('parts', {}).get(part, {})
        req = list(prt.get('requires', [])) + list(EXTRA_RULES.get((m, var), {}).get('requires', []))
        o['requires'] = ','.join(MAN[m].get('requires', []))
        o['part_requires'] = ','.join(req)
        o['hidden_with'] = ','.join(prt.get('hidden_with', []))
        o['exclusive_with'] = ','.join(MAN[m].get('exclusive_with', []))
        o['source_meshes'] = ','.join(src)
        nodes[nm] = {'module': m, 'part': part, 'variant': var, 'meshes': src,
                     'tris': sum(len(p.vertices) - 2 for p in o.data.polygons),
                     'materials': [x.name for x in o.data.materials]}
    rpt['nodes'] = nodes
    log('nodes', len(nodes))
    save_report(rpt)
    save(stage_path('4_pack.blend'))


# ================================================================================================ stage: lods
LOD_SPEC = {1: 0.45, 2: 0.20}
DROP_LOD2 = ('knife-knife', 'knife-multitool', 'eyewear-glasses', 'carrier-led', 'headset-downlead')
HAIR_KEEP = {1: (1, 3, 5), 2: (1, 4)}


def tri_count(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)


def decimate(ob, ratio, protect=None):
    """collapse-decimate a copy in place; protect: vertex weights (1 = keep) -> silhouette / hem / chunk borders."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3]); bm.to_mesh(ob.data); bm.free()
    if ratio >= 0.999: return
    target_tris = tri_count(ob) * ratio
    vg = None
    if protect is not None:
        vg = ob.vertex_groups.new(name='_protect')
        for i, w in enumerate(protect):
            if w > 0: vg.add([i], float(w), 'REPLACE')
    for m in list(ob.modifiers):
        if m.type == 'ARMATURE': ob.modifiers.remove(m)
    d = ob.modifiers.new('Dec', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True
    if vg: d.vertex_group = '_protect'; d.vertex_group_factor = 1.0
    _select([ob], ob); bpy.ops.object.modifier_apply(modifier='Dec')
    if vg and protect is not None and tri_count(ob) > target_tris * 1.15:
        # protection saturated (hard-surface parts are mostly borders): finish without it
        d = ob.modifiers.new('Dec', 'DECIMATE'); d.ratio = target_tris / max(tri_count(ob), 1)
        d.use_collapse_triangulate = True
        _select([ob], ob); bpy.ops.object.modifier_apply(modifier='Dec')
    if vg: ob.vertex_groups.remove(ob.vertex_groups['_protect'])
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    a = ob.modifiers.new('Armature', 'ARMATURE'); a.object = bpy.data.objects['Rig']


def protect_weights(ob, extra_border_attr=None):
    """1 on open borders, sharp creases (silhouette-ish), UV-seam-free; 0 elsewhere."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    w = np.zeros(len(bm.verts))
    for e in bm.edges:
        hard = e.is_boundary
        if hard:
            for v in e.verts: w[v.index] = 1.0
    if extra_border_attr:
        lay = bm.faces.layers.int.get(extra_border_attr)
        for v in bm.verts:
            if len({f[lay] for f in v.link_faces}) > 1: w[v.index] = 1.0
    bm.free()
    return w


def make_lod(src, lvl, ratio, name=None):
    o = src.copy(); o.data = src.data.copy(); o.name = name or f'{src.name}_LOD{lvl}'; o.data.name = o.name
    for c in src.users_collection: c.objects.link(o)
    o['lod'] = lvl
    decimate(o, ratio, protect_weights(o, 'hidemask' if 'hidemask' in o.data.attributes else None))
    return o


def stage_lods():
    bpy.ops.wm.open_mainfile(filepath=stage_path('4_pack.blend'))
    obj = bpy.data.objects; rpt = load_report()
    lod0 = [o for o in obj if o.type == 'MESH' and 'module' in o]
    for o in lod0: o['lod'] = 0
    made = {1: [], 2: []}
    for o in list(lod0):
        n = o.name; t = tri_count(o)
        if n == 'Body' or n.startswith('HairShell'): continue
        for lvl in (1, 2):
            if n in ('Brows', 'Lashes'): continue
            if lvl == 2 and (n in DROP_LOD2 or n == 'Mouth'): continue
            if n in ('Eyes', 'Mouth'): r = 1.0 if lvl == 1 else 0.35
            else:
                mr = MAN.get(o['module'], {}).get('lod_ratios', [1, 0.45, 0.2])
                r = min(mr[lvl], LOD_SPEC[lvl] + 0.02)
                r = max(r, min(1.0, 60.0 / max(t, 1)))           # tiny parts keep a minimum of ~60 tris
            made[lvl].append(make_lod(o, lvl, r))
    # hair shells: subset per level (no decimation: 186-quad shells)
    for o in list(lod0):
        if o.name.startswith('HairShell'):
            k = int(o.name[9])
            for lvl in (1, 2):
                if k in HAIR_KEEP[lvl]: made[lvl].append(make_lod(o, lvl, 1.0))
    # Body: decimate the whole skin once per level (chunk borders protected), then split every level by mask
    body = obj['Body']
    levels = {0: body}
    for lvl in (1, 2):
        levels[lvl] = make_lod(body, lvl, {1: 0.45, 2: 0.2}[lvl], name=f'Body_LOD{lvl}')
    chunks = {}
    for lvl, b in levels.items():
        me = b.data; v = np.zeros(len(me.polygons), dtype=np.int32); me.attributes['hidemask'].data.foreach_get('value', v)
        parts = split_by_face_value(b, v, lambda x, lvl=lvl: chunk_name(int(x)) + (f'_LOD{lvl}' if lvl else '.tmp'),
                                    lambda x, lvl=lvl: {'module': 'body', 'part': 'skin', 'lod': lvl,
                                                        'hidden_by': ','.join(mask_mods(int(x)))})
        bpy.data.objects.remove(b)
        for x, o in parts.items():
            if lvl == 0: o.name = chunk_name(int(x)); o.data.name = o.name
            chunks.setdefault(o.name.split('_LOD')[0], {})[lvl] = tri_count(o)
            (made[lvl] if lvl else lod0).append(o)
    lod0 = [o for o in obj if o.type == 'MESH' and 'module' in o and o.get('lod', 0) == 0]
    rpt['body_chunk_tris'] = chunks
    # report: tris per LOD per preset, draw calls
    import render_rig as RR
    rpt['lod_tris'] = {}
    for pname, lo in PRESETS.items():
        on = RR.resolve(lo, MAN); row = {}
        for lvl in (0, 1, 2):
            obs = [o for o in obj if o.type == 'MESH' and 'module' in o and o.get('lod', 0) == lvl]
            vis = [o for o in obs if RR.visible(_as_lod0(o), on, MAN)]
            row[f'LOD{lvl}'] = {'tris': sum(tri_count(o) for o in vis), 'draw_calls': sum(len(o.data.materials) for o in vis),
                                'nodes': len(vis)}
        rpt['lod_tris'][pname] = row
    log(json.dumps(rpt['lod_tris']))
    for o in obj:
        if o.type == 'MESH' and o.get('lod', 0) > 0: o.hide_render = True; o.hide_viewport = True
    # Assault visibility in the shipped blend
    on = RR.resolve(PRESETS['Assault'], MAN)
    for o in obj:
        if o.type == 'MESH' and 'module' in o and o.get('lod', 0) == 0:
            v = RR.visible(o, on, MAN); o.hide_render = not v; o.hide_viewport = not v
    save_report(rpt)
    save(os.path.join(FINAL, 'human_rig.blend'))


class _as_lod0:
    """visibility test for a LOD copy: same props, lod forced to 0."""
    def __init__(self, o): self.o = o
    def get(self, k, d=None): return 0 if k == 'lod' else self.o.get(k, d)


# ================================================================================================ stage: export
def realtime_materials():
    """glTF-friendly shading: Base Color = albedo x COLOR_0 (AO), ORM -> roughness / metal. The WEAR colour channel
    (per-vertex, too soft to read in realtime and on tiling textures not bakeable per asset) is dropped from the
    realtime files; it stays in human_rig.blend for Cycles."""
    for mt in bpy.data.materials:
        if not mt.name.startswith('MAT_') or not mt.node_tree: continue
        N, L = mt.node_tree.nodes, mt.node_tree.links
        bs = N.get('Principled BSDF')
        mx = next((n for n in N if n.type == 'MIX' and n.inputs[7].is_linked and n.inputs[7].links[0].from_node.type == 'VERTEX_COLOR'), None)
        sp = next((n for n in N if n.type == 'SEPARATE_COLOR'), None)
        if mx: L.new(mx.outputs[2], bs.inputs['Base Color'])
        if sp:
            L.new(sp.outputs['Green'], bs.inputs['Roughness'])
        # fixB: the glTF exporter writes Sheen Tint as sheenColorFactor and ignores Sheen Weight, so the fabrics'
        # faint 0.06 x 0.08 fuzz went out as a 0.08 grey sheen layer (5x the 0.015 cordura albedo): realtime
        # fabric read mid-grey. Bake the weight into the tint (the glTF sheen colour is already weight x tint).
        w = bs.inputs['Sheen Weight'].default_value
        if 0 < w < 1:
            t = bs.inputs['Sheen Tint'].default_value
            bs.inputs['Sheen Tint'].default_value = (t[0] * w, t[1] * w, t[2] * w, 1.0)
            bs.inputs['Sheen Weight'].default_value = 1.0
        for n in list(N):
            if n.type == 'ATTRIBUTE': N.remove(n)
    for o in bpy.data.objects:
        if o.type == 'MESH' and 'WEAR' in o.data.color_attributes:
            o.data.color_attributes.remove(o.data.color_attributes['WEAR'])
    # realtime eye cornea: clear alpha shell (no transmission in glTFast / mobile)
    c = bpy.data.materials.get('BASE_Cornea')
    if c:
        b = c.node_tree.nodes['Principled BSDF']
        b.inputs['Transmission Weight'].default_value = 0.0; b.inputs['Alpha'].default_value = 0.12
        c.surface_render_method = 'BLENDED'


def game_textures(kind):
    """write every image as JPEG (PNG when it has alpha) into the delivery / web folder and repoint the images."""
    from PIL import Image
    out = os.path.join(DELIVER, 'textures') if kind == 'game' else os.path.join(FINAL, 'textures_web')
    os.makedirs(out, exist_ok=True)
    cap = 2048 if kind == 'game' else 1024
    done = {}
    for im in bpy.data.images:
        src = im.get('src_path') or bpy.path.abspath(im.filepath)
        if not src or not os.path.exists(src): continue
        im['src_path'] = src
        base = os.path.splitext(os.path.basename(src))[0]
        if 'skin' in base or 'hair' in base or 'eye' in base: pass
        pil = Image.open(src)
        alpha = pil.mode in ('RGBA', 'LA') and 'hair' in base
        pil = pil.convert('RGBA' if alpha else 'RGB')
        if max(pil.size) > cap: pil = pil.resize((cap, cap), Image.LANCZOS)
        dst = os.path.join(out, base + ('.png' if alpha else '.jpg'))
        if alpha: pil.save(dst, optimize=True)
        else: pil.save(dst, quality=92 if 'normal' in base else 88)
        cs = im.colorspace_settings.name
        im.filepath = dst; im.reload(); im.colorspace_settings.name = cs
        done[im.name] = os.path.basename(dst)
    return done


def export_glb(path, meshes, extra_objs=()):
    rig = bpy.data.objects['Rig']
    for o in bpy.data.objects:
        o.select_set(False)
    for o in list(meshes) + list(extra_objs) + [rig]:
        o.hide_set(False); o.hide_viewport = False; o.hide_render = False; o.select_set(True)
    rig.animation_data.action = None
    for tr in rig.animation_data.nla_tracks: tr.mute = False
    for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_skins=True, export_apply=False, export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                              # fixB: constant channels collapse to 2 keys (every bone keeps a track in every clip, so
                              # Unity Legacy / three.js never inherit a pose from the previous clip); was all samples
                              export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True,
                              export_anim_single_armature=True,
                              export_reset_pose_bones=True, export_def_bones=False, export_extras=True,
                              export_morph=False, export_all_influences=False, export_tangents=True,
                              export_image_format='AUTO', export_vertex_color='MATERIAL')
    for tr in rig.animation_data.nla_tracks: tr.mute = True
    log('exported', path, round(os.path.getsize(path) / 1e6, 2), 'MB')


def fix_degenerate_uv(o):
    """faces whose UV triangle has ~zero area give zero MikkTSpace tangents (validator ACCESSOR_VECTOR3_NON_UNIT):
    open them up by a hair (1e-4 UV units, invisible on tiling textures)."""
    me = o.data; uv = me.uv_layers.get('UVMap')
    if uv is None: return 0
    n = 0
    for p in me.polygons:
        li = list(p.loop_indices)
        U = [Vector(uv.data[i].uv) for i in li]
        for k in range(1, len(U) - 1):
            a = (U[k] - U[0]).cross(U[k + 1] - U[0]) if hasattr(Vector, 'cross') else 0
            area = abs((U[k] - U[0]).x * (U[k + 1] - U[0]).y - (U[k] - U[0]).y * (U[k + 1] - U[0]).x)
            if area < 1e-10:
                uv.data[li[k]].uv = (U[k].x + 1e-4, U[k].y)
                uv.data[li[k + 1]].uv = (U[k + 1].x, U[k + 1].y + 1e-4)
                n += 1
    return n


LABELS = {'shirt': 'Combat shirt', 'trousers': 'Combat trousers', 'boots': 'Boots', 'gloves': 'Gloves', 'kneepads': 'Knee pads',
          'elbowpads': 'Elbow pads', 'carrier': 'Plate carrier', 'helmet': 'Helmet', 'neck_groin': 'Neck + groin',
          'belt': 'Battle belt', 'rifle_mags': 'Rifle mags', 'pistol_mags': 'Pistol mags', 'chest_rig': 'Chest rig',
          'dump': 'Dump pouch', 'ifak': 'IFAK + TQ', 'radio': 'Radio + PTT', 'admin_hydration': 'Admin + hydration',
          'holster_drop': 'Holster', 'holster_belt': 'Belt holster', 'sling': 'Sling', 'headset': 'Headset',
          'eyewear': 'Eyewear', 'bang_pouches': 'Bang pouches', 'knife': 'Knife / tool'}
GROUPS = [('base', 'Base layer'), ('armor', 'Armour'), ('loadbearing', 'Load bearing'), ('sidearm_misc', 'Sidearm + kit')]


def write_viewer_manifest(rpt):
    mods = []
    for m in MODS:
        d = MAN[m]
        mods.append({'id': m, 'group': d['group'], 'label': LABELS[m], 'tris': d['tris'],
                     'variants': list(d.get('variants', {}).keys()), 'default_variant': d.get('default_variant') or '',
                     'requires': d.get('requires', []), 'exclusive_with': d.get('exclusive_with', [])})
    man = {'modules': mods, 'groups': GROUPS, 'presets': PRESETS, 'preset_order': ['Body', 'Base', 'Light', 'Assault', 'Full'],
           'ground_offset_m': GROUND, 'lod_tris': rpt.get('lod_tris'), 'clips': rpt.get('clips')}
    json.dump(man, open(os.path.join(FINAL, 'viewer_manifest.json'), 'w'))


def stage_export():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(FINAL, 'human_rig.blend'))
    obj = bpy.data.objects; rig = obj['Rig']
    os.makedirs(os.path.join(DELIVER, 'unity'), exist_ok=True)
    rpt = load_report()
    realtime_materials()
    meshes = [o for o in obj if o.type == 'MESH' and 'module' in o]
    for o in meshes:                                   # skinned meshes at the root (validator: no NON_ROOT warnings)
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    sockets = [o for o in obj if o.name.startswith('SOCKET_')]
    rpt['cleaned'] = {}
    for o in meshes:
        bm = bmesh.new(); bm.from_mesh(o.data); nf = len(bm.faces)
        bmesh.ops.dissolve_degenerate(bm, dist=2e-6, edges=bm.edges[:])
        bad = [f for f in bm.faces if f.calc_area() < 1e-12]
        if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
        bm.to_mesh(o.data); bm.free(); o.data.validate(clean_customdata=False)
        if nf != len(o.data.polygons): rpt['cleaned'][o.name] = nf - len(o.data.polygons)
    rpt['uv_nudged'] = {o.name: n for o in meshes for n in [fix_degenerate_uv(o)] if n}
    lod0 = [o for o in meshes if o.get('lod', 0) == 0]
    rpt['textures_game'] = game_textures('game')
    export_glb(os.path.join(DELIVER, 'human-rig.glb'), lod0, sockets)
    for o in lod0: o.name = o.name + '_LOD0'; o.data.name = o.name
    export_glb(os.path.join(DELIVER, 'unity', 'human-rig.glb'), meshes, sockets)
    write_viewer_manifest(rpt)
    rpt['textures_web'] = game_textures('web')
    export_glb(os.path.join(FINAL, 'human-rig_web.glb'), meshes, sockets)
    save_report(rpt)

# ================================================================================================ dispatcher
STAGES = ['assemble', 'anim', 'fix', 'pack', 'lods', 'export']

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', action='append', default=[])
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--from', dest='frm', default=None)
    a = ap.parse_args(C.argv())
    todo = STAGES if a.all else (STAGES[STAGES.index(a.frm):] if a.frm else a.stage)
    for s in todo:
        log('=== stage', s)
        globals()['stage_' + s]()
    log('done', todo)
