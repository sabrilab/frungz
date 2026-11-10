// Skins Frungz : vêtements fabriqués en code sur les corps de base (Quaternius Universal Base Characters, CC0),
// au squelette du jeu (mêmes os, mêmes animations, même prise des armes). Utilisé par le jeu et par le studio (/studio).
//
// Principe : un skin est une petite fiche (corps, peau, coiffure, une pièce par emplacement avec ses couleurs).
// Les vêtements sont pris dans le maillage du corps lui-même : chaque sommet couvert est poussé vers l'extérieur
// (épaisseur du tissu) et prend la couleur du vêtement, il garde ses os et ses poids. Les accessoires rigides
// (visière de casquette, visière de casque, lunettes, sac) sont de petits volumes accrochés à un seul os.
// Résultat : un seul maillage « corps » à couleurs par sommet, le même coût qu'avant, et aucune pièce qui traverse le corps.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGLB } from './world.js';

import { PIECES, EXTRAS, piece } from './skins-data.js';
export * from './skins-data.js';

// ---------------------------------------------------------------- mannequins
const bases = {};
export async function loadSkinBases(onEach) {
  await Promise.all(['M', 'F'].map(async (b) => { if (!bases[b]) bases[b] = prepBase(await loadGLB(`assets/chars/Base_${b}.glb`)); onEach?.(); }));
  globalThis.__skinBases = bases; // inspection (tests)
  return bases;
}
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PART = (n) => n === 'Head' ? 'head' : n === 'Neck' ? 'neck' : /^(UpperArm|LowerArm)/.test(n) ? 'arm' : /^(Wrist|Index|Middle|Ring|Pinky|Thumb|index_|middle_|ring_|pinky_|thumb_)/.test(n) ? 'hand'
  : /^(UpperLeg|LowerLeg)/.test(n) ? 'leg' : /^(Foot|Toe|ball_)/.test(n) ? 'foot' : 'torso';
// subdivision des triangles habillables (buste, bras, jambes, cou, pieds) : 4 fois plus de sommets là où passent les vêtements,
// pour des coutures, bords, poches et surcouches nets. Les triangles voisins sont coupés en 2 ou 3 (pas de fente).
function subdivide(geo, keep) {
  const A = geo.attributes, n0 = A.position.count, I = Array.from(geo.index.array), si = A.skinIndex, sw = A.skinWeight;
  const mid = new Map(), add = []; let nv = n0; const ek = (a, b) => a < b ? a * 1e6 + b : b * 1e6 + a;
  for (let t = 0; t < I.length; t += 3) if (keep(I[t]) || keep(I[t + 1]) || keep(I[t + 2])) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const k = ek(a, b); if (!mid.has(k)) { mid.set(k, nv++); add.push([a, b]); } }
  const out = { position: new Float32Array(nv * 3), normal: new Float32Array(nv * 3), color: new Float32Array(nv * 3), skinIndex: new Uint16Array(nv * 4), skinWeight: new Float32Array(nv * 4) };
  if (A.uv) { out.uv = new Float32Array(nv * 2); for (let i = 0; i < n0; i++) { out.uv[i * 2] = A.uv.getX(i); out.uv[i * 2 + 1] = A.uv.getY(i); } add.forEach(([p, q], k) => { out.uv[(n0 + k) * 2] = (A.uv.getX(p) + A.uv.getX(q)) / 2; out.uv[(n0 + k) * 2 + 1] = (A.uv.getY(p) + A.uv.getY(q)) / 2; }); }
  for (const key of ['position', 'normal', 'color']) { const a = A[key]; for (let i = 0; i < n0; i++) for (let j = 0; j < 3; j++) out[key][i * 3 + j] = a.getComponent(i, j);
    add.forEach(([p, q], k) => { for (let j = 0; j < 3; j++) out[key][(n0 + k) * 3 + j] = (a.getComponent(p, j) + a.getComponent(q, j)) / 2; }); }
  for (let i = 0; i < n0; i++) for (let j = 0; j < 4; j++) { out.skinIndex[i * 4 + j] = si.getComponent(i, j); out.skinWeight[i * 4 + j] = sw.getComponent(i, j); }
  add.forEach(([p, q], k) => { const m = new Map(); for (const v of [p, q]) for (let j = 0; j < 4; j++) { const w = sw.getComponent(v, j); if (w > 0) m.set(si.getComponent(v, j), (m.get(si.getComponent(v, j)) || 0) + w / 2); }
    const top = [...m].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = top.reduce((s, x) => s + x[1], 0) || 1; top.forEach(([b, w], j) => { out.skinIndex[(n0 + k) * 4 + j] = b; out.skinWeight[(n0 + k) * 4 + j] = w / tot; }); });
  for (let i = n0; i < nv; i++) { const x = out.normal[i * 3], y = out.normal[i * 3 + 1], z = out.normal[i * 3 + 2], l = Math.hypot(x, y, z) || 1; out.normal[i * 3] = x / l; out.normal[i * 3 + 1] = y / l; out.normal[i * 3 + 2] = z / l; }
  const idx = [], M = (a, b) => mid.get(ek(a, b)) ?? -1;
  for (let t = 0; t < I.length; t += 3) { let a = I[t], b = I[t + 1], c = I[t + 2]; let ab = M(a, b), bc = M(b, c), ca = M(c, a); const k = (ab >= 0) + (bc >= 0) + (ca >= 0);
    if (k === 0) { idx.push(a, b, c); continue; }
    if (k === 3) { idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); continue; }
    // rotation : le premier côté coupé devient ab (k = 1), les deux côtés coupés deviennent ab et bc (k = 2)
    for (let r = 0; r < 3; r++) { const ok = k === 1 ? ab >= 0 : ab >= 0 && bc >= 0; if (ok) break; [a, b, c] = [b, c, a]; [ab, bc, ca] = [bc, ca, ab]; }
    if (k === 1) idx.push(a, ab, c, ab, b, c); else idx.push(ab, b, bc, a, ab, bc, a, bc, c); }
  const g = new THREE.BufferGeometry(); for (const [key, arr] of Object.entries(out)) g.setAttribute(key, new THREE.BufferAttribute(arr, key.startsWith('skin') ? 4 : key === 'uv' ? 2 : 3)); g.setIndex(idx); return g;
}
function prepBase(g) {
  const scene = g.scene; scene.updateMatrixWorld(true);
  const meshes = {}; scene.traverse((o) => { if (o.isSkinnedMesh) meshes[o.name] = o; });
  const skin = meshes.Skin, skel = skin.skeleton, W = skin.matrixWorld.clone(), Wi = W.clone().invert(), NW = new THREE.Matrix3().getNormalMatrix(W);
  { const g0 = skin.geometry, s0 = g0.attributes.skinIndex, w0 = g0.attributes.skinWeight;
    const clothable = (i) => { let b = 0, w = -1; for (let k = 0; k < 4; k++) if (w0.getComponent(i, k) > w) { w = w0.getComponent(i, k); b = s0.getComponent(i, k); } const p = PART(skel.bones[b].name); return p !== 'head' && p !== 'hand'; };
    skin.geometry = subdivide(g0, clothable); }
  const bw = (n) => { const b = skel.bones.find((x) => x.name === n); return b ? b.getWorldPosition(V()) : null; };
  // sommets du corps en pose de repos, dans le repère du monde (y vers le haut, devant vers +z, mètres)
  const geo = skin.geometry, n = geo.attributes.position.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), v = V();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(W); pos.set([v.x, v.y, v.z], i * 3); v.fromBufferAttribute(geo.attributes.normal, i).applyMatrix3(NW).normalize(); nor.set([v.x, v.y, v.z], i * 3); }
  // normales soudées (les coutures d'UV doublent des sommets : sans ça le tissu se fendrait le long des coutures)
  const key = (i) => `${Math.round(pos[i * 3] * 2e3)},${Math.round(pos[i * 3 + 1] * 2e3)},${Math.round(pos[i * 3 + 2] * 2e3)}`, acc = new Map();
  for (let i = 0; i < n; i++) { const k = key(i); const a = acc.get(k) || [0, 0, 0]; a[0] += nor[i * 3]; a[1] += nor[i * 3 + 1]; a[2] += nor[i * 3 + 2]; acc.set(k, a); }
  const wn = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = acc.get(key(i)); const l = Math.hypot(...a) || 1; wn.set([a[0] / l, a[1] / l, a[2] / l], i * 3); }
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, part = new Array(n), boneName = new Array(n);
  for (let i = 0; i < n; i++) { let b = 0, w = -1; for (let k = 0; k < 4; k++) { const ww = sw.getComponent(i, k); if (ww > w) { w = ww; b = si.getComponent(i, k); } } boneName[i] = skel.bones[b].name; part[i] = PART(boneName[i]); }
  // repères
  const L = { hips: bw('Hips'), abd: bw('Abdomen'), chest: bw('Chest'), neck: bw('Neck'), head: bw('Head'), sh: bw('UpperArmL'), elbow: bw('LowerArmL'), wrist: bw('WristL'), knee: bw('LowerLegL'), ankle: bw('FootL'), toe: bw('ToeL'), thigh: bw('UpperLegL') };
  const eb = new THREE.Box3(); if (meshes.Eye) { const ep = meshes.Eye.geometry.attributes.position, mw = meshes.Eye.matrixWorld; for (let i = 0; i < ep.count; i++) eb.expandByPoint(v.fromBufferAttribute(ep, i).applyMatrix4(mw)); }
  let top = -1e9, front = -1e9, hx = 0, hz0 = 1e9; for (let i = 0; i < n; i++) if (part[i] === 'head') { top = Math.max(top, pos[i * 3 + 1]); front = Math.max(front, pos[i * 3 + 2]); hx = Math.max(hx, Math.abs(pos[i * 3])); hz0 = Math.min(hz0, pos[i * 3 + 2]); }
  L.eyeY = (eb.min.y + eb.max.y) / 2; L.eyeX = Math.max(Math.abs(eb.min.x), Math.abs(eb.max.x)); L.eyeZ = eb.max.z; L.top = top; L.front = front; L.headR = hx; L.back = hz0;
  L.headC = V(0, (L.eyeY + top) / 2 - 0.02, (front + hz0) / 2); L.waist = L.hips.y + 0.075; L.H = top;
  // hauteur du corps seul (sert à l'échelle du perso : un casque ne doit pas le rapetisser)
  const box = new THREE.Box3(); for (let i = 0; i < n; i++) box.expandByPoint(v.fromArray(pos, i * 3)); L.box = box;
  // teinte moyenne de la peau (visage), pour changer de carnation
  const col = geo.attributes.color, avg = [0, 0, 0]; let cn = 0; for (let i = 0; i < n; i++) if (part[i] === 'head' && wn[i * 3 + 2] > 0.6) { avg[0] += col.getX(i); avg[1] += col.getY(i); avg[2] += col.getZ(i); cn++; }
  L.skinAvg = new THREE.Color(avg[0] / cn, avg[1] / cn, avg[2] / cn);
  // tissu : version lissée du corps (lissage de Taubin, sans rétrécir), pour que les vêtements passent par-dessus les muscles au lieu de les mouler.
  // Sommets soudés par position (coutures d'UV), voisins pris dans les triangles ; la tête, les mains et les pieds ne bougent pas.
  const wid = new Int32Array(n), gk = new Map(); let ng = 0; for (let i = 0; i < n; i++) { const kk = key(i); let g = gk.get(kk); if (g === undefined) { g = ng++; gk.set(kk, g); } wid[i] = g; }
  const gp = new Float32Array(ng * 3), gpart = new Array(ng); for (let i = 0; i < n; i++) { gp.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], wid[i] * 3); gpart[wid[i]] = part[i]; }
  const nb = Array.from({ length: ng }, () => new Set()), I = geo.index; for (let t = 0; t < I.count; t += 3) { const a = wid[I.getX(t)], b = wid[I.getX(t + 1)], d = wid[I.getX(t + 2)]; nb[a].add(b).add(d); nb[b].add(a).add(d); nb[d].add(a).add(b); }
  const nbl = nb.map((x) => [...x]), free = gpart.map((q) => q === 'torso' || q === 'arm' || q === 'leg' || q === 'neck');
  let S = gp.slice(); const T = new Float32Array(ng * 3);
  for (let it = 0; it < 40; it++) { const f = it % 2 ? -0.53 : 0.5; for (let g = 0; g < ng; g++) { if (!free[g] || !nbl[g].length) { T.set(S.subarray(g * 3, g * 3 + 3), g * 3); continue; } let x = 0, y = 0, z = 0; for (const h of nbl[g]) { x += S[h * 3]; y += S[h * 3 + 1]; z += S[h * 3 + 2]; } const m = nbl[g].length; T[g * 3] = S[g * 3] + f * (x / m - S[g * 3]); T[g * 3 + 1] = S[g * 3 + 1] + f * (y / m - S[g * 3 + 1]); T[g * 3 + 2] = S[g * 3 + 2] + f * (z / m - S[g * 3 + 2]); } S.set(T); }
  const smooth = new Float32Array(n * 3); for (let i = 0; i < n; i++) smooth.set(S.subarray(wid[i] * 3, wid[i] * 3 + 3), i * 3);
  // enveloppe : par tranches (bras le long de x, jambes et buste le long de y), chaque sommet est poussé jusqu'à l'enveloppe convexe de sa tranche ;
  // le tissu ponte les creux (entre les pectoraux, la colonne, les muscles des cuisses et des bras) comme un vrai vêtement
  const hull = smooth.slice(), crotch = L.hips.y - 0.07;
  const groups = { torso: [], armL: [], armR: [], legL: [], legR: [], footL: [], footR: [] };
  for (let i = 0; i < n; i++) { const q = part[i], x = pos[i * 3], y = pos[i * 3 + 1];
    if (q === 'arm' || (q === 'torso' && /^Shoulder/.test(boneName[i]) && Math.abs(x) > L.sh.x)) groups[x > 0 ? 'armL' : 'armR'].push(i);
    else if (q === 'foot' || (q === 'leg' && y < L.ankle.y + 0.03)) groups[x > 0 ? 'footL' : 'footR'].push(i); // chaussures : enveloppe du pied (les orteils disparaissent)
    else if (q === 'torso' || q === 'neck' || q === 'leg') groups[y > crotch + 0.04 ? 'torso' : x > 0 ? 'legL' : 'legR'].push(i); }
  const NB = 32, TW = Math.PI * 2;
  for (const [gname, list] of Object.entries(groups)) { if (!list.length) continue; const arm = gname.startsWith('arm'), foot = gname.startsWith('foot');
    // coordonnées : a = axe (|x| pour les bras, y sinon) ; plan (u, w) perpendiculaire
    const A = (i) => arm ? Math.abs(smooth[i * 3]) : foot ? smooth[i * 3 + 2] : smooth[i * 3 + 1], U = (i) => arm ? smooth[i * 3 + 1] : smooth[i * 3], Wc = (i) => foot ? smooth[i * 3 + 1] : smooth[i * 3 + 2];
    let a0 = 1e9, a1 = -1e9; for (const i of list) { a0 = Math.min(a0, A(i)); a1 = Math.max(a1, A(i)); }
    const step = foot ? 0.015 : 0.02, ns = Math.max(1, Math.ceil((a1 - a0) / step)), cu = new Float32Array(ns), cw = new Float32Array(ns), cn = new Float32Array(ns);
    const si = (i) => Math.min(ns - 1, Math.floor((A(i) - a0) / step));
    // centre de chaque tranche : milieu de sa boîte (stable), puis moyenné avec les tranches voisines
    const mnu = new Float32Array(ns).fill(1e9), mxu = new Float32Array(ns).fill(-1e9), mnw = new Float32Array(ns).fill(1e9), mxw = new Float32Array(ns).fill(-1e9);
    for (const i of list) { const k = si(i); mnu[k] = Math.min(mnu[k], U(i)); mxu[k] = Math.max(mxu[k], U(i)); mnw[k] = Math.min(mnw[k], Wc(i)); mxw[k] = Math.max(mxw[k], Wc(i)); cn[k]++; }
    for (let k = 0; k < ns; k++) if (cn[k]) { cu[k] = (mnu[k] + mxu[k]) / 2; cw[k] = (mnw[k] + mxw[k]) / 2; } else if (k) { cu[k] = cu[k - 1]; cw[k] = cw[k - 1]; }
    { const a = cu.slice(), b = cw.slice(); for (let k = 0; k < ns; k++) { let su = 0, sw2 = 0, m = 0; for (let d = -2; d <= 2; d++) { const kk = k + d; if (kk < 0 || kk >= ns || !cn[kk]) continue; su += a[kk]; sw2 += b[kk]; m++; } if (m) { cu[k] = su / m; cw[k] = sw2 / m; } } }
    const R = new Float32Array(ns * NB), ang = (i, k) => Math.atan2(Wc(i) - cw[k], U(i) - cu[k]), rad = (i, k) => Math.hypot(Wc(i) - cw[k], U(i) - cu[k]);
    for (const i of list) { const k = si(i), b = ((Math.floor((ang(i, k) + Math.PI) / TW * NB) % NB) + NB) % NB; R[k * NB + b] = Math.max(R[k * NB + b], rad(i, k)); }
    // fonction d'appui : enveloppe convexe approchée de chaque tranche, puis lissage entre tranches voisines
    const H = new Float32Array(ns * NB);
    for (let k = 0; k < ns; k++) for (let b = 0; b < NB; b++) { let m = 0; for (let j = 0; j < NB; j++) { const d = Math.abs(j - b) * TW / NB, dd = Math.min(d, TW - d); if (dd < Math.PI / 2) m = Math.max(m, R[k * NB + j] * Math.cos(dd)); } H[k * NB + b] = m; }
    // fenêtre glissante le long de l'axe : le tissu passe en ligne droite d'une bosse à l'autre (mollet, quadriceps, biceps, pectoraux)
    const WIN = gname === 'torso' || foot ? 3 : 5, DEC = gname === 'torso' ? 0.985 : 0.975;
    const H2 = H.slice(); for (let k = 0; k < ns; k++) for (let b = 0; b < NB; b++) { let m = H[k * NB + b]; for (let d = 1; d <= WIN; d++) for (const kk of [k - d, k + d]) if (kk >= 0 && kk < ns) m = Math.max(m, H[kk * NB + b] * Math.pow(DEC, d)); H2[k * NB + b] = m; }
    { const t = H2.slice(); for (let k = 0; k < ns; k++) for (let b = 0; b < NB; b++) { let a = 0, m = 0; for (let d = -1; d <= 1; d++) { const kk = k + d; if (kk < 0 || kk >= ns) continue; for (let e = -1; e <= 1; e++) { a += t[kk * NB + (b + e + NB) % NB]; m++; } } H2[k * NB + b] = Math.max(t[k * NB + b] * 0.985, a / m); } }
    // interpolation entre tranches (centre et rayon) et entre secteurs : pas de marches
    for (const i of list) { const ts = Math.max(0, Math.min(ns - 1, (A(i) - a0) / step - 0.5)), k0 = Math.floor(ts), k1 = Math.min(ns - 1, k0 + 1), fs = ts - k0;
      const ccu = cu[k0] * (1 - fs) + cu[k1] * fs, ccw = cw[k0] * (1 - fs) + cw[k1] * fs, du0 = U(i) - ccu, dw0 = Wc(i) - ccw, r = Math.hypot(du0, dw0); if (r < 1e-4) continue;
      const t = (Math.atan2(dw0, du0) + Math.PI) / TW * NB - 0.5, b0 = ((Math.floor(t) % NB) + NB) % NB, b1 = (b0 + 1) % NB, f = t - Math.floor(t);
      const Rk = (k) => H2[k * NB + b0] * (1 - f) + H2[k * NB + b1] * f, Rh = Rk(k0) * (1 - fs) + Rk(k1) * fs;
      if (Rh <= r) continue; const sc = Rh / r, du = du0 * sc, dw = dw0 * sc;
      if (arm) { hull[i * 3 + 1] = ccu + du; hull[i * 3 + 2] = ccw + dw; } else if (foot) { hull[i * 3] = ccu + du; hull[i * 3 + 1] = Math.max(0, ccw + dw); } else { hull[i * 3] = ccu + du; hull[i * 3 + 2] = ccw + dw; } } }
  // poids de peau lissés (pour le tissu) : un sommet poussé loin de l'os amplifie les écarts de poids entre voisins, d'où des pointes en mouvement
  let gw = Array.from({ length: ng }, () => new Map());
  for (let i = 0; i < n; i++) { const m = gw[wid[i]]; if (m.size) continue; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) m.set(si.getComponent(i, k), (m.get(si.getComponent(i, k)) || 0) + w); } }
  for (let it = 0; it < 8; it++) { const nx = gw.map((m, g) => { if (!free[g] || !nbl[g].length) return m; const r = new Map(); for (const [b, w] of m) r.set(b, w * 0.5); const k = 0.5 / nbl[g].length; for (const h of nbl[g]) for (const [b, w] of gw[h]) r.set(b, (r.get(b) || 0) + w * k); return r; }); gw = nx; }
  const sIdx = new Uint16Array(n * 4), sWt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const top = [...gw[wid[i]]].sort((a, b) => b[1] - a[1]).slice(0, 4), tot = top.reduce((t, x) => t + x[1], 0) || 1; top.forEach(([b, w], k) => { sIdx[i * 4 + k] = b; sWt[i * 4 + k] = w / tot; }); }
  return { scene, meshes, skel, W, Wi, pos, wn, part, boneName, L, n, wid, ng, nbl, smooth, hull, sIdx, sWt };
}

