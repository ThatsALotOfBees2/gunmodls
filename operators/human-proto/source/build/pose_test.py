"""Skinning sanity check: arms down, elbow/knee bent, head turned, fingers curled -> base/checks/pose_test.png"""
import os, math, bpy
from mathutils import Euler
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(H, 'base', 'human_base.blend'))
rig = bpy.data.objects['Rig']; pb = rig.pose.bones
def rot(n, x=0, y=0, z=0):
    pb[n].rotation_mode = 'XYZ'; pb[n].rotation_euler = Euler((math.radians(x), math.radians(y), math.radians(z)))
for s, k in (('Left', 1), ('Right', -1)):
    rot(f'{s}UpperArm', z=-k * 0, x=0, y=0)
rot('LeftUpperArm', x=0, z=40); rot('RightUpperArm', z=-40)
rot('LeftLowerArm', x=60); rot('RightLowerArm', x=20)
rot('LeftUpperLeg', x=-35); rot('LeftLowerLeg', x=60)
rot('Head', z=25); rot('Jaw', x=12)
for f in ('Index', 'Middle', 'Ring', 'Little'):
    for seg in ('Proximal', 'Intermediate', 'Distal'):
        rot(f'Right{f}{seg}', x=55)
scn = bpy.context.scene; scn.render.engine = 'CYCLES'; scn.cycles.samples = 8; scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = 600, 800
w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
cd = bpy.data.cameras.new('C'); cd.lens = 50; cam = bpy.data.objects.new('C', cd); scn.collection.objects.link(cam)
cam.location = (-2.6, -4.2, 1.1); cam.rotation_euler = Euler((math.radians(88), 0, math.radians(-32))); scn.camera = cam
sun = bpy.data.objects.new('S', bpy.data.lights.new('S', 'SUN')); sun.data.energy = 3; sun.rotation_euler = Euler((0.7, 0.2, -0.6)); scn.collection.objects.link(sun)
os.makedirs(os.path.join(H, 'base', 'checks'), exist_ok=True)
scn.render.filepath = os.path.join(H, 'base', 'checks', 'pose_test.png'); bpy.ops.render.render(write_still=True)
