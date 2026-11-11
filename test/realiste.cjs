// Atouts de série lancés au fumigène de désignation : fumée colorée, étiquette, arrivée réaliste (fourgon, obus en cloche, drone qui décolle).
// node test/realiste.cjs URL dossier   (KINDS=lacry,crs,drone,artifice,essaim,emeute)
const { chromium } = require('playwright');
(async () => { const [,, url, dir = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errs = 0; p.on('pageerror', (e) => { errs++; console.log('[err]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(1500);
const wait = async (s) => { const t0 = await p.evaluate(() => window.__game.time); await p.waitForFunction((x) => window.__game.time >= x, t0 + s, { timeout: 400000, polling: 200 }); };
await p.evaluate(() => { const g = window.__game; g.player.hp = 1e9; g.player.armor = 1e9; });
for (const kind of (process.env.KINDS || 'lacry,crs,drone,artifice,essaim,emeute').split(',')) {
  const info = await p.evaluate((kind) => { const g = window.__game, a = g.player; const d = new a.pos.constructor(); g.camera.getWorldDirection(d); d.y = 0; d.normalize();
    const foe = g.actors.find((x) => x.alive && x.team !== a.team && x.bot); if (foe) { foe.pos.copy(a.pos).addScaledVector(d, 16); foe.ai.think = 5; }
    a.rewards.push(kind); const v = d.clone().multiplyScalar(11); v.y = 6; g.castThrow(a, kind, v); return { thrown: (g.thrown || []).length }; }, kind);
  console.log(kind, JSON.stringify(info));
  await wait(1.2); await p.screenshot({ path: `${dir}/real-${kind}-1.png` });
  await wait(2.2); await p.screenshot({ path: `${dir}/real-${kind}-2.png` });
  await wait(3); await p.screenshot({ path: `${dir}/real-${kind}-3.png` });
  console.log(kind, JSON.stringify(await p.evaluate(() => { const g = window.__game; return { marks: (g.marks || []).length, tags: document.querySelectorAll('#zonetags .ztag').length, shells: (g.shells || []).length + (g.pendingShells || []).length, convoys: (g.convoys || []).map((c) => c.kind + ':' + c.state).join(','), drones: (g.drones || []).length, air: (g.air || []).map((x) => x.type).join(','), clouds: g.fx.clouds.map((c) => c.kind).join(','), stats: g.fx.stats() }; })));
  await wait(6);
}
console.log('erreurs', errs); await b.close(); })();