// ---------------------------------------------------------------- fabrication
const C = (h) => new THREE.Color(h);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x) => Math.exp(-x * x);
// bruit de valeur 3D lissé (plis du tissu), entre -1 et 1
const h3 = (x, y, z) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1; };
function noise3(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t; return l(l(l(h3(X, Y, Z), h3(X + 1, Y, Z), u), l(h3(X, Y + 1, Z), h3(X + 1, Y + 1, Z), u), v), l(l(h3(X, Y, Z + 1), h3(X + 1, Y, Z + 1), u), l(h3(X, Y + 1, Z + 1), h3(X + 1, Y + 1, Z + 1), u), v), w); }
const hash = (i) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// construit la scène d'un skin (clone du mannequin, un maillage « corps »)
// Les vêtements sont décrits par des couches (bas, chaussures, haut, gilet, gants, tête, visage, accessoires) : chaque couche dit,
// pour un point du corps, si elle le couvre, avec quelle épaisseur, quelle couleur et quel relief. Elle est appelée deux fois :
// sur les sommets (forme : épaisseur, ampleur, plis) et sur chaque pixel de la texture du corps (couleur et relief nets :
// coutures, surpiqûres, côtes, poches, lacets…). opts.tex : taille de la texture (1024 au studio, 512 en jeu).
export function buildSkinScene(def, opts = {}) {
  const B = bases[def.body === 'F' ? 'F' : 'M']; if (!B) throw new Error('mannequins non chargés');
  const { pos, wn, part, boneName, L, n } = B, skin = B.meshes.Skin, sg = skin.geometry, TEX = opts.tex || 1024;
  const c = new THREE.Color(), TC = new THREE.Color(), TC2 = new THREE.Color();
  // peau : la texture du pack (cuite par sommet), recolorée vers la carnation choisie
  const tone = C(def.peau || '#e2b597'), kt = [tone.r / L.skinAvg.r, tone.g / L.skinAvg.g, tone.b / L.skinAvg.b];
  const skinCol = new Float32Array(n * 3); for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) skinCol[i * 3 + j] = Math.min(1, sg.attributes.color.getComponent(i, j) * kt[j]);
  const clamp01 = (t) => Math.min(1, Math.max(0, t)), lerp = (a, b, t) => a + (b - a) * t;
  const angD = (a, b) => { const d = Math.abs(a - b) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); };
  const dash = (t, p) => ((t / p) % 1 + 1) % 1 < 0.6; // pointillé de surpiqûre
  const mix = (a, b, t, out = TC) => out.copy(a).lerp(b, t);
  const lift = (col, d) => col.clone().addScalar(d); // fil : un peu plus clair que le tissu
  const lum = (col) => (col.r + col.g + col.b) / 3;

  // ---- point : un sommet du corps, ou un point de la texture (position et normale interpolées)
  const isArmPB = (p, b, x) => p === 'arm' || (p === 'torso' && /^Shoulder/.test(b) && Math.abs(x) > L.sh.x);
  const setQ = (q, x, y, z, nx, ny, nz, p, b) => { q.x = x; q.y = y; q.z = z; q.nx = nx; q.ny = ny; q.nz = nz; q.p = p; q.b = b; q.arm = isArmPB(p, b, x); q.a = (Math.abs(x) - L.sh.x) / (L.wrist.x - L.sh.x); return q; };
  const isTorso = (q) => q.p === 'torso' && !q.arm;
  // jambe : 0 = côté extérieur, π/2 = devant, π = intérieur, -π/2 = derrière ; rayon approché (pour des largeurs en mètres)
  const legAng = (q) => { const y = q.y; let cx, cz; if (y > L.knee.y) { const t = clamp01((y - L.knee.y) / (L.thigh.y - L.knee.y)); cx = lerp(Math.abs(L.knee.x), Math.abs(L.thigh.x), t); cz = lerp(L.knee.z, L.thigh.z, t); } else { const t = clamp01((y - L.ankle.y) / (L.knee.y - L.ankle.y)); cx = lerp(Math.abs(L.ankle.x), Math.abs(L.knee.x), t); cz = lerp(L.ankle.z, L.knee.z, t); } return Math.atan2(q.z - cz - 0.01, Math.abs(q.x) - cx); };
  const legR = (q) => lerp(0.045, 0.085, clamp01((q.y - L.ankle.y) / (L.thigh.y - L.ankle.y)));
  // bras (en T au repos) : 0 = dessus, π/2 = devant, π = dessous
  const armAng = (q) => { const a = clamp01(q.a); return Math.atan2(q.z - lerp(L.sh.z, L.wrist.z, a), q.y - lerp(L.sh.y, L.wrist.y, a)); };
  const armR = (q) => lerp(0.055, 0.035, clamp01(q.a));
  // buste : 0 = devant, ±π/2 = flancs, π = dos
  const torsoAng = (q) => Math.atan2(q.x, q.z - L.hips.z);
  const knit = (q, k = 1) => 0.18 * k * noise3(q.x * 300, q.y * 300, q.z * 300); // maille fine (relief)

  // ---- couches
  const R = { o: 0, c: new THREE.Color(), s: 1, h: 0, t: '', abs: false };
  const set = (o, col, t, s = 1, h = 0, abs = false) => { R.o = o; R.c.copy(col); R.s = s; R.h = h; R.t = t; R.abs = abs; return R; };
  const layers = []; const layer = (lo, wr, fn) => layers.push({ lo, wr, fn });
  const extra = []; // accessoires rigides : { geo (monde), bone, color }
  const hairClip = { y: Infinity, all: false }; // coiffure : coupée au-dessus de cette hauteur (casquette, bonnet), ou cachée
  let browsHidden = false, beardHidden = false;

  const visage = piece(def, 'visage'), tete = piece(def, 'tete'), haut = piece(def, 'haut'), hautC = haut.c ? C(haut.c) : null;
  // ---- bas
  const bas = piece(def, 'bas'), pieds = piece(def, 'pieds'), rangersTuck = pieds.id === 'rangers' && /uniforme|cargo/.test(bas.id);
  const basLayer = () => {
    if (bas.id === 'aucun') return;
    const jean = /jean/.test(bas.id), jog = bas.id === 'jogging', work = bas.id === 'cargo' || bas.id === 'uniforme';
    const base = C(bas.c), belt = jean ? C('#2b1e15') : C('#0f1012'), thr = jean && lum(base) > 0.03 ? C('#b8833f') : lift(base, lum(base) < 0.03 ? 0.05 : 0.08), band = jog && bas.c2 ? C(bas.c2) : null;
    const th = jean ? 0.0045 : jog ? 0.009 : 0.007, hem = rangersTuck ? L.ankle.y + 0.13 : L.ankle.y - 0.012;
    layer(jean ? 0.22 : jog ? 0.55 : 0.4, jog ? 0.005 : bas.id === 'cargo' ? 0.004 : 0.0022, (q) => {
      const y = q.y, legs = q.p === 'leg' && y > hem && y < L.waist, hip = isTorso(q) && y < L.waist;
      if (!legs && !hip) return null;
      let o = th, s = 1, h = 0, col = base;
      const a = legs ? legAng(q) : 0, r = legR(q), ta = torsoAng(q), back = legs ? Math.sin(a) < -0.35 : q.nz < -0.25, ax = Math.abs(q.x);
      // tissage : sergé du jean, molleton, toile
      if (jean) { h += 0.12 * Math.sin((y * 0.8 + q.x * 0.6 + q.z * 0.6) * 900); s *= 1 + 0.06 * noise3(q.x * 30, y * 6, q.z * 30); }
      else h += jog ? knit(q) : 0.08 * Math.sin((y + q.x) * 900);
      if (jean) { // délavé : devant des cuisses, genoux, fesses ; moustaches à l'entrejambe
        if (legs) s += 0.22 * gauss((y - (L.knee.y + 0.2)) / 0.12) * clamp01(Math.sin(a)) + 0.14 * gauss((y - L.knee.y) / 0.045) * clamp01(Math.sin(a));
        if (hip && back) s += 0.12 * gauss((y - (L.hips.y - 0.03)) / 0.06);
        if (legs && Math.sin(a) > 0.2 && y > L.thigh.y - 0.16 && y < L.thigh.y - 0.04) { const w = Math.sin((y - (L.thigh.y - 0.1) + (a - 1.2) * 0.04) * 260); if (w > 0.85) s *= 1.12; }
        if (legs && y < L.knee.y - 0.05) s *= 0.94 + 0.06 * Math.sin(y * 95) * clamp01(Math.sin(a)); // tassement en bas de jambe
      }
      // ourlet (ou bas côtelé du jogging)
      if (jog && legs && y < L.ankle.y + 0.07) { o = 0.005; s *= 0.9; h = 0.7 * Math.sin(a * 46); if (y > L.ankle.y + 0.064) { s *= 0.7; h = -1; } }
      else if (legs && y < hem + 0.03) { o += 0.0025; s *= 0.93; if (Math.abs(y - (hem + 0.03)) < 0.0025) { s *= 0.6; h = -1; } else if (Math.abs(y - (hem + 0.023)) < 0.0013 && dash(a * r, 0.007)) col = thr; }
      // coutures : côté, entrejambe (surpiqûre double sur le jean)
      if (legs) { const d0 = angD(a, 0) * r, d1 = angD(a, Math.PI) * r; if (d0 < 0.002 || d1 < 0.002) { s *= 0.62; h = -1; } else if (jean && d1 > 0.0035 && d1 < 0.0052 && dash(y, 0.008)) col = thr; }
      if (band && legs && angD(a, 0) * r < 0.012 && y > L.ankle.y + 0.07) col = band; // bande latérale du jogging
      if (band && hip && angD(Math.abs(ta), Math.PI / 2) * 0.15 < 0.012) col = band;
      if (hip && !back) { // braguette : rabat surpiqué en J ; poches avant en arc ; petite poche (jean)
        if (!jog && q.x > 0 && y > L.hips.y - 0.045 && y < L.waist - 0.04) { const fx = q.x - 0.028 + (y < L.hips.y - 0.02 ? (L.hips.y - 0.02 - y) * 1.1 : 0); if (Math.abs(fx) < 0.0013 && dash(y, 0.007)) col = thr; if (Math.abs(q.x) < 0.0018) { s *= 0.6; h = -1; } }
        if (ax > 0.055) { const u = (ax - 0.065) / 0.075, cy = L.waist - 0.04 - 0.07 * u * u; if (u > 0 && u < 1 && y < L.waist - 0.035) { if (Math.abs(y - cy) < 0.0025) { s *= 0.5; h = -1; } else if (Math.abs(y - cy + 0.006) < 0.0012 && dash(q.x, 0.007) && !jog) col = thr; } }
        if (jean && q.x < -0.075 && q.x > -0.115 && y < L.waist - 0.045 && y > L.waist - 0.085 && (Math.abs(y - (L.waist - 0.085)) < 0.0015 || Math.abs(q.x + 0.075) < 0.0015 || Math.abs(q.x + 0.115) < 0.0015) && dash(q.x + y, 0.006)) col = thr;
      }
      if (jean && hip && back && Math.abs(y - (L.waist - 0.055 - ax * 0.22)) < 0.0022) { s *= 0.6; h = -1; } // empiècement
      // poches arrière : pièces rapportées, bord surpiqué, fond en pointe
      if ((jean || bas.id === 'uniforme') && hip && back) { const top = L.waist - 0.075, bot = L.waist - 0.2 + 0.02 * (1 - Math.abs((ax - 0.075) / 0.05)); if (ax > 0.025 && ax < 0.125 && y < top && y > bot) {
        o += 0.0016; h += 0.2; const e = Math.min(ax - 0.025, 0.125 - ax, top - y, y - bot); if (e < 0.0025) { s *= 0.65; h = -0.6; } else if (e > 0.004 && e < 0.0055 && dash(ax + y, 0.007)) col = thr;
        if (jean && Math.abs(y - (top - 0.018)) < 0.0012 && dash(ax, 0.006)) col = thr; } }
      // poches de cuisse (cargo, uniforme) : soufflet, rabat, pression
      if (work && legs && y < L.knee.y + 0.3 && y > L.knee.y + 0.08 && angD(a, 0.15) < 0.6) {
        const flap = y > L.knee.y + 0.25, e = Math.min(angD(a, 0.15) - 0.6, 0) * -r; o += flap ? 0.009 : 0.006; s *= flap ? 1.06 : 0.97; h += 0.2;
        if (Math.abs(y - (L.knee.y + 0.25)) < 0.0025 || e < 0.003 || Math.abs(y - (L.knee.y + 0.08)) < 0.0025) { s *= 0.6; h = -1; }
        if (flap && angD(a, 0.15) * r < 0.006 && Math.abs(y - (L.knee.y + 0.265)) < 0.006) { s *= 0.8; h = 1; } }
      if (work && legs && Math.abs(y - L.knee.y - 0.02) < 0.0022 && Math.sin(a) > 0.2) { s *= 0.65; h = -1; } // genou articulé
      if (work && legs && Math.abs(y - L.knee.y + 0.04) < 0.0022 && Math.sin(a) > 0.2) { s *= 0.65; h = -1; }
      // ceinture : bande, passants, ceinture (cordon pour le jogging)
      if (hip && y > L.waist - 0.042) {
        o += 0.0015;
        if (jog) { h = 0.6 * Math.sin(ta * 140); s *= 0.88; if (!back && ax < 0.02 && ax > 0.006 && y < L.waist - 0.008) { col = C('#d6d6d2'); h = 1; } }
        else { if (Math.abs(y - (L.waist - 0.042)) < 0.0022) { s *= 0.6; h = -1; }
          if (y > L.waist - 0.034 && y < L.waist - 0.007) { col = belt; s = 1; h = 0.4; o += 0.0015; if (Math.abs(y - (L.waist - 0.0105)) < 0.0012 || Math.abs(y - (L.waist - 0.0305)) < 0.0012) { if (dash(ta * 0.15, 0.005)) col = mix(belt, C('#6a5a48'), 0.6, TC2); } }
          if ([0.35, 1.05, 1.9, 2.75].some((t) => angD(Math.abs(ta), t) * 0.15 < 0.006)) { col = base; o += 0.002; h = 0.6; s *= 0.95; if (y > L.waist - 0.006 || y < L.waist - 0.036) s *= 0.7; } }
      }
      return set(o, col, 'Bas', s, h);
    });
    if (!jog && /aucun|polo/.test(haut.id)) extra.push({ geo: buckle(L, B), bone: 'Hips', color: C(jean ? '#8d8a82' : '#2c2e33') }); // boucle, si le haut est rentré
  };
  // ---- chaussures
  const piedsLayer = () => {
    if (pieds.id === 'aucun') return;
    const rg = pieds.id === 'rangers', mont = pieds.id === 'montantes', hi = rg ? 0.17 : mont ? 0.095 : 0.04, base = C(pieds.c), sole = C(pieds.c2 || '#ddd');
    const lace = rg ? C('#0b0b0c') : lum(base) > 0.4 ? mix(base, C('#9a9a96'), 0.25, new THREE.Color()) : lift(base, 0.06), soleH = rg ? 0.038 : 0.03, accent = lum(base) > 0.4 ? C('#1b1c1f') : mix(sole, base, 0.15, new THREE.Color());
    layer(1, 0.0006, (q) => {
      const y = q.y; if (!(q.p === 'foot' || (q.p === 'leg' && y < L.ankle.y + hi))) return null;
      const sx = Math.sign(q.x) || 1, fx = q.x - sx * Math.abs(L.ankle.x), fz = q.z - L.ankle.z, top = q.ny > 0.3 && fz > 0.02;
      let o = rg ? 0.012 : 0.01, s = 1, h = 0, col = base;
      if (y < soleH) { // semelle : débord, rainure, crampons
        o += 0.004 + 0.004 * sstep(soleH, soleH - 0.008, y); col = sole; h = 0.2;
        if (y < 0.011) { s = 0.75; h = rg ? (Math.sin(q.z * 260) > 0 ? 1 : -1) : 0.5 * Math.sin(q.z * 400); }
        if (Math.abs(y - soleH * 0.55) < 0.0018) { s *= 0.7; h = -1; } if (y > soleH - 0.003) s *= 1.08;
        return set(o, col, 'Pieds', s, h); }
      if (Math.abs(y - soleH) < 0.002) { s *= 0.55; h = -1; } // jonction semelle / tige
      h += rg ? 0.25 * noise3(q.x * 500, y * 500, q.z * 500) : 0.15 * noise3(q.x * 300, y * 300, q.z * 300);
      // bout renforcé, contrefort, col rembourré
      if (fz > 0.1 && y < 0.07) { o += 0.0015; if (rg) { s *= 1.15; h = 0.3; } else col = mix(base, sole, 0.3, TC2); if (Math.abs(fz - 0.1) < 0.002) { s *= 0.6; h = -1; } }
      if (fz < -0.03 && y < (rg ? 0.11 : 0.085)) { o += 0.002; s *= 0.92; if (!rg) col = accent; }
      if (q.p === 'leg' && y > L.ankle.y + hi - 0.022) { o += 0.004; s *= 0.86; h = 0.6 * Math.sin(y * 900); }
      // laçage : œillets et lacets croisés sur le dessus
      if (top && Math.abs(fx) < (rg ? 0.03 : 0.026) && y > 0.045 && fz < 0.11) {
        const w = rg ? 0.03 : 0.026, eye = Math.abs(Math.abs(fx) - w + 0.004) < 0.0035 && (((fz + y) / 0.012) % 1 + 1) % 1 < 0.45;
        const cross = (((fz + y) / 0.013) % 1 + 1) % 1 < 0.45; // passages du lacet
        if (eye) { col = rg ? C('#3a3c40') : accent; h = -0.5; o += 0.002; } else if (Math.abs(fx) < w - 0.006 && cross) { col = lace; h = 1; o += 0.0025; } else { s *= 0.8; o += 0.0015; }
        return set(o, col, 'Pieds', s, h); }
      // panneau latéral (forme générique) et surpiqûres
      if (!rg && Math.abs(q.nx) > 0.5 && y > soleH + 0.006 && y < 0.075) { const v = y - (soleH + 0.01 + (0.06 - fz) * 0.22); if (Math.abs(v) < 0.007 && fz > -0.06 && fz < 0.09) { col = accent; o += 0.0012; h = 0.5; } if (Math.abs(v - 0.01) < 0.0011 && dash(fz, 0.006)) col = lift(base, 0.06); }
      if (rg && Math.abs(q.nx) > 0.5 && Math.abs(y - (soleH + 0.04)) < 0.0012 && dash(q.z, 0.006)) col = lift(base, 0.04);
      return set(o, col, 'Pieds', s, h);
    });
  };
  if (rangersTuck) { basLayer(); piedsLayer(); } else { piedsLayer(); basLayer(); }

  // ---- haut
  if (haut.id !== 'aucun') {
    const id = haut.id, sweat = id === 'sweat' || id === 'sweat_zip', zipped = id === 'sweat_zip' || id === 'kway' || id === 'doudoune' || id === 'veste_mo';
    const LO = { tshirt: 0.25, polo: 0.3, sweat: 0.65, sweat_zip: 0.65, kway: 0.7, veste_mo: 0.55, doudoune: 0.9 }[id] ?? 0.45;
    const WR = { doudoune: 0.002, kway: 0.006, sweat: 0.0045, sweat_zip: 0.0045, veste_mo: 0.003, tshirt: 0.0015, polo: 0.0015 }[id] ?? 0.003;
    const long = id !== 'tshirt' && id !== 'polo', bulk = { tshirt: 0.003, polo: 0.004, sweat: 0.008, sweat_zip: 0.008, doudoune: 0.02, kway: 0.006, veste_mo: 0.009 }[id] ?? 0.006;
    const tucked = id === 'polo';
    const bottom = tucked ? L.waist - 0.05 : id === 'tshirt' ? L.hips.y + 0.03 : id === 'doudoune' ? L.hips.y + 0.03 : L.hips.y + 0.01; // au-dessus de l'entrejambe : l'ourlet fait le tour des hanches
    const collar = id === 'doudoune' ? 0.06 : id === 'veste_mo' ? 0.05 : id === 'kway' ? 0.045 : id === 'polo' ? 0.03 : 0.012;
    const hoodDown = haut.hood && tete.id !== 'capuche';
    const under = haut.c3 ? C(haut.c3) : null; // dessous visible : t-shirt sous un sweat, sweat à capuche sous une doudoune
    const vTop = L.chest.y + (id === 'veste_mo' ? 0.09 : 0.03);
    const vOpen = (q) => (id === 'sweat_zip' || id === 'veste_mo') && q.nz > 0.2 && Math.abs(q.x) < (q.y - vTop) * 0.55 && q.p !== 'neck';
    const cuffA = 1 - (id === 'doudoune' ? 0.09 : 0.07) / 0.55, base = hautC, c2 = haut.c2 ? C(haut.c2) : null, thr = lift(base, lum(base) < 0.03 ? 0.045 : 0.07);
    const zipC = c2 || base.clone().multiplyScalar(0.55), dark = base.clone().multiplyScalar(0.8);
    layer(LO, WR, (q) => {
      const p = q.p, y = q.y, arm = q.arm, a = q.a, torso = isTorso(q) || (p === 'leg' && y > bottom - 0.03); // le haut du bassin est pesé sur les cuisses : il fait partie du buste ici
      let cover = false;
      if (torso) cover = y > bottom - (under && !tucked ? 0.02 : 0);
      else if (arm) cover = long ? a < 0.985 : a < 0.38;
      else if (p === 'neck') cover = y < L.neck.y + collar - 0.012 || (q.nz < -0.2 && y < L.neck.y + 0.025 + collar);
      if (!cover) return null;
      let o = bulk, s = 1, h = id === 'kway' || id === 'doudoune' ? 0.08 * noise3(q.x * 200, y * 200, q.z * 200) : knit(q), col = base;
      const ta = torsoAng(q), aa = arm ? armAng(q) : 0;
      // dessous : bande de t-shirt sous l'ourlet, triangle au col ouvert
      if (under && torso && y < bottom && !tucked) { const k = y < bottom - 0.016 ? 0.85 : 0.95; return set(Math.max(0.0025, bulk * 0.4), under, 'Haut', Math.abs(y - (bottom - 0.017)) < 0.0015 ? 0.7 : k, knit(q)); }
      if (under && vOpen(q)) return set(0.0025, under, 'Haut', y > L.neck.y - 0.03 ? 0.9 : 1, knit(q));
      // bord-côte en bas, poignets, col
      if (torso && y < bottom + 0.055 && (sweat || id === 'kway')) { o = bulk * 0.7; s *= 0.92; h = id === 'kway' ? 0.4 * Math.sin(y * 900) : 0.75 * Math.sin(ta * 160); if (Math.abs(y - (bottom + 0.055)) < 0.0022) { o += 0.002; s *= 0.65; h = -1; } }
      if (arm && long && a > cuffA) { o = Math.max(0.004, bulk * 0.6); s *= 0.9; h = id === 'kway' ? 0.5 * Math.sin(a * 600) : 0.75 * Math.sin(aa * 30); if (Math.abs(a - cuffA) < 0.006) { o += 0.002; s *= 0.62; h = -1; } }
      if (arm && !long && a > 0.33) { o += 0.0015; s *= 0.93; if (Math.abs(a - 0.33) < 0.005) { s *= 0.62; h = -1; } else if (Math.abs(a - 0.355) < 0.003 && dash(aa * armR(q), 0.006)) col = thr; }
      if (p === 'neck') { o = bulk * 0.8 + 0.002; s *= 0.9; h = 0.7 * Math.sin(ta * 120); }
      if (torso && Math.abs(y - (L.neck.y - 0.005)) < 0.006 && Math.abs(ta) < 1.6 && !vOpen(q) && collar < 0.02) { s *= 0.88; h = 0.7 * Math.sin(ta * 120); } // encolure côtelée
      // coutures : flancs, emmanchures, dessous des manches
      if (torso && angD(Math.abs(ta), Math.PI / 2) * 0.14 < 0.0022 && y < L.chest.y + 0.06) { s *= 0.62; h = -1; }
      if (arm && Math.abs(a - 0.06) < 0.006) { s *= 0.62; h = -1; } else if (arm && Math.abs(a - 0.075) < 0.003 && dash(aa * 0.05, 0.006) && !tucked) col = thr;
      if (arm && long && angD(aa, Math.PI) * armR(q) < 0.002) { s *= 0.65; h = -1; }
      if (id === 'doudoune') { // boudins horizontaux, coutures piquées, poches passepoilées
        const ph = (y - L.hips.y) / 0.07, q1 = Math.abs(Math.sin(ph * Math.PI)); o += 0.01 * q1; s *= 0.8 + 0.2 * q1; h = q1 * 2 - 1;
        if (q1 < 0.08) { s *= 0.7; if (dash(ta * 0.15, 0.006)) col = thr; }
        if (arm) { const qa = Math.abs(Math.sin(a * Math.PI * 5)); o += 0.006 * qa; s *= 0.85 + 0.15 * qa; h = qa * 2 - 1; if (qa < 0.08) s *= 0.7; }
        if (torso && q.nz > 0.2 && Math.abs(Math.abs(q.x) - 0.12) < 0.004 && y < L.hips.y + 0.13 && y > L.hips.y + 0.02) { col = zipC; s = 0.9; h = -1; }
      }
      if (sweat && torso && q.nz > 0.3 && Math.abs(q.x) < 0.13 && y > bottom + 0.06 && y < bottom + 0.2) { // poche kangourou
        const sideX = 0.13 - (y - bottom - 0.06) * 0.25, e = Math.min(sideX - Math.abs(q.x), bottom + 0.2 - y);
        if (Math.abs(q.x) < sideX) { if (id === 'sweat_zip' && Math.abs(q.x) < 0.02) { /* ouverture du zip */ } else {
          o += 0.0025; h += 0.15; if (e < 0.0025) { s *= 0.6; h = -1; } else if (e > 0.004 && e < 0.0055 && dash(q.x + y, 0.006)) col = thr;
          const open = Math.abs(Math.abs(q.x) - (0.105 - (y - bottom - 0.06) * 0.3)) < 0.002 && y < bottom + 0.17; if (open) { s *= 0.4; h = -1; } } } }
      if (id === 'polo' && torso && q.ny > 0.55 && Math.abs(q.x) > 0.07 && c2) { o += 0.0015; col = c2; if (Math.abs(Math.abs(q.x) - 0.07) < 0.004) { s *= 0.7; h = -1; } }
      if ((id === 'polo' || id === 'veste_mo') && torso && q.nz > 0.4 && Math.abs(Math.abs(q.x) - 0.09) < 0.045 && y < L.chest.y + 0.08 && y > L.chest.y - 0.04) { // poches de poitrine à rabat
        o += 0.003; h += 0.15; const flap = y > L.chest.y + 0.045, e = Math.min(0.045 - Math.abs(Math.abs(q.x) - 0.09), y - (L.chest.y - 0.04), L.chest.y + 0.08 - y);
        if (flap) { o += 0.0015; s *= 1.06; } if (Math.abs(y - (L.chest.y + 0.045)) < 0.0025 || e < 0.0025) { s *= 0.6; h = -1; } else if (e > 0.004 && e < 0.0055 && dash(q.x + y, 0.006)) col = thr;
        if (flap && Math.abs(Math.abs(q.x) - 0.09) < 0.005 && Math.abs(y - (L.chest.y + 0.055)) < 0.005) { col = dark; h = 1; } }
      if (id === 'polo' && torso && q.nz > 0.5 && Math.abs(q.x) < 0.016 && y > L.chest.y - 0.02) { o += 0.0015; if (Math.abs(Math.abs(q.x) - 0.016) < 0.002) { s *= 0.65; h = -1; } } // patte de boutonnage
      if (id === 'polo' && (p === 'neck' || (torso && y > L.neck.y - 0.05 && q.nz > 0.2 && Math.abs(q.x) < 0.075 - (L.neck.y - y) * 0.6))) { o += 0.002; s *= 1.04; h = 0.2; if (Math.abs(Math.abs(q.x) - (0.075 - (L.neck.y - y) * 0.6)) < 0.0025) { s *= 0.6; h = -1; } } // col à pointes
      if (id === 'veste_mo' && c2 && (torso || arm)) { // renforts d'épaules et de coudes, surpiqués
        const sh = arm && a < 0.22 && q.ny > -0.3, el = arm && Math.abs(a - 0.5) < 0.09 && Math.sin(aa) < 0.3;
        if (sh || el) { o += 0.006; col = c2; h = 0.3; const e = sh ? 0.22 - a : 0.09 - Math.abs(a - 0.5); if (e < 0.008) { s *= 0.65; h = -1; } else if (e > 0.012 && e < 0.016 && dash(aa * 0.05, 0.006)) col = thr; } }
      if (id === 'veste_mo' && torso && q.nz > 0.4 && q.x < -0.03 && q.x > -0.12 && Math.abs(y - (L.chest.y + 0.115)) < 0.017) { col = mix(base, C('#7d8590'), 0.35, TC2); o += 0.001; h = 0.6 * Math.sin(q.x * 900); } // bande velcro (grade)
      if (id === 'kway' && torso && Math.abs(y - (L.chest.y + 0.06)) < 0.0022) { s *= 0.6; h = -1; } // empiècement de poitrine
      if (id === 'kway' && torso && q.nz > 0.3 && Math.abs(Math.abs(q.x) - 0.1 + (y - L.hips.y) * 0.25) < 0.0025 && y > L.hips.y + 0.04 && y < L.hips.y + 0.16) { col = zipC; h = -1; } // poches zippées
      // zip, rabat et revers du col ouvert
      if (zipped && torso && q.nz > 0.6 && Math.abs(q.x) < 0.006 && !vOpen(q)) { o += 0.0015; col = zipC; h = Math.sin(y * 1800) > 0 ? 1 : -1; return set(o, col, 'Haut', 1, h); }
      if (zipped && torso && q.nz > 0.5 && Math.abs(q.x) < 0.02 && !vOpen(q)) { s *= 0.92; if (Math.abs(Math.abs(q.x) - 0.014) < 0.0012 && dash(y, 0.007)) col = thr; }
      if (under && torso && q.nz > 0.2 && !vOpen(q) && (id === 'sweat_zip' || id === 'veste_mo') && y > L.chest.y && Math.abs(Math.abs(q.x) - (y - vTop) * 0.55) < 0.012) { o += 0.002; s *= 1.08; if (Math.abs(Math.abs(q.x) - (y - vTop) * 0.55) < 0.002) { s *= 0.7; h = -1; } }
      if (hoodDown) { // capuche baissée : bourrelet dans le dos, bord ourlé
        const bk = sstep(-0.1, -0.6, q.nz), d = (y - (L.neck.y - 0.035)) / 0.07, w = bk * gauss(d) * sstep(0.17, 0.06, Math.abs(q.x));
        if (bk > 0 && (torso || p === 'neck')) { o += 0.045 * w; if (w > 0.15 && w < 0.3) { s *= 0.65; h = -1; } } }
      if (id === 'doudoune' && under && (torso || p === 'neck')) { // capuche du sweat de dessous, sortie par-dessus le col
        const bk = sstep(-0.1, -0.6, q.nz), d = y - L.neck.y, w = bk * gauss(d / 0.06) * sstep(0.16, 0.05, Math.abs(q.x));
        if (w > 0.25) return set(o + 0.02 * w + 0.004, under, 'Haut', w < 0.32 ? 0.65 : 0.9 + 0.1 * w, w < 0.32 ? -1 : knit(q)); }
      return set(o, col, 'Haut', s, h);
    });
    if (sweat || id === 'kway') { const hc = id === 'kway' ? C('#0d0e10') : (under || hautC).clone().lerp(C('#ffffff'), 0.25); for (const sx of [-1, 1]) extra.push({ geo: drawstring(L, B, sx, id === 'kway' ? 0.09 : 0.13), bone: 'Chest', color: hc }); }
    if (zipped && id !== 'veste_mo') extra.push({ geo: zipPull(L, B, id === 'sweat_zip' ? vTop : L.neck.y - 0.02), bone: 'Chest', color: c2 || C('#8d9096') });
    if (id === 'polo') for (let k = 0; k < 3; k++) extra.push({ geo: button(L, B, L.neck.y - 0.03 - k * 0.035), bone: 'Chest', color: C('#0e1220') });
  }
  // ---- gilet
  const gilet = piece(def, 'gilet');
  if (gilet.id !== 'aucun') {
    const base = C(gilet.c), c2 = C(gilet.c2 || gilet.c), fluo = gilet.id === 'fluo', tac = gilet.id === 'tactique', bind = lum(base) < 0.03 ? lift(base, 0.03) : base.clone().multiplyScalar(fluo ? 0.8 : 1.4);
    const web = lum(base) < 0.03 ? lift(base, 0.012) : base.clone().multiplyScalar(0.85), refl = C(gilet.c2 || '#c4c8cc');
    layer(0.75, fluo ? 0.003 : 0.0006, (q, st) => {
      const y = q.y; if (q.p !== 'torso' && !(tac && q.arm)) return null;
      if (q.arm) { const a = q.a; if (!(tac && a < 0.3 && q.ny > -0.35)) return null; // épaulières articulées
        const seg = Math.abs(Math.sin(a * Math.PI / 0.1)); return set(st.off + 0.008 + 0.004 * seg, c2, 'Gilet', 0.85 + 0.2 * seg, seg < 0.12 ? -1 : 0.3, true); }
      const lo = L.waist + (fluo ? -0.02 : 0.015), sh = y > L.chest.y + 0.09, ta = Math.abs(torsoAng(q));
      if (y < lo) return null; if (sh && (Math.abs(Math.abs(q.x) - 0.1) > 0.035 || q.ny < -0.2)) return null; // bretelles
      if (!fluo && ta > 1.25 && ta < 1.9 && y > L.chest.y - 0.02) return null; // échancrure des bras
      let o = fluo ? st.off + 0.003 : Math.max(st.off + 0.008, 0.016), s = 1, h = fluo ? knit(q, 0.6) : 0.25 * Math.sin((q.x + y) * 900) * Math.sin((q.x - y) * 900), col = base;
      const e = Math.min(y - lo, sh ? 0.035 - Math.abs(Math.abs(q.x) - 0.1) : 1, !fluo && y > L.chest.y - 0.02 ? Math.min(Math.abs(ta - 1.25), Math.abs(ta - 1.9)) * 0.14 : 1);
      if (!fluo) {
        const fr = q.nz > 0.35, bk = q.nz < -0.35;
        if ((fr || bk) && Math.abs(q.x) < 0.13 && y > lo + 0.08 && y < L.chest.y + 0.08) o += 0.004; // plaques
        if ((fr || bk) && y > lo + 0.02 && y < lo + 0.14) { const row = ((y - lo - 0.02) % 0.025 + 0.025) % 0.025; if (row < 0.012) { col = web; h = 0.6; o += 0.001; if ((((q.x + 0.5) / 0.038) % 1) < 0.08) { s *= 0.55; h = -1; } } } // sangles MOLLE
        if (fr && tac && Math.abs(q.x) < 0.17 && y < lo + 0.11) { o += 0.01; col = c2; h = 0.2; const cell = Math.abs(((q.x + 0.17) / 0.113) % 1 - 0.5); if (cell > 0.44) { s = 0.55; h = -1; } if (y > lo + 0.095) { s *= 1.1; if (Math.abs(y - (lo + 0.095)) < 0.002) { s *= 0.6; h = -1; } } } // porte-chargeurs à rabat
        if (fr && Math.abs(q.x) < 0.07 && Math.abs(y - (L.chest.y + 0.03)) < 0.028) { o += 0.0015; col = mix(base, C('#8a919c'), 0.25, TC2); h = 0.5 * Math.sin(q.x * 1100) * Math.sin(y * 1100); } // velcro de poitrine
        if (ta > 1.0 && ta < 2.1 && y < lo + 0.12) { s *= 0.85; if (((y - lo) % 0.03) < 0.008) { s *= 0.75; h = -1; } } // ceinture latérale
      } else if (Math.abs(y - (lo + 0.07)) < 0.016 || Math.abs(y - (lo + 0.2)) < 0.016) { col = refl; h = 0.3; } // bandes réfléchissantes
      if (e < 0.008) { col = bind; o += 0.0015; h = 0.5; s = 1; if (e > 0.006 && dash(q.x + y, 0.006)) col = lift(bind, 0.04); } // biais de bordure
      return set(o, col, 'Gilet', s, h, true);
    });
  }
  // ---- gants
  const mains = piece(def, 'mains');
  if (mains.id !== 'aucun') { const base = C(mains.c), c2 = C(mains.c2 || mains.c);
    layer(0, 0.0005, (q) => { if (!(q.p === 'hand' || (q.arm && q.a > 0.955))) return null; let o = mains.id === 'gants_coques' ? 0.004 : 0.003, col = base, s = 1, h = 0.2 * noise3(q.x * 600, q.y * 600, q.z * 600);
      if (q.arm) { o += 0.002; s = 0.85; h = 0.6 * Math.sin(q.a * 900); if (q.a < 0.96) { s *= 0.6; h = -1; } } // manchette
      if (mains.id === 'gants_coques' && /^(Wrist|Index1|Middle1|Ring1|Pinky1)/.test(q.b) && q.ny > 0.4) { o += 0.004; col = c2; h = 0.6; } // coques des jointures
      return set(o, col, 'Mains', s, h); }); }
  // ---- tête
  const capLine = (q) => L.eyeY + 0.042 - 0.07 * sstep(L.headC.z + 0.02, L.back + 0.01, q.z); // bord : au-dessus des sourcils devant, plus bas derrière
  const headAng = (q) => Math.atan2(q.x, q.z - L.headC.z);
  if (tete.id === 'casquette' || tete.id === 'bonnet') {
    const base = C(tete.c), bonnet = tete.id === 'bonnet', thr = lift(base, 0.05);
    layer(0, 0.001, (q) => { if (q.p !== 'head') return null; const line = capLine(q) + (bonnet ? 0.004 : 0); if (q.y < line) return null;
      let o = bonnet ? 0.017 : 0.011, s = 1, h = 0, col = base; const ha = headAng(q);
      if (bonnet) { h = 0.8 * Math.sin(ha * 70); if (q.y < line + 0.035) { o += 0.006; s = 0.95; if (Math.abs(q.y - (line + 0.035)) < 0.002) { s = 0.6; h = -1; } } } // maille côtelée, revers
      else { // six pans, coutures surpiquées, œillets, bouton
        const pan = Math.abs(((ha / (Math.PI / 3)) % 1 + 1) % 1 - 0.5); if (pan > 0.485 && q.y > line + 0.01) { s = 0.6; h = -1; } else if (pan > 0.46 && pan < 0.47 && dash(q.y, 0.005)) col = thr;
        if (Math.abs(q.y - (line + 0.004)) < 0.0015) { s = 0.7; h = -1; } h += 0.15 * Math.sin((q.x + q.y) * 1200);
        if (q.y > L.top - 0.006) { col = base; h = 1; s = 1.1; } }
      return set(o, col, 'Tete', s, h); });
    hairClip.y = L.eyeY + 0.03;
    if (!bonnet) extra.push({ geo: brim(L), bone: 'Head', color: base.clone().multiplyScalar(0.95) });
  }
  const hoodColor = tete.c ? C(tete.c) : hautC || C('#18181b');
  if (tete.id === 'capuche' || tete.id === 'casque') {
    const casque = tete.id === 'casque', base = casque ? C(tete.c) : hoodColor;
    // capuche : le cou est pris dans le tissu ; la capuche elle-même est une coque accrochée à la tête, ouverte sur le visage
    if (!casque) layer(0, 0.001, (q) => (q.p === 'neck' || (q.p === 'head' && q.y < L.eyeY - 0.1 && q.nz < 0.3)) ? set(0.012, base, 'Tete', 0.92, knit(q)) : null);
    extra.push({ geo: casque ? helmetShell(L) : hoodShell(L), bone: 'Head', color: base });
    hairClip.all = true;
    if (casque) { extra.push({ geo: visorShell(L), bone: 'Head', color: C(tete.c2 || '#8a9bb0') }); extra.push({ geo: chinStrap(L), bone: 'Head', color: C('#101114') }); }
  }
  if (visage.id === 'cagoule') {
    const base = C(visage.c);
    layer(0, 0.001, (q) => { const p = q.p; if (p !== 'head' && p !== 'neck') return null;
      const eh = q.nz > 0.35 && q.z > L.headC.z ? Math.max(Math.abs(q.y - L.eyeY) / 0.021, (Math.abs(q.x) - (L.eyeX + 0.02)) / 0.01 + 1) : 9; if (eh < 1) return null; // ouverture des yeux
      let s = p === 'neck' ? 0.95 : 1, h = 0.7 * Math.sin(headAng(q) * 90); if (eh < 1.25) { s = 0.75; h = 0.8; } // bord côtelé
      return set(0.006 + (eh < 1.25 ? 0.002 : 0), base, 'Tete', s, h); });
    hairClip.all = true; browsHidden = true; beardHidden = true;
  }
  // ---- visage
  if (visage.id !== 'aucun' && visage.id !== 'cagoule') {
    const base = C(visage.c);
    if (visage.id === 'foulard' || visage.id === 'cache_cou' || visage.id === 'masque') {
      const noseY = L.eyeY - 0.038, mask = visage.id === 'masque';
      layer(0, 0.001, (q, st) => { const p = q.p, y = q.y;
        let cover = false; if (p === 'head') cover = y < noseY - (mask ? 0 : 0.004) && (mask ? q.nz > 0.15 && Math.abs(q.x) < 0.07 : q.nz > -0.25 || visage.id === 'cache_cou') && y > (mask ? L.eyeY - 0.14 : -1);
        else if (p === 'neck') cover = !mask; else if (p === 'torso' && visage.id === 'foulard') cover = q.nz > 0.3 && y > L.neck.y - 0.07 && Math.abs(q.x) < 0.085 - (L.neck.y - y) * 0.9; // pointe du foulard sur la poitrine
        if (!cover || (st.tag === 'Tete' && p === 'head')) return null;
        let o = mask ? 0.008 : 0.012, s = 1, h = knit(q);
        if (visage.id === 'cache_cou') { h = 0.5 * Math.sin(y * 260); s = 0.95 + 0.05 * Math.sin(y * 260); }
        if (visage.id === 'foulard') { if (p === 'head') o += 0.004 * sstep(noseY - 0.03, noseY, y); h = 0.5 * Math.sin((y * 3 + Math.abs(q.x)) * 160); s = 0.94 + 0.06 * Math.sin((y * 3 + Math.abs(q.x)) * 160); if (Math.abs(y - (noseY - 0.004)) < 0.003) { s *= 0.7; h = -1; } }
        if (mask) { const pl = ((y - (L.eyeY - 0.14)) / 0.03) % 1; h = pl < 0.12 ? -1 : 0.3; s = pl < 0.12 ? 0.85 : 1; if (Math.abs(y - (noseY - 0.003)) < 0.004 && Math.abs(q.x) < 0.035) { h = 1; s = 1.1; } }
        return set(o, base, 'Visage', s, h); });
      beardHidden = true;
    }
    if (visage.id === 'lunettes') {
      layer(0, 0.001, (q, st) => (q.p === 'head' && st.tag !== 'Tete' && Math.abs(q.y - (L.eyeY + 0.006)) < 0.011 && !(q.nz > 0.3 && q.z > L.headC.z + 0.02)) ? set(0.005, base, 'Visage', 1, 0.5 * Math.sin(headAng(q) * 120)) : null); // sangle
      extra.push({ geo: goggles(L, 'frame'), bone: 'Head', color: base }); extra.push({ geo: goggles(L, 'lens'), bone: 'Head', color: C(visage.c2 || '#8fa6b8') });
    }
    if (visage.id === 'masque_gaz') {
      const glass = C('#55697a');
      layer(0, 0.001, (q, st) => { if (q.p !== 'head' || st.tag === 'Tete') return null; const y = q.y; if (!(y < L.eyeY + 0.035 && y > L.eyeY - 0.15 && q.nz > 0.15 && Math.abs(q.x) < L.headR * 0.95)) return null;
        const eye = Math.abs(y - L.eyeY) < 0.02 && q.nz > 0.5 && Math.abs(q.x) < L.eyeX + 0.015; return set(eye ? 0.016 : 0.022, eye ? glass : base, 'Visage', eye ? 1 : 0.95 + 0.05 * Math.sin(y * 300), eye ? 0 : 0.4 * Math.sin(y * 300)); });
      for (const sx of [-1, 1]) extra.push({ geo: filter(L, sx), bone: 'Head', color: C(visage.c2 || '#3a3d42') });
      browsHidden = true; beardHidden = true;
    }
  }
  // ---- accessoires
  const ex = new Set(def.extras || []);
  const exC = (id) => C((def.extraColors && def.extraColors[id]) || EXTRAS.find((e) => e.id === id).c || '#222');
  if (ex.has('genouilleres')) { const col = exC('genouilleres'); layer(1, 0.001, (q, st) => { if (q.p !== 'leg' || Math.abs(q.y - L.knee.y) > 0.06 || q.nz < -0.05) return null; const e = 0.06 - Math.abs(q.y - L.knee.y); return set(st.off + 0.016, col, 'Extra', e < 0.008 ? 0.8 : 1, e < 0.004 ? -1 : 0.3 * Math.sin(q.y * 700), true); }); }
  if (ex.has('jambieres')) { const col = exC('jambieres'); layer(1, 0.001, (q, st) => { if (q.p !== 'leg' || q.y < L.ankle.y + 0.07 || q.y > L.knee.y + 0.05 || q.nz < -0.15) return null; const k = Math.abs(q.y - L.knee.y) < 0.03, seg = Math.abs(((q.y - L.ankle.y) / 0.045) % 1 - 0.5); return set(st.off + 0.016, col, 'Extra', k ? 1.15 : seg > 0.46 ? 0.7 : 1, seg > 0.46 ? -1 : 0.2, true); }); }
  if (ex.has('coudieres')) { const col = exC('coudieres'); layer(1, 0.001, (q, st) => (q.arm && Math.abs(q.a - 0.5) < 0.08 && q.nz < 0.2) ? set(st.off + 0.012, col, 'Extra', Math.abs(q.a - 0.5) > 0.07 ? 0.75 : 1, 0.3, true) : null); }
  if (ex.has('sac')) { const col = exC('sac'); layer(1, 0.001, (q, st) => (isTorso(q) && q.nz > 0.1 && Math.abs(Math.abs(q.x) - 0.095) < 0.018 && q.y > L.chest.y - 0.12) ? set(st.off + 0.004, col, 'Extra', Math.abs(Math.abs(q.x) - 0.095) > 0.014 ? 0.75 : 0.95, 0.4 * Math.sin(q.y * 900), true) : null); } // bretelles
  if (ex.has('banane')) { const col = exC('banane'); layer(1, 0.001, (q, st) => (isTorso(q) && Math.abs(q.y - (L.chest.y + 0.02 - (q.x + 0.15) * 0.75)) < 0.018 && q.nz > -0.2) ? set(st.off + 0.004, col, 'Extra', 0.9, 0.4 * Math.sin(q.x * 900), true) : null); } // sangle en bandoulière

  // ---- passe 1 : les sommets (épaisseur, ampleur, plis)
  const off = new Float32Array(n), loose = new Float32Array(n), wr = new Float32Array(n), q = {}, st = { off: 0, tag: 'Skin' };
  for (let i = 0; i < n; i++) { setQ(q, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], wn[i * 3], wn[i * 3 + 1], wn[i * 3 + 2], part[i], boneName[i]); st.off = 0; st.tag = 'Skin';
    for (const Ly of layers) { const r = Ly.fn(q, st); if (!r) continue; st.off = r.abs ? r.o : Math.max(r.o, st.off > 0 ? st.off + 0.0018 : r.o); st.tag = r.t; loose[i] = Math.max(loose[i], Ly.lo); wr[i] = Ly.wr; }
    off[i] = st.off; }
  if (ex.has('sac')) { let bo = 0; for (let i = 0; i < n; i++) if (part[i] === 'torso' && wn[i * 3 + 2] < -0.7 && Math.abs(pos[i * 3]) < 0.08 && Math.abs(pos[i * 3 + 1] - (L.chest.y - 0.05)) < 0.06) bo = Math.max(bo, off[i]); B.backOff = bo + 0.012; extra.push({ geo: backpack(L, B), bone: 'Chest', color: exC('sac') }); }
  if (ex.has('banane')) extra.push({ geo: pouch(L), bone: 'Chest', color: exC('banane') });

  // ---- passe 2 : la texture (couleur et relief, pixel par pixel dans les UV du corps)
  const tex = paintTexture(B, TEX, (x, y, z, nx, ny, nz, vi, out) => {
    setQ(q, x, y, z, nx, ny, nz, part[vi], boneName[vi]); st.off = 0; st.tag = 'Skin'; let top = null;
    for (const Ly of layers) { const r = Ly.fn(q, st); if (!r) continue; st.off = r.abs ? r.o : Math.max(r.o, st.off > 0 ? st.off + 0.0018 : r.o); st.tag = r.t; top = r; out.r = r.c.r; out.g = r.c.g; out.b = r.c.b; out.s = r.s; out.h = r.h; }
    return !!top; }, skinCol);

  // ---- assemblage : corps déformé + yeux + sourcils + coiffure + accessoires, un seul maillage indexé
  // avant des cuisses, par tranche de hauteur (référence pour aplatir l'entrejambe)
  const czt = new Map(); for (let i = 0; i < n; i++) { const ax = Math.abs(pos[i * 3]); if (ax < 0.06 || ax > 0.1 || wn[i * 3 + 2] < 0.3) continue; const k = Math.round(pos[i * 3 + 1] * 100); czt.set(k, Math.max(czt.get(k) ?? -1e9, pos[i * 3 + 2])); }
  const crotchZ = (y) => { const k = Math.round(y * 100); return czt.get(k) ?? czt.get(k + 1) ?? czt.get(k - 1) ?? 1e9; };
  const lerp2 = (a, b, t) => a + (b - a) * t;
  const parts = [], WH = tex.white; // les pièces sans UV lisent un coin blanc de la texture (leurs couleurs restent par sommet)
  { const g = new THREE.BufferGeometry(), P3 = new Float32Array(n * 3), v = V(), nn = V(), col = new Float32Array(n * 3).fill(1);
    // lâche et plis sont lissés sur les sommets soudés (sinon marches aux coutures), puis : position = corps → corps lissé, + épaisseur le long de la normale, + plis
    const gl = new Float32Array(B.ng), go = new Float32Array(B.ng), gw = new Float32Array(B.ng), gc = new Float32Array(B.ng); for (let i = 0; i < n; i++) { const g = B.wid[i]; gl[g] += loose[i]; go[g] += off[i]; gw[g] += wr[i]; gc[g]++; }
    for (let i = 0; i < n; i++) { const g = B.wid[i], k = gc[g], lo = gl[g] / k, of = go[g] / k, w = gw[g] / k; v.fromArray(pos, i * 3); if (of > 0) { v.lerp(nn.fromArray(B.smooth, i * 3), 0.8 + 0.2 * Math.min(1, lo * 3)); if (lo > 0) v.lerp(nn.fromArray(B.hull, i * 3), lo * lo); } nn.fromArray(wn, i * 3);
      const wz = of > 0 ? w * noise3(v.x * 9, v.y * 9, v.z * 9) : 0; v.addScaledVector(nn, of + wz);
      // entrejambe : le tissu du pantalon passe à plat devant (pas de relief marqué), au niveau du devant des cuisses
      if (of > 0 && part[i] !== 'foot' && Math.abs(pos[i * 3]) < 0.075 && wn[i * 3 + 2] > 0) { const y = pos[i * 3 + 1], w2 = sstep(0.075, 0.035, Math.abs(pos[i * 3])) * gauss((y - (L.hips.y - 0.045)) / 0.05); if (w2 > 0.01) { const zf = crotchZ(y) + of + 0.004; if (v.z > zf) v.z = lerp(v.z, zf, w2); } }
      P3.set([v.x, v.y, v.z], i * 3); }
    // marches entre couches : ombre au pied de la marche (les surcouches se lisent) ; teinte par sommet, multipliée à la texture
    { const ga = new Float32Array(B.ng); for (let g = 0; g < B.ng; g++) ga[g] = go[g] / (gc[g] || 1); const sh = new Float32Array(B.ng).fill(1);
      for (let g = 0; g < B.ng; g++) { let up = 0, dn = 0; for (const h of B.nbl[g]) { up = Math.max(up, ga[h] - ga[g]); dn = Math.max(dn, ga[g] - ga[h]); } if (up > 0.0012) sh[g] = 1 - Math.min(0.35, (up - 0.0008) * 40); else if (dn > 0.0012 && ga[g] > 0) sh[g] = 1 + Math.min(0.08, dn * 16); }
      for (let i = 0; i < n; i++) col.fill(sh[B.wid[i]], i * 3, i * 3 + 3); }
    // normales recalculées sur la forme habillée, soudées
    const gn = new Float32Array(B.ng * 3), I = sg.index, a = V(), b = V(), d = V(), e1 = V(), e2 = V();
    for (let t = 0; t < I.count; t += 3) { const ia = I.getX(t), ib = I.getX(t + 1), ic = I.getX(t + 2); a.fromArray(P3, ia * 3); b.fromArray(P3, ib * 3); d.fromArray(P3, ic * 3); e1.subVectors(b, a); e2.subVectors(d, a); e1.cross(e2); for (const qq of [ia, ib, ic]) { const g = B.wid[qq] * 3; gn[g] += e1.x; gn[g + 1] += e1.y; gn[g + 2] += e1.z; } }
    const NN = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const g = B.wid[i] * 3; a.set(gn[g], gn[g + 1], gn[g + 2]).normalize(); NN.set([a.x, a.y, a.z], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(P3, 3)); g.setAttribute('normal', new THREE.BufferAttribute(NN, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', sg.attributes.uv.clone());
    // tissu : poids lissés (fondu selon le lâche), peau nue : poids d'origine
    const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), oi = sg.attributes.skinIndex, ow = sg.attributes.skinWeight;
    for (let i = 0; i < n; i++) { const lo = gl[B.wid[i]] / gc[B.wid[i]], cloth = go[B.wid[i]] > 0 && part[i] !== 'hand' && part[i] !== 'foot' && part[i] !== 'head';
      for (let k = 0; k < 4; k++) { if (cloth && lo > 0.3) { SI[i * 4 + k] = B.sIdx[i * 4 + k]; SW[i * 4 + k] = B.sWt[i * 4 + k]; } else { SI[i * 4 + k] = oi.getComponent(i, k); SW[i * 4 + k] = ow.getComponent(i, k); } } }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4)); g.setIndex(sg.index);
    g.applyMatrix4(B.Wi);
    parts.push({ g, world: false, name: 'Skin' }); }
  const keepMesh = (name, filterTri, tint) => { const m = B.meshes[name]; if (!m) return; let g = m.geometry.clone();
    if (tint) { const cc = g.attributes.color, t = C(tint); for (let i = 0; i < cc.count; i++) { const l = cc.getX(i); c.copy(t).multiplyScalar(0.45 + l * 1.5); cc.setXYZ(i, c.r, c.g, c.b); } }
    if (filterTri) { const I = g.index, idx = [], mw = m.matrixWorld, a = V(); const ok = new Uint8Array(g.attributes.position.count); for (let i = 0; i < ok.length; i++) { a.fromBufferAttribute(g.attributes.position, i).applyMatrix4(mw); ok[i] = filterTri(a) ? 1 : 0; }
      for (let t = 0; t < I.count; t += 3) if (ok[I.getX(t)] && ok[I.getX(t + 1)] && ok[I.getX(t + 2)]) idx.push(I.getX(t), I.getX(t + 1), I.getX(t + 2)); if (!idx.length) return; g.setIndex(idx); }
    // pièce exprimée dans le repère du maillage Skin (même liaison)
    g.applyMatrix4(m.matrixWorld); g.applyMatrix4(B.Wi); parts.push({ g, name }); };
  keepMesh('Eye');
  if (!browsHidden) keepMesh('Brows', null, def.hairColor || '#2b1d14');
  const clipHair = (a) => { if (hairClip.all) return false; if (!isFinite(hairClip.y)) return true; const back = sstep(L.headC.z + 0.02, L.back + 0.01, a.z); return a.y < L.eyeY + 0.035 - 0.07 * back - 0.006; };
  if (def.hair && !hairClip.all) keepMesh(def.hair, clipHair, def.hairColor || '#2b1d14');
  if (def.barbe && !beardHidden) keepMesh('Hair_Beard', null, def.hairColor || '#2b1d14');
  const bIdx = new Map(B.skel.bones.map((b, i) => [b.name, i]));
  for (const e of extra) { const g = e.geo.index ? e.geo : mergeV(e.geo); const nv = g.attributes.position.count;
    const ci = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { c.copy(e.color).multiplyScalar(0.96 + hash(i + 7) * 0.08); ci.set([c.r, c.g, c.b], i * 3); }
    const sI = new Uint16Array(nv * 4), sW = new Float32Array(nv * 4); const bi = bIdx.get(e.bone) ?? 0; for (let i = 0; i < nv; i++) { sI[i * 4] = bi; sW[i * 4] = 1; }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', g.attributes.position.clone()); gg.setAttribute('normal', g.attributes.normal.clone()); gg.setAttribute('color', new THREE.BufferAttribute(ci, 3)); gg.setAttribute('skinIndex', new THREE.BufferAttribute(sI, 4)); gg.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4)); gg.setIndex(g.index);
    gg.applyMatrix4(B.Wi); parts.push({ g: gg, name: 'Extra' }); }
  for (const p of parts) if (!p.g.attributes.uv) { const nv = p.g.attributes.position.count, uv = new Float32Array(nv * 2); for (let i = 0; i < nv; i++) { uv[i * 2] = WH[0]; uv[i * 2 + 1] = WH[1]; } p.g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  const geo = mergeParts(parts.map((p) => p.g));
  // scène : clone du mannequin sans ses maillages, un maillage « corps »
  const scene = cloneSkinned(B.scene); const olds = []; let host = null, skel = null;
  scene.traverse((o) => { if (o.isSkinnedMesh) { olds.push(o); if (o.name === 'Skin') { host = o.parent; skel = o.skeleton; } } });
  for (const o of olds) o.parent.remove(o);
  const mat = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 1.1, vertexColors: true, roughness: 0.84, metalness: 0, name: 'corps', side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.name = 'corps'; mesh.castShadow = true; mesh.receiveShadow = false;
  mesh.position.copy(skin.position); mesh.quaternion.copy(skin.quaternion); mesh.scale.copy(skin.scale); host.add(mesh); mesh.bind(skel, skin.bindMatrix);
  mesh.updateMatrixWorld(true); geo.computeBoundingSphere(); geo.boundingSphere.radius *= 1.7;
  scene.userData.bodyBox = L.box.clone();
  return scene;
}

