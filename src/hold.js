// Tenue des armes longues sur le corps : crosse dans le creux de l'épaule, tête dégagée, main gauche sous le garde-main.
// Les clips d'animation placent la main droite au niveau du menton : avec une vraie arme, la crosse traversait la tête.
// On garde l'orientation de l'arme donnée par le clip et on la translate pour que le bout de la crosse vienne à l'épaule
// (cinématique inverse sur le bras droit). Sert au jeu (avant les couches d'animation), au salon et au studio de skins.
import * as THREE from 'three';
import { WEAPONS } from './data.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const wp = (o) => o.getWorldPosition(V()), wq = (o) => o.getWorldQuaternion(Q());
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// cinématique inverse à deux os : amène C sur la cible, coude du côté « pole », puis donne au poignet l'orientation voulue
function armIK(A, B, C, target, quat, pole) {
  const aim = (bone, from, to) => { const q = wq(bone).premultiply(Q().setFromUnitVectors(from, to)); bone.quaternion.copy(wq(bone.parent).invert().multiply(q)); bone.updateMatrixWorld(true); };
  const a = wp(A), b = wp(B), c = wp(C), l1 = a.distanceTo(b), l2 = b.distanceTo(c), d = target.clone().sub(a), L = clamp(d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3); d.normalize();
  const p = pole.clone().addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-8) p.set(0, -1, 0); p.normalize();
  const cosA = clamp((l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), -1, 1), e = a.clone().addScaledVector(d, l1 * cosA).addScaledVector(p, l1 * Math.sqrt(1 - cosA * cosA));
  aim(A, b.sub(a).normalize(), e.sub(a).normalize());
  const b2 = wp(B), c2 = wp(C); aim(B, c2.sub(b2).normalize(), a.clone().addScaledVector(d, L).sub(b2).normalize());
  C.quaternion.copy(wq(C.parent).invert().multiply(quat)); C.updateMatrixWorld(true);
}

// crosse à l'épaule. w : poids (0..1). Renvoie true si l'arme a été déplacée.
export function shoulderGun(ch, id, w = 1) {
  const g = ch.gun, W = WEAPONS[id], B = ch.bones; if (!g || !W || W.hand === 'pistol' || w < 0.02 || globalThis.__nohold) return false;
  const U = B.UpperArmR, Lo = B.LowerArmR, Wr = B.WristR, D = g.userData.dim; if (!U || !Lo || !Wr || !D) return false;
  ch.root.updateMatrixWorld(true);
  const rq = wq(ch.root), fwd = V(0, 0, 1).applyQuaternion(rq), left = V(1, 0, 0).applyQuaternion(rq), up = V(0, 1, 0);
  const butt = g.localToWorld(V(D.rear, D.bot + (D.top - D.bot) * 0.68, 0));
  // creux de l'épaule : un peu en dedans, en dessous et en avant de l'articulation
  const sh = wp(U), su = sh.distanceTo(wp(Lo)), target = sh.clone().addScaledVector(left, su * 0.16).addScaledVector(up, -su * 0.2).addScaledVector(fwd, su * 0.3);
  const delta = target.sub(butt); const dl = delta.length(); if (dl > 0.45) delta.multiplyScalar(0.45 / dl); delta.multiplyScalar(w);
  if (delta.lengthSq() < 1e-6) return false;
  const q = wq(Wr), pos = wp(Wr).add(delta);
  armIK(U, Lo, Wr, pos, q, V(0, -1, 0).addScaledVector(left, -0.7).addScaledVector(fwd, -0.2));
  return true;
}

// repère des mains mesuré une fois sur la pose de repos (sens des doigts, côté paume), et doigts refermés prêts à l'emploi
function prep(ch) {
  if (ch.hold !== undefined) return ch.hold; ch.hold = null;
  let mesh = null; ch.model.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; }); const B = ch.bones; if (!mesh || !B.WristL || !B.Middle1L || !B.Index1L || !B.Pinky1L) return null;
  const bones = mesh.skeleton.bones, saved = bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  mesh.skeleton.pose(); ch.root.updateMatrixWorld(true);
  const Wl = B.WristL, p = wp(Wl), f = wp(B.Middle1L).sub(p), len = f.length(); f.normalize();
  const k = wp(B.Pinky1L).sub(wp(B.Index1L)); const n = V().crossVectors(f, k).normalize(); const inw = wp(B.Hips).sub(p).setY(0).normalize().add(V(0, -1, 0)); if (n.dot(inw) < 0) n.negate();
  const q = wq(Wl), ax = V().crossVectors(f, n).normalize(), fing = [], CURL = [1.1, 1.45, 0.9];
  for (const F of ['Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) { const b = B[F + i + 'L']; if (!b) continue;
    const nq = wq(b).premultiply(Q().setFromAxisAngle(ax, CURL[i - 1])); b.quaternion.copy(wq(b.parent).invert().multiply(nq)); b.updateMatrixWorld(true); fing.push([b, b.quaternion.clone()]); }
  const iq = q.clone().invert(); ch.hold = { f: f.applyQuaternion(iq), n: n.applyQuaternion(iq), len, fing };
  bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); }); ch.root.updateMatrixWorld(true);
  return ch.hold;
}
// main gauche sous le garde-main, doigts refermés (salon et studio ; en jeu, les couches d'animation s'en chargent)
export function supportHand(ch, id) {
  const g = ch.gun, W = WEAPONS[id], B = ch.bones; if (!g || !W || W.hand === 'pistol') return false;
  const H = prep(ch), D = g.userData.dim; if (!H || !D || !B.UpperArmL || !B.LowerArmL) return false;
  ch.root.updateMatrixWorld(true);
  const gq = wq(g), dir = (x, y, z) => V(x, y, z).normalize().applyQuaternion(gq); // repère de l'arme : x vers la bouche, y vers le haut, z sur le côté
  const rq = wq(ch.root), left = V(1, 0, 0).applyQuaternion(rq), sz = V(0, 0, 1).applyQuaternion(gq).dot(left) > 0 ? 1 : -1; // côté gauche du tireur dans le repère de l'arme
  const F = dir(0.7, -0.5, -0.5 * sz), N0 = dir(0.1, 0.68, -0.72 * sz), N = N0.addScaledVector(F, -N0.dot(F)).normalize(), K = V().crossVectors(F, N);
  const hf = H.f.clone(), hn = H.n.clone().addScaledVector(hf, -H.n.dot(hf)).normalize(), hk = V().crossVectors(hf, hn);
  const q = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, N, K)).multiply(Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hf, hn, hk)).invert());
  const sx = W.support ? W.support[0] / D.unit : D.front * 0.5, sy = W.support ? W.support[1] / D.unit : D.bot + (D.top - D.bot) * 0.52;
  const at = g.localToWorld(V(sx, sy, 0)).addScaledVector(F, -H.len * 0.62).addScaledVector(N, -0.014);
  const fwd = V(0, 0, 1).applyQuaternion(rq);
  armIK(B.UpperArmL, B.LowerArmL, B.WristL, at, q, V(0, -1, 0).addScaledVector(left, 0.6).addScaledVector(fwd, -0.1));
  for (const [b, fq] of H.fing) b.quaternion.copy(fq);
  return true;
}
// passe complète pour un perso montré hors du jeu (salon, studio) : à appeler après mixer.update
export function holdPose(ch, id) { if (!id || !ch.gun || globalThis.__nohold) return; if (shoulderGun(ch, id)) ch.root.updateMatrixWorld(true); supportHand(ch, id); }
