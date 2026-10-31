#!/bin/sh
# Assemble the N1CK page: sh assemble.sh <out.html>   (default: n1ck/n1ck.html)
# Inlines head.html, the shared helpers, core.js, parts/*.js (head, torso, arms, legs), anim.js and the scene base.
S=/tmp/claude-0/-home-user-Crystalix-party/54ae899d-ab9c-5ac8-991a-a7fa61aa138b/scratchpad
OUT=${1:-$S/n1ck/n1ck.html}
python3 - "$S" "$OUT" <<'PY'
import sys
S, out = sys.argv[1] + '/', sys.argv[2]
t = open(S + 'n1ck/n1ck.tpl.html').read()
parts = '\n'.join(open(S + 'n1ck/parts/' + p + '.js').read() for p in ('head', 'torso', 'arms', 'legs'))
subs = (('/*@@HEAD@@*/', open(S + 'n1ck/head.html').read()), ('/*@@HELPERS@@*/', open(S + 'ak_helpers.js').read()),
        ('/*@@SCREWS@@*/', open(S + 'ws_screws.js').read()), ('/*@@CORE@@*/', open(S + 'n1ck/core.js').read()),
        ('/*@@PARTS@@*/', parts), ('/*@@ANIM@@*/', open(S + 'n1ck/anim.js').read()), ('/*@@SCENE@@*/', open(S + 'spider/scene_base.js').read()))
for k, v in subs:
    assert t.count(k) == 1, k
    t = t.replace(k, v)
open(out, 'w').write(t)
print(out, len(t))
PY
