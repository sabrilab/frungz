// Profil de rendu : appels de dessin, triangles, temps CPU de la logique et du rendu. node test/perf.cjs URL
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(process.argv[2]); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  await p.waitForTimeout(3000);
  console.log(await p.evaluate(async () => { const g = window.__game, r = g.renderer, sc = g.scene, cam = g.camera;
    for (let i = 0; i < 40; i++) g.update(0.033);
    let tu = 0, tr = 0; const N = 20; r.info.autoReset = false;
    for (let i = 0; i < N; i++) { r.info.reset(); let t = performance.now(); g.update(0.033); tu += performance.now() - t; t = performance.now(); (window.__post || r).render(sc, cam); r.getContext().finish(); tr += performance.now() - t; }
    let meshes = 0, skinned = 0, vis = 0, shadowCasters = 0, mats = new Set(); sc.traverse((o) => { if (o.isMesh) { meshes++; if (o.isSkinnedMesh) skinned++; if (o.visible) vis++; if (o.castShadow) shadowCasters++; [].concat(o.material).forEach((m) => mats.add(m)); } });
    return JSON.stringify({ updateMs: (tu / N).toFixed(1), renderMs: (tr / N).toFixed(1), calls: r.info.render.calls / N, tris: Math.round(r.info.render.triangles / N), meshes, skinned, vis, shadowCasters, materials: mats.size, programs: r.info.programs.length, geos: r.info.memory.geometries, tex: r.info.memory.textures, pr: r.getPixelRatio() }); }));
  await b.close(); })();
