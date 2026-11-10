// Deux-roues : monte sur une moto puis un skate, roule, tourne, saute ; captures en situation
// node test/ride.cjs http://localhost:8124/ prefixe
const { chromium } = require('playwright');
(async () => { const [,, url = 'http://localhost:8124/', out = 'ride'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
p.on('console', (m) => { if (/deux-roues|rror/.test(m.text())) console.log('[log]', m.text()); });
await p.goto(url + '?n=4'); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const run = async (kind, type, steps, shots) => p.evaluate(({ kind, type, steps, shots }) => {
  const g = window.__game, pl = g.player, I = g.input; pl.alive = true;
  if (pl.inCar) g.exitCar(pl);
  const list = g.cars.filter((c) => c.kind === kind && (!type || c.def.type === type) && !c.dead);
  const c = list.sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos))[0];
  // cap vers la plus longue ligne dégagée
  let best = 0, by = c.yaw; for (let k = 0; k < 16; k++) { const y = k * Math.PI / 8; let d = 0; for (; d < 60; d += 2) { const q = c.pos.clone(); q.x += Math.sin(y) * d; q.z += Math.cos(y) * d; q.y += 0.8; if (!g.world.los(c.pos.clone().setY(c.pos.y + 0.8), q)) break; } if (d > best) { best = d; by = y; } }
  c.yaw = by; c.vel = null; c.speed = 0; pl.pos.copy(c.pos); g.enterCar(pl, c); g.cam.yaw = c.yaw; g.cam.carYaw = c.yaw;
  let mv = { x: 0, y: 0 }, jump = false; I.move = () => mv; const p0 = I.pressed.bind(I); I.pressed = (k) => k === 'jump' ? jump : p0(k);
  pl.hp = 100; const ex0 = g.exitCar.bind(g); g.exitCar = (a, d) => { if (a === pl) c.why = c.why || new Error().stack.split('\n').slice(2, 4).join(' '); return ex0(a, d); };
  const log = []; let maxSp = 0, maxLean = 0, nan = false, bailed = false;
  for (let i = 0; i < steps; i++) { mv = { x: 0, y: -1 }; jump = false;
    if (i > steps * 0.45 && i < steps * 0.7) mv.x = -0.7; if (kind === 'skate' && i === Math.floor(steps * 0.8)) jump = true;
    pl.hp = 100; for (const a of g.actors) if (a.bot) a.fireT = 9; g.update(1 / 30); if (!pl.inCar) { bailed = true; break; }
    maxSp = Math.max(maxSp, Math.abs(c.speed)); maxLean = Math.max(maxLean, Math.abs(c.rollV)); if (!isFinite(c.pos.x) || !isFinite(c.yaw)) nan = true;
    if (i % 30 === 0) log.push([i, c.pos.x.toFixed(1), c.pos.y.toFixed(2), c.pos.z.toFixed(1), c.speed.toFixed(1), c.rollV.toFixed(2)].join(' ')); }
  window.__ridecar = c;
  const n = g.cars.filter((x) => x.kind).reduce((s, x) => (s[x.def.type] = (s[x.def.type] || 0) + 1, s), {});
  return JSON.stringify({ why: c.why, kind, type: c.def.type, n, maxSp: maxSp.toFixed(1), maxLean: maxLean.toFixed(2), nan, bailed, log });
}, { kind, type, steps, shots });
for (const [k, t, steps] of [['moto', 'sportive', 45], ['moto', 'scooter', 50], ['moto', 'police', 45], ['skate', null, 100]]) {
  console.log(await run(k, t, steps)); await p.evaluate(() => { const g = window.__game; g.renderer.render(g.scene, g.camera); }); await p.screenshot({ path: `${out}-${t || k}.png` });
}
await b.close(); })();
