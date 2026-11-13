// Carte de ce qui est praticable en voiture (cercle de rayon R libre, sol sous 0,4 m) : node test/routes-grille.cjs URL sortie.png [R]
const { chromium } = require('playwright');
(async () => { const [,, url, out, R = '1.0'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 900000 }); await p.evaluate(() => window.__start());
  const data = await p.evaluate((R) => { const g = window.__game, W = g.world, B = W.bounds, S = 0.5; g.paused = true;
    const nx = Math.ceil((B.x1 - B.x0) / S), nz = Math.ceil((B.z1 - B.z0) / S); const a = []; const V = g.player.pos.constructor;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = B.x0 + (i + 0.5) * S, z = B.z0 + (j + 0.5) * S; const y = W.groundY(x, z, 1);
      const q = new V(x, y, z); const hit = W.pushOut(q, +R, y + 0.2); const moved = Math.hypot(q.x - x, q.z - z) > 0.01;
      a.push(y < -1 ? 4 : moved ? (hit && hit.cassable ? 3 : 2) : y > 0.4 ? 1 : 0); }
    return { nx, nz, a: a.join('') }; }, R);
  require('fs').writeFileSync(out + '.json', JSON.stringify(data)); console.log(data.nx, data.nz); await b.close(); })();
