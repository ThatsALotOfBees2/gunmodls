"""Clip penetration probe for the integrated rig (used by integrate_rig.py stage fix, and standalone for tuning).

    $H/venv/bin/python pen_rig.py [--blend final/stage/2_anim.blend | --rebuild] [--clips Ready,Walk] [--n 8]
       [--mods all|assault] [--json out.json]

Metric (same as common.penetration, per module): module vertices that end up > 1 mm inside the skin (Body) at a
clip frame. Also lists the body bone under the worst vertices (who pokes in).
"""
import os, sys, json, time, argparse
import numpy as np
import bpy
from mathutils import Vector, bvhtree

BUILD = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, BUILD)
RIG = os.path.dirname(BUILD)


def ev_coords(ob, dg):
    oe = ob.evaluated_get(dg); me = oe.to_mesh()
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co)
    tris = None
    if ob.name == 'Body':
        me.calc_loop_triangles()
        tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', tris)
        tris = tris.reshape(-1, 3)
        tp = np.empty(len(me.loop_triangles), dtype=np.int64); me.loop_triangles.foreach_get('polygon_index', tp)
        tris = (tris, tp)
    oe.to_mesh_clear()
    return co.reshape(-1, 3), tris


def body_bone_of_poly(body):
    """dominant deform bone per Body polygon."""
    me = body.data; gn = {g.index: g.name for g in body.vertex_groups}
    vb = []
    for v in me.vertices:
        g = max(v.groups, key=lambda g: g.weight) if len(v.groups) else None
        vb.append(gn[g.group] if g else '?')
    return [vb[p.vertices[0]] for p in me.polygons]


PROP_MESHES = ('HOLD_Pistol', 'HOLB_Pistol', 'RMAG_ReloadMag')
BASE_GARMENTS = ('shirt', 'trousers', 'gloves', 'boots')


def hidden_polys(mods=BASE_GARMENTS):
    """Body polygons hidden by the base garments (manifest masks + the integrator's extra mask, if any)."""
    hid = set()
    extra = os.path.join(RIG, 'final', 'extra_masks.json')
    ex = json.load(open(extra)) if os.path.exists(extra) else {}
    for m in mods:
        hid |= set(json.load(open(os.path.join(RIG, 'mods', f'{m}.json')))['hides_body_faces'])
        hid |= set(ex.get(m, []))
    return hid


def scan(objs_by_mod, frames, tol_mm=1.0, verbose=False):
    """frames: list of (action_name, frame). returns {mod: {'Clip:f': n}}, {mod: {'Clip:f': top_bone}}
    base garments are tested against the skin that stays VISIBLE with all four on (their hidden skin never shows);
    every other module against the whole Body (inside the skin = through the sleeve / trouser leg too)."""
    rig = bpy.data.objects['Rig']; body = bpy.data.objects['Body']
    pb = body_bone_of_poly(body)
    hid = hidden_polys()
    out = {m: {} for m in objs_by_mod}; who = {m: {} for m in objs_by_mod}
    for act, fr in frames:
        rig.animation_data.action = bpy.data.actions[act] if act else None
        if act and rig.animation_data.action_slot is None and len(rig.animation_data.action.slots):
            rig.animation_data.action_slot = rig.animation_data.action.slots[0]
        bpy.context.scene.frame_set(fr); bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        bco, (bt, btp) = ev_coords(body, dg)
        V = [Vector(p) for p in bco]
        T = bvhtree.BVHTree.FromPolygons(V, [tuple(t) for t in bt])
        key = f'{act}:{fr}'
        for m, obs in objs_by_mod.items():
            n = 0; bones = {}
            garment = m in BASE_GARMENTS
            for ob in obs:
                if act in ('Holster', 'HolsterBelt', 'Reload') and ob.name in PROP_MESHES: continue   # held in the hand
                co, _ = ev_coords(ob, dg)
                for p in co:
                    loc, nn, fi, d = T.find_nearest(Vector(p), 0.06)
                    if loc is not None and (Vector(p) - loc).dot(nn) < -tol_mm * 1e-3:
                        if garment and btp[fi] in hid: continue        # under its own (hidden) skin: never seen
                        n += 1; b = pb[btp[fi]]; bones[b] = bones.get(b, 0) + 1
            out[m][key] = n
            if bones: who[m][key] = max(bones.items(), key=lambda kv: kv[1])[0]
    rig.animation_data.action = None
    return out, who


def print_table(res, who):
    clips = []
    for m in res:
        for k in res[m]:
            c = k.split(':')[0]
            if c not in clips: clips.append(c)
    print(f'{"module":16s}' + ''.join(f'{c[:10]:>11s}' for c in clips))
    for m in sorted(res):
        row = []
        for c in clips:
            vals = [(v, k) for k, v in res[m].items() if k.startswith(c + ':')]
            v, k = max(vals) if vals else (0, '')
            b = (who[m].get(k) or '')[:6] if v > 20 else ''
            row.append(f'{v:5d}{b:>6s}')
        if any(v for v in res[m].values()): print(f'{m:16s}' + ''.join(row))


def module_objects(mods):
    res = {}
    for o in bpy.data.objects:
        if o.type != 'MESH' or 'module' not in o: continue
        m = o['module']
        if m == 'body' or (mods and m not in mods): continue
        res.setdefault(m, []).append(o)
    return res


def frames_for(clips, n, fps=30):
    out = []
    for c in clips:
        a = bpy.data.actions[c]; f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
        for k in range(n):
            out.append((c, int(round(f0 + (f1 - f0 - 1) * k / max(n - 1, 1)))))
    return out


ASSAULT = ['shirt', 'trousers', 'boots', 'gloves', 'kneepads', 'elbowpads', 'carrier', 'helmet', 'belt', 'rifle_mags',
           'pistol_mags', 'dump', 'ifak', 'radio', 'admin_hydration', 'holster_drop', 'sling', 'headset', 'eyewear',
           'bang_pouches', 'knife']

if __name__ == '__main__':
    import common as C
    ap = argparse.ArgumentParser()
    ap.add_argument('--blend', default=os.path.join(RIG, 'final', 'stage', '2_anim.blend'))
    ap.add_argument('--rebuild', action='store_true', help='open 1_assembled and rebuild clips with anim_rig')
    ap.add_argument('--clips', default='')
    ap.add_argument('--n', type=int, default=8)
    ap.add_argument('--mods', default='assault')
    ap.add_argument('--json', default='')
    a = ap.parse_args(C.argv())
    t0 = time.time()
    if a.rebuild:
        bpy.ops.wm.open_mainfile(filepath=os.path.join(RIG, 'final', 'stage', '1_assembled.blend'))
        import anim_rig
        rpt = json.load(open(os.path.join(RIG, 'final', 'report.json')))
        clips = a.clips.split(',') if a.clips else None
        anim_rig.build_clips(bpy.data.objects['Rig'], props=rpt['props'], clips=clips)
        print('clips built', round(time.time() - t0, 1), flush=True)
    else:
        bpy.ops.wm.open_mainfile(filepath=a.blend)
    clips = a.clips.split(',') if a.clips else [x.name for x in bpy.data.actions]
    mods = None if a.mods == 'all' else (ASSAULT if a.mods == 'assault' else a.mods.split(','))
    om = module_objects(mods)
    res, who = scan(om, frames_for(clips, a.n))
    print('scan', round(time.time() - t0, 1), 's')
    print_table(res, who)
    if a.json: json.dump({'counts': res, 'who': who}, open(a.json, 'w'), indent=1)
