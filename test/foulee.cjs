// Foulée : node test/foulee.cjs URL — le joueur part de l'arrêt (marche puis sprint) ; on mesure la montée en vitesse, la cadence des pas et la glisse du pied d'appui.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(process.argv[2]); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  const out = await p.evaluate(() => { const g = window.__game, THREE = window.__THREE, a = g.player, V = () => new THREE.Vector3(); for (let i = 0; i < 5; i++) g.update(0.033); g.paused = true;
    for (const o of g.actors) if (o !== a) { o.alive = false; o.gone = true; o.ch.root.visible = false; }
    const res = {};
    for (const sc of ['marche', 'sprint']) { const c = g.zoneState[0].center; a.pos.set(c[0], g.world.groundY(c[0], c[1]), c[1]); a.vel.set(0, 0, 0); a.yaw = 0; a.momentum = 0; a.onGround = true; g.aiming = false;
      // direction la plus dégagée
      let bestD = 0, bestY = 0; for (let k = 0; k < 16; k++) { const d = V().set(Math.sin(k * Math.PI / 8), 0, Math.cos(k * Math.PI / 8)); const h = g.world.ray(a.pos.clone().add(V().set(0, 1, 0)), d, 60); const m = h ? h.t : 60; if (m > bestD) { bestD = m; bestY = k * Math.PI / 8; } } a.yaw = bestY;
      const dt = 1 / 60, F = [a.ch.bones.FootL, a.ch.bones.FootR], prev = [null, null]; let fwd = 0, t = 0, t90 = null, slide = 0, slideN = 0, slideMax = 0, cyc = 0, lastPh = 0, tCyc = 0, top = 0; const minY = [9, 9];
      for (let i = 0; i < 60 * 3.2 && bestD > 8; i++) { t += dt; g.time += dt; a.wish = V().set(Math.sin(a.yaw), 0, Math.cos(a.yaw)); a.wantSprint = sc === 'sprint'; a.hp = 100; g.updateActor(a, dt); a.ch.root.updateMatrixWorld(true);
        const sp = Math.hypot(a.vel.x, a.vel.z); top = Math.max(top, sp);
        for (let f = 0; f < 2; f++) { const w = F[f].getWorldPosition(V()); const h = w.y - a.pos.y; minY[f] = Math.min(minY[f], h);
          if (prev[f] && t > 1.6 && h < minY[f] + 0.025) { const v = Math.hypot(w.x - prev[f].x, w.z - prev[f].z) / dt; slide += v; slideN++; slideMax = Math.max(slideMax, v); const fw = ((w.x - prev[f].x) * Math.sin(a.yaw) + (w.z - prev[f].z) * Math.cos(a.yaw)) / dt; fwd += fw; } prev[f] = w; }
        if (t > 1.6) { const ph = a.loco.phase; if (ph < lastPh) cyc++; lastPh = ph; tCyc += dt; }
        if (t90 === null && sp > 0.9 * (sc === 'sprint' ? 6.6 : 4.4)) t90 = t; }
      res[sc] = { vitesse: +top.toFixed(2), 'temps pour 90 %': t90 && +t90.toFixed(2), 'pas par seconde': +(cyc * 2 / tCyc).toFixed(2), 'glisse du pied d\'appui (m/s)': +(slide / Math.max(1, slideN)).toFixed(2), 'glisse max': +slideMax.toFixed(2), 'dérive vers l\'avant': +(fwd / Math.max(1, slideN)).toFixed(2), appuis: slideN, degage: +bestD.toFixed(0) }; }
    return res; });
  console.log(JSON.stringify(out, null, 1)); await b.close(); })();
