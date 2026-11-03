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
// Opt-in per model, from the root node's extras `unity` (characters made of rigid parts):
//   { skinned: true, lod: { keep: [..], error: [..], drop: { 1: [material names], 2: [..] },
//                           flags: [[], [..], ['Prune']] (meshopt flags per LOD), normalWeight (default 0.6),
//                           protect: [{ material?, node? (regex), keep?, error?, prune? }],
//                           dropFlipped: true (LOD1+: drop triangles the simplifier turned against their vertex
//                           normals, and degenerate ones) },
//     colliders: { skip: 'regex on node names', merge: { node: 'regex of descendants to include in its box' } } }
//   merges every part into one skinned mesh per LOD (each vertex 100% on its own node, which becomes a joint),
//   so a LOD is one renderer with one sub-mesh per material; LODs can drop small materials; protect rules
//   simplify matching groups gently on LOD1+ (keep at least `keep`, their own error, no pruning unless prune is
//   set), so a key part never vanishes at range; colliders as above. The skin's first joint is the common
//   ancestor of all joints (the skeleton root, e.g. the hips).
//   - rigid files may set { lod: { keep, error, flags } } (three LODs) to override the default LOD targets.
//   - collider proxies (nodes named col_*, the furniture convention): a box proxy keeps its node with one child box
//     <node>_COL; a convex proxy (name ending _hull) keeps its hull as an invisible child <node>_HULL (no LODs); a
//     node with proxies among its children gets no automatic box of its own. Pre-cut chunks (chunk_* nodes inside a
//     chunks_* group) get a convex hull <node>_HULL of their own mesh instead of a box (cells are convex, and boxes of
//     neighbouring cells overlap). Every hull is kept to at most 250 triangles (Unity cooks convex MeshColliders up to
//     255). Every primitive written is checked to be indexed whole triangles.
// Texture transforms (KHR_texture_transform) and the scene name of the source file are kept.
//
//   node tools/unity-export.js gadgets/wall-fortification/*.glb --sealed --drop terminal
//   node tools/unity-export.js rifles/ak47/ak47.glb
//   node tools/unity-export.js props/haneul-furniture/glb/*.glb --out props/haneul-furniture/unity   (--out: write there
//   instead of a unity/ folder next to each file)
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
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
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
function simplify(geo, keep, err, flags = [], nw = 0.6) {
  if (keep >= 1) return geo;
  const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array, idx = geo.index.array, out = [], groups = [];
  for (const gr of geo.groups) {
    const src = new Uint32Array(idx.subarray(gr.start, gr.start + gr.count));
    let target = Math.max(3, Math.floor(gr.count * keep / 3) * 3);
    // normals weigh in, so collapses do not drag a hard edge across a flat face (shading streaks)
    const [res] = gr.count >= 60 ? MS.simplifyWithAttributes(src, pos, 3, nrm, 3, [nw, nw, nw], null, target, err, flags) : [src];
    if (!res.length) continue;                // simplified away: no empty (non-indexed) primitive
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

function addLods(parent, base, geo, mats, stats, L = {}) {
  const scale = MS.getScale(geo.attributes.position.array, 3), KEEP = L.keep || LOD_KEEP, ERR = L.error || LOD_ERROR, FLAGS = L.flags || LOD_FLAGS;
  for (let l = 0; l < KEEP.length; l++) {
    const g = simplify(geo, KEEP[l], ERR[l], FLAGS[l]);
    const m = new THREE.Mesh(g, mats.length === 1 ? mats[0] : mats); m.name = base + '_LOD' + l;
    parent.add(m); stats[l] += g.index.count / 3;
  }
  return scale;
}

// the triangles of one group, as an indexed geometry with only the vertices they use
function subGeo(g, gr) {
  const idx = g.index.array.subarray(gr.start, gr.start + gr.count), remap = new Map(), keep = [], ni = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) { let v = remap.get(idx[i]); if (v === undefined) { v = keep.length; remap.set(idx[i], v); keep.push(idx[i]); } ni[i] = v; }
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array(keep.length * a.itemSize);
    keep.forEach((v, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[v * a.itemSize + c]; });
    out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.setIndex(new THREE.BufferAttribute(ni, 1));
  return out;
}

// drop the triangles of an indexed geometry whose winding disagrees with their vertex normals, and degenerate ones
function dropFlipped(g) {
  const P = g.attributes.position.array, N = g.attributes.normal && g.attributes.normal.array, I = g.index.array, out = [];
  if (!N) return g;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (Math.hypot(fx, fy, fz) < 1e-12) continue;
    if (fx * (N[a] + N[b] + N[c]) + fy * (N[a + 1] + N[b + 1] + N[c + 1]) + fz * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) continue;
    out.push(I[t], I[t + 1], I[t + 2]);
  }
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(out), 1));
  return g;
}

