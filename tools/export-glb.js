#!/usr/bin/env node
// Builds a model in its viewer and writes the .glb files next to the viewer.
//
//   node tools/export-glb.js shotguns/m590a1/viewer.html [more/viewer.html ...]
//
// Each viewer exposes window.__model.exportGLB(), which returns the files to write.
const fs = require('fs');
const path = require('path');
const { openViewer } = require('./lib/open-viewer');

async function main() {
  const viewers = process.argv.slice(2);
  if (!viewers.length) {
    console.error('usage: node tools/export-glb.js <path/to/viewer.html> [...]');
    process.exit(1);
  }
  for (const viewer of viewers) {
    const { browser, page } = await openViewer(viewer);
    try {
      const files = await page.evaluate(() => window.__model.exportGLB());
      for (const f of files) {
        const out = path.join(path.dirname(path.resolve(viewer)), f.file);
        fs.writeFileSync(out, Buffer.from(f.base64, 'base64'));
        console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(f.bytes / 1024)} KB)`);
      }
    } finally {
      await browser.close();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
