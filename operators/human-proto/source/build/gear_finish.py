# second half of gear_build.py (exec'd in its namespace): textures, bake, materials, rig hookup, save, export
from PIL import Image as PImg

# ---------------------------------------------------------------- tiling detail textures (numpy)
def save_gray(arr, path):
    PImg.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(path)
def ripstop(n=512, threads=24):
    u = np.linspace(0, 2 * np.pi * threads, n, endpoint=False)
    U, V = np.meshgrid(u, u)
    over = np.sign(np.sin(U / 2) * np.sin(V / 2))
    h = 0.5 + 0.25 * (np.cos(U) * (over > 0) + np.cos(V) * (over < 0))
    g = np.linspace(0, 1, n, endpoint=False); G1, G2 = np.meshgrid(g, g)
    rib = np.maximum(np.exp(-((G1 - 0.5) / 0.018) ** 2), np.exp(-((G2 - 0.5) / 0.018) ** 2))
    return np.clip(h * 0.75 + rib * 0.35, 0, 1)
def cordura(n=512, threads=32):
    rng = np.random.default_rng(3)
    u = np.linspace(0, 2 * np.pi * threads, n, endpoint=False)
    U, V = np.meshgrid(u, u)
    j = np.fft.ifft2(np.fft.fft2(rng.random((n, n))) * np.exp(-(np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None] ** 2) / 0.002)).real
    j = (j - j.min()) / (j.max() - j.min())
    h = 0.5 + 0.22 * np.cos(U + 2.5 * j) * np.cos(V / 2) + 0.22 * np.cos(V + 2.5 * j) * np.sin(U / 2)
    return np.clip(h + 0.25 * (j - 0.5), 0, 1)
save_gray(ripstop(), os.path.join(TEX, 'tile_ripstop_h.png'))
save_gray(cordura(), os.path.join(TEX, 'tile_cordura_h.png'))

# metres per UV unit on the body atlas (for ripstop scale)
a3 = sum(p.area for p in me.polygons)
def uv_area(m):
    s = 0.0; uvd = m.uv_layers['UVMap'].data
    for p in m.polygons:
        pts = [uvd[li].uv for li in p.loop_indices]
        for k in range(1, len(pts) - 1):
            s += abs((pts[k] - pts[0]).cross(pts[k + 1] - pts[0])) / 2
    return s
MPU = math.sqrt(a3 / uv_area(me))

