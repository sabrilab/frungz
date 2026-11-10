// Convois de série (12 et 21 éliminations) : des camions qui arrivent par la rue la plus dégagée.
// - Brigade : camion lanceur d'eau (balaie et renverse les Frungz 30 s), escouade militaire (2 camions, 8 soldats)
// - Frungz : camion-bélier (fonce à travers la zone, écrase tout, explose au bout), bande organisée (2 fourgons, 8 Frungz)
// Léger : boîtes et cylindres partagés, aucune lumière, jet d'eau en particules du pool des traînées.
import * as THREE from 'three';
import { TEAMS, WEAPONS } from './data.js';
import { THROWS } from './throws.js';
import { svg } from './icons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
const $ = (id) => document.getElementById(id);

Object.assign(THROWS, {
  eau: { spell: 1, nom: "Camion lanceur d'eau", icon: '', ico: 'water', r: 6, col: '#5ab4ff' },
  armee: { spell: 1, nom: 'Escouade militaire', icon: '', ico: 'truck', r: 5, col: '#7d8f4e' },
  belier: { spell: 1, nom: 'Camion-bélier', icon: '', ico: 'ram', r: 4, col: '#ff7a2f' },
  bande: { spell: 1, nom: 'Bande organisée', icon: '', ico: 'truck', r: 5, col: '#34c759' },
});

