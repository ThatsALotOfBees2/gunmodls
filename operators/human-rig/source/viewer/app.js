// Human operator rig viewer: three.js r0.180.0, the meshopt-packed GLB (LOD0-2, all modules, all clips) is embedded
// as base64 so the page works offline. Bundled by build/make_viewer_rig.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const $ = (id) => document.getElementById(id);
const RIG = JSON.parse($('rig-data').textContent);
const CLIP_LABEL = { Idle: 'Idle', Ready: 'Ready', Walk: 'Walk', CrouchIdle: 'Crouch', LookAround: 'Look', Holster: 'Draw', HolsterBelt: 'Draw (belt)', Reload: 'Reload' };
const CLIP_ORDER = ['Idle', 'Ready', 'Walk', 'CrouchIdle', 'LookAround', 'Holster', 'HolsterBelt', 'Reload'];

// ------------------------------------------------------------------ renderer / scene
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.45; controls.maxDistance = 22;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

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
  studio: { exp: 1.15, env: 0.9, key: 2.8, rimL: 1.7, rimR: 0.9, fill: 0.4, floor: 0x2a2b31 },
  overcast: { exp: 1.2, env: 1.6, key: 0.9, rimL: 0.5, rimR: 0.3, fill: 1.0, floor: 0x34353b },
  night: { exp: 0.95, env: 0.25, key: 1.2, rimL: 2.6, rimR: 2.1, fill: 0.08, floor: 0x1d1d22 },
};
function setLights(name) {
  const L = LIGHTS[name];
  renderer.toneMappingExposure = L.exp; scene.environmentIntensity = L.env;
  key.intensity = L.key; rimL.intensity = L.rimL; rimR.intensity = L.rimR; fill.intensity = L.fill;
  floor.material.color.setHex(L.floor);
  document.querySelectorAll('[data-light]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.light === name)));
}

// ------------------------------------------------------------------ model + loadout state
const pivot = new THREE.Group(); scene.add(pivot);
const lift = new THREE.Group(); pivot.add(lift);           // drops by the boots' ground offset when boots are off
let mixer = null, actions = {}, current = null, model = null;
const nodes = [];   // {obj, name, lod, module, part, variant, hiddenBy[], partRequires[], hiddenWith[]}
let lodMode = 'auto', lodShown = 0;
const st = { clip: 'Idle', spin: true, holdT: null, preset: 'Assault' };
const MODS = Object.fromEntries(RIG.modules.map((m) => [m.id, m]));
// loadout: module -> variant ('' = no variants) for modules that are on
let loadout = {};

function b64ToBuf(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
const list = (s) => (s ? String(s).split(',').filter(Boolean) : []);

function tuneMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    for (const m of [].concat(o.material)) {
      const n = m.name;
      if (n === 'BASE_Skin') { m.envMapIntensity = 0.8; }
      else if (n.startsWith('BASE_Hair')) { m.alphaTest = Math.max(m.alphaTest || 0.5, 0.35); m.transparent = false; m.alphaToCoverage = true; m.side = THREE.DoubleSide; m.envMapIntensity = 0.35; o.castShadow = false; }
      else if (n === 'BASE_BrowHair' || n === 'BASE_LashHair') { m.side = THREE.DoubleSide; o.castShadow = false; }
      else if (n === 'BASE_Cornea') { m.transparent = true; m.depthWrite = false; m.opacity = Math.min(m.opacity, 0.15); m.roughness = 0.03; m.envMapIntensity = 1.6; o.castShadow = false; o.renderOrder = 2; }
      else if (n === 'MAT_LED') { m.emissiveIntensity = Math.max(m.emissiveIntensity, 4); m.toneMapped = false; }
      else if (n === 'MAT_Lens') { m.transparent = true; m.depthWrite = false; o.renderOrder = 3; m.envMapIntensity = 1.4; }
      else if (n.startsWith('MAT_')) { m.envMapIntensity = 0.55; }
    }
  });
}

function collectNodes(root) {
  root.traverse((o) => {
    const u = o.userData || {};
    if (!u.module) return;
    const m = /^(.*)_LOD(\d)$/.exec(o.name);
    nodes.push({ obj: o, name: m ? m[1] : o.name, lod: m ? +m[2] : 0, module: u.module, part: u.part || 'main', variant: u.variant || '',
      hiddenBy: list(u.hidden_by), partRequires: list(u.part_requires), hiddenWith: list(u.hidden_with) });
  });
}

