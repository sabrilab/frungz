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
const KICK = { pistol: 1.5, revolver: 2.6, smg: 0.9, rifle: 1.15, shotgun: 3.6, sniper: 4.2 };

// ressort amorti (intégration semi-implicite, stable aux grands pas) : f en Hz, z = amortissement (1 = critique, < 1 = dépasse puis revient)
function spring(s, target, f, z, dt) {
  const w = 2 * Math.PI * f, h = Math.min(dt, 0.05);
  s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h; s.x += s.v * h;
  return s.x;
}
const S = () => ({ x: 0, v: 0 });
const ease = (t) => t * t * (3 - 2 * t);
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

function makeRig(a) {
  const ch = a.ch, B = ch.bones;
  const R = { ok: false, spine: SPINE.map((n) => B[n] || null), legs: [], saved: [] };
  if (!B.Body || !B.UpperLegL || !B.LowerLegL || !B.FootL) return R;
  // longueur du tibia : mesurée sur le modèle source au repos (pied posé au bout du tibia)
  let shin = 0.511; const src = chars[a.skin]?.scene;
  if (src) { const f = src.getObjectByName('FootL'), l = src.getObjectByName('LowerLegL'); if (f && l) { src.updateMatrixWorld(true); const d = l.worldToLocal(f.getWorldPosition(V3())).length(); if (d > 0.2 && d < 1.2) shin = d; } }
  for (const s of ['L', 'R']) {
    const U = B['UpperLeg' + s], L = B['LowerLeg' + s], F = B['Foot' + s];
    R.legs.push({ U, L, F, free: F.parent !== L, l1: L.position.length(), l2: shin, T: V3(), fq: Q(), off: 0, lock: null, step: null, restY: src?.getObjectByName('Foot' + s)?.position.y ?? F.position.y });
  }
  R.rootBone = B.Body.parent; R.flat = R.legs.every((g) => g.free && g.F.parent === R.rootBone) && R.legs.every((g) => g.U.parent === B.Body);
  // os que les couches modifient : remis dans leur pose d'animation avant chaque passage du mixer
  const mod = new Set(R.spine.filter(Boolean)); for (const g of R.legs) { mod.add(g.U); mod.add(g.L); mod.add(g.F); }
  for (const b of mod) R.saved.push({ b, q: b.quaternion.clone(), p: b.position.clone(), pos: b === B.Body || /^Foot/.test(b.name) });
  R.lean = { x: S(), z: S() }; R.pelvis = S(); R.twist = S(); R.head = { yaw: S(), pitch: S(), nod: S() }; R.curl = S();
  R.rec = { p: S(), y: S(), z: S() }; R.hit = { x: S(), z: S(), hx: S(), hz: S() };
  R.pv = V3(); R.acc = V3(); R.yaw0 = a.yaw; R.yawRate = 0; R.effort = 0; R.breath = Math.random() * 6; R.plantW = 0; R.stepSide = 0; R.wasGround = true; R.vy = 0; R.w = 1; R.drop = 0;
  R.ok = true; return R;
}
const rig = (a) => a.ch.rig || (a.ch.rig = makeRig(a));

// avant le mixer : on rend aux os leur pose d'animation (sinon les corrections s'accumulent d'une image à l'autre)
export function restore(a) { const R = rig(a); for (const s of R.saved) { s.b.quaternion.copy(s.q); if (s.pos) s.b.position.copy(s.p); } }
// après le mixer : la pose d'animation de l'image devient la référence
export function capture(a) { const R = rig(a); for (const s of R.saved) { s.q.copy(s.b.quaternion); if (s.pos) s.p.copy(s.b.position); } }

