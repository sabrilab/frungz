// Mini-hélicos : monte à bord, décolle, survole, tire, débloque l'arsenal (missiles, roquettes, tir stylé), se fait abattre ; captures
// node test/helico.cjs http://localhost:8124/ prefixe
const { chromium } = require('playwright');
(async () => { const [,, url = 'http://localhost:8124/', out = 'helico'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
p.on('console', (m) => { if (/mini-helicos|rror/.test(m.text())) console.log('[log]', m.text()); });
await p.goto(url + '?n=6'); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const shot = async (name) => { await p.evaluate(() => { const g = window.__game; g.renderer.render(g.scene, g.camera); }); await p.screenshot({ path: `${out}-${name}.png` }); };
// prépare : joueur près de l'engin de son camp, commandes simulées
console.log(await p.evaluate(() => {
  const g = window.__game, pl = g.player, I = g.input; pl.alive = true;
  const H = g.cars.filter((c) => c.kind === 'heli');
  const c = H.filter((h) => h.def.camp === pl.team).sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos))[0];
  window.__h = c; window.__mv = { x: 0, y: 0 }; window.__keys = new Set(); window.__press = new Set();
  I.move = () => window.__mv; const d0 = I.down.bind(I), p0 = I.pressed.bind(I); I.down = (k) => window.__keys.has(k) || d0(k); I.pressed = (k) => { if (window.__press.has(k)) { window.__press.delete(k); return true; } return p0(k); };
  I.st.locked = true;
  pl.pos.copy(c.pos).add(new c.pos.constructor(2, 0, 0)); g.enterCar(pl, c); g.cam.yaw = c.yaw;
  return JSON.stringify({ helis: H.map((h) => [h.def.type, h.pos.x.toFixed(0), h.pos.z.toFixed(0)]), team: pl.team, in: pl.inCar === c });
}));
const step = (n, fn) => p.evaluate(({ n, fn }) => { const g = window.__game, c = window.__h, pl = g.player; const f = new Function('g', 'c', 'pl', 'i', fn); let nan = false;
  for (let i = 0; i < n; i++) { f(g, c, pl, i); pl.hp = 100; g.update(1 / 30); if (![c.pos.x, c.pos.y, c.pos.z, c.yaw, c.rollV, c.pitchV, g.camera.position.x].every(Number.isFinite)) nan = true; }
  return JSON.stringify({ pos: [c.pos.x, c.pos.y, c.pos.z].map((v) => v.toFixed(1)), alt: (c.pos.y - g.world.groundY(c.pos.x, c.pos.z)).toFixed(1), sp: c.speed.toFixed(1), spin: c.spin.toFixed(2), flying: c.flying, hp: Math.round(c.hp), in: pl.inCar === c, nan, shots: (g.heliShots || []).length }); }, { n, fn });
await shot('0-sol');
console.log('démarrage', await step(40, "window.__keys = new Set(['jump'])"));
console.log('montée', await step(60, "window.__keys = new Set(['jump'])"));
await shot('1-decollage');
console.log('vol avant', await step(90, "window.__keys = new Set(); window.__mv = { x: 0, y: -1 }"));
await shot('2-vol');
console.log('virage turbo', await step(60, "window.__keys = new Set(['sprint']); window.__mv = { x: 0.6, y: -1 }; g.cam.yaw += 0.02"));
await shot('3-virage');
// tir à la mitrailleuse vers le bas
console.log('tir', await step(45, "window.__keys = new Set(['fire']); window.__mv = { x: 0, y: 0 }; g.cam.pitch = -0.6"));
await shot('4-tir');
// éliminations en vol simulées : 2 → missiles, 4 → roquettes, 6 → tir stylé
console.log(await p.evaluate(() => { const g = window.__game, pl = g.player, c = window.__h; const log = []; for (let k = 0; k < 6; k++) { g.heliKill(pl); log.push(JSON.stringify(c.ammo)); } return log.join(' '); }));
await shot('5-arsenal');
for (const sel of ['missile', 'roquettes', 'style']) {
  console.log(sel, await step(1, `c.sel = '${sel}'; c.specT = 0; window.__press.add('grenade'); g.cam.pitch = -0.45`));
  console.log(' vol', await step(12, "window.__keys = new Set()"));
  await shot('6-' + sel);
  console.log(' fin', await step(80, ""));
}
await shot('7-apres');
// descente et atterrissage, sortie
console.log('descente', await step(150, "window.__keys = new Set(['crouch']); window.__mv = { x: 0, y: 0 }"));
console.log('sortie', await step(2, "if (i === 0) window.__press.add('car')"));
// abattu en vol : le pilote meurt, l'engin part en vrille et explose au sol
console.log('abattu', await p.evaluate(() => { const g = window.__game, pl = g.player, c = window.__h; if (c.dead) return 'détruit'; pl.alive = true; pl.pos.copy(c.pos); g.enterCar(pl, c); window.__keys = new Set(['jump']); for (let i = 0; i < 120; i++) g.update(1 / 30); window.__keys = new Set(); const y = c.pos.y; const foe = g.actors.find((t) => t.team !== pl.team); g.damage(pl, 999, foe); let t = 0; while (!c.dead && t < 300) { g.update(1 / 30); t++; } return JSON.stringify({ y0: y.toFixed(1), crash: c.crash, dead: c.dead > 0, frames: t }); }));
await shot('8-crash');
// bot pilote : on le fait monter dans l'engin de son camp
console.log('bot', await p.evaluate(() => { const g = window.__game; const h = g.cars.find((c) => c.kind === 'heli' && !c.dead && !c.driver && c.def.camp); const bot = g.actors.find((a) => a.bot && a.alive && a.team === h.def.camp && !a.inCar); g.enterCar(bot, h); const log = []; for (let i = 0; i < 600; i++) { g.update(1 / 30); if (i % 100 === 0) log.push([h.pos.x.toFixed(0), h.pos.y.toFixed(0), h.pos.z.toFixed(0), h.speed.toFixed(0), bot.inCar === h].join(' ')); } window.__bh = h; return log.join(' | '); }));
await p.evaluate(() => { const g = window.__game, h = window.__bh; g.player.alive = true; g.camera.position.copy(h.pos).add(new h.pos.constructor(6, 2.5, 6)); g.camera.lookAt(h.pos); g.renderer.render(g.scene, g.camera); });
await p.screenshot({ path: `${out}-9-bot.png` });
await b.close(); })();
