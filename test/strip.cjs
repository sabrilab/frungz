// Pellicule : node strip.cjs URL out.png scenario [n images] [pas s] [vue: side|front|34]
// Un perso joue un scénario ; on capture n instants côte à côte.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [,, url, out, scen = 'run', N = '8', STEP = '0.08', view = 'side'] = process.argv; const b = await chromium.launch(); const W = 300, H = 420, n = +N;
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  await p.evaluate((scen) => { const g = window.__game, THREE = window.__THREE; for (let i = 0; i < 5; i++) g.update(0.033); g.paused = true;
    const pl = g.player; const cv = g.renderer.domElement; document.querySelectorAll('body *').forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.display = 'none'; });
    const cands = [...g.zoneState.map((z) => [z.center[0], z.center[1]]), ...Object.values(g.world.spawns).flat().slice(0, 60).map((s) => [s.x, s.z])];
    let c = null, best = -1; for (const [x, zz] of cands) { const o = new THREE.Vector3(x, g.world.groundY(x, zz) + 1, zz); let m = 30; for (let k = 0; k < 16; k++) { const d = new THREE.Vector3(Math.sin(k * Math.PI / 8), 0, Math.cos(k * Math.PI / 8)); const h = g.world.ray(o, d, 30); m = Math.min(m, h ? h.t : 30); } if (m > best) { best = m; c = new THREE.Vector3(x, o.y - 1, zz); } }
    for (const a of g.actors) if (a !== pl) { a.ch.root.visible = false; a.alive = false; a.gone = true; }
    pl.pos.copy(c); pl.vel.set(0, 0, 0); pl.yaw = 0; pl.onGround = true; pl.hp = 100; g.vgun && (g.vgun.visible = false);
    window.__S = { c, t: 0, scen }; }, scen);
  const shots = [];
  for (let i = 0; i < n; i++) {
    await p.evaluate(([dtTot, view]) => { const g = window.__game, THREE = window.__THREE, a = g.player, S = window.__S; const dt = 1 / 60;
      for (let k = 0; k < Math.round(dtTot / dt); k++) { S.t += dt; g.time += dt; const t = S.t; a.wish = a.wish || new THREE.Vector3(); a.wish.set(0, 0, 0); a.wantSprint = false; g.aiming = false;
        const sc = S.scen;
        if (sc === 'run') { a.wish.set(0, 0, 1); a.wantSprint = true; }
        if (sc === 'walk') { a.wish.set(0, 0, 1); }
        if (sc === 'idle') { }
        if (sc === 'startstop') { if (t < 0.9) { a.wish.set(0, 0, 1); a.wantSprint = true; } }
        if (sc === 'turn') { a.wish.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)); a.wantSprint = true; if (t > 0.5) a.yaw += dt * 3.2; }
        if (sc === 'strafe') { a.wish.set(t < 0.7 ? 1 : -1, 0, 0); g.aiming = true; }
        if (sc === 'jump') { a.wish.set(0, 0, 1); a.wantSprint = true; if (t > 0.3 && t < 0.33) a.wantJump = 0.1; }
        if (sc === 'slide') { a.wish.set(0, 0, 1); a.wantSprint = true; if (t > 0.4 && t < 0.43) a.wantCrouch = 0.1; }
        if (sc === 'roll') { a.wish.set(0, 0, 1); if (t > 0.3 && t < 0.33) a.wantCrouch = 0.1; }
        if (sc === 'fire') { g.aiming = true; if (t > 0.3) { a.slots[a.cur].mag = 30; g.fire(a, a.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw))); } }
        if (sc === 'hit') { if (Math.abs(t - 0.3) < dt / 2) g.damage(a, 20, null, { dir: new THREE.Vector3(1, 0, 0) }); }
        if (sc === 'aimup') { g.aiming = true; a.pitch = Math.sin(t * 2) * 0.7; g.aimPt = null; }
        if (sc === 'spin') { a.yaw += dt * (t < 0.6 ? 0 : t < 1.0 ? 4 : 0); }
        g.updateActor(a, dt); S.hook?.(a, dt); }
      const c = a.pos, f = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
      const dir = view === 'front' ? f.clone() : view === '34' ? f.clone().add(r).normalize() : view === 'back' ? f.clone().negate() : r;
      g.camera.fov = 30; g.camera.updateProjectionMatrix(); g.camera.position.copy(c).addScaledVector(dir, 5.2); g.camera.position.y += 1.1; g.camera.lookAt(c.x, c.y + 0.9, c.z);
      (window.__post || g.renderer).render(g.scene, g.camera); }, [+STEP, view]);
    shots.push((await p.screenshot()).toString('base64'));
  }
  const html = `<body style="margin:0;display:flex;background:#000">${shots.map((s) => `<img src="data:image/png;base64,${s}">`).join('')}</body>`;
  const p2 = await b.newPage({ viewport: { width: W * n, height: H } }); await p2.setContent(html); await p2.screenshot({ path: out }); await b.close(); })();
