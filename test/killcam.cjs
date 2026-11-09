const { chromium } = require('playwright');
(async () => { const [,, url, out] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const r = await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 10; i++) g.update(0.033); const pl = g.player;
  const foes = g.actors.filter((a) => a.team !== pl.team); const t = foes[0];
  const z = g.zoneState[0]; const [x, zz] = g.world.randomFree(z.center[0], z.center[1], 4); t.pos.set(x, g.world.groundY(x, zz), zz); t.vel.set(0,0,0);
  for (const f of foes.slice(1)) { f.pos.set(f.pos.x + 400, f.pos.y, f.pos.z); f.alive = false; f.respawnT = 999; }
  const [px, pz] = g.world.randomFree(x + 30, zz, 10); pl.pos.set(px, g.world.groundY(px, pz), pz);
  for (let i = 0; i < 5; i++) g.update(0.033); t.alive && g.damage(t, 999, pl, { head: true }); const on = !!g.killcam; for (let i = 0; i < 18; i++) g.update(0.033); return { on, still: !!g.killcam, dist: g.killcam?.dist }; });
console.log(JSON.stringify(r)); await p.screenshot({ path: out }); await b.close(); })();
