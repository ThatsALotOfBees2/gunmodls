"""Delivery renders: preview.png (Cycles hero, Assault) and loadouts.png (sheet), from final/human_rig.blend.
    $H/venv/bin/python render_deliver.py [--check] [--hero] [--sheet]"""
import os, sys, bpy
BUILD = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, BUILD)
import common as C
import render_rig as RR
from integrate_rig import PRESETS, FINAL, DELIVER
a = C.argv()
bpy.ops.wm.open_mainfile(filepath=os.path.join(FINAL, 'human_rig.blend'))
chk = os.path.join(C.RIG, 'checks', 'int')
if '--check' in a:
    RR.render_shots([dict(clip='Idle', frame=1, view=v, focus=f, loadout=PRESETS['Assault']) for v, f in
                     (('front', 'chest'), ('q34l', 'chest'), ('side_r', 'torso'))] +
                    [dict(clip='Ready', frame=1, view='q34', focus='torso', loadout=PRESETS['Assault'])],
                    os.path.join(chk, 'deliver_check.png'), res=420, samples=10, cols=4)
if '--hero' in a:
    RR.render_shots([dict(clip='Idle', frame=31, view='q34', focus='full', lens=62, res=(1200, 1500), loadout=PRESETS['Assault'])],
                    os.path.join(DELIVER, 'preview.png'), samples=40, threads=3, hero=True)
if '--sheet' in a:
    belt = {k: v for k, v in PRESETS['Assault'].items() if k != 'holster_drop'}; belt['holster_belt'] = None
    L = [('Body', PRESETS['Body']), ('Base', PRESETS['Base']), ('Light', PRESETS['Light']), ('Assault', PRESETS['Assault']),
         ('Full', PRESETS['Full']), ('Belt holster', belt)]
    RR.render_shots([dict(clip='Idle', frame=31, view='q34', focus='full', lens=62, res=(560, 860), loadout=lo) for _, lo in L],
                    os.path.join(DELIVER, 'loadouts.png'), samples=20, threads=3, cols=6, hero=True)
