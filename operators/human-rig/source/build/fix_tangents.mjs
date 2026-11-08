// fix_tangents.mjs <in.glb> [out.glb]: replace degenerate (zero / non-unit) TANGENT vectors with a unit tangent
// perpendicular to the vertex normal (MikkTSpace leaves zeros on vertices whose UV triangles cancel out).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [inp, out = inp] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
let fixed = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const t = prim.getAttribute('TANGENT'), n = prim.getAttribute('NORMAL');
  if (!t || !n) continue;
  const a = t.getArray(), na = n.getArray();
  for (let i = 0; i < t.getCount(); i++) {
    const x = a[i * 4], y = a[i * 4 + 1], z = a[i * 4 + 2], L = Math.hypot(x, y, z);
    if (Math.abs(L - 1) < 5e-4) continue;
    if (L > 1e-6) { a[i * 4] = x / L; a[i * 4 + 1] = y / L; a[i * 4 + 2] = z / L; fixed++; continue; }
    const nx = na[i * 3], ny = na[i * 3 + 1], nz = na[i * 3 + 2];
    let ux = 1, uy = 0, uz = 0; if (Math.abs(nx) > 0.9) { ux = 0; uy = 1; }
    let tx = uy * nz - uz * ny, ty = uz * nx - ux * nz, tz = ux * ny - uy * nx; const l2 = Math.hypot(tx, ty, tz) || 1;
    // t = u x n, then make it perpendicular: (u x n) is already perpendicular to n
    a[i * 4] = tx / l2; a[i * 4 + 1] = ty / l2; a[i * 4 + 2] = tz / l2; a[i * 4 + 3] = 1; fixed++;
  }
  t.setArray(a);
}
await io.write(out, doc);
console.log('fix_tangents', inp.split('/').pop(), 'fixed', fixed);
