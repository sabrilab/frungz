// Carte Frungz Plaza : chargement, partie, étages praticables (sol, étage, toit), captures depuis plusieurs points.
// node test/centre.cjs URL [dossier de captures]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', dir] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/api\/|Failed to load resource|supabase\.co|WebSocket/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(url + '?map=centre&q=bas&noreal&profil=cc' + (Date.now() % 1e8)); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  await p.evaluate(() => window.__start()); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => { const g = window.__game, W = g.world; return { n: g.actors.length, zones: g.zoneState.map((z) => z.id).join(''), shops: g.shops.length,
    sol: W.groundY(-30, 20, 3), galerie: W.groundY(-20, -42, 3), etage: W.groundY(-60, -55, 7), passerelle: W.groundY(50, 18, 7), toit: W.groundY(0, -50, 12), terrasse: W.groundY(-40, -18, 7) }; });
  console.log(JSON.stringify(r));
  ok(r.n <= 40, `20 contre 20 au plus (${r.n} persos)`); ok(r.zones === 'ABC', 'trois zones A B C'); ok(r.shops >= 10, `${r.shops} boutiques`);
  ok(Math.abs(r.sol) < 0.2 && Math.abs(r.galerie - 0.15) < 0.2, 'sol du parking et de la galerie'); ok(Math.abs(r.etage - 5) < 0.2 && Math.abs(r.passerelle - 5) < 0.2 && Math.abs(r.terrasse - 5) < 0.2, 'étage, passerelle et terrasse à 5 m'); ok(Math.abs(r.toit - 10) < 0.2, 'toit à 10 m');
  const views = [['parking', -50, 0, 30, 1.2], ['galerie', -60, 0.15, -42, Math.PI / 2], ['atrium', 40, 5, -50, 2.3], ['passerelle', 50, 5, 30, Math.PI], ['toit', -30, 10, -40, 2.6], ['vue-ensemble', -95, 35, 80, 2.4]];
  for (const [nom, x, y, z, yaw] of views) { await p.evaluate(([x, y, z, yaw, nom]) => { const g = window.__game, P = g.player; P.pos.set(x, y, z); P.vel.set(0, 0, 0); P.hp = 1e9; P.spawnProt = 1e9; g.cam.yaw = P.yaw = yaw; g.cam.pitch = nom === 'vue-ensemble' ? -0.45 : -0.05; g.cam.snap = true; if (nom === 'vue-ensemble') { g.cam.fps = false; } }, [x, y, z, yaw, nom]);
    await p.waitForTimeout(1200); if (nom === 'vue-ensemble') await p.evaluate(() => { const c = window.__game.camera; window.__game.paused = true; c.position.set(-110, 70, 95); c.lookAt(0, 0, -10); }); if (nom === 'vue-ensemble') await p.waitForTimeout(600);
    if (dir) await p.screenshot({ path: `${dir}/centre-${nom}.png`, timeout: 90000 }); await p.evaluate(() => { window.__game.paused = false; }); }
  // partie accélérée : les bots se déplacent sans tomber sous la carte
  const s = await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 1200; i++) g.update(0.05); const low = g.actors.filter((a) => a.alive && a.pos.y < -1).length; const up = g.actors.filter((a) => a.alive && a.pos.y > 4).length; return { low, up, score: g.score, t: Math.round(g.time) }; });
  console.log(JSON.stringify(s)); ok(s.low === 0, 'aucun perso sous la carte après 60 s de partie'); ok(s.score.ordre + s.score.civils > 0, 'les zones sont prises (score qui monte)');
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
