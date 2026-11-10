// Lanceurs : lance-roquettes et lance-patates (lance-grenades 40 mm à barillet), achetés à l'armurerie.
// Les modèles sont construits en code (le pack d'armes n'a pas de lanceur), en mètres : canon vers +x, poignée à l'origine,
// comme les armes chargées par assets.js (enfant 0 : le modèle, enfant 1 : la bouche du canon).
// Les projectiles volent pour de vrai (la roquette accélère, l'obus de 40 mm retombe), explosent au contact et cassent le décor :
// mobilier urbain, vitrines, barricades, voitures et mini-hélicos ; ils laissent une trace de brûlure et arrachent des éclats aux façades.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS } from './data.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- modèles
const MAT = {};
function mat(name, color, rough, metal) { return (MAT[name] ||= new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true, name })); }
const M = {
  olive: () => mat('lr_olive', '#56603f', 0.7, 0.1), oliveDark: () => mat('lr_oliveD', '#3c4430', 0.7, 0.1), steel: () => mat('lr_steel', '#4a5058', 0.35, 0.85),
  dark: () => mat('lr_dark', '#1f2328', 0.55, 0.35), poly: () => mat('lr_poly', '#2b3036', 0.65, 0.1), wood: () => mat('lr_wood', '#7a5233', 0.6, 0),
  glass: () => mat('lr_glass', '#1b3550', 0.1, 0.4), brass: () => mat('lr_brass', '#b08a3e', 0.35, 0.8), warhead: () => mat('lr_war', '#4d5838', 0.6, 0.2),
};
// pièces : cylindre couché le long de x, boîte
function tube(r0, r1, x0, x1, y = 0, z = 0, seg = 14) { const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, seg); g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; }
function box(sx, sy, sz, x, y, z, rz = 0) { const g = new THREE.BoxGeometry(sx, sy, sz); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; }
// une seule géométrie par matériau (peu d'appels de rendu, même en main de plusieurs persos)
function assemble(parts) {
  const by = new Map(); for (const [m, g] of parts) { const k = m(); if (!by.has(k)) by.set(k, []); by.get(k).push(g.index ? g.toNonIndexed() : g); }
  const grp = new THREE.Group(); for (const [m, gs] of by) { const mesh = new THREE.Mesh(mergeGeometries(gs), m); mesh.castShadow = true; grp.add(mesh); } return grp;
}

// lance-roquettes : tube d'épaule, bouclier thermique, viseur optique à gauche, poignée et poignée avant, roquette engagée dans la bouche
function roquettes() {
  const y = 0.1;
  const body = assemble([
    [M.olive, tube(0.042, 0.042, -0.42, 0.5, y)],
    [M.dark, tube(0.044, 0.068, -0.56, -0.42, y)], [M.dark, tube(0.047, 0.047, 0.46, 0.5, y)],
    [M.wood, tube(0.052, 0.052, -0.14, 0.2, y)], [M.dark, tube(0.054, 0.054, -0.15, -0.13, y)], [M.dark, tube(0.054, 0.054, 0.19, 0.21, y)],
    [M.poly, box(0.04, 0.12, 0.032, -0.005, 0.0, 0, 0.22)], [M.dark, box(0.07, 0.012, 0.02, 0.03, 0.045, 0)], [M.dark, box(0.012, 0.03, 0.02, 0.07, 0.03, 0)],
    [M.poly, box(0.036, 0.11, 0.032, 0.3, 0.0, 0, 0.12)],
    [M.dark, box(0.1, 0.052, 0.036, 0.1, y + 0.065, -0.05)], [M.glass, box(0.006, 0.03, 0.026, 0.153, y + 0.068, -0.05)], [M.dark, box(0.03, 0.03, 0.02, 0.1, y + 0.03, -0.032)],
    [M.steel, box(0.012, 0.035, 0.008, 0.45, y + 0.055, 0)], [M.steel, box(0.012, 0.03, 0.008, -0.3, y + 0.055, 0)],
  ]);
  // roquette engagée : cachée quand le tube est vide
  const war = assemble([[M.oliveDark, tube(0.022, 0.022, 0.5, 0.58, y)], [M.warhead, tube(0.05, 0.05, 0.58, 0.66, y)], [M.warhead, tube(0.05, 0.012, 0.66, 0.79, y)], [M.brass, tube(0.012, 0.004, 0.79, 0.81, y)]]);
  war.name = 'ammo'; body.add(war); return { body, muzzle: V(0.5, y, 0) };
}
// lance-patates : barillet de 6 obus de 40 mm, crosse, garde-main et poignée avant, hausse rabattable
function patates() {
  const y = 0.085;
  const parts = [
    [M.steel, tube(0.026, 0.026, 0.12, 0.47, y)], [M.poly, tube(0.036, 0.036, 0.14, 0.4, y)],
    [M.dark, tube(0.072, 0.072, -0.05, 0.11, y - 0.02, 0, 12)], [M.steel, tube(0.02, 0.02, -0.07, 0.13, y - 0.02)],
    [M.poly, box(0.5, 0.018, 0.03, 0.17, y + 0.075, 0)], [M.poly, box(0.03, 0.08, 0.03, -0.06, y + 0.035, 0)], [M.poly, box(0.03, 0.08, 0.03, 0.125, y + 0.035, 0)],
    [M.poly, box(0.04, 0.12, 0.032, -0.005, -0.005, 0, 0.22)], [M.dark, box(0.07, 0.012, 0.02, 0.03, 0.04, 0)],
    [M.poly, box(0.036, 0.1, 0.032, 0.27, 0.015, 0, 0.1)],
    [M.poly, box(0.3, 0.035, 0.03, -0.23, y + 0.015, 0)], [M.poly, box(0.2, 0.025, 0.026, -0.26, y - 0.05, 0, 0.18)], [M.dark, box(0.03, 0.13, 0.042, -0.39, y - 0.015, 0)],
    [M.dark, box(0.012, 0.05, 0.04, 0.22, y + 0.11, 0)], [M.glass, box(0.004, 0.03, 0.03, 0.222, y + 0.112, 0)],
  ];
  // chambres du barillet (culots des obus visibles sur la face arrière)
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; parts.push([M.brass, tube(0.021, 0.021, -0.06, -0.045, y - 0.02 + Math.cos(a) * 0.046, Math.sin(a) * 0.046, 8)]); }
  return { body: assemble(parts), muzzle: V(0.47, y, 0) };
}
const BUILD = { roquettes, patates };
export function buildLauncher(id) {
  const { body, muzzle } = BUILD[WEAPONS[id].build]();
  const holder = new THREE.Group(); holder.add(body); const m = new THREE.Object3D(); m.position.copy(muzzle); holder.add(m); holder.userData.muzzle = m; return holder;
}

