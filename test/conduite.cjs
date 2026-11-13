// Conduite (src/conduite.js) : barrages, bonus, nitro, frottement contre un mur, saut en marche et voiture lancée sur une cible.
// node test/conduite.cjs "http://localhost:8124/?map=paris" dossier
const { chromium } = require('playwright');
(async () => { const [,, url, dir = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  let errs = 0; p.on('pageerror', (e) => { errs++; console.log('[err]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); });
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 900000 }); await p.evaluate(() => window.__start());
  const shot = async (name) => { await p.evaluate(() => { const g = window.__game; (window.__post || g.renderer).render(g.scene, g.camera); }); await p.screenshot({ path: `${dir}/${name}.png` }); };
  // commandes simulées
  console.log(await p.evaluate(() => { const g = window.__game, I = g.input; window.__mv = { x: 0, y: 0 }; window.__keys = new Set(); window.__press = new Set();
    I.move = () => window.__mv; const d0 = I.down.bind(I), p0 = I.pressed.bind(I); I.down = (k) => window.__keys.has(k) || d0(k); I.pressed = (k) => { if (window.__press.has(k)) { window.__press.delete(k); return true; } return p0(k); }; I.st.locked = true;
    for (let i = 0; i < 10; i++) g.update(1 / 30); g.paused = true;
    return JSON.stringify({ barrages: g.barrages?.exits.length || 0, exits: (g.barrages?.exits || []).map((e) => `${e.e.ax}=${e.e.v}:${e.t0.toFixed(0)}..${e.t1.toFixed(0)}`).join(' '), bonus: g.bonus?.length, spots: g.bonusSpots?.length, kinds: (g.bonus || []).map((x) => x.kind).join(',') }); }));
  const step = (n, fn = '') => p.evaluate(({ n, fn }) => { const g = window.__game, pl = g.player, c = window.__c; const f = new Function('g', 'c', 'pl', 'i', fn);
    g.paused = false; for (let i = 0; i < n; i++) { f(g, c, pl, i); g.update(1 / 30); } g.paused = true;
    const L = c?.launch; return JSON.stringify({ sp: c ? +(c.speed * 3.6).toFixed(0) : 0, nitro: c ? +(c.nitro || 0).toFixed(2) : 0, hp: c ? Math.round(c.hp) : 0, dead: c?.dead > 0, in: pl.inCar === c, bail: pl.bail ? pl.bail.clip + ' ' + pl.bail.t.toFixed(1) : null, php: Math.round(pl.hp), pos: [pl.pos.x, pl.pos.y, pl.pos.z].map((v) => +v.toFixed(1)), launch: L ? { t: +L.t.toFixed(1), target: L.target?.name } : null, act: pl.bail ? (() => { const A = pl.ch.actions[pl.bail.clip]; const o = Object.entries(pl.ch.actions).filter(([k, x]) => x !== A && x.getEffectiveWeight() > 0.05).map(([k, x]) => k + ':' + x.getEffectiveWeight().toFixed(2)).join(' '); return [A.time.toFixed(2), A.getEffectiveWeight().toFixed(2), A.isRunning(), A.paused, o].join(' '); })() : null }); }, { n, fn });
  // 1) une voiture sur une longue ligne droite libre : on cherche le plus long couloir dégagé (vers le nord ou le sud)
  await p.evaluate((z) => { window.__zone = z; }, (process.env.ZONE || '').split(',').filter(Boolean).map(Number));
  console.log('départ', await p.evaluate(() => { const g = window.__game, W = g.world, pl = g.player, B = W.bounds; const V = pl.pos.constructor; let best = null;
    const zone = window.__zone || []; for (const s of g.bonusSpots) { if (zone.length === 4 && (s[0] < zone[0] || s[0] > zone[1] || s[2] < zone[2] || s[2] > zone[3])) continue; for (const yaw of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) { const dx = Math.sin(yaw), dz = Math.cos(yaw); let L = 0; const q = new V();
      for (; L < 90; L += 2) { const x = s[0] + dx * L, z = s[2] + dz * L; q.set(x, 0, z); W.pushOut(q, 1.6, 0.2); if (Math.hypot(q.x - x, q.z - z) > 0.01 || Math.abs(W.groundY(x, z, 1)) > 0.3) break; }
      if (!best || L > best.L) best = { s, yaw, L }; } }
    const c = g.cars.find((c) => !c.kind && !c.flipped && c.def.classe === 'sport') || g.cars.find((c) => !c.kind && !c.flipped); window.__c = c; window.__line = best;
    c.pos.set(best.s[0], best.s[1], best.s[2]); c.yaw = best.yaw; c.vel = null; c.speed = 0; g.syncCar(c); pl.pos.copy(c.pos); g.enterCar(pl, c); g.cam.yaw = c.yaw; g.cam.carYaw = c.yaw;
    for (const a of g.actors) if (a.bot && a.pos.distanceTo(c.pos) < 120) a.pos.x += 400; // pas de passants sur la ligne
    return JSON.stringify({ car: c.def.nom, classe: c.def.classe, max: c.max, line: best.L }); }));
  console.log('accélération 3 s', await step(90, "window.__mv = { x: 0, y: -1 }"));
  await shot('1-route');
  console.log('nitro 1,5 s', await step(45, "window.__keys = new Set(['sprint']); window.__mv = { x: 0, y: -1 }"));
  await shot('2-nitro');
  // 2) bonus posé devant la voiture
  console.log('bonus', await p.evaluate(() => { const g = window.__game, c = window.__c; const b = g.bonus[0]; const f = new c.pos.constructor(Math.sin(c.yaw), 0, Math.cos(c.yaw)); b.pos.copy(c.pos).addScaledVector(f, 9); b.pos.y = g.world.groundY(b.pos.x, b.pos.z, 1); b.m.position.copy(b.pos); c.nitro = 0.2; c.hp = 100; window.__bk = b.kind; return b.kind; }));
  console.log(' après passage', await step(25, "window.__keys = new Set(); window.__mv = { x: 0, y: 0 }; window.__keys.add('jump')"), await p.evaluate(() => window.__bk));
  // 3) saut en marche face à une cible : un adversaire 45 m devant
  console.log('cible', await p.evaluate(() => { const g = window.__game, c = window.__c, pl = g.player; const V = pl.pos.constructor;
    const L = window.__line; const f = new V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    // on recule la voiture au début de la ligne, lancée à 75 km/h
    c.pos.set(L.s[0], L.s[1], L.s[2]); c.yaw = L.yaw; c.vel = new V(Math.sin(c.yaw), 0, Math.cos(c.yaw)).multiplyScalar(21); c.speed = 21; c.hp = c.maxHp; g.syncCar(c);
    const foe = g.actors.find((a) => a.bot && a.alive && a.team !== pl.team); foe.pos.copy(c.pos).addScaledVector(new V(Math.sin(L.yaw), 0, Math.cos(L.yaw)), 50); foe.pos.y = g.world.groundY(foe.pos.x, foe.pos.z, 1); foe.ai.think = 9; foe.hp = 100; foe.armor = 0; window.__foe = foe;
    g.cam.yaw = c.yaw; g.cam.pitch = -0.1; g.paused = false; for (let i = 0; i < 6; i++) g.update(1 / 30); g.paused = true; return JSON.stringify({ foe: foe.name, d: foe.pos.distanceTo(c.pos).toFixed(0), tgt: g._tgt?.name || null }); }));
  await shot('3-cible');
  console.log('saut', await step(1, "window.__press.add('car'); window.__mv = { x: 0, y: -1 }"));
  for (let k = 0; k < 8; k++) { console.log(' chute', await step(k < 4 ? 5 : 10, "window.__mv = { x: 0, y: 0 }"), await p.evaluate(() => { const f = window.__foe; return `cible ${f.alive ? Math.round(f.hp) + ' pv' : 'éliminée'} à ${f.pos.distanceTo(window.__c.pos).toFixed(0)} m`; }));
    await p.evaluate(() => { const g = window.__game, a = g.player, V = a.pos.constructor; const y = a.bail ? a.bail.dir : a.yaw; const sd = new V(Math.cos(y), 0, -Math.sin(y)); window.__camSave = g.camera.position.clone(); g.camera.position.copy(a.pos).addScaledVector(sd, -4.2).add(new V(0, 1.3, 0)); g.camera.lookAt(a.pos.x, a.pos.y + 0.6, a.pos.z); });
    await p.screenshot({ path: `${dir}/4-cote-${k}.png` }).catch(() => {}); await p.evaluate(() => { const g = window.__game; (window.__post || g.renderer).render(g.scene, g.camera); }); await p.screenshot({ path: `${dir}/4-cote-${k}.png` }); await shot('4-saut-' + k); }
  console.log(' fin', await step(60, "window.__mv = { x: 0, y: 0 }"), await p.evaluate(() => { const g = window.__game, f = window.__foe; return `cible ${f.alive ? 'vivante' : 'éliminée'} · kills ${g.player.stats.k}`; }));
  await shot('5-apres');
  // 4) frottement contre un mur : on longe une façade à 10° en roulant à 60 km/h
  console.log('mur', await p.evaluate(() => { const g = window.__game, W = g.world, pl = g.player, V = pl.pos.constructor; const c = window.__c.dead ? g.cars.find((x) => !x.kind && !x.dead && !x.flipped && !x.driver) : window.__c; window.__c = c;
    // un îlot (bâtiment) : on part à 2 m de son bord, cap presque parallèle
    const ilot = W.colliders.find((k) => k.type === 'poly' && k.tag === 'ilot' && k.poly.length >= 4); const [a, b] = [ilot.poly[0], ilot.poly[1]]; const ux = b[0] - a[0], uz = b[1] - a[1], Lw = Math.hypot(ux, uz);
    const mx = a[0] + ux * 0.2, mz = a[1] + uz * 0.2; let nx = -uz / Lw, nz = ux / Lw; const { pointInPoly } = { pointInPoly: (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; } };
    if (pointInPoly(mx + nx * 2, mz + nz * 2, ilot.poly)) { nx = -nx; nz = -nz; }
    const yaw = Math.atan2(ux, uz) - Math.sign(nx * uz - nz * ux || 1) * 0.17; if (pl.inCar) g.exitCar(pl, true); pl.bail = null;
    c.pos.set(mx + nx * 2.2, 0, mz + nz * 2.2); c.pos.y = W.groundY(c.pos.x, c.pos.z, 1); c.yaw = yaw; c.vel = new V(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(17); c.speed = 17; c.hp = c.maxHp; g.syncCar(c); pl.alive = true; pl.pos.copy(c.pos); g.enterCar(pl, c); g.cam.yaw = yaw;
    return 'mur ' + ilot.id + ' long ' + Lw.toFixed(0); }));
  for (let k = 0; k < 4; k++) console.log(' le long du mur', await step(10, "window.__mv = { x: 0, y: -1 }"));
  // 5) barrage le plus proche : vue de la chaussée
  const bar = await p.evaluate(() => { const g = window.__game, B = g.barrages; if (!B?.exits.length) return null; const e = B.exits[0]; const mid = (e.t0 + e.t1) / 2;
    const at = (d) => e.e.ax === 'x' ? [e.e.v + e.e.n * d, mid] : [mid, e.e.v + e.e.n * d]; return [at(18), at(0)]; });
  if (bar) { await p.evaluate((bar) => { const g = window.__game; const pl = g.player; if (pl.inCar) g.exitCar(pl, true); g.paused = true; g.camera.position.set(bar[0][0] + 1.5, 1.7, bar[0][1] + 1.5); g.camera.lookAt(bar[1][0], 0.9, bar[1][1]); g.followShadow?.(g.camera.position); }, bar); await shot('6-barrage'); }
  console.log('erreurs', errs); await b.close(); })();
