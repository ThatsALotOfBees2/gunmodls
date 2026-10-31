// Same as tools/render-preview.js (preview() at 1600x900, 250 ms, screenshot) but with a longer screenshot
// timeout, for a loaded machine where software WebGL screenshots take more than 30 s.
const path = require('path');
const { openViewer } = require('/home/user/gunmodls/tools/lib/open-viewer');
(async () => {
  const viewer = process.argv[2];
  const { browser, page } = await openViewer(viewer, { width: 1600, height: 900 });
  try {
    await page.evaluate(() => window.__model.preview());
    await page.waitForTimeout(250);
    const out = path.join(path.dirname(path.resolve(viewer)), 'preview.png');
    await page.screenshot({ path: out, timeout: 240000 });
    console.log('wrote', out);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