# ---------------------------------------------------------------- node helpers
def N(nt, t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items():
        if k.startswith('i_'): n.inputs[k[2:].replace('_', ' ')].default_value = v
        else: setattr(n, k, v)
    return n
def L(nt, a, b): nt.links.new(a, b)
def attr(nt, name):
    return N(nt, 'ShaderNodeAttribute', attribute_name=name).outputs['Fac']
def math_(nt, op, a, b=None, c=None, clamp=False):
    n = N(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    for i, v in enumerate((a, b, c)):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: L(nt, v, n.inputs[i])
    return n.outputs[0]
def mix(nt, fac, a, b):
    n = N(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MIX')
    for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
        if isinstance(v, (int, float)): sock.default_value = v
        elif isinstance(v, tuple): sock.default_value = (*v, 1) if len(v) == 3 else v
        else: L(nt, v, sock)
    return n.outputs[2]
def ramp(nt, fac, stops, constant=False):
    n = N(nt, 'ShaderNodeValToRGB'); cr = n.color_ramp
    if constant: cr.interpolation = 'CONSTANT'
    while len(cr.elements) < len(stops): cr.elements.new(0.5)
    for e, (pos, col) in zip(cr.elements, stops):
        e.position = pos; e.color = (*col, 1) if len(col) == 3 else col
    L(nt, fac, n.inputs[0]); return n.outputs[0]

def bake_mat_clothing():
    mt = bpy.data.materials.new('Clothing_bake'); mt.use_nodes = True; nt = mt.node_tree
    bs = nt.nodes['Principled BSDF']
    gid = math_(nt, 'DIVIDE', attr(nt, 'gid'), 8.0)
    base = ramp(nt, gid, [(0.0, (0.022, 0.023, 0.026)), (0.1, (0.034, 0.033, 0.032)), (0.22, (0.014, 0.014, 0.015)),
                          (0.35, (0.018, 0.018, 0.018))], constant=True)
    rgh = ramp(nt, gid, [(0.0, (0.86,) * 3), (0.1, (0.88,) * 3), (0.22, (0.66,) * 3), (0.35, (0.58,) * 3)], constant=True)
    # sole (z < 0.012) rubber
    sole = math_(nt, 'LESS_THAN', attr(nt, 'zpos'), 0.004)
    base = mix(nt, sole, base, (0.014, 0.014, 0.015))
    # weave
    uv = N(nt, 'ShaderNodeUVMap', uv_map='UVMap')
    mp = N(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (MPU / 0.007, MPU / 0.007, 1)
    L(nt, uv.outputs[0], mp.inputs[0])
    wv = N(nt, 'ShaderNodeTexImage', image=bpy.data.images.load(os.path.join(TEX, 'tile_ripstop_h.png')))
    wv.image.colorspace_settings.name = 'Non-Color'; L(nt, mp.outputs[0], wv.inputs[0])
    # boots: coarser cordura upper, use same tile
    seam = attr(nt, 'seam')
    ridge = math_(nt, 'SUBTRACT', 1.0, math_(nt, 'DIVIDE', seam, 0.0035, clamp=True), clamp=True)
    groove = math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', 1.0, math_(nt, 'DIVIDE', math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', seam, 0.006)), 0.0012, clamp=True), clamp=True), -0.6)
    geo = N(nt, 'ShaderNodeNewGeometry')
    nz = N(nt, 'ShaderNodeTexNoise', i_Scale=22.0, i_Detail=6.0); L(nt, geo.outputs['Position'], nz.inputs['Vector'])
    nzb = N(nt, 'ShaderNodeTexNoise', i_Scale=140.0, i_Detail=3.0); L(nt, geo.outputs['Position'], nzb.inputs['Vector'])
    dust = math_(nt, 'MULTIPLY', attr(nt, 'dust'), math_(nt, 'MULTIPLY_ADD', nz.outputs['Fac'], 1.6, -0.35), clamp=True)
    ao = N(nt, 'ShaderNodeAmbientOcclusion', samples=8, inside=False, only_local=False); ao.inputs['Distance'].default_value = 0.05
    col = mix(nt, math_(nt, 'MULTIPLY', ridge, 0.35), base, (0.075, 0.074, 0.072))
    col = mix(nt, math_(nt, 'MULTIPLY', dust, 0.45), col, (0.13, 0.12, 0.10))
    variation = math_(nt, 'MULTIPLY_ADD', nzb.outputs['Fac'], 0.25, 0.88)
    cm = N(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); cm.inputs[0].default_value = 1.0
    L(nt, col, cm.inputs[6]); L(nt, math_(nt, 'MULTIPLY', variation, math_(nt, 'MULTIPLY_ADD', ao.outputs['AO'], 0.45, 0.55)), cm.inputs[7])
    L(nt, cm.outputs[2], bs.inputs['Base Color'])
    sepr = N(nt, 'ShaderNodeRGBToBW'); L(nt, rgh, sepr.inputs[0])
    L(nt, math_(nt, 'ADD', sepr.outputs[0], math_(nt, 'MULTIPLY', dust, 0.12), clamp=True), bs.inputs['Roughness'])
    h = math_(nt, 'ADD', math_(nt, 'MULTIPLY', wv.outputs['Color'], 0.5), math_(nt, 'ADD', ridge, groove))
    bp = N(nt, 'ShaderNodeBump', i_Strength=0.55, i_Distance=0.0015); L(nt, h, bp.inputs['Height'])
    L(nt, bp.outputs['Normal'], bs.inputs['Normal'])
    return mt

