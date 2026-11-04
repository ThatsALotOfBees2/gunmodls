"""Stage 3b: apply head/skin/eyes/hair to the human .blend (hook for the integrator).

Run:  $H/venv/bin/python $H/build/head_build.py [--tex head/textures] [--blend base/human_base.blend] [--no-export]
Out:  $H/head/human_head.blend, $H/head/human_head.glb (base res), $H/head/human_head_hero.glb (subdiv applied)

Integrator hook (inside any Blender session that has the base objects):
    import sys; sys.path.insert(0, '$H/build'); import head_build
    head_build.apply(tex_dir='$H/head/textures')       # finds Body/Rig/Eyes/Mouth/Eyelashes by name
It replaces the Skin/Eyes/Lashes materials, unhides + textures the eyelash cards and adds skinned
shell meshes HairShell1..5 and BrowShell1..2 (copies of Body faces, same UVs/weights/modifiers).
"""
import os, sys, time, argparse
import numpy as np
import bpy, bmesh
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import head_strands

H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HAIR_SHELLS = 5
BROW_SHELLS = 0     # brows are strand ribbons now (head_strands.brows); shells looked like paint flakes

def _img(path, non_color=False):
    im = bpy.data.images.load(path, check_existing=True)
    if non_color: im.colorspace_settings.name = 'Non-Color'
    return im

def _gltf_output_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g is None:
        g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g

def _new_mat(name):
    old = bpy.data.materials.get(name)
    if old: old.name = name + '_old'
    mt = bpy.data.materials.new(name); mt.use_nodes = True
    return mt, mt.node_tree.nodes, mt.node_tree.links, mt.node_tree.nodes['Principled BSDF']

def skin_material(tex):
    mt, N, L, bs = _new_mat('Skin')
    uvn = N.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
    bc = N.new('ShaderNodeTexImage'); bc.image = _img(os.path.join(tex, 'skin_basecolor.jpg'))
    nm = N.new('ShaderNodeTexImage'); nm.image = _img(os.path.join(tex, 'skin_normal.jpg'), True)
    orm = N.new('ShaderNodeTexImage'); orm.image = _img(os.path.join(tex, 'skin_orm.jpg'), True)
    for t in (bc, nm, orm): L.new(uvn.outputs['UV'], t.inputs['Vector'])
    sep = N.new('ShaderNodeSeparateColor'); L.new(orm.outputs['Color'], sep.inputs['Color'])
    nmn = N.new('ShaderNodeNormalMap'); nmn.inputs['Strength'].default_value = 1.0
    L.new(nm.outputs['Color'], nmn.inputs['Color'])
    L.new(bc.outputs['Color'], bs.inputs['Base Color'])
    L.new(sep.outputs['Green'], bs.inputs['Roughness'])
    L.new(sep.outputs['Blue'], bs.inputs['Metallic'])
    L.new(nmn.outputs['Normal'], bs.inputs['Normal'])
    bs.inputs['Subsurface Weight'].default_value = 1.0
    bs.inputs['Subsurface Radius'].default_value = (1.0, 0.38, 0.22)
    bs.inputs['Subsurface Scale'].default_value = 0.0025
    bs.subsurface_method = 'RANDOM_WALK_SKIN'
    bs.inputs['IOR'].default_value = 1.4
    bs.inputs['Specular IOR Level'].default_value = 0.5
    mt.use_backface_culling = True                       # single-sided in glTF
    go = N.new('ShaderNodeGroup'); go.node_tree = _gltf_output_group()
    L.new(sep.outputs['Red'], go.inputs['Occlusion'])
    return mt

