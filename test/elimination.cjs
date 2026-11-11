// Élimination (src/elimination.js) : arrêt sur image, corps emporté par le coup, sang, losange de confirmation,
// silhouette, chute entendue, corps qui s'enfonce. Vérifications chiffrées + pellicule de captures.
// node test/elimination.cjs URL dossier [arme] [tete 0|1] [distance]
const { chromium } = require('playwright');
(async () => { const [,, url, out = '.', weapon = 'fusil_assaut', head = '0', dist = '8'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
await p.goto(url + (url.includes('?') ? '&' : '?') + 'n=3'); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const freeze = () => p.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
const r = await p.evaluate(([weapon, head, dist]) => { const g = window.__game, pl = g.player, T = window.__THREE, out = {};
  pl.alive = true; g.input.st.locked = true; pl.hp = 100; pl.spawnProt = 0; g.save.settings.killcam = false;
  for (const a of g.actors) if (a !== pl && a.bot) { a.ai.think = 999; a.respawnT = 999; }
  const foe = g.actors.find((x) => x.bot && x.team !== pl.team); foe.alive = true; foe.hp = 100; foe.armor = 0; foe.spawnProt = 0; foe.ai.think = 999;
  // endroit dégagé : le centre de zone le plus loin des murs vers -x
  let X = -30, Z = -5, best = -1; for (const zc of g.zoneState) { const [x, z] = zc.center; const o = new T.Vector3(x + 6, g.world.groundY(x + 6, z) + 1.2, z); const h = g.world.ray(o, new T.Vector3(-1, 0, 0), 40); const m = h ? h.t : 40; const h2 = g.world.ray(o, new T.Vector3(1, 0, 0), 10); if (m > best && !h2) { best = m; X = x + 6; Z = z; } }
  pl.pos.set(X, g.world.groundY(X, Z), Z); g.cam.yaw = -Math.PI / 2; g.cam.pitch = -0.08; foe.pos.set(X - dist, g.world.groundY(X - dist, Z), Z); foe.yaw = Math.PI / 2 + 0.5; foe.vel.set(0, 0, 0);
  for (const a of g.actors) if (a !== pl && a !== foe) { a.pos.set(200, -50, 200); a.alive = false; a.respawnT = 999; a.ch.root.visible = false; }
  pl.slots[pl.cur] = { id: weapon, rarity: 'commun', mag: 30 }; g.equip(pl, pl.cur, true);
  g.paused = true; for (let i = 0; i < 10; i++) g.update(1 / 30, true);
  const p0 = foe.pos.clone(); const t0 = g.time;
  g.damage(foe, 500, pl, { head: !!head, weapon, dir: new T.Vector3(-1, 0, 0) });
  out.alive = foe.alive; out.anim = foe.anim; out.kb = foe.kb && foe.kb.length().toFixed(2); out.stop = g._elim.stopT;
  g.update(1 / 30, true); out.gameDtDuringStop = +(g.time - t0).toFixed(4);
  window.__foe = foe; window.__p0 = p0; return out; }, [weapon, +head, +dist]);
console.log(JSON.stringify(r));
const steps = [[0, '00-impact'], [4, '01-0.15s'], [8, '02-0.4s'], [14, '03-0.9s'], [60, '04-3s']];
let done = 0;
for (const [n, name] of steps) {
  const info = await p.evaluate((k) => { const g = window.__game; for (let i = 0; i < k; i++) g.update(1 / 30, true); const f = window.__foe, E = g._elim; return { slide: f.pos.distanceTo(window.__p0).toFixed(2), pools: E.pools.filter(Boolean).map((o) => o.n.y.toFixed(1) + '@' + o.t.toFixed(1)).join(' '), mark: E.marks.map((m) => m.el.style.opacity).join(','), glow: E.glow.length, nan: !Number.isFinite(f.pos.x + f.pos.y + f.pos.z) }; }, n - done); done = n;
  console.log(name, JSON.stringify(info)); await freeze(); await p.screenshot({ path: `${out}/elim-${name}.png` });
}
// enfoncement avant réapparition
const s = await p.evaluate(() => { const g = window.__game, f = window.__foe; f.respawnT = 0.6; g.update(1 / 30, true); return { vis: f.ch.root.visible, dy: (f.ch.root.position.y - f.pos.y).toFixed(2) }; });
console.log('enfoncement', JSON.stringify(s));
console.log('erreurs', errs.length); await b.close(); })();