def bake_mat_cordura():
    mt = bpy.data.materials.new('Cordura_bake'); mt.use_nodes = True; nt = mt.node_tree
    bs = nt.nodes['Principled BSDF']
    geo = N(nt, 'ShaderNodeNewGeometry')
    mu = N(nt, 'ShaderNodeUVMap', uv_map='MolleUV'); sp = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, mu.outputs[0], sp.inputs[0])
    fu = math_(nt, 'FRACT', math_(nt, 'DIVIDE', sp.outputs[0], 0.0381))
    fv = math_(nt, 'FRACT', math_(nt, 'DIVIDE', sp.outputs[1], 0.0254))
    su = math_(nt, 'LESS_THAN', math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', fu, 0.5)), 0.33)
    sv = math_(nt, 'LESS_THAN', math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', fv, 0.5)), 0.125)
    slot = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', su, sv), math_(nt, 'GREATER_THAN', attr(nt, 'mask'), 0.5))
    tex = N(nt, 'ShaderNodeTexImage', image=bpy.data.images.load(os.path.join(TEX, 'tile_cordura_h.png')), projection='BOX', projection_blend=0.3)
    tex.image.colorspace_settings.name = 'Non-Color'
    sc = N(nt, 'ShaderNodeVectorMath', operation='SCALE'); sc.inputs['Scale'].default_value = 1 / 0.012
    L(nt, geo.outputs['Position'], sc.inputs[0]); L(nt, sc.outputs[0], tex.inputs[0])
    nz = N(nt, 'ShaderNodeTexNoise', i_Scale=18.0, i_Detail=6.0); L(nt, geo.outputs['Position'], nz.inputs['Vector'])
    wear = math_(nt, 'MULTIPLY', ramp(nt, geo.outputs['Pointiness'], [(0.52, (0, 0, 0)), (0.62, (1, 1, 1))]).node.outputs[0] if False else
                 N(nt, 'ShaderNodeMapRange', i_From_Min=0.53, i_From_Max=0.64).outputs[0], 1.0)
    mr = wear.node if hasattr(wear, 'node') else None
    mrn = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeMapRange'][-1]; L(nt, geo.outputs['Pointiness'], mrn.inputs['Value'])
    wear = math_(nt, 'MULTIPLY', mrn.outputs[0], math_(nt, 'MULTIPLY_ADD', nz.outputs['Fac'], 1.8, -0.5), clamp=True)
    ao = N(nt, 'ShaderNodeAmbientOcclusion', samples=8, only_local=False); ao.inputs['Distance'].default_value = 0.03
    crev = math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', 1.0, ao.outputs['AO']), nz.outputs['Fac'])
    col = mix(nt, math_(nt, 'MULTIPLY', tex.outputs['Color'], 0.6), (0.016, 0.017, 0.018), (0.03, 0.031, 0.032))
    col = mix(nt, slot, col, (0.006, 0.006, 0.007))
    col = mix(nt, math_(nt, 'MULTIPLY', wear, 0.8), col, (0.11, 0.105, 0.098))
    col = mix(nt, math_(nt, 'MULTIPLY', crev, 0.9, clamp=True), col, (0.11, 0.10, 0.085))
    cm = N(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); cm.inputs[0].default_value = 1.0
    L(nt, col, cm.inputs[6]); L(nt, math_(nt, 'MULTIPLY_ADD', ao.outputs['AO'], 0.5, 0.5), cm.inputs[7])
    L(nt, cm.outputs[2], bs.inputs['Base Color'])
    L(nt, math_(nt, 'ADD', math_(nt, 'MULTIPLY_ADD', slot, 0.08, 0.80), math_(nt, 'MULTIPLY', wear, -0.15)), bs.inputs['Roughness'])
    h = math_(nt, 'ADD', math_(nt, 'MULTIPLY', tex.outputs['Color'], 0.4), math_(nt, 'MULTIPLY', slot, -1.0))
    bp = N(nt, 'ShaderNodeBump', i_Strength=0.6, i_Distance=0.002); L(nt, h, bp.inputs['Height'])
    L(nt, bp.outputs['Normal'], bs.inputs['Normal'])
    return mt

def final_mat(name, prefix):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    bs = nt.nodes['Principled BSDF']
    a = N(nt, 'ShaderNodeTexImage', image=bpy.data.images.load(os.path.join(TEX, prefix + '_albedo.png')))
    r = N(nt, 'ShaderNodeTexImage', image=bpy.data.images.load(os.path.join(TEX, prefix + '_rough.png')))
    n = N(nt, 'ShaderNodeTexImage', image=bpy.data.images.load(os.path.join(TEX, prefix + '_normal.png')))
    for im in (r, n): im.image.colorspace_settings.name = 'Non-Color'
    L(nt, a.outputs[0], bs.inputs['Base Color'])
    L(nt, r.outputs[0], bs.inputs['Roughness'])
    nm = N(nt, 'ShaderNodeNormalMap'); L(nt, n.outputs[0], nm.inputs['Color']); L(nt, nm.outputs[0], bs.inputs['Normal'])
    return mt

# carrier UVs
for o in bpy.context.view_layer.objects: o.select_set(o == carrier_cloth)
bpy.context.view_layer.objects.active = carrier_cloth
carrier_cloth.data.uv_layers.active = carrier_cloth.data.uv_layers.new(name='UVMap') if 'UVMap' not in carrier_cloth.data.uv_layers else carrier_cloth.data.uv_layers['UVMap']
carrier_cloth.data.uv_layers['UVMap'].active_render = True
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.view_layer.objects: o.select_set(o == hard)
bpy.context.view_layer.objects.active = hard
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
bpy.ops.object.mode_set(mode='OBJECT')

def bake(ob, mt, prefix, res):
    ob.data.materials.clear(); ob.data.materials.append(mt)
    ob.data.uv_layers['UVMap'].active = True
    imgs = {}
    for kind, cs in (('albedo', 'sRGB'), ('rough', 'Non-Color'), ('normal', 'Non-Color')):
        im = bpy.data.images.new(f'{prefix}_{kind}', res, res, alpha=False, float_buffer=False)
        im.colorspace_settings.name = cs; imgs[kind] = im
    node = mt.node_tree.nodes.new('ShaderNodeTexImage'); mt.node_tree.nodes.active = node
    scn.render.engine = 'CYCLES'; scn.cycles.device = 'CPU'
    scn.render.bake.margin = 8; scn.render.bake.use_clear = True
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    for kind, typ, samples in (('albedo', 'DIFFUSE', 8), ('rough', 'ROUGHNESS', 1), ('normal', 'NORMAL', 4)):
        node.image = imgs[kind]; scn.cycles.samples = samples
        t = time.time()
        kw = dict(type=typ, use_clear=True, margin=8)
        if typ == 'DIFFUSE': kw['pass_filter'] = {'COLOR'}
        bpy.ops.object.bake(**kw)
        imgs[kind].filepath_raw = os.path.join(TEX, f'{prefix}_{kind}.png'); imgs[kind].file_format = 'PNG'; imgs[kind].save()
        print('baked', prefix, kind, round(time.time() - t, 1), 's', flush=True)

# body faces hidden under clothing (before bake so AO sees the right body)
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[i] for i in hidden], context='FACES')
bm.to_mesh(me); bm.free()
json.dump({'note': 'Body polygon indices (base mesh order, human_base.blend Body) deleted under clothing',
           'count': len(hidden), 'faces': hidden}, open(os.path.join(OUT, 'hidden_body_faces.json'), 'w'))

