// Couches d'animation écrites à la main, posées par-dessus les clips (après le mixer) :
//  - jambes : les pieds restent attachés aux chevilles (le rig a des pieds libres), IK deux os, adaptation au sol (trottoirs, marches),
//    pieds plantés à l'arrêt avec petits pas quand on pivote sur place ;
//  - poids : le corps penche dans l'accélération et dans les virages, le bassin s'écrase à la réception et se détend à l'impulsion ;
//  - chevauchement (overlap) : le bassin traîne, le buste puis la tête mènent le virage, la tête arrive après le buste ;
//  - souffle selon l'effort, recul et impacts en ressorts amortis (attaque vive, retour avec léger dépassement).
// Tout est calculé dans le repère de l'os Root (x = gauche du perso, y = haut, z = devant), sans matrices monde.
import * as THREE from 'three';
import { chars } from './assets.js';

const clamp = THREE.MathUtils.clamp;
const Q = () => new THREE.Quaternion(), V3 = () => new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _p = Q(), _d = Q(), _t = Q(), _q1 = Q(), _q2 = Q(), _q3 = Q(), _e = new THREE.Euler();
const _hip = V3(), _knee = V3(), _dir = V3(), _pole = V3(), _v = V3(), _w = V3(), _nk = V3(), _old = V3();
const SPINE = ['Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head'];
const iBody = 0, iAbdomen = 2, iTorso = 3, iChest = 4, iNeck = 5, iHead = 6;
// force du coup de recul par arme (vitesse donnée au ressort)
const KICK = { pistol: 1.5, revolver: 2.6, pistolet_lourd: 2.2, pistolet_auto: 0.8, smg: 0.9, pm: 0.85, compact: 0.8, rifle: 1.15, carabine: 1.05, rafale: 1.1, fusil_lourd: 1.7, shotgun: 3.6, pompe_court: 3.8, semi_auto: 2.8, canon_scie: 4.4, dmr: 2.6, sniper: 4.2, calibre50: 6, mitrailleuse: 1.2 };

// ressort amorti (intégration semi-implicite, stable aux grands pas) : f en Hz, z = amortissement (1 = critique, < 1 = dépasse puis revient)
// Ressort amorti. Intégré par petits pas (1/120 s au plus) : en un seul pas de 1/30 s ou plus, les ressorts raides
// (recul f = 6, encaisser, tête) devenaient instables et grossissaient sans fin dès que le jeu passait sous ~35 images/s,
// jusqu'à une valeur invalide (NaN) qui cassait le squelette, puis les flammes de tir, la lumière, le halo (rectangles noirs) et le son.
function spring(s, target, f, z, dt) {
  const w = 2 * Math.PI * f, T = Math.min(dt, 0.1), n = Math.max(1, Math.ceil(T * 120)), h = T / n;
  for (let i = 0; i < n; i++) { s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h; s.x += s.v * h; }
  if (!(Math.abs(s.x) < 1e3 && Math.abs(s.v) < 1e5)) { s.x = 0; s.v = 0; } // garde-fou : jamais d'infini ni de NaN qui se propage
  return s.x;
}
// remet à zéro l'état des couches si une valeur invalide s'y est glissée (impulsion NaN, téléportation…)
function healRig(R) {
  const fin = (v) => Number.isFinite(v);
  const springs = [R.lean.x, R.lean.z, R.pelvis, R.twist, R.head.yaw, R.head.pitch, R.head.nod, R.curl, R.rec.p, R.rec.y, R.rec.z, R.hit.x, R.hit.z, R.hit.hx, R.hit.hz];
  let bad = !fin(R.acc.x + R.acc.z + R.pv.x + R.pv.z + R.yaw0 + R.yawRate + R.effort + R.breath + R.plantW + R.slide + R.roll + R.vy + R.w + R.drop);
  for (const q of springs) if (!fin(q.x + q.v)) bad = true;
  for (const g of R.legs) if (!fin(g.off + g.T.x + g.T.y + g.T.z) || (g.lock && !fin(g.lock.x + g.lock.z + g.lock.yaw))) bad = true;
  if (!bad) return false;
  for (const q of springs) { q.x = 0; q.v = 0; }
  R.acc.set(0, 0, 0); R.pv.set(0, 0, 0); R.yaw0 = 0; R.yawRate = 0; R.effort = 0; R.breath = 0; R.plantW = 0; R.slide = 0; R.roll = 0; R.vy = 0; R.w = 1; R.drop = 0;
  for (const g of R.legs) { g.off = 0; g.T.set(0, 0, 0); g.lock = g.step = null; g.lift = 0; }
  return true;
}
const S = () => ({ x: 0, v: 0 });
const ease = (t) => t * t * (3 - 2 * t);
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