// rigid-part character -> one skinned mesh per LOD (see the header)
async function skinnedCopy(gltf, root, cfg) {
  root.updateMatrixWorld(true);
  const L = cfg.lod || {}, KEEP = L.keep || LOD_KEEP, ERR = L.error || LOD_ERROR, DROP = L.drop || {}, FLAGS = L.flags || LOD_FLAGS, NW = L.normalWeight ?? 0.6;
  const C = cfg.colliders || {}, skip = C.skip ? new RegExp(C.skip) : null, mergeRe = Object.fromEntries(Object.entries(C.merge || {}).map(([k, v]) => [k, new RegExp(v)]));
  const rootInv = root.matrixWorld.clone().invert(), byNode = new Map();
  root.traverse((o) => { if (o.isMesh) { if (!byNode.has(o.parent)) byNode.set(o.parent, []); byNode.get(o.parent).push(o); } });
  const joints = [...byNode.keys()], levels = KEEP.map(() => []), nodeGeo = new Map(), stats = KEEP.map(() => 0);
  // the skeleton root (the lowest common ancestor of the joints) goes first: GLTFExporter writes joints[0] as
  // skins[].skeleton, and glTFast uses that as SkinnedMeshRenderer.rootBone
  const up = (n) => { const a = []; for (let p = n; p; p = p.parent) a.push(p); return a; };
  const lca = up(joints[0]).find((p) => joints.every((j) => up(j).includes(p)));
  if (joints.indexOf(lca) > 0) { joints.splice(joints.indexOf(lca), 1); joints.unshift(lca); }
  const PROT = (L.protect || []).map((p) => ({ node: p.node ? new RegExp(p.node) : null, mat: p.material || null, keep: p.keep || 0, error: p.error, prune: !!p.prune }));
  joints.forEach((node, j) => {
    const meshes = byNode.get(node), entries = meshes.map((m) => ({ geo: prep(m, m.matrix), mat: m.material }));
    meshes.forEach((m) => node.remove(m));
    const { geo, mats } = merge(entries), toRoot = rootInv.clone().multiply(node.matrixWorld);
    nodeGeo.set(node, geo);
    for (let l = 0; l < KEEP.length; l++) {
      const g = simplify(geo, KEEP[l], ERR[l], FLAGS[l] || [], NW), drop = DROP[l] || [];
      for (const g0 of g.groups) {
        const mat = mats[g0.materialIndex]; if (drop.includes(mat.name)) continue;
        // a protected group is simplified on its own terms (same scale: the whole part), then taken from that result
        let src = g, gr = g0;
        const rule = l > 0 && PROT.find((p) => (!p.node || p.node.test(node.name)) && (!p.mat || p.mat === mat.name));
        if (rule) { src = simplify(geo, Math.max(KEEP[l], rule.keep), rule.error ?? ERR[l], rule.prune ? (FLAGS[l] || []) : [], NW); gr = src.groups.find((x) => x.materialIndex === g0.materialIndex); }
        if (!gr || !gr.count) continue;
        // joints as bytes (up to 256 parts) and weights as normalized bytes: a quarter of the size of floats
        const sub = subGeo(src, gr).applyMatrix4(toRoot), n = sub.attributes.position.count, big = joints.length > 255;
        if (L.dropFlipped && l > 0) { dropFlipped(sub); if (!sub.index.count) continue; }
        const si = big ? new Uint16Array(n * 4) : new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) { si[i * 4] = j; sw[i * 4] = 255; }
        sub.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); sub.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
        levels[l].push({ geo: sub, mat }); stats[l] += sub.index.count / 3;
      }
    }
  });
  // colliders: one box per part node, minus the skipped ones; a node can take in its descendants (a hand its fingers)
  let cols = 0;
  for (const node of joints) {
    if (skip && skip.test(node.name)) continue;
    let geo = nodeGeo.get(node);
    if (mergeRe[node.name]) {
      const inv = node.matrixWorld.clone().invert(), list = [geo];
      for (const other of joints) if (mergeRe[node.name].test(other.name)) list.push(nodeGeo.get(other).clone().applyMatrix4(inv.clone().multiply(other.matrixWorld)));
      geo = mergeGeometries(list.map((g) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', g.attributes.position); return c; }), false);
    }
    cols += addCollider(node, node.name, geo);
  }
  const skeleton = new THREE.Skeleton(joints, joints.map((n) => rootInv.clone().multiply(n.matrixWorld).invert())), draws = [];
  for (let l = 0; l < KEEP.length; l++) {
    const byMat = new Map(); for (const e of levels[l]) { if (!byMat.has(e.mat)) byMat.set(e.mat, []); byMat.get(e.mat).push(e.geo); }
    const mats = [...byMat.keys()], g = mergeGeometries(mats.map((m) => mergeGeometries(byMat.get(m), false)), true);
    const mesh = new THREE.SkinnedMesh(g, mats); mesh.name = 'body_LOD' + l; mesh.frustumCulled = false;
    root.add(mesh); mesh.bind(skeleton, new THREE.Matrix4()); draws.push(mats.length);
  }
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, animations: gltf.animations });
  return { suffix: '', b64: toB64(buf), info: { skinned: true, joints: joints.length, triangles_per_lod: stats.map(Math.round), draws_per_lod: draws, colliders: cols, clips: gltf.animations.map((a) => a.name) } };
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

