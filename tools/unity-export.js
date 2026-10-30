#!/usr/bin/env node
// Makes game-ready copies of exported models for Unity (or any engine), next to each source file in a
// `unity/` folder:
//   - meshes merged per node (one mesh per moving part, one sub-mesh per material), welded and indexed;
//   - UV0 on every mesh: box projection in metres (1 UV unit = 1 m), for tiling detail textures;
//     meshes that already had UVs (screens) keep them;
//   - three LODs per merged mesh, children named <node>_LOD0 / _LOD1 / _LOD2;
//   - box colliders as children named <node>_COL (invisible material; unity/Editor turns them into
//     BoxColliders);
//   - effect nodes (fx_*, laser_*, lattice traces) keep a single mesh named <node>_mesh, without LODs or colliders;
//   - the animation clips, unchanged.
// With --sealed it also writes <name>-sealed.glb: the rest pose baked into one static mesh (minus any
// node named in --drop), for swapping in once an animation has finished.
//
//   node tools/unity-export.js gadgets/wall-fortification/*.glb --sealed --drop terminal
//   node tools/unity-export.js rifles/ak47/ak47.glb
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { localCopy } = require('./lib/open-viewer');

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
  "meshoptimizer":"https://cdn.jsdelivr.net/npm/meshoptimizer@0.25.0/meshopt_simplifier.module.js"}}</script>
</head><body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier as MS } from 'meshoptimizer';

const LOD_KEEP = [1, 0.45, 0.15];          // share of triangles each LOD aims for
const LOD_ERROR = [0, 0.006, 0.015];        // allowed error, relative to the mesh size
const LOD_FLAGS = [[], [], ['Prune']];      // the far LOD may drop small loose bits (screw heads, teeth)
const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
const load = (b64) => new Promise((ok, fail) => new GLTFLoader().parse(decode(b64), '', ok, fail));
const toB64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const COLLIDER = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0, depthWrite: false });
COLLIDER.name = 'collider';

// position + normal + uv, non-indexed, transformed by m; box-projected UVs when the mesh has none
function prep(mesh, m) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(m);
  if (!g.attributes.uv) {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      for (let k = 0; k < 3; k++) {
        const v = [a, b, c][k];
        let u, w;
        if (ax >= ay && ax >= az) { u = n.x > 0 ? -v.z : v.z; w = v.y; }
        else if (ay >= az) { u = v.x; w = n.y > 0 ? -v.z : v.z; }
        else { u = n.z > 0 ? v.x : -v.x; w = v.y; }
        uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = w;
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return g;
}

// merge meshes into one indexed geometry with one group per material
function merge(entries) {
  const byMat = new Map();
  for (const { geo, mat } of entries) { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(geo); }
  const mats = [...byMat.keys()], parts = mats.map((m) => mergeGeometries(byMat.get(m), false));
  const g = mergeGeometries(parts, true);
  const groups = g.groups.map((x) => ({ ...x }));
  const w = mergeVertices(g, 1e-6);           // keeps triangle order, so the groups stay valid
  w.clearGroups(); groups.forEach((x) => w.addGroup(x.start, x.count, x.materialIndex));
  return { geo: w, mats };
}

// a copy of geo whose groups are simplified to roughly keep of their triangles, unused vertices dropped
function simplify(geo, keep, err, flags = []) {
  if (keep >= 1) return geo;
  const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array, idx = geo.index.array, out = [], groups = [];
  for (const gr of geo.groups) {
    const src = new Uint32Array(idx.subarray(gr.start, gr.start + gr.count));
    let target = Math.max(3, Math.floor(gr.count * keep / 3) * 3);
    // normals weigh in, so collapses do not drag a hard edge across a flat face (shading streaks)
    const [res] = gr.count >= 60 ? MS.simplifyWithAttributes(src, pos, 3, nrm, 3, [0.6, 0.6, 0.6], null, target, err, flags) : [src];
    groups.push({ start: out.length, count: res.length, materialIndex: gr.materialIndex });
    for (const i of res) out.push(i);
  }
  const remap = new Map(), keepIdx = [];
  const ni = out.map((i) => { if (!remap.has(i)) { remap.set(i, keepIdx.length); keepIdx.push(i); } return remap.get(i); });
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) {
    const arr = new Float32Array(keepIdx.length * a.itemSize);
    keepIdx.forEach((v, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[v * a.itemSize + c]; });
    g.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
  }
  g.setIndex(ni); groups.forEach((x) => g.addGroup(x.start, x.count, x.materialIndex));
  return g;
}