function makeRig(a) {
  const ch = a.ch, B = ch.bones;
  // deux squelettes connus : Modular Men (Root > Body > Hips, cuisses sous Body, pieds libres sous Root) et le squelette type Unreal
  // des persos Fantasy (root couché de 90° > Hips, cuisses sous Hips, pieds sous les tibias). Le bassin est Body s'il existe, sinon Hips.
  const pel = B.Body || B.Hips;
  const R = { ok: false, spine: SPINE.map((n, i) => (i === 0 ? pel : n === 'Hips' && !B.Body ? null : B[n]) || null), legs: [], saved: [] };
  if (!pel || !pel.parent?.isBone || !B.UpperLegL || !B.LowerLegL || !B.FootL) return R;
  // longueur du tibia : mesurée sur le modèle source au repos (pied posé au bout du tibia)
  let shin = 0.511; const src = chars[a.skin]?.scene;
  if (src) { const f = src.getObjectByName('FootL'), l = src.getObjectByName('LowerLegL'); if (f && l) { src.updateMatrixWorld(true); const d = l.worldToLocal(f.getWorldPosition(V3())).length(); if (d > 0.2 && d < 1.2) shin = d; } }
  for (const s of ['L', 'R']) {
    const U = B['UpperLeg' + s], L = B['LowerLeg' + s], F = B['Foot' + s];
    // hauteur de la cheville au repos, dans le repère du perso (parent de l'os racine)
    let restY = 0.03; const sf = src?.getObjectByName('Foot' + s), sp = src?.getObjectByName(pel.name)?.parent?.parent; if (sf && sp) restY = sp.worldToLocal(sf.getWorldPosition(V3())).y;
    R.legs.push({ U, L, F, free: F.parent !== L, l1: L.position.length(), l2: shin, T: V3(), fq: Q(), off: 0, lock: null, step: null, restY });
  }
  { const sp = src?.getObjectByName(pel.name), sc = sp?.parent?.parent; R.pelY = sp && sc ? sc.worldToLocal(sp.getWorldPosition(V3())).y : 0.85; }
  // bassin : dans les clips Mixamo c'est l'os Hips qui bouge et tourne, alors que les cuisses sont accrochées à Body ;
  // on garde la pose de repos de Hips pour reporter son mouvement sur Body (sinon les cuisses s'étirent dès que le bassin s'écarte : saut, glissade, roulade, chutes)
  const h0 = src?.getObjectByName('Hips'); R.hips = B.Hips && B.Hips.parent === B.Body && h0 ? { b: B.Hips, q: h0.quaternion.clone(), qi: h0.quaternion.clone().invert(), p: h0.position.clone() } : null;
  R.rootBone = pel.parent; R.flat = R.legs.every((g) => (g.free ? g.F.parent === R.rootBone : true) && g.U.parent === pel);
  // os que les couches modifient : remis dans leur pose d'animation avant chaque passage du mixer
  const mod = new Set(R.spine.filter(Boolean)); for (const g of R.legs) { mod.add(g.U); mod.add(g.L); mod.add(g.F); }
  for (const b of mod) R.saved.push({ b, q: b.quaternion.clone(), p: b.position.clone(), pos: b === pel || b === B.Hips || /^Foot/.test(b.name) });
  R.lean = { x: S(), z: S() }; R.pelvis = S(); R.twist = S(); R.head = { yaw: S(), pitch: S(), nod: S() }; R.curl = S();
  R.rec = { p: S(), y: S(), z: S() }; R.hit = { x: S(), z: S(), hx: S(), hz: S() };
  R.pv = V3(); R.acc = V3(); R.yaw0 = a.yaw; R.yawRate = 0; R.effort = 0; R.breath = Math.random() * 6; R.plantW = 0; R.slide = 0; R.roll = 0; R.stepSide = 0; R.wasGround = true; R.vy = 0; R.w = 1; R.drop = 0;
  R.ok = true; return R;
}
const rig = (a) => a.ch.rig || (a.ch.rig = makeRig(a));

