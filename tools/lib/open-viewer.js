// Opens a model viewer page in headless Chromium and waits until the model is built.
// The viewers import three.js and friends from cdn.jsdelivr.net; when the same pinned versions
// are installed in tools/node_modules they are served from there instead, so exports work offline
// and always match what the viewer runs.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const NODE_MODULES = path.join(__dirname, '..', 'node_modules');
const CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.*)$/;

function localCopy(url) {
  const m = url.match(CDN);
  if (!m) return null;
  const [, name, version, file] = m;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(NODE_MODULES, name, 'package.json'), 'utf8'));
    if (pkg.version !== version) return null;
  } catch {
    return null;
  }
  const local = path.join(NODE_MODULES, name, file);
  return fs.existsSync(local) ? local : null;
}

async function openViewer(viewerPath, { width = 1600, height = 900, colorScheme = 'dark' } = {}) {
  const file = path.resolve(viewerPath);
  if (!fs.existsSync(file)) throw new Error(`No viewer at ${file}`);
  const browser = await chromium.launch({
    // software WebGL, so this also runs on machines and CI runners without a GPU
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.route('https://cdn.jsdelivr.net/npm/**', (route) => {
    const local = localCopy(route.request().url());
    if (local) {
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: fs.readFileSync(local),
      });
    }
    return route.continue();
  });
  await page.goto('file://' + file);
  await page.waitForFunction(() => window.__model && window.__model.ready, null, { timeout: 180000 });
  return { browser, page };
}

module.exports = { openViewer, localCopy };