// requirements: drop modules whose required modules are off (repeat until stable)
function resolve(lo) {
  const on = { ...lo }; let ch = true;
  while (ch) { ch = false; for (const k of Object.keys(on)) if ((MODS[k].requires || []).some((r) => !(r in on))) { delete on[k]; ch = true; } }
  return on;
}
function nodeVisible(n, on) {
  if (n.module === 'body') return !n.hiddenBy.some((m) => m in on);
  if (!(n.module in on)) return false;
  const want = on[n.module] || MODS[n.module].default_variant || '';
  if (n.variant && n.variant !== want) return false;
  if (n.partRequires.some((r) => !(r in on))) return false;
  if (n.hiddenWith.some((r) => r in on)) return false;
  return true;
}
let visibleSet = new Set();
function applyLoadout() {
  const on = resolve(loadout);
  visibleSet = new Set(nodes.filter((n) => nodeVisible(n, on)).map((n) => n.name));
  lift.position.y = 'boots' in on ? 0 : -RIG.ground_offset_m;
  applyLod(true);
  // UI state
  for (const m of RIG.modules) {
    const cb = $('cb-' + m.id); if (!cb) continue;
    cb.checked = m.id in loadout;
    cb.closest('label').classList.toggle('off', (m.id in loadout) && !(m.id in on));
    const sel = $('var-' + m.id); if (sel) sel.value = loadout[m.id] || m.default_variant;
  }
  const hv = $('holster-var'); if (hv) hv.value = 'holster_belt' in loadout ? 'belt' : 'drop';
  document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === st.preset)));
  $('st-kit').textContent = st.preset || 'Custom';
}
function setPreset(name) {
  loadout = {}; for (const [k, v] of Object.entries(RIG.presets[name])) loadout[k] = v || '';
  st.preset = name; applyLoadout();
}
function toggleModule(id, on) {
  if (on) {
    loadout[id] = loadout[id] || MODS[id].default_variant || '';
    for (const x of MODS[id].exclusive_with || []) delete loadout[x];
    for (const m of RIG.modules) if ((m.exclusive_with || []).includes(id)) delete loadout[m.id];
  } else delete loadout[id];
  st.preset = null; applyLoadout();
}

