// Captures depuis des points de vue fixes : node test/poses.cjs "URL" dossier '[["nom",x,y,z,tx,ty,tz],...]'
const { chromium } = require('playwright');
(async () => { const [,, url, dir, js] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  let errs = 0; p.on('pageerror', (e) => { errs++; console.log('[err]', e.message); });
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 900000 }); await p.evaluate(() => window.__start());
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 20; i++) g.update(0.033); g.paused = true; });
  for (const v of JSON.parse(js)) {
    await p.evaluate((v) => { const g = window.__game; g.camera.position.set(v[1], v[2], v[3]); g.camera.lookAt(v[4], v[5], v[6]); g.followShadow?.(g.camera.position); (window.__post || g.renderer).render(g.scene, g.camera); }, v);
    await p.screenshot({ path: `${dir}/${v[0]}.png` });
  }
  console.log('erreurs', errs); await b.close(); })();
