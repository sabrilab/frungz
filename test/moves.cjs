// Planche des mouvements composés (Mixamo) en situation : node test/moves.cjs URL out.png [instant s] [planche 1|2]
// Chaque perso joue un état (pistolet, rechargement, coup reçu, morts, roulade, glissade, réception, casse, fouille, célébration…)
const { chromium } = require('playwright');
(async () => { const [,, url, out, T = '0.35', sheet = '1'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 640 } });
  p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 2).join(' | ')));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  const r = await p.evaluate(([T, sheet]) => { const g = window.__game, THREE = window.__THREE; for (let i = 0; i < 5; i++) g.update(0.033); g.paused = true;
    const pl = g.player; pl.ch.root.visible = false;
    // zone dégagée : centre d'une zone de capture
    // endroit dégagé : le point (centres de zones, apparitions) le plus loin des murs sur 16 directions
    const cands = [...g.zoneState.map((z) => [z.center[0], z.center[1]]), ...Object.values(g.world.spawns).flat().slice(0, 60).map((s) => [s.x, s.z])];
    let c = null, best = -1; for (const [x, zz] of cands) { const o = new THREE.Vector3(x, g.world.groundY(x, zz) + 1, zz); let m = 30; for (let k = 0; k < 16; k++) { const d = new THREE.Vector3(Math.sin(k * Math.PI / 8), 0, Math.cos(k * Math.PI / 8)); const h = g.world.ray(o, d, 30); m = Math.min(m, h ? h.t : 30); } if (m > best) { best = m; c = new THREE.Vector3(x, o.y - 1, zz); } }
    pl.pos.copy(c); pl.pos.z -= 9;
    document.querySelectorAll('#hud, .hud, #minimap').forEach((e) => (e.style.display = 'none'));
    const S1 = [['pistolet repos', 'P'], ['pistolet course', 'P', 0, 5.5], ['pistolet pas G', 'P', Math.PI / 2, 4], ['recharge', 'R'], ['lancer', 'N'], ['dégainer', 'D'], ['coup reçu', 'H'], ['recul pompe', 'K'], ['accroupi pas D', 'C', -Math.PI / 2, 1.5], ['dérapage', 'S'], ['célèbre', 'F']];
    const S2 = [['mort face', 'XB'], ['mort dos', 'XF'], ['mort côté', 'XL'], ['projeté', 'XFly'], ['mort en course', 'XRun'], ['roulade', 'roll'], ['glissade', 'slide'], ['réception', 'land'], ['casse', 'smash'], ['fouille', 'loot'], ['danse fin', 'dance']];
    const S = sheet === '2' ? S2 : S1; const list = g.actors.filter((a) => a !== pl && a.ch.actions.MX_Idle).slice(0, S.length); const info = [];
    list.forEach((a, i) => { const [nm, mode, dir = 0, sp = 0] = S[i]; a.bot = false; a.alive = true; a.lodHidden = false; a.ch.model.visible = true; a.ch.root.visible = true; a.inCar = null; a.channel = null; a.climb = null; a.rollT = 0; a.slideT = 0; a.overs = null; a.landT = a.stopT = 0; a.prevSp = sp; a.celebrate = undefined; a.marker && (a.marker.visible = false);
      const x = c.x + ((S.length - 1) / 2 - i) * 1.45; a.pos.set(x, g.world.groundY(x, c.z), c.z); a.yaw = Math.PI * 0.92; const ang = a.yaw + dir; a.vel.set(Math.sin(ang) * sp, 0, Math.cos(ang) * sp); a.onGround = true; a.airT = 0; a.crouchK = mode === 'C' ? 1 : 0; a.lastShot = -9;
      if ('PRDHKC'.includes(mode) && mode !== 'K') { a.slots[0] = { id: 'pistol', rarity: 'commun', mag: 12 }; g.equip(a, 0, true); } else { a.slots[1] = { id: mode === 'K' ? 'shotgun' : 'rifle', rarity: 'commun', mag: 30 }; g.equip(a, 1, true); }
      if (mode === 'R') { a.slots[a.cur].mag = 0; g.startReload(a); }
      if (mode === 'N') { a.nades = 2; g.throwNade(a, new THREE.Vector3(Math.sin(a.yaw), 0.3, Math.cos(a.yaw))); }
      if (mode === 'D') g.equip(a, 0);
      if (mode === 'H') { const o = a.pos.clone().add(new THREE.Vector3(Math.sin(a.yaw) * 5, 0, Math.cos(a.yaw) * 5)); g.overlay(a, 'A_HitF', 0.5, { add: true, w: 1.3 }); }
      if (mode === 'K') { a.fireT = 0; g.fire(a, a.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw))); }
      if (mode === 'S') { a.prevSp = 6; a.vel.set(0, 0, 0); }
      if (mode === 'F') g.overlay(a, 'U_FistPump', 1.2, { busy: true });
      if (mode[0] === 'X') { a.alive = false; g.setAnim(a, 'MX_Death' + mode.slice(1), 0.05); }
      if (mode === 'roll') { a.rollT = 0.55; a.rollDir = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)); g.setAnim(a, 'MX_Roll', 0.06, 1.9); }
      if (mode === 'slide') { a.slideT = 0.75; a.slideDir = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)); a.vel.set(a.slideDir.x * 6, 0, a.slideDir.z * 6); }
      if (mode === 'land') a.landT = 0.62;
      if (mode === 'smash') g.startChannel(a, 'casse', 5, () => true, () => {}, 'Punch_Right');
      if (mode === 'loot') g.startChannel(a, 'prise', 5, () => true, () => {}, 'Interact');
      if (mode === 'dance') a.dance = true; });
    const steps = Math.round(+T / 0.016); for (let k = 0; k < steps; k++) { g.time += 0.016; for (const a of list) { if (a.rollT > 0) a.rollT -= 0.016; if (a.slideT > 0) a.slideT -= 0.016; if (a.reloadT > 0) a.reloadT -= 0.016; if (!a.alive) { a.ch.root.position.copy(a.pos); a.ch.root.rotation.y = a.yaw; a.ch.mixer.update(0.016); continue; } g.over = !!a.dance; g.winner = a.team; g.animate(a, 0.016); g.over = false; } }
    g.over = false;
    list.forEach((a, i) => info.push(S[i][0] + ' : ' + a.anim + ' vis=' + a.ch.root.visible + '/' + a.ch.model.visible + ' hips=' + (() => { const v = new THREE.Vector3(); a.ch.bones.Hips.getWorldPosition(v); return v.sub(a.pos).toArray().map((x) => x.toFixed(2)).join(','); })() + (a.overs?.length ? ' + ' + a.overs.map((o) => o.name).join(',') : '')));
    g.camera.fov = 36; g.camera.updateProjectionMatrix(); g.vgun && (g.vgun.visible = false); g.camera.position.set(c.x, c.y + 1.35, c.z - 11.5); g.camera.lookAt(c.x, c.y + 0.9, c.z);
    for (const a of g.actors) if (!list.includes(a) && a !== pl) a.ch.root.visible = false;
    (window.__post || g.renderer).render(g.scene, g.camera); return info; }, [T, sheet]);
  console.log(r.join('\n')); await p.screenshot({ path: out }); await b.close(); })();