// convex hull of a geometry's points, at most maxTris triangles (a farthest-point sample of its corners when it has more)
function hullOf(geo, maxTris = 250) {
  const pa = geo.attributes.position, uniq = new Map();
  for (let i = 0; i < pa.count; i++) { const k = Math.round(pa.getX(i) * 1e5) + ',' + Math.round(pa.getY(i) * 1e5) + ',' + Math.round(pa.getZ(i) * 1e5); if (!uniq.has(k)) uniq.set(k, new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i))); }
  const pts = [...uniq.values()];
  if (pts.length < 4) return null;
  let g = new ConvexGeometry(pts);
  for (let n = 100; g.attributes.position.count / 3 > maxTris && n >= 12; n = Math.floor(n * 0.8)) {
    const pick = [pts[0]], dist = pts.map((q) => q.distanceToSquared(pts[0]));
    while (pick.length < Math.min(n, pts.length)) { let bi = 0; for (let i = 1; i < pts.length; i++) if (dist[i] > dist[bi]) bi = i; pick.push(pts[bi]); for (let i = 0; i < pts.length; i++) dist[i] = Math.min(dist[i], pts[i].distanceToSquared(pts[bi])); }
    g = new ConvexGeometry(pick);
  }
  return g;
}
// an invisible <base>_HULL child (falls back to a box when the mesh is too flat for a hull)
function addHull(parent, base, geo) {
  const g = hullOf(geo); if (!g) return addCollider(parent, base, geo, 0);
  const c = new THREE.Mesh(g, COLLIDER); c.name = base + '_HULL'; parent.add(c);
  return 1;
}
// every mesh must be indexed triangles: no index count or material group that is not whole triangles
function checkPrimitives(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
    if (n % 3) throw new Error(o.name + ': ' + n + ' indices is not whole triangles');
    for (const gr of g.groups) if (!gr.count || gr.count % 3) throw new Error(o.name + ': material group with ' + gr.count + ' indices');
  });
}