// peint la texture du corps : chaque triangle est rempli dans ses UV, chaque pixel reçoit le point du corps correspondant
// (position, normale interpolées ; os du sommet le plus proche). paint(...) → false : peau (couleur des sommets).
// Les pixels hors du corps restent blancs (les pièces sans UV y lisent leur couleur de sommet), les bords sont étendus de 2 pixels.
const toSRGB = (l) => Math.round(255 * Math.min(1, Math.max(0, l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)));
function paintTexture(B, N, paint, skinCol) {
  const sg = B.meshes.Skin.geometry, uv = sg.attributes.uv, I = sg.index.array, pos = B.pos, wn = B.wn;
  const rgb = new Uint8Array(N * N * 4).fill(255), bump = new Uint8Array(N * N * 4).fill(128), done = new Uint8Array(N * N), out = { r: 0, g: 0, b: 0, s: 1, h: 0 };
  for (let t = 0; t < I.length; t += 3) { const A = I[t], Bv = I[t + 1], Cv = I[t + 2];
    const ax = uv.getX(A) * N - 0.5, ay = uv.getY(A) * N - 0.5, bx = uv.getX(Bv) * N - 0.5, by = uv.getY(Bv) * N - 0.5, cx = uv.getX(Cv) * N - 0.5, cy = uv.getY(Cv) * N - 0.5;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w2 = 1 - w0 - w1;
      if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue; const k = py * N + px; if (done[k]) continue; done[k] = 1;
      const P = (arr, j) => arr[A * 3 + j] * w0 + arr[Bv * 3 + j] * w1 + arr[Cv * 3 + j] * w2;
      const vi = w0 >= w1 && w0 >= w2 ? A : w1 >= w2 ? Bv : Cv; let nx = P(wn, 0), ny = P(wn, 1), nz = P(wn, 2); const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      let r, g, b, h = 0;
      if (paint(P(pos, 0), P(pos, 1), P(pos, 2), nx, ny, nz, vi, out)) { r = out.r; g = out.g; b = out.b; const s = out.s, lm = (r + g + b) / 3; h = out.h;
        if (lm < 0.05 && s !== 1) { const d = s < 1 ? (1 - s) * 0.075 : (s - 1) * 0.06; r += d; g += d; b += d * 1.05; } else { r *= s; g *= s; b *= s; }
        const gr = 1 + 0.035 * (hash(k) - 0.5); r *= gr; g *= gr; b *= gr; }
      else { r = P(skinCol, 0); g = P(skinCol, 1); b = P(skinCol, 2); }
      rgb[k * 4] = toSRGB(r); rgb[k * 4 + 1] = toSRGB(g); rgb[k * 4 + 2] = toSRGB(b); const hv = Math.round(128 + 110 * Math.max(-1, Math.min(1, h))); bump[k * 4] = bump[k * 4 + 1] = bump[k * 4 + 2] = hv; } }
  // bords étendus (pas de liseré blanc aux coutures d'UV ni dans les petits niveaux de mipmap)
  for (let it = 0; it < 2; it++) { const add = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = y * N + x; if (done[k]) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; const kk = yy * N + xx; if (done[kk]) { add.push([k, kk]); break; } } }
    for (const [k, kk] of add) { for (let j = 0; j < 4; j++) { rgb[k * 4 + j] = rgb[kk * 4 + j]; bump[k * 4 + j] = bump[kk * 4 + j]; } done[k] = 1; } }
  // coin blanc : la plus grande case vide d'une grille de 16
  const G = 16, cs = N / G; let white = [0.999, 0.999], best = -1;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) { let empty = true; for (let y = gy * cs; y < (gy + 1) * cs && empty; y++) for (let x = gx * cs; x < (gx + 1) * cs; x++) if (done[y * N + x]) { empty = false; break; }
    if (!empty) continue; let sc = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = gx + dx, yy = gy + dy; if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue; let e = true; for (let y = yy * cs; y < (yy + 1) * cs && e; y += 2) for (let x = xx * cs; x < (xx + 1) * cs; x += 2) if (done[y * N + x]) { e = false; break; } if (e) sc++; }
    if (sc > best) { best = sc; white = [(gx + 0.5) / G, (gy + 0.5) / G]; } }
  const mk = (data, srgb) => { const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true; return t; };
  return { map: mk(rgb, true), bump: mk(bump, false), white };
}

