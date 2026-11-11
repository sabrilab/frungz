// Mini-hélicoptères monoplaces : des multicoptères d'une place (quatre rotors carénés, une coque ouverte, le pilote assis dedans).
// On décolle, on survole le quartier et les toits, on tire à la mitrailleuse de bord… et on peut se faire abattre :
// la coque encaisse les balles, le pilote reste exposé, et un engin dont le pilote meurt part en vrille et explose au sol.
// Les éliminations faites en vol débloquent l'arsenal de l'engin : missiles guidés, salve de roquettes, puis un tir « stylé »
// propre à chaque camp (missile à fragmentation pour la Brigade, bouquet final pour les Frungz).
// Modèles low-poly générés dans le code (aucune marque) ; les pièces fixes sont fusionnées par matière (~16 dessins par engin).
// Repère des modèles : mètres, sol y = 0, avant +Z, gauche +X (même convention que les voitures et les motos).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointInPoly } from './world.js';
import { svg } from './icons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const GRAV = 19;

// ---------------------------------------------------------------- caractéristiques
export const HELIS = {
  brigade: { nom: 'Drone de la Brigade', camp: 'ordre', police: true, body: '#1b2a48', accent: '#e9eef5', arm: '#20242b', light: '#2a6bff', hp: 340 },
  frungz: { nom: 'Mini-hélico des Frungz', camp: 'civils', body: '#d9531e', accent: '#17191d', arm: '#1d2026', light: '#ffb020', hp: 300 },
  civil: { nom: 'Mini-hélico de location', camp: null, body: '#e8e6e0', accent: '#c0141a', arm: '#2a2d33', light: '#ffb020', hp: 300 },
};
const SEAT = [0, 0.55, -0.22];
const ROTORS = [['rotor-fl', 1, 0.75], ['rotor-fr', -1, 0.75], ['rotor-rl', 1, -1.15], ['rotor-rr', -1, -1.15]];
const ARSENAL = {
  missile: { nom: 'Missiles guidés', ico: 'missile' },
  roquettes: { nom: 'Salve de roquettes', ico: 'artifice' },
  style: { ordre: { nom: 'Missile à fragmentation', ico: 'nuke' }, civils: { nom: 'Bouquet final', ico: 'artifice' } },
};
const ORDER = ['missile', 'roquettes', 'style'];
const arsName = (k, team) => (k === 'style' ? ARSENAL.style[team] || ARSENAL.style.civils : ARSENAL[k]);

