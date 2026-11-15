// Mode Zombies : captures en situation (rendu réel). node test/zombie-shots.cjs URL dossier [paris|banlieue] [nuit=0|1] [vague=1]
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [,, url = 'http://localhost:8124/', out = 'shots-zombie', map = 'paris', nuit = '0', vague = '1'] = process.argv; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript((n) => { try { const k = 'frungz-save'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.settings = { ...(s.settings || {}), night: n === '1', mode: 'zombie' }; localStorage.setItem(k, JSON.stringify(s)); } catch {} }, nuit);
  await p.goto(`${url}?map=${map}&mode=zombie&q=moyen`); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForFunction('window.__game && window.__game.zm', null, { timeout: 120000 });
  // avance le temps jusqu'à la vague voulue, avec des zombies proches
  await p.evaluate(async (v) => { const g = window.__game, Z = g.zm; const od = g.damage; g.damage = function (t, ...r) { if (t && !t.zed) return 0; return od.call(this, t, ...r); }; Z.t = 0.1; while (Z.wave < v) { if (Z.state === 'wave') { for (const z of Z.zeds) if (z.alive) g.kill(z, g.player, {}); Z.toSpawn = 0; Z.bossLeft = 0; } g.update(0.05); g.player.hp = 100; }
    for (let k = 0; k < 2400; k++) { g.update(0.05); g.player.hp = 100; const n = Z.zeds.filter((z) => z.alive && z.pos.distanceTo(g.player.pos) < 11).length; if (n >= 4) break; if (k % 50 === 0) await new Promise((r) => setTimeout(r, 0)); } }, +vague);
  for (let i = 0; i < 4; i++) {
    await p.evaluate(() => { const g = window.__game, Z = g.zm, a = g.player; const zs = Z.zeds.filter((z) => z.alive).sort((x, y) => x.pos.distanceTo(a.pos) - y.pos.distanceTo(a.pos)); const z = zs[0]; if (z) { const yaw = Math.atan2(z.pos.x - a.pos.x, z.pos.z - a.pos.z); g.cam.yaw = yaw; a.yaw = yaw; g.cam.pitch = -0.05; } g.player.hp = 100; });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/${map}-${nuit === '1' ? 'nuit' : 'jour'}-${i}.png` });
  }
  console.log('ok', errs.slice(0, 5)); await b.close();
})();
