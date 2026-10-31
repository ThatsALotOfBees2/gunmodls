const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [viewer, W, H, mode] = process.argv.slice(2);
const NM = path.join(process.env.B, 'node_modules');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.route('**/*', async (route) => {
    const u = route.request().url(); const m = u.match(/cdn\.jsdelivr\.net\/npm\/([^@]+)@[^/]+\/(.*)$/);
    if (m) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) });
    if (u.startsWith('file:')) return route.continue(); return route.abort();
  });
  const tmp = path.join(path.dirname(viewer), '_eval.html');
  fs.writeFileSync(tmp, '<!doctype html><html><head><meta charset="utf-8"></head><body>' + fs.readFileSync(viewer, 'utf8') + '</body></html>');
  await page.goto('file://' + tmp);
  await page.waitForFunction(() => window.__model && window.__model.ready, null, { timeout: 180000 });
  let t0 = Date.now();
  const r = await page.evaluate((mode) => { const m = window.__model.debug; m.stop();
    if (mode === 'nobubble') m.scene.traverse(o => { if (o.material && o.material.transmission) o.visible = false; });
    window.__model.preview(); const gl = m.renderer.getContext(); const out = [];
    for (let i = 0; i < 3; i++) { const t = performance.now(); m.renderOnce(); gl.finish(); out.push(Math.round(performance.now() - t)); }
    return out; }, mode);
  console.log('renders', r, 'eval ms', Date.now() - t0);
  t0 = Date.now();
  try { await page.screenshot({ path: path.join(path.dirname(viewer), 't', 'shot_' + mode + '.png'), timeout: 120000 }); console.log('screenshot ms', Date.now() - t0); } catch (e) { console.log('screenshot failed', Date.now() - t0); }
  await browser.close();
})();