// ---------------------------------------------------------------- matières et formes
const MATS = {};
function mat(color, o = {}) {
  const key = color + JSON.stringify(o); if (MATS[key]) return MATS[key];
  return (MATS[key] = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.5, metalness: o.m ?? 0.15, flatShading: true, emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1, transparent: o.t != null, opacity: o.t ?? 1, depthWrite: o.t == null, side: o.ds ? THREE.DoubleSide : THREE.FrontSide }));
}
function part(parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); parent.add(o); return o;
}
function tube(parent, a, b, r, m, seg = 6) {
  const d = b.clone().sub(a), L = d.length(); const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg), m);
  o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); parent.add(o); return o;
}
const node = (parent, name, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
// pièces fixes regroupées par matière : un maillage par matière au lieu d'une centaine
function mergeByMaterial(group) {
  group.updateMatrixWorld(true); const by = new Map();
  group.traverse((o) => { if (!o.isMesh) return; const g = o.geometry.index ? o.geometry.clone() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(g); });
  const out = new THREE.Group(); out.name = 'coque';
  for (const [m, list] of by) { const geo = mergeGeometries(list, false); if (!geo) continue; const mesh = new THREE.Mesh(geo, m); mesh.castShadow = !m.transparent; mesh.receiveShadow = true; out.add(mesh); }
  return out;
}

function missileMesh(scale = 1, color = '#d9dde2') {
  // deux dessins par missile : corps et ailerons fusionnés, ogive rouge
  const g = new THREE.Group(); const body = mat(color, { r: 0.35, m: 0.6 });
  GEO.mBody ||= mergeGeometries([new THREE.CylinderGeometry(0.06, 0.06, 0.62, 8).rotateX(Math.PI / 2), new THREE.BoxGeometry(0.22, 0.01, 0.1).translate(0, 0, -0.26), new THREE.BoxGeometry(0.01, 0.22, 0.1).translate(0, 0, -0.26)].map((x) => x.toNonIndexed()), false);
  part(g, GEO.mBody, body);
  part(g, GEO.mNose ||= new THREE.ConeGeometry(0.06, 0.16, 8).rotateX(Math.PI / 2), mat('#b8322a'), 0, 0, 0.39);
  g.scale.setScalar(scale); return g;
}
const GEO = {};

function buildHeli(type) {
  const S = HELIS[type]; const g = new THREE.Group(); const st = new THREE.Group();
  const body = mat(S.body, { r: 0.45, m: 0.25, ds: true }), acc = mat(S.accent, { r: 0.5 }), arm = mat(S.arm, { r: 0.55, m: 0.3 }), metal = mat('#8d939b', { r: 0.3, m: 0.75 });
  const dark = mat('#16171a', { r: 0.85 }), glass = mat('#a9d2ea', { r: 0.05, m: 0.2, t: 0.32 }), lamp = mat('#fff6dc', { e: '#fff1c8', ei: 1.4 });
  // coque : moitié basse d'un œuf, ouverte sur le dessus, avec un rebord et une bande de couleur
  part(st, new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), body, 0, 0.8, 0.05, 0, 0, 0, 0.6, 0.5, 1.0);
  part(st, new THREE.TorusGeometry(1, 0.035, 4, 18), acc, 0, 0.93, 0.05, Math.PI / 2, 0, 0, 0.585, 0.975, 1.2);
  part(st, new THREE.TorusGeometry(1, 0.03, 4, 18), acc, 0, 0.62, 0.05, Math.PI / 2, 0, 0, 0.57, 0.95, 1.6);
  // pare-brise incliné, phare sous le nez
  part(st, new THREE.CylinderGeometry(0.6, 0.6, 0.42, 12, 1, true, -0.62, 1.24), glass, 0, 1.13, 0.18, -0.38, 0, 0, 1, 1, 1.45);
  part(st, new THREE.BoxGeometry(0.22, 0.07, 0.04), lamp, 0, 0.5, 1.0);
  // siège baquet, manches latéraux, repose-pieds
  part(st, new THREE.BoxGeometry(0.48, 0.08, 0.46), dark, ...SEAT.map((v, i) => (i === 1 ? v - 0.04 : v)));
  part(st, new THREE.BoxGeometry(0.46, 0.46, 0.09), dark, 0, 0.84, -0.5, -0.16); // dossier bas : le pilote reste visible de dos
  part(st, new THREE.BoxGeometry(0.5, 0.06, 0.18), arm, 0, 0.36, 0.5);
  for (const sx of [-1, 1]) { tube(st, V(sx * 0.31, 0.56, 0.08), V(sx * 0.3, 0.8, 0.12), 0.02, metal); part(st, new THREE.BoxGeometry(0.045, 0.09, 0.05), dark, sx * 0.3, 0.84, 0.12); }
  // pylône derrière le siège et bloc batterie
  part(st, new THREE.BoxGeometry(0.62, 0.42, 0.42), arm, 0, 1.0, -0.82);
  part(st, new THREE.BoxGeometry(0.1, 0.62, 0.14), arm, 0, 1.3, -0.62);
  part(st, new THREE.BoxGeometry(0.34, 0.16, 0.34), arm, 0, 1.6, -0.52);
  // bras, moteurs, carénages des hélices, feux de position
  const hub = V(0, 1.6, -0.52);
  for (const [, sx, z] of ROTORS) {
    const c = V(sx * 1.0, 1.55, z); tube(st, hub, c, 0.05, arm); tube(st, V(sx * 0.3, 1.05, z * 0.4 - 0.4), c.clone().add(V(-sx * 0.25, -0.05, 0)), 0.03, arm);
    part(st, GEO.motor ||= new THREE.CylinderGeometry(0.09, 0.1, 0.16, 8), metal, c.x, c.y - 0.04, c.z);
    part(st, GEO.duct ||= new THREE.TorusGeometry(0.56, 0.05, 5, 20), acc, c.x, c.y, c.z, Math.PI / 2);
    part(st, GEO.duct2 ||= new THREE.CylinderGeometry(0.58, 0.58, 0.14, 20, 1, true), arm, c.x, c.y, c.z);
    part(st, GEO.nav ||= new THREE.BoxGeometry(0.07, 0.07, 0.07), mat(sx > 0 ? '#ff2a2a' : '#2aff6b', { e: sx > 0 ? '#ff2a2a' : '#2aff6b', ei: 2 }), c.x + sx * 0.6, c.y, c.z);
  }
  // patins
  for (const sx of [-1, 1]) {
    tube(st, V(sx * 0.52, 0.04, -0.9), V(sx * 0.52, 0.04, 0.72), 0.035, metal); tube(st, V(sx * 0.52, 0.04, 0.72), V(sx * 0.52, 0.18, 0.95), 0.035, metal);
    tube(st, V(sx * 0.52, 0.04, 0.42), V(sx * 0.32, 0.42, 0.36), 0.03, metal); tube(st, V(sx * 0.52, 0.04, -0.56), V(sx * 0.32, 0.44, -0.5), 0.03, metal);
  }
  // mitrailleuses jumelées sous la coque, rails des missiles sur les flancs
  for (const sx of [-1, 1]) {
    part(st, new THREE.BoxGeometry(0.1, 0.12, 0.34), dark, sx * 0.4, 0.5, 0.58); part(st, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), metal, sx * 0.4, 0.52, 0.98, Math.PI / 2);
    part(st, new THREE.BoxGeometry(0.06, 0.04, 0.8), arm, sx * 0.66, 0.74, 0.12); tube(st, V(sx * 0.5, 0.72, 0.12), V(sx * 0.66, 0.74, 0.12), 0.025, arm);
  }
  if (S.police) for (const sx of [-1, 1]) part(st, new THREE.BoxGeometry(0.02, 0.1, 0.5), mat('#e9eef5'), sx * 0.6, 0.78, -0.3);
  g.add(mergeByMaterial(st));
  // pièces animées : hélices (pales + disque flou), missiles visibles sur les rails, gyrophares
  const blade = GEO.blade ||= new THREE.BoxGeometry(1.0, 0.02, 0.085), disc = GEO.disc ||= new THREE.CircleGeometry(0.52, 18).rotateX(-Math.PI / 2);
  const discM = mat('#d6dde5', { t: 0.0 }); discM.userData = {};
  for (const [name, sx, z] of ROTORS) { const r = new THREE.Group(); r.name = name; r.position.set(sx * 1.0, 1.62, z); const b = new THREE.Mesh(blade, dark); b.name = 'pale'; r.add(b); const d = new THREE.Mesh(disc, discM); d.name = 'flou'; r.add(d); g.add(r); }
  for (const [i, [sx, y]] of [[1, 0.66], [-1, 0.66], [1, 0.81], [-1, 0.81]].entries()) { const m = missileMesh(1); m.name = 'pod' + i; m.position.set(sx * 0.66, y, 0.14); g.add(m); }
  const b1 = new THREE.Mesh(GEO.beacon ||= new THREE.BoxGeometry(0.14, 0.08, 0.14), mat(S.light, { e: S.light, ei: 3 })); b1.name = 'feu-1'; b1.position.set(0.1, 1.72, -0.52); g.add(b1);
  const b2 = new THREE.Mesh(GEO.beacon, mat(S.police ? '#e9eef5' : S.light, { e: S.police ? '#bcd3ff' : S.light, ei: 3 })); b2.name = 'feu-2'; b2.position.set(-0.1, 1.72, -0.52); g.add(b2);
  // repères pour le pilote (même noms que les motos : la pose du pilote est calculée par deuxroues.js)
  node(g, 'seat-driver', ...SEAT);
  for (const sx of [-1, 1]) { node(g, sx > 0 ? 'peg-left' : 'peg-right', sx * 0.16, 0.42, 0.5); node(g, sx > 0 ? 'grip-left' : 'grip-right', sx * 0.3, 0.86, 0.12); node(g, sx > 0 ? 'canon-g' : 'canon-d', sx * 0.4, 0.52, 1.25); }
  g.traverse((o) => { if (o.isMesh && o.parent !== g.children[0]) o.castShadow = o.material !== discM; });
  return { scene: g, kind: 'heli', type, nom: S.nom, camp: S.camp, police: !!S.police, spec: { seat: SEAT, lean: 0.04, hp: S.hp }, size: [1.2, 1.4, 1.9] };
}
let DEFS = null;
export function heliDefs() { return (DEFS ||= Object.fromEntries(Object.keys(HELIS).map((k) => [k, buildHeli(k)]))); }

