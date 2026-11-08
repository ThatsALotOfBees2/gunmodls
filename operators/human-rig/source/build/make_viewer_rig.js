// make_viewer_rig.js <packed.glb> <out.html>: bundle viewer/app.js (three r0.180.0) and embed the GLB + rig manifest.
// Run from $H (node_modules there): node rig/build/make_viewer_rig.js rig/final/human-rig_web_packed.glb out.html
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const R = path.join(__dirname, '..'), H = path.join(R, '..'), V = path.join(R, 'viewer');
const [glb, out] = process.argv.slice(2);
execFileSync(path.join(H, 'node_modules/.bin/esbuild'), [path.join(V, 'app.js'), '--bundle', '--format=esm', '--minify',
  '--legal-comments=none', '--outfile=' + path.join(V, 'app.bundle.js'), '--alias:three=' + path.join(H, 'node_modules/three')], { stdio: 'inherit', cwd: H });
const man = JSON.parse(fs.readFileSync(path.join(R, 'final', 'viewer_manifest.json'), 'utf8'));
const a = man.lod_tris.Assault;
let html = fs.readFileSync(path.join(V, 'template.html'), 'utf8');
const parts = { STYLE: fs.readFileSync(path.join(V, 'style.css'), 'utf8'),
  TRIS: `${(a.LOD0.tris / 1000).toFixed(1)}k / ${(a.LOD1.tris / 1000).toFixed(1)}k / ${(a.LOD2.tris / 1000).toFixed(1)}k tris`,
  NMODS: String(man.modules.length), MANIFEST: JSON.stringify(man),
  GLB: fs.readFileSync(glb).toString('base64'), APP: fs.readFileSync(path.join(V, 'app.bundle.js'), 'utf8').replace(/<\/script/g, '<\\/script') };
for (const [k, v] of Object.entries(parts)) html = html.split('/*' + k + '*/').join(v);
fs.writeFileSync(out, html);
console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
