"""Stage 2: studio renders of a human .blend.

Run:  $H/venv/bin/python $H/build/render.py [--blend path] [--out dir] [--bg grey|dark|both]
       [--shots full_front,full_34,...] [--engine cycles|workbench] [--samples 24] [--res 1100]
Shots: full_front full_34 full_side full_back head_front head_34 head_profile hands
"""
import os, sys, math, time, argparse
import bpy
from mathutils import Vector, Matrix

H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--blend', default=os.path.join(H, 'base', 'human_base.blend'))
ap.add_argument('--out', default=os.path.join(H, 'base', 'renders'))
ap.add_argument('--bg', default='both')
ap.add_argument('--shots', default='all')
ap.add_argument('--engine', default='cycles')
ap.add_argument('--samples', type=int, default=24)
ap.add_argument('--res', type=int, default=1100)
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
os.makedirs(args.out, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=args.blend)
scn = bpy.context.scene
rig = next(o for o in scn.objects if o.type == 'ARMATURE')
meshes = [o for o in scn.objects if o.type == 'MESH' and o.visible_get()]

# bounds of the evaluated character
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for o in meshes:
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    pts += [o.matrix_world @ v.co for v in list(me.vertices)[::7]]
    ev.to_mesh_clear()
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
height = hi.z - lo.z

def bone_world(name, end='head'):
    b = rig.data.bones[name]
    return rig.matrix_world @ (b.head_local if end == 'head' else b.tail_local)

head_c = (bone_world('Head') + bone_world('Head', 'tail')) / 2
hand_l = bone_world('LeftHand'); hand_r = bone_world('RightHand')

# ---------------------------------------------------------------- render settings
r = scn.render
r.resolution_x = r.resolution_y = args.res
r.film_transparent = False
r.image_settings.file_format = 'PNG'
if args.engine == 'cycles':
    r.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    scn.cycles.samples = args.samples
    scn.cycles.use_denoising = True
    scn.cycles.denoiser = 'OPENIMAGEDENOISE'
    scn.cycles.max_bounces = 6
    scn.cycles.use_adaptive_sampling = True
    r.threads_mode = 'AUTO'
else:
    r.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'MATERIAL'
scn.view_settings.view_transform = 'AgX'
scn.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [
    i.identifier for i in scn.view_settings.bl_rna.properties['look'].enum_items] else 'None'

# ---------------------------------------------------------------- backdrop (cyclorama)
def backdrop(color):
    me = bpy.data.meshes.new('Cyc')
    verts, faces = [], []
    W, D, R, Hh, N = 12, 6, 1.5, 8, 16
    prof = [(y, 0.0) for y in (-D, 0)]
    for i in range(1, N + 1):
        a = i / N * math.pi / 2
        prof.append((R * math.sin(a), R - R * math.cos(a)))
    prof.append((R, Hh))
    for j, (y, z) in enumerate(prof):
        for x in (-W, W):
            verts.append((x, y + 2.0, z))
    for j in range(len(prof) - 1):
        a = j * 2; faces.append((a, a + 1, a + 3, a + 2))
    me.from_pydata(verts, [], faces)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    ob = bpy.data.objects.new('Cyc', me); scn.collection.objects.link(ob)
    mt = bpy.data.materials.new('Cyc'); mt.use_nodes = True
    bs = mt.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*color, 1); bs.inputs['Roughness'].default_value = 0.9
    me.materials.append(mt)
    return ob, mt

def world(color, strength):
    w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*color, 1); bg.inputs['Strength'].default_value = strength