// avant le mixer : on rend aux os leur pose d'animation (sinon les corrections s'accumulent d'une image à l'autre)
export function restore(a) { const R = rig(a); for (const s of R.saved) { s.b.quaternion.copy(s.q); if (s.pos) s.b.position.copy(s.p); } }
// après le mixer : la pose d'animation de l'image devient la référence
export function capture(a) { const R = rig(a); for (const s of R.saved) { s.q.copy(s.b.quaternion); if (s.pos) s.p.copy(s.b.position); } }

// reporte le mouvement de Hips sur Body : le bassin emmène les cuisses, qui gardent leur orientation d'animation
const _hq = Q(), _hv = V3();
function pelvis(R) {
  const H = R.hips; if (!H) return; const body = R.spine[0], h = H.b;
  _hq.copy(h.quaternion).multiply(H.qi); // rotation de Hips par rapport au repos, dans le repère de Body
  // les clips de saut et de roulade montent le bassin de près d'un mètre : c'est la physique du jeu qui porte le perso, on ne garde que l'abaissement
  const up = h.position.y - H.p.y; if (up > 0.05) h.position.y = H.p.y + 0.05 + (up - 0.05) * 0.12;
  _hv.copy(h.position).applyQuaternion(body.quaternion).add(body.position); // position de Hips à conserver
  body.quaternion.multiply(_hq); _hq.invert();
  for (const g of R.legs) g.U.quaternion.premultiply(_hq);
  h.quaternion.copy(H.q); h.position.copy(H.p);
  body.position.copy(_hv).sub(_w.copy(H.p).applyQuaternion(body.quaternion));
}
// cheville d'une jambe dans le repère Root, d'après la pose courante (cinématique directe)
function ankle(body, g, out, knee) {
  _hip.copy(g.U.position).applyQuaternion(body.quaternion).add(body.position);
  _q1.multiplyQuaternions(body.quaternion, g.U.quaternion);
  _knee.copy(g.L.position).applyQuaternion(_q1).add(_hip);
  _q2.multiplyQuaternions(_q1, g.L.quaternion);
  out.set(0, g.l2, 0).applyQuaternion(_q2).add(_knee); if (knee) knee.copy(_knee);
  return out;
}
// bassin dans le repère du perso (y = haut, z = devant), quel que soit l'os racine ; tout le calcul des jambes se fait dessus
const _zero = new THREE.Vector3();
const PB = { position: V3(), quaternion: Q() }, _ri = Q();
function load(R) {
  const pel = R.spine[0], rt = R.rootBone; _ri.copy(rt.quaternion).invert();
  PB.quaternion.multiplyQuaternions(rt.quaternion, pel.quaternion); PB.position.copy(pel.position).applyQuaternion(rt.quaternion).add(rt.position);
}
const store = (R) => R.spine[0].position.copy(PB.position).sub(R.rootBone.position).applyQuaternion(_ri);
// pose d'animation remise d'aplomb : bassin qui emmène les cuisses (Modular Men), et pas de montée du bassin venue du clip
// (les clips de saut le montent de près d'un mètre alors que c'est la physique du jeu qui porte le perso)
function settle(R) {
  pelvis(R); load(R);
  if (!R.hips) { const up = PB.position.y - R.pelY; if (up > 0.05) { PB.position.y = R.pelY + 0.05 + (up - 0.05) * 0.12; store(R); } }
}
const putFoot = (R, g, T) => g.F.position.copy(T).sub(R.rootBone.position).applyQuaternion(_ri);
// le pied libre (enfant de Root) est posé au bout du tibia : sans cela il reste au sol pendant que la jambe court
export function attachFeet(a) {
  const R = rig(a); if (!R.ok || !R.flat) return; settle(R);
  for (const g of R.legs) if (g.free) putFoot(R, g, ankle(PB, g, _v));
}
// acteur mort : le clip de chute joue seul, pieds attachés
export function dead(a, dt) { restore(a); a.ch.mixer.update(dt); capture(a); attachFeet(a); const R = rig(a); if (R.ok) { R.plantW = 0; for (const g of R.legs) { g.lock = g.step = null; } } }

