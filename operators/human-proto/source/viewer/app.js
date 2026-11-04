// Human operator prototype viewer: three.js r0.180.0, the GLB is embedded (base64) so the page works offline.
// Bundled with esbuild into viewer.html by build/make_viewer.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const $ = (id) => document.getElementById(id);
const CLIP_LABEL = { Idle: 'Idle', Ready: 'Ready', Walk: 'Walk', CrouchIdle: 'Crouch', LookAround: 'Look around' };
const CLIP_ORDER = ['Idle', 'Ready', 'Walk', 'CrouchIdle', 'LookAround'];

// ------------------------------------------------------------------ renderer / scene
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.set(1.6, 1.35, 4.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0); controls.enableDamping = true; controls.minDistance = 0.45; controls.maxDistance = 10;
controls.update();

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;

const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
key.position.set(-2.2, 3.6, 2.8); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.2, bottom: -0.3, near: 0.5, far: 10 });
const rimL = new THREE.DirectionalLight(0xc9d6ff, 1.6); rimL.position.set(2.8, 2.2, -2.6);
const rimR = new THREE.DirectionalLight(0xb894ff, 0.9); rimR.position.set(-2.8, 1.6, -2.2);
const fill = new THREE.HemisphereLight(0xe8ecff, 0x2a2a30, 0.35);
scene.add(key, key.target, rimL, rimR, fill);

const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 96), new THREE.MeshStandardMaterial({ color: 0x3a3b42, roughness: 0.95, metalness: 0, envMapIntensity: 0.15 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(1.58, 1.6, 128), new THREE.MeshBasicMaterial({ color: 0x8a4dff, transparent: true, opacity: 0.55 }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.001; scene.add(ring);

const LIGHTS = {
  studio: { bg: null, exp: 1.0, env: 0.9, key: 2.6, rimL: 1.6, rimR: 0.9, fill: 0.35, floor: 0x2a2b31 },
  overcast: { bg: null, exp: 1.05, env: 1.5, key: 0.9, rimL: 0.5, rimR: 0.3, fill: 0.9, floor: 0x34353b },
  night: { bg: null, exp: 0.85, env: 0.25, key: 1.2, rimL: 2.4, rimR: 2.0, fill: 0.08, floor: 0x1d1d22 },
};
let lightName = 'studio';
function setLights(name) {
  const L = LIGHTS[name]; lightName = name;
  renderer.toneMappingExposure = L.exp; scene.environmentIntensity = L.env;
  key.intensity = L.key; rimL.intensity = L.rimL; rimR.intensity = L.rimR; fill.intensity = L.fill;
  floor.material.color.setHex(L.floor);
  document.querySelectorAll('[data-light]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.light === name)));
  $('st-light').textContent = name[0].toUpperCase() + name.slice(1);
}

// ------------------------------------------------------------------ model
const pivot = new THREE.Group(); scene.add(pivot);
let mixer = null, actions = {}, current = null, model = null;
const lodMeshes = { 0: [], 1: [], 2: [] };
let lodMode = 'auto', lodShown = 0, wire = false;
const st = { clip: 'Idle', spin: true, holdT: null };

function b64ToBuf(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

function tuneMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const n = m.name;
      if (n === 'Skin') {
        // realtime skin: a touch of sheen fakes the soft forward scatter at grazing angles; normal map at full strength
        const p = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(p, m);
        p.name = m.name; p.sheen = 0.12; p.sheenRoughness = 0.55; p.sheenColor = new THREE.Color(0.9, 0.62, 0.55);
        p.normalScale.set(1, 1); p.envMapIntensity = 0.8;
        o.material = p;
      } else if (n.startsWith('Hair')) {
        m.alphaTest = Math.max(m.alphaTest || 0.5, 0.35); m.transparent = false; m.alphaToCoverage = true;
        m.side = THREE.DoubleSide; m.envMapIntensity = 0.35; o.castShadow = false;
      } else if (n === 'BrowHair' || n === 'LashHair') {
        m.side = THREE.DoubleSide; m.envMapIntensity = 0.4; o.castShadow = false;
      } else if (n === 'Cornea') {
        m.transparent = true; m.depthWrite = false; m.opacity = Math.min(m.opacity, 0.15); m.roughness = 0.03; m.envMapIntensity = 1.6;
        o.castShadow = false; o.renderOrder = 2;
      } else if (n === 'Eyes') {
        m.envMapIntensity = 0.5; o.castShadow = false;
      } else if (n === 'LED') {
        m.emissiveIntensity = Math.max(m.emissiveIntensity, 4); m.toneMapped = false;
      } else if (n === 'Cordura' || n === 'Clothing' || n === 'Boots') {
        m.envMapIntensity = 0.6;
      }
    }
    const lv = /_LOD(\d)/.exec(o.name) || /_LOD(\d)/.exec(o.parent ? o.parent.name : '');
    lodMeshes[lv ? +lv[1] : 0].push(o);
  });
}

function setLod(mode) {
  lodMode = mode;
  document.querySelectorAll('[data-lod]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lod === String(mode))));
  applyLod();
}
function applyLod() {
  let lv = lodMode;
  if (lodMode === 'auto') { const d = camera.position.distanceTo(controls.target); lv = d < 7 ? 0 : d < 14 ? 1 : 2; }
  lv = +lv; if (lv === lodShown && lodMeshes[lv].length && lodMeshes[lv][0].visible) return;
  lodShown = lv;
  for (const k of [0, 1, 2]) for (const o of lodMeshes[k]) o.visible = k === lv;
  let tris = 0; for (const o of lodMeshes[lv]) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  $('st-lod').textContent = `LOD${lv} · ${(tris / 1000).toFixed(1)}k`;
}
function setWire(on) {
  wire = on; $('wire').setAttribute('aria-pressed', String(on));
  for (const k of [0, 1, 2]) for (const o of lodMeshes[k]) for (const m of [].concat(o.material)) m.wireframe = on;
}

function play(name, fade = 0.35) {
  const a = actions[name]; if (!a) return;
  st.clip = name; st.holdT = null;
  if (current && current !== a) { a.reset().play(); current.crossFadeTo(a, fade, false); } else a.reset().play();
  current = a;
  document.querySelectorAll('[data-clip]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clip === name)));
  $('st-clip').textContent = CLIP_LABEL[name] || name;
}

// ------------------------------------------------------------------ views
const VIEWS = {
  full: { pos: [1.6, 1.35, 4.6], tgt: [0, 0.95, 0] },
  face: { pos: [0.4, 1.68, 1.05], tgt: [0, 1.63, 0] },
  armour: { pos: [0.75, 1.42, 1.45], tgt: [0, 1.22, 0] },
  back: { pos: [-1.4, 1.5, -3.6], tgt: [0, 1.05, 0] },
};
let camTween = null;
function goView(name, instant = false) {
  const v = VIEWS[name]; if (!v) return;
  const to = { pos: new THREE.Vector3(...v.pos), tgt: new THREE.Vector3(...v.tgt) };
  if (instant) { camera.position.copy(to.pos); controls.target.copy(to.tgt); controls.update(); camTween = null; return; }
  camTween = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to, t: 0 };
  if (name !== 'full') setSpin(false);
}
function setSpin(on) { st.spin = on; $('spin').setAttribute('aria-pressed', String(on)); }

// ------------------------------------------------------------------ UI
function buildUI() {
  const cg = $('clips');
  for (const n of CLIP_ORDER) {
    if (!actions[n]) continue;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.clip = n; b.textContent = CLIP_LABEL[n] || n;
    b.setAttribute('aria-pressed', 'false'); b.onclick = () => play(n); cg.appendChild(b);
  }
  document.querySelectorAll('[data-light]').forEach((b) => { b.onclick = () => setLights(b.dataset.light); });
  document.querySelectorAll('[data-lod]').forEach((b) => { b.onclick = () => setLod(b.dataset.lod === 'auto' ? 'auto' : +b.dataset.lod); });
  document.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => goView(b.dataset.view); });
  $('wire').onclick = () => setWire(!wire);
  $('spin').onclick = () => setSpin(!st.spin);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  renderer.domElement.addEventListener('pointerdown', () => setSpin(false));
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
function tick(dt) {
  if (mixer) {
    if (st.holdT !== null) { mixer.setTime(st.holdT); } else mixer.update(dt);
  }
  if (st.spin) pivot.rotation.y += dt * 0.25;
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 0.8); const e = camTween.t * camTween.t * (3 - 2 * camTween.t);
    camera.position.lerpVectors(camTween.from.pos, camTween.to.pos, e); controls.target.lerpVectors(camTween.from.tgt, camTween.to.tgt, e);
    if (camTween.t >= 1) camTween = null;
  }
  controls.update(); applyLod();
}
let looping = false;
function loop() { tick(Math.min(clock.getDelta(), 1 / 20)); renderer.render(scene, camera); }
function setLoop(on) { looping = on; renderer.setAnimationLoop(on ? loop : null); }

