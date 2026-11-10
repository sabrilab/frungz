// Répartition des appels de dessin par famille (map, persos, voitures, effets…) selon l'orientation de la caméra
const { chromium } = require('playwright');
(async () => { const [,, url] = process.argv; const b = await chromium.launch({ args: ['--use-gl=angle'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(1500);
  console.log(JSON.stringify(await p.evaluate(async () => {
    const g = window.__game, R = g.renderer, sc = g.scene, cam = g.camera, T = window.__THREE; const out = [];
    const fam = (o) => { let x = o; while (x.parent && x.parent !== sc) { if (x === g.mapRoot) return 'map'; if (g.actors.some((a) => a.ch.root === x)) return 'persos'; if (g.cars.some((c) => c.obj === x)) return 'voitures'; x = x.parent; } return x === g.mapRoot ? 'map' : x === g.root ? 'jeu' : (x.name || x.type); };
    for (let k = 0; k < 8; k++) { g.cam.yaw = k * Math.PI / 4; g.update(0.033);
      cam.updateMatrixWorld(); const F = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const c = {}; const mats = {}; sc.traverseVisible((o) => { if (!(o.isMesh || o.isSprite || o.isPoints)) return; if (o.frustumCulled && !F.intersectsObject(o)) return; const f = fam(o); const n = Array.isArray(o.material) ? o.material.length : 1; c[f] = (c[f] || 0) + n; });
      R.info.reset(); R.render(sc, cam); out.push({ yaw: k * 45, calls: R.info.render.calls, ...c }); }
    let mm = 0, mapMats = new Set(); g.mapRoot.traverse((o) => { if (o.isMesh) { mm++; mapMats.add(o.material); } });
    return { out, mapMeshes: mm, mapMats: mapMats.size }; }))); await b.close(); })();
