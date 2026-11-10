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
  return bases;
}
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PART = (n) => n === 'Head' ? 'head' : n === 'Neck' ? 'neck' : /^(UpperArm|LowerArm)/.test(n) ? 'arm' : /^(Wrist|Index|Middle|Ring|Pinky|Thumb|index_|middle_|ring_|pinky_|thumb_)/.test(n) ? 'hand'
  : /^(UpperLeg|LowerLeg)/.test(n) ? 'leg' : /^(Foot|Toe|ball_)/.test(n) ? 'foot' : 'torso';
function prepBase(g) {
  const scene = g.scene; scene.updateMatrixWorld(true);
  const meshes = {}; scene.traverse((o) => { if (o.isSkinnedMesh) meshes[o.name] = o; });
  const skin = meshes.Skin, skel = skin.skeleton, W = skin.matrixWorld.clone(), Wi = W.clone().invert(), NW = new THREE.Matrix3().getNormalMatrix(W);
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
  for (let it = 0; it < 24; it++) { const f = it % 2 ? -0.53 : 0.5; for (let g = 0; g < ng; g++) { if (!free[g] || !nbl[g].length) { T.set(S.subarray(g * 3, g * 3 + 3), g * 3); continue; } let x = 0, y = 0, z = 0; for (const h of nbl[g]) { x += S[h * 3]; y += S[h * 3 + 1]; z += S[h * 3 + 2]; } const m = nbl[g].length; T[g * 3] = S[g * 3] + f * (x / m - S[g * 3]); T[g * 3 + 1] = S[g * 3 + 1] + f * (y / m - S[g * 3 + 1]); T[g * 3 + 2] = S[g * 3 + 2] + f * (z / m - S[g * 3 + 2]); } S.set(T); }
  const smooth = new Float32Array(n * 3); for (let i = 0; i < n; i++) smooth.set(S.subarray(wid[i] * 3, wid[i] * 3 + 3), i * 3);
  // enveloppe : par tranches (bras le long de x, jambes et buste le long de y), chaque sommet est poussé jusqu'à l'enveloppe convexe de sa tranche ;
  // le tissu ponte les creux (entre les pectoraux, la colonne, les muscles des cuisses et des bras) comme un vrai vêtement
  const hull = smooth.slice(), crotch = L.hips.y - 0.07;
  const groups = { torso: [], armL: [], armR: [], legL: [], legR: [] };
  for (let i = 0; i < n; i++) { const q = part[i], x = pos[i * 3], y = pos[i * 3 + 1];
    if (q === 'arm' || (q === 'torso' && /^Shoulder/.test(boneName[i]) && Math.abs(x) > L.sh.x)) groups[x > 0 ? 'armL' : 'armR'].push(i);
    else if (q === 'torso' || q === 'neck' || q === 'leg') groups[y > crotch + 0.04 ? 'torso' : x > 0 ? 'legL' : 'legR'].push(i); }
  const NB = 32, TW = Math.PI * 2;
  for (const [gname, list] of Object.entries(groups)) { if (!list.length) continue; const arm = gname.startsWith('arm');
    // coordonnées : a = axe (|x| pour les bras, y sinon) ; plan (u, w) perpendiculaire
    const A = (i) => arm ? Math.abs(smooth[i * 3]) : smooth[i * 3 + 1], U = (i) => arm ? smooth[i * 3 + 1] : smooth[i * 3], Wc = (i) => smooth[i * 3 + 2];
    let a0 = 1e9, a1 = -1e9; for (const i of list) { a0 = Math.min(a0, A(i)); a1 = Math.max(a1, A(i)); }
    const step = 0.02, ns = Math.max(1, Math.ceil((a1 - a0) / step)), cu = new Float32Array(ns), cw = new Float32Array(ns), cn = new Float32Array(ns);
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
    const WIN = gname === 'torso' ? 3 : 5, DEC = gname === 'torso' ? 0.985 : 0.975;
    const H2 = H.slice(); for (let k = 0; k < ns; k++) for (let b = 0; b < NB; b++) { let m = H[k * NB + b]; for (let d = 1; d <= WIN; d++) for (const kk of [k - d, k + d]) if (kk >= 0 && kk < ns) m = Math.max(m, H[kk * NB + b] * Math.pow(DEC, d)); H2[k * NB + b] = m; }
    { const t = H2.slice(); for (let k = 0; k < ns; k++) for (let b = 0; b < NB; b++) { let a = 0, m = 0; for (let d = -1; d <= 1; d++) { const kk = k + d; if (kk < 0 || kk >= ns) continue; for (let e = -1; e <= 1; e++) { a += t[kk * NB + (b + e + NB) % NB]; m++; } } H2[k * NB + b] = Math.max(t[k * NB + b] * 0.985, a / m); } }
    // interpolation entre tranches (centre et rayon) et entre secteurs : pas de marches
    for (const i of list) { const ts = Math.max(0, Math.min(ns - 1, (A(i) - a0) / step - 0.5)), k0 = Math.floor(ts), k1 = Math.min(ns - 1, k0 + 1), fs = ts - k0;
      const ccu = cu[k0] * (1 - fs) + cu[k1] * fs, ccw = cw[k0] * (1 - fs) + cw[k1] * fs, du0 = U(i) - ccu, dw0 = Wc(i) - ccw, r = Math.hypot(du0, dw0); if (r < 1e-4) continue;
      const t = (Math.atan2(dw0, du0) + Math.PI) / TW * NB - 0.5, b0 = ((Math.floor(t) % NB) + NB) % NB, b1 = (b0 + 1) % NB, f = t - Math.floor(t);
      const Rk = (k) => H2[k * NB + b0] * (1 - f) + H2[k * NB + b1] * f, Rh = Rk(k0) * (1 - fs) + Rk(k1) * fs;
      if (Rh <= r) continue; const sc = Rh / r, du = du0 * sc, dw = dw0 * sc;
      if (arm) { hull[i * 3 + 1] = ccu + du; hull[i * 3 + 2] = ccw + dw; } else { hull[i * 3] = ccu + du; hull[i * 3 + 2] = ccw + dw; } } }
  // poids de peau lissés (pour le tissu) : un sommet poussé loin de l'os amplifie les écarts de poids entre voisins, d'où des pointes en mouvement
  let gw = Array.from({ length: ng }, () => new Map());
  for (let i = 0; i < n; i++) { const m = gw[wid[i]]; if (m.size) continue; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) m.set(si.getComponent(i, k), (m.get(si.getComponent(i, k)) || 0) + w); } }
  for (let it = 0; it < 8; it++) { const nx = gw.map((m, g) => { if (!free[g] || !nbl[g].length) return m; const r = new Map(); for (const [b, w] of m) r.set(b, w * 0.5); const k = 0.5 / nbl[g].length; for (const h of nbl[g]) for (const [b, w] of gw[h]) r.set(b, (r.get(b) || 0) + w * k); return r; }); gw = nx; }
  const sIdx = new Uint16Array(n * 4), sWt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const top = [...gw[wid[i]]].sort((a, b) => b[1] - a[1]).slice(0, 4), tot = top.reduce((t, x) => t + x[1], 0) || 1; top.forEach(([b, w], k) => { sIdx[i * 4 + k] = b; sWt[i * 4 + k] = w / tot; }); }
  return { scene, meshes, skel, W, Wi, pos, wn, part, boneName, L, n, wid, ng, smooth, hull, sIdx, sWt };
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
export function buildSkinScene(def) {
  const B = bases[def.body === 'F' ? 'F' : 'M']; if (!B) throw new Error('mannequins non chargés');
  const { pos, wn, part, boneName, L, n } = B, skin = B.meshes.Skin, sg = skin.geometry;
  const off = new Float32Array(n), col = new Float32Array(n * 3), tag = new Array(n).fill('Skin'), loose = new Float32Array(n), wr = new Float32Array(n);
  // peau : la texture du pack, recolorée vers la carnation choisie
  const tone = C(def.peau || '#e2b597'), k = [tone.r / L.skinAvg.r, tone.g / L.skinAvg.g, tone.b / L.skinAvg.b];
  for (let i = 0; i < n; i++) { col[i * 3] = Math.min(1, sg.attributes.color.getX(i) * k[0]); col[i * 3 + 1] = Math.min(1, sg.attributes.color.getY(i) * k[1]); col[i * 3 + 2] = Math.min(1, sg.attributes.color.getZ(i) * k[2]); }
  const c = new THREE.Color();
  // pose une couche : épaisseur (au moins un peu au-dessus de la couche précédente) et couleur
  // lâche : 0 = moulant, 1 = passe complètement par-dessus les muscles ; plis : amplitude des plis (bruit)
  let LOOSE = 0.6, WRINKLE = 0.004;
  const lay = (i, o, color, t, shade = 1) => { off[i] = Math.max(o, off[i] > 0 ? off[i] + 0.0025 : o); loose[i] = Math.max(loose[i], LOOSE); wr[i] = WRINKLE; c.copy(color).multiplyScalar(shade * (0.97 + hash(i) * 0.06)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; tag[i] = t; };
  const X = (i) => pos[i * 3], Y = (i) => pos[i * 3 + 1], Z = (i) => pos[i * 3 + 2], NX = (i) => wn[i * 3], NY = (i) => wn[i * 3 + 1], NZ = (i) => wn[i * 3 + 2];
  const armA = (i) => (Math.abs(X(i)) - L.sh.x) / (L.wrist.x - L.sh.x); // 0 à l'épaule, 1 au poignet (bras en T au repos)
  const isArm = (i) => part[i] === 'arm' || (part[i] === 'torso' && /^Shoulder/.test(boneName[i]) && Math.abs(X(i)) > L.sh.x);
  const extra = []; // accessoires rigides : { geo (monde), bone, color }
  const hairClip = { y: Infinity, all: false }; // coiffure : coupée au-dessus de cette hauteur (casquette, bonnet), ou cachée
  let browsHidden = false, beardHidden = false;
  const faceOpen = (i) => NZ(i) > 0.2 && Z(i) > L.headC.z + 0.02 && Y(i) < L.eyeY + 0.045 && Y(i) > L.eyeY - 0.16 && Math.abs(X(i)) < L.headR * 0.85;

  const visage = piece(def, 'visage');
  // ---- bas
  const bas = piece(def, 'bas');
  if (bas.id !== 'aucun') {
    LOOSE = /jean/.test(bas.id) ? 0.9 : 1; WRINKLE = bas.id === 'jogging' ? 0.008 : bas.id === 'cargo' ? 0.006 : 0.004;
    const base = C(bas.c), dark = /uniforme|cargo/.test(bas.id), baggy = bas.id === 'jogging' ? 0.022 : bas.id === 'cargo' ? 0.02 : bas.id === 'uniforme' ? 0.017 : 0.013;
    for (let i = 0; i < n; i++) {
      const p = part[i], y = Y(i);
      const legs = p === 'leg' && y > L.ankle.y + (bas.id === 'jogging' ? 0.035 : 0.025), hip = (p === 'torso') && y < L.waist && !isArm(i);
      if (!legs && !hip) continue;
      let o = baggy, s = 1;
      if (/jean/.test(bas.id)) { // délavé sur le devant des cuisses et aux genoux, coutures plus sombres, ourlet
        if (NZ(i) > 0.2) s += 0.16 * gauss((y - (L.knee.y + 0.22)) / 0.13) * NZ(i) + 0.1 * gauss((y - L.knee.y) / 0.05) * NZ(i);
        if (Math.abs(NX(i)) > 0.88) s *= 0.82; if (y < L.ankle.y + 0.06) s *= 0.85; if (hip && y > L.waist - 0.035) { s *= 0.8; o += 0.003; }
        o += 0.003 * sstep(L.knee.y, L.ankle.y, y); // léger évasement en bas
      }
      if (bas.id === 'jogging') { if (y < L.ankle.y + 0.09) { o = 0.006; s *= 0.85; } if (hip && y > L.waist - 0.04) { s *= 0.88; o += 0.002; } }
      if (bas.id === 'cargo' || bas.id === 'uniforme') { // poches de cuisse sur le côté
        const side = Math.sign(X(i)) * NX(i), pk = legs ? sstep(0.35, 0.7, side) * sstep(L.knee.y + 0.08, L.knee.y + 0.13, y) * sstep(L.knee.y + 0.32, L.knee.y + 0.27, y) : 0; if (pk > 0) { o += 0.012 * pk; s *= 1 - 0.12 * pk; }
        if (legs && Math.abs(y - L.knee.y) < 0.012 && NZ(i) > 0.3) s *= 0.8; // couture du genou
      }
      lay(i, o, base, 'Bas', s);
      if (bas.c2 && (bas.id === 'jogging' || bas.id === 'uniforme') && (legs || hip) && Math.sign(X(i)) * NX(i) > 0.93 && Math.abs(Z(i) - (legs ? L.knee.z : L.hips.z)) < 0.03 && y > L.ankle.y + 0.1) { c.set(bas.c2); col.set([c.r, c.g, c.b], i * 3); }
      if (dark && hip && y > L.waist - 0.03) lay(i, off[i], C('#121316'), 'Bas'); // ceinture
    }
  }
  // ---- chaussures
  const pieds = piece(def, 'pieds');
  if (pieds.id !== 'aucun') {
    LOOSE = 1; WRINKLE = 0.001;
    const hi = pieds.id === 'rangers' ? 0.17 : pieds.id === 'montantes' ? 0.09 : 0.035, base = C(pieds.c), sole = C(pieds.c2 || '#ddd');
    for (let i = 0; i < n; i++) { const p = part[i], y = Y(i); if (!(p === 'foot' || (p === 'leg' && y < L.ankle.y + hi))) continue;
      const o = pieds.id === 'rangers' ? 0.018 : 0.017; let s = 1;
      if (y < 0.032) { lay(i, o + 0.008 + 0.006 * sstep(0.032, 0.0, y), sole, 'Pieds', y < 0.012 ? 0.8 : 1); continue; }
      if (NZ(i) > 0.5 && Math.abs(X(i) - Math.sign(X(i)) * Math.abs(L.ankle.x)) < 0.02 && y > 0.05) s = pieds.id === 'rangers' ? 0.7 : 0.92; // laçage
      if (pieds.id === 'montantes' && y > L.ankle.y + 0.06) s *= 0.95;
      lay(i, o, base, 'Pieds', s); }
  }
  // ---- haut
  const haut = piece(def, 'haut'), hautC = haut.c ? C(haut.c) : null;
  if (haut.id !== 'aucun') {
    LOOSE = haut.id === 'tshirt' ? 0.75 : 1; WRINKLE = { doudoune: 0.003, kway: 0.009, sweat: 0.007, sweat_zip: 0.007, veste_mo: 0.005 }[haut.id] ?? 0.004;
    const long = haut.id !== 'tshirt', bulk = { tshirt: 0.009, sweat: 0.024, sweat_zip: 0.022, doudoune: 0.042, kway: 0.024, polo: 0.011, veste_mo: 0.028 }[haut.id] ?? 0.018;
    const bottom = haut.id === 'tshirt' || haut.id === 'polo' ? L.hips.y - 0.03 : haut.id === 'doudoune' ? L.hips.y - 0.02 : L.hips.y - 0.07;
    const collar = haut.id === 'doudoune' || haut.id === 'veste_mo' ? 0.065 : haut.id === 'kway' ? 0.05 : 0.0;
    const hoodDown = haut.hood && piece(def, 'tete').id !== 'capuche';
    for (let i = 0; i < n; i++) {
      const p = part[i], y = Y(i); let cover = false, o = bulk, s = 1, t = 'Haut';
      if (p === 'torso' && !isArm(i)) cover = y > bottom;
      else if (isArm(i)) { const a = armA(i); cover = long ? a < 0.985 : a < 0.36; if (long && a > 0.9) { o = Math.min(bulk, 0.008); s = 0.86; } if (!long && a > 0.3) s = 0.9; if (haut.id === 'polo' && a > 0.93) s = 0.85; }
      else if (p === 'neck') { cover = y < L.neck.y + collar - 0.01 || (NZ(i) < -0.2 && y < L.neck.y + 0.03 + collar); if (collar) o = bulk * 0.8; }
      else if (p === 'hand') cover = false;
      if (!cover) continue;
      if (p === 'torso' && y < bottom + 0.05 && !isArm(i) && long && haut.id !== 'polo') { s *= 0.86; o = Math.max(0.006, o - 0.004); } // bande élastique du bas
      if (haut.id === 'doudoune') { const q = Math.abs(Math.sin((y - L.hips.y) * Math.PI / 0.075)); o += 0.009 * q; s *= 0.78 + 0.22 * q; if (isArm(i)) { const qa = Math.abs(Math.sin(armA(i) * Math.PI * 4)); o += 0.005 * qa; s *= 0.85 + 0.15 * qa; } }
      if ((haut.id === 'sweat' || haut.id === 'sweat_zip') && p === 'torso' && !isArm(i) && NZ(i) > 0.3 && Math.abs(X(i)) < 0.12 && y > L.hips.y + 0.02 && y < L.hips.y + 0.16) { o += 0.004; if (Math.abs(Math.abs(X(i)) - 0.12) < 0.012 || Math.abs(y - (L.hips.y + 0.16)) < 0.01) s *= 0.78; } // poche kangourou
      if (haut.id === 'polo' && p === 'torso' && NY(i) > 0.55 && Math.abs(X(i)) > 0.07) { o += 0.003; if (haut.c2) { lay(i, o, C(haut.c2), t); continue; } } // épaules renforcées
      if (haut.id === 'polo' && p === 'torso' && NZ(i) > 0.4 && Math.abs(Math.abs(X(i)) - 0.085) < 0.04 && Math.abs(y - (L.chest.y + 0.02)) < 0.05) { o += 0.004; s *= 0.9; } // poches de poitrine
      if (haut.id === 'veste_mo' && (p === 'torso' || isArm(i)) && haut.c2) { const sh = isArm(i) && armA(i) < 0.25 && NY(i) > -0.3, el = isArm(i) && Math.abs(armA(i) - 0.5) < 0.09; if (sh || el) { lay(i, o + 0.012, C(haut.c2), t); continue; } }
      const zip = (haut.id === 'sweat_zip' || haut.id === 'kway' || haut.id === 'doudoune') && p !== 'neck' && !isArm(i) && NZ(i) > 0.6 && Math.abs(X(i)) < 0.007;
      if (zip) { lay(i, o + 0.002, haut.c2 ? C(haut.c2) : hautC.clone().multiplyScalar(0.6), t); continue; }
      if (hoodDown) { // capuche baissée : bourrelet dans le dos, sous la nuque
        const back = sstep(-0.1, -0.6, NZ(i)), d = (y - (L.neck.y - 0.03)) / 0.07; if (back > 0 && (p === 'torso' || p === 'neck')) { o += 0.055 * back * gauss(d) * sstep(0.17, 0.06, Math.abs(X(i))); s *= 1 - 0.12 * back * gauss(d * 1.6); } }
      lay(i, o, hautC, t, s);
    }
  }
  // ---- gilet
  const gilet = piece(def, 'gilet');
  if (gilet.id !== 'aucun') {
    LOOSE = 1; WRINKLE = gilet.id === 'fluo' ? 0.004 : 0.001;
    const base = C(gilet.c), c2 = C(gilet.c2 || gilet.c), fluo = gilet.id === 'fluo';
    for (let i = 0; i < n; i++) {
      const p = part[i], y = Y(i); if (p !== 'torso' && !(gilet.id === 'tactique' && isArm(i))) continue;
      if (isArm(i)) { const a = armA(i); if (gilet.id === 'tactique' && a < 0.3 && NY(i) > -0.35) lay(i, off[i] + 0.016, c2, 'Gilet', 0.95 + 0.1 * Math.abs(Math.sin(a * 18))); continue; } // épaulières
      const lo = L.waist + (fluo ? -0.02 : 0.015), shoulder = y > L.chest.y + 0.09;
      if (y < lo) continue; if (shoulder && (Math.abs(Math.abs(X(i)) - 0.1) > 0.035 || NY(i) < -0.2)) continue; // bretelles sur les épaules
      let o = fluo ? off[i] + 0.004 : Math.max(off[i] + 0.012, 0.028), s = 1, cc = base;
      if (!fluo) {
        const fr = NZ(i) > 0.35, bk = NZ(i) < -0.35;
        if ((fr || bk) && Math.abs(X(i)) < 0.13 && y > lo + 0.08 && y < L.chest.y + 0.08) o += 0.006; // plaques
        if (fr && Math.abs(X(i)) < 0.17 && y < lo + 0.11) { o += 0.012; cc = c2; const cell = Math.abs(((X(i) + 0.17) / 0.113) % 1 - 0.5); if (cell > 0.43) s = 0.75; } // poches porte-chargeurs
        if (Math.abs(NX(i)) > 0.8) s *= 0.85; // flancs (sangles)
      } else if (Math.abs(y - (lo + 0.07)) < 0.016 || Math.abs(y - (lo + 0.2)) < 0.016) cc = c2; // bandes réfléchissantes
      lay(i, o, cc, 'Gilet', s);
    }
  }
  // ---- mains
  const mains = piece(def, 'mains');
  if (mains.id !== 'aucun') { LOOSE = 0; WRINKLE = 0.001; const base = C(mains.c), c2 = C(mains.c2 || mains.c);
    for (let i = 0; i < n; i++) { const p = part[i]; if (!(p === 'hand' || (isArm(i) && armA(i) > 0.96))) continue; let o = mains.id === 'gants_coques' ? 0.005 : 0.0035, cc = base;
      if (mains.id === 'gants_coques' && /^(Wrist|Index1|Middle1|Ring1|Pinky1)/.test(boneName[i]) && NY(i) > 0.4) { o += 0.004; cc = c2; } // coques des jointures (dos de la main vers le haut au repos)
      lay(i, o, cc, 'Mains'); } }
  // ---- tête
  LOOSE = 0; WRINKLE = 0.001;
  const tete = piece(def, 'tete');
  const capLine = (i) => L.eyeY + 0.042 - 0.07 * sstep(L.headC.z + 0.02, L.back + 0.01, Z(i)); // bord : au-dessus des sourcils devant, plus bas derrière
  if (tete.id === 'casquette' || tete.id === 'bonnet') {
    const base = C(tete.c), bonnet = tete.id === 'bonnet';
    for (let i = 0; i < n; i++) { if (part[i] !== 'head') continue; const line = capLine(i) + (bonnet ? 0.004 : 0); if (Y(i) < line) continue;
      let o = bonnet ? 0.017 : 0.011, s = 1; if (bonnet && Y(i) < line + 0.035) { o += 0.006; s = 0.9 + 0.1 * Math.abs(Math.sin(Math.atan2(X(i), Z(i) - L.headC.z) * 22)); } // revers côtelé
      if (!bonnet && Math.abs(X(i)) < 0.006) s = 0.85; // couture du dessus
      lay(i, o, base, 'Tete', s); }
    hairClip.y = L.eyeY + 0.03;
    if (!bonnet) extra.push({ geo: brim(L), bone: 'Head', color: base.clone().multiplyScalar(0.95) });
    if (bonnet) browsHidden = false;
  }
  const hoodColor = tete.c ? C(tete.c) : hautC || C('#18181b');
  if (tete.id === 'capuche' || tete.id === 'casque') {
    const casque = tete.id === 'casque', base = casque ? C(tete.c) : hoodColor;
    // capuche : le cou est pris dans le tissu ; la capuche elle-même est une coque accrochée à la tête, ouverte sur le visage
    if (!casque) for (let i = 0; i < n; i++) if (part[i] === 'neck' || (part[i] === 'head' && Y(i) < L.eyeY - 0.1 && NZ(i) < 0.3)) lay(i, 0.012, base, 'Tete', 0.92);
    extra.push({ geo: casque ? helmetShell(L) : hoodShell(L), bone: 'Head', color: base });
    hairClip.all = true; browsHidden = false;
    if (casque) { extra.push({ geo: visorShell(L), bone: 'Head', color: C(tete.c2 || '#8a9bb0') }); extra.push({ geo: chinStrap(L), bone: 'Head', color: C('#101114') }); }
  }
  if (visage.id === 'cagoule') {
    const base = C(visage.c);
    for (let i = 0; i < n; i++) { const p = part[i]; if (p !== 'head' && p !== 'neck') continue;
      const eyeHole = NZ(i) > 0.35 && Math.abs(Y(i) - L.eyeY) < 0.021 && Math.abs(X(i)) < L.eyeX + 0.02 && Z(i) > L.headC.z;
      if (eyeHole) continue; lay(i, 0.006, base, 'Tete', p === 'neck' ? 0.95 : 1); }
    hairClip.all = true; browsHidden = true; beardHidden = true;
  }
  // ---- visage
  if (visage.id !== 'aucun' && visage.id !== 'cagoule') {
    const base = C(visage.c);
    if (visage.id === 'foulard' || visage.id === 'cache_cou' || visage.id === 'masque') {
      const noseY = L.eyeY - 0.038, mask = visage.id === 'masque';
      for (let i = 0; i < n; i++) { const p = part[i], y = Y(i);
        let cover = false; if (p === 'head') cover = y < noseY - (mask ? 0 : 0.004) && (mask ? NZ(i) > 0.15 && Math.abs(X(i)) < 0.07 : NZ(i) > -0.25 || visage.id === 'cache_cou') && y > (mask ? L.eyeY - 0.14 : -1);
        else if (p === 'neck') cover = !mask; else if (p === 'torso' && visage.id === 'foulard') cover = NZ(i) > 0.3 && y > L.neck.y - 0.07 && Math.abs(X(i)) < 0.085 - (L.neck.y - y) * 0.9; // pointe du foulard sur la poitrine
        if (!cover) continue; if (tag[i] === 'Tete' && p === 'head') continue;
        let o = mask ? 0.008 : 0.012, s = 1; if (visage.id === 'cache_cou') s = 0.9 + 0.1 * Math.abs(Math.sin(y * 160)); if (visage.id === 'foulard' && p === 'head') o += 0.004 * sstep(noseY - 0.03, noseY, y);
        lay(i, o, base, 'Visage', s); }
      beardHidden = true;
    }
    if (visage.id === 'lunettes') {
      for (let i = 0; i < n; i++) { if (part[i] !== 'head' || tag[i] === 'Tete') continue; if (Math.abs(Y(i) - (L.eyeY + 0.006)) < 0.011 && !(NZ(i) > 0.3 && Z(i) > L.headC.z + 0.02)) lay(i, 0.005, base, 'Visage'); } // sangle
      extra.push({ geo: goggles(L, 'frame'), bone: 'Head', color: base }); extra.push({ geo: goggles(L, 'lens'), bone: 'Head', color: C(visage.c2 || '#8fa6b8') });
    }
    if (visage.id === 'masque_gaz') {
      for (let i = 0; i < n; i++) { if (part[i] !== 'head' || tag[i] === 'Tete') continue; const y = Y(i); if (y < L.eyeY + 0.035 && y > L.eyeY - 0.15 && NZ(i) > 0.15 && Math.abs(X(i)) < L.headR * 0.95) lay(i, Math.abs(Y(i) - L.eyeY) < 0.02 && NZ(i) > 0.5 && Math.abs(X(i)) < L.eyeX + 0.015 ? 0.016 : 0.022, Math.abs(Y(i) - L.eyeY) < 0.02 && NZ(i) > 0.5 && Math.abs(X(i)) < L.eyeX + 0.015 ? C('#55697a') : base, 'Visage'); }
      for (const sx of [-1, 1]) extra.push({ geo: filter(L, sx), bone: 'Head', color: C(visage.c2 || '#3a3d42') });
      browsHidden = true; beardHidden = true;
    }
  }
  // ---- accessoires
  LOOSE = 1; WRINKLE = 0.001;
  const ex = new Set(def.extras || []);
  const exC = (id) => C((def.extraColors && def.extraColors[id]) || EXTRAS.find((e) => e.id === id).c || '#222');
  for (let i = 0; i < n; i++) { const p = part[i], y = Y(i);
    if (ex.has('genouilleres') && p === 'leg' && Math.abs(y - L.knee.y) < 0.06 && NZ(i) > -0.05) lay(i, off[i] + 0.016, exC('genouilleres'), 'Extra', Math.abs(y - L.knee.y) > 0.05 ? 0.8 : 1);
    if (ex.has('jambieres') && p === 'leg' && y > L.ankle.y + 0.07 && y < L.knee.y + 0.05 && NZ(i) > -0.15) lay(i, off[i] + 0.016, exC('jambieres'), 'Extra', Math.abs(y - L.knee.y) < 0.03 ? 1.15 : 1);
    if (ex.has('coudieres') && isArm(i) && Math.abs(armA(i) - 0.5) < 0.08 && NZ(i) < 0.2) lay(i, off[i] + 0.012, exC('coudieres'), 'Extra');
    if (ex.has('sac') && p === 'torso' && !isArm(i) && NZ(i) > 0.1 && Math.abs(Math.abs(X(i)) - 0.095) < 0.018 && y > L.chest.y - 0.12) lay(i, off[i] + 0.004, exC('sac'), 'Extra', 0.9); // bretelles
    if (ex.has('banane') && p === 'torso' && !isArm(i) && Math.abs(y - (L.chest.y + 0.02 - (X(i) + 0.15) * 0.75)) < 0.018 && NZ(i) > -0.2) lay(i, off[i] + 0.004, exC('banane'), 'Extra', 0.85); // sangle en bandoulière
  }
  if (ex.has('sac')) { let bo = 0; for (let i = 0; i < n; i++) if (part[i] === 'torso' && NZ(i) < -0.7 && Math.abs(X(i)) < 0.08 && Math.abs(Y(i) - (L.chest.y - 0.05)) < 0.06) bo = Math.max(bo, off[i]); B.backOff = bo + 0.012; extra.push({ geo: backpack(L, B), bone: 'Chest', color: exC('sac') }); }
  if (ex.has('banane')) extra.push({ geo: pouch(L), bone: 'Chest', color: exC('banane') });

  // ---- assemblage : corps déformé + yeux + sourcils + coiffure + accessoires, un seul maillage indexé
  const parts = [];
  { const g = new THREE.BufferGeometry(), N = sg.attributes.normal, P3 = new Float32Array(n * 3), v = V(), nn = V();
    // lâche et plis sont lissés sur les sommets soudés (sinon marches aux coutures), puis : position = corps → corps lissé, + épaisseur le long de la normale, + plis
    const gl = new Float32Array(B.ng), go = new Float32Array(B.ng), gw = new Float32Array(B.ng), gc = new Float32Array(B.ng); for (let i = 0; i < n; i++) { const g = B.wid[i]; gl[g] += loose[i]; go[g] += off[i]; gw[g] += wr[i]; gc[g]++; }
    for (let i = 0; i < n; i++) { const g = B.wid[i], k = gc[g], lo = gl[g] / k, of = go[g] / k, w = gw[g] / k; v.fromArray(pos, i * 3); if (lo > 0) v.lerp(nn.fromArray(B.hull, i * 3), lo); nn.fromArray(wn, i * 3);
      const wz = of > 0 ? w * noise3(v.x * 9, v.y * 9, v.z * 9) : 0; v.addScaledVector(nn, of + wz); P3.set([v.x, v.y, v.z], i * 3); }
    // normales recalculées sur la forme habillée, soudées
    const gn = new Float32Array(B.ng * 3), I = sg.index, a = V(), b = V(), d = V(), e1 = V(), e2 = V();
    for (let t = 0; t < I.count; t += 3) { const ia = I.getX(t), ib = I.getX(t + 1), ic = I.getX(t + 2); a.fromArray(P3, ia * 3); b.fromArray(P3, ib * 3); d.fromArray(P3, ic * 3); e1.subVectors(b, a); e2.subVectors(d, a); e1.cross(e2); for (const q of [ia, ib, ic]) { const g = B.wid[q] * 3; gn[g] += e1.x; gn[g + 1] += e1.y; gn[g + 2] += e1.z; } }
    const NN = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const g = B.wid[i] * 3; a.set(gn[g], gn[g + 1], gn[g + 2]).normalize(); NN.set([a.x, a.y, a.z], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(P3, 3)); g.setAttribute('normal', new THREE.BufferAttribute(NN, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
  const geo = mergeParts(parts.map((p) => p.g));
  // scène : clone du mannequin sans ses maillages, un maillage « corps »
  const scene = cloneSkinned(B.scene); const olds = []; let host = null, skel = null;
  scene.traverse((o) => { if (o.isSkinnedMesh) { olds.push(o); if (o.name === 'Skin') { host = o.parent; skel = o.skeleton; } } });
  for (const o of olds) o.parent.remove(o);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, name: 'corps', side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.name = 'corps'; mesh.castShadow = true; mesh.receiveShadow = false;
  mesh.position.copy(skin.position); mesh.quaternion.copy(skin.quaternion); mesh.scale.copy(skin.scale); host.add(mesh); mesh.bind(skel, skin.bindMatrix);
  mesh.updateMatrixWorld(true); geo.computeBoundingSphere(); geo.boundingSphere.radius *= 1.7;
  scene.userData.bodyBox = L.box.clone();
  return scene;
}

function mergeV(g) { return g; }
function mergeParts(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Co = new Float32Array(nv * 3), SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4), I = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) { const n = g.attributes.position.count;
    for (const [arr, key, k] of [[P, 'position', 3], [N, 'normal', 3], [Co, 'color', 3], [SI, 'skinIndex', 4], [SW, 'skinWeight', 4]]) { const a = g.attributes[key]; for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) arr[(ov + i) * k + j] = a.getComponent(i, j); }
    if (g.index) for (let i = 0; i < g.index.count; i++) I[oi + i] = g.index.getX(i) + ov; else for (let i = 0; i < n; i++) I[oi + i] = i + ov;
    oi += g.index ? g.index.count : n; ov += n; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.BufferAttribute(Co, 3));
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
export function registerSkin(chars, def, clips, H = 1.8) {
  const scene = buildSkinScene(def); const box = scene.userData.bodyBox, k = H / (box.max.y - box.min.y);
  chars[def.id] = { scene, clips, k, minY: box.min.y, def, noTint: true };
  return chars[def.id];
}
export function skinLabel(id) { const s = skinById(id); return s ? s.name : id; }
