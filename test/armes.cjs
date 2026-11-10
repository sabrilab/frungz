// Contrôle des 19 armes : node test/armes.cjs URL
// pour chaque arme : tir (le chargeur baisse, les rafales font 3 coups), rechargement complet, visée (lunette si arme à lunette),
// arme en main en vue subjective et à l'épaule (bouche du canon trouvée, taille cohérente avec la longueur réelle)
const { chromium } = require('playwright');
(async () => { const [,, url] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  const r = await p.evaluate(() => {
    const g = window.__game, a = g.player, W = window.__WEAPONS, THREE = window.__THREE, out = [];
    a.spawnProt = 0; g.paused = false;
    for (const id of Object.keys(W)) {
      const D = W[id], res = { id, ok: true, pb: [] }; const bad = (m) => { res.ok = false; res.pb.push(m); };
      try {
        a.slots[1] = { id, rarity: 'commun', mag: D.mag }; g.equip(a, 1, true); a.reloadT = 0; a.fireT = 0; a.burstLeft = 0;
        // tir
        const o = a.pos.clone(); o.y += 1.5; const d = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
        let shots = 0; for (let i = 0; i < 400 && a.slots[1].mag > 0; i++) { a.fireT = Math.min(a.fireT, 0); if (g.fire(a, o, d)) shots++; a.fireT -= 0.05; }
        if (shots !== D.mag) bad(`tirs ${shots} pour un chargeur de ${D.mag}`);
        // rechargement
        g.startReload(a); if (!(a.reloadT > 0)) bad('rechargement ne démarre pas');
        for (let i = 0; i < 200 && a.reloadT > 0; i++) g.update(0.033);
        if (a.slots[1].mag !== D.mag) bad(`chargeur après rechargement ${a.slots[1].mag}`);
        // rafale : 3 coups puis pause
        if (D.burst) { a.fireT = 0; a.burstLeft = 0; let n = 0; for (let i = 0; i < 30; i++) { if ((i === 0 || a.burstLeft > 0) && g.fire(a, o, d)) n++; a.fireT -= 0.02; } if (n !== D.burst) bad(`rafale ${n}`); a.slots[1].mag = D.mag; }
        // vue subjective : arme et bouche
        g.cam.fps = true; g.viewGun(); for (let i = 0; i < 15; i++) g.update(0.033);
        const m = new THREE.Vector3(); if (!g.vgun?.userData.muzzle) bad('pas de bouche en vue subjective'); else { g.vgun.userData.muzzle.getWorldPosition(m); if (!isFinite(m.x + m.y + m.z)) bad('bouche invalide'); }
        res.fpsLen = +(g.vgunLen || 0).toFixed(2);
        // visée
        const down = g.input.down; g.input.down = (k) => k === 'aim' || down(k); for (let i = 0; i < 20; i++) g.update(0.033);
        if (!g.aiming) bad('visée inactive'); res.scope = !!(D.scope && g.sc?.was); if (D.scope && !res.scope) bad('lunette absente');
        g.input.down = down; g.update(0.033); g.aiming = false; g.cam.fps = false; g.viewGun(); for (let i = 0; i < 5; i++) g.update(0.033);
        // à l'épaule : arme accrochée à la main, longueur réelle
        const gun = a.ch.gun; if (!gun) bad('pas d’arme en main'); else { gun.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(gun); const L = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z); res.tpsLen = +L.toFixed(2); if (Math.abs(L - D.len) > D.len * 0.35) bad(`longueur à l'épaule ${L.toFixed(2)} pour ${D.len}`); }
      } catch (e) { bad('exception ' + e.message); }
      out.push(res);
    }
    return out;
  });
  for (const x of r) console.log(x.ok ? 'OK ' : 'PB ', x.id.padEnd(15), `fps ${x.fpsLen}  tps ${x.tpsLen}${x.scope ? '  lunette' : ''}`, x.pb.join(' ; '));
  console.log('erreurs', errs.slice(0, 8)); await b.close(); })();
