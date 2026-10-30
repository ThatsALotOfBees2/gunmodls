#!/usr/bin/env python3
"""Writes breach-fx.json: the effect emitters, lights and timing for game engines, from ../sounds/cues.json.
The values mirror the viewer's reference effects (viewer.html, FX = { ... } and seedFx)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
c = json.load(open(os.path.join(HERE, '..', 'sounds', 'cues.json')))
on, off, det = c['laser_on'], c['laser_off'], c['detonate']
holds = [{'start': e['t'], 'stop': round(e['t'] + e['dur'], 3)} for e in c['events'] if e['e'] == 'seg_turn' and on <= e['t'] < off]
E = lambda **k: dict({'burst': 0, 'rate': 0, 'grow': 1, 'gravity': 0, 'drag': 0, 'cone': 25, 'radius': 0.01, 'hemisphere': False, 'alpha0': 1, 'alpha1': 0}, **k)
spec = {
    'about': 'Breach spider effects. Times are seconds from the start of the deploy clip (breach starts at deploy_s). '
             'Locators are nodes in breach-spider.glb; +Z is out of the wall (toward the attacker). Sizes in metres, speeds in m/s, '
             'gravity as a multiplier of world gravity, drag as velocity damping per second. See ../INTEGRATION.md.',
    'deploy_s': c['deploy_s'], 'breach_s': c['breach_s'], 'laser_on': on, 'laser_off': off, 'detonate': det,
    'corner_holds': holds,
    'hole_m': {'x0': 0.0, 'x1': 1.0, 'y0': 0.0, 'y1': 1.8, 'note': 'in the spider root frame; the panel blows out toward -Z'},
    'emitters': [
        E(name='lance_sparks', locator='fx_laser_hit', start=on, stop=off, rate=170, lifetime=[0.25, 0.7], speed=[0.6, 2.8], size=[0.006, 0.018], gravity=0.6, drag=2.5, cone=60, color0='#fff1c8', color1='#ff5a10', alpha1=0.2, texture='spark', blend='additive'),
        E(name='lance_smoke', locator='fx_laser_hit', start=on, stop=off, rate=30, lifetime=[1.0, 2.0], speed=[0.1, 0.25], size=[0.06, 0.1], grow=3, gravity=-0.03, drag=1.2, cone=35, color0='#bdb6ad', color1='#77726c', alpha0=0.35, texture='smoke', blend='alpha'),
        E(name='lance_glow', locator='fx_laser_hit', start=on, stop=off, rate=60, lifetime=[0.03, 0.06], speed=[0, 0], size=[0.06, 0.1], cone=0, color0='#ffd2a0', color1='#ffd2a0', alpha1=0.6, texture='glow', blend='additive'),
        E(name='blast_flash', locator='fx_charge', start=det, burst=1, lifetime=[0.16, 0.16], speed=[0, 0], size=[3.2, 3.2], grow=1.4, cone=0, color0='#fff6e0', color1='#ffb060', texture='flash', blend='additive'),
        E(name='blast_fire', locator='fx_charge', start=det, burst=40, lifetime=[0.4, 0.6], speed=[2, 5], size=[0.25, 0.55], grow=2.2, drag=4, hemisphere=True, color0='#ffd08a', color1='#ff3a08', texture='glow', blend='additive'),
        E(name='blast_smoke', locator='fx_charge', start=det, burst=90, lifetime=[3.0, 5.5], speed=[0.8, 2.6], size=[0.4, 0.9], grow=3.2, gravity=-0.025, drag=1.8, radius=0.5, cone=80, color0='#8a847c', color1='#4a4744', alpha0=0.75, texture='smoke', blend='alpha', note='a third of them should go through the hole (-Z)'),
        E(name='blast_dust', locator='fx_charge', start=det, burst=220, lifetime=[1.2, 2.7], speed=[1, 4], size=[0.02, 0.08], grow=1.6, gravity=0.35, drag=1.2, radius=0.6, cone=70, color0='#b3aa9c', color1='#8c857a', alpha0=0.8, texture='smoke', blend='alpha'),
        E(name='blast_embers', locator='fx_charge', start=det, burst=160, lifetime=[0.6, 1.6], speed=[3, 9], size=[0.012, 0.024], gravity=0.7, drag=1.1, hemisphere=True, color0='#ffe0a8', color1='#ff3a08', texture='spark', blend='additive'),
    ],
    'lights': [
        {'name': 'lance_light', 'locator': 'fx_laser_hit', 'offset': [0, 0, 0.08], 'start': on, 'stop': off, 'color': '#ffb070', 'intensity': 1.4, 'flicker': 0.4, 'range': 1.6},
        {'name': 'blast_light', 'locator': 'fx_charge', 'offset': [0, 0, 0.6], 'start': det, 'stop': det + 2.5, 'color': '#ffb060', 'intensity': 8.0, 'flicker': 0, 'range': 9, 'decay': [0.09, 0.6]},
    ],
    'textures': {k: f'{k}.png' for k in ('spark', 'glow', 'smoke', 'flash')},
}
json.dump(spec, open(os.path.join(HERE, 'breach-fx.json'), 'w'), indent=1)
print('wrote breach-fx.json')
