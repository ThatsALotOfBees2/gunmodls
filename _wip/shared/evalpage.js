// Load a viewer page and print the JSON result of an expression evaluated with m = window.__model.debug.
// usage: node evalpage.js <viewer.html> '<js expression or statements returning a value>'
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [viewer, code] = process.argv.slice(2);
const NM = path.join(__dirname, 'node_modules');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    const m = u.match(/cdn\.jsdelivr\.net\/npm\/([^@]+)@[^/]+\/(.*)$/);
    if (m) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) });
    if (u.startsWith('file:')) return route.continue();
    return route.abort();
  });
  const tmp = path.join(path.dirname(viewer), '_eval.html');
  fs.writeFileSync(tmp, '<!doctype html><html><head><meta charset="utf-8"></head><body>' + fs.readFileSync(viewer, 'utf8') + '</body></html>');
  await page.goto('file://' + tmp);
  await page.waitForFunction(() => window.__model && window.__model.ready, null, { timeout: 180000 });
  const out = await page.evaluate((code) => { const m = window.__model.debug; m.stop(); return (new Function('m', code))(m); }, code);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
