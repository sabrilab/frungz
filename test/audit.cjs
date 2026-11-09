// audit : partie simulée 50 contre 50, mesures par sous-système + détection d'anomalies
const { chromium } = require('playwright');
(async () => { const [,, url, steps = 2400] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' '))); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('[' + m.type() + '] ' + m.text().slice(0, 200)); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const r = await p.evaluate((steps) => { const g = window.__game; const T = {}, M = {}; const wrap = (name, obj = g, key = name) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const s = performance.now(); const r = f(...a); const d = performance.now() - s; T[key] = (T[key] || 0) + d; M[key] = Math.max(M[key] || 0, d); return r; }; };
  wrap('refreshNav', g.world, 'refreshNav'); wrap('labelNav', g.world, 'labelNav'); wrap('update', g.fx, 'fx'); ['breakVitrine', 'kill', 'respawn', 'throwNade', 'specialDelivery', 'endMatch', 'updateLod', 'updateBot', 'updateActor', 'updateCar', 'cloudEffects', 'updateZones', 'updateShops', 'updateDrops', 'updateCamera', 'drawMinimap', 'updateHud', 'botDecide', 'animate', 'aimSpine', 'smokeBlocks'].forEach((n) => g[n] && wrap(n));
  const wp = g.world.path.bind(g.world); let nPath = 0, tPath = 0, maxPath = 0, nullPath = 0; g.world.path = (...a) => { const s = performance.now(); const r = wp(...a); const d = performance.now() - s; nPath++; tPath += d; maxPath = Math.max(maxPath, d); if (!r) nullPath++; return r; };
  const ws = g.fx.update.bind(g.fx); 
  const pl = g.player; const I = g.input; let maxMs = 0, spikes = 0; const an = { nan: 0, under: 0, oob: 0, stuckBots: 0, inWall: 0 }; const B = g.world.bounds; const lastP = new Map(); const stillT = new Map();
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    // joueur : avance, vise et tire par moments, saute, s'accroupit
    if (Math.sin(i * 0.01) > -0.3) I.keys.add('KeyW'); else I.keys.delete('KeyW'); if (Math.sin(i * 0.023) > 0.5) I.keys.add('KeyD'); else I.keys.delete('KeyD'); if (i % 90 < 20) I.keys.add('Mouse0'); else I.keys.delete('Mouse0'); I.st.locked = true; g.cam.yaw += 0.01 * Math.sin(i * 0.005);
    if (i % 200 === 50) pl.wantJump = 0.15; if (i % 300 === 100) pl.crouch = !pl.crouch;
    const s = performance.now(); g.update(0.05); const d = performance.now() - s; maxMs = Math.max(maxMs, d); if (d > 60) spikes++;
    if (i % 20 === 0) for (const a of g.actors) { if (!a.alive) continue; const P = a.pos;
      if (!isFinite(P.x + P.y + P.z)) an.nan++; if (P.y < -2) an.under++; if (P.x < B.x0 - 2 || P.x > B.x1 + 2 || P.z < B.z0 - 2 || P.z > B.z1 + 2) an.oob++;
      if (a.bot && !a.inCar) { const lp = lastP.get(a); if (lp && lp.distanceTo(P) < 0.3) stillT.set(a, (stillT.get(a) || 0) + 1); else stillT.set(a, 0); lastP.set(a, P.clone()); }
      const [ci, cj] = g.world.cell(P.x, P.z); if (!g.world.free(ci, cj) && a.onGround && P.y < 0.5) an.inWall++; }
  }
  an.stuckBots = [...stillT.values()].filter((v) => v > 15).length;
  const ms = (performance.now() - t0) / steps; const tot = {}; for (const k in T) tot[k] = (T[k] / steps).toFixed(2);
  return { msPerUpdate: ms.toFixed(2), maxMs: maxMs.toFixed(0), spikes, perSys: tot, maxCall: Object.fromEntries(Object.entries(M).map(([k, v]) => [k, v.toFixed(0)])), path: { n: nPath, avg: (tPath / Math.max(1, nPath)).toFixed(2), max: maxPath.toFixed(0), nulls: nullPath }, anomalies: an, score: g.score, kills: g.actors.reduce((s, a) => s + a.stats.k, 0), broken: g.shops.filter((s) => s.broken).length, socles: ['ordre', 'civils'].map((t) => g.socles[t].filter((s) => s.item).length), sold: g.actors.reduce((s, a) => s + (a.cash || 0), 0) | 0, drops: g.drops.length, clouds: g.fx.clouds.length, puffs: g.fx.clouds.reduce((s, c) => s + c.puffs.length, 0), playerAlive: pl.alive, zones: g.zoneState.map((z) => z.id + ':' + z.owner) };
}, +steps);
console.log(JSON.stringify(r, null, 1)); console.log('ERREURS', errs.length, [...new Set(errs)].slice(0, 15).join('\n')); await b.close(); })();
