// node verify.cjs planche.png /zombies '[["z_idle",0.3],["z_walk",0.25]]' rodeur policier ...
// dir : chemin servi (ex. /frungz/public/assets/zombies) ou /__file/<chemin absolu>
const fs = require('fs'); const run = require('./drv.cjs');
(async () => {
  const [out, dir, colsJ, ...ids] = process.argv.slice(2);
  const files = ids.map(i => `${dir}/${i}.glb`);
  const cols = JSON.parse(colsJ || '[]');
  const r = await run('verify.js', { files, cols, cell: [220, 300] });
  fs.writeFileSync(out, Buffer.from(r.png.split(',')[1], 'base64'));
  for (const [k, v] of Object.entries(r.report)) { console.log('==', k, JSON.stringify({ ud: v.sceneUserData, issues: v.issues, restBox: v.restBox, meshes: v.meshes, nb: v.bones.length, b: v.bones.slice(0, 8), clips: v.clips })); console.log(JSON.stringify(v.clipChecks)); }
})();
