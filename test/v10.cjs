const { chromium } = require('playwright');
(async () => { const [,, url, out] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message)); p.on('console', (m) => { const t = m.text(); if (/shader|WebGL: INVALID|THREE\.WebGLProgram|indisponible|monde prêt/i.test(t)) console.log('[c]', t.slice(0, 300)); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(2000);
console.log(await p.evaluate(() => { const g = window.__game, w = g.world; const a = g.player; a.hp = 1e6; a.spawnProt = 999;
  const r = { zones: g.zoneState.map((z) => z.id).join(''), tour: w.groundY(0, -212), marches: w.groundY(0, -300), parvis: w.groundY(0, -316), pont: [-150, -165, -180].map((z) => +w.groundY(0, z).toFixed(2)) };
  const fp = w.findPath || w.path; try { const pa = fp.call(w, a.pos.x, a.pos.z, 0, -212); r.path = pa ? pa.length : null; const pj = fp.call(w, a.pos.x, a.pos.z, 0, -316); r.pathJ = pj ? pj.length : null; } catch (e) { r.path = 'err ' + e.message; }
  // vue depuis la place vers la tour
  a.pos.set(0, w.groundY(0, 14), 14); g.cam.yaw = Math.atan2(0 - 0, -219 - 14); a.yaw = g.cam.yaw; g.cam.pitch = 0.22; return JSON.stringify(r); }));
await p.waitForTimeout(1500); await p.screenshot({ path: out.replace('.png', '-place.png'), timeout: 120000 });
console.log(await p.evaluate(() => { const g = window.__game, a = g.player; const d = new a.pos.constructor(); g.camera.getWorldDirection(d); a.pos.set(0, g.world.groundY(0, -170), -170); g.cam.pitch = 0.3; return JSON.stringify({ dir: d.toArray().map((x) => +x.toFixed(2)) }); }));
await p.waitForTimeout(1500); await p.screenshot({ path: out.replace('.png', '-pont.png'), timeout: 120000 });
// laisser tourner : répartition des bots
const t0 = await p.evaluate(() => window.__game.time); await p.waitForFunction((x) => window.__game.time >= x, t0 + 4, { timeout: 400000, polling: 500 });
console.log(await p.evaluate(() => { const g = window.__game; const n = g.actors.filter((t) => t.bot && t.alive); return JSON.stringify({ bots: n.length, nord: n.filter((t) => t.pos.z < -160).length, tasks: n.reduce((o, t) => { const k = t.ai?.task?.zone?.id || t.ai?.task?.kind || '-'; o[k] = (o[k] || 0) + 1; return o; }, {}), me: g.player.pos.toArray().map((x) => +x.toFixed(1)) }); }));
await b.close(); })();
