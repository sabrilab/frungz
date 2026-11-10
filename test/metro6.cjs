const { chromium } = require('playwright');
(async () => { const [,, url, out] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0,3).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(1500);
const st = () => p.evaluate(() => { const g = window.__game, a = g.player, M = g.world.metro, c = M.cars[1]; return JSON.stringify({ t: +(g.time % 60).toFixed(1), open: M.open, v: +M.v.toFixed(1), car: [c.x, c.y, c.z].map((x) => +x.toFixed(1)), me: a.pos.toArray().map((x) => +x.toFixed(2)), alive: a.alive, ground: +g.world.groundY(a.pos.x, a.pos.z, a.pos.y).toFixed(2) }); });
// zone H
console.log(await p.evaluate(() => JSON.stringify(window.__game.zoneState.map((z) => [z.id, z.y]))));
// joueur à bord de la voiture du milieu, à l'arrêt ouest
await p.evaluate(() => { const g = window.__game, a = g.player; a.hp = 1e6; a.spawnProt = 999; g.time = 4; g.updateMetro(0.016); const M = g.world.metro, c = M.cars[1]; a.pos.set(c.x, c.y + M.floor + 0.02, c.z); a.vel.set(0,0,0); g.cam.yaw = c.yaw + Math.PI / 2; a.yaw = g.cam.yaw; });
for (let i = 0; i < 6; i++) await p.waitForFunction((x) => true, null); 
await p.waitForTimeout(3000); console.log(await st()); await p.screenshot({ path: out.replace('.png', '-1stop.png') });
for (const T of [8.6, 12, 16, 20]) { await p.evaluate((T) => { const g = window.__game; g.time = Math.floor(g.time / 60) * 60 + T; }, T); await p.waitForTimeout(2500); console.log(await st()); }
await p.screenshot({ path: out.replace('.png', '-2ride.png') });
// vue depuis le quai d'une rame portes fermées
await b.close(); })();
