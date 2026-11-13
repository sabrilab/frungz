// La Salle (entraînement) : chargement, partie, mur d'armes, bots à la demande, cibles, parcours. node test/salle.cjs URL [dossier captures]
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:8124/?map=salle', out = process.argv[3] || '/tmp';
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  const t0 = Date.now(); await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); console.log('chargé en', ((Date.now() - t0) / 1000).toFixed(1), 's, carte', await p.evaluate(() => window.__map));
  await p.waitForTimeout(800); await p.screenshot({ path: out + '/salle-menu.png', timeout: 180000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(1000);
  const step = (s) => p.evaluate(async (s) => { const g = window.__game; for (let t = 0; t < s; t += 0.05) g.update(0.05); }, s);
  await step(1);
  const r1 = await p.evaluate(() => { const g = window.__game, T = g.tr; return { actors: g.actors.length, targets: T.targets.length, slots: T.slots.length, onWall: T.slots.filter((s) => s.mesh).length, cabs: T.cabs.length, player: g.player.pos.toArray().map((v) => +v.toFixed(2)), weapon: g.weapon(g.player).id }; });
  console.log(JSON.stringify(r1));
  // prend chaque arme du mur et tire une balle
  const r2 = await p.evaluate(() => { const g = window.__game, T = g.tr, out = []; for (const s of T.slots) { try { T.take(s.id); g.update(0.05); out.push(g.weapon(g.player).id === s.id ? 1 : s.id); } catch (e) { out.push(s.id + ':' + e.message); } } return out.filter((x) => x !== 1); });
  console.log('armes non prises', JSON.stringify(r2));
  // tir sur la cible à 7 m (poste 1)
  const r3 = await p.evaluate(() => { const g = window.__game, T = g.tr, a = g.player; T.take('rifle'); const t = T.targets[0]; a.pos.set(0.5, 0, t.pos.z); for (let i = 0; i < 40; i++) { const o = a.pos.clone(); o.y += 1.5; const d = t.pos.clone(); d.y += 1.3; d.sub(o).normalize(); g.fire(a, o, d); a.fireT = 0; g.update(0.05); } return { hits: T.hits, shots: T.shots, last: T.last && Math.round(T.last.dmg), ttk: T.ttk, targetAlive: t.alive }; });
  console.log('stand', JSON.stringify(r3));
  // bots : vague en riposte, mode cible, effacer
  const r4 = await p.evaluate(async () => { const g = window.__game, T = g.tr; T.action('vague'); for (let i = 0; i < 200; i++) { g.update(0.05); if (i % 40 === 0) await new Promise((r) => setTimeout(r, 0)); } const n = T.bots().length, moved = T.bots().filter((b) => b.pos.x < 26).length; T.action('mode'); const m = T.mode; T.action('effacer'); g.update(0.05); return { n, moved, mode: m, after: T.bots().length, alive: g.actors.filter((a) => a.alive).length, playerAlive: g.player.alive }; });
  console.log('bots', JSON.stringify(r4));
  // parcours : on fait passer le joueur par le départ puis l'arrivée
  const r5 = await p.evaluate(() => { const g = window.__game, T = g.tr, a = g.player; a.pos.set(-38.2, 0, 6.5); g.update(0.05); a.pos.set(-37, 0, 6.5); g.update(0.05); for (let i = 0; i < 20; i++) g.update(0.05); a.pos.set(-37, 0, 18); g.update(0.05); a.pos.set(-38.2, 0, 18); g.update(0.05); return T.course; });
  console.log('parcours', JSON.stringify(r5));
  await step(2);
  await p.evaluate(() => { const g = window.__game; g.tr.action('vague'); g.player.pos.set(-33, 0, -7); g.cam.yaw = 2.2; g.cam.snap = true; for (let i = 0; i < 30; i++) g.update(0.05); });
  await p.waitForTimeout(600); await p.screenshot({ path: out + '/salle-depart.png', timeout: 180000 });
  const views = [['mur', -20, -19.5, Math.PI, 0.05], ['stand', -1, -15, Math.PI / 2, 0], ['arene', 6, 10, Math.PI / 2, -0.05], ['parcours', -39, 6.5, Math.PI / 2, -0.05], ['bornes', -36, -9.5, -Math.PI / 2, 0]];
  for (const [n, x, z, yaw, pitch] of views) { await p.evaluate(([x, z, yaw, pitch]) => { const g = window.__game; g.player.pos.set(x, g.world.groundY(x, z, 1), z); g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.snap = true; for (let i = 0; i < 12; i++) g.update(0.05); }, [x, z, yaw, pitch]); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/salle-${n}.png`, timeout: 180000 }); }
  console.log(await p.evaluate(() => { const g = window.__game, r = g.renderer; r.info.autoReset = false; r.info.reset(); (window.__post || r).render(g.scene, g.camera); return JSON.stringify({ calls: r.info.render.calls, tris: r.info.render.triangles }); }));
  console.log('erreurs', errs.length, errs.slice(0, 12));
  await b.close();
})();
