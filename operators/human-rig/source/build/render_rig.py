"""Cycles check / hero renders of the integrated rig with a loadout and clip poses.

    $H/venv/bin/python render_rig.py --blend final/stage/2_anim.blend --loadout Assault \
        --shots "Ready:1:front,Ready:1:side_r,Walk:7:q34" --out checks/x.png [--res 480] [--samples 12] [--cols 3]

Works on the unpacked stages (per-object custom props module/part/variant) and on the packed blend (one object per
module node, same props, Body chunks carry hidden_by).
"""
import os, sys, json, math, time, argparse
import numpy as np
import bpy
from mathutils import Vector, Matrix

BUILD = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, BUILD)
RIG = os.path.dirname(BUILD)


def manifests():
    d = {}
    for f in os.listdir(os.path.join(RIG, 'mods')):
        if f.endswith('.json'): d[f[:-5]] = json.load(open(os.path.join(RIG, 'mods', f)))
    return d


def resolve(loadout, MAN=None):
    """loadout {module: variant|None} -> set of (module, part, variant) that show, after requires/exclusions."""
    MAN = MAN or manifests()
    on = dict(loadout)
    changed = True
    while changed:                                    # drop modules whose requirements are missing
        changed = False
        for m in list(on):
            if any(r not in on for r in MAN[m].get('requires', [])): on.pop(m); changed = True
    return on


def visible(ob, on, MAN):
    m = ob.get('module')
    if m is None: return None
    if m == 'body':
        hb = ob.get('hidden_by', '')
        hb = [x for x in hb.split(',') if x]
        if ob.get('lod', 0) != 0: return False
        return not any(x in on for x in hb)
    if m not in on: return False
    if ob.get('lod', 0) != 0: return False
    part = ob.get('part', 'main'); var = ob.get('variant')
    want = on[m] or MAN[m].get('default_variant')
    if var and var != want: return False
    if var == 'goggles' and 'helmet' not in on: return False
    pr = MAN[m].get('parts', {}).get(part, {})
    if any(r not in on for r in pr.get('requires', [])): return False
    if any(r in on for r in pr.get('hidden_with', [])): return False
    return True


def apply_loadout(loadout):
    MAN = manifests(); on = resolve(loadout, MAN)
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        v = visible(o, on, MAN)
        if v is None: continue
        o.hide_render = not v; o.hide_viewport = not v
    # without boots the rig stands on its bare feet: drop the whole character by the boots' ground offset
    rig = bpy.data.objects['Rig']
    rig.location.z = 0.0 if 'boots' in on else -MAN['boots'].get('ground_offset_m', 0.025)
    return on


def set_pose(clip, frame):
    rig = bpy.data.objects['Rig']
    if rig.animation_data is None: rig.animation_data_create()
    for tr in rig.animation_data.nla_tracks: tr.mute = True
    rig.animation_data.action = bpy.data.actions[clip] if clip else None
    if clip and rig.animation_data.action_slot is None and len(rig.animation_data.action.slots):
        rig.animation_data.action_slot = rig.animation_data.action.slots[0]
    if not clip:
        for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()


