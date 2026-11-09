// Coût de rendu depuis plusieurs points de vue, par préréglage : node test/view.cjs URL
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(process.argv[2]); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  console.log(await p.evaluate(() => { const g = window.__game, r = g.renderer; for (let i = 0; i < 30; i++) g.update(0.033); g.paused = true; r.info.autoReset = false; const out = [window.__quality];
    const views = [[0, 18, -40, 0, 2, 0], [0, 2, 0, 60, 2, 0], [-60, 1.7, 30, 60, 2, 30], [0, 60, 0, 0, 0, 1]];
    for (const v of views) { g.camera.position.set(v[0], v[1], v[2]); g.camera.lookAt(v[3], v[4], v[5]); g.followShadow?.(g.camera.position); let t = 0; const N = 5; let calls = 0, tris = 0;
      for (let i = 0; i < N; i++) { r.info.reset(); const s = performance.now(); (window.__post || r).render(g.scene, g.camera); r.getContext().finish(); t += performance.now() - s; calls += r.info.render.calls; tris += r.info.render.triangles; }
      out.push(`${(t / N).toFixed(0)}ms ${calls / N | 0}calls ${(tris / N / 1000) | 0}kT`); }
    return out.join(' | '); })); await b.close(); })();
