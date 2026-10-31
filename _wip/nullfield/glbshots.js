// Renders an exported .glb with a plain GLTFLoader at clip times: node glbshots.js <file.glb> <out.png> '[["clip",t],...]'
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const NM = '/tmp/claude-0/-home-user-Crystalix-party/54ae899d-ab9c-5ac8-991a-a7fa61aa138b/scratchpad/build/node_modules';
const [glb, out, list] = process.argv.slice(2);
const FR = JSON.parse(list);
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 400 * Math.min(FR.length, 4), height: 340 * Math.ceil(FR.length / 4) } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  page.on('console', m => console.log('console', m.text().slice(0, 300)));
  await page.route('**/*', async (route) => {
    const u = route.request().url(); const m = u.match(/cdn\.jsdelivr\.net\/npm\/([^@]+)@[^/]+\/(.*)$/);
    if (m) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) });
    if (u.startsWith('file:') || u.startsWith('about:') || u.startsWith('data:')) return route.continue(); return route.abort();
  });
  const html = `<!doctype html><html><body style="margin:0;background:#111"><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
window.go = async (b64, FR) => {
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  const g = await new Promise((ok, no) => new GLTFLoader().parse(buf, '', ok, no));
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(innerWidth, innerHeight); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color('#2a2b30'); sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.8;
  const d = new THREE.DirectionalLight('#fff', 2); d.position.set(1, 2, 1.5); sc.add(d);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: '#555' })); fl.rotation.x = -Math.PI / 2; sc.add(fl);
  sc.add(g.scene); const mixer = new THREE.AnimationMixer(g.scene);
  const cam = new THREE.PerspectiveCamera(30, 400 / 340, 0.01, 10); cam.position.set(0.3, 0.2, 0.4); cam.lookAt(0, 0.05, 0);
  r.setScissorTest(true);
  FR.forEach(([clip, t], i) => {
    mixer.stopAllAction(); g.scene.traverse(o => { if (o.userData.__p) { o.position.copy(o.userData.__p); o.quaternion.copy(o.userData.__q); o.scale.copy(o.userData.__s); } else { o.userData.__p = o.position.clone(); o.userData.__q = o.quaternion.clone(); o.userData.__s = o.scale.clone(); } });
    if (clip) { const a = mixer.clipAction(g.animations.find(c => c.name === clip)); a.play(); a.time = t; mixer.update(0); }
    const x = (i % 4) * 400, y = innerHeight - 340 - Math.floor(i / 4) * 340;
    r.setViewport(x, y, 400, 340); r.setScissor(x, y, 400, 340); r.render(sc, cam);
  });
  return g.animations.map(a => a.name);
};
window.ready = true;
</script></body></html>`;
  const tmp = path.join(path.dirname(out), '_glb.html'); fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp); await page.waitForFunction(() => window.ready && window.go);
  console.log(await page.evaluate(([b, f]) => window.go(b, f), [fs.readFileSync(glb).toString('base64'), FR]));
  await page.screenshot({ path: out, timeout: 300000 }); console.log(out); await browser.close();
})();
