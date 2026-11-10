// Tourelles automatiques : règles (pose, niveaux, réparation, démontage, dégâts), rendu des 3 niveaux par camp et du montage,
// combat contre des bots, et partie simulée (bots qui en posent et qui les détruisent, temps de mise à jour).
// node test/tourelles.cjs URL dossier_captures [secondes_de_simulation]
const { chromium } = require('playwright');
(async () => { const [,, url, out = '.', simS = 180] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/GPU stall|GL Driver|WebGL-/.test(t)) console.log('[c]', t.slice(0, 300)); }); p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(1500);
const step = (s) => p.evaluate((s) => { const g = window.__game; for (let i = 0; i < s * 20; i++) g.update(0.05); }, s);
// endroit dégagé : le joueur au centre de la zone B, tourné vers la plus longue ligne de vue
await p.evaluate(() => { const g = window.__game, a = g.player, T = window.__THREE; a.hp = 1e6; a.armor = 1e6; const z = g.zoneState[1];
  a.pos.set(z.center[0] + 5, g.world.groundY(z.center[0] + 5, z.center[1], (z.y ?? 0.17) + 1), z.center[1]);
  const e = a.pos.clone(); e.y += 1.2; let bl = 0; for (let k = 0; k < 24; k++) { const y = k / 24 * Math.PI * 2; let L = 0; for (let d = 2; d <= 24; d += 2) { const q = e.clone().add(new T.Vector3(Math.sin(y) * d, 0, Math.cos(y) * d)); if (!g.world.los(e, q)) break; L = d; } if (L > bl) { bl = L; g.cam.yaw = y; } }
  g.cam.pitch = 0.1; g.__p0 = a.pos.clone(); g.__yaw = g.cam.yaw; });
const ONLY_SIM = !!process.env.SIM_ONLY, BASE = !!process.env.BASE; // BASE : même partie sans tourelles (référence de performance)
if (!ONLY_SIM) {
// 1) règles
console.log('règles', await p.evaluate(() => { const g = window.__game, a = g.player, R = {};
  for (const o of g.actors) if (o !== a) { o.alive = false; o.respawnT = 1e9; o.ch.root.visible = false; }
  a.rewards.push('tourelle'); a.galons = 0; g.useStreak(a); R.carry = !!a.carryTurret && !!g.turretGhost; R.rewardsLeft = a.rewards.length;
  g.update(0.05); R.prompt = (g.ui.prompt || '').replace(/<[^>]+>/g, '');
  const T = g.placeTurret(a, g.cam.yaw, a.carryTurret.level, 1); g.dropCarry(a, false); R.placed = !!T; if (!T) return JSON.stringify(R);
  R.cap = g.turretCap(); for (let i = 0; i < 40; i++) g.update(0.05); R.built = T.bt >= T.build; R.armed = T.armed;
  R.act0 = g.turretAction(a, T); a.galons = 8; R.act8 = g.turretAction(a, T); g.doTurretAction(a, T, R.act8); for (let i = 0; i < 25; i++) g.update(0.05); R.lvlAfter8 = T.level;
  a.galons = 15; g.doTurretAction(a, T, g.turretAction(a, T)); for (let i = 0; i < 25; i++) g.update(0.05); R.lvlAfter15 = T.level; R.hpMax = T.hp;
  const h0 = T.hp; g.hitTurret(T, 100, { team: a.team === 'ordre' ? 'civils' : 'ordre', name: 'test', alive: true, pos: T.pos.clone(), stats: {} }); R.bullet100 = Math.round(h0 - T.hp);
  const h1 = T.hp; g.hitTurret(T, 100, a); R.friendly = Math.round(h1 - T.hp);
  R.fix = g.turretAction(a, T)?.kind; g.doTurretAction(a, T, g.turretAction(a, T)); R.hpFixed = Math.round(T.hp);
  // démontage puis repose : le niveau est gardé
  g.removeTurret(T); g.world.flushNav(); g.carryTurret(a, T.level, 1); R.why2 = g.turretSpot(a, g.cam.yaw).why; { const T3 = window.__THREE; const f = new T3.Vector3(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw)); const q = a.pos.clone().addScaledVector(f, 1.9); q.y = g.world.groundY(q.x, q.z, a.pos.y + 0.6); const e = a.pos.clone(); e.y += 0.9; const d = q.clone().setY(q.y + 0.9).sub(e); const L = d.length(); d.normalize(); const h = g.world.ray(e, d, L); R.dbg = [g.world.free(...g.world.cell(q.x, q.z)), h && h.t.toFixed(2), h && JSON.stringify(Object.keys(h.c || {})), h && h.c && h.c.type]; } R.pos = [a.pos.distanceTo(g.__p0).toFixed(2), T.pos.distanceTo(a.pos).toFixed(2), g.world.dynamic.length, g.walls.length, g.cam.yaw.toFixed(2), g.__yaw.toFixed(2)]; const T2 = g.placeTurret(a, g.cam.yaw, a.carryTurret.level, 1); g.dropCarry(a, false); R.reposeLevel = T2?.level; R.reposeBuild = T2?.build;
  for (const x of g.turrets.slice()) g.removeTurret(x); return JSON.stringify(R); }));
