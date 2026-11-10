// node tools/build-chars/run-base.cjs <dossier de sortie> : construit Base_M.glb et Base_F.glb (mannequins des skins, voir base.html)
// Servir le dossier parent de frungz/ sur le port 8140, avec le pack « Universal Base Characters » dans pack/src/{base,tex,hair} (voir README.md)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const HAIR = 'Hair_Buzzed,Hair_BuzzedFemale,Hair_SimpleParted,Hair_Long,Hair_Buns,Hair_Beard';
const LIST = [{ name: 'Base_M', base: 'Superhero_Male_FullBody', tex: 'T_Superhero_Male_Ligh.png', ref: 'Paysan' }, { name: 'Base_F', base: 'Superhero_Female_FullBody', tex: 'T_Superhero_Female_Light_BaseColor.png', ref: 'Paysanne' }];
(async () => { const b = await chromium.launch(); const outDir = process.argv[2];
  for (const c of LIST) { const p = await b.newPage(); p.on('pageerror', (e) => console.log('[err]', c.name, e.message)); p.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
    await p.goto(`http://localhost:8140/frungz/tools/build-chars/base.html?` + new URLSearchParams({ base: c.base, tex: c.tex, hair: HAIR, ref: `/frungz/tools/build-chars/ref/${c.ref}.glb` })); await p.waitForFunction('window.__done', null, { timeout: 180000 });
    const s = await p.evaluate(() => window.__out); fs.writeFileSync(path.join(outDir, c.name + '.glb'), Buffer.from(s, 'base64'));
    const info = await p.evaluate(() => window.__info); fs.writeFileSync(path.join(outDir, c.name + '.info.json'), JSON.stringify(info));
    console.log(c.name, JSON.stringify(info.meshes), Math.round(s.length * 0.75 / 1024) + ' Ko', JSON.stringify({ box: info.box, hips: info.hips, head: info.head, handL: info.handL })); await p.close(); }
  await b.close(); })();
