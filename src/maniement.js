// Maniement des armes en vue subjective : un mélange de Call of Duty (visée alignée sur les organes de visée, recul à ressort,
// culasse et glissière qui cyclent, rechargement en étapes avec le chargeur qui sort et rentre, pompe, verrou, barillet)
// et de Fortnite (sortie d'arme rapide et lisible, inertie souple, arme toujours bien cadrée).
// Astuces invisibles : pendant le rechargement le chargeur plein remplace le vide hors champ, sous le bord de l'écran ;
// la main gauche suit le chargeur par cinématique inverse, sans animation dédiée par arme.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { gunInstance } from './assets.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sm = (u, a, b) => { const t = clamp((u - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bump = (u, a, b) => { const t = clamp((u - a) / (b - a), 0, 1); return Math.sin(t * Math.PI); }; // 0 → 1 → 0
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// repère du modèle (x vers la bouche, z à droite) → repère de l'arme à l'écran (x à droite, -z vers la bouche)
const mv = (p, dz = 0) => V(p[2] ?? dz, p[1], -p[0]);
// ressort amorti (position x, vitesse v)
function spring(s, k, c, dt) { const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { s.v += (-k * s.x - c * s.v) * h; s.x += s.v * h; } }

export function installManiement(Game) {
  const P = Game.prototype;
  // vue à l'épaule (comme dans Fortnite) : l'arme longue qu'on n'a pas en main se porte dans le dos, en travers, canon vers le haut
  const equip0 = P.equip;
  P.equip = function (a, i, silent) {
    equip0.call(this, a, i, silent); if (a !== this.player) return;
    const ch = a.ch, Bn = ch.bones.Chest; if (ch.backGun) { ch.backGun.parent?.remove(ch.backGun); ch.backGun = null; }
    const o = a.slots.find((s, j) => s && j !== a.cur && WEAPONS[s.id] && WEAPONS[s.id].hand !== 'pistol'); if (!o || !Bn) return;
    try { const g = gunInstance(o.id, true), D = g.userData.dim || { rear: -0.3, front: 0.5 }; ch.root.updateMatrixWorld(true);
      const rq = ch.root.getWorldQuaternion(new THREE.Quaternion()), fwd = V(0, 0, 1).applyQuaternion(rq), left = V(1, 0, 0).applyQuaternion(rq), up = V(0, 1, 0);
      const X = up.clone().multiplyScalar(0.82).addScaledVector(left, -0.57).normalize(), Z = fwd.clone().negate(), Y = V().crossVectors(Z, X).normalize(); Z.crossVectors(X, Y);
      const sc = g.scale.x, pos = Bn.getWorldPosition(V()).addScaledVector(fwd, -0.15).addScaledVector(X, -(D.rear + D.front) / 2 * (D.unit || 1) * (sc / (D.unit || 1))).addScaledVector(up, 0.02);
      const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(pos).scale(V(sc, sc, sc)); m.premultiply(Bn.matrixWorld.clone().invert()); m.decompose(g.position, g.quaternion, g.scale);
      g.traverse((q) => { if (q.isMesh) q.castShadow = true; }); Bn.add(g); ch.backGun = g; ch.meshes = null; } catch (e) { console.warn('arme dans le dos', e); }
  };
  const viewGun0 = P.viewGun;
  P.viewGun = function () {
    viewGun0.call(this); if (!this.vgun) return;
    const g = this.vgun.children[0], M = g.userData.meta || null, parts = {};
    for (const n of ['mag', 'bolt', 'pump', 'cyl', 'cover', 'brk']) { const o = g.getObjectByName(n); if (o) parts[n] = { o, p: o.position.clone(), r: o.rotation.clone() }; }
    const old = this.vm;
    this.vm = { M, parts, id: this.weapon(this.player).id, draw: 0.4, boltT: 0, cycle: 0, cycleD: 0, pumpT: 0, cylA: old?.id === this.weapon(this.player).id ? old.cylA : 0, cylT: 0,
      rz: { x: 0, v: 0 }, rp: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, rr: { x: 0, v: 0 }, dy: { x: 0, v: 0 }, lagX: 0, lagY: 0, tilt: 0, run: 0, ads: 0, yaw: this.cam.yaw, pitch: this.cam.pitch, wasGround: true, fall: 0, relEmpty: false, relOn: false, ev: {} };
    this.vhand = { L: V(), Lw: 0, R: V(), Rw: 0, Ls: V() };
  };

  // tir du joueur : recul, culasse, pompe, verrou, barillet
  const fire0 = P.fire;
  P.fire = function (a, origin, dir) {
    const W = a === this.player ? this.weapon(a) : null, before = W ? W.mag : 0;
    const r = fire0.call(this, a, origin, dir);
    const vm = this.vm; if (!W || !vm || W.mag >= before) return r;
    const D = WEAPONS[W.id], ads = this.aiming ? 0.55 : 1, w = 17, e = Math.E * w;
    vm.rz.v += (0.01 + D.kick * 0.75) * ads * e; vm.rp.v += (0.014 + D.kick * 1.5) * ads * e; vm.ry.v += (Math.random() - 0.5) * (0.012 + D.kick * 0.5) * ads * e; vm.rr.v += (Math.random() - 0.5) * (0.03 + D.kick * 0.9) * e;
    const M = vm.M; if (!M) return r;
    if (M.bolt?.lift) { if (W.mag > 0) { vm.cycleD = Math.max(0.5, 1 / D.rps - 0.12); vm.cycle = vm.cycleD; } }
    else if (M.pump) { if (W.mag > 0) vm.pumpT = 0.56; }
    else vm.boltT = 0.075;
    if (M.kind === 'revolver') { vm.cylA += Math.PI / 3; vm.cylT = 0.12; }
    return r;
  };

  P.updateViewGun = function (dt, sp, bobA) {
    const a = this.player, C = this.cam, g = this.vgun, vm = this.vm; if (!vm) return;
    const W = this.weapon(a), D = WEAPONS[W.id], M = vm.M, H = this.vhand, parts = vm.parts, k = 1 - Math.exp(-dt * 14);
    const pistol = this.vgunPistol, len = this.vgunLen || 0.3;
    // ---- pose de base : à la hanche (nombre d'or) ou en visée, la ligne de mire au centre de l'écran
    vm.ads += ((this.aiming ? 1 : 0) - vm.ads) * (1 - Math.exp(-dt * (this.aiming ? 16 : 13)));
    const sy = M ? M.sightY : (this.vgunTop || 0.12) + 0.012;
    const adsP = V(0, -sy - (M?.optic ? 0 : 0.0015), pistol ? -0.36 : -0.25 - Math.min(0.08, len * 0.12)), hip = this.hipLayout();
    const e = vm.ads * vm.ads * (3 - 2 * vm.ads), pos = hip.clone().lerp(adsP, e), rot = V(0, 0, (1 - e) * e * -0.25); // léger roulis pendant la montée en visée
    // ---- marche, respiration
    const t = C.bob, calm = 1 - e * 0.8, tt = this.time;
    pos.x += Math.cos(t) * 0.012 * bobA * calm; pos.y += -Math.abs(Math.sin(t)) * 0.015 * bobA * calm + Math.sin(tt * 1.7) * 0.0016 * calm; rot.z += Math.cos(t) * 0.012 * bobA * calm; rot.x += Math.sin(tt * 1.7 + 1) * 0.004 * calm;
    // ---- inertie : l'arme traîne derrière le regard, puis le rattrape
    const dYaw = wrap(C.yaw - vm.yaw), dPitch = C.pitch - vm.pitch; vm.yaw = C.yaw; vm.pitch = C.pitch; const idt = 1 / Math.max(dt, 1e-3);
    vm.lagY += (clamp(-dYaw * idt * 0.012, -0.11, 0.11) - vm.lagY) * (1 - Math.exp(-dt * 9)); vm.lagX += (clamp(-dPitch * idt * 0.012, -0.09, 0.09) - vm.lagX) * (1 - Math.exp(-dt * 9));
    rot.y += vm.lagY * calm; rot.x += vm.lagX * calm; pos.x += vm.lagY * 0.05 * calm; pos.y -= vm.lagX * 0.04 * calm; rot.z += vm.lagY * 0.5 * calm;
    // ---- pas de côté : l'arme s'incline dans le sens du déplacement
    const fw = this.camera.getWorldDirection(V()), right = V().crossVectors(fw, V(0, 1, 0)).normalize(), lat = a.vel ? a.vel.dot(right) : 0;
    vm.tilt += (clamp(lat * 0.012, -0.06, 0.06) - vm.tilt) * (1 - Math.exp(-dt * 8)); rot.z -= vm.tilt * calm; pos.x += vm.tilt * 0.12 * calm;
    // ---- saut et réception
    const vy = a.vel ? a.vel.y : 0; if (a.onGround && !vm.wasGround) vm.dy.v -= clamp(vm.fall * 0.09, 0.3, 1.3); vm.wasGround = a.onGround; vm.fall = a.onGround ? 0 : Math.max(0, -vy);
    spring(vm.dy, 150, 17, dt); pos.y += vm.dy.x + (a.onGround ? 0 : clamp(-vy * 0.004, -0.025, 0.03)); rot.x += vm.dy.x * 1.2;
    // ---- course : arme relevée en travers
    const run = a.momentum > 0.7 && !this.aiming && a.reloadT <= 0 && vm.draw <= 0; vm.run += ((run ? 1 : 0) - vm.run) * (1 - Math.exp(-dt * 9));
    const rn = vm.run; if (pistol) { pos.y += 0.03 * rn; rot.x += 0.5 * rn; rot.z += 0.1 * rn; } else { pos.x -= 0.03 * rn; pos.y -= 0.035 * rn; rot.x -= 0.1 * rn; rot.y += 0.42 * rn; rot.z += 0.22 * rn; }
    pos.y += Math.sin(t * 2) * 0.008 * rn; pos.x += Math.cos(t) * 0.014 * rn;
    // ---- recul à ressort
    spring(vm.rz, 289, 26, dt); spring(vm.rp, 289, 26, dt); spring(vm.ry, 289, 24, dt); spring(vm.rr, 289, 22, dt);
    pos.z += vm.rz.x; rot.x += vm.rp.x; rot.y += vm.ry.x; rot.z += vm.rr.x; pos.y += vm.rp.x * 0.06;
    // ---- sortie de l'arme
    if (vm.draw > 0) { vm.draw -= dt; const u = clamp(1 - vm.draw / 0.4, 0, 1), c1 = 1.9, o = 1 - (1 + (c1 + 1) * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2)); pos.x += 0.06 * o; pos.y -= 0.3 * o; pos.z += 0.08 * o; rot.x -= 0.95 * o; rot.z += 0.55 * o; rot.y += 0.3 * o; }

    // ---- pièces mobiles et mains
    for (const n in parts) { const p = parts[n]; p.o.position.copy(p.p); p.o.rotation.copy(p.r); p.o.visible = true; }
    H.Lw = 0; H.Rw = 0; H.Ls.set(0, 0, 0);
    const ev = (name, fn) => { if (!vm.ev[name]) { vm.ev[name] = 1; fn(); } };
    const jolt = (y, p) => { vm.dy.v += y; vm.rp.v += p; };
    const tr = M?.bolt?.travel || 0.04;
    // culasse ou glissière au départ du coup ; glissière arrêtée en arrière chargeur vide
    if (vm.boltT > 0) { vm.boltT -= dt; if (parts.bolt && !M.bolt?.lift) parts.bolt.o.position.x -= tr * bump(1 - vm.boltT / 0.075, 0, 1); }
    const locked = M?.bolt?.slide && W.mag <= 0 && vm.boltT <= 0;
    // barillet qui tourne d'un cran
    if (parts.cyl) { vm.cylT = Math.max(0, vm.cylT - dt); parts.cyl.o.rotation.x = vm.cylA - (vm.cylT / 0.12) * Math.PI / 3; }
    // pompe : la main gauche tire le fût en arrière puis le repousse
    if (vm.pumpT > 0 && parts.pump) { vm.pumpT -= dt; const u = 1 - vm.pumpT / 0.56, b = bump(u, 0.3, 0.95), d = M.pump.travel * b; parts.pump.o.position.x -= d; H.Ls.z = d; pos.z += d * 0.25; rot.x += b * 0.05; rot.z -= b * 0.06; if (parts.bolt) parts.bolt.o.position.x -= tr * b; if (u > 0.55) ev('pump', () => { this.audio.click(); }); } else delete vm.ev.pump;
    // verrou : la main droite lève la poignée, tire, repousse, rabat
    if (vm.cycle > 0 && parts.bolt) { vm.cycle -= dt; const u = 1 - vm.cycle / vm.cycleD, lift = sm(u, 0.22, 0.36) * (1 - sm(u, 0.78, 0.92)), back = sm(u, 0.36, 0.52) * (1 - sm(u, 0.6, 0.78));
      parts.bolt.o.rotation.x = -lift * 0.95; parts.bolt.o.position.x -= tr * back; const hd = M.bolt.handle; H.R.copy(mv([hd[0] - tr * back, hd[1] + lift * 0.035, hd[2] - lift * 0.02])).add(V(0.02, -0.02, 0.05)); H.Rw = sm(u, 0.1, 0.24) * (1 - sm(u, 0.86, 1));
      rot.z -= 0.1 * H.Rw; rot.x += 0.05 * H.Rw; pos.z += back * 0.025; pos.y -= 0.012 * H.Rw; if (u > 0.5) ev('boltc', () => this.audio.click()); } else delete vm.ev.boltc;

    // ---- rechargement en étapes
    const total = D.reload * (a.perk?.reload || 1), on = a.reloadT > 0;
    if (on && !vm.relOn) { vm.relEmpty = W.mag <= 0; vm.ev = {}; } vm.relOn = on;
    if (on) {
      const u = clamp(1 - a.reloadT / total, 0, 1), kind = M ? M.kind : null, hold = sm(u, 0, 0.12) * (1 - sm(u, 0.84, 1));
      const rackL = (u0, u1) => { // armement à la main gauche (levier ou glissière)
        const b = bump(u, u0, u1), w = sm(u, u0 - 0.07, u0) * (1 - sm(u, u1, u1 + 0.06)); if (parts.bolt) parts.bolt.o.position.x = parts.bolt.p.x - tr * (M.bolt?.slide ? 1 - sm(u, (u0 + u1) / 2, u1) : b);
        const hd = M.bolt?.handle; if (hd && w > 0.001) { const tg = mv([hd[0] - tr * b, hd[1], hd[2]]).add(V(-0.03, -0.01, 0.03)); if (H.Lw > 0.001) H.L.lerp(tg, w); else H.L.copy(tg); H.Lw = Math.max(H.Lw, w); } pos.z += b * 0.02; rot.x += b * 0.04; if (u > (u0 + u1) / 2) ev('rack', () => { this.audio.click(); jolt(0, 0.6); }); };
      if (kind === 'mag' || kind === 'belt') {
        // l'arme se couche, la main gauche sort le chargeur vers le bas, hors champ, puis en remonte un plein
        if (pistol) { pos.x -= 0.1 * hold; pos.y += 0.13 * hold; pos.z -= 0.04 * hold; rot.z -= 0.5 * hold; rot.x += 0.55 * hold; } else { pos.x -= 0.11 * hold; pos.y += 0.075 * hold; pos.z += 0.02 * hold; rot.z -= 0.62 * hold; rot.x += 0.36 * hold; rot.y -= 0.12 * hold; }
        const belt = kind === 'belt', c0 = belt ? 0.1 : 0, out = sm(u, 0.13 + c0, 0.27 + c0), back = sm(u, 0.46 + c0, 0.62 + c0), d = out * (1 - back), far = bump(u, 0.24 + c0, 0.5 + c0);
        const dl = Math.hypot(M.magDir[0], M.magDir[1]), dx = M.magDir[0] / dl, dyy = M.magDir[1] / dl, dist = 0.2 * d + 0.25 * far;
        if (parts.mag) { parts.mag.o.position.x += dx * dist; parts.mag.o.position.y += dyy * dist; parts.mag.o.rotation.z = (out - back) * 0.25 * (1 - far); }
        if (parts.cover) { const o = sm(u, 0.06, 0.16) * (1 - sm(u, 0.74, 0.82)); parts.cover.o.rotation.z = -1.15 * o; if (u > 0.8) ev('cover', () => { this.audio.click(); jolt(-0.25, -0.5); }); }
        H.L.copy(mv([M.mag[0] + dx * (dist + 0.05) - 0.03, M.mag[1] + dyy * (dist + 0.05), 0])).add(V(-0.015, 0, 0)); H.Lw = sm(u, 0.03, 0.12 + c0) * (1 - sm(u, 0.66 + c0, 0.78 + c0));
        if (u > 0.2 + c0) ev('out', () => { this.audio.tink?.(); jolt(0.1, 0.3); }); if (u > 0.61 + c0) ev('in', () => { this.audio.click(); jolt(0.45, -0.7); });
        if (vm.relEmpty && M.bolt) { if (M.bolt.slide) { if (parts.bolt) parts.bolt.o.position.x = parts.bolt.p.x - tr * (1 - sm(u, 0.8, 0.84)); if (u > 0.82) ev('rack', () => { this.audio.click(); jolt(0, -0.5); }); } else if (M.bolt.lift) { /* le verrou sera manœuvré au premier coup */ } else rackL(0.78 + c0 * 0.6, 0.9 + c0 * 0.4); }
      } else if (kind === 'tube') {
        // l'arme pivote, la main gauche glisse les cartouches une à une sous le boîtier
        pos.x -= 0.04 * hold; pos.y += 0.05 * hold; rot.z -= 0.7 * hold; rot.x += 0.3 * hold; const n = clamp(Math.round(total / 0.55), 2, 5), u0 = 0.14, u1 = vm.relEmpty ? 0.76 : 0.86, f = clamp((u - u0) / (u1 - u0), 0, 0.9999) * n, i = Math.floor(f), ph = f - i, inn = bump(ph, 0, 1);
        H.L.copy(mv([0.07, 0.02 - 0.16 * (1 - inn), 0])).add(V(-0.01, 0, 0)); H.Lw = sm(u, 0.04, u0) * (1 - sm(u, u1, u1 + 0.08)); if (u > u0 && u < u1 && ph > 0.45) ev('s' + i, () => { this.audio.click(); jolt(0.25, -0.3); });
        if (vm.relEmpty && parts.pump) { const b = bump(u, 0.84, 0.97), d = M.pump.travel * b; parts.pump.o.position.x -= d; H.Ls.z = d; if (u > 0.9) ev('rack', () => { this.audio.click(); jolt(0, 0.5); }); }
      } else if (kind === 'revolver') {
        // barillet basculé à gauche, canon levé pour vider, la main gauche recharge, coup de poignet pour refermer
        const o = sm(u, 0.08, 0.2) * (1 - sm(u, 0.76, 0.84)); pos.x -= 0.06 * hold; pos.y += 0.04 * hold; rot.x += (0.75 * bump(u, 0.12, 0.42) + 0.1) * hold; rot.z += 0.35 * hold; rot.y += 0.25 * hold;
        if (parts.cyl) { parts.cyl.o.position.z -= 0.034 * o * M.k; parts.cyl.o.position.y -= 0.012 * o * M.k; parts.cyl.o.rotation.x += u * 9; }
        H.L.copy(mv([M.mag[0], M.mag[1] - 0.02 - 0.2 * (1 - bump(u, 0.36, 0.86)), -0.05])); H.Lw = sm(u, 0.3, 0.44) * (1 - sm(u, 0.7, 0.8)); if (u > 0.58) ev('in', () => { this.audio.click(); jolt(0.2, -0.3); }); if (u > 0.82) ev('rack', () => { this.audio.click(); jolt(-0.2, 0.8); vm.rr.v += 3; });
      } else if (kind === 'break') {
        // les canons basculent, deux cartouches, on referme d'un coup sec
        const o = sm(u, 0.08, 0.2) * (1 - sm(u, 0.78, 0.86)); pos.x -= 0.05 * hold; pos.y += 0.05 * hold; rot.x += 0.3 * hold; rot.z -= 0.3 * hold; if (parts.brk) parts.brk.o.rotation.z = -0.62 * o;
        const f = clamp((u - 0.24) / 0.5, 0, 0.9999) * 2, ph = f - Math.floor(f); H.L.copy(mv([M.mag[0] - 0.02, M.mag[1] + 0.03 - 0.18 * (1 - bump(ph, 0, 1)), 0])); H.Lw = sm(u, 0.14, 0.26) * (1 - sm(u, 0.74, 0.82));
        if (u > 0.24 && u < 0.74 && ph > 0.45) ev('s' + Math.floor(f), () => { this.audio.click(); jolt(0.2, -0.2); }); if (u > 0.84) ev('rack', () => { this.audio.click(); jolt(-0.3, 1.0); });
      } else { const rel = Math.sin(u * Math.PI); pos.y -= rel * 0.15; rot.x += rel * 0.6; } // lanceurs : l'arme plonge hors champ
    } else if (locked && parts.bolt) parts.bolt.o.position.x = parts.bolt.p.x - tr;
    // chargeur du personnage vu à l'épaule : absent pendant l'échange
    const tg = a.ch?.gun?.getObjectByName('mag'); if (tg) { const u = on ? 1 - a.reloadT / total : 1; tg.visible = !(u > 0.25 && u < 0.55); }

    g.position.lerp(pos, 1 - Math.exp(-dt * 26)); g.rotation.set(rot.x, rot.y, rot.z);
    this.poseViewArms();
  };
}