// projectiles : roquette (ogive, ailettes) et obus de 40 mm, pointés vers +z
let ROCKET = null, SHELL = null;
function rocketMesh() {
  ROCKET ||= assemble([[M.oliveDark, tube(0.02, 0.02, -0.2, 0.05, 0)], [M.warhead, tube(0.05, 0.05, 0.05, 0.13, 0)], [M.warhead, tube(0.05, 0.012, 0.13, 0.26, 0)], [M.dark, box(0.1, 0.004, 0.09, -0.16, 0, 0)], [M.dark, box(0.1, 0.09, 0.004, -0.16, 0, 0)]]);
  const m = ROCKET.clone(); m.rotation.order = 'YXZ'; const g = new THREE.Group(); m.rotation.y = -Math.PI / 2; g.add(m); return g;
}
function shellMesh() {
  SHELL ||= assemble([[M.brass, tube(0.021, 0.021, -0.03, 0.0, 0, 0, 10)], [M.warhead, tube(0.021, 0.021, 0.0, 0.03, 0, 0, 10)], [M.warhead, tube(0.021, 0.008, 0.03, 0.06, 0, 0, 10)]]);
  const m = SHELL.clone(); const g = new THREE.Group(); m.rotation.y = -Math.PI / 2; g.add(m); g.scale.setScalar(1.6); return g;
}

// ---------------------------------------------------------------- traces de brûlure
let SCORCH = null;
function scorchTex() {
  if (SCORCH) return SCORCH; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, 'rgba(8,7,6,0.95)'); r.addColorStop(0.45, 'rgba(18,15,12,0.8)'); r.addColorStop(0.8, 'rgba(30,26,22,0.3)'); r.addColorStop(1, 'rgba(30,26,22,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  // éclats de suie en étoile
  g.strokeStyle = 'rgba(10,9,8,0.55)'; for (let i = 0; i < 22; i++) { const a = Math.random() * Math.PI * 2, l = 30 + Math.random() * 30; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); g.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke(); }
  SCORCH = new THREE.CanvasTexture(c); SCORCH.colorSpace = THREE.SRGBColorSpace; return SCORCH;
}

