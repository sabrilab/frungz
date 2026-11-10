// Sniper, kill-cam en bulle, barre des séries : captures
const { chromium } = require('playwright');
(async () => { const [,, url, out = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const r = await p.evaluate(() => { const g = window.__game, pl = g.player, I = g.input, T = window.__THREE, out = {};
  pl.alive = true; I.st.locked = true;
  // arme : fusil de précision
  pl.slots[1] = { id: 'sniper', rarity: 'epique', mag: 5 }; g.equip(pl, 1, true);
  // une cible loin devant, dans une rue dégagée
  const foe = g.actors.find((x) => x.bot && x.team !== pl.team); foe.alive = true; foe.hp = 100; foe.ai.think = 99;
  pl.pos.set(-30, 0.17, -5); pl.vel.set(0, 0, 0); g.cam.yaw = Math.PI / 2; g.cam.pitch = 0;
  for (let i = 0; i < 3; i++) g.update(1 / 30);
  const o = pl.pos.clone().add(new T.Vector3(0, 1.6, 0)); let best = 0; for (let d = 20; d < 140; d += 5) { const q = o.clone().add(new T.Vector3(d, 0, 0)); if (!g.world.los(o, q)) break; best = d; } out.clear = best;
  const fx = -30 + Math.min(best - 5, 110); foe.pos.set(fx, g.world.groundY(fx, -5), -5);
  const down0 = I.down.bind(I); let aim = true, hold = false; I.down = (k) => k === 'aim' ? aim : k === 'sprint' ? hold : down0(k);
  for (let i = 0; i < 20; i++) { foe.pos.set(fx, g.world.groundY(fx, -5), -5); g.update(1 / 30); }
  out.scoped = document.body.classList.contains('scoped'); out.fov = g.camera.fov.toFixed(1);
  // vise la tête en compensant la chute
  const head = foe.pos.clone().add(new T.Vector3(0, 1.62, 0)); const cp = g.camera.position; const dist = head.distanceTo(cp); const drop = 9.8 * dist * dist / (2 * 380 * 380);
  const dir = head.clone().add(new T.Vector3(0, drop, 0)).sub(cp).normalize(); g.cam.yaw = Math.atan2(dir.x, dir.z); g.cam.pitch = Math.asin(dir.y); hold = true;
  const dmg0 = g.damage.bind(g); window.__dm = []; g.damage = (t, n, by, o) => { window.__dm.push([t === foe, Math.round(n), by === pl, !!o?.head]); return dmg0(t, n, by, o); };
  for (let i = 0; i < 40; i++) { g.cam.yaw = Math.atan2(dir.x, dir.z); g.cam.pitch = Math.asin(dir.y); foe.pos.set(fx, g.world.groundY(fx, -5), -5); g.update(1 / 30); }
  out.held = g.sc.held; out.sway = g.sc.A.toExponential(2); out.dist = dist.toFixed(1);
  const ok = g.fire(pl, g.camera.position.clone(), (() => { const d = new T.Vector3(); g.camera.getWorldDirection(d); return d; })());
  out.fired = ok; out.bullets = g.bullets?.length; out.pip = g.killcam?.mode;
  let t = 0; for (; t < 40 && g.bullets?.length; t++) { foe.pos.set(fx, g.world.groundY(fx, -5), -5); g.update(1 / 60); }
  out.dm = window.__dm.slice(0, 6); out.foeAlive = foe.alive; out.foeHp = foe.hp; out.pipAfter = g.killcam?.mode; out.pipTarget = !!g.killcam?.target;
  return JSON.stringify(out); });
console.log(r);
await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 6; i++) g.update(1 / 60); });
await p.screenshot({ path: out + '/snipe-pip.png' });
// lunette seule
await p.evaluate(() => { const g = window.__game; g.killcam = null; document.getElementById('killcam').classList.remove('on'); g.sc.zoom = 1; for (let i = 0; i < 15; i++) g.update(1 / 30); });
await p.screenshot({ path: out + '/snipe-scope.png' });
// séries : 3 éliminations d'affilée puis bonus prêt
const r2 = await p.evaluate(() => { const g = window.__game, pl = g.player, I = g.input; I.down = () => false; g.sc.was = false; document.body.classList.remove('scoped');
  pl.streak = 0; pl.rewards = []; const foes = g.actors.filter((x) => x.bot && x.team !== pl.team && x.alive).slice(0, 3);
  for (const f of foes) { g.damage(f, 999, pl, { head: true }); g.update(1 / 30); }
  for (let i = 0; i < 8; i++) g.update(1 / 30);
  return JSON.stringify({ streak: pl.streak, rewards: pl.rewards, multi: g.mk?.n, bar: document.getElementById('streakbar').innerText.replace(/\n/g, ' ') }); });
console.log(r2);
await p.screenshot({ path: out + '/streak.png' }); await b.close(); })();
