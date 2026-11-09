// Compare la grille de hauteur (rasterisée) à des lancers de rayons sur le sol : node test/height.cjs URL
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); p.on('console', (m) => /monde|err/i.test(m.text()) && console.log('[c]', m.text()));
  const t0 = Date.now(); await p.goto(process.argv[2]); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); console.log('chargé en', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.log(await p.evaluate(() => { const T = window.__THREE, w = window.__world, B = w.bounds, ray = new T.Raycaster(), d = new T.Vector3(0, -1, 0); ray.far = 40; let max = 0, bad = 0, n = 0;
    for (let k = 0; k < 3000; k++) { const i = Math.floor(Math.random() * w.hnx), j = Math.floor(Math.random() * w.hnz); const x = B.x0 + i * w.hS, z = B.z0 + j * w.hS; ray.set(new T.Vector3(x, 20, z), d); const h = ray.intersectObjects(window.__ground, false)[0]; let y = h ? h.point.y : 0;
      // ce que l'ancienne version ajoutait ensuite (terrasses, rampes) n'est pas comparé : on ne garde que les cases où le sol domine
      const e = Math.abs(w.H[j * w.hnx + i] - y); if (w.H[j * w.hnx + i] < y - 0.01 || (e > 0.05 && w.H[j * w.hnx + i] <= y + 0.01)) { bad++; } max = Math.max(max, w.H[j * w.hnx + i] < y ? y - w.H[j * w.hnx + i] : 0); n++; }
    return JSON.stringify({ n, bad, maxUnder: max.toFixed(3) }); })); await b.close(); })();
