#!/usr/bin/env node
// Renders preview.png next to a viewer: default three-quarter view, no UI.
//
//   node tools/render-preview.js shotguns/m590a1/viewer.html [more/viewer.html ...]
const path = require('path');
const { openViewer } = require('./lib/open-viewer');

async function main() {
  const viewers = process.argv.slice(2);
  if (!viewers.length) {
    console.error('usage: node tools/render-preview.js <path/to/viewer.html> [...]');
    process.exit(1);
  }
  for (const viewer of viewers) {
    const { browser, page } = await openViewer(viewer, { width: 1600, height: 900 });
    try {
      await page.evaluate(() => window.__model.preview());
      await page.waitForTimeout(250);
      const out = path.join(path.dirname(path.resolve(viewer)), 'preview.png');
      await page.screenshot({ path: out });
      console.log(`wrote ${path.relative(process.cwd(), out)}`);
    } finally {
      await browser.close();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