// 2) rendu : niveaux 1, 2, 3 de chaque camp, puis le montage image par image
await p.evaluate(() => { const g = window.__game, a = g.player; g.__hide = true; if (!g.__upd) { g.__upd = g.update; g.update = function (dt) { g.__upd.call(g, dt); if (g.__hide) g.player.ch.root.visible = false; }; }
  g.zoneState.forEach((z) => z.g && (z.g.visible = false)); document.getElementById('hud').style.visibility = 'hidden'; });
for (const team of ['ordre', 'civils']) {
  await p.evaluate((team) => { const g = window.__game, a = g.player, T3 = window.__THREE; a.pos.copy(g.__p0); g.cam.yaw = g.__yaw; g.cam.pitch = 0.16; const f = new T3.Vector3(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw)), s = new T3.Vector3(-f.z, 0, f.x);
    const save = a.team; a.team = team; g.__demo = [0, 1, 2].map((lv) => { const fake = { ...a, team, pos: a.pos.clone().addScaledVector(f, 3.6).addScaledVector(s, (lv - 1) * 2.5), bot: false }; const T = g.placeTurret(fake, g.cam.yaw + Math.PI, lv, 1); if (!T) throw new Error("rendu " + lv + " " + g.turretSpot(fake, g.cam.yaw + Math.PI).why); T.owner = null; T.bt = 99; T.armed = true; T.life = Infinity; return T; }); a.team = save;
    g.__upd.call(g, 0.05); for (const T of g.__demo) { T.aimY = T.base + (T.level - 1) * 0.35; T.aimP = 0.08; g.poseTurret(T, 1); } }, team);
  await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/tourelles-${team}.png` });
  await p.evaluate(() => { const g = window.__game; g.cam.yaw += 0.6; g.cam.pitch = -0.05; for (const T of g.__demo) { T.aimY = T.base - 0.9; g.poseTurret(T, 1); } });
  await p.waitForTimeout(800); await p.screenshot({ path: `${out}/tourelles-${team}-profil.png` });
  await p.evaluate(() => { const g = window.__game; for (const T of g.__demo) g.removeTurret(T); });
}
// montage : quatre instants
await p.evaluate(() => { const g = window.__game, a = g.player, T3 = window.__THREE; a.pos.copy(g.__p0); g.cam.yaw = g.__yaw; g.cam.pitch = 0.2; const f = new T3.Vector3(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw)), s = new T3.Vector3(-f.z, 0, f.x);
  g.__demo = [0.15, 0.45, 0.75, 1].map((k, i) => { const fake = { ...a, pos: a.pos.clone().addScaledVector(f, 4.2).addScaledVector(s, (i - 1.5) * 2.3), bot: false }; const T = g.placeTurret(fake, g.cam.yaw + Math.PI, 0, 1); T.owner = null; T.bt = k * T.build; T.life = Infinity; T.frozen = k; g.poseTurret(T, 0.016); return T; });
  g.__brain = g.turretBrain; g.turretBrain = function (T, dt, built) { if (T.frozen != null) { T.bt = T.frozen * T.build; return; } return g.__brain.call(this, T, dt, built); }; });
await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/tourelles-montage.png` });
await p.evaluate(() => { const g = window.__game; for (const T of g.__demo) g.removeTurret(T); g.turretBrain = g.__brain; });
// silhouette de pose
await p.evaluate(() => { const g = window.__game, a = g.player; a.pos.copy(g.__p0); g.cam.yaw = g.__yaw; g.cam.pitch = 0.05; g.__hide = false; a.ch.root.visible = true; document.getElementById('hud').style.visibility = ''; g.carryTurret(a, 1, 1); });
await step(0.5); await p.screenshot({ path: `${out}/tourelles-pose.png` });
await p.evaluate(() => { const g = window.__game; g.dropCarry(g.player, false); });
// 3) combat : une tourelle niveau 3 du joueur contre trois bots adverses qui arrivent
console.log('combat', await p.evaluate(() => { const g = window.__game, a = g.player, T3 = window.__THREE; a.pos.copy(g.__p0); g.cam.yaw = g.__yaw;
  const T = g.placeTurret(a, g.cam.yaw, 2, 1); if (!T) return 'pas posée'; T.bt = 99; a.stats.k = 0;
  const f = new T3.Vector3(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw)); const foes = g.actors.filter((o) => o.bot && o.team !== a.team).slice(0, 3);
  foes.forEach((o, i) => { g.respawn(o); o.respawnT = 1e9; const q = a.pos.clone().addScaledVector(f, 14 + i * 3); q.y = g.world.groundY(q.x, q.z, a.pos.y + 1); o.pos.copy(q); o.ch.root.visible = true; o.ai.target = null; });
  g.__tt = T; return JSON.stringify({ foes: foes.length, hp: foes.map((o) => o.hp) }); }));
