// Vérifie la position de l'écusson POLICE (dos, hauteur de poitrine) sur chaque tenue de la Brigade
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(process.argv[2]); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  console.log(await p.evaluate(() => { const g = window.__game, T = window.__THREE; for (let i = 0; i < 10; i++) g.update(0.03); const out = {};
    for (const a of g.actors) { if (a.team !== 'ordre' || out[a.skin]) continue; let badge = null; a.ch.root.traverse((o) => { if (o.isMesh && o.material?.map && o.geometry.type === 'PlaneGeometry' && !badge) badge = o; });
      if (!badge) { out[a.skin] = 'aucun'; continue; } const wp = new T.Vector3(); badge.getWorldPosition(wp); const rel = wp.clone().sub(a.ch.root.position); const f = new T.Vector3(Math.sin(a.ch.root.rotation.y), 0, Math.cos(a.ch.root.rotation.y));
      const n = new T.Vector3(0, 0, 1).applyQuaternion(badge.getWorldQuaternion(new T.Quaternion()));
      out[a.skin] = `h=${rel.y.toFixed(2)} avant=${rel.dot(f).toFixed(2)} normale·avant=${n.dot(f).toFixed(2)}`; }
    return JSON.stringify(out, null, 1); })); await b.close(); })();
