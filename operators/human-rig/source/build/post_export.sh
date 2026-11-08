#!/bin/bash
# after `integrate_rig.py --stage export`: tangent fix, validator, meshopt pack, viewer bundle. Run from anywhere.
set -e
R=$(cd "$(dirname "$0")/.." && pwd); H=$(dirname "$R"); D=$R/deliver/operators/human-rig
cd "$H"
cp "$R/build/fix_tangents.mjs" build/_fix_tangents.mjs
for f in "$D/human-rig.glb" "$D/unity/human-rig.glb" "$R/final/human-rig_web.glb"; do node build/_fix_tangents.mjs "$f"; done
node build/validate.js "$D/human-rig.glb" "$D/unity/human-rig.glb" | tee "$R/final/validator.txt"
node build/pack_web.mjs "$R/final/human-rig_web.glb" "$R/final/human-rig_web_packed.glb" 2>&1 | grep -v quantize || true
node "$R/build/make_viewer_rig.js" "$R/final/human-rig_web_packed.glb" "$D/viewer.html"
