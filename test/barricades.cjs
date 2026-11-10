// Barricades à trois niveaux : rendu des 6 variantes, résistance balles / explosions, galons, renforcement, bots qui posent.
// node test/barricades.cjs URL dossier_captures [secondes_de_simulation]
const { chromium } = require('playwright');
(async () => { const [,, url, out, simS = 240] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/GPU stall|GL Driver|WebGL-/.test(t)) console.log('[c]', t.slice(0, 300)); }); p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(1500);
// 1) règles : galons → niveau, renforcement, dégâts
console.log(await p.evaluate(() => { const g = window.__game, a = g.player; a.hp = 1e6; const R = {}; g.__p0 = a.pos.clone();
  for (const x of g.walls.slice()) g.destroyWall(x);
  a.walls = 3; let w = null; for (let k = 0; k < 16 && !w; k++) w = g.placeWall(a, k * 0.4); R.placed = !!w; R.t0 = w && w.tier;
  R.actBefore = g.wallAction(a, w); g.addGalons(a, 6); R.tierAt6 = a.wallTier; g.addGalons(a, 12); R.tierAt18 = a.wallTier;
  const act = g.wallAction(a, w); g.doWallAction(a, w, act); R.afterUp1 = [w.tier, Math.round(w.hp)]; g.doWallAction(a, w, g.wallAction(a, w)); R.afterUp2 = [w.tier, Math.round(w.hp)];
  const hp0 = w.hp; g.hitWall(w, 100, null); R.bullet100 = Math.round(hp0 - w.hp); const hp1 = w.hp; g.hitWall(w, 100, null, true); R.blast100 = Math.round(hp1 - w.hp);
  R.fix = g.wallAction(a, w)?.kind; g.doWallAction(a, w, g.wallAction(a, w)); R.hpFixed = Math.round(w.hp);
  R.colHz = w.col.hz; R.meshes = w.mesh.children.length; R.cap = g.wallCap();
  for (const x of g.walls.slice()) g.destroyWall(x); return JSON.stringify(R); }));
// 2) rendu : les trois niveaux de chaque camp, alignés devant la caméra (léger à gauche, béton à droite)
await p.evaluate(() => { const g = window.__game, a = g.player; a.hp = 1e6; g.cam.pitch = 0.12; const T = window.__THREE;
  const z = g.zoneState[1]; a.pos.set(z.center[0], g.world.groundY(z.center[0], z.center[1], (z.y ?? 0.17) + 1), z.center[1]);
  for (const o of g.actors) if (o !== a) { o.alive = false; o.respawnT = 1e9; o.ch.root.visible = false; } g.zoneState.forEach((z) => z.g && (z.g.visible = false));
  g.__hide = true; if (!g.__upd) { g.__upd = g.update; g.update = function (dt) { g.__upd.call(g, dt); if (g.__hide) g.player.ch.root.visible = false; }; }
  const e = a.pos.clone(); e.y += 1.6; let best = 0, bl = 0; for (let k = 0; k < 24; k++) { const y = k / 24 * Math.PI * 2; let L = 0; for (let d = 2; d <= 30; d += 2) { const q = e.clone().add(new T.Vector3(Math.sin(y) * d, 0, Math.cos(y) * d)); if (!g.world.los(e, q)) break; L = d; } if (L > bl) { bl = L; best = y; } } g.cam.yaw = best;
  document.getElementById('hud').style.visibility = 'hidden'; });
for (const team of ['civils', 'ordre']) {
  await p.evaluate((team) => { const g = window.__game, a = g.player, T = window.__THREE; const f = new T.Vector3(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw)), s = new T.Vector3(-f.z, 0, f.x);
    g.__demo = [0, 1, 2].map((tier) => { const p = a.pos.clone().addScaledVector(f, 10).addScaledVector(s, (tier - 1) * 4.6); p.y = g.world.groundY(p.x, p.z, a.pos.y + 1);
      const w = { team, owner: null, tier, hp: 999, t: 1, pos: p, yaw: g.cam.yaw + Math.PI, born: g.time, life: Infinity }; g.setWallMesh(w); w.mesh.scale.y = 1; g.world.dynamic.push(w.col); g.walls.push(w); return w; }); }, team);
  await p.waitForTimeout(2000); await p.screenshot({ path: `${out}/barricades-${team}.png` });
  await p.evaluate(() => { const g = window.__game; g.cam.yaw += 0.45; g.cam.pitch = -0.1; });
  await p.waitForTimeout(1000); await p.screenshot({ path: `${out}/barricades-${team}-biais.png` });
  await p.evaluate(() => { const g = window.__game; for (const w of g.__demo) g.destroyWall(w); g.cam.yaw -= 0.45; g.cam.pitch = 0.12; });
}
await p.evaluate(() => { const g = window.__game; for (const o of g.actors) o.respawnT = 0.5; g.zoneState.forEach((z) => z.g && (z.g.visible = true)); g.__hide = false; g.player.ch.root.visible = true; document.getElementById('hud').style.visibility = ''; });
// 3) invite au joueur devant sa barricade
console.log(await p.evaluate(() => { const g = window.__game, a = g.player; a.walls = 3; a.pos.copy(g.__p0); let w = null; const tr = []; for (let k = 0; k < 16 && !w; k++) { g.cam.yaw = k * 0.4; tr.push(g.wallSpot(a, g.cam.yaw).why || "ok"); w = g.placeWall(a, g.cam.yaw); tr.push(!!w); } g.update(0.05); g.updateHud?.(); const nw = g.nearFriendlyWall(a); return JSON.stringify({ w: !!w, near: !!nw, act: nw && g.wallAction(a, nw), dist: w && w.pos.distanceTo(a.pos).toFixed(2), alive: a.alive, prompt: (g.ui.prompt || '').replace(/<[^>]+>/g, ''), mats: document.getElementById('matsN')?.textContent }); }));
await p.waitForTimeout(800); await p.screenshot({ path: `${out}/barricades-invite.png` });
// 4) partie simulée : barricades posées par les bots, plafond, temps de mise à jour
console.log(await p.evaluate(async (simS) => { const g = window.__game; g.player.hp = 1e6; let maxN = 0, maxTeam = 0, ms = 0, maxMs = 0, n = 0; const tiers = [0, 0, 0]; let placedByBots = 0; const seen = new Set();
  for (let i = 0; i < simS * 20; i++) { const s = performance.now(); g.update(0.05); const d = performance.now() - s; ms += d; maxMs = Math.max(maxMs, d); n++;
    maxN = Math.max(maxN, g.walls.length); maxTeam = Math.max(maxTeam, ...['ordre', 'civils'].map((t) => g.walls.filter((w) => w.team === t).length));
    for (const w of g.walls) if (!seen.has(w)) { seen.add(w); if (w.owner?.bot) placedByBots++; } }
  for (const w of g.walls) tiers[w.tier]++;
  const gal = g.actors.map((a) => a.galons || 0).sort((x, y) => y - x);
  return JSON.stringify({ simS, msPerUpdate: (ms / n).toFixed(2), maxMs: maxMs.toFixed(1), cap: g.wallCap(), maxWalls: maxN, maxPerTeam: maxTeam, placedByBots, now: g.walls.length, tiersNow: tiers, topGalons: gal.slice(0, 5), botTiers: [0, 1, 2].map((t) => g.actors.filter((a) => a.bot && (a.wallTier || 0) === t).length), kills: g.actors.reduce((t, a) => t + a.stats.k, 0) }); }, +simS));
await p.waitForTimeout(500); await p.screenshot({ path: `${out}/barricades-partie.png` });
await b.close(); })();