def alpha_clip_material(name, img, cutoff, rough=0.45, spec=0.5):
    mt, N, L, bs = _new_mat(name)
    t = N.new('ShaderNodeTexImage'); t.image = img
    gt = N.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = cutoff
    L.new(t.outputs['Alpha'], gt.inputs[0]); L.new(gt.outputs[0], bs.inputs['Alpha'])
    L.new(t.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Specular IOR Level'].default_value = spec
    mt.use_backface_culling = False
    if hasattr(mt, 'surface_render_method'): mt.surface_render_method = 'DITHERED'
    return mt

def eye_materials(eyes, tex):
    me = eyes.data
    uv = np.zeros(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    # sclera/iris ball: MH texture (alpha kept); cornea dome: UVs in the bluish disc at the bottom-right
    mt, N, L, bs = _new_mat('Eyes')
    t = N.new('ShaderNodeTexImage'); t.image = _img(os.path.join(tex, 'eye_basecolor.png'))
    L.new(t.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.25
    bs.inputs['Subsurface Weight'].default_value = 0.3
    bs.inputs['Subsurface Radius'].default_value = (1.0, 0.5, 0.4)
    bs.inputs['Subsurface Scale'].default_value = 0.002
    cm, N2, L2, bc = _new_mat('Cornea')
    bc.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bc.inputs['Roughness'].default_value = 0.0
    bc.inputs['IOR'].default_value = 1.376
    bc.inputs['Transmission Weight'].default_value = 1.0
    bc.inputs['Specular IOR Level'].default_value = 0.6
    me.materials.clear(); me.materials.append(mt); me.materials.append(cm)
    ncor = 0
    for p in me.polygons:
        c = uv[list(p.loop_indices)].mean(0)
        if c[0] > 0.85 and c[1] < 0.15:
            p.material_index = 1; ncor += 1
        else:
            p.material_index = 0
    return ncor

def make_shell(body, name, faces_keep, offsets, mat):
    ob = body.copy(); ob.data = body.data.copy(); ob.name = name; ob.data.name = name
    for c in body.users_collection: c.objects.link(ob)
    me = ob.data
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    co += offsets
    me.vertices.foreach_set('co', co.ravel())
    bm = bmesh.new(); bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not faces_keep[f.index]], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(mat)
    return ob

def apply(tex_dir=None, scene=None):
    tex = tex_dir or os.path.join(H, 'head', 'textures')
    objs = bpy.data.objects
    body, eyes, lashes = objs['Body'], objs['Eyes'], objs.get('Eyelashes')
    # skin
    body.data.materials.clear(); body.data.materials.append(skin_material(tex))
    print('cornea faces', eye_materials(eyes, tex))
    # eyelash cards: MH helper strips, UVs remapped onto lash_rgba.png
    if lashes is not None:
        lo, hi = np.load(os.path.join(tex, 'lash_uv_bounds.npy'))
        me = lashes.data
        uv = np.zeros(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
        if uv.max() > 1.0001 or uv.min() > 0.05:          # not yet remapped
            me.uv_layers[0].data.foreach_set('uv', ((uv - lo) / (hi - lo)).astype(np.float32).ravel())
        me.materials.clear()
        me.materials.append(alpha_clip_material('LashCards', _img(os.path.join(tex, 'lash_rgba.png')), 0.35, 0.5, 0.3))
        lashes.hide_render = True            # helper strips stay hidden: strand lashes are grown from them
        lashes.name = 'LashHelper'
        head_strands.lashes(lashes, objs['Rig'])
    # hair + brow shells
    d = np.load(os.path.join(tex, 'hair_shells.npz'))
    vlen, vbrow, vflow = d['length'], d['brow'], d['flow']
    me = body.data
    nrm = np.array([v.normal[:] for v in me.vertices])
    fv = [list(p.vertices) for p in me.polygons]
    himg = _img(os.path.join(tex, 'hair_rgba.png'))
    keep_h = np.array([vlen[f].mean() > 0.0024 and vlen[f].min() > 0.0008 for f in fv])
    keep_b = np.array([vbrow[f].max() > 0.15 for f in fv])
    # taper the shell stack to the skin at the edge of the shelled region (no visible 'step' in the fade)
    outside = np.zeros(len(me.vertices), bool)
    for f, kp in zip(fv, keep_h):
        if not kp: outside[f] = True
    taper = np.where(outside, 0.0, 1.0)
    for _ in range(2):                                   # two rings of smoothing
        acc = np.zeros(len(taper)); cnt = np.zeros(len(taper))
        for f in fv:
            m = taper[f].mean(); acc[f] += m; cnt[f] += 1
        taper = np.minimum(taper, np.where(cnt > 0, acc / np.maximum(cnt, 1), taper))
    taper[outside] = 0.0
    vlen = vlen * taper
    shells = []
    for k in range(1, HAIR_SHELLS + 1):
        f = k / HAIR_SHELLS
        off = nrm * (0.00015 + 0.00025 * taper[:, None] + vlen[:, None] * f) + vflow * (vlen[:, None] * f * 0.55)
        cut = 0.12 + 0.62 * (k - 1) / (HAIR_SHELLS - 1)
        shells.append(make_shell(body, f'HairShell{k}', keep_h, off,
                                 alpha_clip_material(f'Hair{k}', himg, cut, 0.55 + 0.03 * k, 0.15)))
    for k in range(1, BROW_SHELLS + 1):
        off = nrm * (0.00045 * k) * (vbrow[:, None] > 0.05) + vflow * (0.0016 * k) * vbrow[:, None]
        shells.append(make_shell(body, f'BrowShell{k}', keep_b, off,
                                 alpha_clip_material(f'Brow{k}', himg, 0.25 + 0.25 * (k - 1), 0.45, 0.4)))
    shells.append(head_strands.brows(body, objs['Rig'], os.path.join(tex, 'brow_roots.npz')))
    for s in shells:
        print(s.name, 'verts', len(s.data.vertices), 'tris', sum(len(p.vertices) - 2 for p in s.data.polygons))
    return shells

def export(path, subdiv):
    objs = bpy.data.objects
    rig = objs['Rig']
    meshes = [o for o in objs if o.type == 'MESH' and o.parent == rig or (o.type == 'MESH' and o.find_armature() == rig)]
    meshes = [o for o in meshes if not o.hide_render]
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in meshes:
        if 'Subdiv' in o.modifiers: o.modifiers['Subdiv'].show_viewport = subdiv
    for o in bpy.context.view_layer.objects: o.select_set(o in meshes or o == rig)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_skins=True, export_apply=subdiv, export_animations=False,
                              export_morph=False, export_all_influences=False, export_tangents=True, export_image_format='AUTO')
    for o in meshes:
        if 'Subdiv' in o.modifiers: o.modifiers['Subdiv'].show_viewport = True

if __name__ == '__main__':
    T0 = time.time()
    ap = argparse.ArgumentParser()
    ap.add_argument('--tex', default=os.path.join(H, 'head', 'textures'))
    ap.add_argument('--blend', default=os.path.join(H, 'base', 'human_base.blend'))
    ap.add_argument('--out', default=os.path.join(H, 'head'))
    ap.add_argument('--no-export', action='store_true')
    a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    bpy.ops.wm.open_mainfile(filepath=a.blend)
    apply(a.tex)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out, 'human_head.blend'), compress=True)
    if not a.no_export:
        export(os.path.join(a.out, 'human_head.glb'), False)
        export(os.path.join(a.out, 'human_head_hero.glb'), True)
    print(f'done {time.time()-T0:.1f}s')
