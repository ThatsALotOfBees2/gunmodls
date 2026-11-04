"""quick Workbench pose sheet: posecheck.py --blend X --out dir --poses Idle:0,Ready:0.5,...  (static poses via anim.py)"""
import os, sys, math, argparse, importlib
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anim
ap = argparse.ArgumentParser()
ap.add_argument('--blend'); ap.add_argument('--out'); ap.add_argument('--poses', default='Idle:0')
ap.add_argument('--views', default='front,34,side'); ap.add_argument('--res', type=int, default=700)
ap.add_argument('--engine', default='workbench'); ap.add_argument('--samples', type=int, default=12)
ap.add_argument('--zoom', default='full')
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
os.makedirs(a.out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=a.blend)
scn = bpy.context.scene; rig = bpy.data.objects['Rig']
for o in scn.objects:
    if o.type == 'MESH':
        for m in o.modifiers:
            if m.type == 'SUBSURF': m.show_viewport = m.show_render = False
if rig.animation_data: rig.animation_data.action = None
r = scn.render; r.resolution_x = r.resolution_y = a.res
if a.engine == 'workbench':
    r.engine = 'BLENDER_WORKBENCH'; scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'MATERIAL'
    scn.display.shading.show_shadows = True; scn.display.shading.show_cavity = True
else:
    r.engine = 'CYCLES'; scn.cycles.samples = a.samples; scn.cycles.use_denoising = True; scn.cycles.device = 'CPU'
    scn.cycles.transparent_max_bounces = 48
w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.5, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
if a.engine != 'workbench':
    for nm, loc, pw in (('K', (-2, -3, 3), 900), ('F', (3, -2, 2), 300), ('B', (0, 3, 3), 600)):
        ld = bpy.data.lights.new(nm, 'AREA'); ld.energy = pw; ld.size = 2; lo = bpy.data.objects.new(nm, ld); scn.collection.objects.link(lo)
        lo.location = loc; lo.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
cd = bpy.data.cameras.new('C'); cam = bpy.data.objects.new('C', cd); scn.collection.objects.link(cam); scn.camera = cam
ch = anim.Character(rig)
VIEWS = {'front': (0, -1, 0.05), '34': (-0.7, -0.75, 0.1), 'side': (-1, 0, 0.05), 'back': (0.3, 1, 0.1), '34r': (0.7, -0.75, 0.1)}
for spec in a.poses.split(','):
    clip, t = spec.split(':'); t = float(t)
    if clip == 'Rest': ch.P.reset(); B = ch.P.basis
    else: B = ch.pose_at(clip, t)
    anim.apply_basis(rig, B)
    bpy.context.view_layer.update()
    for v in a.views.split(','):
        d = Vector(VIEWS[v]).normalized()
        if a.zoom == 'full': tgt, dist, lens = Vector((0, 0, 0.9)), 3.0, 40
        elif a.zoom == 'neck': tgt, dist, lens = Vector((0, -0.02, 1.55)), 0.75, 50
        else: tgt, dist, lens = Vector((0, -0.15, 1.2)), 2.6, 50
        cam.location = tgt + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cd.lens = lens
        r.filepath = os.path.join(a.out, f'{clip}_{t:g}_{v}.png'); bpy.ops.render.render(write_still=True)
        print('wrote', r.filepath, flush=True)
