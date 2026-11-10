// Couches d'animation écrites à la main, posées par-dessus les clips (après le mixer) :
//  - jambes : les pieds restent attachés aux chevilles (le rig a des pieds libres), IK deux os, adaptation au sol (trottoirs, marches),
//    pieds plantés à l'arrêt avec petits pas quand on pivote sur place ;
//  - poids : le corps penche dans l'accélération et dans les virages, le bassin s'écrase à la réception et se détend à l'impulsion ;
//  - chevauchement (overlap) : le bassin traîne, le buste puis la tête mènent le virage, la tête arrive après le buste ;
//  - arme : la main gauche est posée sur le garde-main (IK du bras, doigts refermés), l'arme vit (pas, souffle, inertie dans les virages, levée au changement d'arme) ;
//  - souffle selon l'effort, recul et impacts en ressorts amortis (attaque vive, retour avec léger dépassement).
// Tout est calculé dans le repère de l'os Root (x = gauche du perso, y = haut, z = devant), sans matrices monde.
import * as THREE from 'three';
import { chars, gunInstance } from './assets.js';
import { WEAPONS } from './data.js';

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
  R.lean = { x: S(), z: S() }; R.pelvis = S(); R.twist = S(); R.head = { yaw: S(), pitch: S(), nod: S() }; R.curl = S();
  R.rec = { p: S(), y: S(), z: S() }; R.hit = { x: S(), z: S(), hx: S(), hz: S() };
  R.pv = V3(); R.acc = V3(); R.yaw0 = a.yaw; R.yawRate = 0; R.effort = 0; R.breath = Math.random() * 6; R.plantW = 0; R.slide = 0; R.roll = 0; R.stepSide = 0; R.wasGround = true; R.vy = 0; R.w = 1; R.drop = 0;
  R.arm = makeArm(a, src, mod); R.saved.length = 0;
  for (const b of mod) R.saved.push({ b, q: b.quaternion.clone(), p: b.position.clone(), pos: b === pel || b === B.Hips || /^Foot/.test(b.name) });
  R.swapT = 0; R.ok = true; return R;
}

