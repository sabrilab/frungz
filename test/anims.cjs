// Planche des animations de déplacement (Mixamo) : node test/anims.cjs URL out.png [temps]
const { chromium } = require('playwright');
(async () => { const [,, url, out, T = '0.4', yawCam = '0'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 700 } });
  p.on('pageerror', (e) => console.log('[err]', e.message)); p.on('console', (m) => { if (/err|warn/i.test(m.type())) console.log('[c]', m.text().slice(0, 200)); });
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  const r = await p.evaluate(([T, yc]) => { const g = window.__game; for (let i = 0; i < 10; i++) g.update(0.033); g.paused = true;
    const pl = g.player; const z = g.zoneState[+(window.__Z || 0)]; const base = new window.__THREE.Vector3(z.center[0], g.world.groundY(z.center[0], z.center[1]), z.center[1] - 8); pl.ch.root.visible = false;
    const S = [['repos', 0, 0], ['course', 0, 5.5], ['marche visée', 0, 2], ['pas gauche', Math.PI / 2, 5], ['pas droite', -Math.PI / 2, 5], ['diag av-g', Math.PI / 4, 5], ['arrière', Math.PI, 4.5], ['accroupi', 0, 1.5, 'c'], ['saut', 0, 4, 'j'], ['chute', 0, 4, 'f'], ['glissade', 0, 6, 's']];
    const list = g.actors.filter((a) => a !== pl).slice(0, S.length); const info = [];
    list.forEach((a, i) => { const [nm, dir, sp, mode] = S[i]; a.bot = false; a.alive = true; a.lodHidden = false; a.ch.model.visible = true; a.ch.root.visible = true; a.inCar = null; a.channel = null; a.climb = null; a.rollT = 0;
      a.pos.set(base.x + (i - S.length / 2) * 1.6, g.world.groundY(base.x + (i - S.length / 2) * 1.6, base.z + 8), base.z + 8); a.yaw = Math.PI; const ang = a.yaw + dir; a.vel.set(Math.sin(ang) * sp, 0, Math.cos(ang) * sp);
      a.onGround = mode !== 'j' && mode !== 'f'; if (mode === 'j') a.vel.y = 5; if (mode === 'f') a.vel.y = -4; a.crouchK = mode === 'c' ? 1 : 0; a.slideT = mode === 's' ? 0.6 : 0; if (mode === 's') a.slideDir = new window.__THREE.Vector3(0, 0, -1); a.airT = 0; a.lastShot = nm === 'marche visée' ? 1e9 : -9; });
    const steps = Math.round(+T / 0.016); for (let k = 0; k < steps; k++) { g.time += 0.016; for (const a of list) { a.airT = a.onGround ? 0 : a.airT; g.animate(a, 0.016); if (!a.onGround) a.airT += 0; } }
    list.forEach((a, i) => info.push(S[i][0] + ':' + a.anim + (a.loco ? ' ' + [...a.loco.acts].map((n) => n.replace('MX_', '') + '=' + a.ch.actions[n].getEffectiveWeight().toFixed(2)).join(',') : '')));
    const c = base.clone(); c.z += 8; g.camera.fov = 38; g.camera.updateProjectionMatrix(); g.camera.position.set(c.x + Math.sin(+yc) * 13, c.y + 1.4, c.z - Math.cos(+yc) * 13); g.camera.lookAt(c.x, c.y + 0.9, c.z); (window.__post || g.renderer).render(g.scene, g.camera); return info; }, [T, yawCam]);
  console.log(r.join('\n')); await p.screenshot({ path: out }); await b.close(); })();