function addLods(parent, base, geo, mats, stats) {
  const scale = MS.getScale(geo.attributes.position.array, 3);
  for (let l = 0; l < LOD_KEEP.length; l++) {
    const g = simplify(geo, LOD_KEEP[l], LOD_ERROR[l], LOD_FLAGS[l]);
    const m = new THREE.Mesh(g, mats.length === 1 ? mats[0] : mats); m.name = base + '_LOD' + l;
    parent.add(m); stats[l] += g.index.count / 3;
  }
  return scale;
}

function addCollider(parent, base, geo, min = 0.03) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, size = bb.getSize(new THREE.Vector3());
  if (Math.max(size.x, size.y, size.z) < min) return 0;
  const box = new THREE.BoxGeometry(Math.max(size.x, 0.002), Math.max(size.y, 0.002), Math.max(size.z, 0.002));
  box.deleteAttribute('uv'); box.translate(...bb.getCenter(new THREE.Vector3()).toArray());
  const c = new THREE.Mesh(box, COLLIDER); c.name = base + '_COL'; parent.add(c);
  return 1;
}

window.convert = async (b64, opts) => {
  await MS.ready;
  const gltf = await load(b64), root = gltf.scene.children[0];
  root.updateMatrixWorld(true);
  const out = [];
  // animated / game file: merge per parent node
  {
    const byParent = new Map();
    root.traverse((o) => { if (o.isMesh) { if (!byParent.has(o.parent)) byParent.set(o.parent, []); byParent.get(o.parent).push(o); } });
    const stats = [0, 0, 0]; let cols = 0, nodes = 0;
    for (const [p, meshes] of byParent) {
      const entries = meshes.map((m) => ({ geo: prep(m, m.matrix), mat: m.material }));
      meshes.forEach((m) => p.remove(m));
      const { geo, mats } = merge(entries);
      const base = p === root ? 'body' : p.name;
      if (/^(fx_|laser_|lattice_[0-9]|lattice_glow)/.test(base)) {   // effect geometry (laser beam, kerf glow): one mesh, no LODs, no collider
        const m = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats); m.name = base + '_mesh'; p.add(m); nodes++; continue;
      }
      addLods(p, base, geo, mats, stats); cols += addCollider(p, base, geo); nodes++;
    }
    const buf = await new GLTFExporter().parseAsync(root, { binary: true, animations: gltf.animations });
    out.push({ suffix: '', b64: toB64(buf), info: { merged_nodes: nodes, triangles_per_lod: stats, colliders: cols, clips: gltf.animations.map((a) => a.name) } });
  }
  if (opts.sealed) {
    const g2 = await load(b64), r2 = g2.scene.children[0];
    r2.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(r2.matrixWorld).invert(), entries = [];
    const dropped = (o) => { for (let p = o; p && p !== r2; p = p.parent) if (opts.drop.includes(p.name)) return true; return false; };
    r2.traverse((o) => { if (o.isMesh && !dropped(o)) entries.push({ geo: prep(o, inv.clone().multiply(o.matrixWorld)), mat: o.material }); });
    const sealed = new THREE.Group(); sealed.name = r2.name + '_sealed';
    sealed.userData = { ...r2.userData, note: 'static rest pose' + (opts.drop.length ? ' without ' + opts.drop.join(', ') : '') };
    const { geo, mats } = merge(entries), stats = [0, 0, 0];
    addLods(sealed, 'body', geo, mats, stats); addCollider(sealed, 'body', geo);
    const buf = await new GLTFExporter().parseAsync(sealed, { binary: true });
    out.push({ suffix: '-sealed', b64: toB64(buf), info: { triangles_per_lod: stats } });
  }
  return out;
};
window.ready = true;
</script></body></html>`;

async function main() {
  const args = process.argv.slice(2);
  const sealed = args.includes('--sealed');
  const drop = args.includes('--drop') ? args[args.indexOf('--drop') + 1].split(',') : [];
  const files = args.filter((a, i) => a.endsWith('.glb') && args[i - 1] !== '--drop' && !a.includes(`${path.sep}unity${path.sep}`));
  if (!files.length) {
    console.error('usage: node tools/unity-export.js <file.glb> [...] [--sealed] [--drop node,node]');
    process.exit(1);
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.route('https://cdn.jsdelivr.net/npm/**', (route) => {
      const local = localCopy(route.request().url());
      if (!local) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(local) });
    });
    await page.setContent(PAGE);
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    for (const file of files) {
      const res = await page.evaluate(([b, o]) => window.convert(b, o), [fs.readFileSync(file).toString('base64'), { sealed, drop }]);
      const dir = path.join(path.dirname(file), 'unity');
      fs.mkdirSync(dir, { recursive: true });
      for (const r of res) {
        const out = path.join(dir, path.basename(file, '.glb') + r.suffix + '.glb');
        fs.writeFileSync(out, Buffer.from(r.b64, 'base64'));
        console.log(`wrote ${out} (${Math.round(fs.statSync(out).size / 1024)} KB) ${JSON.stringify(r.info)}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
