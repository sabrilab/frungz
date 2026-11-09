// Captures caméra : TPS, visée L2, FPS, FPS visée. node test/cam.cjs URL dossier
const { chromium } = require('playwright');
(async () => { const [,, url, dir] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  await p.evaluate(() => { const g = window.__game; for (const x of g.actors) if (x.bot) { x.pos.set(9999, 0, 9999); x.alive = false; x.respawnT = 999; } for (let i = 0; i < 20; i++) g.update(1 / 60); });
  for (const [name, aim, fps] of [['tps', 0, 0], ['tps_visee', 1, 0], ['fps', 0, 1], ['fps_visee', 1, 1]]) {
    await p.evaluate(([aim, fps]) => { const g = window.__game, I = g.input; g.cam.fps = !!fps; g.viewGun(); if (aim) I.keys.add('Mouse2'); else I.keys.delete('Mouse2'); g.cam.pitch = 0.05; for (let i = 0; i < 40; i++) g.update(1 / 60); g.paused = true; (window.__post || g.renderer).render(g.scene, g.camera); g.paused = false; }, [aim, fps]);
    await p.screenshot({ path: `${dir}/${name}.png` }); }
  await b.close(); })();
