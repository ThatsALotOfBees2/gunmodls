// make_viewer.js <in.glb> <out.html> [trisLabel]: bundle viewer/app.js (three r0.180.0 + addons) and embed the GLB.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const H = path.join(__dirname, '..'), V = path.join(H, 'viewer');
const [glb, out, tris = ''] = process.argv.slice(2);
execFileSync(path.join(H, 'node_modules/.bin/esbuild'), [path.join(V, 'app.js'), '--bundle', '--format=esm', '--minify',
  '--legal-comments=none', '--outfile=' + path.join(V, 'app.bundle.js')], { stdio: 'inherit' });
let html = fs.readFileSync(path.join(V, 'template.html'), 'utf8');
const parts = { STYLE: fs.readFileSync(path.join(V, 'style.css'), 'utf8'), TRIS: tris,
  GLB: fs.readFileSync(glb).toString('base64'), APP: fs.readFileSync(path.join(V, 'app.bundle.js'), 'utf8').replace(/<\/script/g, '<\\/script') };
for (const [k, v] of Object.entries(parts)) html = html.split('/*' + k + '*/').join(v);
fs.writeFileSync(out, html);
console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