function lodLevel() {
  if (lodMode !== 'auto') return +lodMode;
  // projected size, not raw distance: on a narrow (phone) screen the camera sits further back for the same framing
  const a = camera.aspect, d = camera.position.distanceTo(controls.target) * Math.min(1, a / 0.8);
  return d < 6 ? 0 : d < 12 ? 1 : 2;
}
function applyLod(force = false) {
  const lv = lodLevel();
  if (!force && lv === lodShown) return;
  lodShown = lv; let tris = 0, calls = 0;
  for (const n of nodes) {
    const v = n.lod === lv && visibleSet.has(n.name); n.obj.visible = v;
    if (v) n.obj.traverse((o) => { if (o.isMesh) { calls++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  }
  $('st-lod').textContent = `LOD${lv} · ${(tris / 1000).toFixed(1)}k`;
  $('st-tris').textContent = `${(tris / 1000).toFixed(1)}k tris · ${calls} draws`;
  st.tris = tris; st.calls = calls;
}
function setLod(mode) {
  lodMode = mode;
  document.querySelectorAll('[data-lod]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lod === String(mode))));
  applyLod(true);
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
  face: { pos: [0.4, 1.7, 1.05], tgt: [0, 1.66, 0] },
  armour: { pos: [0.75, 1.45, 1.5], tgt: [0, 1.22, 0] },
  back: { pos: [-1.4, 1.5, -3.6], tgt: [0, 1.05, 0] },
  hips: { pos: [-0.9, 1.0, 1.3], tgt: [-0.1, 0.9, 0] },
};
function goView(name) {
  const v = VIEWS[name]; camera.position.set(...v.pos); controls.target.set(...v.tgt); controls.update(); fitPhone();
}
function fitPhone() {             // on narrow screens pull back so the whole figure fits
  const a = window.innerWidth / window.innerHeight;
  if (a < 0.8) { const d = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).add(d.multiplyScalar(Math.min(1.9, 0.8 / a))); }
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
  const pg = $('presets');
  for (const p of RIG.preset_order) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.preset = p; b.textContent = p;
    b.onclick = () => setPreset(p); pg.appendChild(b);
  }
  const mg = $('modules');
  for (const [gid, glabel] of RIG.groups) {
    const fs = document.createElement('fieldset'); const lg = document.createElement('legend'); lg.textContent = glabel; fs.appendChild(lg);
    for (const m of RIG.modules.filter((x) => x.group === gid)) {
      if (m.id === 'holster_belt') continue;                    // shown as the holster variant select
      const lab = document.createElement('label');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'cb-' + m.id;
      cb.onchange = () => {
        if (m.id === 'holster_drop' && !cb.checked) { delete loadout.holster_belt; }
        if (m.id === 'holster_drop' && cb.checked && $('holster-var').value === 'belt') { toggleModule('holster_belt', true); return; }
        toggleModule(m.id, cb.checked);
      };
      lab.appendChild(cb); lab.appendChild(document.createTextNode(m.label));
      if (m.variants.length > 1) {
        const sel = document.createElement('select'); sel.id = 'var-' + m.id; sel.setAttribute('aria-label', m.label + ' variant');
        for (const v of m.variants) { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); }
        sel.onchange = () => { loadout[m.id] = sel.value; if (sel.value === 'goggles' && !('helmet' in loadout)) toggleModule('helmet', true); st.preset = null; applyLoadout(); };
        sel.onclick = (e) => e.stopPropagation();
        lab.appendChild(sel);
      }
      if (m.id === 'holster_drop') {
        const sel = document.createElement('select'); sel.id = 'holster-var'; sel.setAttribute('aria-label', 'Holster variant');
        for (const [v, t] of [['drop', 'drop-leg'], ['belt', 'belt']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
        sel.onchange = () => toggleModule(sel.value === 'belt' ? 'holster_belt' : 'holster_drop', true);
        sel.onclick = (e) => e.stopPropagation();
        lab.appendChild(sel);
        cb.id = 'cb-holster'; cb.dataset.alias = '1';
      }
      const t = document.createElement('span'); t.className = 'tris'; t.textContent = (m.tris / 1000).toFixed(1) + 'k'; lab.appendChild(t);
      fs.appendChild(lab);
    }
    mg.appendChild(fs);
  }
  document.querySelectorAll('[data-light]').forEach((b) => { b.onclick = () => setLights(b.dataset.light); });
  document.querySelectorAll('[data-lod]').forEach((b) => { b.onclick = () => setLod(b.dataset.lod === 'auto' ? 'auto' : +b.dataset.lod); });
  $('spin').onclick = () => setSpin(!st.spin);
  $('kitToggle').onclick = () => { const k = $('kit'); const open = k.classList.toggle('closed') === false; $('kitToggle').setAttribute('aria-pressed', String(open)); };
  if (window.innerWidth <= 760) $('kit').classList.add('closed');
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  renderer.domElement.addEventListener('pointerdown', () => setSpin(false));
}
// the holster checkbox reflects either holster
const _apply = applyLoadout;
applyLoadout = function () {
  _apply();
  const cb = $('cb-holster'); if (cb) cb.checked = ('holster_drop' in loadout) || ('holster_belt' in loadout);
};

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
function tick(dt) {
  if (mixer) { if (st.holdT !== null) mixer.setTime(st.holdT); else mixer.update(dt); }
  if (st.spin) pivot.rotation.y += dt * 0.25;
  controls.update(); applyLod();
}
let looping = false;
function loop() { tick(Math.min(clock.getDelta(), 1 / 20)); renderer.render(scene, camera); }
function setLoop(on) { looping = on; renderer.setAnimationLoop(on ? loop : null); }

// ------------------------------------------------------------------ go
async function main() {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(b64ToBuf($('glb-data').textContent.trim()), '');
  model = gltf.scene; lift.add(model);
  tuneMaterials(model); collectNodes(model);
  mixer = new THREE.AnimationMixer(model);
  for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
  buildUI(); setLights('studio'); goView('full'); setLod('auto'); setPreset('Assault'); play('Idle', 0);
  $('loading').hidden = true;
  tick(0); renderer.render(scene, camera); setLoop(true);
  window.__model.ready = true;
}
function exportScenes() {
  // the loadout presets as scene descriptions: which nodes show at LOD0 for each preset, with clip list
  const keep = { ...loadout }, keepP = st.preset, out = [];
  for (const p of RIG.preset_order) {
    loadout = {}; for (const [k, v] of Object.entries(RIG.presets[p])) loadout[k] = v || '';
    const on = resolve(loadout);
    out.push({ name: p, nodes: nodes.filter((n) => n.lod === 0 && nodeVisible(n, on)).map((n) => n.name), clips: Object.keys(actions) });
  }
  loadout = keep; st.preset = keepP; applyLoadout();
  return out;
}
window.__model = {
  id: 'human-rig', ready: false, exportScenes,
  exportGLB: () => { const b64 = $('glb-data').textContent.trim(); return [{ file: 'human-rig-web.glb', base64: b64, bytes: Math.floor(b64.length * 3 / 4) }]; },
  debug: {
    tick, stop: () => setLoop(false), start: () => setLoop(true),
    renderOnce: () => { controls.update(); applyLod(true); renderer.render(scene, camera); },
    set: (clip, t) => { if (!actions[clip]) throw new Error('no clip ' + clip); play(clip, 0); st.holdT = t; mixer.setTime(t); },
    play, clips: () => Object.keys(actions), lod: (n) => setLod(n), lights: (n) => setLights(n), spin: (on) => setSpin(on),
    preset: setPreset, toggle: toggleModule, loadout: () => ({ ...loadout }), visible: () => [...visibleSet],
    modules: () => RIG.modules.map((m) => m.id), presets: () => RIG.preset_order,
    goView, camera, controls, scene, renderer, pivot, nodes,
    stats: () => ({ lod: lodShown, tris: st.tris, calls: st.calls, preset: st.preset }),
  },
};
main().catch((e) => { console.error(e); $('loading').textContent = 'Failed to load: ' + e.message; });
