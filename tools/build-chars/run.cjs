// node run.cjs <dossier de sortie> [dossier des captures] : construit tous les persos de chars.json
// Servir le dossier parent de frungz/ sur le port 8140, avec les packs décompressés dans pack/src/{outfits,base,hair} (voir README.md)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'chars.json'), 'utf8')); const only = process.argv[4];
(async () => { const b = await chromium.launch(); const outDir = process.argv[2], shots = process.argv[3];
  for (const c of LIST) { if (only && c.name !== only) continue; const p = await b.newPage({ viewport: { width: 900, height: 900 } }); p.on('pageerror', (e) => console.log('[err]', c.name, e.message));
    const q = new URLSearchParams({ outfit: c.outfit, base: c.base, hair: (c.hair || []).join(','), ...(c.tex ? { tex: c.tex } : {}), ...(c.keep ? { keep: c.keep } : {}), ...(c.hairColor ? { hairColor: c.hairColor } : {}), ...(shots ? { shot: 1 } : {}) });
    await p.goto('http://localhost:8140/frungz/tools/build-chars/index.html?' + q); await p.waitForFunction('window.__done', null, { timeout: 180000 });
    const s = await p.evaluate(() => window.__out); fs.writeFileSync(path.join(outDir, c.name + '.glb'), Buffer.from(s, 'base64')); console.log(c.name, JSON.stringify(await p.evaluate(() => window.__info)), Math.round(s.length * 0.75 / 1024) + ' Ko');
    if (shots) await p.screenshot({ path: path.join(shots, c.name + '.png') }); await p.close(); }
  await b.close(); })();
