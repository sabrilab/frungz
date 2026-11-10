// Revue des mains en vue subjective : node test/hands.cjs dossier ids (jeu servi sur localhost:8124)  → hanche et visée par arme, sans interface
const { chromium } = require('playwright');
(async () => { const [,, dir, only = ''] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto('http://localhost:8124/'); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  await p.addStyleTag({ content: '#hud{display:none!important}' });
  const ids = only ? only.split(',') : await p.evaluate(() => { const g = window.__game; return g.__weaponIds || []; });
  console.log(ids.join(','));
  for (const id of ids) for (const aim of [0, 1]) {
    await p.evaluate(([id, aim]) => { const g = window.__game, a = g.player; g.paused = false; a.slots[1] = { id, rarity: 'commun', mag: 30 }; g.equip(a, 1, true); g.cam.fps = true; g.viewGun(); g.cam.pitch = -0.03; a.hp = 100;
      if (!g.input.__d) { g.input.__d = g.input.down.bind(g.input); g.input.down = (k) => (k === 'aim' ? !!window.__aim : g.input.__d(k)); } window.__aim = aim;
      for (let i = 0; i < 40; i++) g.update(0.033); g.paused = true; (window.__post || g.renderer).render(g.scene, g.camera); }, [id, aim]);
    await p.screenshot({ path: `${dir}/${id}-${aim}.jpg`, type: 'jpeg', quality: 85 });
  }
  await b.close(); })();