await p.waitForTimeout(300);
for (let i = 0; i < 8; i++) { await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 3; i++) g.update(0.05); }); if (i === 3) await p.screenshot({ path: `${out}/tourelles-tir.png` }); }
console.log('combat après', await p.evaluate(() => { const g = window.__game, T = g.__tt; for (let i = 0; i < 160; i++) g.update(0.05);
  return JSON.stringify({ turretAlive: T.alive, turretHp: Math.round(T.hp), level: T.level, kills: g.player.stats.k, galons: g.player.galons, rockets: (g.turretRockets || []).length }); }));
// les bots s'en prennent à une tourelle ennemie (niveau 1, posée par un bot adverse)
console.log('bots contre tourelle', await p.evaluate(() => { const g = window.__game, a = g.player; for (const x of (g.turrets || []).slice()) g.removeTurret(x);
  const foe = g.actors.find((o) => o.bot && o.team !== a.team); g.respawn(foe); foe.respawnT = 1e9; foe.pos.copy(a.pos); foe.yaw = g.cam.yaw; foe.galons = 0;
  const T = g.placeTurret(foe, g.cam.yaw, 0, 1); if (!T) return 'pas posée'; T.bt = 99; T.life = Infinity; foe.alive = false; foe.pos.y -= 50;
  const mates = g.actors.filter((o) => o.bot && o.team === a.team).slice(0, 3); const T3 = window.__THREE; const f = new T3.Vector3(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw));
  mates.forEach((o, i) => { g.respawn(o); o.respawnT = 1e9; const q = T.pos.clone().addScaledVector(f, 12 + i * 2); q.y = g.world.groundY(q.x, q.z, a.pos.y + 1); o.pos.copy(q); o.ch.root.visible = true; o.hp = 1e5; });
  let t = 0; for (; t < 30 * 20 && T.alive; t++) g.update(0.05);
  return JSON.stringify({ destroyed: !T.alive, seconds: t / 20, hpLeft: Math.round(T.hp) }); }));
} // fin des parties 1 à 3
// 4) partie simulée : tout le monde revit, les bots gagnent l'atout en jouant (on accélère : 6 éliminations offertes de temps en temps)
console.log(BASE ? 'référence sans tourelles' : 'partie', await p.evaluate(([simS, BASE]) => { const g = window.__game, a = g.player; a.hp = 1e6; for (const o of g.actors) if (o !== a) { o.respawnT = 0.5; o.ch.root.visible = true; }
  for (const x of (g.turrets || []).slice()) g.removeTurret(x); g.__hide = false;
  let ms = 0, maxMs = 0, n = 0, maxT = 0; const seen = new Set(); let destroyed = 0, kills = 0, levels = [0, 0, 0];
  const dt0 = g.destroyTurret; g.destroyTurret = function (T, by, q) { if (!q) destroyed++; return dt0.call(this, T, by, q); };
  const dmg0 = g.damage; g.damage = function (t, amt, by, o = {}) { const was = t.alive; const r = dmg0.call(this, t, amt, by, o); if (was && !t.alive && o.ico === 'turret') kills++; return r; };
  for (let i = 0; i < simS * 20; i++) {
    if (!BASE && i % 200 === 0) for (const o of g.actors) if (o.bot && o.alive && Math.random() < 0.08 && !o.rewards.includes('tourelle')) { o.rewards.push('tourelle'); o.ai.streakT = Math.random() * 3; o.galons = (o.galons || 0) + Math.random() * 16; }
    const s = performance.now(); g.update(0.05); const d = performance.now() - s; ms += d; maxMs = Math.max(maxMs, d); n++;
    maxT = Math.max(maxT, (g.turrets || []).length); for (const T of g.turrets || []) if (!seen.has(T)) seen.add(T); }
  for (const T of seen) levels[T.level]++;
  return JSON.stringify({ simS, msPerUpdate: (ms / n).toFixed(2), maxMs: maxMs.toFixed(1), cap: g.turretCap(), placed: seen.size, maxAtOnce: maxT, now: (g.turrets || []).length, destroyedInFight: destroyed, turretKills: kills, maxLevelSeen: levels }); }, [+simS, BASE]));
await p.waitForTimeout(500); await p.screenshot({ path: `${out}/tourelles-partie.png` });
await b.close(); })();