// IK deux os : la cheville va sur T, le genou garde le plan de flexion de l'animation
function solveLeg(body, g, T) {
  _hip.copy(g.U.position).applyQuaternion(body.quaternion).add(body.position);
  _q1.multiplyQuaternions(body.quaternion, g.U.quaternion);
  _old.copy(g.L.position).applyQuaternion(_q1); // cuisse actuelle (hanche → genou)
  _dir.copy(T).sub(_hip); const L = clamp(_dir.length(), Math.abs(g.l1 - g.l2) + 1e-3, g.l1 + g.l2 - 2e-3); _dir.normalize();
  _pole.copy(_old).addScaledVector(_dir, -_old.dot(_dir)); if (_pole.lengthSq() < 1e-8) _pole.set(0, 0, 1).addScaledVector(_dir, -_dir.z); _pole.normalize();
  const cosA = clamp((g.l1 * g.l1 + L * L - g.l2 * g.l2) / (2 * g.l1 * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _nk.copy(_dir).multiplyScalar(g.l1 * cosA).addScaledVector(_pole, g.l1 * sinA); // nouvelle cuisse
  _d.setFromUnitVectors(_old.normalize(), _w.copy(_nk).normalize()); _q1.premultiply(_d);
  g.U.quaternion.copy(_t.copy(body.quaternion).invert().multiply(_q1));
  _q2.multiplyQuaternions(_q1, g.L.quaternion); _old.set(0, 1, 0).applyQuaternion(_q2);
  T.copy(_hip).addScaledVector(_dir, L); // cheville réellement atteinte
  _w.copy(T).sub(_hip).sub(_nk).normalize(); _d.setFromUnitVectors(_old, _w); _q2.premultiply(_d);
  g.L.quaternion.copy(_t.copy(_q1).invert().multiply(_q2));
}

// applique des rotations exprimées dans le repère du perso le long de la colonne (chaque os hérite de ceux d'en dessous)
const _dl = SPINE.map(() => Q()), _use = SPINE.map(() => false);
function spinePass(R) {
  _p.copy(R.rootBone.quaternion);
  for (let i = 0; i < R.spine.length; i++) {
    const b = R.spine[i]; if (!b) continue;
    if (_use[i]) { _t.copy(_p).invert().multiply(_dl[i]).multiply(_p); b.quaternion.premultiply(_t); _use[i] = false; }
    _p.multiply(b.quaternion);
  }
}
const setD = (i, x, y, z) => { _dl[i].setFromEuler(_e.set(x, y, z, 'YXZ')); _use[i] = true; };

// coup de recul (appelé au tir) et encaissement (appelé quand on est touché ; f, sd : direction du tireur vue du perso)
export function kick(a, id) { const R = rig(a); if (!R.ok) return; const k = KICK[id] || 1; R.rec.p.v += k * 1.6; R.rec.y.v += (Math.random() - 0.5) * k * 0.9; R.rec.z.v += k * 0.5; }
export function flinch(a, f, sd, amount = 20) { const R = rig(a); if (!R.ok) return; const n = Math.hypot(f, sd) || 1, k = clamp(1.2 + amount / 14, 1.2, 5); R.hit.z.v -= f / n * k; R.hit.x.v -= sd / n * k; }

// couche principale. near : calcul complet (IK, sol, colonne) ; sinon seulement les pieds attachés. Renvoie true si la couche « après visée » doit passer
export function layers(game, a, dt, near) {
  const R = rig(a); if (!R.ok) return false;
  if (!Number.isFinite(dt) || !Number.isFinite(a.vel.x + a.vel.y + a.vel.z + a.yaw)) return false;
  healRig(R);
  const ch = a.ch, body = PB;
  // ---- état : accélération et vitesse de rotation, dans le repère du perso
  const yaw = ch.root.rotation.y, sn = Math.sin(yaw), cs = Math.cos(yaw);
  const idt = dt > 1e-4 ? 1 / dt : 0, kA = 1 - Math.exp(-dt * 12);
  R.acc.x += ((a.vel.x - R.pv.x) * idt - R.acc.x) * kA; R.acc.z += ((a.vel.z - R.pv.z) * idt - R.acc.z) * kA; R.pv.copy(a.vel);
  const aF = R.acc.x * sn + R.acc.z * cs, aS = R.acc.x * cs - R.acc.z * sn; // vers l'avant, vers la gauche
  R.yawRate += (clamp(angDiff(a.yaw, R.yaw0) * idt, -8, 8) - R.yawRate) * (1 - Math.exp(-dt * 10)); R.yaw0 = a.yaw;
  const sp = Math.hypot(a.vel.x, a.vel.z);
  R.effort = clamp(R.effort + dt * (sp > 6 ? 0.14 : -0.05), 0, 1); R.breath += dt * (1.5 + R.effort * 3.2);
  // réception et impulsion : le bassin s'écrase puis remonte, le buste plonge un peu, la tête arrive après
  if (a.onGround && !R.wasGround) { const im = clamp(-R.vy, 0, 16); R.pelvis.v -= im * 0.34; R.curl.v += im * 0.28; R.head.nod.v += im * 0.2; }
  if (!a.onGround && R.wasGround && a.vel.y > 2) { R.pelvis.v += 1.1; R.curl.v -= 0.7; }
  R.wasGround = a.onGround; R.vy = a.vel.y;
  // glissade : pose écrite à la main par-dessus l'accroupi (voir plus bas) ; entrée vive, relevé plus lent
  const sliding = a.slideT > 0 && a.onGround;
  R.slide += ((sliding ? 1 : 0) - R.slide) * (1 - Math.exp(-dt * (sliding ? 16 : 7))); const sw = R.slide < 0.003 ? 0 : ease(R.slide);
  const calm = a.climb || a.rollT > 0 || a.slideT > 0 || a.landT > 0 || a.celebrate || a.swim;
  R.w += ((calm ? 0 : 1) - R.w) * (1 - Math.exp(-dt * 10)); const W = R.w;
  // ---- ressorts (ils vivent même hors champ, pour ne pas sauter quand on se rapproche)
  const air = a.onGround ? 1 : 0.35;
  const lx = spring(R.lean.x, clamp(aF * 0.0075, -0.15, 0.17) * air, 2.1, 0.55, dt);
  const lz = spring(R.lean.z, clamp(-aS * 0.008 - R.yawRate * sp * 0.0035, -0.2, 0.2) * air, 2.1, 0.55, dt);
  const pel = clamp(spring(R.pelvis, -Math.min(0.035, Math.hypot(aF, aS) * 0.0012) * (a.onGround ? 1 : 0), 3.1, 0.52, dt), -0.24, 0.07);
  const curl = clamp(spring(R.curl, 0, 2.6, 0.6, dt), -0.2, 0.4);
  const tw = spring(R.twist, clamp(R.yawRate * 0.05, -0.3, 0.3), 3, 0.7, dt);
  const hy = spring(R.head.yaw, clamp(R.yawRate * 0.085, -0.5, 0.5), 4.2, 0.75, dt);
  const nod = clamp(spring(R.head.nod, curl * 1.2, 2.2, 0.5, dt), -0.3, 0.45);
  const rp = spring(R.rec.p, 0, 5.2, 0.42, dt), ry = spring(R.rec.y, 0, 4.6, 0.5, dt), rz = spring(R.rec.z, 0, 6, 0.6, dt);
  const hx = spring(R.hit.x, 0, 3.4, 0.45, dt), hz = spring(R.hit.z, 0, 3.4, 0.45, dt);
  const hhx = spring(R.hit.hx, hx * 1.5, 2.6, 0.5, dt), hhz = spring(R.hit.hz, hz * 1.5, 2.6, 0.5, dt);
  if (!near || !R.flat) { attachFeet(a); return false; }

  // ---- 1. cibles des pieds d'après l'animation (avant de bouger le bassin)
  settle(R);
  // roulade : le clip est une roulade plongée, le corps en boule passait à hauteur d'homme ; on le ramène au ras du sol
  R.roll += ((a.rollT > 0 ? 1 : 0) - R.roll) * (1 - Math.exp(-dt * 14));
  if (R.roll > 0.01 && body.position.y > 0.42) { body.position.y += (0.42 - body.position.y) * R.roll; store(R); }
  for (const g of R.legs) { ankle(body, g, g.T); if (!g.free) g.fq.copy(_q2).multiply(g.F.quaternion); } // (_q2 = orientation du tibia) orientation du pied à garder
  // ---- 2. bassin et colonne
  const br = Math.sin(R.breath) * (0.006 + 0.022 * R.effort);
  const hitX = clamp(hz, -0.3, 0.3), hitZ = clamp(-hx, -0.3, 0.3); // encaisser : le buste part à l'opposé du tir
  if (sw) { // bassin au ras du sol, un peu en retrait ; le dos part en arrière et la colonne se recourbe pour garder l'arme et le regard devant
    body.position.y += (0.19 - body.position.y) * sw; body.position.z -= 0.12 * sw; body.position.x -= 0.03 * sw;
    setD(iBody, -1.05 * sw, -0.22 * sw, 0.1 * sw); setD(iAbdomen, 0.17 * sw, 0.1 * sw, -0.05 * sw); setD(iTorso, 0.17 * sw, 0.12 * sw, -0.05 * sw); setD(iChest, 0.11 * sw, 0, 0);
    spinePass(R);
  }
  body.position.y += pel * W; body.position.z += (lx * 0.16 - clamp(rz, -1, 1) * 0.012) * W; body.position.x -= lz * 0.16 * W;
  setD(iBody, (lx * 0.55 + curl * 0.25) * W, -tw * 0.55 * W, lz * 0.55 * W);
  setD(iAbdomen, (lx * 0.25 + curl * 0.3 + hitX * 0.4 - br) * W, tw * 0.3 * W, (lz * 0.25 + hitZ * 0.4) * W);
  setD(iTorso, (lx * 0.2 + curl * 0.3 + hitX * 0.6) * W, tw * 0.45 * W, (lz * 0.2 + hitZ * 0.6) * W);
  setD(iChest, br * 1.6 * W, tw * 0.35 * W, 0);
  spinePass(R);
  body.quaternion.multiplyQuaternions(R.rootBone.quaternion, R.spine[0].quaternion);
  // ---- 3. pieds : adaptation au sol, pieds plantés à l'arrêt, puis IK
  const k = ch.model.scale.x, rb = _zero, ground = a.onGround && (!calm || sliding) && !a.inCar;
  const still = ground && sp < 0.3 && a.anim === 'LOCO' && Math.abs(R.yawRate) < 6;
  R.plantW = clamp(R.plantW + dt * (still ? 6 : -9), 0, 1); if (R.plantW <= 0) for (const g of R.legs) g.lock = g.step = null;
  let low = 0, stepping = R.legs[0].step || R.legs[1].step, worst = null, worstE = 0;
  for (let i = 0; i < 2; i++) {
    const g = R.legs[i], T = g.T;
    // glissade : jambe gauche tendue devant, talon au sol ; jambe droite repliée dessous, genou ouvert
    if (sw) { if (i === 0) { T.x += (0.13 - T.x) * sw; T.y += (g.restY + 0.05 - T.y) * sw; T.z += (0.8 - T.z) * sw; } else { T.x += (-0.2 - T.x) * sw; T.y += (g.restY + 0.02 - T.y) * sw; T.z += (0.3 - T.z) * sw; } }
    // position monde du pied animé (xz) et hauteur du sol dessous
    const lx0 = (T.x + rb.x) * k, lz0 = (T.z + rb.z) * k; let wx = a.pos.x + lx0 * cs + lz0 * sn, wz = a.pos.z - lx0 * sn + lz0 * cs, fyaw = 0;
    if (R.plantW > 0) {
      if (!g.lock || Math.abs(wx - g.lock.x) + Math.abs(wz - g.lock.z) > 1.2) { g.lock = { x: wx, z: wz, yaw }; g.step = null; g.lift = 0; } // (téléportation, réapparition : on repart de la pose animée)
      if (g.step) { const s = g.step; s.t += dt / s.dur; const e = ease(Math.min(1, s.t)); g.lock.x = s.x + (wx - s.x) * e; g.lock.z = s.z + (wz - s.z) * e; g.lock.yaw = s.yaw + angDiff(yaw, s.yaw) * e; g.lift = Math.sin(Math.min(1, s.t) * Math.PI) * 0.075; if (s.t >= 1) { g.step = null; g.lift = 0; } }
      else { const err = (Math.abs(angDiff(yaw, g.lock.yaw)) / 0.6 + Math.hypot(wx - g.lock.x, wz - g.lock.z) / 0.2) * (i === R.stepSide ? 0.8 : 1); if (err > worstE) { worstE = err; worst = g; } } // on alterne : le pied qui vient de bouger passe après l'autre
      const pw = R.plantW; wx += (g.lock.x - wx) * pw; wz += (g.lock.z - wz) * pw; fyaw = angDiff(g.lock.yaw, yaw) * pw;
      const dx = wx - a.pos.x, dz = wz - a.pos.z; T.x = (dx * cs - dz * sn) / k - rb.x; T.z = (dx * sn + dz * cs) / k - rb.z; T.y += (g.lift || 0) * pw;
    }
    let off = 0; if (ground) off = clamp(game.world.groundY(wx, wz, a.pos.y + 0.3) - a.pos.y, -0.35, 0.35) / k;
    g.off += (off - g.off) * (1 - Math.exp(-dt * 16)); if (Math.abs(g.off) < 1e-4) g.off = 0;
    T.y += g.off; low = Math.min(low, g.off);
    if (ground) T.y = Math.max(T.y, g.restY + g.off - 0.01); // jamais sous le sol, même bassin écrasé
    g.fyaw = fyaw;
  }
  if (R.plantW > 0.5 && !stepping && worst && worstE > 1) { worst.step = { t: 0, dur: 0.22, x: worst.lock.x, z: worst.lock.z, yaw: worst.lock.yaw }; R.stepSide = R.legs.indexOf(worst); }
  // le bassin descend vers le pied le plus bas (marches, bord de trottoir)
  R.drop += (low * 0.85 - R.drop) * (1 - Math.exp(-dt * 12)); body.position.y += R.drop;
  for (const g of R.legs) {
    solveLeg(body, g, g.T); // (_q2 = nouvelle orientation du tibia)
    if (g.free) { putFoot(R, g, g.T); if (g.fyaw) { _q3.setFromAxisAngle(Y, g.fyaw); g.F.quaternion.premultiply(_t.copy(_ri).multiply(_q3).multiply(R.rootBone.quaternion)); } }
    else { if (g.fyaw) g.fq.premultiply(_q3.setFromAxisAngle(Y, g.fyaw)); g.F.quaternion.copy(_q2.invert().multiply(g.fq)); } // le pied garde son orientation d'animation (à plat) quand la jambe change
  }
  store(R);
  // ---- valeurs gardées pour la couche d'après visée
  R.post = { sw, hy: hy * W, nod: nod * W, lx: lx * W, lz: lz * W, rp, ry, hhx: clamp(hhz, -0.4, 0.4), hhz: clamp(-hhx, -0.4, 0.4), br: br * W };
  return true;
}

// après la visée du buste : recul (le canon monte et revient), tête qui mène le virage, reste à niveau et encaisse avec retard
// filet de sécurité après les couches : un os invalide reprend sa pose de repos du modèle (au lieu de contaminer l'arme, la caméra, les effets)
export function sane(a) {
  const R = rig(a); if (!R.ok) return true; let ok = true; const src = chars[a.skin]?.scene;
  for (const s of R.saved) { const b = s.b, q = b.quaternion, p = b.position; if (Number.isFinite(q.x + q.y + q.z + q.w + p.x + p.y + p.z)) continue; ok = false;
    const r = src?.getObjectByName(b.name); if (r) { q.copy(r.quaternion); p.copy(r.position); } else { q.set(0, 0, 0, 1); } s.q.copy(q); s.p.copy(p); }
  if (!ok) healRig(R); return ok;
}
export function post(a) {
  const R = rig(a), P = R.post; if (!R.ok || !P) return;
  setD(iChest, -P.rp * 0.055, P.ry * 0.035, 0);
  setD(iNeck, P.sw * 0.2 - P.lx * 0.3 + P.nod * 0.4 + P.hhx * 0.4 - P.br * 0.8, P.hy * 0.4, -P.lz * 0.35 + P.hhz * 0.4);
  setD(iHead, P.sw * 0.15 - P.lx * 0.3 + P.nod * 0.6 + P.rp * 0.03 + P.hhx * 0.6, P.hy * 0.6, -P.lz * 0.35 + P.hhz * 0.6);
  spinePass(R);
}