function preview() {
  setLoop(false); setSpin(false); pivot.rotation.y = 0;
  document.querySelectorAll('.plate, .bar, .hint').forEach((e) => { e.hidden = true; });
  play('Ready', 0); st.holdT = 0.4; tick(0);
  camera.position.set(1.15, 1.2, 3.0); controls.target.set(0.02, 1.0, 0); controls.update();
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ go
async function main() {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const buf = b64ToBuf(document.getElementById('glb-data').textContent.trim());
  const gltf = await loader.parseAsync(buf, '');
  model = gltf.scene; pivot.add(model);
  tuneMaterials(model);
  mixer = new THREE.AnimationMixer(model);
  for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
  buildUI(); setLights('studio'); setLod('auto'); applyLod(); play('Idle', 0);
  $('loading').hidden = true;
  tick(0); renderer.render(scene, camera); setLoop(true);
  window.__model.ready = true;
}
window.__model = {
  id: 'human-proto', ready: false, preview,
  exportGLB: () => document.getElementById('glb-data').textContent.trim(),
  debug: {
    tick, stop: () => setLoop(false), start: () => setLoop(true),
    renderOnce: () => { controls.update(); applyLod(); renderer.render(scene, camera); const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); },
    // set(clip, t): hold one clip's pose at time t (seconds)
    set: (clip, t) => { if (!actions[clip]) throw new Error('no clip ' + clip); play(clip, 0); st.holdT = t; mixer.setTime(t); },
    clips: () => Object.keys(actions), lod: (n) => setLod(n), wire: (on) => setWire(on), lights: (n) => setLights(n),
    spin: (on) => setSpin(on), goView, camera, controls, scene, renderer, pivot, lodMeshes,
    stats: () => { const out = {}; for (const k of [0, 1, 2]) { let t = 0; for (const o of lodMeshes[k]) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; out['LOD' + k] = { meshes: lodMeshes[k].length, tris: t }; } return out; },
  },
};
main().catch((e) => { console.error(e); $('loading').textContent = 'Failed to load: ' + e.message; });