if BAKE:
    bake(uniform, bake_mat_clothing(), 'clothing', BAKE_RES)
    bake(carrier_cloth, bake_mat_cordura(), 'cordura', BAKE_RES)
    _mpu = MPU; MPU = math.sqrt(sum(p.area for p in boots.data.polygons) / uv_area(boots.data))
    bake(boots, bake_mat_clothing(), 'boots', 1024); MPU = _mpu
if os.path.exists(os.path.join(TEX, 'clothing_albedo.png')):
    uniform.data.materials.clear(); uniform.data.materials.append(final_mat('Clothing', 'clothing'))
    carrier_cloth.data.materials.clear(); carrier_cloth.data.materials.append(final_mat('Cordura', 'cordura'))
if os.path.exists(os.path.join(TEX, 'boots_albedo.png')):
    boots.data.materials.clear(); boots.data.materials.append(final_mat('Boots', 'boots'))
for ob in (uniform, carrier_cloth, boots):
    for a in ('dust', 'seam', 'zpos', 'gid', 'mask'):
        if a in ob.data.attributes: ob.data.attributes.remove(ob.data.attributes[a])
    if 'MolleUV' in ob.data.uv_layers: ob.data.uv_layers.remove(ob.data.uv_layers['MolleUV'])

# ngons -> tris (glTF exporter skips tangents on meshes with ngons -> validator warning)
for ob in (carrier_cloth, hard, pads_ob, boots):
    _b = bmesh.new(); _b.from_mesh(ob.data)
    bmesh.ops.triangulate(_b, faces=[f for f in _b.faces if len(f.verts) > 4]); _b.to_mesh(ob.data); _b.free()
# ---------------------------------------------------------------- rig hookup
GEAR = [uniform, boots, pads_ob, carrier_cloth, hard]
for ob in GEAR:
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    ob.parent = rig
    if 'src' in ob: del ob['src']
sd = uniform.modifiers.new('Subdiv', 'SUBSURF'); sd.levels = sd.render_levels = 1

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
report = {'objects': {o.name: {'verts': len(o.data.vertices), 'tris': tris(o), 'materials': [m.name for m in o.data.materials]}
                      for o in [body] + GEAR + [bpy.data.objects['Eyes'], bpy.data.objects['Mouth']]},
          'hidden_body_faces': len(hidden), 'mpu': MPU, 'build_s': round(time.time() - T0, 1)}
print(json.dumps(report, indent=1))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'human_gear.blend'), compress=True)
if os.path.exists(os.path.join(OUT, 'human_gear.blend1')): os.remove(os.path.join(OUT, 'human_gear.blend1'))

EXP = [body, bpy.data.objects['Eyes'], bpy.data.objects['Mouth']] + GEAR
def export(path, subdiv):
    for o in EXP:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in (body, uniform): o.modifiers['Subdiv'].show_viewport = subdiv
    for o in bpy.context.view_layer.objects: o.select_set(o in EXP or o == rig)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_skins=True, export_apply=subdiv, export_animations=False,
                              export_morph=False, export_all_influences=False, export_tangents=True,
                              export_image_format='JPEG', export_jpeg_quality=90)
if '--no-export' not in argv:
    export(os.path.join(OUT, 'human_gear.glb'), False)
    export(os.path.join(OUT, 'human_gear_hero.glb'), True)
report['build_s'] = round(time.time() - T0, 1)
json.dump(report, open(os.path.join(OUT, 'gear_report.json'), 'w'), indent=1)
print('done', report['build_s'])
