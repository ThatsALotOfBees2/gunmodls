// pack_web_rig.mjs <in.glb> <out.glb>: the viewer GLB (fixB, fits a 16 MB page as base64):
//   redundant animation keys removed (resample, lossless within 1e-4), TANGENT dropped (three.js derives the normal-map
//   frame from screen-space derivatives), textures to WebP (normal maps 1K; gear albedo / ORM 512 except the webbing
//   trim sheet; skin / hair / eyes 1K), meshopt compression level high (quantised + filtered), node / mesh names kept.
// Run from $H (node_modules): node rig/build/pack_web_rig.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [inp, out] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) if (p.getAttribute('TANGENT')) p.setAttribute('TANGENT', null);
const webp = (o) => textureCompress({ encoder: sharp, targetFormat: 'webp', ...o });
await doc.transform(
  dedup(), prune({ keepLeaves: true }), resample({ tolerance: 1e-4 }),
  webp({ quality: 82, resize: [1024, 1024], slots: /^normalTexture$/ }),
  webp({ quality: 85, resize: [512, 512], pattern: /^(?!skin|hair|eye|webbing)/, slots: /^(?!normalTexture$)/ }),
  webp({ quality: 85, resize: [1024, 1024] }),
  prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(out, doc);
