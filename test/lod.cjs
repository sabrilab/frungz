// Niveaux de détail des personnages : triangles par niveau, bascule selon la distance, planche de comparaison.
// node test/lod.cjs URL [capture.png]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', shot] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 620 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/api\/|Failed to load resource|supabase\.co|WebSocket/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(url + '?map=salle&q=haut&noreal&n=5&profil=lod' + (Date.now() % 1e8)); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2500);
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  const r = await p.evaluate(() => { const g = window.__game, P = g.player; const bots = g.actors.filter((a) => a !== P && a.alive).slice(0, 4);
    // jeu figé, quatre persos côte à côte en gros plan : niveau 0 (complet) à gauche, niveau 3 à droite
    g.paused = true; document.getElementById('hud').style.display = 'none'; document.querySelectorAll('.tr-panel, #trn, [id^="salle"]').forEach((e) => (e.style.display = 'none'));
    for (const a of g.actors) a.ch.root.visible = false; const y = g.world.groundY(0, 0);
    const tris = []; bots.forEach((a, i) => { a.ch.root.visible = true; a.ch.model.visible = true; a.ch.root.position.set(-1.35 + i * 0.9, y, 3); a.ch.root.rotation.y = Math.PI + 0.35; g.setBodyLod(a, i); tris.push(a.ch.body.geometry.index.count / 3); });
    const c = g.camera; c.fov = 38; c.updateProjectionMatrix(); c.position.set(0, y + 1.15, 0.1); c.lookAt(0, y + 0.95, 3);
    return { tris, ms: 0, skins: bots.map((a) => a.skin) }; });
  console.log('triangles par niveau :', r.tris.join(' · '), `(calcul : ${r.ms} ms pour ${new Set(r.skins).size} tenue(s))`);
  ok(r.tris[0] > 30000 && r.tris[1] < r.tris[0] * 0.4 && r.tris[2] < r.tris[0] * 0.15 && r.tris[3] < r.tris[0] * 0.07, 'trois niveaux allégés calculés');
  await p.waitForTimeout(1500); if (shot) await p.screenshot({ path: shot });
  // bascule automatique selon la distance
  await p.reload(); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(2000);
  const k = await p.evaluate(() => { const g = window.__game, P = g.player, a = g.actors.find((x) => x !== P); const out = []; g.updateBot = () => {};
    for (const d of [3, 12, 30, 70]) { a.pos.set(P.pos.x + d, P.pos.y, P.pos.z); g.camera.position.copy(P.pos); g.updateLod(); out.push(a.lodK); } return out; });
  ok(JSON.stringify(k) === '[0,1,2,3]', 'bascule selon la distance : 3 m, 12 m, 30 m, 70 m → niveaux ' + k.join(', '));
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
