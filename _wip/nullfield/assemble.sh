#!/bin/sh
S=/tmp/claude-0/-home-user-Crystalix-party/54ae899d-ab9c-5ac8-991a-a7fa61aa138b/scratchpad
python3 - "$S" <<'PY'
import sys
S = sys.argv[1] + '/'
t = open(S + 'nullfield/nullfield.tpl.html').read()
for k, f in (('/*@@HEAD@@*/', 'nullfield/head.html'), ('/*@@HELPERS@@*/', 'ak_helpers.js'), ('/*@@SCREWS@@*/', 'ws_screws.js'), ('/*@@SURFACE@@*/', 'ws_surface.js'), ('/*@@SCENE@@*/', 'spider/scene_base.js'), ('/*@@SOUNDDATA@@*/', 'nullfield/sounds.js')):
    assert t.count(k) == 1, k; t = t.replace(k, open(S + f).read())
open(S + 'nullfield/nullfield.html', 'w').write(t)
PY
