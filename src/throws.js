// Lancers visés : grenades (lacrymo, fumigène, grenade classique) et atouts de série lancés comme des sorts.
// On maintient la touche : une courbe en pointillés montre la trajectoire réelle (rebonds compris) et un cercle
// montre la zone touchée. La force se règle (molette / croix haut-bas), l'angle suit la caméra : haut et court,
// ou loin et tendu. Les atouts tombent du ciel (fusées, missiles), parachutent des renforts ou envoient un drone,
// avec un marquage au sol que tout le monde voit.
import * as THREE from 'three';
import { TEAMS } from './data.js';
import { svg } from './icons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const G = 19; // même gravité que le jeu
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
// couleur de fumée réaliste à partir de la couleur de l'atout (moins saturée, comme une vraie grenade fumigène)
export const signalCol = (c) => new THREE.Color(c).lerp(new THREE.Color('#a9a8a2'), 0.32);

export const THROWS = {
  gas: { nom: 'Lacrymo', icon: '💨', ico: 'gas', fuse: 1.6, r: 5, col: '#e8e2b0' },
  smoke: { nom: 'Fumigène', icon: '🌫️', ico: 'smoke', fuse: 1.6, r: 5, col: '#ff4fa0' },
  frag: { nom: 'Grenade', icon: '💣', ico: 'frag', fuse: 2.0, r: 6, col: '#ff7a2f' },
  petards: { spell: 1, nom: 'Pétards', icon: '🧨', ico: 'petards', r: 9, col: '#ffd23d' },
  emeute: { spell: 1, nom: 'Renforts émeutiers', icon: '', ico: 'truck', r: 5, col: '#34c759' },
  artifice: { spell: 1, nom: "Mortiers d'artifice", icon: '🎆', ico: 'artifice', r: 12, col: '#ff4fa0' },
  drone: { spell: 1, nom: 'Drone', icon: '🛸', ico: 'drone', r: 40, col: '#5ab4ff', ringR: 8 },
  crs: { spell: 1, nom: 'Renforts CRS', icon: '', ico: 'truck', r: 5, col: '#3d8bff' },
  lacry: { spell: 1, nom: 'Salve lacrymogène', icon: '🚀', ico: 'missile', r: 12, col: '#ff3d3d' },
};

// ------------------------------------------------------------------ maillages
const MAT = {}; const mat = (c, e = 0) => MAT[c + e] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, flatShading: true, emissive: e ? c : '#000', emissiveIntensity: e });
const cyl = (r0, r1, h, s, m, y = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, s), m); o.position.y = y; return o; };
export function throwMesh(kind) {
  const g = new THREE.Group(); const T = THROWS[kind];
  if (kind === 'frag') { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), mat('#4a5a32')); g.add(b); g.add(cyl(0.02, 0.025, 0.05, 6, mat('#999'), 0.08)); }
  else if (kind === 'gas' || kind === 'smoke') { g.add(cyl(0.05, 0.05, 0.16, 8, mat(kind === 'gas' ? '#7d8a6a' : '#ff4fa0'))); g.add(cyl(0.02, 0.02, 0.04, 6, mat('#333'), 0.1)); }
  else if (kind === 'petards') { for (let i = 0; i < 7; i++) { const c = cyl(0.025, 0.025, 0.2, 6, mat(pick(['#e33', '#ffd23d', '#2a8'])), 0); c.position.set(Math.cos(i) * 0.05, 0, Math.sin(i) * 0.05); g.add(c); } g.add(cyl(0.008, 0.008, 0.12, 4, mat('#fff', 1), 0.15)); }
  else { // atout : grenade fumigène de désignation (corps kaki, bague de la couleur de la fumée, cuillère), qui fume déjà en vol
    g.add(cyl(0.05, 0.05, 0.17, 10, mat('#4b5236'))); g.add(cyl(0.052, 0.052, 0.035, 10, mat(signalCol(T.col).getStyle()), 0.045)); g.add(cyl(0.022, 0.022, 0.03, 6, mat('#2a2c2e'), 0.1));
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.13, 0.03), mat('#8b8f93')); lever.position.set(0.055, 0.03, 0); g.add(lever); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g;
}
function droneMesh() {
  const g = new THREE.Group(); const body = mat('#1d222a'), arm = mat('#3a414c');
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), body));
  const rotors = [];
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; const ar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), arm); ar.rotation.y = a; ar.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); g.add(ar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.05), mat('#aaa')); r.position.set(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6); g.add(r); rotors.push(r); }
  const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#ff2a2a', 3)); l1.position.set(0.2, -0.08, 0.2); const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#2a6bff', 3)); l2.position.set(-0.2, -0.08, 0.2); g.add(l1, l2);
  // cône de projecteur (léger, sans vraie lumière)
  const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 13, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#bfe0ff', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.position.y = -6.5; // plus de cône de lumière en plein jour (effet brumeux) : gardé hors scène
  g.scale.setScalar(1.4); g.userData = { rotors, l1, l2 }; return g;
}
function rocketMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'fw') { const c = pick(['#ff4fa0', '#ffd23d', '#5ad1ff', '#9ff59f', '#c27bff']); g.add(cyl(0.07, 0.07, 0.6, 8, mat(c, 0.6))); const n = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), mat('#fff', 0.4)); n.position.y = 0.4; g.add(n); g.add(cyl(0.012, 0.012, 1.1, 4, mat('#b08a58'), -0.7)); g.userData.c = c; }
  else { g.add(cyl(0.16, 0.16, 1.5, 10, mat('#d9dde2'))); const n = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 10), mat('#c42')); n.position.y = 0.97; g.add(n);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.3), mat('#555')); f.rotation.y = (i * Math.PI) / 2; f.position.y = -0.6; f.translateZ(0.2); g.add(f); } g.userData.c = '#ffb347'; }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g;
}
function shellMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'artifice') { g.add(cyl(0.09, 0.09, 0.28, 8, mat('#2b2b2b'))); g.add(cyl(0.092, 0.092, 0.06, 8, mat('#c8343a'), 0.05)); }
  else { g.add(cyl(0.035, 0.035, 0.2, 8, mat('#3e4a33'))); g.add(cyl(0.036, 0.036, 0.04, 8, mat('#d8d0a0'), 0.06)); }
  g.scale.setScalar(2.2); return g; // un peu grossi pour rester lisible à 30 m
}
function chute(team) {
  // même parachute pour les deux camps, aux couleurs du camp (fini le parapluie : ton sérieux)
  const g = new THREE.Group(); const civ = team === 'civils';
  const cols = civ ? ['#2f8f4e', '#1d2a22'] : ['#3d8bff', '#e9eef5'];
  const n = 10, R = 2.4, H = 1.0;
  for (let i = 0; i < n; i++) { const geo = new THREE.SphereGeometry(R, 2, 3, (i / n) * Math.PI * 2, (Math.PI * 2) / n, 0, Math.PI / 2); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, flatShading: true, roughness: 0.8 })); m.scale.y = H / R; g.add(m); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const l = cyl(0.006, 0.006, 2.4, 3, mat('#ddd')); l.position.set(Math.cos(a) * 1.1, -1.1, Math.sin(a) * 1.1); l.rotation.z = Math.cos(a) * 0.42; l.rotation.x = -Math.sin(a) * 0.42; g.add(l); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g;
}