def setup_scene(samples=12, threads=2, hero=False):
    scn = bpy.context.scene
    r = scn.render
    r.engine = 'CYCLES'; scn.cycles.device = 'CPU'; scn.cycles.samples = samples
    scn.cycles.use_denoising = True; scn.cycles.use_adaptive_sampling = True; scn.cycles.max_bounces = 6 if hero else 4
    r.threads_mode = 'FIXED'; r.threads = threads
    r.film_transparent = False; r.image_settings.file_format = 'PNG'
    scn.view_settings.view_transform = 'AgX'; scn.view_settings.look = 'AgX - Medium High Contrast' if hero else 'None'
    for o in [o for o in scn.objects if o.type in ('LIGHT', 'CAMERA') or o.name.startswith('RR_')]:
        bpy.data.objects.remove(o)
    w = bpy.data.worlds.get('RR_World') or bpy.data.worlds.new('RR_World'); scn.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.36, 0.37, 0.40, 1); bg.inputs['Strength'].default_value = 0.30
    fme = bpy.data.meshes.new('RR_Floor')
    fme.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    fl = bpy.data.objects.new('RR_Floor', fme); scn.collection.objects.link(fl)
    fm = bpy.data.materials.get('RR_Floor') or bpy.data.materials.new('RR_Floor'); fm.use_nodes = True
    fb = fm.node_tree.nodes['Principled BSDF']
    fb.inputs['Base Color'].default_value = (0.13, 0.13, 0.14, 1); fb.inputs['Roughness'].default_value = 0.85
    fme.materials.append(fm)

    def area(name, loc, power, size, col=(1, 1, 1), tgt=(0, 0, 1.1)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = power; ld.size = size; ld.color = col
        o = bpy.data.objects.new(name, ld); scn.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    area('RR_Key', (-2.6, -3.2, 3.6), 340, 2.0, (1, 0.96, 0.92)); area('RR_Fill', (3.0, -2.8, 1.6), 80, 2.5, (0.92, 0.95, 1))
    area('RR_RimL', (-2.2, 2.6, 2.6), 200, 1.2, (0.9, 0.93, 1)); area('RR_RimR', (2.4, 2.4, 2.2), 150, 1.2, (0.8, 0.7, 1.0))
    return scn


VIEWS = {'front': (0, -1, 0.05), 'back': (0, 1, 0.08), 'side_r': (-1, 0, 0.05), 'side_l': (1, 0, 0.05),
         'q34': (-1, -1.1, 0.22), 'q34l': (1, -1.1, 0.22), 'back34': (1, 1.1, 0.28), 'top': (0.05, -0.35, 1),
         'low': (-0.6, -1, -0.15)}
FOCUS = {'full': ((0, 0, 0.92), 2.05), 'torso': ((0, -0.05, 1.22), 0.95), 'legs': ((0, -0.05, 0.55), 1.2),
         'head': ((0, -0.04, 1.66), 0.42), 'hips': ((0, -0.05, 0.95), 0.75), 'chest': ((0, -0.12, 1.25), 0.62),
         'hand_r': ((-0.25, -0.05, 0.85), 0.6), 'chips': ((0.05, -0.1, 0.78), 0.6)}


def render_shots(shots, out, res=480, samples=12, cols=None, threads=2, hero=False, labels=False):
    """shots: list of dicts {clip, frame, view, focus, loadout}. writes one sheet PNG."""
    from PIL import Image
    scn = setup_scene(samples, threads, hero)
    tiles = []
    for s in shots:
        if s.get('loadout') is not None: apply_loadout(s['loadout'])
        set_pose(s.get('clip'), s.get('frame', 1))
        c, size = FOCUS[s.get('focus', 'full')]
        c = Vector(c)
        cd = bpy.data.cameras.new('RR_Cam'); cd.lens = s.get('lens', 70); cd.sensor_width = 36
        cam = bpy.data.objects.new('RR_Cam', cd); scn.collection.objects.link(cam)
        d = Vector(VIEWS[s.get('view', 'q34')]).normalized(); dist = size / 2 / math.tan(cd.angle / 2)
        cam.location = c + d * dist
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cd.clip_start = 0.02; cd.clip_end = 100
        scn.camera = cam
        rx, ry = s.get('res', (res, res)) if isinstance(s.get('res'), tuple) else (res, res)
        scn.render.resolution_x, scn.render.resolution_y = rx, ry
        tmp = out[:-4] + f'_tmp{len(tiles)}.png'
        scn.render.filepath = tmp
        t = time.time(); bpy.ops.render.render(write_still=True)
        print('render', s, round(time.time() - t, 1), 's', flush=True)
        tiles.append(Image.open(tmp).convert('RGB')); os.remove(tmp)
        bpy.data.objects.remove(cam)
    cols = cols or len(tiles)
    rows = (len(tiles) + cols - 1) // cols
    W, Hh = tiles[0].size
    sheet = Image.new('RGB', (W * cols, Hh * rows), (20, 20, 22))
    for i, im in enumerate(tiles): sheet.paste(im, ((i % cols) * W, (i // cols) * Hh))
    sheet.save(out)
    print('wrote', out, flush=True)
    return out


if __name__ == '__main__':
    import common as C
    sys.path.insert(0, BUILD)
    from integrate_rig import PRESETS
    ap = argparse.ArgumentParser()
    ap.add_argument('--blend', default=os.path.join(RIG, 'final', 'stage', '2_anim.blend'))
    ap.add_argument('--loadout', default='Assault')
    ap.add_argument('--shots', default='Idle:1:q34')
    ap.add_argument('--focus', default='full')
    ap.add_argument('--out', default=os.path.join(RIG, 'checks', 'rig_shot.png'))
    ap.add_argument('--res', type=int, default=480)
    ap.add_argument('--samples', type=int, default=12)
    ap.add_argument('--cols', type=int, default=0)
    a = ap.parse_args(C.argv())
    bpy.ops.wm.open_mainfile(filepath=a.blend)
    shots = []
    for s in a.shots.split(','):
        p = s.split(':')
        clip = p[0] if p[0] not in ('rest', '') else None
        shots.append(dict(clip=clip, frame=int(p[1]), view=p[2], focus=p[3] if len(p) > 3 else a.focus,
                          loadout=PRESETS[a.loadout]))
    render_shots(shots, a.out, a.res, a.samples, a.cols or None)