function mergeV(g) { return g; }
// petites pièces rigides des vêtements (repère du monde, pose de repos) ; z de la surface habillée estimé sur le corps
function frontZ(B, x, y, r = 0.02) { let z = -1e9; for (let i = 0; i < B.n; i++) if (B.part[i] === 'torso' && Math.abs(B.pos[i * 3] - x) < r && Math.abs(B.pos[i * 3 + 1] - y) < r) z = Math.max(z, B.pos[i * 3 + 2]); return z; }
function buckle(L, B) { const g = new THREE.BoxGeometry(0.045, 0.032, 0.008); g.translate(0, L.waist - 0.02, frontZ(B, 0, L.waist - 0.02) + 0.012); return g; }
function drawstring(L, B, sx, len) { const x = sx * 0.035, y0 = L.neck.y - 0.035, z = frontZ(B, x, y0) + 0.013; const g = new THREE.CylinderGeometry(0.0035, 0.0035, len, 5, 1); g.translate(0, -len / 2, 0); g.rotateX(-0.12); g.translate(x, y0, z);
  const tip = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 6); tip.translate(x, y0 - len - 0.005, z + len * 0.12); return mergeIndexedN([g, tip]); }
function zipPull(L, B, y) { const g = new THREE.BoxGeometry(0.012, 0.03, 0.004); g.translate(0, y - 0.015, frontZ(B, 0, y) + 0.016); return g; }
function button(L, B, y) { const g = new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 8); g.rotateX(Math.PI / 2); g.translate(0, y, frontZ(B, 0, y) + 0.0085); return g; }
function mergeIndexedN(list) { const g = mergeIndexed(list.map((x) => x.index ? x : x)); g.computeVertexNormals(); return g; }
function mergeParts(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Co = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4), I = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) { const n = g.attributes.position.count;
    for (const [arr, key, k] of [[P, 'position', 3], [N, 'normal', 3], [Co, 'color', 3], [UV, 'uv', 2], [SI, 'skinIndex', 4], [SW, 'skinWeight', 4]]) { const a = g.attributes[key]; for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) arr[(ov + i) * k + j] = a.getComponent(i, j); }
    if (g.index) for (let i = 0; i < g.index.count; i++) I[oi + i] = g.index.getX(i) + ov; else for (let i = 0; i < n; i++) I[oi + i] = i + ov;
    oi += g.index ? g.index.count : n; ov += n; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.BufferAttribute(Co, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4)); geo.setIndex(new THREE.BufferAttribute(I, 1));
  return geo;
}