// cheville d'une jambe dans le repère Root, d'après la pose courante (cinématique directe)
function ankle(body, g, out, knee) {
  _hip.copy(g.U.position).applyQuaternion(body.quaternion).add(body.position);
  _q1.multiplyQuaternions(body.quaternion, g.U.quaternion);
  _knee.copy(g.L.position).applyQuaternion(_q1).add(_hip);
  _q2.multiplyQuaternions(_q1, g.L.quaternion);
  out.set(0, g.l2, 0).applyQuaternion(_q2).add(_knee); if (knee) knee.copy(_knee);
  return out;
}
// le pied (os libre, enfant de Root) est posé au bout du tibia : sans cela il reste au sol pendant que la jambe court
export function attachFeet(a) {
  const R = rig(a); if (!R.ok || !R.flat) return; const body = R.spine[0];
  for (const g of R.legs) g.F.position.copy(ankle(body, g, _v));
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
  const ch = a.ch, body = R.spine[0];
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
  for (const g of R.legs) { ankle(body, g, g.T); g.fq.copy(g.F.quaternion); }
  // ---- 2. bassin et colonne
  const br = Math.sin(R.breath) * (0.006 + 0.022 * R.effort);
  const hitX = clamp(hz, -0.3, 0.3), hitZ = clamp(-hx, -0.3, 0.3); // encaisser : le buste part à l'opposé du tir
  body.position.y += pel * W; body.position.z += (lx * 0.16 - clamp(rz, -1, 1) * 0.012) * W; body.position.x -= lz * 0.16 * W;
  setD(iBody, (lx * 0.55 + curl * 0.25) * W, -tw * 0.55 * W, lz * 0.55 * W);
  setD(iAbdomen, (lx * 0.25 + curl * 0.3 + hitX * 0.4 - br) * W, tw * 0.3 * W, (lz * 0.25 + hitZ * 0.4) * W);
  setD(iTorso, (lx * 0.2 + curl * 0.3 + hitX * 0.6) * W, tw * 0.45 * W, (lz * 0.2 + hitZ * 0.6) * W);
  setD(iChest, br * 1.6 * W, tw * 0.35 * W, 0);
  spinePass(R);
  // ---- 3. pieds : adaptation au sol, pieds plantés à l'arrêt, puis IK
  const k = ch.model.scale.x, rb = R.rootBone.position, ground = a.onGround && !calm && !a.inCar;
  const still = ground && sp < 0.3 && a.anim === 'LOCO' && Math.abs(R.yawRate) < 6;
  R.plantW = clamp(R.plantW + dt * (still ? 6 : -9), 0, 1); if (R.plantW <= 0) for (const g of R.legs) g.lock = g.step = null;
  let low = 0, stepping = R.legs[0].step || R.legs[1].step, worst = null, worstE = 0;
  for (let i = 0; i < 2; i++) {
    const g = R.legs[i], T = g.T;
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
    solveLeg(body, g, g.T); g.F.position.copy(g.T);
    if (g.fyaw) g.F.quaternion.premultiply(_q3.setFromAxisAngle(Y, g.fyaw));
  }
  // ---- valeurs gardées pour la couche d'après visée
  R.post = { hy: hy * W, nod: nod * W, lx: lx * W, lz: lz * W, rp, ry, hhx: clamp(hhz, -0.4, 0.4), hhz: clamp(-hhx, -0.4, 0.4), br: br * W };
  return true;
}

// après la visée du buste : recul (le canon monte et revient), tête qui mène le virage, reste à niveau et encaisse avec retard
export function post(a) {
  const R = rig(a), P = R.post; if (!R.ok || !P) return;
  setD(iChest, -P.rp * 0.055, P.ry * 0.035, 0);
  setD(iNeck, -P.lx * 0.3 + P.nod * 0.4 + P.hhx * 0.4 - P.br * 0.8, P.hy * 0.4, -P.lz * 0.35 + P.hhz * 0.4);
  setD(iHead, -P.lx * 0.3 + P.nod * 0.6 + P.rp * 0.03 + P.hhx * 0.6, P.hy * 0.6, -P.lz * 0.35 + P.hhz * 0.6);
  spinePass(R);
}