// trajectoire simulée (mêmes règles que le vol réel)
export function simThrow(world, p0, v0, { fuse = 3, impact = false, step = 1 / 60 } = {}) {
  const p = p0.clone(), v = v0.clone(), pts = [p.clone()]; let t = 0, hitN = null; const d = V();
  while (t < fuse) {
    t += step; v.y -= G * step; d.copy(v).multiplyScalar(step); const L = d.length();
    const h = L > 0 ? world.ray(p, d.clone().divideScalar(L), L) : null;
    if (h) { const n = V(...h.n); p.addScaledVector(d.divideScalar(L), h.t * 0.9); if (impact && n.y > 0.45) { hitN = n; pts.push(p.clone()); break; } v.reflect(n).multiplyScalar(0.4); if (impact && v.length() < 1) { hitN = n; pts.push(p.clone()); break; } }
    else p.add(d);
    pts.push(p.clone()); if (p.y < -40) break;
  }
  return { pts, end: p, t, n: hitN };
}
// vitesse pour atteindre une cible (bots) : temps de vol selon la distance
export function solveThrow(from, to, lob = 1) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y; const D = Math.hypot(dx, dz);
  const T = Math.min(2.4, Math.max(0.7, D / 16)) * lob;
  return V(dx / T, (dy + 0.5 * G * T * T) / T, dz / T);
}