window.convert = async (b64, opts) => {
  await MS.ready;
  const gltf = await load(b64), root = gltf.scene.children[0];
  root.updateMatrixWorld(true);
  const out = [], cfg = root.userData && root.userData.unity;
  if (cfg && cfg.skinned) out.push(await skinnedCopy(gltf, root, cfg));
  // animated / game file: merge per parent node
  else {
    const byParent = new Map(), proxies = [];
    let cols = 0, nodes = 0;
    root.traverse((o) => { if (o.isMesh && /^col_/.test(o.name)) proxies.push(o); });
    for (const o of proxies) {
      const g = new THREE.Group(); g.name = o.name; g.position.copy(o.position); g.quaternion.copy(o.quaternion); g.scale.copy(o.scale);
      g.userData = o.userData; o.parent.add(g); o.parent.remove(o);
      if (/_hull$/.test(o.name)) {
        let hg = prep(o, new THREE.Matrix4());
        if (hg.attributes.position.count / 3 > 250) hg = hullOf(hg) || hg;
        const h = new THREE.Mesh(hg, COLLIDER); h.name = o.name + '_HULL'; g.add(h); cols++;
      }
      else cols += addCollider(g, o.name, o.geometry.clone(), 0);
    }
    const isProxy = (o) => /_(COL|HULL)$/.test(o.name);
    root.traverse((o) => { if (o.isMesh && !isProxy(o)) { if (!byParent.has(o.parent)) byParent.set(o.parent, []); byParent.get(o.parent).push(o); } });
    const stats = [0, 0, 0];
    for (const [p, meshes] of byParent) {
      const entries = meshes.map((m) => ({ geo: prep(m, m.matrix), mat: m.material }));
      meshes.forEach((m) => p.remove(m));
      const { geo, mats } = merge(entries);
      const base = p === root ? 'body' : p.name;
      if (/^(fx_|laser_|lattice_[0-9]|lattice_glow)/.test(base)) {   // effect geometry (laser beam, kerf glow): one mesh, no LODs, no collider
        const m = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats); m.name = base + '_mesh'; p.add(m); nodes++; continue;
      }
      addLods(p, base, geo, mats, stats, (cfg && cfg.lod) || {}); nodes++;
      if (/^chunk_/.test(base) && p.parent && /^chunks_/.test(p.parent.name)) cols += addHull(p, base, geo);
      else if (!p.children.some((c) => /^col_/.test(c.name))) cols += addCollider(p, base, geo);
    }
    checkPrimitives(root);
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

// the JSON chunk of a .glb, and a copy of a .glb with its JSON rewritten
function glbJson(buf) { const jl = buf.readUInt32LE(12); return JSON.parse(buf.subarray(20, 20 + jl).toString('utf8')); }
function glbWithJson(buf, json) {
  const jl = buf.readUInt32LE(12); let js = Buffer.from(JSON.stringify(json), 'utf8');
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - js.length % 4, 0x20)]);
  const head = Buffer.alloc(20); buf.copy(head, 0, 0, 12); head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
  const out = Buffer.concat([head, js, buf.subarray(20 + jl)]); out.writeUInt32LE(out.length, 8);
  return out;
}
// three's loader turns an identity KHR_texture_transform into a plain texture and its exporter drops it; put back
// the source's texture transforms (by material name and slot) and its scene name
function carryOver(src, outBuf) {
  const s = glbJson(src), o = glbJson(outBuf), slots = ['baseColorTexture', 'emissiveTexture', 'normalTexture', 'occlusionTexture', 'metallicRoughnessTexture'];
  const tex = (m, k) => k in (m.pbrMetallicRoughness || {}) ? m.pbrMetallicRoughness[k] : m[k];
  let changed = false;
  for (const sm of s.materials || []) for (const k of slots) {
    const st = tex(sm, k); if (!st || !st.extensions || !st.extensions.KHR_texture_transform) continue;
    for (const om of o.materials || []) { if (om.name !== sm.name) continue; const ot = tex(om, k); if (!ot) continue;
      ot.extensions = Object.assign(ot.extensions || {}, { KHR_texture_transform: st.extensions.KHR_texture_transform }); changed = true; }
  }
  if (changed) o.extensionsUsed = [...new Set([...(o.extensionsUsed || []), 'KHR_texture_transform'])];
  if (s.scenes && s.scenes[0] && s.scenes[0].name && o.scenes && o.scenes[0] && s.scenes[0].name !== 'AuxScene') { o.scenes[0].name = s.scenes[0].name; changed = true; }
  return changed ? glbWithJson(outBuf, o) : outBuf;
}

async function main() {
  const args = process.argv.slice(2);
  const sealed = args.includes('--sealed');
  const drop = args.includes('--drop') ? args[args.indexOf('--drop') + 1].split(',') : [];
  const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  const files = args.filter((a, i) => a.endsWith('.glb') && args[i - 1] !== '--drop' && args[i - 1] !== '--out' && !a.includes(`${path.sep}unity${path.sep}`));
  if (!files.length) {
    console.error('usage: node tools/unity-export.js <file.glb> [...] [--sealed] [--drop node,node] [--out dir]');
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
      const src = fs.readFileSync(file);
      const res = await page.evaluate(([b, o]) => window.convert(b, o), [src.toString('base64'), { sealed, drop }]);
      const dir = outArg ? path.resolve(outArg) : path.join(path.dirname(file), 'unity');
      fs.mkdirSync(dir, { recursive: true });
      for (const r of res) {
        const out = path.join(dir, path.basename(file, '.glb') + r.suffix + '.glb');
        fs.writeFileSync(out, carryOver(src, Buffer.from(r.b64, 'base64')));
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