// ---- main gauche sur l'arme (troisième personne)
// repère de la main gauche relevé sur la pose de repos (f = sens des doigts, n = côté paume), doigts refermés calculés une fois
function makeArm(a, src, mod) {
  const B = a.ch.bones, n = ['ShoulderL', 'UpperArmL', 'LowerArmL', 'WristL', 'ShoulderR', 'UpperArmR', 'LowerArmR', 'WristR', 'Chest'];
  if (!src || n.some((k) => !B[k]) || B.ShoulderL.parent !== B.Chest || B.ShoulderR.parent !== B.Chest) return null;
  const s = (k) => src.getObjectByName(k), wp = (o) => o.getWorldPosition(V3()); src.updateMatrixWorld(true);
  const us = s('Chest').getWorldScale(V3()).x || 1, hips = s('Hips'); if (!hips) return null;
  // repère d'une main au repos (f = sens des doigts, n = côté paume) et doigts refermés (calculés une fois)
  const hand = (S, CURL, idx) => { const W = s('Wrist' + S), m1 = s('Middle1' + S), i1 = s('Index1' + S), p1 = s('Pinky1' + S); if (!W || !m1 || !i1 || !p1) return null;
    const p = wp(W), f = wp(m1).sub(p), len = f.length() / us; f.normalize();
    const nn = V3().crossVectors(f, wp(p1).sub(wp(i1))).normalize(), inw = wp(hips).sub(p).setY(0).normalize().add(V3().set(0, -1, 0)); if (nn.dot(inw) < 0) nn.negate();
    const iq = W.getWorldQuaternion(Q()).invert(); f.applyQuaternion(iq); nn.applyQuaternion(iq).addScaledVector(f, -nn.dot(f)).normalize();
    const hb = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, nn, V3().crossVectors(f, nn))).invert(), ax = V3().crossVectors(f, nn).normalize(), fing = [];
    for (const F of ['Index', 'Middle', 'Ring', 'Pinky']) { const axl = ax.clone(); for (let i = 1; i <= 3; i++) { const b = B[F + i + S], b0 = s(F + i + S); if (!b || !b0) break;
      fing.push({ b, q: Q().setFromAxisAngle(axl, CURL[i - 1] * (F === 'Index' ? idx : 1)).multiply(b0.quaternion) }); axl.applyQuaternion(b0.quaternion.clone().invert()); mod.add(b); } }
    return { hb, len, fing }; };
  const hl = hand('L', [0.85, 1.25, 0.8], 1), hr = hand('R', [1.0, 1.45, 1.0], 0.4); if (!hl) return null; // main droite : fermée sur la poignée, index allongé vers la détente
  const { hb, len, fing } = hl; if (hr) fing.push(...hr.fing);
  a.ch.root.updateMatrixWorld(true); const u = B.Chest.getWorldScale(V3()).x || 1; // mètres par unité du repère du buste
  for (const k of n.slice(1, 4)) mod.add(B[k]); for (const k of n.slice(5, 8)) mod.add(B[k]);
  return { sL: B.ShoulderL, U: B.UpperArmL, L: B.LowerArmL, W: B.WristL, R: [B.ShoulderR, B.UpperArmR, B.LowerArmR, B.WristR], l1: B.LowerArmL.position.length(), l2: B.WristL.position.length(), hb, len, u, fing, w: 0, qU: Q(), qL: Q(), qW: Q(), relDur: 0,
    arm: { U: B.UpperArmR, L: B.LowerArmR, l1: B.LowerArmR.position.length(), l2: B.WristR.position.length() } };
}
// point d'appui de la main gauche par arme, en mètres dans le repère de l'arme (x vers la bouche, y vers le haut, origine à la poignée) :
// le dessous du garde-main, premier appui haut en partant de la poignée (ni le chargeur ni le bipied)
const SUP = {};
function support(id) {
  if (SUP[id]) return SUP[id]; const W = WEAPONS[id]; if (!W) return (SUP[id] = { x: 0.25, y: 0.02, pistol: false });
  if (W.hand === 'pistol') return (SUP[id] = { x: 0.035, y: -0.035, pistol: true, mag: { x: 0, y: -0.09 } });
  if (W.support) return (SUP[id] = { x: W.support[0], y: W.support[1], fore: true, mag: { x: 0.1, y: -0.03 } });
  // candidats du meilleur au moins bon : le garde-main (dessous large le plus haut) au plus près de la prise naturelle, puis le reste du dessous de l'arme ;
  // chaque perso prend le premier que son bras atteint (les longs fusils de précision ont le garde-main trop loin pour certains gabarits)
  let mag = null, up = 0; const c = [], def = { x: Math.min(0.24, (W.len || 0.6) * 0.3), y: 0.02 };
  try { const g = gunInstance(id); g.updateMatrixWorld(true); const mx = g.userData.muzzle.getWorldPosition(V3()).x, xs = clamp(mx * 0.42, 0.08, 0.23), rc = new THREE.Raycaster(); rc.far = 1.5;
    const near = (a, b) => Math.abs(a.x - xs) - Math.abs(b.x - xs);
    // hauteur de la main droite : le milieu de ce que l'arme offre à saisir à la poignée (une poignée pistolet se prend à mi-hauteur, une crosse droite là où elle est)
    rc.set(_v.set(0, -0.7, 0), Y); const hb = rc.intersectObject(g, true)[0]; rc.set(_v.set(0, 0.7, 0), _w.set(0, -1, 0)); const ht = rc.intersectObject(g, true)[0];
    if (hb && ht) up = clamp((hb.point.y + ht.point.y) / 2, 0, 0.065);
    // dessous de l'arme sondé tous les 3 cm, à 1,8 cm de l'axe (le garde-main est large, le canon et les organes de visée sont fins) puis dans l'axe
    for (const z of [0.018, 0]) { const hits = [];
      for (let x = 0.08; x < Math.min(0.46, mx - 0.03); x += 0.03) { rc.set(_v.set(x, -0.7, z), Y); const h = rc.intersectObject(g, true)[0]; if (h) hits.push({ x, y: h.point.y }); }
      if (!hits.length) continue; const top = Math.max(...hits.map((h) => h.y));
      if (z === 0) { const lo = hits.filter((h) => h.x < 0.32).sort((a, b) => a.y - b.y)[0]; if (lo) mag = { x: lo.x, y: lo.y }; } // le chargeur : ce qui descend le plus bas devant la poignée
      c.push(...hits.filter((h) => h.y > top - 0.03).sort(near), ...hits.filter((h) => h.y <= top - 0.03 && h.y > top - 0.13).sort(near)); }
  } catch (e) { /* modèle manquant : valeur par défaut */ }
  c.push(def); return (SUP[id] = { c, up, mag: mag || { x: 0.12, y: 0 } });
}
const _rv = [V3(), V3(), V3(), V3()];
const _gp = V3(), _gq = Q(), _F = V3(), _N = V3(), _K = V3(), _T = V3(), _m4 = new THREE.Matrix4(), _sh = { position: null, quaternion: null };
function leftHand(game, a, R, dt) {
  const A = R.arm; if (!A) return; const g = a.ch.gun, id = game.weapon(a)?.id;
  if (a !== game.player && a.pos.distanceToSquared(game.camera.position) > 625) { A.w = 0; return; } // au-delà de 25 m la pose du clip suffit
  const on = g && id && a.alive && !a.climb && !(a.rollT > 0 && !a.ch.actions.MX_Run) && !a.celebrate && !a.channel && !a.swim && !a.inCar && !(a.landT > 0) && !a.thr;
  A.w += ((on ? 1 : 0) - A.w) * (1 - Math.exp(-dt * (on ? 9 : 16))); if (A.w < 0.02 || !g) return;
  // ---- main droite : l'arme recule au tir ; au rechargement elle revient contre soi, bascule (puits de chargeur vers la main gauche) et sursaute quand le chargeur s'enclenche
  if (!(a.reloadT > 0)) A.relDur = 0;
  const rl = A.relDur ? clamp(1 - a.reloadT / A.relDur, 0, 1) : -1, tilt = rl < 0 ? 0 : ease(clamp(rl / 0.12, 0, 1)) * ease(clamp((1 - rl) / 0.16, 0, 1)) * A.w;
  const back = clamp(R.rec.z.x * 1.3, -0.02, 0.08) * A.w, bump = rl > 0.74 && rl < 0.84 ? Math.sin((rl - 0.74) / 0.1 * Math.PI) : 0;
  // la main droite remonte sur la poignée (l'arme, elle, ne bouge pas) : le clip la plaçait au bout de la poignée, le poing sous l'arme
  const S0 = support(id), up = (S0.up || 0) * A.w;
  if (g.userData.gy0 === undefined) g.userData.gy0 = g.position.clone();
  g.position.copy(g.userData.gy0).sub(_v.set(0, up / A.u, 0).applyQuaternion(g.quaternion));
  if (tilt > 0.001 || Math.abs(back) > 0.002 || up > 0.001) { const sR = A.R[0], wR = A.R[3], u = A.u;
    _gp.set(0, 0, 0); _gq.identity(); for (let i = 0; i < 3; i++) { _gp.add(_v.copy(A.R[i].position).applyQuaternion(_gq)); _gq.multiply(A.R[i].quaternion); }
    _T.copy(wR.position).applyQuaternion(_gq).add(_gp); _gq.multiply(wR.quaternion); _q3.copy(_gq).multiply(g.quaternion); // (_gq = main droite, _q3 = arme)
    _T.addScaledVector(_N.set(0, 1, 0).applyQuaternion(_q3), up / u);
    const szr = _v.set(0, 0, 1).applyQuaternion(_q3).dot(_w.copy(A.sL.position).sub(sR.position)) > 0 ? -1 : 1;
    _F.set(1, 0, 0).applyQuaternion(_q3); _N.set(0, 1, 0).applyQuaternion(_q3);
    _T.addScaledVector(_F, -(back + 0.06 * tilt) / u).addScaledVector(_N, (-0.08 * tilt + 0.012 * bump) / u);
    if (tilt > 0.001) { _d.setFromEuler(_e.set(0.5 * szr * tilt, 0, (0.14 + 0.05 * bump) * tilt, 'XYZ')); _q3.multiply(_d).multiply(_d.copy(g.quaternion).invert()); _gq.copy(_q3); } // main = arme basculée × prise⁻¹
    _sh.position = sR.position; _sh.quaternion = sR.quaternion; _K.copy(_T); _q3.copy(_gq);
    solveLeg(_sh, A.arm, _K); wR.quaternion.copy(_q2.invert().multiply(_q3)); }
  // l'arme dans le repère du buste : épaule droite, bras, avant-bras, main, puis la prise
  _gp.set(0, 0, 0); _gq.identity(); for (const b of A.R) { _gp.add(_v.copy(b.position).applyQuaternion(_gq)); _gq.multiply(b.quaternion); }
  _gp.add(_v.copy(g.position).applyQuaternion(_gq)); _gq.multiply(g.quaternion);
  const u = A.u; let S = S0; A.S = S0;
  // côté gauche de l'arme : celui de l'épaule gauche
  const sz = _v.set(0, 0, 1).applyQuaternion(_gq).dot(_w.copy(A.sL.position).sub(A.R[0].position)) > 0 ? -1 : 1; // z local × sz = droite de l'arme
  const dir = (o, f, up, r) => o.set(f, up, r * sz).normalize().applyQuaternion(_gq);
  let bk = 0.62, lift = 0.014;
  _hip.copy(A.U.position).applyQuaternion(A.sL.quaternion).add(A.sL.position); const reach = A.l1 + A.l2; // épaule gauche
  if (S0.c) { // meilleur appui que le bras atteint (garde-main d'abord) ; il ne change que franchement, pour ne pas hésiter entre deux prises
    if (A.pid !== id) { A.pid = id; A.pick = null; } dir(_F, 0.7, -0.5, 0.5);
    const far = (k) => _hip.distanceTo(_T.set(k.x, k.y, 0).multiplyScalar(1 / u).applyQuaternion(_gq).add(_gp).addScaledVector(_F, -A.len * bk)) / reach;
    let best = null; for (const k of S0.c) { if (far(k) < (k === A.pick ? 0.985 : 0.9)) { best = k; break; } }
    if (!A.pick) { A.pick = best || S0.c[S0.c.length - 1]; A.px = A.pick.x; A.py = A.pick.y; } else if (best && best !== A.pick) A.pick = best;
    const e = 1 - Math.exp(-dt * 9); A.px += (A.pick.x - A.px) * e; A.py += (A.pick.y - A.py) * e; S = A.sm || (A.sm = {}); S.x = A.px; S.y = A.py; }
  if (S.pistol) { dir(_F, 0.9, -0.35, 0.15); dir(_N, -0.15, 0, 1); _T.set(S.x, S.y, -0.032 * sz); bk = 1; lift = 0; } // plaquée à gauche de la poignée, doigts par-dessus ceux de la main droite
  else if (S.fore) { dir(_F, 0.95, -0.25, 0.2); dir(_N, -0.1, 0, 1); _T.set(S.x + 0.045, S.y - 0.04, -0.012 * sz); bk = 1; lift = 0; } // poignée avant : main refermée autour
  else { dir(_F, 0.7, -0.5, 0.5); dir(_N, -0.1, 0.68, 0.72); _T.set(S.x, S.y + 0.004, -0.012 * sz); } // paume sous le garde-main, doigts qui remontent de l'autre côté
  _N.addScaledVector(_F, -_N.dot(_F)).normalize(); _K.crossVectors(_F, _N);
  _T.multiplyScalar(1 / u).applyQuaternion(_gq).add(_gp).addScaledVector(_F, -A.len * bk).addScaledVector(_N, -lift / u);
  // hors de portée (arme tenue loin, à bout de bras) : la main lâche plutôt que d'étirer le bras
  _sh.position = A.sL.position; _sh.quaternion = A.sL.quaternion;
  if (rl >= 0) { // rechargement : la main quitte le garde-main, saisit le chargeur, le tire, va à la ceinture en chercher un neuf, l'enclenche et revient
    const M = S0.mag || S, at = (o, x, y) => o.set(x, y, -0.012 * sz).multiplyScalar(1 / u).applyQuaternion(_gq).add(_gp).addScaledVector(_F, -A.len * 0.55);
    const Pm = at(_rv[0], M.x, M.y - 0.02), Pd = at(_rv[1], M.x - 0.02, M.y - 0.16);
    const Pb = _rv[2].copy(A.sL.position).addScaledVector(_v.set(0, -1, 0), 0.42 / u).addScaledVector(_w.set(1, 0, 0).applyQuaternion(_gq).setY(0).normalize(), 0.1 / u);
    const seg = (a0, b0, t0, t1) => _T.lerpVectors(a0, b0, ease(clamp((rl - t0) / (t1 - t0), 0, 1)));
    if (rl < 0.14) seg(_rv[3].copy(_T), Pm, 0, 0.14); else if (rl < 0.28) seg(Pm, Pd, 0.14, 0.28); else if (rl < 0.48) seg(Pd, Pb, 0.28, 0.48); else if (rl < 0.66) seg(Pb, Pd, 0.5, 0.66);
    else if (rl < 0.86) seg(Pd, Pm, 0.66, 0.77); else seg(Pm, _rv[3].copy(_T), 0.86, 1); }
  // un peu trop loin (longue arme, petit gabarit) : la main se pose au plus près, bras tendu, plutôt que de lâcher ; vraiment hors de portée, elle lâche
  let d = _hip.distanceTo(_T); const w = A.w * clamp(1 - (d / reach - 1.1) / 0.12, 0, 1); if (w < 0.02) return;
  if (d > reach * 0.985) { _T.sub(_hip).multiplyScalar(reach * 0.985 / d).add(_hip); d = reach * 0.985; }
  A.qU.copy(A.U.quaternion); A.qL.copy(A.L.quaternion); A.qW.copy(A.W.quaternion);
  solveLeg(_sh, A, _T); // (IK deux os ; _q2 = orientation de l'avant-bras dans le repère du buste)
  _q3.setFromRotationMatrix(_m4.makeBasis(_F, _N, _K)).multiply(A.hb); A.W.quaternion.copy(_q2.invert().multiply(_q3));
  if (w < 0.999) { A.U.quaternion.copy(A.qU.slerp(A.U.quaternion, w)); A.L.quaternion.copy(A.qL.slerp(A.L.quaternion, w)); A.W.quaternion.copy(A.qW.slerp(A.W.quaternion, w)); }
  if (w > 0.5) for (const f of A.fing) f.b.quaternion.copy(f.q);
}
// changement d'arme : la nouvelle arme arrive canon bas et remonte en joue
// rechargement écrit à la main (bras par IK) pour les persos proches ; renvoie false si le clip générique doit jouer à la place (perso lointain, squelette sans bras connus)
export function reload(game, a, dur) { const R = rig(a), A = R.arm; if (!R.ok || !A || !a.ch.gun || (a !== game.player && a.pos.distanceToSquared(game.camera.position) > 625)) return false; A.relDur = dur; return true; }
export function swap(a) { const R = rig(a); if (R.ok) R.swapT = 0.34; }
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
export function dead(a, dt) { restore(a); a.ch.mixer.update(dt); capture(a); const R = rig(a);
  if (R.ok && R.flat) { settle(R); // les chutes en pleine course emportent le corps à près de 4 m : on retient la fin de la glissade (le corps ne traverse plus un mur voisin)
    const d = Math.hypot(PB.position.x, PB.position.z); if (d > 1.6) { const k = (1.6 + (d - 1.6) * 0.35) / d; PB.position.x *= k; PB.position.z *= k; store(R); }
    for (const g of R.legs) if (g.free) putFoot(R, g, ankle(PB, g, _v)); } if (R.ok) { R.plantW = 0; for (const g of R.legs) { g.lock = g.step = null; } } }

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
  const calm = a.climb || (a.rollT > 0 && !ch.actions.MX_Run) || a.slideT > 0 || a.landT > 0 || a.celebrate || a.swim;
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
  // esquive : une ruée basse sur les allures de course (plus de roulade tête en bas)
  R.roll += ((a.rollT > 0 ? 1 : 0) - R.roll) * (1 - Math.exp(-dt * 14));
  const rw = R.roll < 0.01 ? 0 : ease(R.roll); // esquive basse : le bassin descend encore un peu, le buste plonge vers l'avant (voir plus bas)
  for (const g of R.legs) { ankle(body, g, g.T); if (!g.free) g.fq.copy(_q2).multiply(g.F.quaternion); } // (_q2 = orientation du tibia) orientation du pied à garder
  // ---- 2. bassin et colonne
  const br = Math.sin(R.breath) * (0.006 + 0.022 * R.effort);
  const hitX = clamp(hz, -0.3, 0.3), hitZ = clamp(-hx, -0.3, 0.3); // encaisser : le buste part à l'opposé du tir
  if (sw) { // bassin au ras du sol, un peu en retrait ; le dos part en arrière et la colonne se recourbe pour garder l'arme et le regard devant
    body.position.y += (0.19 - body.position.y) * sw; body.position.z -= 0.12 * sw; body.position.x -= 0.03 * sw;
    setD(iBody, -1.05 * sw, -0.22 * sw, 0.1 * sw); setD(iAbdomen, 0.17 * sw, 0.1 * sw, -0.05 * sw); setD(iTorso, 0.17 * sw, 0.12 * sw, -0.05 * sw); setD(iChest, 0.11 * sw, 0, 0);
    spinePass(R);
  }
  if (rw) { body.position.y -= 0.17 * rw; body.position.z += 0.06 * rw; setD(iBody, 0.19 * rw, 0, 0); setD(iAbdomen, 0.08 * rw, 0, 0); setD(iNeck, -0.14 * rw, 0, 0); spinePass(R); } // (les pieds gardent leurs appuis de course : les genoux plient)
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
  leftHand(game, a, R, dt);
  // ---- l'arme vit : elle suit les pas, tremble à peine avec le souffle, traîne dans les virages, plonge à la réception et se lève au changement d'arme
  R.swapT = Math.max(0, R.swapT - dt); const sdip = R.swapT > 0 ? ease(R.swapT / 0.34) : 0, ph = (a.loco?.phase || 0) * 2 * Math.PI, mv = clamp(sp / 6, 0, 1) * (a.onGround ? 1 : 0), t = game.time + a.id * 1.7, tr = 1 + R.effort * 2.5;
  const gx = Math.sin(ph * 2) * 0.011 * mv + Math.sin(t * 1.7) * 0.0028 * tr + curl * 0.1 + sdip * 0.6, gy = Math.sin(ph) * 0.009 * mv + Math.sin(t * 1.13 + 1) * 0.0024 * tr - tw * 0.14 - sdip * 0.18;
  // ---- valeurs gardées pour la couche d'après visée
  R.post = { sw, hy: hy * W, nod: nod * W, lx: lx * W, lz: lz * W, rp, ry, gx: gx * W, gy: gy * W, gz: sdip * 0.25, hhx: clamp(hhz, -0.4, 0.4), hhz: clamp(-hhx, -0.4, 0.4), br: br * W };
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
  setD(iChest, -P.rp * 0.055 + P.gx, P.ry * 0.035 + P.gy, P.gz);
  setD(iNeck, P.sw * 0.2 - P.lx * 0.3 + P.nod * 0.4 + P.hhx * 0.4 - P.br * 0.8, P.hy * 0.4, -P.lz * 0.35 + P.hhz * 0.4);
  setD(iHead, P.sw * 0.15 - P.lx * 0.3 + P.nod * 0.6 + P.rp * 0.03 + P.hhx * 0.6, P.hy * 0.6, -P.lz * 0.35 + P.hhz * 0.6);
  spinePass(R);
}
