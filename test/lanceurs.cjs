// Lanceurs : node test/lanceurs.cjs URL [dossier-captures]
// tir réel du joueur sur un ennemi, puis une roquette et un obus sur chaque élément du décor : voiture, mobilier, vitrine, barricade.
// Vérifie que l'explosion a lieu, que la cible prend des dégâts ou casse, et qu'une trace de brûlure reste. Captures en vue subjective et à l'épaule.
const { chromium } = require('playwright');
(async () => {
  const [,, url, shots] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  const r = await p.evaluate(() => {
    const g = window.__game, a = g.player, W = window.__WEAPONS, T = window.__THREE, out = [];
    const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
    a.spawnProt = 0; g.paused = false;
    const pb0 = g.projBoom; g.projBoom = function (s, n) { g._lb = { p: s.pos.clone(), col: s.col ? Object.keys(s.col).join(',') : null, direct: !!s.direct, car: !!s.car }; return pb0.call(this, s, n); };
    const run = (n = 200) => { for (let i = 0; i < n && g.projs?.length; i++) g.update(0.033); };
    // projectile tiré à 5 m de la cible, en direction de son centre
    const shoot = (id, at) => { const D = W[id]; const from = at.clone().add(V(4, 1.2, 3)); const d = at.clone().sub(from).normalize(); g.launchProj(a, D, 1, from, from, d); run(); };
    for (const id of ['lance_roquettes', 'lance_patates']) {
      const res = { id, pb: [] }; const bad = (m) => res.pb.push(m);
      try {
        a.slots[1] = { id, rarity: 'commun', mag: W[id].mag }; g.equip(a, 1, true); a.reloadT = 0; a.fireT = 0;
        // tir réel sur un ennemi posé à 9 m devant
        const foe = g.actors.find((t) => t.bot && t.alive && t.team !== a.team); const f = V(Math.sin(a.yaw), 0, Math.cos(a.yaw));
        foe.pos.copy(a.pos).addScaledVector(f, 9); foe.vel.set(0, 0, 0); foe.hp = 100; foe.armor = 0; foe.spawnProt = 0; foe.ai.task = null;
        const o = a.pos.clone().add(V(0, 1.5, 0)), aim = foe.pos.clone().add(V(0, 1, 0)).sub(o).normalize();
        const sc0 = g.scorches?.length || 0;
        if (!g.fire(a, o, aim)) bad('tir refusé'); if (!g.projs?.length) bad('pas de projectile');
        run(); res.foe = foe.alive ? Math.round(foe.hp) : 'mort'; if (foe.alive && foe.hp >= 100) bad('ennemi indemne');
        if ((g.scorches?.length || 0) <= sc0) bad('pas de trace de brûlure');
        // voiture
        const car = g.cars.find((c) => !c.dead && !c.kind && !c.driver); if (car) { const h0 = car.hp; shoot(id, car.pos.clone().add(V(0, 0.6, 0))); res.car = `${h0}→${car.dead ? 'détruite' : Math.round(car.hp)}`; if (!car.dead && car.hp >= h0) bad('voiture intacte'); }
        // mobilier
        const cs = g.world.cass?.list.filter((e) => !e.broken) || []; const e = cs[(cs.length / 2) | 0]; if (e) { const pv0 = e.pv; shoot(id, e.pos.clone().add(V(0, 0.5, 0))); res.mobilier = `${e.type} ${pv0}→${e.broken ? 'cassé' : Math.round(e.pv)}`; if (!e.broken && e.pv >= pv0) bad('mobilier intact ' + (e.type || '')); }
        // vitrine
        const clear = (x) => { const from = x.front.clone().addScaledVector(V(x.n.x, 0, x.n.z), 5); from.y = x.centre.y; const d = x.centre.clone().sub(from); const h = g.world.ray(from, d.clone().normalize(), d.length() + 1); return h?.c?.vit === x; };
        const v = g.shops.flatMap((s) => s.vits).find((x) => !x.broken && clear(x)); if (v) { const from = v.front.clone().addScaledVector(V(v.n.x, 0, v.n.z), 5); from.y = v.centre.y; g.launchProj(a, W[id], 1, from, from, v.centre.clone().sub(from).normalize()); run(); res.vitrine = v.broken ? 'cassée' : 'intacte'; res.vitBoom = { d: +g._lb.p.distanceTo(v.centre).toFixed(2), col: g._lb.col, direct: g._lb.direct, car: g._lb.car, hp: v.hp }; if (!v.broken) bad('vitrine intacte'); }
        // barricade ennemie posée devant
        const team0 = a.team; a.team = team0 === 'ordre' ? 'civils' : 'ordre'; a.walls = 3; const w = g.placeWall(a, a.yaw); a.team = team0;
        const wall = g.walls[g.walls.length - 1]; if (wall) { const h0 = wall.hp; shoot(id, wall.pos.clone().add(V(0, 1, 0))); res.barricade = `${Math.round(h0)}→${g.walls.includes(wall) ? Math.round(wall.hp) : 'détruite'}`; if (g.walls.includes(wall) && wall.hp >= h0) bad('barricade intacte'); } else res.barricade = 'pas posée';
        res.scorch = g.scorches?.length || 0;
      } catch (err) { bad('exception ' + err.message); }
      out.push(res);
    }
    return out;
  });
  for (const x of r) console.log(x.pb.length ? 'PB ' : 'OK ', JSON.stringify(x));
  if (shots) {
    for (const [id, fps] of [['lance_roquettes', true], ['lance_roquettes', false], ['lance_patates', true], ['lance_patates', false]]) {
      await p.evaluate(([id, fps]) => { const g = window.__game, a = g.player; a.slots[1] = { id, rarity: 'commun', mag: window.__WEAPONS[id].mag }; g.equip(a, 1, true); g.cam.fps = fps; g.viewGun(); for (let i = 0; i < 20; i++) g.update(0.033); }, [id, fps]);
      await p.waitForTimeout(800); await p.screenshot({ path: `${shots}/${id}-${fps ? 'fps' : 'tps'}.png` });
    }
    // explosion en cours, vue à l'épaule
    await p.evaluate(() => { const g = window.__game, a = g.player, T = window.__THREE; a.slots[1] = { id: 'lance_roquettes', rarity: 'commun', mag: 1 }; g.equip(a, 1, true); g.cam.fps = false; g.viewGun(); const o = a.pos.clone().add(new T.Vector3(0, 1.5, 0)); const d = new T.Vector3(Math.sin(a.yaw), -0.08, Math.cos(a.yaw)).normalize(); a.fireT = 0; a.reloadT = 0; g.fire(a, o, d); for (let i = 0; i < 12; i++) g.update(0.033); });
    await p.waitForTimeout(300); await p.screenshot({ path: `${shots}/explosion.png` });
  }
  console.log('erreurs', errs.slice(0, 8)); await b.close();
})();
