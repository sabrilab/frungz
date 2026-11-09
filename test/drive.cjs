// Conduite : met le joueur dans la voiture la plus proche, accélère, braque, frein à main ; vérifie vitesse, dérapage, traces, collisions
const { chromium } = require('playwright');
(async () => { const [,, url, out = '-'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0,4).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const r = await p.evaluate(() => { const g = window.__game, pl = g.player, I = g.input; pl.alive = true;
  const car = g.cars.slice().sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos))[0]; g.enterCar(pl, car);
  let best = 0, by = car.yaw; for (let k = 0; k < 16; k++) { const y = k * Math.PI / 8; let d = 0; for (; d < 80; d += 2) { const q = car.pos.clone(); q.x += Math.sin(y) * d; q.z += Math.cos(y) * d; q.y += 0.8; if (!g.world.los(car.pos.clone().setY(car.pos.y + 0.8), q)) break; } if (d > best) { best = d; by = y; } } car.yaw = by; car.vel = null; car.speed = 0;
  let mv = { x: 0, y: 0 }, tr = 0, hand = false; I.move = () => mv; const down0 = I.down.bind(I); I.down = (k) => k === 'jump' ? hand : down0(k);
  const poll0 = I.poll.bind(I); I.poll = (...a) => { const r = poll0(...a); I.st.triggerR = tr; return r; };
  const log = []; let maxSp = 0, maxSlip = 0, bumps = 0, lastHp = car.hp, nan = false;
  for (let i = 0; i < 400; i++) { tr = 1; mv = { x: 0, y: -1 }; if (i > 120 && i < 200) mv.x = 0.8; if (i > 160 && i < 190) hand = true; else hand = false; if (i > 260 && i < 330) mv.x = -1;
    g.update(1 / 30); maxSp = Math.max(maxSp, Math.abs(car.speed)); maxSlip = Math.max(maxSlip, Math.abs(car.slipV || 0)); if (car.hp < lastHp) bumps++; lastHp = car.hp;
    if (!isFinite(car.pos.x) || !isFinite(car.yaw)) nan = true; if (i % 50 === 0) log.push([i, car.pos.x.toFixed(1), car.pos.z.toFixed(1), car.speed.toFixed(1)].join(' ')); }
  return JSON.stringify({ car: car.def?.name || car.name, body: car.def?.body, W: car.W, L: car.L, maxSp: maxSp.toFixed(1), maxSlip: maxSlip.toFixed(1), hits: bumps, nan, skids: g.skids?.n ?? g.skidN ?? '?', log }, null, 1); });
console.log(r); if (out !== '-') await p.screenshot({ path: out }); await b.close(); })();
