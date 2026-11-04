// viewer_check.js <viewer.html> <outdir> : headless (swiftshader) load, console errors, stats, screenshots
const { chromium } = require('/home/user/gunmodls/tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [viewer, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.route('**/*', (r) => r.request().url().startsWith('file:') ? r.continue() : r.abort());   // offline
  const t0 = Date.now();
  await page.goto('file://' + path.resolve(viewer), { timeout: 180000 });
  await page.waitForFunction(() => window.__model && window.__model.ready, null, { timeout: 180000 });
  const loadMs = Date.now() - t0;
  const ev = (f, a) => page.evaluate(f, a);
  const stats = await ev(() => ({ clips: window.__model.debug.clips(), lods: window.__model.debug.stats() }));
  await ev(() => { const m = window.__model.debug; m.stop(); m.spin(false); m.pivot.rotation.y = 0; });
  const shots = [
    ['full_idle', 'full', 'Idle', 1.0, 'auto', 'studio'], ['face', 'face', 'Idle', 0.5, 0, 'studio'],
    ['armour', 'armour', 'Ready', 0.5, 0, 'studio'], ['back', 'back', 'Idle', 0.5, 0, 'studio'],
    ['ready', 'full', 'Ready', 0.5, 0, 'night'], ['walk', 'full', 'Walk', 0.3, 0, 'overcast'],
    ['crouch', 'full', 'CrouchIdle', 1.0, 0, 'studio'], ['look', 'full', 'LookAround', 2.2, 0, 'studio'],
    ['lod1', 'full', 'Ready', 0.5, 1, 'studio'], ['lod2', 'full', 'Ready', 0.5, 2, 'studio'],
  ];
  for (const [name, view, clip, t, lod, light] of shots) {
    await ev(([view, clip, t, lod, light]) => { const m = window.__model.debug; m.lights(light); m.lod(lod); m.goView(view, true); m.set(clip, t); m.tick(0); m.set(clip, t); m.renderOnce(); }, [view, clip, t, lod, light]);
    await page.screenshot({ path: path.join(out, name + '.png') });
  }
  await ev(() => { const m = window.__model.debug; m.lod(0); m.wire(true); m.goView('full', true); m.set('Idle', 0); m.renderOnce(); });
  await page.screenshot({ path: path.join(out, 'wire.png') });
  await ev(() => { const m = window.__model.debug; m.wire(false); });
  await ev(() => window.__model.preview());
  await page.screenshot({ path: path.join(out, 'preview_rt.png') });
  console.log(JSON.stringify({ loadMs, errors, stats }, null, 1));
  await browser.close();
})();
