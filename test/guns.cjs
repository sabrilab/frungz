// Composition des armes à l'écran : node test/guns.cjs URL dossier [grille 1|0]
// Vue subjective pour chaque arme (hanche et visée) et vue à l'épaule, avec la grille du nombre d'or (38,2 / 61,8 %) en surimpression
const { chromium } = require('playwright');
(async () => { const [,, url, dir = '.', grid = '1'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  if (grid === '1') await p.addStyleTag({ content: '#phi{position:fixed;inset:0;pointer-events:none;z-index:99;background:linear-gradient(90deg,transparent calc(38.2% - 1px),#f0f8 0 38.2%,transparent 0 calc(61.8% - 1px),#f0f8 0 61.8%,transparent 0),linear-gradient(transparent calc(38.2% - 1px),#f0f8 0 38.2%,transparent 0 calc(61.8% - 1px),#f0f8 0 61.8%,transparent 0)}' });
  if (grid === '1') await p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="phi"></div>'));
  const shots = [['pistol', 1, 0], ['revolver', 1, 0], ['smg', 1, 0], ['rifle', 1, 0], ['shotgun', 1, 0], ['sniper', 1, 0], ['rifle', 1, 1], ['pistol', 1, 1], ['rifle', 0, 0], ['pistol', 0, 0]];
  for (const [id, fps, aim] of shots) {
    await p.evaluate(([id, fps, aim]) => { const g = window.__game, a = g.player; g.paused = false; a.slots[1] = { id, rarity: 'commun', mag: 30 }; g.equip(a, 1, true); g.cam.fps = !!fps; g.viewGun(); g.aiming = !!aim; g.cam.pitch = -0.03;
      for (let i = 0; i < 40; i++) { g.aiming = !!aim; g.update(0.033); } g.paused = true; (window.__post || g.renderer).render(g.scene, g.camera); }, [id, fps, aim]);
    await p.screenshot({ path: `${dir}/${fps ? 'fps' : 'tps'}-${id}${aim ? '-visee' : ''}.png` });
  }
  await b.close(); })();
