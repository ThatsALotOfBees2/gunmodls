#!/usr/bin/env node
// Loads .glb files with three.js GLTFLoader (as any app would) and reports what is inside:
// real-world size, parts, materials, triangle count and animations.
//
//   node tools/check-glb.js shotguns/m590a1/m590a1.glb [--render out.png] [--time 0.2]
//
// --render draws the loaded file on its own under studio lighting; --time poses its first
// animation at that many seconds before rendering.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { localCopy } = require('./lib/open-viewer');

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#1b1d1c}canvas{display:block}</style>
<script type="importmap">{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"}}</script>
</head><body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
const load = (b64) => new Promise((ok, fail) => new GLTFLoader().parse(decode(b64), '', ok, fail));
window.inspect = async (b64) => {
  const gltf = await load(b64);
  const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3());
  const parts = [], mats = new Set(); let tris = 0;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += t; mats.add(o.material.name || '(unnamed)');
    parts.push({ name: o.name, parent: o.parent.name, material: o.material.name, triangles: t });
  });
  return {
    root: gltf.scene.children.map((c) => c.name),
    extras: gltf.scene.children[0] && gltf.scene.children[0].userData,
    size_m: [size.x, size.y, size.z].map((v) => +v.toFixed(4)),
    min_m: [box.min.x, box.min.y, box.min.z].map((v) => +v.toFixed(4)),
    max_m: [box.max.x, box.max.y, box.max.z].map((v) => +v.toFixed(4)),
    triangles: tris, meshes: parts.length, materials: [...mats], parts,
    animations: gltf.animations.map((a) => ({ name: a.name, seconds: +a.duration.toFixed(3), tracks: a.tracks.map((t) => t.name) })),
  };
};
window.render = async (b64, time) => {
  const gltf = await load(b64);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1d1c');
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight('#fff4e6', 2.2); key.position.set(-1, 3, 2); scene.add(key);
  scene.add(gltf.scene);
  if (time != null && gltf.animations[0]) {
    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.setTime(time);
  }
  const box = new THREE.Box3().setFromObject(gltf.scene), c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, r / 100, r * 100);
  cam.position.copy(c).add(new THREE.Vector3(r * 2.6, r * 1.1, r * 1.4));
  cam.lookAt(c);
  renderer.render(scene, cam);
};
window.ready = true;
</script></body></html>`;

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a, i) => !a.startsWith('--') && !['--render', '--time'].includes(args[i - 1]));
  const renderOut = args.includes('--render') ? args[args.indexOf('--render') + 1] : null;
  const time = args.includes('--time') ? Number(args[args.indexOf('--time') + 1]) : null;
  if (!files.length) {
    console.error('usage: node tools/check-glb.js <file.glb> [...] [--render out.png] [--time seconds]');
    process.exit(1);
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const file of files) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
      page.on('pageerror', (e) => console.error('page error:', e.message));
      await page.route('https://cdn.jsdelivr.net/npm/**', (route) => {
        const local = localCopy(route.request().url());
        if (!local) return route.continue();
        return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(local) });
      });
      await page.setContent(PAGE);
      await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
      const b64 = fs.readFileSync(file).toString('base64');
      const info = await page.evaluate((b) => window.inspect(b), b64);
      console.log(`\n${file}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
      console.log(JSON.stringify(info, null, 2));
      if (renderOut) {
        await page.evaluate(([b, t]) => window.render(b, t), [b64, time]);
        const out = files.length > 1 ? renderOut.replace(/\.png$/, `-${path.basename(file, '.glb')}.png`) : renderOut;
        await page.screenshot({ path: out });
        console.log(`rendered ${out}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
