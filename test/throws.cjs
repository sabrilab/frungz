const { chromium } = require('playwright');
(async () => { const [,, url, out] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { if (m.type() === 'error') console.log('[c]', m.text().slice(0, 300)); }); p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0,3).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(2000);
const kind = out.includes('lacry') ? 'lacry' : out.includes('drone') ? 'drone' : 'artifice';
console.log(await p.evaluate((kind) => { const g = window.__game; const a = g.player; a.hp = 1e6; g.cam.pitch = 0.12;
  const d = new a.pos.constructor(); g.camera.getWorldDirection(d); d.y = 0; d.normalize(); const tgt = a.pos.clone().addScaledVector(d, 22); tgt.y = g.world.groundY(tgt.x, tgt.z, a.pos.y + 2);
  if (kind !== 'artifice') { a.team = 'ordre'; }
  a.rewards.push(kind); const o = g.throwOrigin(a); g.castThrow(a, kind, window.__solve ? 0 : (()=>{ const dx=tgt.x-o.x, dz=tgt.z-o.z, dy=tgt.y-o.y, T=1.3; return new a.pos.constructor(dx/T,(dy+0.5*19*T*T)/T,dz/T); })(), o);
  return JSON.stringify({ thrown: g.thrown.length }); }, kind));
const t0 = await p.evaluate(() => window.__game.time); for (const t of [1.0, 2.9, 3.4, 4.0, 5.5]) { await p.waitForFunction((x) => window.__game.time >= x, t0 + t, { timeout: 300000, polling: 200 }); await p.screenshot({ path: out.replace('.png', `-${t}.png`) }); }
console.log(await p.evaluate(() => { const g = window.__game; return JSON.stringify({ rockets: (g.rockets||[]).length, pend: (g.pendingRockets||[]).length, drones: (g.drones||[]).length, marks: (g.marks||[]).length }); }));
await b.close(); })();
