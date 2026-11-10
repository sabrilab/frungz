// node test/nan.cjs URL [pas] [images/s simulées]. Chasse aux valeurs invalides (NaN/infini) : partie 50 contre 50 avec carnage ; à chaque pas, on scanne
// la caméra, les persos, les véhicules, les lumières, les matrices instanciées et les attributs des effets.
const { chromium } = require('playwright');
(async () => { const [,, url, steps = 3000, fps = 30] = process.argv; const b = await chromium.launch({ args: ['--use-gl=angle'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(1000);
  console.log(JSON.stringify(await p.evaluate(([steps, fps]) => {
    const g = window.__game, sc = g.scene, I = g.input, pl = g.player; const found = []; const seen = new Set();
    const bad = (v) => v !== v || v === Infinity || v === -Infinity;
    const note = (i, what) => { if (seen.has(what)) return; seen.add(what); found.push({ step: i, what }); };
    const scan = (i) => {
      const c = g.camera; for (const e of c.matrixWorld.elements) if (bad(e)) { note(i, 'camera'); break; }
      for (const a of g.actors) { if (bad(a.pos.x + a.pos.y + a.pos.z)) note(i, 'actor.pos ' + (a.bot ? 'bot' : 'joueur')); if (a.vel && bad(a.vel.x + a.vel.y + a.vel.z)) note(i, 'actor.vel'); if (bad(a.yaw)) note(i, 'actor.yaw'); if (a.alive && !a.lodHidden) { a.ch.root.traverse((o) => { if (o.isBone) { const q = o.quaternion; if (bad(q.x + q.y + q.z + q.w) || bad(o.position.x + o.position.y + o.position.z)) note(i, 'os ' + o.name + (a.bot ? ' (bot)' : ' (joueur)')); } }); } }
      for (const v of g.cars) if (bad(v.pos.x + v.pos.y + v.pos.z) || bad(v.yaw) || bad(v.speed)) note(i, 'vehicule ' + (v.kind || 'auto'));
      sc.traverse((o) => { if (o.isLight && (bad(o.intensity) || bad(o.position.x + o.position.y + o.position.z))) note(i, 'lumiere ' + o.type);
        if (o.isInstancedMesh && o.count) { const A = o.instanceMatrix.array; for (let k = 0; k < o.count * 16; k++) if (bad(A[k])) { note(i, 'instancie ' + (o.geometry.type) + ' ' + (o.material.type)); break; } }
        if (o.geometry?.isInstancedBufferGeometry) { for (const n of ['iPos', 'iSR', 'iCol']) { const A = o.geometry.attributes[n]?.array; if (A) for (let k = 0; k < o.geometry.instanceCount * o.geometry.attributes[n].itemSize; k++) if (bad(A[k])) { note(i, 'panneaux ' + n); break; } } }
        if ((o.isMesh || o.isSprite || o.isGroup) && o.visible && !o.isBone && bad(o.position.x + o.position.y + o.position.z + o.scale.x + o.scale.y + o.scale.z + o.quaternion.x + o.quaternion.w)) note(i, 'objet ' + o.type + ' ' + (o.name || o.parent?.name || ''));
      });
      const L = g.audio.listener; if (bad(L.x + L.y + L.z + L.yaw)) note(i, 'ecoute audio');
    };
    pl.hp = pl.maxHp = 1e9;
    // traceur : quelle étape de l'animation du joueur produit la première valeur invalide
    const hips = () => { let b = false; pl.ch.root.traverse((o) => { if (o.isBone && bad(o.quaternion.x + o.quaternion.y + o.quaternion.z + o.quaternion.w + o.position.x + o.position.y + o.position.z)) b = true; }); return b; };
    let culprit = null; const st = () => ({ crouch: pl.crouch, crouchK: pl.crouchK, slide: pl.slideT, roll: pl.rollT, land: pl.landT, stop: pl.stopT, air: pl.airT, onGround: pl.onGround, climb: !!pl.climb, swim: pl.swim, anim: pl.anim, vel: [pl.vel.x, pl.vel.y, pl.vel.z].map((v) => +v.toFixed(2)), pos: [pl.pos.x, pl.pos.y, pl.pos.z].map((v) => +v.toFixed(2)), aimW: pl.aimW, stun: pl.stunT, inCar: !!pl.inCar, gun: pl.slots?.[pl.cur]?.id, overs: (pl.overs || []).map((o) => o.name || o.kind), alive: pl.alive, yaw: pl.yaw, pitch: pl.pitch, camPitch: g.cam.pitch });
    for (const n of ['aimSpine', 'crouchPose', 'applyOverlays', 'locomotion', 'animate', 'updateActor', 'updatePlayer', 'updateCamera', 'updateViewGun', 'setAnim', 'damage']) { if (!g[n]) continue; const f = g[n].bind(g); g[n] = (...a) => { const pre = !culprit && (a[0] === pl || n === 'updatePlayer' || n === 'updateCamera' || n === 'updateViewGun') ? hips() : true; const r = f(...a); if (!pre && hips()) culprit = { fn: n, state: st(), args: a.slice(1).map((x) => typeof x === 'number' ? x : typeof x) }; return r; }; }
    let inPl = false; { const f = g.updateActor; g.updateActor = (a, dt) => { inPl = a === pl; try { return f(a, dt); } finally { inPl = false; } }; }
    const names = new Set(); for (let o = Object.getPrototypeOf(g); o && o !== Object.prototype; o = Object.getPrototypeOf(o)) for (const k of Object.getOwnPropertyNames(o)) if (typeof g[k] === 'function' && k !== 'constructor' && k !== 'updateActor' && k !== 'update') names.add(k);
    for (const n of names) { const f = g[n]; g[n] = function (...a) { if (!inPl || culprit) return f.apply(this, a); const pre = hips(); const r = f.apply(this, a); if (!pre && hips() && !culprit) culprit = { fn: n, state: st() }; return r; }; }
    { const mx = pl.ch.mixer, f = mx.update.bind(mx); mx.update = (d) => { const pre = !culprit ? hips() : true; const r = f(d); if (!pre && hips()) culprit = { fn: 'mixer.update', dt: d, state: st() }; return r; }; }
    for (let i = 0; i < steps; i++) {
      if (Math.sin(i * 0.01) > -0.3) I.keys.add('KeyW'); else I.keys.delete('KeyW'); if (Math.sin(i * 0.023) > 0.5) I.keys.add('KeyD'); else I.keys.delete('KeyD'); if (i % 90 < 30) I.keys.add('Mouse0'); else I.keys.delete('Mouse0'); I.st.locked = true; g.cam.yaw += 0.013 * Math.sin(i * 0.004);
      if (i % 200 === 50) pl.wantJump = 0.15; if (i % 300 === 100) pl.crouch = !pl.crouch;
      if (i % 12 === 0) { const a = Math.random() * 6.28, d = 3 + Math.random() * 25; const q = pl.pos.clone(); q.x += Math.cos(a) * d; q.z += Math.sin(a) * d; g.boom(q, 6, 60, g.actors[(Math.random() * g.actors.length) | 0], '#ffb347'); }
      if (i % 40 === 3) { const c = g.cars[(Math.random() * g.cars.length) | 0]; if (c && !c.dead) g.hitCar?.(c, 9999, pl); }
      if (i % 50 === 9) { const q = pl.pos.clone(); q.z += 6; g.fx.cloud(q, i % 100 ? 'gas' : 'smoke'); }
      if (i % 7 === 0 && g.throwNade) try { const b2 = g.actors[(Math.random() * g.actors.length) | 0]; if (b2.alive && b2.bot) g.throwNade(b2, pl.pos.clone()); } catch {}
      g.update(1 / fps); if (i % 3 === 0) scan(i); if (culprit) break;
    }
    return { fps, culprit, heals: g.nanHeals || 0, found, alive: g.actors.filter((a) => a.alive).length, kills: g.actors.reduce((s, a) => s + a.stats.k, 0) };
  }, [+steps, +fps]))); await b.close(); })();
