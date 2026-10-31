// Dump N1CK texture canvases as PNGs: node dumptex.js <page.html> <outdir>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [viewer, outdir] = process.argv.slice(2);
const NM = path.join(__dirname, 'node_modules');
(async () => {
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.route('**/*', async (route) => {
    const u = route.request().url(), m = u.match(/cdn\.jsdelivr\.net\/npm\/([^@]+)@[^/]+\/(.*)$/);
    if (m) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) });
    if (u.startsWith('file:')) return route.continue();
    return route.abort();
  });
  const tmp = path.join(path.dirname(viewer), '_dump.html');
  fs.writeFileSync(tmp, '<!doctype html><html><head><meta charset="utf-8"></head><body>' + fs.readFileSync(viewer, 'utf8') + '</body></html>');
  await page.goto('file://' + tmp);
  await page.waitForFunction(() => window.__model && window.__model.ready, null, { timeout: 180000 });
  const out = await page.evaluate(() => {
    const m = window.__model.debug; m.stop(); const T = m.TX, r = {};
    const put = (k, c) => { r[k] = c.toDataURL('image/png').split(',')[1]; };
    for (const k of ['iron', 'wear', 'inner', 'gunmetal', 'stainless', 'weld', 'braid', 'rubber']) for (const c of ['map', 'normal', 'orm']) put(k + '_' + c, T[k][c].image);
    put('atlas', T.faceAtlasCanvas); put('nick', T.nickCanvas); put('glowRadial', T.glowRadial.image); put('glowBand', T.glowBand.image);
    return r;
  });
  for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(outdir, k + '.png'), Buffer.from(v, 'base64'));
  console.log(Object.keys(out).join(' '));
  await browser.close();
})();
