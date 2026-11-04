"""Stage 5: Cycles delivery renders of the final character (posed from the baked clips).

Run:  $H/venv/bin/python $H/build/hero_render.py [--blend final/human_proto.blend] [--out final/renders]
       [--shots hero,face,armour,back,crouch,walk] [--samples 40] [--res 1200]
Shots (name: clip@time, camera): hero  Idle@1.0 low 3/4 front-right (preview.png)
       face  Idle@1.0 face close-up        armour  Ready@0.4 chest close-up
       back  Idle@1.0 3/4 back             crouch  CrouchIdle@1.0          walk  Walk@0.3 side 3/4
"""
import os, sys, math, argparse
import bpy
from mathutils import Vector

H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--blend', default=os.path.join(H, 'final', 'human_proto.blend'))
ap.add_argument('--out', default=os.path.join(H, 'final', 'renders'))
ap.add_argument('--shots', default='hero,face,armour,back,crouch,walk')
ap.add_argument('--samples', type=int, default=40)
ap.add_argument('--res', type=int, default=1200)
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
os.makedirs(a.out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=a.blend)
scn = bpy.context.scene; rig = bpy.data.objects['Rig']
r = scn.render
r.engine = 'CYCLES'; scn.cycles.device = 'CPU'; scn.cycles.samples = a.samples
scn.cycles.use_denoising = True; scn.cycles.denoiser = 'OPENIMAGEDENOISE'; scn.cycles.use_adaptive_sampling = True
scn.cycles.max_bounces = 6; scn.cycles.transparent_max_bounces = 64
scn.view_settings.view_transform = 'AgX'
looks = [i.identifier for i in scn.view_settings.bl_rna.properties['look'].enum_items]
scn.view_settings.look = next((l for l in looks if 'Medium High Contrast' in l), 'None')
# Cornea in the realtime export is a clear alpha shell; for Cycles give it back real glass
cm = bpy.data.materials.get('Cornea')
if cm:
    b = cm.node_tree.nodes['Principled BSDF']; b.inputs['Alpha'].default_value = 1.0
    b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['Roughness'].default_value = 0.0

# cyclorama + lights (dark studio, cool rims, one faint purple kicker to echo the LED)
me = bpy.data.meshes.new('Cyc'); verts, faces = [], []
prof = [(-6, 0.0), (0, 0.0)] + [(1.5 * math.sin(i / 16 * math.pi / 2), 1.5 - 1.5 * math.cos(i / 16 * math.pi / 2)) for i in range(1, 17)] + [(1.5, 8)]
for y, z in prof:
    for x in (-12, 12): verts.append((x, y + 2.2, z))
for j in range(len(prof) - 1): faces.append((2 * j, 2 * j + 1, 2 * j + 3, 2 * j + 2))
me.from_pydata(verts, [], faces); me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
cyc = bpy.data.objects.new('Cyc', me); scn.collection.objects.link(cyc)
cmat = bpy.data.materials.new('Cyc'); cmat.use_nodes = True
cmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.03, 0.03, 0.035, 1)
cmat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
me.materials.append(cmat)
w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.03, 0.03, 0.04, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.35


def area(name, loc, target, size, power, color):
    ld = bpy.data.lights.new(name, 'AREA'); ld.size = size; ld.energy = power; ld.color = color
    ob = bpy.data.objects.new(name, ld); scn.collection.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


area('Key', (2.3, -3.0, 3.1), (0, 0, 1.2), 1.8, 240, (1.0, 0.95, 0.9))
area('Fill', (-3.0, -2.4, 1.5), (0, 0, 1.0), 2.5, 40, (0.8, 0.85, 1.0))
area('RimL', (-2.2, 2.4, 2.5), (0, 0, 1.3), 1.0, 210, (0.85, 0.9, 1.0))
area('RimR', (2.3, 2.2, 2.2), (0, 0, 1.2), 1.0, 160, (0.7, 0.55, 1.0))

cd = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cd); scn.collection.objects.link(cam); scn.camera = cam
SHOTS = {
    # name: clip, t, cam loc, target, lens, (w, h)
    'hero':   ('Idle', 1.0, (1.15, -2.7, 0.95), (0.0, 0, 0.94), 50, (1100, 1400)),
    'face':   ('Idle', 1.0, (0.45, -1.05, 1.67), (0.0, -0.04, 1.61), 85, (1100, 1100)),
    'armour': ('Ready', 0.4, (0.7, -1.55, 1.42), (0.0, -0.05, 1.22), 60, (1200, 1000)),
    'back':   ('Idle', 1.0, (-1.7, 3.3, 1.35), (0, 0, 0.95), 50, (1100, 1400)),
    'crouch': ('CrouchIdle', 1.0, (1.9, -2.9, 0.9), (0.0, 0, 0.62), 50, (1200, 1000)),
    'walk':   ('Walk', 0.3, (-2.6, -2.3, 1.1), (0, 0.05, 0.92), 50, (1100, 1400)),
}
for name in a.shots.split(','):
    clip, t, loc, tgt, lens, (rw, rh) = SHOTS[name]
    rig.animation_data.action = bpy.data.actions[clip]
    scn.frame_set(int(round(t * 30)) + 1)
    cam.location = loc; cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); cd.lens = lens
    s = a.res / max(rw, rh); r.resolution_x, r.resolution_y = int(rw * s), int(rh * s)
    r.filepath = os.path.join(a.out, name + '.png'); bpy.ops.render.render(write_still=True)
    print('wrote', r.filepath, flush=True)