export function installThrows(Game) {
  const P = Game.prototype;

  // ----- particules de traînée (un seul appel de rendu)
  P.trailInit = function () {
    if (this.trail) return; const N = 900;
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(N * 3).fill(-9999), col = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.85, map: this.fx.glowT, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false; this.root.add(pts);
    this.trail = { N, geo, pos, col, life: new Float32Array(N), max: new Float32Array(N), base: new Float32Array(N * 3), vel: new Float32Array(N * 3), i: 0 };
  };
  P.trailPuff = function (p, color, life = 0.6, up = 0.6, spread = 0.3) {
    const T = this.trail; if (!T) return; const i = T.i; T.i = (T.i + 1) % T.N; const c = new THREE.Color(color);
    T.pos[i * 3] = p.x; T.pos[i * 3 + 1] = p.y; T.pos[i * 3 + 2] = p.z; T.base[i * 3] = c.r; T.base[i * 3 + 1] = c.g; T.base[i * 3 + 2] = c.b;
    T.vel[i * 3] = rnd(-spread, spread); T.vel[i * 3 + 1] = up * rnd(0.5, 1); T.vel[i * 3 + 2] = rnd(-spread, spread); T.life[i] = T.max[i] = life;
  };
  P.trailUpdate = function (dt) {
    const T = this.trail; if (!T) return;
    for (let i = 0; i < T.N; i++) { if (T.life[i] <= 0) continue; T.life[i] -= dt; const k = Math.max(0, T.life[i] / T.max[i]);
      T.pos[i * 3] += T.vel[i * 3] * dt; T.pos[i * 3 + 1] += T.vel[i * 3 + 1] * dt; T.pos[i * 3 + 2] += T.vel[i * 3 + 2] * dt;
      T.col[i * 3] = T.base[i * 3] * k; T.col[i * 3 + 1] = T.base[i * 3 + 1] * k; T.col[i * 3 + 2] = T.base[i * 3 + 2] * k; if (k <= 0) T.pos[i * 3 + 1] = -9999; }
    T.geo.attributes.position.needsUpdate = true; T.geo.attributes.color.needsUpdate = true;
  };

  // ----- visée : courbe en pointillés + zone d'impact
  P.arcInit = function () {
    if (this.arc) return; const N = 60;
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.9, depthTest: false }), N); dots.renderOrder = 5; dots.frustumCulled = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff' }));
    const g = new THREE.Group(); g.add(ring, disc, dot); g.visible = dots.visible = false; this.root.add(g, dots);
    this.arc = { N, dots, g, ring, disc, dot, m: new THREE.Matrix4(), off: 0 };
  };
  P.arcShow = function (sim, kind, team, dt) {
    const A = this.arc; const T = THROWS[kind]; const c = new THREE.Color(T.spell ? T.col : kind === 'frag' ? T.col : TEAMS[team].color);
    A.dots.material.color.copy(c); A.ring.material.color.copy(c); A.disc.material.color.copy(c); A.dot.material.color.copy(c);
    // points espacés régulièrement le long de la courbe, qui défilent
    const pts = sim.pts; const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = cum[cum.length - 1] || 1, gap = Math.max(0.45, L / A.N); A.off = (A.off + dt * 2.2) % gap; let j = 0, n = 0; const q = V();
    for (let s = A.off; s < L && n < A.N; s += gap, n++) { while (j < cum.length - 2 && cum[j + 1] < s) j++; const u = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]); q.copy(pts[j]).lerp(pts[j + 1], u); const k = 0.6 + 0.6 * (s / L); A.m.makeScale(k, k, k).setPosition(q); A.dots.setMatrixAt(n, A.m); }
    A.dots.count = n; A.dots.instanceMatrix.needsUpdate = true; A.dots.visible = true;
    const r = T.ringR || T.r; const gy = this.world.groundY(sim.end.x, sim.end.z, sim.end.y + 0.5);
    A.g.position.set(sim.end.x, Math.max(gy, sim.end.y - 2) + 0.06, sim.end.z); A.ring.scale.setScalar(r * (1 + 0.04 * Math.sin(this.time * 8))); A.disc.scale.setScalar(r); A.dot.position.y = 0.05; A.g.visible = true;
  };
  P.arcHide = function () { if (this.arc) { this.arc.dots.visible = false; this.arc.g.visible = false; } };

  // ce que le joueur peut lancer (hors atouts)
  P.throwKinds = function (a) { const l = []; if (a.nades > 0) l.push(a.team === 'ordre' ? 'gas' : 'smoke'); if (a.frags > 0) l.push('frag'); return l; };
  P.throwCount = function (a, kind) { return THROWS[kind].spell ? a.rewards.filter((r) => r === kind).length : kind === 'frag' ? a.frags : a.nades; };
  P.startThrow = function (a, kind, spell) {
    this.arcInit(); this.thr = { kind, spell: !!spell, hold: !spell, t: 0 }; this.thrPower ??= 0.55; this.audio.click?.();
    if (spell) this.toast(`${THROWS[kind].icon} ${THROWS[kind].nom} : vise la zone, ${this.input.label('fire')} pour lancer, ${this.input.label('aim')} pour annuler`, THROWS[kind].col);
  };
  P.throwVel = function (a) {
    const d = V(); this.camera.getWorldDirection(d); const sp = 7 + this.thrPower * 21; const v = d.multiplyScalar(sp); v.y += sp * 0.2; return v;
  };
  P.throwOrigin = function (a) { const o = a.pos.clone().add(V(0, 1.65, 0)); const r = V(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); return o.addScaledVector(r, -0.25); };
  P.updateThrowAim = function (a, I, dt) {
    if (!this.thr) {
      if (I.pressed('grenade')) { const ks = this.throwKinds(a); if (!ks.length) { this.toast('Plus rien à lancer', '#ccc'); return; } const k = ks.includes(this.thrLast) ? this.thrLast : ks[0]; this.startThrow(a, k, false); }
      if (!this.thr) return;
    }
    const S = this.thr; S.t += dt;
    if (!a.alive || a.inCar) { this.thr = null; this.arcHide(); return; }
    // force : molette / croix haut-bas
    if (I.st.wheel) this.thrPower = Math.min(1, Math.max(0, this.thrPower + (I.st.wheel < 0 ? 0.08 : -0.08)));
    if (I.padHit?.(12)) this.thrPower = Math.min(1, this.thrPower + 0.1); if (I.padHit?.(13)) this.thrPower = Math.max(0, this.thrPower - 0.1);
        // changer de projectile (R / ←)
    if (!S.spell && I.pressed('reload')) { const ks = this.throwKinds(a); const i = ks.indexOf(S.kind); if (ks.length > 1) { S.kind = ks[(i + 1) % ks.length]; this.thrLast = S.kind; this.audio.click?.(); } }
    // annuler (clic droit / L2)
    if (I.pressed('aim') || (I.st.triggerL > 0.5 && S.t > 0.15 && !S._lWas)) { this.thr = null; this.arcHide(); this.drawThrowHud(); return; } S._lWas = I.st.triggerL > 0.5;
    const v = this.throwVel(a), o = this.throwOrigin(a); const T = THROWS[S.kind];
    const sim = simThrow(this.world, o, v, { fuse: T.spell ? 4 : T.fuse, impact: !!T.spell, step: 1 / 40 });
    this.arcShow(sim, S.kind, a.team, dt); this.drawThrowHud();
    const release = S.hold ? !I.down('grenade') : (I.pressed('fire') || (I.st.triggerR > 0.4 && !S._rWas) || (I.pressed('streak') && S.t > 0.1)); S._rWas = I.st.triggerR > 0.4;
    if (release) { this.thr = null; this.arcHide(); this._thrJust = 0.3; this.castThrow(a, S.kind, v, o); this.thrLast = S.spell ? this.thrLast : S.kind; this.drawThrowHud(); }
  };
  P.drawThrowHud = function () {
    let el = document.getElementById('throwhud'); if (!el) { el = document.createElement('div'); el.id = 'throwhud'; document.getElementById('hud')?.appendChild(el); }
    const S = this.thr; if (!S) { el.classList.remove('on'); return; }
    const T = THROWS[S.kind], a = this.player, I = this.input; const n = this.throwCount(a, S.kind);
    const bars = Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(this.thrPower * 10) ? 'on' : ''}"></i>`).join('');
    const key = `${T.icon}${S.kind}${n}${Math.round(this.thrPower * 10)}`; if (el.dataset.k === key) return; el.dataset.k = key;
    el.style.setProperty('--c', T.col);
    el.innerHTML = `<b>${svg(T.ico)} ${T.nom}${T.spell ? '' : ' × ' + n}</b><div class="pw"><span>Force</span>${bars}</div><small>${I.st.usingTouch ? '' : (I.st.usingPad ? '↑↓' : 'molette') + ' force · '}viser plus haut = plus court et en cloche${S.spell ? ` · <kbd>${I.label('fire')}</kbd> lancer` : ` · lâche <kbd>${I.label('grenade')}</kbd> pour lancer · <kbd>${I.label('reload')}</kbd> changer`} · <kbd>${I.label('aim')}</kbd> annuler</small>`;
    el.classList.add('on');
  };

  // ----- lancer effectif (joueur et bots)
  P.castThrow = function (a, kind, vel, origin) {
    const T = THROWS[kind]; if (!a.alive) return;
    if (T.spell) { const i = a.rewards.lastIndexOf(kind); if (i < 0) return; a.rewards.splice(i, 1); this.streakCd[a.team] = this.time + 20; this.streakDirty = 1; }
    else if (kind === 'frag') { if (a.frags <= 0) return; a.frags--; } else { if (a.nades <= 0) return; a.nades--; }
    this.trailInit(); this.overlay(a, 'U_Throw', 0.75, { busy: true });
    const p = (origin || this.throwOrigin(a)).clone(); const m = throwMesh(kind); m.position.copy(p); this.root.add(m);
    (this.thrown ||= []).push({ kind, pos: p, vel: vel.clone(), m, t: 0, owner: a, spin: V(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)) });
    this.audio.play('cloth', p, 0.8);
    const me = a === this.player, mine = a.team === this.player.team;
    if (T.spell) {
      if (me) { this.audio.streakGo(); this.cam.trauma = Math.min(1, this.cam.trauma + 0.5); this.input.rumble(1, 1, 300); this.bigText(`${svg(T.ico)} ${T.nom.toUpperCase()}`, 'fumigène lancé : il arrive là où ça fume', T.col); this.streakUsed = kind; }
      else if (mine) this.toast(`${T.icon} ${a.name} lance : ${T.nom}`, TEAMS[a.team].color);
    } else if (me) this.toast(`${T.icon} ${T.nom} ${kind === 'smoke' ? 'lancé' : 'lancée'}`, '#ddd');
  };
  P.updateThrown = function (dt) {
    if (!this.thr && document.getElementById('throwhud')?.classList.contains('on')) { this.arcHide(); this.drawThrowHud(); }
    this.trailUpdate(dt); this.updateMarks(dt); this.updateRockets(dt); this.updateShells(dt); this.updateDrones(dt); this.updateChutes(dt);
    const L = this.thrown; if (!L) return;
    for (let i = L.length - 1; i >= 0; i--) {
      const g = L[i], T = THROWS[g.kind]; g.t += dt; g.vel.y -= G * dt;
      const d = g.vel.clone().multiplyScalar(dt), len = d.length(); let landed = false;
      if (len > 0) { const h = this.world.ray(g.pos, d.clone().divideScalar(len), len); if (h) { const n = V(...h.n); g.pos.addScaledVector(d.divideScalar(len), h.t * 0.9); if (T.spell && n.y > 0.45) landed = true; else { g.vel.reflect(n).multiplyScalar(0.4); if (len > 0.05) this.audio.play('thud', g.pos, 0.25, [2, 2.6], 0.05); if (T.spell && g.vel.length() < 1) landed = true; } } else g.pos.add(d); }
      g.m.position.copy(g.pos); g.m.rotation.x += g.spin.x * dt; g.m.rotation.z += g.spin.z * dt;
      if (T.spell) { if (((g.tr = (g.tr || 0) - dt)) <= 0) { g.tr = 0.04; this.fx.wisp(g.pos, { color: signalCol(T.col), s0: 0.12, s1: 0.9, a: 0.45, life: 1.1, up: 0.15 }); } }
      else if (g.kind === 'frag') if (((g.tr = (g.tr || 0) - dt)) <= 0) { g.tr = 0.025; this.trailPuff(g.pos, '#ffb070', 0.3, 0.2, 0.15); }
      if (g.kind === 'petards' && Math.random() < dt * 20) this.trailPuff(g.pos.clone().add(V(0, 0.15, 0)), '#ffe9a0', 0.15, 2, 1);
      if (landed || g.t > (T.spell ? 5 : T.fuse) || g.pos.y < -40) { this.root.remove(g.m); L.splice(i, 1); this.detonate(g.kind, g.pos.clone(), g.owner); }
    }
  };
  P.detonate = function (kind, p, owner) {
    const T = THROWS[kind]; p.y = this.world.groundY(p.x, p.z, p.y + 0.4);
    if (kind === 'gas' || kind === 'smoke') { this.fx.cloud(p, kind, owner); this.audio.play('thud', p, 0.8); this.fx.burst(p.clone().add(V(0, 0.3, 0)), 8, { color: kind === 'gas' ? '#e8e6cf' : '#ff4fa0', speed: 3, size: 0.1, life: 0.6 }); return; }
    if (kind === 'frag') { this.boom(p, 6, 120, owner, '#ffb347'); return; }
    this.landSpell(kind, p, owner);
  };
  // explosion générique (grenade, missile, fusée)
  P.boom = function (p, R, dmg, owner, color, opts = {}) {
    const c = p.clone().add(V(0, 0.4, 0)); this.fx.explosion(c); if (opts.fw) this.audio.firework(c); else this.audio.explode(c);
    this.blast(p, R * 0.8, dmg * 3, owner);
    for (const t of this.actors) { if (!t.alive || t.inCar) continue; if (opts.foesOnly && t.team === owner.team) continue; const d = t.pos.distanceTo(p); if (d < R) { const k = 1 - d / R; this.damage(t, dmg * (0.25 + 0.75 * k), owner?.alive ? owner : null, { blast: true, weapon: opts.weapon }); if (t.alive) { const away = V(t.pos.x - p.x, 0, t.pos.z - p.z).normalize(); t.vel.addScaledVector(away, 6 * k); t.vel.y += 4 * k; t.onGround = false; } } }
    for (const car of this.cars) if (!car.dead && car.pos.distanceTo(p) < R) this.hitCar(car, dmg * 1.5, owner);
    const dc = this.player.pos.distanceTo(p); if (dc < R * 5) { this.cam.trauma = Math.min(1, this.cam.trauma + 0.9 * (1 - dc / (R * 5))); this.input.rumble(0.8, 1, 250); }
  };

  // ----- marquage au sol (visible par tous) : la grenade fumigène crache une vraie fumée colorée, un cercle discret
  // montre la zone et une étiquette dit ce qui arrive (en rouge pour le camp visé). Plus de colonne lumineuse.
  // Le premier marquage d'un atout fume ; les suivants (ligne de la frappe, route du bélier) ne posent que le cercle.
  P.mark = function (p, r, color, life, label, opts = {}) {
    const g = new THREE.Group(); const sc = signalCol(color);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: sc, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: sc, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
    ring.scale.setScalar(r); disc.scale.setScalar(r); g.add(ring, disc); g.position.copy(p); g.position.y += 0.06; this.root.add(g);
    const ctx = this._spellCtx; const smoke = opts.smoke ?? !!ctx; if (ctx) this._spellCtx = null;
    if (smoke) { this.fx.cloud(p.clone(), 'signal', null, sc); this.audio.play('thud', p, 0.4, [1.6, 2], 0.05); }
    const k = { g, ring, disc, p: p.clone(), r, color, t: 0, life: Math.max(life, smoke ? 5 : life) };
    if (ctx) k.tag = this.zoneTag(p, ctx, k.life);
    (this.marks ||= []).push(k);
    if (label && this.player.team !== label.team && this.player.pos.distanceTo(p) < r + 30) this.bigText(label.big, label.small, '#ff4a4a');
  };
  // étiquette accrochée à la zone : ce qui arrive et à quelle distance (DOM, projetée chaque image)
  P.zoneTag = function (p, ctx, life) {
    let layer = document.getElementById('zonetags'); if (!layer) { layer = document.createElement('div'); layer.id = 'zonetags'; document.getElementById('hud')?.appendChild(layer); }
    const T = THROWS[ctx.kind]; const foe = ctx.team !== this.player.team; const el = document.createElement('div');
    el.className = 'ztag' + (foe ? ' foe' : ''); el.style.setProperty('--c', foe ? '#ff4a3d' : signalCol(T.col).getStyle());
    el.innerHTML = `<b>${svg(T.ico)} ${foe ? '⚠ ' : ''}${(ctx.nom || T.nom).toUpperCase()}</b><small></small><i></i>`; layer.appendChild(el);
    return { el, sm: el.querySelector('small'), p: p.clone().add(V(0, 3.2, 0)), life, foe };
  };
  const _pv = V();
  P.updateMarks = function (dt) {
    const L = this.marks; if (!L) return;
    for (let i = L.length - 1; i >= 0; i--) { const k = L[i]; k.t += dt; const u = k.t / k.life; const fade = u > 0.75 ? (1 - u) / 0.25 : 1;
      k.ring.material.opacity = 0.5 * fade; k.disc.material.opacity = 0.07 * fade;
      const tg = k.tag; if (tg) { _pv.copy(tg.p).project(this.camera); const el = tg.el;
        if (_pv.z > 1 || Math.abs(_pv.x) > 1.2 || Math.abs(_pv.y) > 1.2) el.style.display = 'none';
        else { el.style.display = ''; el.style.transform = `translate(${((_pv.x * 0.5 + 0.5) * innerWidth) | 0}px,${((-_pv.y * 0.5 + 0.5) * innerHeight) | 0}px) translate(-50%,-100%)`; el.style.opacity = fade;
          const d = Math.round(this.player.pos.distanceTo(k.p)); if (tg.d !== d) { tg.d = d; tg.sm.textContent = tg.foe ? `${d} m · dégage !` : `${d} m`; } } }
      if (u >= 1) { this.root.remove(k.g); k.ring.geometry.dispose(); k.disc.geometry.dispose(); k.ring.material.dispose(); k.disc.material.dispose(); tg?.el.remove(); L.splice(i, 1); } }
  };

  // ----- les sorts
  P.landSpell = function (kind, p, owner) {
    const T = THROWS[kind], team = owner.team, foe = (t) => t.alive && !t.inCar && t.team !== team;
    if (kind === 'petards') {
      this.mark(p, T.r, T.col, 3, { team, big: `${svg('petards')} PÉTARDS`, small: 'les Frungz te sonnent' });
      for (let i = 0; i < 26; i++) this.strikes.push({ t: this.time + i * 0.09 + rnd(0, 0.05), kind: 'petard2', pos: p.clone().add(V(rnd(-T.r, T.r) * 0.8, 0.2, rnd(-T.r, T.r) * 0.8)), owner });
      for (const t of this.actors) if (foe(t) && t.pos.distanceTo(p) < T.r) { t.stunT = 3.5; if (t.ai) { t.ai.target = null; t.ai.react = 1; } this.damage(t, 12, owner.alive ? owner : null, { blast: true }); if (t === this.player) { this.cam.trauma = 1; this.input.rumble(1, 1, 500); } }
    } else if (kind === 'emeute' || kind === 'crs') {
      this.mark(p, 4, T.col, 4); this.reinforce(owner, 4, p, false);
      if (this.player.team !== team && this.player.pos.distanceTo(p) < 60) this.toast(kind === 'crs' ? '🪂 Des CRS tombent du ciel !' : '🪂 Des renforts émeutiers sont largués !', '#ff4a4a');
    } else if (kind === 'artifice' || kind === 'lacry') {
      // tirés depuis le sol, au bout de la rue la plus dégagée : lance-grenades de la Brigade, mortiers d'artifice des Frungz.
      // Chaque obus monte en cloche (on le voit partir et retomber) ; la lacrymo fume en vol puis dégage son gaz au sol.
      const fw = kind === 'artifice', n = fw ? 12 : 8;
      this.mark(p, T.r, T.col, 5, { team, big: fw ? `${svg('artifice')} MORTIERS D'ARTIFICE` : `${svg('missile')} SALVE LACRYMOGÈNE`, small: 'ça part du bout de la rue : sors de la zone !' });
      const path = this.convoyPath ? this.convoyPath(p, 40) : { dir: V(1, 0, 0), len: 30 };
      const base = p.clone().addScaledVector(path.dir, Math.max(14, path.len)); base.y = this.world.groundY(base.x, base.z, p.y + 3) + 1.2;
      for (let i = 0; i < n; i++) { const tgt = p.clone().add(V(rnd(-1, 1) * T.r * 0.75, 0, rnd(-1, 1) * T.r * 0.75)); tgt.y = this.world.groundY(tgt.x, tgt.z, p.y + 2);
        (this.pendingShells ||= []).push({ at: this.time + 1 + i * (fw ? 0.22 : 0.35), kind, start: base.clone().add(V(rnd(-1.2, 1.2), 0, rnd(-1.2, 1.2))), tgt, owner }); }
    } else if (kind === 'drone') {
      const m = droneMesh(); const from = owner.pos.clone().add(V(0, 1.6, 0)); m.position.copy(from); this.root.add(m);
      (this.drones ||= []).push({ m, p: p.clone(), from, t: 0, life: 25, owner, team, go: Math.min(5, 1 + from.distanceTo(p) / 14) });
      this.mark(p, T.ringR, T.col, 2);
      if (this.player.team !== team) this.toast('🛸 Un drone de la Brigade survole le secteur : tu es repéré', '#ff4a4a');
    }
  };
  P.updateRockets = function (dt) {
    const Q = this.pendingRockets; if (Q) for (let i = Q.length - 1; i >= 0; i--) { const q = Q[i]; if (this.time < q.at) continue; Q.splice(i, 1);
      const m = rocketMesh(q.kind); m.position.copy(q.start); this.root.add(m); const sp = q.kind === 'fw' ? 50 : 62; const v = q.tgt.clone().sub(q.start).normalize().multiplyScalar(sp);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), v.clone().normalize()); (this.rockets ||= []).push({ ...q, m, pos: q.start.clone(), vel: v, t: 0 }); this.audio.whistle(q.tgt, q.start.distanceTo(q.tgt) / sp); }
    const L = this.rockets; if (!L) return;
    for (let i = L.length - 1; i >= 0; i--) { const r = L[i]; r.t += dt; r.pos.addScaledVector(r.vel, dt); r.m.position.copy(r.pos);
      if (q2(r)) { this.trailPuff(r.pos, r.kind === 'fw' ? r.m.userData.c : '#ffd9a0', r.kind === 'fw' ? 0.5 : 0.25, 0.3, 0.2); if (r.kind !== 'fw' || Math.random() < 0.4) this.fx.wisp(r.pos, { color: r.kind === 'fw' ? '#cfcac0' : '#b9b6b0', s0: 0.3, s1: 1.8, a: 0.4, life: 1.8, up: 0.2 }); }
      const gy = this.world.groundY(r.pos.x, r.pos.z, r.pos.y + 1);
      if (r.pos.y <= gy + 0.2 || r.pos.distanceTo(r.tgt) < 0.6 || r.t > 4) { this.root.remove(r.m); L.splice(i, 1); const p = r.pos.clone(); p.y = gy;
        if (r.kind === 'fw') { // gerbe de couleurs + dégâts
          const c = r.m.userData.c; for (let k = 0; k < 40; k++) this.trailPuff(p.clone().add(V(0, 2.5, 0)), pick([c, c, '#ffffff', '#ffd23d']), rnd(0.6, 1.3), rnd(-2, 7), 7);
          this.boom(p, 5, 75, r.owner, c, { fw: true, foesOnly: true });
        } else { this.boom(p, 6, 95, r.owner, '#ffb347', { foesOnly: true }); if (Math.random() < 0.6) this.fx.cloud(p, 'gas', r.owner); }
      } }
    function q2(r) { r.tp = (r.tp || 0) - dt; if (r.tp <= 0) { r.tp = 0.02; return true; } return false; }
  };
  P.updateShells = function (dt) {
    const Q = this.pendingShells; if (Q) for (let i = Q.length - 1; i >= 0; i--) { const q = Q[i]; if (this.time < q.at) continue; Q.splice(i, 1);
      const fw = q.kind === 'artifice'; const v = solveThrow(q.start, q.tgt, fw ? 1.45 : 1.25); const m = shellMesh(q.kind); m.position.copy(q.start); this.root.add(m);
      (this.shells ||= []).push({ ...q, m, pos: q.start.clone(), vel: v, t: 0 });
      // départ visible : lueur et fumée au tube, coup sourd
      this.fx.muzzle?.(q.start.clone(), 1.6); for (let k = 0; k < 3; k++) this.fx.wisp(q.start, { color: '#bdb9b0', s0: 0.4, s1: 2.4, a: 0.45, life: 2, vel: v.clone().normalize().multiplyScalar(3) });
      this.audio.play('thud', q.start, 0.9, [0.5, 0.65], 0.05); }
    const L = this.shells; if (!L) return;
    for (let i = L.length - 1; i >= 0; i--) { const r = L[i]; r.t += dt; r.vel.y -= G * dt; r.pos.addScaledVector(r.vel, dt); r.m.position.copy(r.pos); r.m.quaternion.setFromUnitVectors(V(0, 1, 0), r.vel.clone().normalize());
      const fw = r.kind === 'artifice';
      if ((r.tp = (r.tp || 0) - dt) <= 0) { r.tp = fw ? 0.02 : 0.05; if (fw) this.trailPuff(r.pos, pick(['#ffd27a', '#ffb347', '#fff1c0']), 0.35, -0.5, 0.6); else this.fx.wisp(r.pos, { color: '#e2e1d6', s0: 0.15, s1: 1.1, a: 0.5, life: 1.3, up: 0.1 }); }
      const gy = this.world.groundY(r.pos.x, r.pos.z, r.pos.y + 1);
      const burstHere = fw && r.vel.y < 0 && r.pos.y < r.tgt.y + 2.2;
      if (burstHere || r.pos.y <= gy + 0.1 || r.t > 6) { this.root.remove(r.m); L.splice(i, 1); const p = r.pos.clone(); p.y = Math.max(gy, Math.min(p.y, gy + 2.2));
        if (fw) { const c = pick(['#ff4fa0', '#ffd23d', '#5ad1ff', '#9ff59f', '#c27bff']); for (let k = 0; k < 36; k++) this.trailPuff(p.clone(), pick([c, c, '#ffffff', '#ffd23d']), rnd(0.5, 1.1), rnd(-2, 5), 7);
          this.boom(p, 5, 75, r.owner, c, { fw: true, foesOnly: true }); }
        else { p.y = gy; // la grenade lacrymogène ne détone pas : elle tombe, rebondit un peu et crache son gaz
          this.audio.play('thud', p, 0.5, [1.4, 1.8], 0.05); this.fx.cloud(p, 'gas', r.owner);
          for (const t of this.actors) if (t.alive && !t.inCar && t.team !== r.owner.team && t.pos.distanceTo(p) < 1.6) this.damage(t, 30, r.owner?.alive ? r.owner : null, { blast: true }); }
      } }
  };
  P.updateDrones = function (dt) {
    const L = this.drones; if (!L) return;
    for (let i = L.length - 1; i >= 0; i--) { const d = L[i]; d.t += dt; const u = d.m.userData;
      const h = 14; d.m.position.set(d.p.x + Math.sin(d.t * 0.6) * 3, d.p.y + 0.3 + h, d.p.z + Math.cos(d.t * 0.45) * 3);
      if (d.from && d.t < d.go) { const k = d.t / d.go, e = k * k * (3 - 2 * k); d.m.position.lerpVectors(d.from, d.m.position, e); d.m.position.y = d.from.y + (d.m.position.y - d.from.y) * Math.min(1, k * 2.5); } d.m.rotation.y += dt * 0.6; d.m.rotation.z = Math.sin(d.t * 1.3) * 0.06;
      for (const r of u.rotors) r.rotation.y += dt * 60; const blink = Math.sin(d.t * 12) > 0; u.l1.visible = blink; u.l2.visible = !blink;
      if ((d.rt = (d.rt || 0) - dt) <= 0) { d.rt = 0.5; for (const t of this.actors) if (t.alive && t.team !== d.team && t.pos.distanceTo(d.p) < THROWS.drone.r) t.spotted = this.time; if (this.player.pos.distanceTo(d.m.position) < 40) this.audio.buzz(d.m.position, 0.5); }
      if (d.t > d.life) { d.m.position.y += dt * 20; if (d.t > d.life + 1.5) { this.root.remove(d.m); L.splice(i, 1); } } }
  };
  // renforts largués en parachute (les deux camps)
  P.updateChutes = function (dt) {
    for (const a of this.actors) { const c = a.chute; if (!c) continue;
      if (!a.alive) { this.root.remove(c.m); a.chute = null; continue; }
      c.y -= c.vy * dt; const gy = this.world.groundY(a.pos.x, a.pos.z, c.y);
      if (c.y <= gy + 0.05) { this.root.remove(c.m); a.chute = null; a.pos.y = gy; this.fx.ring(a.pos, TEAMS[a.team].color); this.fx.dust?.(a.pos, 8); continue; }
      a.pos.y = c.y; a.vel.set(0, 0, 0); a.onGround = false; c.sway += dt;
      c.m.position.set(a.pos.x, c.y + 3.6, a.pos.z); c.m.rotation.z = Math.sin(c.sway * 2) * 0.15; c.m.rotation.x = Math.cos(c.sway * 1.6) * 0.1; }
  };
  P.startChute = function (t, p) {
    const m = chute(t.team); this.root.add(m); t.chute = { y: p.y + rnd(28, 40), vy: 7, m, sway: rnd(0, 6) }; t.pos.y = t.chute.y;
  };
}
