"""Build the human operator prototype from scratch: body -> head/skin/hair -> gear -> integrate -> viewer -> checks.

Run (from anywhere):  $H/venv/bin/python $H/build/build_all.py [options]
  --retex          re-bake the head/skin/hair textures (head_tex.py, ~13 min at 4K); default reuses head/textures
  --rebake         re-bake the gear textures (always done when gear/textures is missing); ~2 min
  --no-bake        never bake gear textures (only valid when the gear geometry did not change)
  --renders        also run the Cycles delivery renders (hero_render.py, ~4 min)
  --deliver DIR    copy the deliverables into DIR (e.g. /home/user/gunmodls/operators/human-proto)
Stages (each a standalone script, each reads only the previous stage's .blend):
  1 mh_body.py      MakeHuman base mesh + targets + rig      -> base/human_base.blend
  2 head_tex.py     skin / hair / eye textures (optional)    -> head/textures/
  3 head_build.py   skin, eyes, brows, lashes, hair shells    -> final/stage/human_head.blend
  4 gear_build.py   uniform, boots, pads, plate carrier       -> final/stage/human_gear.blend (+ gear/textures/)
  5 integrate.py    clips, poke-through fix, LODs, exports    -> final/human_proto.blend, final/*.glb, report.json
  6 Khronos validator on the exported GLBs (must be 0 errors)
  7 pack_web.mjs + make_viewer.js -> final/viewer.html (meshopt, embedded GLB, < 15 MB); viewer_check.js (headless)
  8 posecheck.py    Cycles pose sheet of every clip          -> final/checks/poses/
"""
import os, sys, subprocess, time, shutil, json, glob

H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = os.path.join(H, 'venv', 'bin', 'python')
B = os.path.join(H, 'build')
argv = sys.argv[1:]
T0 = time.time()


def run(*cmd, **kw):
    t = time.time()
    print('>>', ' '.join(str(c) for c in cmd), flush=True)
    p = subprocess.run([str(c) for c in cmd], cwd=H, capture_output=True, text=True, **kw)
    tail = '\n'.join((p.stdout + p.stderr).strip().splitlines()[-6:])
    if p.returncode != 0:
        print(p.stdout[-4000:], p.stderr[-4000:]); raise SystemExit(f'failed: {cmd}')
    print(f'   ok {time.time() - t:.1f}s\n   ' + tail.replace('\n', '\n   '), flush=True)
    return p.stdout


os.makedirs(os.path.join(H, 'final', 'stage'), exist_ok=True)
run(PY, os.path.join(B, 'mh_body.py'))
if '--retex' in argv or not os.path.exists(os.path.join(H, 'head', 'textures', 'skin_basecolor.jpg')):
    run(PY, os.path.join(B, 'head_tex.py'), '--res', '4096', '--out', os.path.join(H, 'head', 'textures'))
run(PY, os.path.join(B, 'head_build.py'), '--no-export', '--out', os.path.join(H, 'final', 'stage'))
gear = [PY, os.path.join(B, 'gear_build.py'), '--base', os.path.join(H, 'final', 'stage', 'human_head.blend'),
        '--out', os.path.join(H, 'final', 'stage'), '--no-export']
have_tex = os.path.exists(os.path.join(H, 'gear', 'textures', 'cordura_albedo.png'))
if '--no-bake' in argv or (have_tex and '--rebake' not in argv):
    gear.append('--no-bake')
run(*gear)
run(PY, os.path.join(B, 'integrate.py'))
out = run('node', os.path.join(B, 'validate.js'), 'final/human-proto.glb', 'final/human-proto_lods.glb')
if '"errors":0' not in out.replace(' ', '') or out.replace(' ', '').count('"errors":0') < 2:
    raise SystemExit('validator reported errors:\n' + out)
run('node', os.path.join(B, 'pack_web.mjs'), 'final/human-proto_lods.glb', 'final/viewer_pack.glb')
rep = json.load(open(os.path.join(H, 'final', 'report.json')))
tris = ' · '.join(f"{rep['lods'][k]['tris'] / 1000:.1f}k {k}" for k in ('LOD0', 'LOD1', 'LOD2'))
run('node', os.path.join(B, 'make_viewer.js'), 'final/viewer_pack.glb', 'final/viewer.html', tris)
size = os.path.getsize(os.path.join(H, 'final', 'viewer.html'))
if size >= 15e6: raise SystemExit(f'viewer.html is {size / 1e6:.2f} MB (limit 15 MB)')
vc = run('node', os.path.join(B, 'viewer_check.js'), 'final/viewer.html', 'final/checks/viewer')
real = [e for e in json.loads(vc[vc.index('{'):])['errors'] if 'ReadPixels' not in e and 'ERR_FAILED' not in e]
if real: raise SystemExit('viewer console errors: ' + json.dumps(real))
run(PY, os.path.join(B, 'posecheck.py'), '--blend', 'final/human_proto.blend', '--out', 'final/checks/poses',
    '--poses', 'Idle:1,Ready:0.4,Walk:0,Walk:0.275,Walk:0.55,CrouchIdle:1,LookAround:2.2,LookAround:4.3',
    '--views', '34,side,back', '--engine', 'cycles', '--samples', '6', '--res', '480')
if '--renders' in argv:
    run(PY, os.path.join(B, 'hero_render.py'))

if '--deliver' in argv:
    D = argv[argv.index('--deliver') + 1]
    os.makedirs(os.path.join(D, 'unity'), exist_ok=True); os.makedirs(os.path.join(D, 'textures'), exist_ok=True)
    F = os.path.join(H, 'final')
    shutil.copy(os.path.join(F, 'human-proto.glb'), os.path.join(D, 'human-proto.glb'))
    shutil.copy(os.path.join(F, 'human-proto_lods.glb'), os.path.join(D, 'unity', 'human-proto.glb'))
    shutil.copy(os.path.join(F, 'viewer.html'), os.path.join(D, 'viewer.html'))
    for f in glob.glob(os.path.join(F, 'textures', '*')): shutil.copy(f, os.path.join(D, 'textures'))
    if os.path.exists(os.path.join(F, 'renders', 'hero.png')):
        shutil.copy(os.path.join(F, 'renders', 'hero.png'), os.path.join(D, 'preview.png'))
    print('delivered to', D)
print(f'build_all done in {time.time() - T0:.0f}s')
