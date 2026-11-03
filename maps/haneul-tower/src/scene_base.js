const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07080b');
scene.fog = new THREE.Fog('#07080b', 9, 22);
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
{ const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: '#202020' })); fl.rotation.x = -Math.PI / 2; fl.position.y = -0.85; roomEnv.add(fl); }
scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
scene.environmentIntensity = 0.42;

const camera = new THREE.PerspectiveCamera(34, stage.clientWidth / stage.clientHeight, 0.05, 60);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const ao = new GTAOPass(scene, camera, 1, 1);
ao.updateGtaoMaterial({ radius: 0.12, distanceExponent: 1.5, thickness: 0.6, scale: 1.0, samples: 16 });
ao.blendIntensity = 0.8;
composer.addPass(ao);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(stage.clientWidth, stage.clientHeight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.minDistance = 0.3; controls.maxDistance = 13;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minAzimuthAngle = -1.35; controls.maxAzimuthAngle = 1.35;

// concrete bay: tiled wall panels with form-tie holes, and a poured floor
function concreteTexture(seamsX, seamsY, tone) {
  const c = canvas(1024, 1024), x = c.getContext('2d');
  x.fillStyle = tone; x.fillRect(0, 0, 1024, 1024);
  let s = 1234567;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 60; i++) {
    const gx = rnd() * 1024, gy = rnd() * 1024, g = x.createRadialGradient(gx, gy, 0, gx, gy, 80 + rnd() * 240);
    const v = rnd() < 0.5 ? 0 : 255; g.addColorStop(0, `rgba(${v},${v},${v},${0.035 + rnd() * 0.04})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
  }
  for (let i = 0; i < 26000; i++) { const v = rnd() < 0.5 ? 20 : 220; x.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.08})`; x.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 2, 1 + rnd() * 2); }
  x.lineWidth = 3;
  for (let i = 0; i <= seamsX; i++) { const p = (i / seamsX) * 1024; x.strokeStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 1024); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.moveTo(p + 3, 0); x.lineTo(p + 3, 1024); x.stroke(); }
  for (let i = 0; i <= seamsY; i++) { const p = (i / seamsY) * 1024; x.strokeStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.moveTo(0, p); x.lineTo(1024, p); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.moveTo(0, p + 3); x.lineTo(1024, p + 3); x.stroke(); }
  if (seamsX) for (let i = 0; i < seamsX; i++) for (let j = 0; j < seamsY; j++) for (const [u, v] of [[0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]]) {
    const cx = ((i + u) / seamsX) * 1024, cy = ((j + v) / seamsY) * 1024;
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.arc(cx, cy, 6, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.07)'; x.beginPath(); x.arc(cx + 1.5, cy + 2, 6, 0, Math.PI); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
