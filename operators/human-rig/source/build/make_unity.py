"""writes deliver/unity/Runtime/HumanRig.cs (module table generated from final/report.json + mods/*.json)."""
import os, sys, json
BUILD = os.path.dirname(os.path.abspath(__file__)); RIG = os.path.dirname(BUILD)
sys.path.insert(0, BUILD)
from integrate_rig import MAN, MODS, PRESETS, GROUND, EXTRA_RULES
rpt = json.load(open(os.path.join(RIG, 'final', 'report.json')))
q = lambda s: '"' + s + '"'
arr = lambda xs: 'new string[] { ' + ', '.join(q(x) for x in xs) + ' }' if xs else 'new string[0]'
mods = []
for m in MODS:
    d = MAN[m]
    mods.append(f'        new Module({q(m)}, {q(d["group"])}, {q(d.get("default_variant") or "")}, {arr(list(d.get("variants", {}).keys()))}, '
                f'{arr(d.get("requires", []))}, {arr(d.get("exclusive_with", []))}, {d["tris"]}),')
nodes = []
for nm, n in sorted(rpt['nodes'].items()):
    prt = MAN[n['module']].get('parts', {}).get(n['part'], {})
    req = list(prt.get('requires', [])) + list(EXTRA_RULES.get((n['module'], n['variant']), {}).get('requires', []))
    nodes.append(f'        new Node({q(nm)}, {q(n["module"])}, {q(n["variant"] or "")}, {arr(req)}, {arr(prt.get("hidden_with", []))}),')
presets = []
for p in ['Body', 'Base', 'Light', 'Assault', 'Full']:
    items = ', '.join(f'{{ {q(k)}, {q(v or "")} }}' for k, v in PRESETS[p].items())
    presets.append(f'        {{ {q(p)}, new Dictionary<string, string> {{ {items} }} }},')
lt = rpt['lod_tris']
src = open(os.path.join(BUILD, 'HumanRig.cs.in')).read()
src = (src.replace('/*MODULES*/', '\n'.join(mods)).replace('/*NODES*/', '\n'.join(nodes)).replace('/*PRESETS*/', '\n'.join(presets))
       .replace('/*GROUND*/', f'{GROUND:.3f}f')
       .replace('/*TRIS*/', f'Assault {lt["Assault"]["LOD0"]["tris"]:,} / {lt["Assault"]["LOD1"]["tris"]:,} / {lt["Assault"]["LOD2"]["tris"]:,} tris'))
out = os.path.join(RIG, 'deliver', 'unity', 'Runtime', 'HumanRig.cs'); open(out, 'w').write(src); print('wrote', out)
