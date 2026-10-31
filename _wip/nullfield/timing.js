const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [viewer, W, H] = process.argv.slice(2);
const NM = path.join(process.env.B, 'node_modules');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
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
  const r = await page.evaluate(() => { const m = window.__model.debug; m.stop(); m.set('idle', 0.5);
    const gl = m.renderer.getContext(); const out = {};
    for (const k of ['full', 'feed', 'nobubble']) { const t0 = performance.now();
      if (k === 'nobubble') { m.scene.getObjectByName ; }
      m.renderOnce(); gl.finish(); out[k] = Math.round(performance.now() - t0); }
    return out; });
  console.log(W, H, JSON.stringify(r));
  await browser.close();
})();
