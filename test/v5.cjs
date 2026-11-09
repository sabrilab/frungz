// Map v5 : sol en couches (métro), Seine, mobilier cassable, rame ; captures dans le métro
const { chromium } = require('playwright');
(async () => { const [,, url, outDir = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0,4).join(' | ')));
p.on('console', (m) => { const t = m.text(); if (/monde|cassables|Error|error/.test(t)) console.log('[c]', t.slice(0, 300)); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const r = await p.evaluate(() => { const g = window.__game, W = g.world, pl = g.player, out = {};
  out.layers = { escalierBouche: W.groundY(-104.5, -9, 0.5), couloir: W.groundY(-95, 0, -4.8), quai: W.groundY(-80, 12, -7.5), rueAuDessusQuai: W.groundY(-80, 12), voie: W.groundY(-80, 20, -9), quaiBas: W.groundY(30, -126, -4), pont: W.groundY(0, -140) };
  out.solid = { dalle: W.solid(-80, -1, 12), quaiAir: W.solid(-80, -6, 12), rue: W.solid(-80, 1, 12) };
  // lignes de vue : rue → quai à travers la dalle (bloquée), quai → quai (libre)
  const T = window.__THREE; out.los = { rueQuai: W.los(new T.Vector3(-80, 1.6, 12), new T.Vector3(-82, -6.4, 12)), quaiQuai: W.los(new T.Vector3(-95, -6.4, 12), new T.Vector3(-70, -6.4, 12)) };
  // descente des escaliers de la bouche en marchant
  pl.alive = true; g.paused = false; const I = g.input; I.move = () => ({ x: 0, y: -1 });
  pl.pos.set(-104.5, 0, -15); pl.vel.set(0, 0, 0); g.cam.yaw = 0; pl.yaw = 0; const track = [];
  for (let i = 0; i < 160; i++) { g.cam.yaw = 0; g.update(1 / 30); if (i % 20 === 0) track.push([pl.pos.z.toFixed(1), pl.pos.y.toFixed(2)]); }
  out.descente = track; out.finDescente = [pl.pos.x.toFixed(1), pl.pos.y.toFixed(2), pl.pos.z.toFixed(1)];
  I.move = () => ({ x: 0, y: 0 });
  // Seine : on tombe à l'eau et on nage
  pl.pos.set(30, -2, -140); pl.vel.set(0, 0, 0); for (let i = 0; i < 60; i++) g.update(1 / 30); out.nage = { y: pl.pos.y.toFixed(2), swim: pl.swim, hp: pl.hp };
  // mobilier : on casse une poubelle et un DAB
  const C = W.cass; const pb = C.list.find((e) => e.type === 'poubelle'), dab = C.list.find((e) => e.type === 'dab'); const sc0 = g.score.civils, drops0 = g.drops.length;
  C.damage(pb, 999, { x: 1, y: 0, z: 0 }, pl); C.damage(dab, 999, { x: 0, y: 0, z: 1 }, pl);
  out.casse = { poubelle: pb.broken, colOff: pb.cols.every((c) => c.off), dab: dab.broken, butinAuSol: g.drops.length - drops0, scoreCivils: g.score.civils - sc0, team: pl.team };
  for (let i = 0; i < 30; i++) g.update(1 / 30);
  // rame : position au fil du temps, et un bot sur la voie
  const M = W.metro; const xs = []; for (let k = 0; k < 8; k++) { g.time = k * 7.5; M.update(g.time, 0.1); xs.push([g.time, M.s.toFixed(1), M.cars[1].n.position.x.toFixed(1), M.cars[1].n.position.z.toFixed(1)]); }
  out.rame = xs;
  const bot = g.actors.find((a) => a.bot && a.alive); bot.pos.set(-40, -9.2, 24.45); bot.vel.set(0, 0, 0); bot.ai.think = 99; let killed = false;
  g.time = 8; for (let i = 0; i < 300 && !killed; i++) { bot.pos.set(-40, -9.2, 24.45); g.time += 1 / 30; g.updateMetro(1 / 30); if (!bot.alive) killed = true; }
  out.metroTue = killed;
  // caméra sur le quai pour la capture
  pl.alive = true; pl.hp = 100; pl.pos.set(-92, -8, 12); pl.vel.set(0, 0, 0); g.cam.yaw = Math.PI / 2 + 0.5; g.cam.pitch = 0.05; g.time = 2; for (let i = 0; i < 5; i++) g.update(1 / 30);
  return JSON.stringify(out, null, 1); });
console.log(r); await p.screenshot({ path: outDir + '/v5-quai.png' });
await p.evaluate(() => { const g = window.__game, pl = g.player; pl.pos.set(-60, 0.17, -2); g.cam.yaw = -2.3; g.cam.pitch = -0.15; for (let i = 0; i < 5; i++) g.update(1 / 30); });
await p.screenshot({ path: outDir + '/v5-rue.png' }); await b.close(); })();
