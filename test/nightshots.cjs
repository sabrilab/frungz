// Captures du mode nuit depuis plusieurs points de vue : node test/nightshots.cjs URL dossier prefixe
const { chromium } = require('playwright');
(async () => { const [,, url, dir, pre = 'nuit'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('frungz-save') || '{}'); s.settings = { ...(s.settings || {}), night: true }; localStorage.setItem('frungz-save', JSON.stringify(s)); } catch {} });
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(1500);
  if (process.env.TWEAK) await p.evaluate(process.env.TWEAK);
  const views = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : [null, [-105, 1.7, -95, -105, 2, 20], [0, 18, -40, 0, 2, 0], [-60, 1.7, 30, 60, 2, 30], [35, 1.7, -5, 90, 2, -5]];
  for (let i = 0; i < views.length; i++) {
    const d = await p.evaluate((v) => { const g = window.__game; if (!g.__w) { for (let k = 0; k < 30; k++) g.update(0.033); g.__w = 1; } g.paused = true; document.querySelectorAll('#hud,.hud').forEach(() => {});
      if (v) { g.camera.position.set(v[0], v[1], v[2]); g.camera.lookAt(v[3], v[4], v[5]); } g.followShadow?.(g.camera.position);
      for (let k = 0; k < 4; k++) window.__night?.update(0.4, g.camera.position, g.cars); (window.__post || g.renderer).render(g.scene, g.camera); return g.renderer.domElement.toDataURL('image/png'); }, views[i]);
    require('fs').writeFileSync(`${dir}/${pre}-${i}.png`, Buffer.from(d.split(',')[1], 'base64'));
  }
  await b.close(); })();
