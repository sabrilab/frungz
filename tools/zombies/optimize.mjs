import { createRequire } from 'module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, prune, resample, meshopt, weld } = require('@gltf-transform/functions');
const { MeshoptEncoder } = require('meshoptimizer');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
// node optimize.mjs in.glb out.glb [tex0.webp ...] : les textures PNG (avec alpha) sont remplacées, dans l'ordre, par les WebP fournis (EXT_texture_webp)
import fs from 'fs';
const { EXTTextureWebP } = require('@gltf-transform/extensions');
const [inp, out, ...webps] = process.argv.slice(2);
const doc = await io.read(inp);
const pngs = doc.getRoot().listTextures().filter(t => t.getMimeType() === 'image/png');
if (webps.length) {
  if (webps.length !== pngs.length) throw new Error(`webp ${webps.length} != png ${pngs.length}`);
  doc.createExtension(EXTTextureWebP).setRequired(true);
  pngs.forEach((t, i) => t.setImage(new Uint8Array(fs.readFileSync(webps[i]))).setMimeType('image/webp').setURI(''));
}
await doc.transform(dedup(), resample({ tolerance: 5e-4 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