// ---------------------------------------------------------------- méthodes ajoutées au jeu
export const heliMethods = {
  // deux engins devant chaque base, un de location sur la place de la Fontaine
  buildHelis() {
    const D = heliDefs(), W = this.world; let n = 0;
    const put = (def, x, z, yaw) => { const p = this.clearSpot(x, z, 2) || this.clearSpot(x, z, 1.5); if (p) { this.addHeli(def, p[0], p[1], yaw); n++; } };
    for (const t of ['ordre', 'civils']) {
      const sp = W.spawns[t] || []; if (!sp.length) continue;
      const cx = sp.reduce((s, p) => s + p.x, 0) / sp.length, cz = sp.reduce((s, p) => s + p.z, 0) / sp.length; const L = Math.hypot(cx, cz) || 1, dx = -cx / L, dz = -cz / L;
      const yaw = Math.atan2(dx, dz);
      for (const k of [-1, 1]) put(D[t === 'ordre' ? 'brigade' : 'frungz'], cx + dx * 15 + dz * k * 6, cz + dz * 15 - dx * k * 6, yaw);
    }
    const zc = (W.zones || []).find((z) => z.id === 'C'); if (zc) put(D.civil, zc.center[0] + zc.radius + 9, zc.center[1] + 4, Math.PI);
    this.heliShots = []; this.heliCd = { ordre: 30, civils: 45 };
    console.log('mini-helicos', n);
  },
  addHeli(def, x, z, yaw) {
    const obj = def.scene.clone(true); this.root.add(obj);
    const c = { def, obj, kind: 'heli', wheels: [], pos: V(x, this.world.groundY(x, z), z), yaw, speed: 0, steer: 0, hp: def.spec.hp, maxHp: def.spec.hp, driver: null, spawn: [x, z, yaw], dead: 0,
      W: def.size[0], L: def.size[2], H: def.size[1], max: 26, police: def.police, rollV: 0, pitchV: 0, camH: 2.3, camBack: 6.5, vel: V(), spin: 0, heat: 0, fireT: 0, flying: false, kills: 0 };
    c.rotors = ROTORS.map(([n]) => obj.getObjectByName(n)); c.discs = c.rotors.map((r) => r.getObjectByName('flou'));
    // chaque engin a sa propre matière de disque (son opacité suit la vitesse des hélices)
    const dm = c.discs[0].material.clone(); for (const d of c.discs) d.material = dm; c.discMat = dm;
    c.pods = [0, 1, 2, 3].map((i) => obj.getObjectByName('pod' + i)); c.muzzles = [obj.getObjectByName('canon-g'), obj.getObjectByName('canon-d')];
    c.l1 = obj.getObjectByName('feu-1'); c.l2 = obj.getObjectByName('feu-2');
    this.heliReset(c);
    c.col = { type: 'box', x, z, hx: c.W / 2, hz: c.L / 2, h: 1.3, yaw, cs: Math.cos(yaw), sn: Math.sin(yaw), y0: c.pos.y, car: c };
    this.world.dynamic.push(c.col); this.cars.push(c); this.syncCar(c); return c;
  },
  heliReset(c) { c.ammo = { missile: 2, roquettes: 0, style: 0 }; c.sel = 'missile'; c.heat = 0; c.over = false; c.crash = false; c.kills = 0; this.heliPods(c); },
  heliPods(c) { for (let i = 0; i < 4; i++) if (c.pods[i]) c.pods[i].visible = i < c.ammo.missile; },
  heliPrompt(a, c) {
    if (!c.def.camp || c.def.camp === a.team) return { text: 'Piloter le mini-hélico', quick: true };
    return { text: 'Voler le mini-hélico', quick: false, label: 'Démarrage…', dur: 1.3 };
  },
  heliEnter(a, c) {
    this.rideEnter(a, c); // installe le pilote (mêmes mesures et même pose calculée que sur une moto)
    if (a.ch.gun) a.ch.gun.visible = false; c.vel = V(); c.speed = 0; c.crash = false; a.airK = 0; c.fireT = 0.3;
    if (a === this.player) {
      this.announce('', c.def.nom, '#fff', 1.4); this.cam.carYaw = c.yaw; this.cam.yaw = c.yaw; this.cam.pitch = -0.15;
      this.toast(`${this.input.label('jump')} monter · ${this.input.label('crouch')} descendre · ${this.input.label('fire')} mitrailleuse · ${this.input.label('grenade')} missiles`, '#cfe3ff');
    }
  },
  heliExit(a, c, dead) {
    c.driver = null; a.inCar = null; const ch = a.ch;
    const rig = ch.rideRig; if (rig) for (const n of rig.bones) { const s = rig.snap[n]; if (s) { ch.bones[n].position.copy(s.p); ch.bones[n].quaternion.copy(s.q); } }
    ch.root.rotation.set(0, c.yaw, 0); ch.root.quaternion.setFromEuler(ch.root.rotation); if (ch.gun) ch.gun.visible = true; ch.model.rotation.x = 0;
    a.yaw = c.yaw; a.airK = 0;
    if (dead) { a.pos.copy(c.pos).add(V(0, 0.5, 0)); a.vel.copy(c.vel); if (c.flying) { c.crash = true; c.crashBy = a.lastBy || null; } }
    else {
      const side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw)); a.pos.copy(c.pos).addScaledVector(side, 1.5);
      this.world.pushOut(a.pos, 0.35, a.pos.y); a.pos.y = this.world.standY(a.pos.x, a.pos.z, c.pos.y + 0.5); a.vel.set(0, 0, 0);
    }
    if (a === this.player) { this.audio.engine(false); this.cam.yaw = c.yaw; this.audio.play('cloth', c.pos, 0.5); }
  },
  // sol sous l'engin : la rue, ou le toit d'un immeuble (on peut s'y poser)
  heliFloor(x, z, y) {
    const W = this.world; let g = W.groundY(x, z, y + 0.3);
    for (const c of W.near(x, z, 0.6)) {
      if (c.off || c.car) continue; const top = (c.y0 || 0) + (c.h || 0); if (top > y + 0.6 || top <= g) continue;
      if (c.type === 'poly') { if (c.bb && (x < c.bb[0] || x > c.bb[2] || z < c.bb[1] || z > c.bb[3])) continue; if (pointInPoly(x, z, c.poly)) g = top; }
      else if (c.type === 'circle') { if (Math.hypot(x - c.x, z - c.z) < c.r) g = top; }
      else if (c.type === 'box') { const dx = x - c.x, dz = z - c.z, lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs; if (Math.abs(lx) < c.hx && Math.abs(lz) < c.hz) g = top; }
    }
    return g;
  },

  // ---------------------------------------------------------------- vol
  updateHeli(c, dt) {
    const W = this.world;
    if (c.dead) {
      c.dead -= dt; if (c.dead <= 0) { c.dead = 0; [c.pos.x, c.pos.z, c.yaw] = c.spawn; c.pos.y = W.groundY(c.pos.x, c.pos.z); c.hp = c.maxHp; c.vel.set(0, 0, 0); c.speed = 0; c.flying = false; c.spin = 0; c.rollV = c.pitchV = 0; this.heliReset(c); c.obj.visible = true; if (!W.dynamic.includes(c.col)) W.dynamic.push(c.col); this.syncCar(c); }
      return;
    }
    const drv = c.driver;
    // au repos, posé, sans pilote : rien à calculer (sauf l'arrêt des hélices)
    if (!drv && !c.flying && !c.crash && c.spin <= 0) { if (Math.random() < dt) this.heliBoard(c); return; }
    let wish = V(), up = 0, boost = false, yawT = null;
    if (drv === this.player && !this.paused) {
      const I = this.input, m = I.move(), y = this.cam.yaw; const f = V(Math.sin(y), 0, Math.cos(y)), r = V(-Math.cos(y), 0, Math.sin(y));
      wish.addScaledVector(f, -m.y).addScaledVector(r, m.x); if (wish.lengthSq() > 1) wish.normalize();
      up = (I.down('jump') ? 1 : 0) - (I.down('crouch') || I.down('duck') ? 1 : 0); boost = I.down('sprint'); yawT = y;
    } else if (drv?.bot) ({ wish, up, boost, yawT } = this.heliBot(c, drv, dt));
    else if (!c.crash) up = -0.7; // sans pilote : il se repose doucement
    // hélices : démarrage en ~1 s, arrêt en ~2 s
    c.spin = clamp(c.spin + dt * (drv && !c.crash ? 1 : -0.5), 0, 1);
    const ready = c.spin > 0.65;
    if (c.crash) {
      // pilote abattu : l'engin part en vrille et tombe
      c.yaw += dt * 5.5; c.vel.y -= GRAV * 0.55 * dt; c.vel.x *= Math.exp(-dt * 0.4); c.vel.z *= Math.exp(-dt * 0.4);
      if (Math.random() < dt * 30) this.trailPuff(c.pos.clone().add(V(0, 1, 0)), Math.random() < 0.3 ? '#ff8a3d' : '#2a2a2a', 1.2, 1, 0.4);
    } else {
      if (!c.flying && ready && wish.lengthSq() > 0.02) up = Math.max(up, 0.6); // on décolle dès qu'on pousse le manche
      if (!ready && !c.flying) { up = 0; wish.set(0, 0, 0); }
      const maxH = boost ? 27 : 17, k = 1 - Math.exp(-dt * (wish.lengthSq() > 0.01 ? 1.7 : 1.3));
      c.vel.x = lerp(c.vel.x, wish.x * maxH, k); c.vel.z = lerp(c.vel.z, wish.z * maxH, k);
      c.vel.y = lerp(c.vel.y, up * (up > 0 ? 8 : 9), 1 - Math.exp(-dt * 3));
      if (yawT != null) c.yaw = lerpAngle(c.yaw, yawT, 1 - Math.exp(-dt * 4.5));
    }
    const prevV = c.vel.clone();
    c.pos.addScaledVector(c.vel, dt);
    // plafond : 60 m au-dessus de la rue
    const street = W.groundY(c.pos.x, c.pos.z); if (c.pos.y > street + 60) { c.pos.y = street + 60; c.vel.y = Math.min(0, c.vel.y); }
    // murs, lampadaires, arbres : on glisse le long ; un choc violent abîme l'engin
    const q = c.pos.clone(), q0 = q.clone(); W.pushOut(q, 1.0, c.pos.y + 0.25, c.col); const dx = q.x - q0.x, dz = q.z - q0.z;
    c.bump = 0;
    if (dx || dz) { c.pos.x = q.x; c.pos.z = q.z; const n = V(dx, 0, dz).normalize(), into = -c.vel.dot(n); c.bump = 1;
      if (into > 0) { c.vel.addScaledVector(n, into * 1.3); if (into > 8) this.heliHit(c, (into - 8) * 9, drv === this.player ? 1 : 0); else if (into > 3) this.audio.play('thud', c.pos, Math.min(1, into / 8)); } }
    // sol ou toit
    const floor = this.heliFloor(c.pos.x, c.pos.z, c.pos.y);
    if (c.pos.y <= floor) {
      const imp = -prevV.y; c.pos.y = floor; if (c.vel.y < 0) c.vel.y = 0;
      if (c.crash) { this.explodeCar(c, c.crashBy); return; }
      if (imp > 9) this.heliHit(c, (imp - 9) * 14, drv === this.player ? 1 : 0); else if (imp > 3 && c.flying) this.audio.play('land', c.pos, 0.7, [0.7, 0.8]);
    }
    const h = c.pos.y - floor; c.flying = h > 0.06 || c.vel.y > 0.1;
    if (!c.flying) { c.vel.x *= Math.exp(-dt * 6); c.vel.z *= Math.exp(-dt * 6); }
    c.onRoof = floor > street + 1.5;
    // la Seine : l'engin coule, le pilote nage
    const Wt = W.water; if (Wt && c.pos.y < Wt.y + 0.3 && W.inWater(c.pos.x, c.pos.z)) {
      this.fx.burst(V(c.pos.x, Wt.y + 0.2, c.pos.z), 24, { color: '#cfe3ef', speed: 6, size: 0.12, life: 1 }); this.audio.play('thud', c.pos, 1);
      if (drv) this.exitCar(drv); c.dead = 40; c.obj.visible = false; const j = W.dynamic.indexOf(c.col); if (j >= 0) W.dynamic.splice(j, 1); return;
    }
    // inclinaison : le nez plonge dans le sens de la marche, l'engin se couche dans les virages
    const f = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)), side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const vf = c.vel.dot(f), vs = c.vel.dot(side); c.speed = Math.hypot(c.vel.x, c.vel.z);
    const hov = c.flying && !c.crash ? Math.sin(this.time * 1.7 + c.spawn[0]) * 0.025 : 0;
    c.pitchV = lerp(c.pitchV, c.crash ? 0.5 : clamp(vf * 0.02, -0.38, 0.38) + hov, 1 - Math.exp(-dt * 5));
    c.rollV = lerp(c.rollV, c.crash ? 0.6 : clamp(-vs * 0.024, -0.45, 0.45) + hov * 0.6, 1 - Math.exp(-dt * 5));
    this.syncCar(c); c.col.h = c.flying ? 0.62 : 1.3;
    // pilote : son cylindre de tir couvre le buste et la tête qui dépassent de la coque
    if (drv) { drv.pos.set(c.pos.x, c.pos.y - 0.35, c.pos.z); drv.yaw = c.yaw; drv.vel.copy(c.vel); }
    // hélices, flou, feux
    // pales visibles à l'arrêt, disque flou seul en plein régime (un dessin de moins par hélice)
    const fast = c.spin > 0.7; if (c.fast !== fast) { c.fast = fast; for (const r of c.rotors) r.children[0].visible = !fast; }
    for (const r of c.rotors) r.rotation.y += dt * (8 + 52 * c.spin) * (r.name.endsWith('l') ? 1 : -1);
    c.discMat.opacity = c.spin * 0.22; c.discMat.visible = c.spin > 0.05;
    if (c.l1) { const on = drv && Math.sin(this.time * (c.police ? 14 : 6)) > 0; c.l1.visible = !drv || on; c.l2.visible = !drv || !on; }
    // souffle au sol, fumée quand l'engin est touché, son
    const near = c.pos.distanceToSquared(this.camera.position) < 70 * 70;
    if (near && c.spin > 0.5 && h < 5 && Math.random() < dt * 14) { const a = Math.random() * Math.PI * 2, gp = V(c.pos.x + Math.cos(a) * 1.6, floor + 0.1, c.pos.z + Math.sin(a) * 1.6); this.fx.burst(gp, 1, { color: '#bdb6a6', speed: 3.5, size: 0.2, life: 0.6, grav: 1, opacity: 0.35, normal: V(Math.cos(a), 0.2, Math.sin(a)), spread: 0.4 }); }
    if (c.hp < c.maxHp * 0.35 && Math.random() < dt * 9) this.fx.burst(c.pos.clone().add(V(0, 1.1, -0.6)), 1, { color: '#333', speed: 1, size: 0.3, life: 1.2, grav: -2 });
    if (drv === this.player) this.audio.engine(true, clamp(0.35 + c.speed / 27 * 0.45 + Math.abs(c.vel.y) / 8 * 0.2, 0, 1) * c.spin, c.pos, 'heli');
    else if (near && c.spin > 0.3 && (c.rt = (c.rt || 0) - dt) <= 0) { c.rt = 0.5; this.audio.rotor(c.pos, 0.5 * c.spin); }
    c.fireT -= dt; c.heat = Math.max(0, c.heat - dt * (c.over ? 0.3 : 0.2)); if (c.over && c.heat < 0.3) c.over = false;
  },
  // tableau de bord (sous le compteur de vitesse) : altitude, chauffe de la mitrailleuse, arsenal
  heliHud(c) {
    const el = document.getElementById('heliui'); if (!el) return; const car = document.getElementById('car');
    if (c.kind !== 'heli') { if (this._heliK) { this._heliK = ''; el.innerHTML = ''; car.classList.remove('heli'); } return; }
    const team = c.driver?.team || 'civils', alt = Math.max(0, Math.round(c.pos.y - this.world.groundY(c.pos.x, c.pos.z)));
    const ars = ORDER.filter((k) => c.ammo[k] > 0 || k === 'missile').map((k) => { const A = arsName(k, team); return `<span class="${k === c.sel ? 'sel' : ''}${c.ammo[k] > 0 ? '' : ' vide'}">${svg(A.ico)}${c.ammo[k]}</span>`; }).join('');
    const key = `${alt}|${Math.round(c.heat * 20)}|${c.over}|${ars}`; if (key === this._heliK) return; this._heliK = key; car.classList.add('heli');
    el.innerHTML = `<div class="alt">ALT <b>${alt}</b> m</div><div class="heat${c.over ? ' over' : ''}"><i style="width:${Math.round(c.heat * 100)}%"></i></div><div class="ars">${ars}</div>`;
  },
  heliHit(c, dmg, me) {
    this.hitCar(c, dmg, null); this.audio.play('slam', c.pos, 0.9);
    this.fx.burst(c.pos.clone().add(V(0, 0.8, 0)), 8, { color: '#ffd27a', speed: 5, size: 0.03, emissive: true, life: 0.3 });
    if (me) { this.cam.trauma = Math.min(1, this.cam.trauma + 0.5); this.input.rumble(1, 1, 200); }
  },

  // ---------------------------------------------------------------- commandes du joueur
  heliPlayer(a, I, dt) {
    const c = a.inCar;
    if (I.pressed('car') || I.pressed('interact')) {
      const low = !c.onRoof && (!c.flying || c.pos.y - this.world.groundY(c.pos.x, c.pos.z) < 2.5);
      if (low) { this.exitCar(a); return; } this.toast('Pose-toi dans la rue pour descendre', '#ffcc3d');
    }
    this.aiming = I.down('aim') || I.st.triggerL > 0.3;
    if (I.pressed('streak')) this.heliCycle(a, c);
    if (I.pressed('grenade')) this.heliSpecial(a, c);
    const want = I.down('fire') || I.st.triggerR > 0.4;
    if (want && !I.st.locked && !I.st.usingPad && !I.st.usingTouch) { this.renderer.domElement.requestPointerLock?.(); return; }
    if (want && c.spin > 0.8 && !c.over && c.fireT <= 0) {
      const o = this.camera.position.clone(), d = V(); this.camera.getWorldDirection(d);
      o.addScaledVector(d, Math.max(0, o.distanceTo(c.pos) - 1.2)); // on part de l'engin, pas de la caméra
      this.heliShoot(a, c, o, d, this.aiming ? 0.006 : 0.014);
    } else if (want && c.over && (this._ovT = (this._ovT || 0) - dt) <= 0) { this._ovT = 1.2; this.audio.click(); }
  },
  // mitrailleuse de bord : canons gauche et droit en alternance, surchauffe après ~3 s de tir continu
  heliShoot(a, c, o, dir, spread) {
    c.fireT = 1 / 11; c.heat += 0.03; if (c.heat >= 1) { c.over = true; if (a === this.player) this.toast('Mitrailleuse en surchauffe', '#ff8a5a'); }
    const d = dir.clone(); d.x += rnd(-1, 1) * spread; d.y += rnd(-1, 1) * spread; d.z += rnd(-1, 1) * spread; d.normalize();
    const R = 150; c.col.off = true; const hw = this.world.ray(o, d, R); const ha = this.rayActors(o, d, hw ? hw.t : R, a); c.col.off = false;
    c.mz = c.mz ? 0 : 1; const mz = V(); c.muzzles[c.mz].getWorldPosition(mz);
    let end;
    if (ha) { end = o.clone().addScaledVector(d, ha.t); const fall = ha.t > 90 ? 0.7 : 1; this.damage(ha.a, 19 * fall * (ha.head ? 1.6 : 1), a, { head: ha.head, ico: 'heli', dist: ha.t }); this.fx.impact(end, [-d.x, -d.y, -d.z], 'flesh'); }
    else if (hw) { end = o.clone().addScaledVector(d, hw.t); if (hw.c?.car === c) end = o.clone().addScaledVector(d, R); else this.hitWorld(a, hw, d, end, { dmg: 19, veh: 1.6 }, 1); }
    else end = o.clone().addScaledVector(d, R);
    this.fx.muzzle(mz, 1.2); if (a === this.player || c.mz) this.fx.tracer(mz, end);
    this.audio.gun('lmg', a === this.player ? null : mz, a === this.player ? 0.75 : 0.9);
    if (a === this.player) { this.cam.kickP += 0.0025 * rnd(0.6, 1.2); this.cam.kickY += 0.002 * rnd(-1, 1); this.cam.trauma = Math.min(1, this.cam.trauma + 0.03); this.input.rumble(0.3, 0.4, 50); this.ui.crossKick = 0.6; }
    else { this.notePing?.(a, mz); if (ha?.a !== this.player) this.fb.bullet(o, d, ha ? ha.t : hw ? hw.t : R, a); }
    for (const b of this.actors) if (b.bot && b.alive && b.team !== a.team && !b.ai.target && b.pos.distanceToSquared(c.pos) < 1600) { b.ai.target = a; b.ai.seeT = 0.8; }
  },
  heliCycle(a, c) {
    const have = ORDER.filter((k) => c.ammo[k] > 0); if (!have.length) { this.toast('Arsenal vide : élimine en vol pour débloquer missiles et roquettes', '#ccc'); return; }
    const i = have.indexOf(c.sel); c.sel = have[(i + 1) % have.length]; const A = arsName(c.sel, a.team);
    this.toast(`${svg(A.ico)} ${A.nom} ×${c.ammo[c.sel]}`, '#fff'); this.audio.scope(true);
  },
  // un élimination en vol de plus : l'arsenal se remplit (missiles, roquettes, puis le tir stylé du camp)
  heliKill(a) {
    const c = a.inCar; if (!c || c.kind !== 'heli') return; a.airK = (a.airK || 0) + 1; c.kills++; const k = a.airK; let got = null;
    if (k === 2) { c.ammo.missile += 4; got = 'missile'; }
    else if (k === 4) { c.ammo.roquettes += 1; got = 'roquettes'; }
    else if (k === 6) { c.ammo.style += 1; got = 'style'; }
    else if (k > 6 && k % 3 === 0) { if ((k / 3) % 2) { c.ammo.style += 1; got = 'style'; } else { c.ammo.missile += 4; got = 'missile'; } }
    if (!got) return; c.ammo.missile = Math.min(c.ammo.missile, 12); c.sel = got; this.heliPods(c);
    if (a !== this.player) return;
    const A = arsName(got, a.team), tier = got === 'missile' ? 2 : got === 'roquettes' ? 3 : 5, col = ['#ffcc3d', '#ff9d3d', '#57b6ff', '#ff7ad9', '#ff4a3d', '#c27bff'][tier];
    const title = got === 'style' ? (k >= 9 ? `${A.nom.toUpperCase()} FRUNGZTASTIQUE !!` : `${A.nom.toUpperCase()} !!`) : `${A.nom.toUpperCase()} !`;
    this.bigText(`${svg(A.ico)} ${title}`, `${k} éliminations en vol · ${this.input.label('grenade')} pour tirer`, col, `t${tier}`);
    this.audio.streakReady(tier); this.input.rumble(1, 0.8, 300); this.cam.trauma = Math.min(1, this.cam.trauma + 0.3);
  },
  // point visé (rayon de la caméra, sans toucher l'engin lui-même)
  heliAim(c) {
    const o = this.camera.position.clone(), d = V(); this.camera.getWorldDirection(d); c.col.off = true; const h = this.world.ray(o, d, 260); c.col.off = false;
    return { o, d, p: o.clone().addScaledVector(d, h ? h.t : 260) };
  },
  // verrouillage : l'ennemi (ou l'engin ennemi) le plus proche du réticule, visible, à moins de 170 m
  heliLock(a, c, o, d, cone = 0.12) {
    let best = null, ba = cone;
    const look = (p, t) => { const v = p.clone().sub(o); const L = v.length(); if (L < 4 || L > 170) return; v.divideScalar(L); const ang = Math.acos(clamp(v.dot(d), -1, 1)); if (ang > ba) return; c.col.off = true; const ok = this.world.los(o, p); c.col.off = false; if (ok) { ba = ang; best = t; } };
    for (const t of this.actors) if (t.alive && !t.gone && t.team !== a.team) look(t.pos.clone().add(V(0, t.inCar?.kind === 'heli' ? 1 : 1.2, 0)), t);
    for (const k of this.cars) if (k !== c && !k.dead && k.driver && k.driver.team !== a.team) look(k.pos.clone().add(V(0, 0.8, 0)), k);
    return best;
  },
  heliSpecial(a, c, target = null, aimP = null) {
    let kind = c.sel; if (!(c.ammo[kind] > 0)) kind = ORDER.find((k) => c.ammo[k] > 0);
    if (!kind) { if (a === this.player) this.toast(`Arsenal vide : 2 éliminations en vol débloquent les missiles`, '#ccc'); return; }
    if ((c.specT || 0) > this.time) return; c.ammo[kind]--; c.sel = kind; this.heliPods(c);
    let o, d, p; if (a === this.player) ({ o, d, p } = this.heliAim(c)); else { p = aimP.clone(); o = c.pos.clone().add(V(0, 1, 0)); d = p.clone().sub(o).normalize(); }
    if (a === this.player && !target) target = this.heliLock(a, c, o, d, kind === 'missile' ? 0.14 : 0.2);
    const f = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)), side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const from = (sx) => c.pos.clone().add(V(0, 0.72, 0)).addScaledVector(side, sx * 0.7).addScaledVector(f, 0.6);
    const team = a.team;
    if (kind === 'missile') {
      c.specT = this.time + 0.45; c.pod = (c.pod || 0) + 1;
      this.heliLaunch({ kind: 'missile', owner: a, heli: c, pos: from(c.pod % 2 ? 1 : -1), dir: target ? (target.pos.clone().add(V(0, 1, 0)).sub(c.pos).normalize()) : p.clone().sub(c.pos).normalize(), speed: 26, max: 70, turn: 5, target, point: p, R: 5.5, dmg: 140 });
      if (a === this.player) this.toast(target ? `${svg('missile')} Missile verrouillé${target.name ? ' sur ' + target.name : ''}` : `${svg('missile')} Missile`, target ? '#ff4a3d' : '#fff');
    } else if (kind === 'roquettes') {
      c.specT = this.time + 1.2;
      for (let i = 0; i < 14; i++) (this.heliQueue ||= []).push({ at: this.time + i * 0.06, s: { kind: 'roquette', owner: a, heli: c, pos: null, side: i % 2 ? 1 : -1, aim: p.clone().add(V(rnd(-1, 1) * 3.5, 0, rnd(-1, 1) * 3.5)), speed: 75, max: 75, turn: 0, R: 4, dmg: 80 } });
      if (a === this.player) this.bigText(`${svg('artifice')} SALVE !`, '14 roquettes', '#ff9d3d', 't2');
    } else if (team === 'ordre') {
      c.specT = this.time + 1.5;
      this.heliLaunch({ kind: 'cluster', owner: a, heli: c, pos: from(1), dir: p.clone().sub(c.pos).normalize(), speed: 30, max: 55, turn: 3, target, point: p, R: 5, dmg: 110, scale: 1.8 });
      if (a === this.player) this.bigText(`${svg('nuke')} FRAGMENTATION !`, 'il se sépare au-dessus de la cible', '#57b6ff', 't3');
    } else {
      c.specT = this.time + 1.5;
      // bouquet final : chaque fusée part vers le haut puis plonge sur un ennemi différent autour du point visé
      const foes = this.actors.filter((t) => t.alive && !t.gone && t.team !== team && t.pos.distanceTo(p) < 40).sort((x, y) => x.pos.distanceToSquared(p) - y.pos.distanceToSquared(p));
      for (let i = 0; i < 12; i++) {
        const tg = foes.length ? foes[i % foes.length] : null; const s = { kind: 'fw', owner: a, heli: c, pos: null, side: i % 2 ? 1 : -1, speed: 22, max: 48, turn: 3.2, target: tg, point: p.clone().add(V(rnd(-6, 6), 0, rnd(-6, 6))), R: 4.5, dmg: 85, col: pick(['#ff4fa0', '#ffd23d', '#5ad1ff', '#9ff59f', '#c27bff']), up: 1.1 + i * 0.03 };
        (this.heliQueue ||= []).push({ at: this.time + i * 0.09, s });
      }
      if (a === this.player) this.bigText(`${svg('artifice')} BOUQUET FINAL !!`, foes.length ? `${Math.min(12, foes.length)} cibles` : 'feu !', '#ff7ad9', 't4');
    }
    if (a === this.player) { this.cam.trauma = Math.min(1, this.cam.trauma + 0.25); this.input.rumble(0.8, 0.6, 160); }
  },
  heliLaunch(s) {
    const c = s.heli; if (!s.pos) { const f = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)), side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw)); s.pos = c.pos.clone().add(V(0, 0.72, 0)).addScaledVector(side, s.side * 0.7).addScaledVector(f, 0.6); }
    if (!s.dir) { const goal = s.target ? s.target.pos.clone().add(V(0, 1, 0)) : s.aim || s.point; s.dir = goal.clone().sub(s.pos).normalize(); if (s.up) { s.dir.y = Math.max(s.dir.y, 0) + s.up; s.dir.normalize(); } }
    if (s.kind === 'roquette') { s.dir.x += rnd(-1, 1) * 0.02; s.dir.y += rnd(-1, 1) * 0.02; s.dir.normalize(); }
    s.vel = s.dir.clone().multiplyScalar(s.speed); s.t = 0;
    const m = s.kind === 'fw' ? missileMesh(0.7, s.col) : s.kind === 'bomb' ? missileMesh(0.55, '#3a3d42') : missileMesh(s.scale || (s.kind === 'roquette' ? 0.75 : 1)); m.position.copy(s.pos); this.root.add(m); s.m = m;
    this.heliShots.push(s);
    if (s.kind !== 'bomb') { this.audio.play('punch', s.pos, s.kind === 'roquette' ? 0.35 : 0.6, [0.45, 0.6]); if (s.owner !== this.player) this.audio.whistle(s.pos, 0.8); }
  },
  updateHeliShots(dt) {
    const Q = this.heliQueue; if (Q) for (let i = Q.length - 1; i >= 0; i--) { if (this.time < Q[i].at) continue; const { s } = Q[i]; Q.splice(i, 1); if (!s.heli.dead) this.heliLaunch(s); }
    const L = this.heliShots; if (!L || !L.length) return; const W = this.world;
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i]; s.t += dt;
      // guidage : la vitesse monte, la trajectoire s'infléchit vers la cible (ou le point visé)
      const sp = Math.min(s.max, s.vel.length() + dt * 60);
      let goal = null; if (s.target) { if (s.target.alive === false || s.target.dead) s.target = null; else goal = s.target.pos.clone().add(V(0, s.target.obj ? 0.7 : 1.0, 0)); }
      if (!goal && s.turn && s.point) goal = s.point;
      if (s.kind === 'fw' && s.t < 0.45) goal = null; // les fusées montent d'abord
      if (goal && s.turn) { const want = goal.clone().sub(s.pos).normalize().multiplyScalar(sp); s.vel.lerp(want, 1 - Math.exp(-dt * s.turn * (s.t > 0.3 ? 1 : 0.4))); }
      if (s.kind === 'bomb') s.vel.y -= GRAV * dt;
      s.vel.setLength(s.kind === 'bomb' ? s.vel.length() : sp);
      const step = s.vel.length() * dt, dir = s.vel.clone().divideScalar(s.vel.length() || 1);
      const own = s.heli; own.col.off = true; const hit = W.ray(s.pos, dir, step); own.col.off = false;
      s.pos.addScaledVector(dir, hit ? hit.t : step); s.m.position.copy(s.pos); s.m.quaternion.setFromUnitVectors(V(0, 0, 1), dir);
      if ((s.tp = (s.tp || 0) - dt) <= 0) { s.tp = 0.025; const fw = s.kind === 'fw'; this.trailPuff(s.pos, fw ? s.col : '#ffd9a0', fw ? 0.5 : 0.3, 0.2, 0.15); if (s.kind !== 'bomb') this.trailPuff(s.pos, fw ? '#ffffff' : '#8a8a8a', fw ? 0.3 : 1.1, 0.4, 0.25); }
      // à fragmentation : au-dessus de la cible, il se sépare en 10 bombettes
      if (s.kind === 'cluster') { const g = goal || s.point; if ((g && Math.hypot(g.x - s.pos.x, g.z - s.pos.z) < 9 && s.pos.y > g.y + 3) || s.t > 2.6) { this.heliSplit(s); this.root.remove(s.m); L.splice(i, 1); continue; } }
      let boom = !!hit || s.t > 5;
      if (!boom) { const gy = this.heliFloor(s.pos.x, s.pos.z, s.pos.y); if (s.pos.y <= gy + 0.15) { boom = true; s.pos.y = gy; } }
      if (!boom) for (const t of this.actors) { if (!t.alive || t.team === s.owner.team) continue; const dy = s.pos.y - t.pos.y; if (dy > -0.3 && dy < 2 && Math.hypot(t.pos.x - s.pos.x, t.pos.z - s.pos.z) < 0.9) { boom = true; break; } }
      if (!boom) for (const k of this.cars) { if (k === own || k.dead || !k.driver || k.driver.team === s.owner.team) continue; if (k.pos.distanceToSquared(s.pos) < (k.kind === 'heli' ? 2.4 : 3.2) ** 2) { boom = true; break; } }
      if (boom) { this.heliBoom(s); this.root.remove(s.m); L.splice(i, 1); }
    }
  },
  heliSplit(s) {
    this.fx.burst(s.pos.clone(), 18, { color: '#ffd27a', speed: 7, size: 0.06, emissive: true, life: 0.4 }); this.audio.crack(s.pos);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, r = rnd(1.5, 4.5); const v = V(Math.cos(a) * r, rnd(-2, 1), Math.sin(a) * r).add(s.vel.clone().multiplyScalar(0.25));
      this.heliShots.push(Object.assign({ kind: 'bomb', owner: s.owner, heli: s.heli, pos: s.pos.clone(), vel: v, t: 0, R: 4.5, dmg: 90, turn: 0, max: 60 }, { m: (() => { const m = missileMesh(0.5, '#3a3d42'); m.position.copy(s.pos); this.root.add(m); return m; })() })); }
  },
  heliBoom(s) {
    const own = s.heli, d0 = own.dead; own.dead = own.dead || -1; // l'engin qui tire n'est pas touché par ses propres explosions
    const p = s.pos.clone();
    if (s.kind === 'fw') { for (let k = 0; k < 28; k++) this.trailPuff(p.clone().add(V(0, 1.5, 0)), pick([s.col, s.col, '#ffffff', '#ffd23d']), rnd(0.6, 1.2), rnd(-2, 6), 6); this.boom(p, s.R, s.dmg, s.owner, s.col, { fw: true, foesOnly: true }); }
    else this.boom(p, s.R, s.dmg, s.owner, '#ffb347', { foesOnly: true });
    if (own.dead === -1) own.dead = d0;
  },

  // ---------------------------------------------------------------- bots pilotes
  // un bot qui passe près d'un engin libre de son camp peut le prendre (un seul bot pilote par camp à la fois)
  heliBoard(c) {
    if (this.over || !this.heliCd) return;
    for (const b of this.actors) {
      if (!b.bot || !b.alive || b.inCar || b.channel || b.temp || (c.def.camp && c.def.camp !== b.team)) continue;
      if (this.time < (this.heliCd[b.team] || 0) || b.pos.distanceTo(c.pos) > 8) continue;
      if (this.cars.some((k) => k.kind === 'heli' && k.driver?.bot && k.driver.team === b.team)) return;
      if (Math.random() < 0.5) { this.heliCd[b.team] = this.time + 50; this.enterCar(b, c); c.bot = { scan: 0, goalT: 0, burst: 0 }; return; }
    }
  },
  heliBot(c, b, dt) {
    const B = c.bot ||= { scan: 0, goalT: 0, burst: 0 }, W = this.world; const out = { wish: V(), up: 0, boost: false, yawT: null };
    // cible : l'ennemi visible le plus proche
    if ((B.scan -= dt) <= 0) { B.scan = rnd(0.35, 0.6); let best = null, bd = 85; const e = c.pos.clone().add(V(0, 0.9, 0));
      c.col.off = true; for (const t of this.actors) { if (!t.alive || t.gone || t.team === b.team) continue; const d = t.pos.distanceTo(c.pos); if (d < bd && W.los(e, t.pos.clone().add(V(0, 1.2, 0)))) { bd = d; best = t; } } c.col.off = false;
      if (best !== B.tgt) B.react = rnd(0.4, 0.8); B.tgt = best; }
    // destination : une zone à prendre, en orbite au-dessus (plus bas au-dessus des places, au-dessus des toits pour s'y rendre)
    if ((B.goalT -= dt) <= 0 || !B.goal) { const zs = (this.zoneState || []).filter((z) => !z.souterraine && z.radius >= 5); const foe = zs.filter((z) => z.owner !== b.team); B.goal = pick(foe.length ? foe : zs) || { center: [0, 0], radius: 6 }; B.goalT = rnd(18, 30); B.dir = Math.random() < 0.5 ? 1 : -1; }
    const gc = V(B.goal.center[0], 0, B.goal.center[1]); const tt = this.time * 0.22 * B.dir; const orbit = gc.clone().add(V(Math.cos(tt) * 13, 0, Math.sin(tt) * 13));
    const dist = Math.hypot(orbit.x - c.pos.x, orbit.z - c.pos.z), atZone = Math.hypot(gc.x - c.pos.x, gc.z - c.pos.z) < 32;
    const alt = W.groundY(gc.x, gc.z) + (atZone ? 12 : 27);
    out.wish.set(orbit.x - c.pos.x, 0, orbit.z - c.pos.z).normalize().multiplyScalar(Math.min(1, dist / 12));
    out.up = clamp((alt - c.pos.y) / 4, -1, 1); if (c.bump) out.up = 1; if (!atZone && c.pos.y < alt - 6) out.wish.multiplyScalar(0.3); // monter d'abord, puis filer au-dessus des toits
    const t = B.tgt;
    out.yawT = t ? Math.atan2(t.pos.x - c.pos.x, t.pos.z - c.pos.z) : c.speed > 2 ? Math.atan2(c.vel.x, c.vel.z) : c.yaw;
    // tir : rafales de ~1,2 s, visée imprécise (distance, vitesse de la cible, réglage des bots)
    if (t && c.spin > 0.8) {
      B.react -= dt; const d = t.pos.distanceTo(c.pos);
      if (B.react <= 0 && d < 80) {
        B.burst -= dt; if (B.burst < -0.9) B.burst = rnd(0.9, 1.5);
        if (B.burst > 0 && c.fireT <= 0 && !c.over) { const o = c.pos.clone().add(V(0, 0.55, 0)); const aim = t.pos.clone().add(V(0, rnd(0.6, 1.5), 0)); const err = (0.03 + d * 0.0016 + Math.hypot(t.vel.x, t.vel.z) * 0.006) * (this.opts.botSkill ?? 1); aim.x += rnd(-1, 1) * err * d; aim.y += rnd(-1, 1) * err * d * 0.5; aim.z += rnd(-1, 1) * err * d; this.heliShoot(b, c, o, aim.sub(o).normalize(), 0.012); }
        if (d > 14 && Math.random() < dt * 0.35 && ORDER.some((k) => c.ammo[k] > 0)) { c.sel = c.ammo.style > 0 ? 'style' : c.ammo.roquettes > 0 ? 'roquettes' : 'missile'; this.heliSpecial(b, c, c.sel === 'missile' ? t : null, t.pos.clone()); }
      }
    }
    return out;
  },
};