def area(name, loc, target, size, power, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.size = size; ld.energy = power; ld.color = color
    ob = bpy.data.objects.new(name, ld); scn.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob

mid = Vector((0, 0, lo.z + height * 0.55))
LIGHT_SETS = {
    # key: front-left high, fill: front-right low, rim: two back lights
    'grey': dict(bd=(0.18, 0.18, 0.18), world=((0.5, 0.5, 0.52), 0.25),
                 lights=[('Key', (-2.6, -3.2, 3.4), 270, 2.0, (1.0, 0.97, 0.93)),
                         ('Fill', (3.0, -2.8, 1.6), 78, 2.5, (0.93, 0.96, 1.0)),
                         ('RimL', (-2.2, 2.6, 2.6), 156, 1.2, (1, 1, 1)),
                         ('RimR', (2.4, 2.4, 2.2), 126, 1.2, (1, 1, 1))]),
    'dark': dict(bd=(0.018, 0.018, 0.022), world=((0.02, 0.02, 0.03), 0.3),
                 lights=[('Key', (-2.4, -3.0, 3.2), 225, 1.6, (1.0, 0.95, 0.9)),
                         ('Fill', (3.0, -2.6, 1.4), 27, 2.5, (0.75, 0.8, 1.0)),
                         ('RimL', (-2.0, 2.4, 2.4), 195, 1.0, (0.78, 0.62, 1.0)),
                         ('RimR', (2.2, 2.2, 2.0), 156, 1.0, (0.85, 0.9, 1.0))]),
}

# ---------------------------------------------------------------- cameras
def shot(name):
    fb = lo.z + height * 0.5
    D = {
        'full_front':   (Vector((0, -9.0, fb)), Vector((0, 0, fb)), 70, height * 1.12),
        'full_34':      (Vector((-6.3, -6.3, fb + 0.3)), Vector((0, 0, fb)), 70, height * 1.12),
        'full_side':    (Vector((-9.0, 0, fb)), Vector((0, 0, fb)), 70, height * 1.12),
        'full_back':    (Vector((0, 9.0, fb)), Vector((0, 0, fb)), 70, height * 1.12),
        'head_front':   (head_c + Vector((0, -2.2, 0.02)), head_c + Vector((0, -0.04, -0.03)), 100, 0.36),
        'head_34':      (head_c + Vector((-1.5, -1.6, 0.06)), head_c + Vector((0, -0.04, -0.03)), 100, 0.36),
        'head_profile': (head_c + Vector((-2.2, 0, 0.02)), head_c + Vector((0, -0.04, -0.03)), 100, 0.36),
        'hands':        (None, None, 100, 0.0),
    }
    return D[name]

def place_cam(loc, target, lens):
    cd = bpy.data.cameras.new('Cam'); cd.lens = lens; cd.sensor_width = 36
    cam = bpy.data.objects.new('Cam', cd); scn.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat('-Z', 'Y').to_euler()
    scn.camera = cam
    return cam

def frame(cam, target, size):
    # move camera along its axis so that `size` metres fill the frame vertically
    d = (cam.location - target).normalized()
    dist = size / 2 / math.tan(cam.data.angle / 2)
    cam.location = target + d * dist
    bpy.context.view_layer.update()

ALL = ['full_front', 'full_34', 'full_side', 'full_back', 'head_front', 'head_34', 'head_profile', 'hands']
shots = ALL if args.shots == 'all' else args.shots.split(',')
bgs = ['grey', 'dark'] if args.bg == 'both' else [args.bg]

timings = {}
for bgname in bgs:
    for o in [o for o in scn.objects if o.type in ('LIGHT', 'CAMERA') or o.name.startswith('Cyc')]:
        bpy.data.objects.remove(o)
    L = LIGHT_SETS[bgname]
    backdrop(L['bd']); world(*L['world'])
    for n, loc, p, s, c in L['lights']:
        area(n, loc, mid, s, p, c)
    for sh in shots:
        if sh == 'hands':
            # both hands, from the front-low, character in A-pose
            # character's left hand, palm-side/back three-quarter
            tgt = (hand_l + bone_world('LeftMiddleDistal', 'tail')) / 2
            loc = tgt + Vector((0.9, -2.4, 0.3))
            cam = place_cam(loc, tgt, 100)
            r.resolution_x = r.resolution_y = args.res
            frame(cam, tgt, 0.30)
        else:
            loc, tgt, lens, size = shot(sh)
            cam = place_cam(loc, tgt, lens)
            r.resolution_x = r.resolution_y = args.res
            if sh.startswith('full'):
                r.resolution_x = int(args.res * 0.62)
            frame(cam, tgt, size)
        t = time.time()
        r.filepath = os.path.join(args.out, f'{bgname}_{sh}.png')
        bpy.ops.render.render(write_still=True)
        timings[f'{bgname}_{sh}'] = round(time.time() - t, 1)
        bpy.data.objects.remove(cam)
        print('rendered', r.filepath, timings[f'{bgname}_{sh}'], 's', flush=True)
print('timings', timings)
