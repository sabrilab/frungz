// Kill-cam « ralenti » : la bulle ne s'ouvre plus à chaque élimination. Elle se déclenche de temps en temps, sur un
// moment fort (plusieurs éliminations d'affilée, tir à la tête de loin, kill en plein vol ou en glissade), et rejoue
// alors l'action en petite cinématique de plusieurs plans (un plan par victime, au ralenti, sous un angle différent).
//
// Comment : on enregistre en continu les 9 dernières secondes autour du joueur (15 fois par seconde : position, rotation
// et pose du squelette des persos proches, traçantes). Pour dessiner la bulle, on pose un instant les persos dans leur
// pose enregistrée (interpolée), on rend la bulle, puis on remet tout comme avant : la partie, elle, n'est pas touchée.
// Coût : quelques copies de tableaux 15 fois par seconde ; aucune allocation pendant le jeu.
import * as THREE from 'three';

const HZ = 15, SEC = 9, N = HZ * SEC, RADIUS = 70, MAXA = 26;
const COOLDOWN = 25, COOLDOWN_BIG = 8; // secondes entre deux ralentis (3 éliminations et plus : presque toujours)
const QUIET = 1.4; // on attend que la rafale soit finie avant de rejouer
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = V(), _w = V();

export function installReplay(Game) {
  const P = Game.prototype, update = P.update, renderPip = P.renderPip, updatePip = P.updatePip, startPip = P.startPip;

  // ------------------------------------------------------------------ enregistreur
  P.rec = function () {
    if (this._rec) return this._rec;
    const R = { times: new Float64Array(N), head: -1, count: 0, acc: 0, tracks: new Map(), tracers: [], kills: [], lastReplay: -99, pend: null, line: null };
    // traçantes : on les note (seulement près du joueur) pour les redessiner dans le ralenti
    const fx = this.fx, tracer = fx.tracer, g = this;
    fx.tracer = function (a, b, c) { tracer.call(fx, a, b, c); const pl = g.player; if (pl && a && b && a.distanceToSquared?.(pl.pos) < RADIUS * RADIUS) { if (R.tracers.length > 300) R.tracers.shift(); R.tracers.push({ t: g.time, a: a.clone(), b: b.clone() }); } };
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    R.line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: 0.9, depthWrite: false })); R.line.visible = false; R.line.frustumCulled = false; this.scene.add(R.line);
    return (this._rec = R);
  };
  function track(R, a) {
    let T = R.tracks.get(a); if (T) return T;
    const bones = Object.values(a.ch.bones || {}), stride = 12 + bones.length * 7;
    T = { bones, stride, buf: new Float32Array(N * stride), has: new Uint8Array(N) }; R.tracks.set(a, T); return T;
  }
  function record(g, R) {
    R.head = (R.head + 1) % N; R.count = Math.min(N, R.count + 1); R.times[R.head] = g.time; const i = R.head, pl = g.player;
    for (const T of R.tracks.values()) T.has[i] = 0;
    const near = [];
    for (const a of g.actors) { if (a.gone || !a.ch?.root) continue; const d = a === pl ? -1 : a.pos.distanceToSquared(pl.pos); if (d < RADIUS * RADIUS && (a === pl || a.ch.root.visible)) near.push([d, a]); }
    near.sort((x, y) => x[0] - y[0]); if (near.length > MAXA) near.length = MAXA;
    for (const [, a] of near) {
      const T = track(R, a), o = i * T.stride, B = T.buf, r = a.ch.root, m = a.ch.model;
      r.position.toArray(B, o); r.quaternion.toArray(B, o + 3); m.quaternion.toArray(B, o + 7); B[o + 11] = a.alive ? 1 : 0;
      let k = o + 12; for (const b of T.bones) { b.position.toArray(B, k); b.quaternion.toArray(B, k + 3); k += 7; }
      T.has[i] = 1;
    }
  }
  // indice des deux images qui encadrent l'instant t (null si hors de la mémoire)
  function frameAt(R, t) {
    if (R.count < 2) return null; let j = R.head;
    for (let n = 0; n < R.count - 1; n++) { const k = (j - 1 + N) % N; if (R.times[k] <= t) { const t0 = R.times[k], t1 = R.times[j]; return { i0: k, i1: j, f: t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0 }; } j = k; }
    return null;
  }

  // ------------------------------------------------------------------ pose enregistrée appliquée le temps d'un rendu
  const saved = [];
  function pose(g, R, F) {
    saved.length = 0;
    for (const a of g.actors) {
      if (!a.ch?.root) continue; const T = R.tracks.get(a), r = a.ch.root, m = a.ch.model;
      const s = { a, vis: r.visible, mvis: m.visible, p: r.position.clone(), q: r.quaternion.clone(), mq: m.quaternion.clone(), b: null }; saved.push(s);
      if (!T || !T.has[F.i0] || !T.has[F.i1]) { r.visible = false; continue; } // absent du moment rejoué : caché
      const B = T.buf, o0 = F.i0 * T.stride, o1 = F.i1 * T.stride, f = F.f;
      r.visible = true; m.visible = true;
      r.position.fromArray(B, o0).lerp(_p.fromArray(B, o1), f); r.quaternion.fromArray(B, o0 + 3).slerp(_q.fromArray(B, o1 + 3), f); m.quaternion.fromArray(B, o0 + 7).slerp(_q.fromArray(B, o1 + 7), f);
      s.b = new Float32Array(T.bones.length * 7); let k = 12, j = 0;
      for (const b of T.bones) { b.position.toArray(s.b, j); b.quaternion.toArray(s.b, j + 3); b.position.fromArray(B, o0 + k).lerp(_p.fromArray(B, o1 + k), f); _q2.fromArray(B, o0 + k + 3); b.quaternion.copy(_q2).slerp(_q.fromArray(B, o1 + k + 3), f); k += 7; j += 7; }
    }
  }
  function unpose(R) {
    for (const s of saved) { const r = s.a.ch.root, m = s.a.ch.model; r.visible = s.vis; m.visible = s.mvis; r.position.copy(s.p); r.quaternion.copy(s.q); m.quaternion.copy(s.mq);
      if (s.b) { const T = R.tracks.get(s.a); let j = 0; for (const b of T.bones) { b.position.fromArray(s.b, j); b.quaternion.fromArray(s.b, j + 3); j += 7; } } }
    saved.length = 0;
  }
  // position d'un perso à l'instant rejoué (pour viser)
  function posAt(R, a, F, out) { const T = R.tracks.get(a); if (!T || !T.has[F.i0] || !T.has[F.i1]) return out.copy(a.pos); const B = T.buf; return out.fromArray(B, F.i0 * T.stride).lerp(_w.fromArray(B, F.i1 * T.stride), F.f); }

  // ------------------------------------------------------------------ déclencheur
  P.maybeKillcam = function (t, opts) { // remplace la bulle systématique : on note l'élimination, le ralenti décidera
    const a = this.player; if (this.save.settings?.killcam === false) return;
    const B = this.killcam; if (B?.mode === 'bullet' && opts.sniper) { B.target = t; B.keep = true; B.dur = B.t + 1.9; const el = document.getElementById('killcam'); el?.classList.add('gold'); const bt = el?.querySelector('.kc-bot'); if (bt) bt.innerHTML = `${opts.head ? 'TIR À LA TÊTE' : 'ÉLIMINÉ'} · ${Math.round(opts.dist ?? a.pos.distanceTo(t.pos))} m<small>${t.name}</small>`; this.rec().lastReplay = this.time; return; }
    const R = this.rec(), dist = opts.dist ?? a.pos.distanceTo(t.pos);
    const style = opts.head && dist > 80 ? "TIR D'ÉLITE" : opts.head ? 'TIR À LA TÊTE' : a.slideT > 0 ? 'EN GLISSADE' : !a.onGround && !a.inCar ? 'EN PLEIN VOL' : a.rollT > 0 ? 'EN ROULADE' : 'ÉLIMINÉ';
    const big = (opts.head && dist >= 40) || dist >= 70 || /VOL|GLISSADE|ROULADE/.test(style);
    const k = { t: this.time, victim: t, head: !!opts.head, dist, style, big };
    if (!R.pend || this.time - R.pend.last > 4.5) R.pend = { kills: [], last: 0 };
    R.pend.kills.push(k); R.pend.last = this.time; if (R.pend.kills.length > 8) R.pend.kills.shift();
  };
  // la balle filmée du fusil de précision : pas à chaque tir non plus
  P.startPip = function (K) {
    if (K.mode === 'bullet') { const R = this.rec(); if (this.killcam?.mode === 'replay' || this.time - R.lastReplay < 10) return; }
    startPip.call(this, K);
  };

  function decide(g, R) {
    const p = R.pend; if (!p || g.time - p.last < QUIET) return; R.pend = null;
    if (g.save.settings?.killcam === false || g.killcam) return;
    const ks = p.kills.filter((k) => g.time - k.t < SEC - 2.5); const n = ks.length; if (!n) return;
    const wait = g.time - R.lastReplay; const worth = n >= 3 ? wait > COOLDOWN_BIG : (n >= 2 || ks.some((k) => k.big)) && wait > COOLDOWN;
    if (!worth) return;
    // un plan par victime (les 4 dernières), la dernière plus lente ; seul un kill, deux angles
    const list = ks.slice(-4), shots = [];
    list.forEach((k, i) => { const last = i === list.length - 1; shots.push({ k, from: k.t - (last ? 0.5 : 0.4), to: k.t + (last ? 1.3 : 0.6), speed: last ? 0.5 : 0.65, angle: n === 1 ? 'epaule' : ['victime', 'epaule', 'bas', 'victime'][i % 4] }); });
    if (n === 1) shots.push({ k: list[0], from: list[0].t - 0.25, to: list[0].t + 1.1, speed: 0.4, angle: 'victime' });
    let T = 0; for (const s of shots) { s.at = T; s.len = (s.to - s.from) / s.speed; T += s.len; }
    const names = ['', '', 'DOUBLÉ', 'TRIPLÉ', 'QUADRUPLÉ', 'CARNAGE', 'FRUNGZTASTIQUE', 'FRUNGZPLOSION', 'FRUNGZ SUPRÊME'];
    const head = n >= 2 ? `RALENTI · ${names[Math.min(n, 8)]}` : 'RALENTI';
    startPip.call(g, { mode: 'replay', shots, dur: T + 0.15, cur: -1, gold: n >= 3 || ks.some((k) => k.head), label: head, title: list[0].style, sub: list[0].victim.name, t0: g.time });
    R.lastReplay = g.time + T;
  }

  P.update = function (dt, bg) {
    update.call(this, dt, bg);
    if (this.paused && !bg) return; const R = this.rec();
    R.acc += dt; if (R.acc >= 1 / HZ) { R.acc = Math.min(R.acc - 1 / HZ, 1 / HZ); record(this, R); }
    decide(this, R);
  };

  // ------------------------------------------------------------------ montage
  P.updatePip = function (dt) {
    const K = this.killcam;
    if (K?.mode !== 'replay') return updatePip.call(this, dt);
    K.t += dt; let i = K.shots.findIndex((s) => K.t >= s.at && K.t < s.at + s.len); if (i < 0) i = K.shots.length - 1;
    if (i !== K.cur) { K.cur = i; const s = K.shots[i], el = document.getElementById('killcam');
      if (el) { el.classList.remove('cut'); void el.offsetWidth; el.classList.add('cut'); const bt = el.querySelector('.kc-bot'); if (bt) bt.innerHTML = `${s.k.style} · ${Math.round(s.k.dist)} m<small>${s.k.victim.name} · plan ${i + 1}/${K.shots.length}</small>`; const lb = el.querySelector('.kc-top span'); if (lb) lb.innerHTML = `<span class="rec">▶</span> ${K.label} · CAM 0${1 + (i * 3 + 2) % 9}`; }
      if (i > 0) this.audio.play('click', null, 0.25); }
    const tt = document.getElementById('killcam')?.querySelector('.kc-time'); if (tt) { const s = K.shots[K.cur]; tt.textContent = '×' + s.speed.toFixed(2).replace('.', ','); }
    if (K.t > K.dur) { this.killcam = null; document.getElementById('killcam')?.classList.remove('on', 'cut'); }
  };

  P.renderPip = function (renderer, scene) {
    const K = this.killcam; if (K?.mode !== 'replay') return renderPip.call(this, renderer, scene);
    const R = this._rec, el = document.getElementById('killcam'); if (!R || !el) return;
    const s = K.shots[Math.max(0, K.cur)]; if (!s) return;
    const lt = Math.min(1, Math.max(0, (K.t - s.at) / s.len)), rt = s.from + (s.to - s.from) * lt; // instant rejoué
    const F = frameAt(R, rt); if (!F) return;
    const r = el.getBoundingClientRect(), cr = renderer.domElement.getBoundingClientRect(); if (r.width < 10) return;
    const cam = this.pipCam || (this.pipCam = new THREE.PerspectiveCamera(46, 1.6, 0.05, 600)); cam.aspect = r.width / r.height;
    // cadrage du plan (calculé une fois, depuis la position de la victime et du joueur au moment du kill)
    if (!s.eye) {
      const Fk = frameAt(R, s.k.t) || F, vp = posAt(R, s.k.victim, Fk, V()), pp = posAt(R, this.player, Fk, V());
      const shot = V(vp.x - pp.x, 0, vp.z - pp.z); if (shot.lengthSq() < 1e-4) shot.set(0, 0, 1); shot.normalize(); const side = V(shot.z, 0, -shot.x), head = vp.clone().add(V(0, 1.2, 0));
      const tries = s.angle === 'epaule' ? [[pp.clone().add(V(0, 1.75, 0)).addScaledVector(shot, -1.6).addScaledVector(side, 0.7), 'p']]
        : s.angle === 'bas' ? [[1, 2, 0.45, 3.8], [-1, 2, 0.45, 3.8], [1, 1.2, 0.45, 3]] : [[1, 1.2, 1.5, 3], [-1, 1.2, 1.5, 3], [1, -0.8, 1.9, 3.2], [-1, -0.8, 1.9, 3.2], [1, 2, 2.1, 4], [-1, 2, 2.1, 4]];
      for (const tr of tries) {
        let e; if (tr[1] === 'p') e = tr[0]; else { const [sg, back, up, w] = tr; e = head.clone().addScaledVector(side, sg * w).addScaledVector(shot, -back); e.y = this.world.groundY(e.x, e.z, head.y) + up; }
        if (this.world.los(e, head) && this.world.los(head, e) && this.world.pushOut(e.clone(), 0.25, e.y - 0.3) === false) { s.eye = e; break; } // vue dégagée dans les deux sens : l'œil n'est pas dans un étal ou un mur
      }
      if (!s.eye) s.eye = head.clone().addScaledVector(shot, -2).addScaledVector(side, 1.5).add(V(0, 0.6, 0));
      s.fov = s.angle === 'epaule' ? Math.max(16, Math.min(40, 260 / Math.max(1, s.eye.distanceTo(head)))) : s.angle === 'bas' ? 50 : 42;
    }
    const look = posAt(R, s.k.victim, F, _v).add(_w.set(0, rt < s.k.t ? 1.15 : 0.75, 0));
    cam.fov = s.fov - lt * 6; cam.position.copy(s.eye).lerp(look, lt * 0.15); cam.lookAt(look); cam.updateProjectionMatrix();
    // traçantes du moment
    const pos = R.line.geometry.attributes.position; let n = 0;
    for (const tr of R.tracers) { if (tr.t > rt || tr.t < rt - 0.06 / Math.max(0.3, s.speed) * 0.5) continue; if (n >= 64) break; tr.a.toArray(pos.array, n * 6); tr.b.toArray(pos.array, n * 6 + 3); n++; }
    pos.needsUpdate = true; R.line.geometry.setDrawRange(0, n * 2); R.line.visible = n > 0;
    const pools = this._elim?.mesh, pv = pools?.visible; if (pools) pools.visible = false; // les flaques d'après ne sont pas encore là
    pose(this, R, F);
    const x = r.left - cr.left, y = cr.bottom - r.bottom, sz = renderer.getSize(new THREE.Vector2());
    const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setScissorTest(true); renderer.setScissor(x, y, r.width, r.height); renderer.setViewport(x, y, r.width, r.height);
    const vg = this.vgun?.visible; if (this.vgun) this.vgun.visible = false;
    try { renderer.render(scene, cam); } finally {
      if (this.vgun) this.vgun.visible = vg; unpose(R); R.line.visible = false; if (pools) pools.visible = pv;
      renderer.setScissorTest(false); renderer.setViewport(0, 0, sz.x, sz.y); renderer.shadowMap.autoUpdate = au;
    }
  };

  // coupe franche entre deux plans
  if (typeof document !== 'undefined' && !document.getElementById('replayCss')) { const st = document.createElement('style'); st.id = 'replayCss'; st.textContent = '#killcam.cut { animation: kccut .2s ease-out; } @keyframes kccut { 0% { box-shadow: inset 0 0 0 300px rgba(255,255,255,.6); } 100% { box-shadow: inset 0 0 0 300px rgba(255,255,255,0); } }'; document.head.appendChild(st); }
}
