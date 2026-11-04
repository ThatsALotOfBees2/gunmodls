#!/usr/bin/env node
// Unity copy of a map (maps/*/viewer.html). unity-export.js is built for props and characters (it merges meshes per
// node and adds LODs and boxes); a map needs every typed surface node kept on its own, so this tool asks the map's
// viewer for a Unity variant of its export instead: window.__model.exportGLB({ unity: true }).
// The Haneul Tower viewer then:
//   - keeps every typed node (HARD_, SOFT_, REINF_, HATCH_, GLASS_*, BARR_*, ...) separate, with its name and extras;
//   - keeps the COL_ box empties (position, rotation, scale = size) for the Unity script to turn into BoxColliders;
//   - keeps the city backdrop as ONE node (BACKDROP_city: one mesh, one baked material, always drawn as one draw call;
//     no culling tiles) next to the sky dome (BACKDROP_sky);
//   - bakes emissive strengths up to 1 into emissiveFactor (glTFast ignores KHR_materials_emissive_strength).
// The file goes into a unity/ folder next to the viewer (or --out dir), with the same name as the main .glb.
//
//   node tools/unity-export-map.js maps/haneul-tower/viewer.html [--out dir]
const fs = require('fs');
const path = require('path');
const { openViewer } = require('./lib/open-viewer');

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const outArg = opt('--out');
  const viewers = args.filter((a, i) => a.endsWith('.html') && args[i - 1] !== '--out');
  if (!viewers.length) {
    console.error('usage: node tools/unity-export-map.js <maps/name/viewer.html> [--out dir]');
    process.exit(1);
  }
  for (const viewer of viewers) {
    const { browser, page } = await openViewer(viewer);
    try {
      const files = await page.evaluate((o) => window.__model.exportGLB(o), { unity: true });
      const dir = outArg ? path.resolve(outArg) : path.join(path.dirname(path.resolve(viewer)), 'unity');
      fs.mkdirSync(dir, { recursive: true });
      for (const f of files) {
        const out = path.join(dir, f.file);
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
