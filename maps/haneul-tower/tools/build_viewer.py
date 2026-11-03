#!/usr/bin/env python3
# Builds maps/haneul-tower/viewer.html from layout.json and src/ (the map's procedural source).
#   python3 tools/build_viewer.py [--fast] [--out viewer.html]
# It inlines into src/map.tpl.html: src/head.html (UI markup and styles), layout.json, src/helpers.js (geometry
# helpers), src/core.js (engine: structure by surface type, materials, overlay, export), src/parts/*.js (exterior and
# per-floor dressing, run in this order) and src/scene_base.js (renderer, composer, controls), then wraps the page as
# a standalone HTML document. --fast builds a quick page (dressing skips heavy work, no ambient occlusion).
# After building: node tools/export-glb.js, node tools/unity-export-map.js, node tools/render-preview.js (repo root).
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAP = os.path.dirname(HERE)
SRC = os.path.join(MAP, 'src')
args = sys.argv[1:]
fast = '--fast' in args
out = args[args.index('--out') + 1] if '--out' in args else os.path.join(MAP, 'viewer.html')

read = lambda *p: open(os.path.join(*p), encoding='utf-8').read()
t = read(SRC, 'map.tpl.html')
parts = '\n'.join(read(SRC, 'parts', p + '.js') for p in ('exterior', 'floor_1', 'floor_2', 'floor_3'))
layout = json.dumps(json.load(open(os.path.join(MAP, 'layout.json'), encoding='utf-8')), separators=(',', ':'))
subs = (('/*@@HEAD@@*/', read(SRC, 'head.html')), ('/*@@LAYOUT@@*/', layout),
        ('/*@@FAST@@*/', 'window.__MAP_FAST = true;' if fast else ''),
        ('/*@@HELPERS@@*/', read(SRC, 'helpers.js')), ('/*@@CORE@@*/', read(SRC, 'core.js')),
        ('/*@@PARTS@@*/', parts), ('/*@@SCENE@@*/', read(SRC, 'scene_base.js')))
for k, v in subs:
    assert t.count(k) == 1, k
    t = t.replace(k, v)

# standalone document: everything before the stage div goes into <head>
i = t.index('<div id="stage"')
head, body = t[:i].replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '').rstrip() + '\n', t[i:]
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head}<style>
  body {{ margin: 0; }}
  [hidden] {{ display: none !important; }}
</style>
</head>
<body>
{body.rstrip()}
</body>
</html>
'''
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page))
