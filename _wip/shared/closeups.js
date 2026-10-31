// Render a list of close-up views (UI hidden) from a JSON file:
// [{ "name": "...", "pos": [x,y,z], "target": [x,y,z], "setup": "js using m", "fov": 28 }]
// usage: node closeups.js <viewer.html> <outdir> <views.json>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [viewer, outdir, viewsFile] = process.argv.slice(2);
const VIEWS = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
const NM = path.join(__dirname, 'node_modules');
(async () => {
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1000), height: +(process.env.H || 700) }, deviceScaleFactor: 1, colorScheme: 'dark' });
  page.on('pageerror', e => console.log('pageerror', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    const m = u.match(/cdn\.jsdelivr\.net\/npm\/([^@]+)@[^/]+\/(.*)$/);
    if (m) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) });
    if (u.startsWith('file:')) return route.continue();
    return route.abort();
  });
  const html = fs.readFileSync(viewer, 'utf8');
  const tmp = path.join(path.dirname(viewer), '_closeup.html');
  fs.writeFileSync(tmp, '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + html + '</body></html>');
  await page.goto('file://' + tmp);
  await page.waitForFunction(() => window.__model && window.__model.ready, null, { timeout: 180000 });
  await page.evaluate(() => { const m = window.__model.debug; m.stop(); m.setSpin(false); document.querySelectorAll('.plate,.bar,.hint,.toast').forEach(e => e.hidden = true); });
  for (const v of VIEWS) {
    await page.evaluate((v) => {
      const m = window.__model.debug;
      m.pivot.rotation.y = 0;
      const fov0 = m.camera.fov;
      if (v.fov) { m.camera.fov = v.fov; m.camera.updateProjectionMatrix(); }
      if (v.setup) eval(v.setup);
      m.camera.position.set(...v.pos); m.controls.target.set(...v.target); m.renderOnce();
      if (v.fov) { m.camera.fov = fov0; m.camera.updateProjectionMatrix(); }
    }, v);
    await page.waitForTimeout(120);
    const out = path.join(outdir, `${v.name}.png`);
    await page.screenshot({ path: out });
    console.log(out);
  }
  await browser.close();
})();
