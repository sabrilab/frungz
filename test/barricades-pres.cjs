// Barricades vues de près : les 6 modèles plein champ, une barricade abîmée, la pose et le renforcement image par image.
// node test/barricades-pres.cjs URL dossier
const { chromium } = require('playwright');
(async () => { const [,, url, out] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/GPU stall|GL Driver|WebGL-/.test(t)) console.log('[c]', t.slice(0, 300)); }); p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(1500);
await p.evaluate(() => { const g = window.__game, a = g.player, T = window.__THREE; a.hp = 1e6;
  for (const o of g.actors) if (o !== a) { o.alive = false; o.respawnT = 1e9; o.ch.root.visible = false; } g.zoneState.forEach((z) => z.g && (z.g.visible = false));
  g.__hide = true; g.__upd = g.update; g.update = function (dt) { g.__upd.call(g, dt); if (g.__hide) g.player.ch.root.visible = false; };
  { const z = g.zoneState[2]; a.pos.set(z.center[0] + 6, 0, z.center[1]); a.pos.y = g.world.groundY(a.pos.x, a.pos.z, (z.y ?? 0.17) + 1); } const e = a.pos.clone(); e.y += 1.6; let best = 0, bl = 0; for (let k = 0; k < 24; k++) { const y = k / 24 * Math.PI * 2; let L = 0; for (let d = 2; d <= 16; d += 2) { const q = e.clone().add(new T.Vector3(Math.sin(y) * d, 0, Math.cos(y) * d)); if (!g.world.los(e, q)) break; L = d; } if (L > bl) { bl = L; best = y; } } g.cam.yaw = best; g.cam.pitch = 0.02;
  document.getElementById('hud').style.visibility = 'hidden';
  g.__mk = (team, tier, dist, dx = 0, yawOff = 0) => { const f = new T.Vector3(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw)), s = new T.Vector3(-f.z, 0, f.x); const p = a.pos.clone().addScaledVector(f, dist).addScaledVector(s, dx); p.y = g.world.groundY(p.x, p.z, a.pos.y + 1);
    const w = { team, owner: null, tier, hp: 0, t: 1, pos: p, yaw: g.cam.yaw + Math.PI + yawOff, born: g.time, life: Infinity }; g.setWallMesh(w); w.hp = 1e9; g.world.dynamic.push(w.col); g.walls.push(w); return w; };
  g.__clear = () => { for (const w of g.walls.slice()) g.destroyWall(w); }; });
for (const team of ['civils', 'ordre']) for (const tier of [0, 1, 2]) {
  await p.evaluate(([team, tier]) => { const g = window.__game; g.__clear(); g.__mk(team, tier, 3.4, 0.9, 0.4); }, [team, tier]);
  await p.waitForTimeout(1600); await p.screenshot({ path: `${out}/pres-${team}-${tier}.png` });
}
// abîmée : béton civil à 25 %
await p.evaluate(() => { const g = window.__game; g.__clear(); const w = g.__mk('civils', 2, 3.4, 0.9, 0.4); w.hp = 1500 * 0.25; for (let k = 0; k < 40; k++) g.updateWalls(0.05); });
await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/pres-abimee.png` });
// pose (chute) puis renforcement, image par image en temps de jeu
await p.evaluate(() => { const g = window.__game; g.__clear(); g.__hide = true; const a = g.player; a.walls = 3; a.wallTier = 2; const w = g.__mk(a.team, 0, 3.4, 0.9, 0.4); w.owner = a; w.hp = 260; w.anim = { k: 'drop', t: 0, vy: 0, y: 0.9 }; g.__w = w; });
for (const [i, dt] of [[1, 0.12], [2, 0.12], [3, 0.4]]) { await p.evaluate((dt) => { const g = window.__game; g.updateWalls(dt); }, dt); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/pose-${i}.png` }); }
await p.evaluate(() => { const g = window.__game, w = g.__w; g.doWallAction(g.player, w, g.wallAction(g.player, w)); g.doWallAction(g.player, w, g.wallAction(g.player, w)); g.updateWalls(0.2); });
await p.waitForTimeout(300); await p.screenshot({ path: `${out}/renfort-1.png` });
await p.evaluate(() => { const g = window.__game; g.updateWalls(0.5); g.updateWalls(0.5); });
await p.waitForTimeout(800); await p.screenshot({ path: `${out}/renfort-2.png` });
console.log(await p.evaluate(() => { const g = window.__game; const w = g.__w; return JSON.stringify({ tier: w.tier, y: (w.mesh.position.y - w.pos.y).toFixed(3), old: (g.wallOld || []).length, children: w.mesh.children.length, tris: w.mesh.children.reduce((t, c) => t + c.geometry.attributes.position.count / 3, 0) }); }));
await b.close(); })();