// ---------------------------------------------------------------- jeu
export function installLanceurs(Game) {
  const P = Game.prototype;
  // les explosions (grenades, missiles, roquettes) cassent aussi les vitrines proches
  const blast0 = P.blast;
  P.blast = function (p, r, dmg, by) {
    blast0.call(this, p, r, dmg, by);
    for (const s of this.shops) for (const v of s.vits) { if (v.broken) continue; const d = v.centre.distanceTo(p); if (d < r + 1) this.hitVitrine(v, dmg * (1 - Math.max(0, d - 1) / r), by); }
  };

  // tir : un projectile part de la bouche vers le point visé
  P.launchProj = function (a, D, mult, muzzle, origin, dir) {
    const S = D.proj, h = this.world.ray(origin, dir, 300); const aim = origin.clone().addScaledVector(dir, h ? h.t : 300);
    let start = muzzle.clone(); if (start.distanceTo(origin) > 2.5) start = origin.clone().addScaledVector(dir, 0.6); // bouche introuvable : devant les yeux
    // si la bouche est derrière un obstacle proche (contre un mur), on part des yeux
    const d0 = aim.clone().sub(start); if (d0.lengthSq() < 1 || d0.dot(dir) < 0) start = origin.clone().addScaledVector(dir, 0.6);
    const d = S.kind === 'patate' ? dir.clone() : aim.clone().sub(start).normalize();
    const m = S.kind === 'roquette' ? rocketMesh() : shellMesh(); m.position.copy(start); this.root.add(m);
    const pr = { a, D, mult, S, pos: start, vel: d.clone().multiplyScalar(S.speed), t: 0, m, cosm: !!a.puppet };
    (this.projs ||= []).push(pr);
    // départ : flamme arrière du lance-roquettes, fumée
    if (S.kind === 'roquette') {
      const back = start.clone().addScaledVector(d, -1.4);
      this.fx.burst(back, 10, { color: '#ffcf7a', speed: 5, size: 0.1, life: 0.3, emissive: true, normal: d.clone().negate() });
      for (let i = 0; i < 6; i++) this.trailPuff(back.clone().addScaledVector(d, -i * 0.25), '#9a9a9a', 1.3, 0.3, 0.5);
      if (a !== this.player) this.audio.whistle(start, 0.9);
    } else this.trailPuff(start, '#bdbdbd', 0.6, 0.3, 0.15);
    return pr;
  };

  P.updateProjs = function (dt) {
    const L = this.projs;
    // roquette visible dans le tube tant qu'il est chargé (elle réapparaît en fin de rechargement)
    for (const a of this.actors) this.ammoShow(a, a.ch.gun);
    if (this.vgun) this.ammoShow(this.player, this.vgun);
    if (!L || !L.length) return;
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i], S = s.S; s.t += dt;
      if (S.accel) { const sp = Math.min(S.max, s.vel.length() + S.accel * dt); s.vel.setLength(sp); }
      s.vel.y -= (S.grav || 0) * dt;
      const sp = s.vel.length(), dir = s.vel.clone().divideScalar(sp || 1), step = sp * dt;
      const hw = this.world.ray(s.pos, dir, step); const ha = this.rayActors(s.pos, dir, hw ? hw.t : step, s.a);
      let hitN = null, boom = false;
      if (ha && ha.t <= (hw ? hw.t : step)) { s.pos.addScaledVector(dir, ha.t); boom = true; s.direct = ha.a; }
      else if (hw) { s.pos.addScaledVector(dir, Math.max(0, hw.t - 0.05)); boom = true; hitN = hw.n; s.col = hw.c; }
      else s.pos.addScaledVector(dir, step);
      // véhicules qui roulent ou volent (leur boîte n'est pas toujours dans la grille du monde)
      if (!boom) for (const k of this.cars) { if (k.dead || k === s.a.inCar) continue; if (k.pos.distanceToSquared(s.pos) < (k.kind === 'heli' ? 2.2 : 2.6) ** 2 && s.pos.y < k.pos.y + (k.H || 1.6) + 0.3) { boom = true; s.car = k; break; } }
      if (!boom && (s.t > S.life || s.pos.y < -40)) boom = true;
      s.m.position.copy(s.pos); s.m.lookAt(s.pos.clone().add(dir));
      if ((s.tp = (s.tp || 0) - dt) <= 0) { s.tp = S.kind === 'roquette' ? 0.02 : 0.05; if (S.kind === 'roquette') { this.trailPuff(s.pos, '#ffd9a0', 0.25, 0.2, 0.1); this.trailPuff(s.pos, '#8a8a8a', 1.4, 0.4, 0.25); } else this.trailPuff(s.pos, '#a8a8a8', 0.5, 0.2, 0.08); }
      if (boom) { this.root.remove(s.m); L.splice(i, 1); this.projBoom(s, hitN); }
    }
  };
  P.ammoShow = function (a, g) {
    if (!g || !a) return; const W = this.weapon(a); if (!W || WEAPONS[W.id]?.build !== 'roquettes') return;
    const n = g.getObjectByName('ammo'); if (!n) return; const D = WEAPONS[W.id];
    n.visible = a.reloadT > 0 ? a.reloadT < D.reload * (a.perk?.reload || 1) * 0.35 : W.mag > 0;
  };

  P.projBoom = function (s, n) {
    const S = s.S, p = s.pos.clone(), by = s.a;
    if (s.cosm) { this.fx.explosion(p); this.audio.explode(p); this.scorch(p, s.col?.wall || s.col?.car ? null : n, S.R); return; } // tir d'un ami en ligne : son jeu compte les dégâts
    const dmg = S.dmg * s.mult;
    this.boom(p, S.R, dmg, by, '#ffb347', { foesOnly: true, weapon: s.D.id });
    // impact direct : la cible et le véhicule touchés prennent plein pot
    if (s.direct?.alive && s.direct.team !== by.team) this.damage(s.direct, dmg * 0.35, by, { blast: true, weapon: s.D.id });
    const car = s.car || s.col?.car; if (car && !car.dead) this.hitCar(car, dmg * (s.D.veh || 1) * 0.6, by);
    if (s.col?.wall) this.hitWall(s.col.wall, dmg * 2, by, true);
    if (s.col?.vit) this.hitVitrine(s.col.vit, dmg * 3, by);
    if (s.col?.cassable && this.world.cass) { const e = this.world.cass.byId.get(s.col.cassable); if (e) this.world.cass.damage(e, dmg * 3, V(e.pos.x - p.x, 0, e.pos.z - p.z), by); }
    // la brûlure reste sur le décor fixe ; sur une cible qui bouge ou qui peut disparaître (perso, voiture, barricade, mobilier), elle va au sol
    const fixed = n && !s.direct && !car && !s.col?.wall && !s.col?.cassable && !s.col?.vit;
    if (s.direct?.pos) this.scorch(s.direct.pos.clone(), [0, 1, 0], S.R); else this.scorch(p, fixed ? n : null, S.R);
    // éclats : pierre de taille des façades, pavés au sol
    const nv = n ? V(...n) : V(0, 1, 0), wall = Math.abs(nv.y) < 0.5;
    this.fx.burst(p.clone().addScaledVector(nv, 0.1), wall ? 22 : 16, { color: wall ? '#d6c7a8' : '#6f6a64', speed: wall ? 7 : 6, size: wall ? 0.11 : 0.08, life: 1.6, normal: nv, spread: 0.8 });
    this.fx.dust?.(p.clone().addScaledVector(nv, 0.3), wall ? 8 : 6, 1.4);
    for (let i = 0; i < 8; i++) this.trailPuff(p.clone().add(V(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1))), '#5a5652', rnd(1.5, 2.6), rnd(0.6, 1.6), 0.6);
    // les bots proches entendent l'explosion
    for (const b of this.actors) if (b.bot && b.alive && b.team !== by.team && !b.ai.target && b.pos.distanceToSquared(p) < 1600) { b.ai.target = by; b.ai.seeT = 0.5; }
  };

  // trace de brûlure collée à la surface touchée (sol, façade, toit), qui s'efface en une minute ; 24 au plus
  P.scorch = function (p, n, R) {
    if (!n) { const gy = this.world.groundY(p.x, p.z, p.y + 0.5); if (p.y - gy > 2) return; } // explosion en l'air (hélico) : pas de trace
    const L = (this.scorches ||= []); let s = L.length >= 24 ? L.shift() : null;
    if (!s) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: scorchTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.renderOrder = 1; s = { m }; this.root.add(m); }
    let nv = n ? V(...n) : null; if (!nv) { nv = V(0, 1, 0); p = p.clone(); p.y = this.world.groundY(p.x, p.z, p.y + 0.5); }
    s.m.position.copy(p).addScaledVector(nv, 0.03); s.m.lookAt(s.m.position.clone().add(nv)); s.m.rotateZ(Math.random() * Math.PI * 2);
    s.m.scale.setScalar(R * rnd(0.55, 0.7)); s.m.material.opacity = 1; s.t = 0; s.m.visible = true; L.push(s);
  };
  P.updateScorch = function (dt) { const L = this.scorches; if (!L) return; for (const s of L) { s.t += dt; if (s.t > 40) s.m.material.opacity = Math.max(0, 1 - (s.t - 40) / 20); s.m.visible = s.m.material.opacity > 0; } };
}
