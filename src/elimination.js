// Élimination : ce qui rend un kill satisfaisant à voir, sans ajouter de texte à l'écran (la régie garde les titres).
//  - arrêt sur image : la partie retient son souffle 50 à 90 ms quand le joueur tue (tête : plus long). Hors ligne seulement.
//  - le coup emporte le corps : il glisse dans le sens du tir selon la puissance de l'arme (pompe à bout portant, fusil
//    de précision > fusil > pistolet), arrêté par les murs.
//  - sang réaliste et sobre : giclée de sortie dans l'axe du tir, éclaboussure sur le mur juste derrière la victime,
//    flaque qui s'étend lentement sous le corps.
//  - silhouette : la victime s'illumine en blanc puis s'éteint (lisible de loin, même dans la foule).
//  - confirmation : losange émaillé rouge (tête de mort) posé au-dessus du corps, qui suit la victime 0,9 s.
//  - le corps tombe et on l'entend (choc sourd + tissu), puis il s'enfonce doucement avant la réapparition
//    au lieu de clignoter.
// Tout est instancié (une seule géométrie pour flaques et éclaboussures) ; aucun filtre ni passe plein écran.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { svg } from './icons.js';

const POOLS = 40;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Object3D(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

// tache irrégulière : un disque au bord bosselé (8 lobes au hasard, mêmes pour toutes les instances, tournées au hasard)
function blobGeo() {
  const N = 28, pts = [], lobes = [...Array(6)].map(() => [Math.random() * Math.PI * 2, 0.08 + Math.random() * 0.14, 2 + (Math.random() * 4 | 0)]);
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; let r = 1; for (const [ph, amp, f] of lobes) r += amp * Math.sin(a * f + ph); pts.push(new THREE.Vector2(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1); g.rotateX(-Math.PI / 2); return g; // à plat (normale +y)
}

const CSS = `
#elimk { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
#elimk i { position: absolute; left: 0; top: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px; opacity: 0; display: grid; place-items: center; will-change: transform, opacity; }
#elimk i::before { content: ''; position: absolute; inset: 3px; transform: rotate(45deg); border-radius: 3px;
  background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,0) 50%), linear-gradient(180deg, #c8202a, #8a0f17);
  box-shadow: inset 0 0 0 1.3px rgba(40,4,8,.95), inset 0 0 0 2.3px rgba(255,236,236,.85), 0 2px 6px rgba(0,0,0,.5); }
#elimk i.head::before { background: linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,0) 50%), linear-gradient(180deg, #e2a92a, #a8720e); box-shadow: inset 0 0 0 1.3px rgba(48,30,0,.95), inset 0 0 0 2.3px rgba(255,248,226,.9), 0 2px 6px rgba(0,0,0,.5); }
#elimk i svg { position: relative; width: 13px; height: 13px; color: #fff; filter: drop-shadow(0 1px 0 rgba(0,0,0,.5)); }
`;

export function installElimination(Game) {
  const P = Game.prototype, kill = P.kill, update = P.update, updateActor = P.updateActor, respawn = P.respawn;

  P.elim = function () {
    if (this._elim) return this._elim;
    const mat = new THREE.MeshStandardMaterial({ color: '#3a0306', roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.93, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const mesh = new THREE.InstancedMesh(blobGeo(), mat, POOLS); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1; this.scene.add(mesh);
    let host = document.getElementById('elimk');
    if (!document.getElementById('elimCss')) { const s = document.createElement('style'); s.id = 'elimCss'; s.textContent = CSS; document.head.appendChild(s); }
    if (!host) { host = document.createElement('div'); host.id = 'elimk'; (document.getElementById('hud') || document.body).appendChild(host); }
    const marks = []; for (let i = 0; i < 3; i++) { const el = document.createElement('i'); el.innerHTML = svg('skull'); host.appendChild(el); marks.push({ el, t: 9, a: null }); }
    return (this._elim = { mesh, pools: [], next: 0, glow: [], later: [], marks, stopT: 0, stopK: 1 });
  };

  // ------------------------------------------------------------------ flaques et éclaboussures (même maillage instancié)
  P.bloodStain = function (pos, normal, size, grow, delay = 0) {
    const E = this.elim(); const i = E.next; E.next = (E.next + 1) % POOLS; E.mesh.count = Math.max(E.mesh.count, E.next || POOLS);
    E.pools[i] = { p: pos.clone(), n: normal.clone(), s: size, grow, t: -delay, spin: Math.random() * Math.PI * 2, done: false };
    E.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); E.mesh.instanceMatrix.needsUpdate = true;
  };
  function poolMatrix(o, k) {
    _o.position.copy(o.p).addScaledVector(o.n, 0.012 + (o.n.y > 0.7 ? 0.004 : 0));
    _o.quaternion.setFromUnitVectors(_w.set(0, 1, 0), o.n); _q.setFromAxisAngle(_w, o.spin); _o.quaternion.multiply(_q);
    const s = Math.max(1e-4, o.s * k); _o.scale.set(s, 1, s * (o.n.y > 0.7 ? 1 : 1.25)); _o.updateMatrix(); return _o.matrix;
  }

  // ------------------------------------------------------------------ élimination
  P.kill = function (t, by, opts = {}) {
    kill.call(this, t, by, opts);
    if (t.alive) return; // (sécurité : une surcharge a pu annuler la mort)
    const E = this.elim(), cam = this.camera.position, near = cam.distanceTo(t.pos) < 70;
    // axe du tir : direction de la balle si on l'a, sinon du tireur vers la victime
    const d = _v.set(0, 0, 0); if (opts.dir) d.set(opts.dir.x, 0, opts.dir.z); if (d.lengthSq() < 1e-6 && by && by !== t) d.set(t.pos.x - by.pos.x, 0, t.pos.z - by.pos.z); if (d.lengthSq() < 1e-6) d.set(Math.sin(t.yaw + Math.PI), 0, Math.cos(t.yaw + Math.PI)); d.normalize();
    const W = WEAPONS[opts.weapon] || (by && by !== t ? WEAPONS[this.weapon(by)?.id] : null), dist = opts.dist ?? (by ? by.pos.distanceTo(t.pos) : 10);
    // puissance du coup : emporte plus ou moins le corps (les explosions ont déjà leur chute projetée)
    const pow = opts.blast || opts.weapon === 'metro' ? 0 : W?.pellets > 1 || W?.cat === 'pompe' ? clamp(6.5 - dist * 0.45, 1.6, 5.5) : opts.sniper || W?.cat === 'precision' || W?.cat === 'lourde' ? 3.4 : W?.cat === 'pistolet' ? 1.5 : 2.3;
    t.kb = new THREE.Vector3(d.x, 0, d.z).multiplyScalar(pow * (opts.head ? 0.85 : 1)); t.deadT = 0; t.sinkY = 0;
    // sang : giclée de sortie dans l'axe du tir (plus fournie à la tête et au fusil à pompe)
    if (!opts.blast && !opts.gas && near) {
      const h = new THREE.Vector3(t.pos.x, t.pos.y + (opts.head ? 1.62 : 1.2), t.pos.z), nv = new THREE.Vector3(d.x, 0.25, d.z).normalize();
      this.fx.burst(h, opts.head ? 14 : 9, { color: '#6d0a12', speed: opts.head ? 4.2 : 3.2, size: 0.045, life: 0.55, normal: nv, spread: 1.6, grav: 11 });
      this.fx.burst(h, 2, { color: '#5a0a10', opacity: 0.4, size: opts.head ? 0.28 : 0.2, life: 0.7, speed: 0.8, normal: nv }); // brume
      // éclaboussure sur le mur juste derrière (à hauteur du coup)
      const hw = this.world.ray(h, nv.set(d.x, -0.12, d.z).normalize(), 2.6);
      if (hw && hw.n && Math.abs(hw.n[1]) < 0.6) this.bloodStain(h.clone().addScaledVector(nv, hw.t), new THREE.Vector3(...hw.n), 0.22 + Math.random() * 0.12 + (opts.head ? 0.08 : 0), 0.06);
    }
    // flaque : posée quand le corps a fini de tomber, sous le bassin
    if (!opts.gas && !t.swim && opts.weapon !== 'metro') E.later.push({ at: 0.75, t: 0, kind: 'pool', a: t });
    // le corps touche le sol : on l'entend (de près)
    if (near) E.later.push({ at: opts.blast ? 0.85 : 0.55, t: 0, kind: 'fall', a: t });
    if (by !== this.player || t === this.player) return;
    // ---- du point de vue du tueur
    // silhouette blanche qui s'éteint
    t.flashT = 0; E.glow = E.glow.filter((g) => g.a !== t); E.glow.push({ a: t, t: 0 });
    // losange de confirmation au-dessus du corps
    const mk = E.marks.reduce((m, x) => (x.t > m.t ? x : m)); mk.t = 0; mk.a = t; mk.el.className = opts.head ? 'head' : '';
    // arrêt sur image (seulement hors ligne : en ligne, chacun garde son propre temps)
    if (!this.net) { const dur = opts.head ? 0.085 : 0.05; if (dur > E.stopT) { E.stopT = dur; E.stopK = opts.head ? 0.12 : 0.2; } }
    const C = this.cam; C.trauma = Math.min(1, C.trauma + (opts.head ? 0.18 : 0.12)); C.roll += (Math.random() < 0.5 ? -1 : 1) * 0.012;
  };

  P.respawn = function (a, first) { respawn.call(this, a, first); a.kb = null; a.sinkY = 0; if (a.ch?.root) a.ch.root.visible = true; };

  // ------------------------------------------------------------------ corps : glissade, puis enfoncement avant la réapparition
  P.updateActor = function (a, dt) {
    updateActor.call(this, a, dt);
    if (a.alive || a.gone || a.puppet) return;
    a.deadT = (a.deadT || 0) + dt;
    if (a.kb && !a.inCar) {
      const sp = a.kb.length();
      if (sp > 0.05) { _w.copy(a.pos); a.pos.addScaledVector(a.kb, dt); this.world.pushOut(a.pos, 0.3, a.pos.y + 0.3); const gy = this.world.standY(a.pos.x, a.pos.z, a.pos.y + 0.4); if (gy > a.pos.y + 0.45) a.pos.copy(_w); /* marche trop haute : on s'arrête */ a.kb.multiplyScalar(Math.exp(-dt * (a.deadT < 0.25 ? 2.2 : 5.5))); }
      else a.kb = null;
    }
    const ch = a.ch; ch.root.position.copy(a.pos);
    // au lieu de clignoter, le corps s'enfonce dans la dernière seconde et demie
    if (a.respawnT < 1.5 && a.respawnT > 0) { ch.root.visible = a.respawnT > 0.04; const k = 1 - a.respawnT / 1.5; ch.root.position.y -= k * k * 0.75; }
  };

  // ------------------------------------------------------------------ chaque image
  P.update = function (dt, bg) {
    const E = this._elim;
    if (E && E.stopT > 0 && (!this.paused || bg)) { E.stopT -= dt; dt *= E.stopK; } // arrêt sur image : la partie ralentit, l'interface non
    update.call(this, dt, bg);
    if (!E || this.paused && !bg) return;
    // tâches différées (flaque, chute)
    for (let i = E.later.length - 1; i >= 0; i--) {
      const L = E.later[i]; L.t += dt; if (L.t < L.at) continue; E.later.splice(i, 1); const a = L.a; if (a.alive || a.gone) continue;
      const B = a.ch.bones, hb = B.Hips || B.Body || B.Spine || B.mixamorigHips;
      if (hb) hb.getWorldPosition(_s); else _s.copy(a.pos);
      if (L.kind === 'pool') { const y = this.world.standY(_s.x, _s.z, a.pos.y + 0.5); if (Math.abs(y - a.pos.y) < 0.6) this.bloodStain(_v.set(_s.x, y, _s.z), _w.set(0, 1, 0), 0.55 + Math.random() * 0.3, 5); }
      else if (L.kind === 'fall') { this.audio.play('thud', _s, 0.9, [0.8, 0.95], 0.02); this.audio.play('cloth', _s, 0.6); this.fx.dust?.(_v.set(_s.x, a.pos.y + 0.05, _s.z), 4, 0.6); }
    }
    // flaques qui s'étendent (et s'effacent au bout d'une minute)
    let dirty = false;
    for (let i = 0; i < E.pools.length; i++) {
      const o = E.pools[i]; if (!o || o.done) continue; o.t += dt; if (o.t < 0) continue;
      if (o.set && o.t < 60) continue; // posée : plus rien à recalculer jusqu'à son effacement
      let k = o.grow > 0.1 ? 1 - Math.pow(1 - Math.min(1, o.t / o.grow), 2.4) : Math.min(1, o.t / Math.max(0.01, o.grow));
      if (o.t > 60) k *= Math.max(0, 1 - (o.t - 60) / 3);
      E.mesh.setMatrixAt(i, poolMatrix(o, k)); dirty = true; o.set = o.t >= o.grow && o.t < 60;
      if (o.t > 63) { o.done = true; E.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
    }
    if (dirty) E.mesh.instanceMatrix.needsUpdate = true;
    // silhouette blanche → éteinte
    for (let i = E.glow.length - 1; i >= 0; i--) {
      const g = E.glow[i]; g.t += dt; const k = g.t < 0.06 ? 1.15 : Math.max(0, 1.15 * (1 - (g.t - 0.06) / 0.34));
      g.a.ch.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'corps') { o.material.emissive.set('#ffffff'); o.material.emissiveIntensity = k; } });
      if (k <= 0) E.glow.splice(i, 1);
    }
    // losanges de confirmation
    const cv = this.renderer.domElement, W = cv.clientWidth, H = cv.clientHeight;
    for (const m of E.marks) {
      if (m.t > 1) continue; m.t += dt; const a = m.a; if (!a || m.t > 0.95) { m.el.style.opacity = 0; m.t = 9; continue; }
      _v.set(a.pos.x, a.pos.y + 1.75 + m.t * 0.2, a.pos.z).project(this.camera);
      if (_v.z > 1) { m.el.style.opacity = 0; continue; }
      const pop = m.t < 0.09 ? 1.6 - m.t / 0.09 * 0.6 : 1, op = m.t < 0.05 ? m.t / 0.05 : Math.min(1, (0.95 - m.t) / 0.3);
      m.el.style.opacity = op.toFixed(2); m.el.style.transform = `translate(${((_v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - _v.y) / 2 * H).toFixed(1)}px) scale(${pop.toFixed(2)})`;
    }
  };
}
