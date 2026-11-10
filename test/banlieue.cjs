// Map banlieue : chargement, menu, partie, bots sur les zones (dont C sur la dalle), performances. node test/banlieue.cjs URL [secondes de jeu] [dossier captures]
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2], secs = +(process.argv[3] || 40), out = process.argv[4] || '/tmp';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); if (/monde prêt|cassables/.test(m.text())) console.log(m.text()); });
  const t0 = Date.now(); await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); console.log('chargé en', ((Date.now() - t0) / 1000).toFixed(1), 's, carte', await p.evaluate(() => window.__map));
  await p.waitForTimeout(1500); await p.screenshot({ path: out + '/menu.png', timeout: 180000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2000);
  // temps de jeu accéléré : on fait avancer la partie à pas fixes
  const res = await p.evaluate(async (secs) => { const g = window.__game; const t = performance.now(); let n = 0; for (let s = 0; s < secs; s += 0.05) { g.update(0.05); n++; if (n % 40 === 0) await new Promise((r) => setTimeout(r, 0)); }
    const zones = g.zoneState.map((z) => `${z.id}:${z.owner || '-'}`).join(' '); const near = g.zoneState.map((z) => `${z.id}=${g.actors.filter((a) => a.alive && g.inZone(a, z)).length}`).join(' ');
    const stuck = g.actors.filter((a) => a.alive && !a.isPlayer && a.pos.distanceTo(a._p0 || a.pos) < 0.01).length;
    return { ms: ((performance.now() - t) / n).toFixed(1), zones, near, score: JSON.stringify(g.score || g.scores || ''), alive: g.actors.filter((a) => a.alive).length, n: g.actors.length, onDalle: g.actors.filter((a) => a.alive && a.pos.y > 3.5 && a.pos.y < 5).length, low: g.actors.filter((a) => a.alive && a.pos.y < -1).length };
  }, secs);
  console.log(JSON.stringify(res));
  await p.waitForTimeout(800); await p.screenshot({ path: out + '/jeu.png', timeout: 180000 });
  console.log(await p.evaluate(async () => { const g = window.__game, r = g.renderer, sc = g.scene, cam = g.camera; let tr = 0; const N = 10; r.info.autoReset = false; let calls = 0, tris = 0;
    for (let i = 0; i < N; i++) { r.info.reset(); const t = performance.now(); (window.__post || r).render(sc, cam); r.getContext().finish(); tr += performance.now() - t; calls += r.info.render.calls; tris += r.info.render.triangles; }
    return JSON.stringify({ renderMs: (tr / N).toFixed(1), calls: calls / N, tris: Math.round(tris / N) }); }));
  console.log('erreurs', errs.length, errs.slice(0, 8));
  await b.close();
})();
