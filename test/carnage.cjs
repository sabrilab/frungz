// Carnage : 50 contre 50, explosions en chaîne autour du joueur, vitrines cassées, fumées, atouts de série.
// Mesure ce qui sature : temps de logique, temps de rendu, appels de dessin, objets dans la scène, effets vivants,
// lumières, sons actifs, mémoire. node test/carnage.cjs URL [secondes de jeu]
const { chromium } = require('playwright');
(async () => { const [,, url, secs = 40] = process.argv; const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-precise-memory-info'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  // compte les nœuds Web Audio créés (charge du fil audio)
  await p.addInitScript(() => { const C = window.AudioContext; if (!C) return; window.__an = 0; window.__asrc = 0;
    for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) if (/^create/.test(k)) { const f = BaseAudioContext.prototype[k]; BaseAudioContext.prototype[k] = function (...a) { window.__an++; if (/BufferSource|Oscillator/.test(k)) window.__asrc++; return f.apply(this, a); }; } });
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async (secs) => {
    const g = window.__game, R = g.renderer, sc = g.scene, cam = g.camera; window.__noloop = true;
    const dt = 1 / 30, N = Math.round(secs / dt); R.info.autoReset = false; const out = [];
    g.audio.init?.(); const T = {}; const wrap = (name, obj = g, key = name) => { if (!obj[name]) return; const f = obj[name].bind(obj); obj[name] = (...a) => { const s = performance.now(); const r = f(...a); T[key] = (T[key] || 0) + performance.now() - s; return r; }; };
    wrap('update', g.fx, 'fx'); ['animate', 'aimSpine', 'locomotion', 'applyOverlays', 'crouchPose', 'findClimb', 'updateBot', 'updateActor', 'updateCar', 'updateBullets', 'updateNades', 'updateThrown', 'updateStreaks', 'cloudEffects', 'updateZones', 'updateShops', 'updateDrops', 'updateCamera', 'drawMinimap', 'updateHud', 'updatePlayer', 'boom', 'breakVitrine', 'fire', 'damage', 'kill'].forEach((n) => wrap(n));
    for (const a of g.actors) { const mx = a.ch.mixer, f = mx.update.bind(mx); mx.update = (d) => { const s = performance.now(); const r = f(d); T.mixer = (T.mixer || 0) + performance.now() - s; return r; }; }
    const pl = g.player; pl.hp = pl.maxHp = 1e9; // le joueur survit au carnage
    let tU = 0, tR = 0, worstU = 0, worstR = 0, nR = 0;
    const count = () => { let objs = 0, meshes = 0, sprites = 0, lights = 0, vis = 0; sc.traverse((o) => { objs++; if (o.isMesh) meshes++; if (o.isSprite) sprites++; if (o.isLight && o.visible && o.intensity > 0) lights++; if (o.visible) vis++; }); return { objs, meshes, sprites, lights, vis }; };
    for (let i = 0; i < N; i++) {
      // explosions toutes les ~0,3 s autour du joueur, vitrines, grenades, fumées
      if (i % 9 === 0) { const a = Math.random() * 6.28, d = 6 + Math.random() * 25; const q = pl.pos.clone(); q.x += Math.cos(a) * d; q.z += Math.sin(a) * d; g.boom ? g.boom(q, 6, 40, null, '#ffb347') : g.fx.explosion(q); }
      if (i % 30 === 5) { const v = g.shops?.find((s) => !s.broken); if (v && g.breakVitrine) try { g.breakVitrine(v, pl); } catch {} }
      if (i % 45 === 7) { const q = pl.pos.clone(); q.x += 8; g.fx.cloud(q, i % 90 ? 'gas' : 'smoke'); }
      g.input.keys.add('Mouse0'); g.input.st.locked = true; g.cam.yaw += 0.02;
      let t = performance.now(); g.update(dt); const u = performance.now() - t; tU += u; worstU = Math.max(worstU, u);
      if (i % 15 === 0) { R.info.reset(); t = performance.now(); (window.__post || R).render(sc, cam); R.getContext().finish(); const rr = performance.now() - t; tR += rr; nR++; worstR = Math.max(worstR, rr); if (rr > 300) { const M = g.fx._meshes, _u = 0, tm = () => { const t = performance.now(); (window.__post || R).render(sc, cam); R.getContext().finish(); return Math.round(performance.now() - t); }; const enc = tm(); let ss = -1, sh = -1; if (M) { M.smoke.visible = false; ss = tm(); M.smoke.visible = true; M.glow.visible = false; sh = tm(); M.glow.visible = true; } const so = R.shadowMap.enabled; R.shadowMap.enabled = false; const sn = tm(); R.shadowMap.enabled = so;
          (window.__spikes ||= []).push({ t: (i * dt).toFixed(1), ms: Math.round(rr), encore: enc, sansFumee: ss, sansHalo: sh, sansOmbres: sn, calls: R.info.render.calls, dens: g.fx.density(cam.position).toFixed(2), puffs: g.fx.stats?.().puffs }); }
        if (i % 150 === 0) out.push({ t: (i * dt).toFixed(0) + 's', updMs: u.toFixed(1), rendMs: rr.toFixed(0), calls: R.info.render.calls, tris: R.info.render.triangles, ...count(), geos: R.info.memory.geometries, tex: R.info.memory.textures, progs: R.info.programs.length, fx: g.fx.stats?.(), heapMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0, audioNodes: window.__an, audioSrc: window.__asrc }); }
    }
    return { moyUpdMs: (tU / N).toFixed(1), pireUpdMs: worstU.toFixed(0), moyRendMs: (tR / nR).toFixed(0), pireRendMs: worstR.toFixed(0), perSysMs: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, (v / N).toFixed(2)]).sort((a, b) => b[1] - a[1])), alive: g.actors.filter((a) => a.alive).length, serie: out, pics: window.__spikes || [] };
  }, +secs);
  console.log(JSON.stringify(r, null, 1)); console.log('ERREURS', errs.length, [...new Set(errs)].slice(0, 8).join('\n')); await b.close(); })();
