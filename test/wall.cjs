// un bot doit contourner (ou casser) une barricade posée sur son trajet : node test/wall.cjs URL
const { chromium } = require('playwright');
(async () => { const [,, url] = process.argv; const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('[err]', e.message));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const r = await p.evaluate(() => { const g = window.__game, T = window.__THREE; const out = [];
  for (let trial = 0; trial < 4; trial++) {
    const bot = g.actors.find((a) => a.bot && a.team !== g.player.team && a.alive); for (const a of g.actors) if (a !== bot && a.bot) { a.alive = false; a.ch.root.visible = false; a.respawnT = 999; }
    const z = g.zoneState[trial % g.zoneState.length]; const [x, zz] = g.world.randomFree(z.center[0], z.center[1], 6);
    bot.pos.set(x, g.world.groundY(x, zz), zz); const ang = Math.random() * 6.28; const goal = new T.Vector3(x + Math.sin(ang) * 18, 0, zz + Math.cos(ang) * 18); const [gx, gz] = g.world.nearestFree(...g.world.cell(goal.x, goal.z)); const B = g.world.bounds, S = g.world.nav.S; goal.set(B.x0 + (gx + .5) * S, 0, B.z0 + (gz + .5) * S);
    // barricade du joueur (ennemi du bot) posée 3 m devant le bot, face à lui
    const pl = g.player; pl.pos.set(x + Math.sin(ang) * 0.6, bot.pos.y, zz + Math.cos(ang) * 0.6); g.cam.yaw = ang; pl.walls = 3; pl.alive = true; pl.inCar = null; g.placeWall(pl); const placed = g.walls.length; pl.pos.set(x - 30, bot.pos.y, zz - 30); pl.alive = false; pl.respawnT = 999;
    bot.ai.target = null; bot.ai.think = 999; g.pathBudget = 5; g.botGo(bot, { kind: 'test' }, goal); bot.ai.think = 999;
    let t = 0; for (; t < 30; t += 0.05) { g.pathBudget = 4; bot.ai.think = 999; if (!bot.ai.path && !(bot.ai.backT > 0)) g.botGo(bot, { kind: 'test' }, goal), bot.ai.think = 999; g.update(0.05); if (Math.hypot(bot.pos.x - goal.x, bot.pos.z - goal.z) < 1.5) break; }
    out.push(`essai ${trial}: ${t < 30 ? 'arrivé en ' + t.toFixed(1) + ' s' : 'BLOQUÉ à ' + Math.hypot(bot.pos.x - goal.x, bot.pos.z - goal.z).toFixed(1) + ' m'} · posés ${placed} restants ${g.walls.length} dégâts ${g.walls[0] ? 260 - g.walls[0].hp : "-"}`);
    for (const w of [...g.walls]) g.destroyWall(w);
  }
  return out.join('\n'); }); console.log(r); await b.close(); })();