// ---- accessoires rigides (repère du monde, pose de repos)
function brim(L) { // visière de casquette : demi-disque aplati, légèrement incurvé et incliné vers le bas
  const g = new THREE.CylinderGeometry(1, 1, 1, 18, 1, false, -Math.PI / 2, Math.PI); const p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const r = Math.hypot(v.x, v.z); v.set(v.x * L.headR * 0.95, v.y * 0.007 - r * r * 0.012, v.z * 0.075); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); g.rotateX(0.16); g.translate(0, L.eyeY + 0.04, L.front - 0.03); return g;
}
// coque de tête paramétrée : ellipsoïde autour du crâne, bord bas qui dépend de l'angle autour de la tête (edge(φ) → y local entre -1 et 1),
// bande éventuelle [e0, e1] en angle depuis le sommet ; double face (la matière du perso est en DoubleSide)
function headShell(L, { pad = [0.03, 0.03, 0.03, 0.03], edge, phi = [-Math.PI, Math.PI], e0 = 0, seg = [36, 14], peak = 0 }) {
  const cx = 0, cy = (L.eyeY + L.top) / 2 - 0.005, cz = (L.front + L.back) / 2 - 0.005, rx = L.headR + pad[0], ry = L.top - cy + pad[1], rzf = L.front - cz + pad[2], rzb = cz - L.back + pad[3];
  const pos = [], idx = [], [nu, nv] = seg;
  // sous l'équateur (ey < 0), la coque descend tout droit (en se resserrant un peu) au lieu de se refermer : capuche jusqu'aux épaules, couvre-nuque
  for (let u = 0; u <= nu; u++) { const f = phi[0] + (phi[1] - phi[0]) * u / nu, ey = Math.min(0.999, edge(f)), t1 = ey >= 0 ? Math.acos(ey) : Math.PI / 2 + (-ey);
    for (let v = 0; v <= nv; v++) { const t = e0 + (t1 - e0) * v / nv, tt = Math.min(t, Math.PI / 2), drop = Math.max(0, t - Math.PI / 2), sx = Math.sin(tt) * Math.sin(f), sy = Math.cos(tt) - drop, sz = Math.sin(tt) * Math.cos(f);
      const back = sz < 0, k = (1 + peak * Math.max(0, -sz) * Math.max(0, sy)) * (1 - 0.12 * Math.min(1, drop)); pos.push(cx + sx * rx * k, cy + sy * ry, cz + sz * (back ? rzb : rzf) * k); } }
  for (let u = 0; u < nu; u++) for (let v = 0; v < nv; v++) { const a = u * (nv + 1) + v, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const yl = (L, y) => (y - ((L.eyeY + L.top) / 2 - 0.005)) / (L.top - ((L.eyeY + L.top) / 2 - 0.005) + 0.03);
function helmetShell(L) { // casque : couvre le crâne jusqu'aux sourcils devant, sous les oreilles sur les côtés, la nuque derrière
  const brow = yl(L, L.eyeY + 0.035), ear = yl(L, L.eyeY - 0.045), nape = yl(L, L.eyeY - 0.09);
  return headShell(L, { pad: [0.03, 0.035, 0.025, 0.035], edge: (f) => { const a = Math.abs(f); return a < 0.9 ? brow + (ear - brow) * sstep(0.45, 0.9, a) : ear + (nape - ear) * sstep(1.6, 2.6, a); } });
}
function visorShell(L) { // visière relevée : posée sur le haut du casque, devant
  return headShell(L, { pad: [0.045, 0.05, 0.04, 0.045], phi: [-1.25, 1.25], e0: 0.3, edge: () => Math.cos(1.2), seg: [22, 6] });
}
function hoodShell(L) { // capuche relevée : ouverte sur le visage (front → menton), descend sur la nuque et les épaules derrière
  const fore = yl(L, L.eyeY + 0.055), chin = yl(L, L.eyeY - 0.17), back = yl(L, L.eyeY - 0.3);
  return headShell(L, { pad: [0.04, 0.035, 0.03, 0.06], peak: 0.16, seg: [40, 16], edge: (f) => { const a = Math.abs(f); return a < 0.75 ? fore + (chin - fore) * sstep(0.2, 0.75, a) : chin + (back - chin) * sstep(1.2, 2.4, a); } });
}
function chinStrap(L) { const g = new THREE.TorusGeometry(L.headR * 0.92, 0.006, 4, 20, Math.PI); g.rotateZ(Math.PI); g.rotateY(Math.PI / 2); g.rotateX(0.35); g.translate(0, L.eyeY - 0.035, L.headC.z - 0.01); return g; }
function goggles(L, which) {
  const w = (L.eyeX + 0.03) * 2, h = 0.048, z = L.eyeZ + 0.012;
  if (which === 'lens') { const g = new THREE.BoxGeometry(w - 0.012, h - 0.012, 0.006, 6, 2, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - p.getX(i) * p.getX(i) * 1.6); g.computeVertexNormals(); g.translate(0, L.eyeY + 0.006, z + 0.016); return g; }
  const g = new THREE.BoxGeometry(w, h, 0.03, 6, 2, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - p.getX(i) * p.getX(i) * 1.6); g.computeVertexNormals(); g.translate(0, L.eyeY + 0.006, z); return g;
}
function filter(L, sx) { const g = new THREE.CylinderGeometry(0.028, 0.03, 0.035, 12); g.rotateX(Math.PI / 2); g.rotateY(sx * 0.6); g.translate(sx * 0.05, L.eyeY - 0.085, L.front + 0.002); return g; }
function backpack(L, B) { // sac : boîte arrondie dans le dos, à hauteur des omoplates
  let zb = 1e9; for (let i = 0; i < B.n; i++) if (B.part[i] === 'torso' && Math.abs(B.pos[i * 3]) < 0.08 && Math.abs(B.pos[i * 3 + 1] - (L.chest.y - 0.05)) < 0.05) zb = Math.min(zb, B.pos[i * 3 + 2]);
  const g = new THREE.BoxGeometry(0.26, 0.32, 0.1, 3, 4, 2); const p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const r = 0.04, bx = 0.13 - r, by = 0.16 - r, bz = 0.05 - r; const q = V(Math.max(-bx, Math.min(bx, v.x)), Math.max(-by, Math.min(by, v.y)), Math.max(-bz, Math.min(bz, v.z))); const d = v.clone().sub(q); if (d.length() > 1e-6) d.setLength(r); v.copy(q).add(d); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); g.translate(0, L.chest.y - 0.1, zb - (B.backOff || 0.03) - 0.045); return g;
}
function pouch(L) { const g = new THREE.CapsuleGeometry(0.04, 0.13, 3, 8); g.rotateZ(Math.PI / 2 - 0.65); g.translate(-0.06, L.chest.y - 0.12, L.front * 0 + 0.17); return g; }
function mergeIndexed(list) { let nv = 0; const pos = [], idx = []; for (const g of list) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); const I = g.index; for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + nv); nv += p.count; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g; }

// ---------------------------------------------------------------- inscription dans le jeu
// chars[id] = { scene, clips, k, minY, def } comme les persos chargés en GLB : makeCharacter n'y voit aucune différence
export function registerSkin(chars, def, clips, H = 1.8, opts) {
  const scene = buildSkinScene(def, opts); const box = scene.userData.bodyBox, k = H / (box.max.y - box.min.y);
  chars[def.id] = { scene, clips, k, minY: box.min.y, def, noTint: true };
  return chars[def.id];
}
export function skinLabel(id) { const s = skinById(id); return s ? s.name : id; }
