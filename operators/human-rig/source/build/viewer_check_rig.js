// viewer_check_rig.js <viewer.html> <outdir>: headless smoke test at desktop and phone width (swiftshader).
// Toggles every module and preset, plays every clip, collects page errors, takes screenshots.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/home/user/gunmodls/tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const [viewer, out] = process.argv.slice(2);
const H = path.join(__dirname, '..', '..');
fs.mkdirSync(out, { recursive: true });
async function run(browser, vp, tag) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('file:') || u.startsWith('data:')) return r.continue();
    const m = /cdn\.jsdelivr\.net\/npm\/(three@[^/]+|three)\/(.*)$/.exec(u);
    if (m) return r.fulfill({ path: path.join(H, 'node_modules/three', m[2]) });
    return r.abort();
  });
  const t0 = Date.now();
  await page.goto('file://' + path.resolve(viewer), { timeout: 240000 });
  await page.waitForFunction(() => window.__model && window.__model.ready, null, { timeout: 240000 });
  const loadMs = Date.now() - t0;
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const m = window.__model.debug; m.stop(); m.spin(false); m.pivot.rotation.y = 0; });
  const res = { tag, loadMs };
  res.clips = await ev(() => window.__model.debug.clips());
  // every module on/off from Assault, every preset, every clip
  res.toggles = await ev(() => {
    const d = window.__model.debug, out = {};
    for (const id of d.modules()) {
      d.preset('Assault'); d.toggle(id, true); const a = d.visible().length; d.renderOnce();
      d.toggle(id, false); const b = d.visible().length; d.renderOnce(); out[id] = [a, b];
    }
    return out;
  });
  res.presets = await ev(() => { const d = window.__model.debug, o = {}; for (const p of d.presets()) { d.preset(p); d.lod(0); d.renderOnce(); o[p] = d.stats(); } return o; });
  res.scenes = await ev(() => window.__model.exportScenes().map((s) => [s.name, s.nodes.length]));
  res.exportGLB = await ev(() => window.__model.exportGLB().map((f) => [f.file, f.bytes]));
  const shots = tag === 'desktop'
    ? [['assault_idle', 'Assault', 'Idle', 1.0, 0, 'studio', 'full'], ['full_ready', 'Full', 'Ready', 0.5, 0, 'studio', 'full'],
       ['light_walk', 'Light', 'Walk', 0.3, 0, 'overcast', 'full'], ['base_crouch', 'Base', 'CrouchIdle', 1.0, 0, 'studio', 'full'],
       ['body_idle', 'Body', 'Idle', 1.0, 0, 'studio', 'full'], ['assault_draw', 'Assault', 'Holster', 2.2, 0, 'studio', 'armour'],
       ['assault_reload', 'Assault', 'Reload', 1.6, 0, 'night', 'armour'], ['assault_look', 'Assault', 'LookAround', 2.2, 0, 'studio', 'full'],
       ['assault_face', 'Assault', 'Idle', 0.5, 0, 'studio', 'face'], ['assault_back', 'Assault', 'Idle', 0.5, 0, 'studio', 'back'],
       ['assault_lod1', 'Assault', 'Ready', 0.5, 1, 'studio', 'full'], ['assault_lod2', 'Assault', 'Ready', 0.5, 2, 'studio', 'full']]
    : [['phone_assault', 'Assault', 'Idle', 1.0, 'auto', 'studio', 'full'], ['phone_full_draw', 'Full', 'Holster', 2.2, 0, 'studio', 'full']];
  for (const [name, preset, clip, t, lod, light, view] of shots) {
    await ev(([preset, clip, t, lod, light, view]) => { const m = window.__model.debug; m.preset(preset); m.lights(light); m.goView(view); m.lod(lod); m.set(clip, t); m.tick(0); m.set(clip, t); m.renderOnce(); }, [preset, clip, t, lod, light, view]);
    await page.screenshot({ path: path.join(out, `${tag}_${name}.png`), timeout: 300000 }); console.error('shot', tag, name);
  }
  if (tag === 'phone') {   // open the kit sheet and screenshot it
    await page.click('#kitToggle'); await ev(() => window.__model.debug.renderOnce());
    await page.screenshot({ path: path.join(out, 'phone_kit_open.png'), timeout: 300000 });
    res.horizontalOverflow = await ev(() => document.documentElement.scrollWidth > window.innerWidth);
  }
  // play every clip for real for a few frames
  for (const c of res.clips) await ev((c) => { const m = window.__model.debug; m.play(c, 0); for (let i = 0; i < 10; i++) m.tick(1 / 30); m.renderOnce(); }, c);
  res.errors = errors;
  await page.close();
  return res;
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const r1 = await run(browser, { width: 1280, height: 860 }, 'desktop');
  const r2 = await run(browser, { width: 390, height: 844 }, 'phone');
  console.log(JSON.stringify([r1, r2], null, 1));
  fs.writeFileSync(path.join(out, 'viewer_check.json'), JSON.stringify([r1, r2], null, 1));
  await browser.close();
})();
