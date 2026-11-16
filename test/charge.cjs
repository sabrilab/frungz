// Charge de rendu : objets dessinés (appels) et triangles par image, comptés par le moteur (indépendant de la carte graphique).
// Moyenne sur 8 directions de regard depuis plusieurs points de la carte, ombres comprises ; puis la même chose sans les personnages.
// node test/charge.cjs URL [carte] [qualité] [joueurs par camp]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', map = 'paris', q = 'moyen', n = '50'] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${url}?map=${map}&q=${q}&noreal&n=${n}&profil=ch${Date.now() % 1e8}`); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const g = window.__game, R = g.renderer, info = R.info; const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 200; i++) g.update(0.05); // les camps se rejoignent
    g.paused = true; info.autoReset = false;
    const spots = [['centre C-D', 30, -5], ['zone A', -86, 0], ['zone F', 0, -80], ['zone G', 0, 87], ['tour (I)', 0, -200]];
    const sample = async () => { const out = {}; for (const [nom, x, z] of spots) { let calls = 0, tri = 0;
        for (let k = 0; k < 8; k++) { g.player.pos.set(x, g.world.groundY(x, z), z); g.player.yaw = g.cam.yaw = k * Math.PI / 4; g.cam.pitch = 0; g.cam.snap = true; g.paused = false; g.update(0.016); g.paused = true; info.reset(); await frame(); calls += info.render.calls; tri += info.render.triangles; }
        out[nom] = [Math.round(calls / 8), Math.round(tri / 8000)]; } return out; };
    const avec = await sample();
    for (const a of g.actors) a.ch.root.visible = false; g.update = () => {}; // sans les personnages : ce que coûte le décor seul
    const sans = await sample();
    return { avec, sans, acteurs: g.actors.length, geos: info.memory.geometries, tex: info.memory.textures };
  });
  console.log(`carte ${map} · qualité ${q} · ${r.acteurs} persos · ${r.geos} géométries`);
  console.log('point de vue            | objets dessinés | triangles (k) | décor seul : objets | triangles (k)');
  for (const k of Object.keys(r.avec)) console.log(`${k.padEnd(23)} | ${String(r.avec[k][0]).padStart(15)} | ${String(r.avec[k][1]).padStart(13)} | ${String(r.sans[k][0]).padStart(19)} | ${String(r.sans[k][1]).padStart(13)}`);
  const moy = (o, i) => Math.round(Object.values(o).reduce((s, v) => s + v[i], 0) / Object.keys(o).length);
  console.log(`MOYENNE                 | ${String(moy(r.avec, 0)).padStart(15)} | ${String(moy(r.avec, 1)).padStart(13)} | ${String(moy(r.sans, 0)).padStart(19)} | ${String(moy(r.sans, 1)).padStart(13)}`);
  await b.close();
})();
