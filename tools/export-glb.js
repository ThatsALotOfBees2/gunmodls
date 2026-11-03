#!/usr/bin/env node
// Builds a model in its viewer and writes the .glb files next to the viewer.
//
//   node tools/export-glb.js shotguns/m590a1/viewer.html [more/viewer.html ...] [--out dir]
//
// Each viewer exposes window.__model.exportGLB(), which returns the files to write. --out writes them into
// that folder (relative to the current directory) instead of next to the viewer; folders are created.
// A viewer that sets window.__model.exportIds (a list of ids) is exported one id at a time: exportGLB([id]).
const fs = require('fs');
const path = require('path');
const { openViewer } = require('./lib/open-viewer');

async function main() {
  const args = process.argv.slice(2), oi = args.indexOf('--out'), outDir = oi >= 0 ? args[oi + 1] : null;
  const viewers = args.filter((a, i) => a !== '--out' && (oi < 0 || i !== oi + 1));
  if (!viewers.length) {
    console.error('usage: node tools/export-glb.js <path/to/viewer.html> [...]');
    process.exit(1);
  }
  for (const viewer of viewers) {
    const { browser, page } = await openViewer(viewer);
    try {
      // a viewer with many files lists them in window.__model.exportIds; they are then fetched one at a time
      const ids = await page.evaluate(() => window.__model.exportIds || null);
      const batches = ids ? ids.map((id) => [id]) : [null];
      for (const batch of batches) {
        const files = await page.evaluate((b) => window.__model.exportGLB(b || undefined), batch);
        for (const f of files) {
          const out = path.join(outDir ? path.resolve(outDir) : path.dirname(path.resolve(viewer)), f.file);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, Buffer.from(f.base64, 'base64'));
          console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(f.bytes / 1024)} KB)`);
        }
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