// ------------------------------------------------------------------ maillages
const MAT = {}; const mat = (c, e = 0) => MAT[c + e] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, flatShading: true, emissive: e ? c : '#000', emissiveIntensity: e });
const GEO = {}; const box = (w, h, d) => GEO[`${w}|${h}|${d}`] ||= new THREE.BoxGeometry(w, h, d);
const WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10).rotateZ(Math.PI / 2);
const part = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
const LOOK = {
  eau: { body: '#1c2a44', cab: '#e9eef5', len: 7.5 },
  armee: { body: '#4f5a35', cab: '#5d6a3e', len: 7, bache: '#6b7148' },
  belier: { body: '#2a2a2a', cab: '#e0592a', len: 8 },
  bande: { body: '#e9e6df', cab: '#e9e6df', len: 5.2, stripe: '#2f8f4e' },
};
// camion orienté vers +z, roues au sol (y = 0)
function truckMesh(kind) {
  const L = LOOK[kind], g = new THREE.Group(), dark = mat('#1b1d21'), body = mat(L.body), cab = mat(L.cab);
  const len = L.len, cabL = 2.2, back = len - cabL;
  g.add(part(box(2.5, 0.5, len), dark, 0, 0.75, 0));
  g.add(part(box(2.5, 2.1, cabL), cab, 0, 1.95, len / 2 - cabL / 2), part(box(2.3, 0.8, 0.1), mat('#7fb6d9', 0.15), 0, 2.4, len / 2 + 0.01));
  const wheels = []; for (const z of [len / 2 - 1.2, -len / 2 + 1.3, ...(len > 6 ? [-len / 2 + 2.5] : [])]) for (const x of [-1.25, 1.25]) { const w = part(WHEEL, dark, x, 0.5, z); g.add(w); wheels.push(w); }
  const ud = { wheels };
  if (kind === 'eau') {
    g.add(part(box(2.5, 2.2, back), body, 0, 2, -cabL / 2), part(box(2.52, 0.3, back), mat('#e9eef5'), 0, 1.4, -cabL / 2));
    const tur = new THREE.Group(); tur.position.set(0, 3.3, 0.6); const base = part(box(0.9, 0.5, 0.9), dark); const noz = new THREE.Group(); noz.add(part(box(0.22, 0.22, 1.6), mat('#9aa3ad'), 0, 0, 0.8)); noz.position.y = 0.2; tur.add(base, noz); g.add(tur);
    const l1 = part(box(0.5, 0.15, 0.25), mat('#2a6bff', 3), -0.6, 3.05, len / 2 - 0.4), l2 = part(box(0.5, 0.15, 0.25), mat('#ff2a2a', 3), 0.6, 3.05, len / 2 - 0.4); g.add(l1, l2);
    Object.assign(ud, { tur, noz, l1, l2 });
  } else if (kind === 'armee') {
    g.add(part(box(2.5, 0.9, back), body, 0, 1.45, -cabL / 2), part(box(2.4, 1.6, back - 0.1), mat(L.bache), 0, 2.7, -cabL / 2));
  } else if (kind === 'belier') {
    g.add(part(box(2.6, 2.4, back), body, 0, 2.15, -cabL / 2));
    g.add(part(box(3.2, 1.5, 0.35), mat('#8d949c'), 0, 1.25, len / 2 + 0.3), part(box(0.3, 0.3, 1), dark, -1, 1.2, len / 2), part(box(0.3, 0.3, 1), dark, 1, 1.2, len / 2));
  } else {
    g.add(part(box(2.3, 2.1, back), body, 0, 1.95, -cabL / 2), part(box(2.32, 0.35, back), mat(L.stripe), 0, 1.6, -cabL / 2));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.userData = ud; return g;
}

export function installConvois(Game) {
  const P = Game.prototype;
  const credit = (o) => (o?.alive ? o : null);

  // rue la plus dégagée autour du point visé : le convoi arrive par là
  P.convoyPath = function (p, want = 45) {
    let best = null, bl = -1; const o = p.clone().add(V(0, 1.3, 0));
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, d = V(Math.cos(a), 0, Math.sin(a)); const h = this.world.ray(o, d, want); const L = h ? h.t - 2 : want; if (L > bl) { bl = L; best = d; } }
    return { dir: best, len: Math.max(6, bl) };
  };

  const landSpell = P.landSpell;
  P.landSpell = function (kind, p, owner) {
    if (kind === 'eau' || kind === 'armee' || kind === 'bande') return this.startConvoy(kind, owner, p);
    if (kind === 'belier') return this.startRam(owner, p);
    return landSpell.call(this, kind, p, owner);
  };
  const updateThrown = P.updateThrown;
  P.updateThrown = function (dt) { updateThrown.call(this, dt); this.updateConvoys(dt); };

  P.addTruck = function (kind, owner, from, to, opts = {}) {
    const m = truckMesh(kind); m.position.copy(from); m.lookAt(to.x, from.y, to.z); this.root.add(m);
    const T = { kind, owner, team: owner.team, m, from: from.clone(), to: to.clone(), t: -(opts.delay || 0), state: 'arrive', speed: opts.speed || 14, ...opts };
    T.m.visible = T.t >= 0; (this.convoys ||= []).push(T); return T;
  };

  // ----- camions qui s'arrêtent : canon à eau, escouades
  P.startConvoy = function (kind, owner, p) {
    const TH = THROWS[kind], team = owner.team; this.mark(p, TH.r, TH.col, 4);
    const { dir, len } = this.convoyPath(p); const side = V(-dir.z, 0, dir.x);
    const n = kind === 'eau' ? 1 : 2;
    for (let i = 0; i < n; i++) { const off = n > 1 ? (i ? 2.2 : -2.2) : 0; const stop = p.clone().addScaledVector(side, off).addScaledVector(dir, i * 1.5);
      const from = stop.clone().addScaledVector(dir, len); from.y = this.world.groundY(from.x, from.z, p.y + 2); stop.y = this.world.groundY(stop.x, stop.z, p.y + 2);
      this.addTruck(kind, owner, from, stop, { delay: i * 0.6, life: kind === 'eau' ? 30 : 3 }); }
    this.audio.play('slam', p, 0.6);
    if (this.player.team !== team && this.player.pos.distanceTo(p) < 70) this.bigText(kind === 'eau' ? `${svg('water')} CANON À EAU !` : kind === 'armee' ? `${svg('truck')} L'ARMÉE DÉBARQUE !` : `${svg('truck')} LA BANDE DÉBARQUE !`, kind === 'eau' ? 'il va te balayer : à couvert !' : '8 renforts adverses arrivent', '#ff4a4a', 't4');
  };
  P.deploySquad = function (T) {
    const mil = T.kind === 'armee'; const back = T.m.position.clone().addScaledVector(V(Math.sin(T.m.rotation.y), 0, Math.cos(T.m.rotation.y)), -4);
    const list = this.reinforce(T.owner, 4, back, false) || [];
    for (const t of list) { const k = (this._squadN = (this._squadN || 0) + 1);
      t.name = mil ? `Soldat ${pick(['Martin', 'Bernard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Garnier', 'Lambert'])}` : pick(['Le Fauve', 'Tonton', 'Mamadou', 'Le Rital', 'Bébert', 'La Pieuvre', 'Le Gitan', 'Zorro']) + (k > 8 ? ` ${k}` : '');
      t.armor = mil ? 150 : 90; t.expire = this.time + 55;
      const id = mil ? pick(['rifle', 'carabine', 'mitrailleuse']) : pick(['rifle', 'shotgun', 'rafale']); if (WEAPONS[id]) { t.slots[1] = { id, rarity: mil ? 'legendaire' : 'epique', mag: WEAPONS[id].mag }; this.equip(t, 1, true); }
      t.vel.addScaledVector(V(rnd(-1, 1), 0, rnd(-1, 1)), 3); }
    this.fx.burst(back.clone().add(V(0, 1, 0)), 10, { color: '#bfb2a0', speed: 2, size: 0.2, life: 0.8 });
    if (T.owner === this.player) this.toast(`${mil ? 'Escouade militaire' : 'Bande organisée'} déployée`, TEAMS[T.team].color);
  };
  P.waterTick = function (T, dt) {
    const u = T.m.userData, bl = Math.sin(T.t * 10) > 0; u.l1.visible = bl; u.l2.visible = !bl;
    if ((T.look = (T.look || 0) - dt) <= 0) { T.look = 0.3; T.tgt = null; let best = 28 * 28; const o = T.m.position.clone().add(V(0, 3.5, 0));
      for (const t of this.actors) { if (!t.alive || t.gone || t.team === T.team || t.inCar) continue; const d2 = t.pos.distanceToSquared(T.m.position); if (d2 > best) continue;
        const aim = t.pos.clone().add(V(0, 1, 0)), dir = aim.clone().sub(o), L = dir.length(); dir.divideScalar(L); const h = this.world.ray(o, dir, L); if (h && h.t < L - 0.6) continue; best = d2; T.tgt = t; } }
    if (!T.tgt?.alive) { u.tur.rotation.y += dt * 0.6; return; }
    // tourelle vers la cible (repère local du camion)
    const loc = T.m.worldToLocal(T.tgt.pos.clone().add(V(0, 1, 0))); const yaw = Math.atan2(loc.x - u.tur.position.x, loc.z - u.tur.position.z);
    let dy = yaw - u.tur.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); u.tur.rotation.y += dy * Math.min(1, dt * 6);
    const flat = Math.hypot(loc.x - u.tur.position.x, loc.z - u.tur.position.z); u.noz.rotation.x = -Math.atan2(loc.y - u.tur.position.y, flat) * 0.9;
    if (Math.abs(dy) > 0.5) return;
    const o = V(0, 0, 1.6); u.noz.localToWorld(o); const end = T.tgt.pos.clone().add(V(rnd(-0.3, 0.3), 1 + rnd(-0.3, 0.3), rnd(-0.3, 0.3))); const seg = end.clone().sub(o);
    if ((T.sp = (T.sp || 0) - dt) <= 0) { T.sp = 0.03; for (let i = 0; i < 3; i++) { const k = Math.random(); const q = o.clone().addScaledVector(seg, k); q.y += Math.sin(k * Math.PI) * 0.6; this.trailPuff(q, pick(['#cfe9ff', '#9fd0ff', '#ffffff']), 0.35, rnd(-0.5, 0.5), 0.5); }
      this.trailPuff(end, '#ffffff', 0.5, 1.5, 1.6); }
    if ((T.snd = (T.snd || 0) - dt) <= 0) { T.snd = 0.45; this.audio.water(o, 0.5); }
    // le jet pousse et renverse tout ce qui est au bout
    const push = V(seg.x, 0, seg.z).normalize();
    for (const t of this.actors) { if (!t.alive || t.team === T.team || t.inCar || t.pos.distanceTo(end) > 2.4) continue;
      t.vel.addScaledVector(push, 22 * dt); if (t.onGround) { t.vel.y = Math.max(t.vel.y, 2.5); t.onGround = false; } t.stunT = Math.max(t.stunT || 0, 0.6);
      if ((t._wet = (t._wet || 0) - dt) <= 0) { t._wet = 0.25; this.damage(t, 4, credit(T.owner), { ico: 'water' }); }
      if (t === this.player) { this.cam.trauma = Math.min(1, this.cam.trauma + dt * 2); if ((this._wetF = (this._wetF || 0) - dt) <= 0) { this._wetF = 0.4; this.flash('radial-gradient(ellipse at center, rgba(200,230,255,.15), rgba(160,210,255,.6))'); } } }
  };

  // ----- camion-bélier : traverse la zone à pleine vitesse
  P.startRam = function (owner, p) {
    const TH = THROWS.belier, team = owner.team; const { dir, len } = this.convoyPath(p, 50);
    const from = p.clone().addScaledVector(dir, len); from.y = this.world.groundY(from.x, from.z, p.y + 2);
    // il continue tout droit après la cible jusqu'au premier obstacle (au plus 30 m)
    const ahead = dir.clone().negate(); const h = this.world.ray(p.clone().add(V(0, 1.3, 0)), ahead, 30); const to = p.clone().addScaledVector(ahead, h ? Math.max(0, h.t - 3) : 30); to.y = this.world.groundY(to.x, to.z, p.y + 2);
    for (const s of [0, 0.5, 1]) { const q = from.clone().lerp(to, s); q.y = this.world.groundY(q.x, q.z, p.y + 2); this.mark(q, 3.2, TH.col, 5, s === 0.5 ? { team, big: `${svg('ram')} CAMION-BÉLIER !`, small: 'sors de sa route !' } : null); }
    this.addTruck('belier', owner, from, to, { delay: 1.6, speed: 26, ram: true });
  };
  P.ramTick = function (T) {
    const p = T.m.position;
    if ((T.hit = (T.hit || 0) - 1) <= 0) { T.hit = 3; // toutes les 3 images
      for (const t of this.actors) { if (!t.alive || t.gone || t.inCar) continue; const dx = t.pos.x - p.x, dz = t.pos.z - p.z; if (dx * dx + dz * dz > 3.2 * 3.2 || Math.abs(t.pos.y - p.y) > 2.5) continue;
        if (t.team !== T.team) this.damage(t, 250, credit(T.owner), { blast: true, ico: 'ram' });
        const away = V(dx, 0, dz).normalize(); t.vel.addScaledVector(away, 9).add(V(0, 5, 0)); t.onGround = false; }
      this.world.cass?.blast(p, 3.2, 500, T.owner); this.blastWalls?.(p, 2.5, 900, T.owner);
      for (const car of this.cars) if (!car.dead && car.pos.distanceTo(p) < 4) this.hitCar(car, 400, T.owner); }
    if (p.distanceToSquared(this.player.pos) < 400) this.cam.trauma = Math.min(1, this.cam.trauma + 0.05);
  };

  // ----- boucle
  P.updateConvoys = function (dt) {
    const L = this.convoys; if (!L) return;
    for (let i = L.length - 1; i >= 0; i--) { const T = L[i]; T.t += dt; if (T.t < 0) continue; const m = T.m; m.visible = true;
      let keep = true;
      if (T.state === 'arrive') {
        const rest = T.to.clone().sub(m.position); rest.y = 0; const d = rest.length(); const sp = T.ram ? T.speed : Math.min(T.speed, 1.5 + d * 1.6);
        const step = Math.min(d, sp * dt); if (d > 0.05) m.position.addScaledVector(rest.divideScalar(d), step);
        m.position.y = this.world.groundY(m.position.x, m.position.z, m.position.y + 1.5); for (const w of m.userData.wheels) w.rotation.x += step / 0.5;
        if ((T.dust = (T.dust || 0) - dt) <= 0) { T.dust = 0.08; this.trailPuff(m.position.clone().add(V(rnd(-1, 1), 0.3, 0)), '#8a8378', 0.8, 0.4, 0.5); }
        if (T.ram) { this.ramTick(T); if ((T.snd = (T.snd || 0) - dt) <= 0) { T.snd = 0.3; this.audio.play('slam', m.position, 0.5, [0.6, 0.8], 0.1); } }
        if (d < 0.1) { T.state = 'work'; T.t0 = T.t;
          if (T.ram) { this.boom(m.position.clone(), 7, 160, T.owner, '#ffb347', { foesOnly: true }); this.fx.burst(m.position.clone().add(V(0, 1.5, 0)), 20, { color: '#3a3a3a', speed: 5, size: 0.4, life: 1.5 }); keep = false; }
          else if (T.kind !== 'eau') this.deploySquad(T); }
      } else if (T.state === 'work') {
        if (T.kind === 'eau') this.waterTick(T, dt);
        if (T.t - T.t0 > T.life) { T.state = 'leave'; T.t1 = T.t; }
      } else { // repart en marche arrière et s'efface
        const back = T.from.clone().sub(m.position); back.y = 0; const d = back.length(); if (d > 0.1) m.position.addScaledVector(back.divideScalar(d), Math.min(d, 9 * dt));
        m.position.y = this.world.groundY(m.position.x, m.position.z, m.position.y + 1.5); if (T.t - T.t1 > 4 || d < 0.2) keep = false; }
      if (!keep) { this.root.remove(m); L.splice(i, 1); } }
  };
}
