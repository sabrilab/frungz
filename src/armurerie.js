// Armurerie : les armes du jeu, modélisées en code (plus de modèles du pack low-poly).
// Chaque arme est dessinée de profil (silhouettes extrudées et chanfreinées), avec ses pièces rondes (canons, lunettes, tubes creux),
// ses détails (rails crantés, fentes du garde-main, vis, fenêtre d'éjection, organes de visée) et ses pièces mobiles nommées :
//   mag (chargeur), bolt (culasse, glissière ou levier d'armement), pump (pompe), cyl (barillet), cover (capot), brk (canons basculants).
// Repère : canon vers +x, haut +y, côté droit du tireur +z, centre de la poignée à l'origine, en mètres.
// Deux niveaux de détail : complet (joueur, salon, studio) et léger en un seul maillage (les autres personnages).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS } from './data.js';

let LO = false, cur = null, DEC = null, TAG = null;
// marquage gravé (texte) sur un flanc, ou réticule lumineux dans un viseur. side : +1 droite, -1 gauche, 0 face au tireur
const mark = (text, x, y, z, h, side, o = {}) => { if (!LO && DEC) DEC.push({ text, x, y, z, h, side, grp: o.grp || 'body', ret: o.ret || null }); };
const add = (m, g) => { cur.push([m, g]); return g; };
const SEG = () => (LO ? 8 : 18);

// ---------------------------------------------------------------- pièces de base
// polygone de profil chanfreiné aux angles
function cham(pts, r = 0.004) {
  if (LO) return pts; const out = [], n = pts.length;
  for (let i = 0; i < n; i++) { const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]); const ra = Math.min(r, da * 0.4), rb = Math.min(r, db * 0.4);
    out.push([p[0] + (a[0] - p[0]) / da * ra, p[1] + (a[1] - p[1]) / da * ra], [p[0] + (b[0] - p[0]) / db * rb, p[1] + (b[1] - p[1]) / db * rb]); }
  return out;
}
// profil (x, y) extrudé sur l'épaisseur w (centré en z), arêtes latérales chanfreinées
function ext(pts, w, bev = 0.003, z = 0, holes) {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  const b = LO ? 0 : Math.min(bev, w * 0.3), d = w - 2 * b;
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -d / 2 + z); return g;
}
const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function tube(r0, r1, x0, x1, y = 0, z = 0, seg = SEG()) { const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, seg); g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; }
function tubeZ(r, z0, z1, x, y, seg = LO ? 6 : 12) { const g = new THREE.CylinderGeometry(r, r, z1 - z0, seg); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; }
function tubeY(r, y0, y1, x, z = 0, seg = LO ? 6 : 12) { const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z); return g; }
// tube à pans (garde-main) : un méplat en haut
function oct(r, x0, x1, y, n = 8) { const g = new THREE.CylinderGeometry(r, r, x1 - x0, n); g.rotateY(Math.PI / n); g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, y, 0); return g; }
// tube creux (bouche du canon, lunette, viseur) : on voit à travers
function pipe(ri, ro, x0, x1, y = 0, z = 0, seg = SEG(), ro1 = ro, ri1 = ri) {
  if (LO) return tube(ro, ro1, x0, x1, y, z, 8);
  const L = x1 - x0, pts = [new THREE.Vector2(ri, 0), new THREE.Vector2(ro, 0), new THREE.Vector2(ro1, L), new THREE.Vector2(ri1, L), new THREE.Vector2(ri, 0)];
  let g = new THREE.LatheGeometry(pts, seg); g = toCreasedNormals(g.toNonIndexed(), 0.5); g.rotateZ(-Math.PI / 2); g.translate(x0, y, z); return g;
}
function box(sx, sy, sz, x, y, z = 0, rz = 0) { const g = new THREE.BoxGeometry(sx, sy, sz); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; }
// rail cranté (Picatinny) sur le dessus, ou dessous avec up = -1
function rail(x0, x1, y, w = 0.021, up = 1, m = 'Black2') {
  if (LO) { add(m, box(x1 - x0, 0.007, w, (x0 + x1) / 2, y + 0.0035 * up)); return; }
  add(m, box(x1 - x0, 0.004, w * 0.72, (x0 + x1) / 2, y + 0.002 * up));
  for (let x = x0 + 0.004; x < x1 - 0.003; x += 0.0101) add(m, box(0.0054, 0.0042, w, x, y + 0.0058 * up));
}
// vis et axes visibles des deux côtés
function pins(list, w, r = 0.0032, m = 'DarkMetal') { if (LO) return; for (const [x, y] of list) add(m, tubeZ(r, -w / 2 - 0.0008, w / 2 + 0.0008, x, y)); }
// stries (prise de la glissière, nervures)
function ribs(x0, x1, y0, y1, w, n, m = 'Black2', lean = 0) { if (LO) return; for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i + 0.5) / n; add(m, box((x1 - x0) / n * 0.45, y1 - y0, w + 0.0012, x, (y0 + y1) / 2, 0, lean)); } }
// bouche : tube creux et, selon le cas, cache-flamme à fentes ou frein de bouche à évents
function muzzleDev(kind, x0, y, r, m = 'DarkMetal') {
  if (kind === 'flash') { add(m, pipe(r * 0.55, r * 1.45, x0, x0 + 0.045, y)); if (!LO) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const g = box(0.026, 0.0026, 0.0016, x0 + 0.027, 0, r * 1.45); g.rotateX(a); g.translate(0, y, 0); add('Black2', g); } return x0 + 0.045; }
  if (kind === 'brake') { const L = r * 6.5; add(m, pipe(r * 0.6, r * 1.3, x0, x0 + L, y)); for (let i = 0; i < 3; i++) add(m, box(r * 0.9, r * 2.5, r * 4.6, x0 + L * (0.22 + i * 0.3), y)); if (!LO) for (let i = 0; i < 2; i++) add('Black2', box(r * 0.9, r * 1.5, r * 4.7, x0 + L * (0.37 + i * 0.3), y)); return x0 + L; }
  if (kind === 'comp') { add(m, ext(cham(rect(x0, x0 + 0.04, y - r * 1.5, y + r * 1.7), 0.003), r * 3.2)); if (!LO) for (let i = 0; i < 3; i++) add('Black2', box(0.005, 0.002, r * 2.2, x0 + 0.01 + i * 0.01, y + r * 1.7)); return x0 + 0.04; }
  if (kind === 'sil') { add('Black', pipe(r * 0.6, r * 2.3, x0, x0 + 0.16, y)); if (!LO) for (let i = 0; i < 4; i++) add('Black2', pipe(r * 2.3, r * 2.42, x0 + 0.02 + i * 0.012, x0 + 0.026 + i * 0.012, y)); return x0 + 0.16; }
  add(m, pipe(r * 0.55, r, x0 - 0.012, x0, y)); return x0;
}
// poignée pistolet (centre à l'origine), plaquettes texturées
function grip(m = 'Black', pad = 'Grip', s = 1) {
  add(m, ext(cham([[0.026, 0.046], [0.01, -0.02], [0.007, -0.057 * s], [-0.034, -0.057 * s], [-0.04, -0.046 * s], [-0.026, 0.0], [-0.03, 0.046]], 0.005), 0.03, 0.006));
  if (!LO) add(pad, ext(cham([[0.014, 0.022], [0.004, -0.046 * s], [-0.03, -0.046 * s], [-0.019, 0.022]], 0.004), 0.033, 0.003));
}
// pontet et détente
function guard(x0, x1, yT, yB, w = 0.011, m = 'Black') {
  if (LO) { add(m, box(x1 - x0, 0.004, w, (x0 + x1) / 2, yB)); return; }
  const t = 0.0038; add(m, ext(cham([[x0, yT], [x1, yT], [x1, yB + 0.008], [x1 - 0.012, yB], [x0, yB]], 0.004), w, 0.002, 0, [cham([[x0 + t, yT - 0.001], [x1 - t, yT - 0.001], [x1 - t, yB + 0.009], [x1 - 0.013, yB + t], [x0 + t, yB + t]], 0.003)]));
  add('Metal', ext([[x0 + 0.02, yT], [x0 + 0.026, yT], [x0 + 0.022, yT - 0.012], [x0 + 0.027, yB + 0.012], [x0 + 0.023, yB + 0.01], [x0 + 0.016, yT - 0.012]], 0.006, 0.001));
}
// chargeur : droit, incliné (lean) ou courbe (curve), talon élargi. Renvoie le bas du chargeur
function magazine(x, yT, o = {}) {
  const { w = 0.058, h = 0.15, lean = 0.12, curve = 0, th = 0.023, m = 'DarkMetal', base = 'Black2', rib = 2 } = o, n = curve ? 7 : 1, f = [], r = [];
  const off = (t) => (lean * t + curve * t * t) * h;
  for (let i = 0; i <= n; i++) { const t = i / n, y = yT - h * t, sl = lean + 2 * curve * t, c = 1 / Math.hypot(1, sl); f.push([x + off(t) + w / 2 * c, y - w / 2 * sl * c * 0]); r.push([x + off(t) - w / 2 * c, y]); }
  add(m, ext([...f, ...r.reverse()], th, 0.002));
  const bx = x + off(1), by = yT - h; add(base, ext(cham(rect(bx - w / 2 - 0.003, bx + w / 2 + 0.003, by - 0.008, by + 0.004), 0.002), th + 0.004, 0.002));
  if (!LO) for (let i = 0; i < rib; i++) { const t = 0.3 + i * 0.3, y = yT - h * t; add(m, ext(rect(x + off(t) - w * 0.3, x + off(t) + w * 0.3, y - 0.012, y + 0.012), th + 0.0022, 0.001)); }
  return [bx, by - 0.008];
}
// crosses. xr : arrière de la plaque de couche
function stock(kind, xr, x0, bore, m = 'Black', pad = 'Rubber') {
  const y = bore;
  if (kind === 'm4') { // tube et crosse réglable
    add('DarkMetal', tube(0.0135, 0.0135, xr + 0.03, x0, y - 0.004));
    add(m, ext(cham([[xr + 0.008, y + 0.02], [xr + 0.19, y + 0.02], [xr + 0.19, y - 0.026], [xr + 0.11, y - 0.03], [xr + 0.04, y - 0.088], [xr + 0.008, y - 0.092]], 0.006), 0.04, 0.006, 0, LO ? null : [cham([[xr + 0.03, y - 0.03], [xr + 0.085, y - 0.03], [xr + 0.04, y - 0.07], [xr + 0.03, y - 0.07]], 0.003)]));
    add(pad, ext(cham(rect(xr, xr + 0.01, y - 0.094, y + 0.022), 0.003), 0.042, 0.004));
    if (!LO) add('DarkMetal', box(0.03, 0.006, 0.02, xr + 0.15, y - 0.03));
  } else if (kind === 'fixed') { // crosse pleine
    add(m, ext(cham([[x0, y + 0.014], [xr + 0.01, y + 0.004], [xr + 0.01, y - 0.108], [xr + 0.03, y - 0.112], [x0, y - 0.04]], 0.006), 0.036, 0.007));
    add(pad, ext(cham(rect(xr, xr + 0.012, y - 0.112, y + 0.006), 0.003), 0.038, 0.004));
  } else if (kind === 'skel') { // crosse squelette (repliable)
    add(m, ext(cham([[x0, y + 0.012], [xr + 0.01, y + 0.008], [xr + 0.01, y - 0.1], [xr + 0.03, y - 0.1], [x0, y - 0.02]], 0.005), 0.022, 0.004, 0, [cham([[x0 - 0.02, y - 0.002], [xr + 0.03, y - 0.004], [xr + 0.03, y - 0.075], [xr + 0.045, y - 0.075], [x0 - 0.02, y - 0.016]], 0.004)]));
    add(pad, ext(cham(rect(xr, xr + 0.012, y - 0.104, y + 0.012), 0.003), 0.03, 0.004));
    if (!LO) add('DarkMetal', tubeZ(0.007, -0.014, 0.014, x0 - 0.004, y - 0.004));
  } else if (kind === 'prec') { // crosse de précision : appui-joue réglable, poignée de maintien
    add(m, ext(cham([[x0, y + 0.012], [xr + 0.012, y + 0.012], [xr + 0.012, y - 0.115], [xr + 0.05, y - 0.115], [xr + 0.07, y - 0.07], [x0 - 0.03, y - 0.05], [x0, y - 0.04]], 0.006), 0.034, 0.006, 0, LO ? null : [cham([[xr + 0.045, y - 0.01], [x0 - 0.05, y - 0.01], [x0 - 0.05, y - 0.035], [xr + 0.075, y - 0.05], [xr + 0.045, y - 0.05]], 0.004)]));
    add('Black2', ext(cham(rect(xr + 0.06, x0 - 0.04, y + 0.012, y + 0.034), 0.005), 0.03, 0.006));
    if (!LO) { add('Metal', tubeY(0.003, y + 0.006, y + 0.02, xr + 0.09)); add('Metal', tubeY(0.003, y + 0.006, y + 0.02, x0 - 0.07)); add('DarkMetal', tubeZ(0.006, -0.02, 0.02, xr + 0.03, y - 0.03)); }
    add(pad, ext(cham(rect(xr, xr + 0.014, y - 0.118, y + 0.016), 0.003), 0.036, 0.004));
  } else if (kind === 'wood') { // crosse anglaise en bois
    add('Wood', ext(cham([[x0, y + 0.01], [xr + 0.01, y - 0.012], [xr + 0.01, y - 0.125], [xr + 0.035, y - 0.128], [x0 - 0.06, y - 0.06], [x0, y - 0.045]], 0.008), 0.038, 0.01));
    add(pad, ext(cham(rect(xr, xr + 0.012, y - 0.13, y - 0.008), 0.003), 0.04, 0.004));
  } else if (kind === 'wire') { // crosse en fil d'acier
    for (const z of [-0.016, 0.016]) add('DarkMetal', tube(0.0035, 0.0035, xr + 0.006, x0, y, z, 8));
    add('DarkMetal', ext(cham(rect(xr, xr + 0.008, y - 0.085, y + 0.012), 0.002), 0.04, 0.003));
  }
}
// viseurs. Renvoient la hauteur de la ligne de visée
function irons(xf, xr, y, hooded = false) {
  add('Black2', ext(cham([[xf - 0.012, y], [xf + 0.012, y], [xf + 0.006, y + 0.012], [xf - 0.006, y + 0.012]], 0.002), 0.014, 0.002));
  add('DarkMetal', box(0.003, 0.02, 0.003, xf, y + 0.02)); if (!LO) { for (const z of [-0.008, 0.008]) add('Black2', box(0.012, 0.026, 0.0026, xf, y + 0.022, z)); if (hooded) add('Black2', pipe(0.011, 0.0135, xf - 0.007, xf + 0.007, y + 0.024)); }
  add('Black2', ext(cham([[xr - 0.012, y], [xr + 0.012, y], [xr + 0.008, y + 0.012], [xr - 0.008, y + 0.012]], 0.002), 0.018, 0.002));
  if (LO) add('Black2', box(0.006, 0.02, 0.016, xr, y + 0.02)); else { for (const z of [-0.0062, 0.0062]) add('Black2', box(0.006, 0.02, 0.0056, xr, y + 0.02, z)); add('Black2', box(0.006, 0.006, 0.018, xr, y + 0.013)); }
  return y + 0.0285;
}
function redDot(x, y) { // viseur point rouge à tube
  add('Black2', ext(cham(rect(x - 0.024, x + 0.024, y, y + 0.014), 0.003), 0.024, 0.003));
  add('Black', pipe(0.0155, 0.02, x - 0.034, x + 0.034, y + 0.033)); if (!LO) { add('Black2', pipe(0.02, 0.0215, x - 0.034, x - 0.026, y + 0.033)); add('Black2', pipe(0.02, 0.0215, x + 0.026, x + 0.034, y + 0.033)); add('Black2', tubeY(0.006, y + 0.05, y + 0.062, x + 0.004)); add('Black2', tubeZ(0.006, 0.018, 0.03, x + 0.004, y + 0.033)); }
  add('GlassLens', tube(0.0155, 0.0155, x + 0.02, x + 0.0206, y + 0.033)); mark('', x + 0.019, y + 0.033, 0, 0.022, 0, { ret: 'dot' });
  return y + 0.033;
}
function holo(x, y) { // viseur holographique : fenêtre carrée sous un arceau
  add('Black2', ext(cham(rect(x - 0.04, x + 0.035, y, y + 0.018), 0.003), 0.03, 0.003));
  for (const z of [-0.0145, 0.0145]) add('Black', ext(cham([[x - 0.004, y + 0.016], [x + 0.03, y + 0.016], [x + 0.03, y + 0.058], [x + 0.008, y + 0.058]], 0.004), 0.003, 0.001, z));
  add('Black', box(0.024, 0.003, 0.032, x + 0.019, y + 0.058)); add('GlassLens', box(0.0012, 0.04, 0.027, x + 0.024, y + 0.037)); mark('', x + 0.0225, y + 0.037, 0, 0.03, 0, { ret: 'holo' });
  if (!LO) { add('DarkMetal', tubeZ(0.005, -0.019, -0.015, x - 0.02, y + 0.009)); add('Black2', box(0.03, 0.012, 0.026, x - 0.022, y + 0.022)); }
  return y + 0.037;
}
function scope(x0, x1, y, o = {}) { // lunette : corps, cloche d'objectif, oculaire, tourelles, colliers
  const { r = 0.0135, ro = 0.025, re = 0.019, h = 0.036 } = o, yc = y + h, xm = (x0 + x1) / 2;
  add('Black', pipe(r * 0.8, r, x0 + 0.06, x1 - 0.085, yc)); add('Black', pipe(ro * 0.86, ro, x1 - 0.06, x1, yc)); add('Black', pipe(r * 0.8, r, x1 - 0.085, x1 - 0.06, yc, 0, SEG(), ro, ro * 0.86));
  add('Black', pipe(re * 0.84, re, x0, x0 + 0.045, yc)); add('Black', pipe(r * 0.8, re, x0 + 0.045, x0 + 0.06, yc, 0, SEG(), r, r * 0.8)); add('Black2', pipe(re, re * 1.07, x0 + 0.004, x0 + 0.022, yc));
  add('Glass', tube(ro * 0.86, ro * 0.86, x1 - 0.012, x1 - 0.011, yc)); add('Glass', tube(re * 0.84, re * 0.84, x0 + 0.008, x0 + 0.009, yc));
  add('Black', ext(cham(rect(xm - 0.016, xm + 0.016, yc - r * 1.15, yc + r * 1.15), 0.003), r * 2.3, 0.003));
  add('Black2', tubeY(0.0095, yc + r, yc + r + 0.016, xm)); add('Black2', tubeZ(0.0095, r, r + 0.016, xm, yc)); if (!LO) add('Black2', tubeZ(0.008, -r - 0.012, -r, xm, yc));
  for (const x of [xm - 0.05, xm + 0.05]) { add('DarkMetal', pipe(r, r + 0.004, x - 0.008, x + 0.008, yc)); add('DarkMetal', ext(cham(rect(x - 0.008, x + 0.008, y, yc - r * 0.6), 0.002), 0.016, 0.002)); if (!LO) add('Metal', tubeZ(0.0025, -0.0125, 0.0125, x, y + 0.006)); }
  return yc;
}
function bipod(x, y, len = 0.2, m = 'DarkMetal') { // bipied replié le long du fût
  add(m, box(0.022, 0.014, 0.04, x, y - 0.006)); for (const z of [-0.017, 0.017]) { add(m, tube(0.0048, 0.0048, x, x + len, y - 0.016, z, 8)); add('Rubber', tube(0.007, 0.007, x + len - 0.02, x + len, y - 0.016, z, 8)); }
}
// fentes du garde-main (côtés et dessous)
function slots(x0, x1, y, r, n) { if (LO) return; const ap = r * Math.cos(Math.PI / 8) + 0.0003; for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i + 0.5) / n, L = (x1 - x0) / n * 0.62;
  for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI * 0.75, -Math.PI * 0.75]) { const g = box(L, 0.0012, 0.0072, x, ap, 0); g.rotateX(a); g.translate(0, y, 0); add('Black2', g); } } }

// ---------------------------------------------------------------- assemblage
const C = new THREE.Color();
function assemble(parts, mat, lo) {
  const grp = new THREE.Group(); if (!parts.length) return grp;
  const norm = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
  if (lo) { const gs = parts.map(([m, g]) => { g = norm(g); const col = lo(m), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; });
    const mesh = new THREE.Mesh(mergeGeometries(gs), mat('LOD')); mesh.castShadow = true; grp.add(mesh); return grp; }
  const by = new Map(); for (const [m, g] of parts) { if (!by.has(m)) by.set(m, []); by.get(m).push(norm(g)); }
  for (const [m, gs] of by) { const mesh = new THREE.Mesh(mergeGeometries(gs), mat(m)); mesh.castShadow = m !== 'GlassLens'; if (m === 'GlassLens') mesh.renderOrder = 6; grp.add(mesh); }
  return grp;
}
// une arme = pièces fixes + pièces mobiles nommées (chacune autour de son pivot)
class Gun {
  constructor() { this.groups = { body: { parts: [], pivot: [0, 0, 0] } }; this.meta = {}; this.decals = []; DEC = this.decals; cur = this.groups.body.parts; }
  part(name, pivot, fn) { const g = (this.groups[name] ||= { parts: [], pivot: pivot || [0, 0, 0] }); const prev = cur; cur = g.parts; fn(); cur = prev; }
}

// ---------------------------------------------------------------- plateformes
// Carabine, fusil d'assaut, PM, fusil de précision semi-automatique, fusil-mitrailleur : même architecture, pièces au choix
function carbine(o) {
  const G = new Gun(), M = G.meta;
  const { bore = 0.078, rx0 = -0.09, rx1 = 0.13, hx1 = 0.4, mz = 0.5, xr = -0.33, body = 'Main', low = 'MainDark', furn = 'Black', hg = 'mlok', hr = 0.026, br = 0.0085, st = 'm4', mag = {}, magx = 0.088, optic = 'irons',
    muz = 'flash', recv = 'ar', bip = false, gas = true, top = bore + 0.03, bot = 0.04, w = 0.034, fgrip = false, knobSide = -1 } = o;
  // boîtier haut et bas
  if (recv === 'tube') { add(body, tube(0.021, 0.021, rx0, rx1, bore + 0.004)); add(body, ext(cham(rect(rx0, rx1, bot + 0.012, bore), 0.004), w - 0.004, 0.004)); add(body, tube(0.012, 0.012, rx1 - 0.02, hx1 + 0.02, bore + 0.03)); add('Black2', tube(0.0125, 0.008, hx1 + 0.02, hx1 + 0.034, bore + 0.03)); }
  else if (recv === 'ak') { add(body, ext(cham([[rx0, bot + 0.006], [rx1, bot + 0.006], [rx1, bore + 0.012], [rx0, bore + 0.012]], 0.004), w - 0.004, 0.003)); add('DarkMetal', ext(cham([[rx0 + 0.004, bore + 0.012], [rx1 - 0.04, bore + 0.012], [rx1 - 0.04, top - 0.006], [rx1 - 0.07, top], [rx0 + 0.02, top], [rx0 + 0.004, top - 0.008]], 0.005), w - 0.008, 0.008)); }
  else { add(body, ext(cham([[rx0, bore - 0.022], [rx1, bore - 0.022], [rx1, top], [rx0 + 0.012, top], [rx0, top - 0.012]], 0.004), w, 0.005)); }
  add(low, ext(cham([[rx0, bore - 0.022], [rx1 - 0.012, bore - 0.022], [rx1 - 0.012, bot - 0.012], [magx + 0.038, bot - 0.03], [magx - 0.034, bot - 0.022], [0.03, bot], [-0.032, bot], [rx0, bot + 0.008]], 0.004), w - 0.003, 0.004));
  pins([[rx1 - 0.03, bore - 0.03], [rx0 + 0.025, bore - 0.03], [0.012, bot + 0.012]], w);
  if (!LO) { add('Black2', box(0.062, 0.02, 0.002, magx + 0.01, bore - 0.004, w / 2)); add('Black2', box(0.014, 0.005, 0.004, 0.0, bot + 0.02, -w / 2 - 0.001, 0.5)); add('DarkMetal', tubeZ(0.005, -w / 2 - 0.002, -w / 2, 0.0, bot + 0.02)); add('Black2', box(0.02, 0.008, 0.004, magx - 0.012, bot + 0.012, w / 2)); if (recv === 'ar') add(body, ext(cham([[rx1 - 0.075, bore - 0.01], [rx1 - 0.05, bore - 0.01], [rx1 - 0.06, bore + 0.004], [rx1 - 0.075, bore + 0.004]], 0.002), 0.008, 0.002, w / 2 + 0.002)); }
  // culasse visible dans la fenêtre d'éjection, levier d'armement sur le côté
  const kx = recv === 'tube' ? rx1 + 0.1 : magx + 0.02, ky = recv === 'tube' ? bore + 0.03 : bore + 0.004;
  G.part('bolt', null, () => { add('LightMetal', box(0.052, 0.015, 0.002, magx + 0.012, bore - 0.004, w / 2 + 0.0004)); add('DarkMetal', tubeZ(0.0042, knobSide * (w / 2 + 0.022), knobSide * (w / 2 - 0.004), kx, ky)); add('Black2', tubeZ(0.0062, knobSide * (w / 2 + 0.024), knobSide * (w / 2 + 0.012), kx, ky)); });
  M.bolt = { travel: 0.055, handle: [kx, ky, knobSide * (w / 2 + 0.02)] };
  // poignée, pontet, chargeur
  grip(furn); guard(0.026, magx - 0.034, bot, 0.004, 0.011, low);
  G.part('mag', null, () => { M.mag = magazine(magx, bot - 0.012, mag); });
  // canon et garde-main
  add('DarkMetal', tube(br * 1.25, br * 1.25, rx1, hx1, bore)); add('DarkMetal', tube(br, br, hx1, mz, bore));
  if (hg === 'mlok') { add(furn, oct(hr, rx1, hx1, bore + 0.002)); slots(rx1 + 0.012, hx1 - 0.008, bore + 0.002, hr, Math.round((hx1 - rx1) / 0.045)); if (!LO) { add('Black2', pipe(hr * 0.72, hr * 0.94, hx1 - 0.002, hx1 + 0.002, bore + 0.002, 0, 8)); } rail(rx1, hx1, bore + 0.002 + hr * Math.cos(Math.PI / 8) - 0.001); }
  else if (hg === 'poly') { add(furn, ext(cham([[rx1, bore - 0.03], [hx1, bore - 0.026], [hx1, bore + 0.018], [rx1, bore + 0.024]], 0.006), hr * 2, 0.009)); ribs(rx1 + 0.02, hx1 - 0.015, bore - 0.02, bore - 0.004, hr * 2, Math.round((hx1 - rx1) / 0.018)); }
  else if (hg === 'wood') { add('Wood', ext(cham([[rx1, bore - 0.034], [hx1, bore - 0.026], [hx1, bore - 0.004], [rx1, bore - 0.004]], 0.006), hr * 2, 0.009)); add('Wood', ext(cham([[rx1 + 0.01, bore + 0.004], [hx1 - 0.03, bore + 0.004], [hx1 - 0.03, bore + 0.03], [rx1 + 0.01, bore + 0.03]], 0.006), hr * 1.7, 0.008)); add('DarkMetal', tube(0.0065, 0.0065, rx1, hx1 + 0.05, bore + 0.022)); if (!LO) { add('DarkMetal', box(0.012, 0.062, hr * 2 + 0.003, hx1 - 0.03 + 0.004, bore)); for (let i = 0; i < 3; i++) add('Black2', box(0.02, 0.005, hr * 1.7 + 0.001, rx1 + 0.04 + i * 0.035, bore + 0.018)); } }
  else if (hg === 'heat') { add(furn, ext(cham([[rx1, bore - 0.032], [hx1, bore - 0.028], [hx1, bore - 0.004], [rx1, bore - 0.004]], 0.005), hr * 2, 0.008)); add('DarkMetal', ext(cham([[rx1, bore + 0.002], [hx1 - 0.02, bore + 0.002], [hx1 - 0.02, bore + 0.026], [rx1, bore + 0.03]], 0.004), hr * 1.5, 0.007)); ribs(rx1 + 0.02, hx1 - 0.04, bore + 0.012, bore + 0.03, hr * 1.5, Math.round((hx1 - rx1) / 0.02), 'Black2'); }
  if (gas && hx1 < mz - 0.06) { add('DarkMetal', ext(cham(rect(hx1 + 0.012, hx1 + 0.04, bore - 0.014, bore + 0.022), 0.003), 0.024, 0.004)); }
  M.muzzle = [muzzleDev(muz, mz, bore, br), bore];
  if (bip) bipod(hx1 - 0.07, bore - hr + 0.004, Math.min(0.22, mz - hx1 + 0.06));
  if (fgrip) { add(furn, ext(cham([[fgrip - 0.016, bore - hr + 0.004], [fgrip + 0.016, bore - hr + 0.004], [fgrip + 0.012, bore - hr - 0.085], [fgrip - 0.02, bore - hr - 0.085]], 0.005), 0.028, 0.007)); M.fore = [fgrip, bore - hr - 0.04]; }
  M.support = [(rx1 + hx1) / 2 + 0.03, bore - (hg === 'mlok' ? hr * 0.92 : hg === 'wood' ? 0.032 : 0.03)];
  // dessus : rail et organes de visée
  const ty = recv === 'tube' ? bore + 0.025 : top;
  if (recv !== 'ak') rail(rx0 + 0.016, rx1 - 0.004, ty);
  const ry = ty + (recv === 'ak' ? 0 : 0.008);
  if (optic === 'irons') M.sightY = irons(hg === 'mlok' ? hx1 - 0.02 : Math.min(mz - 0.04, hx1 + 0.03), recv === 'ak' ? rx1 - 0.02 : rx0 + 0.035, hg === 'mlok' ? ry : ry - (recv === 'ak' ? 0.004 : 0), recv === 'tube');
  else if (optic === 'dot') M.sightY = redDot(0.03, ry); else if (optic === 'holo') M.sightY = holo(0.02, ry); else if (optic === 'scope') { M.sightY = scope(-0.07, 0.2, ry, o.scope); M.scope = true; }
  if (optic === 'dot' || optic === 'holo') M.optic = optic;
  // crosse
  stock(st, xr, rx0, bore, furn); M.rear = xr;
  M.eject = [magx + 0.01, bore, w / 2];
  if ((o.tag || TAG) && recv !== 'tube') { const my = recv === 'ak' ? bore - 0.004 : bore + 0.012; mark((o.tag || TAG), rx0 + 0.07, my, -(w / 2 + 0.0012) + (recv === 'ak' ? 0.002 : 0), 0.0075, -1); mark('FRUNGZ ARMS', rx0 + 0.062, my - 0.012, -(w / 2 + 0.0012) + (recv === 'ak' ? 0.002 : 0), 0.0055, -1); mark((o.tag || TAG), rx0 + 0.05, my, w / 2 + 0.0012 - (recv === 'ak' ? 0.002 : 0), 0.0075, 1); mark('S  1  A', 0.0, bot + 0.034, -(w / 2 + 0.0002), 0.0045, -1); }
  return G;
}

// pistolets semi-automatiques : carcasse, glissière mobile, chargeur dans la poignée
function pistol(o) {
  const G = new Gun(), M = G.meta, { L = 0.2, bore = 0.066, frame = 'Black', slide = 'DarkMetal', pad = 'Grip', ext2 = 0, comp = false, heavy = false, gs = 1 } = o;
  const x1 = L - 0.062, x0 = -0.062, sy0 = bore - 0.017, sy1 = bore + 0.017, sw = heavy ? 0.03 : 0.027;
  add(frame, ext(cham([[x1 - 0.004, sy0], [x1 - 0.004, sy0 - 0.017], [0.075, sy0 - 0.02], [0.026, sy0 - 0.012], [0.01, -0.02], [0.007, -0.062 * gs], [-0.036, -0.062 * gs], [-0.042, -0.05 * gs], [-0.03, 0.0], [-0.04, sy0 - 0.012], [x0 - 0.008, sy0 - 0.006], [x0 - 0.008, sy0]], 0.004), sw + 0.001, 0.006));
  if (!LO) add(pad, ext(cham([[0.012, 0.024], [0.002, -0.05 * gs], [-0.031, -0.05 * gs], [-0.021, 0.024]], 0.004), sw + 0.004, 0.003));
  guard(0.022, 0.08, sy0 - 0.016, sy0 - 0.058, 0.011, frame);
  if (!heavy) rail(x1 - 0.05, x1 - 0.008, sy0 - 0.018, 0.02, -1, frame); else if (!LO) { add('DarkMetal', box(0.012, 0.016, 0.008, x0 - 0.004, sy1 - 0.006)); pins([[0.0, 0.01], [-0.012, -0.03]], sw + 0.004, 0.0035, 'LightMetal'); }
  pins([[0.05, sy0 - 0.008], [-0.02, sy0 - 0.01]], sw + 0.001, 0.0026);
  G.part('bolt', null, () => {
    add(slide, ext(cham([[x0, sy0], [x1, sy0], [x1, sy1 - 0.004], [x1 - 0.006, sy1], [x0 + 0.004, sy1], [x0, sy1 - 0.004]], 0.003), sw, 0.0045));
    ribs(x0 + 0.008, x0 + 0.05, sy0 + 0.004, sy1 - 0.004, sw, 8, 'Black2', 0.25); if (heavy) ribs(x1 - 0.05, x1 - 0.015, sy0 + 0.004, sy1 - 0.004, sw, 6, 'Black2', 0.25);
    if (!LO) { add('Black2', box(0.036, 0.012, 0.004, 0.035, sy1 - 0.005, sw / 2 - 0.0016)); add('LightMetal', box(0.03, 0.008, 0.02, 0.035, sy1 - 0.0036)); }
    add('Black2', box(0.006, 0.007, 0.004, x1 - 0.012, sy1 + 0.0035)); for (const z of [-0.0055, 0.0055]) add('Black2', box(0.008, 0.007, 0.005, x0 + 0.012, sy1 + 0.0035, z));
    if (!LO) { add('GlowDot', box(0.0012, 0.003, 0.003, x1 - 0.0152, sy1 + 0.0045)); for (const z of [-0.0055, 0.0055]) add('GlowDot', box(0.0012, 0.003, 0.003, x0 + 0.0078, sy1 + 0.0045, z)); }
    if (comp && !LO) for (let i = 0; i < 3; i++) add('Black2', box(0.006, 0.002, 0.012, x1 - 0.02 - i * 0.011, sy1 + 0.0002));
  });
  add('Metal', pipe(0.0048, 0.0072, x1 - 0.03, x1 + 0.006, bore)); if (!LO) add('DarkMetal', tube(0.004, 0.004, x1 - 0.03, x1 + 0.002, sy0 + 0.006));
  G.part('mag', null, () => { const a = [[0.004, 0.02], [-0.006, -0.06 * gs - ext2], [-0.032, -0.06 * gs - ext2], [-0.022, 0.02]]; add('DarkMetal', ext(a, 0.018, 0.001)); add('Black2', ext(cham([[-0.002, -0.058 * gs - ext2], [-0.004, -0.07 * gs - ext2], [-0.037, -0.07 * gs - ext2], [-0.037, -0.058 * gs - ext2]], 0.002), sw, 0.003)); });
  M.mag = [-0.02, -0.07 * gs - ext2]; M.magDir = [-0.17, -1]; M.bolt = { travel: 0.036, slide: true }; M.muzzle = [x1 + 0.006, bore]; M.sightY = sy1 + 0.0075; M.rear = x0 - 0.008; M.eject = [0.035, sy1, sw / 2]; M.gb = -0.062 * gs; M.pistol = true;
  if ((o.tag || TAG)) { mark((o.tag || TAG), x1 - 0.075, bore - 0.002, -(sw / 2 + 0.0004), 0.0075, -1, { grp: 'bolt' }); mark('FRUNGZ ARMS', x1 - 0.07, bore - 0.002, sw / 2 + 0.0004, 0.0065, 1, { grp: 'bolt' }); }
  return G;
}

// fusils à pompe et semi-automatiques : canon sur tube magasin
function shotgun(o) {
  const G = new Gun(), M = G.meta, { bore = 0.074, rx0 = -0.1, rx1 = 0.12, mz = 0.62, xr = -0.33, st = 'fixed', furn = 'Black', pump = true, tubeEnd = mz - 0.06, breach = false, optic = 'bead', pg = false, body = 'DarkMetal' } = o;
  const w = 0.036, ty = bore - 0.026;
  add(body, ext(cham([[rx0, bore - 0.03], [rx0 + 0.02, 0.036], [rx1, 0.03], [rx1, bore + 0.02], [rx0 + 0.03, bore + 0.02], [rx0, bore + 0.006]], 0.005), w, 0.007));
  if (!LO) { add('Black2', box(0.07, 0.016, 0.002, 0.04, bore + 0.002, w / 2)); add('Black2', box(0.09, 0.002, 0.02, 0.06, 0.032)); pins([[rx1 - 0.03, bore - 0.02], [0.0, 0.05]], w); }
  G.part('bolt', null, () => { add('LightMetal', box(0.058, 0.012, 0.002, 0.036, bore + 0.002, w / 2 + 0.0004)); if (!pump) { add('DarkMetal', tubeZ(0.004, w / 2 - 0.002, w / 2 + 0.018, 0.02, bore + 0.002)); } }); M.bolt = { travel: 0.06 };
  add('DarkMetal', tube(0.0115, 0.0115, rx1, mz, bore)); add('DarkMetal', tube(0.0112, 0.0112, rx1, tubeEnd, ty)); add('Black2', tube(0.013, 0.013, tubeEnd - 0.018, tubeEnd + 0.004, ty));
  if (!LO) { add('DarkMetal', ext(cham(rect(tubeEnd - 0.05, tubeEnd - 0.035, ty - 0.012, bore + 0.012), 0.003), 0.03, 0.004)); }
  const fx0 = rx1 + 0.06, fx1 = fx0 + 0.19;
  const forend = () => { add(pump ? furn : furn, ext(cham([[fx0, ty - 0.026], [fx1, ty - 0.022], [fx1, ty + 0.014], [fx0, ty + 0.016]], 0.007), 0.05, 0.012)); ribs(fx0 + 0.015, fx1 - 0.015, ty - 0.022, ty - 0.002, 0.05, 9, furn === 'Wood' ? 'DarkWood' : 'Black2'); };
  if (pump) { G.part('pump', null, forend); M.pump = { travel: 0.085 }; add('DarkMetal', box(0.2, 0.004, 0.003, fx0 - 0.04, ty + 0.002, 0.013)); add('DarkMetal', box(0.2, 0.004, 0.003, fx0 - 0.04, ty + 0.002, -0.013)); }
  else { add(furn, ext(cham([[rx1, ty - 0.03], [fx1 + 0.04, ty - 0.022], [fx1 + 0.04, ty + 0.012], [rx1, ty + 0.014]], 0.007), 0.05, 0.012)); ribs(rx1 + 0.03, fx1 + 0.02, ty - 0.024, ty - 0.004, 0.05, 11, 'Black2'); }
  M.support = [(fx0 + fx1) / 2, ty - 0.024];
  if (breach) { add('DarkMetal', pipe(0.01, 0.0165, mz, mz + 0.05, bore)); if (!LO) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const g = box(0.016, 0.006, 0.005, mz + 0.056, 0, 0.0135); g.rotateX(a); g.translate(0, bore, 0); add('DarkMetal', g); } M.muzzle = [mz + 0.06, bore]; }
  else { add('DarkMetal', pipe(0.0092, 0.0118, mz - 0.004, mz + 0.002, bore)); M.muzzle = [mz, bore]; }
  if (pg) { grip(furn); guard(0.026, 0.085, 0.036, 0.0, 0.011, 'Black'); if (st !== 'none') stock(st, xr, rx0, bore - 0.006, furn); else add('Black2', ext(cham(rect(rx0 - 0.012, rx0 + 0.004, bore - 0.03, bore + 0.008), 0.003), 0.03, 0.004)); }
  else { // crosse d'un seul tenant avec poignée en col de cygne
    add(furn, ext(cham([[rx0 + 0.03, bore + 0.012], [rx0 - 0.02, bore - 0.004], [rx0 - 0.05, bore - 0.014], [xr + 0.012, bore - 0.03], [xr + 0.012, bore - 0.135], [xr + 0.045, bore - 0.135], [-0.13, bore - 0.075], [-0.075, -0.012], [-0.04, -0.05], [-0.005, -0.054], [0.02, 0.0], [0.024, 0.036], [rx0 + 0.03, 0.036]], 0.008), 0.036, 0.01));
    add('Rubber', ext(cham(rect(xr, xr + 0.014, bore - 0.138, bore - 0.026), 0.003), 0.038, 0.004)); guard(0.024, 0.085, 0.034, -0.002, 0.011, 'Black');
  }
  M.rear = st === 'none' ? rx0 - 0.012 : xr;
  if (optic === 'ghost') { rail(rx0 + 0.03, rx1 - 0.01, bore + 0.02); M.sightY = irons(mz - 0.03, rx0 + 0.05, bore + 0.028); add('DarkMetal', box(0.02, 0.016, 0.014, mz - 0.03, bore + 0.018)); }
  else { add('Brass', tubeY(0.0028, bore + 0.011, bore + 0.018, mz - 0.012)); if (!LO) add('DarkMetal', box(mz - rx1 - 0.03, 0.003, 0.008, (mz + rx1) / 2, bore + 0.0125)); M.sightY = bore + 0.021; }
  M.eject = [0.04, bore, w / 2]; M.kind = 'tube'; mark((o.tag || TAG) || 'CAL 12 · FRUNGZ ARMS', 0.035, bore - 0.014, -(w / 2 + 0.0004), 0.0075, -1);
  return G;
}

// ---------------------------------------------------------------- les armes
const B = {
  pistol: () => pistol({ L: 0.24 }),
  pistolet_lourd: () => { const G = pistol({ L: 0.27, heavy: true, frame: 'Metal', slide: 'LightMetal', pad: 'DarkWood', bore: 0.07, gs: 1.04 }); return G; },
  pistolet_auto: () => { const G = pistol({ L: 0.235, ext2: 0.05, comp: true, frame: 'Tan', slide: 'Black' }); add('Black', pipe(0.005, 0.0105, 0.173, 0.2, 0.066)); G.meta.muzzle = [0.2, 0.066]; cur = G.groups.body.parts; return G; },
  revolver: (mz = 0.25) => {
    const G = new Gun(), M = G.meta, bore = 0.074, cy = bore - 0.016;
    add('LightMetal', ext(cham([[-0.045, 0.03], [-0.04, bore + 0.012], [0.07, bore + 0.014], [0.07, bore - 0.012], [0.058, bore - 0.012], [0.058, cy - 0.027], [0.03, cy - 0.036], [0.02, 0.01], [-0.02, 0.02]], 0.004), 0.02, 0.005, 0, [cham(rect(-0.008, 0.052, cy - 0.022, cy + 0.022), 0.002)]));
    add('LightMetal', tube(0.0105, 0.0105, 0.07, mz, bore)); add('LightMetal', ext(cham([[0.07, bore - 0.03], [mz - 0.012, bore - 0.03], [mz, bore - 0.02], [mz, bore - 0.004], [0.07, bore - 0.004]], 0.004), 0.016, 0.005));
    add('LightMetal', ext(cham(rect(0.07, mz - 0.004, bore + 0.008, bore + 0.016), 0.002), 0.008, 0.002)); if (!LO) for (let i = 0; i < Math.floor((mz - 0.095) / 0.03); i++) add('Black2', box(0.016, 0.004, 0.009, 0.092 + i * 0.03, bore + 0.012));
    add('LightMetal', pipe(0.006, 0.0105, mz - 0.002, mz + 0.003, bore)); add('Black2', ext(cham([[mz - 0.022, bore + 0.016], [mz - 0.004, bore + 0.016], [mz - 0.008, bore + 0.027], [mz - 0.02, bore + 0.022]], 0.001), 0.004, 0.001)); if (!LO) add('GlowDot', box(0.002, 0.004, 0.0042, mz - 0.019, bore + 0.022));
    add('Black2', box(0.012, 0.008, 0.012, -0.03, bore + 0.016)); add('Metal', ext(cham([[-0.045, bore + 0.002], [-0.04, bore + 0.022], [-0.058, bore + 0.03], [-0.062, bore + 0.024], [-0.05, bore + 0.016]], 0.002), 0.008, 0.002));
    add('DarkWood', ext(cham([[0.012, 0.022], [0.012, -0.03], [0.004, -0.072], [-0.04, -0.076], [-0.05, -0.06], [-0.032, -0.01], [-0.046, 0.03], [-0.02, 0.03]], 0.008), 0.03, 0.01)); if (!LO) add('Brass', tubeZ(0.005, -0.0158, 0.0158, -0.014, -0.02));
    guard(0.014, 0.062, cy - 0.03, cy - 0.074, 0.01, 'LightMetal');
    G.part('cyl', [0.022, cy, 0], () => { add('Metal', tube(0.0225, 0.0225, -0.02, 0.02, 0, 0, LO ? 8 : 24)); if (!LO) for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * Math.PI * 2; const g = tube(0.0065, 0.0065, -0.004, 0.0205, Math.cos(a) * 0.0205, Math.sin(a) * 0.0205, 10); add('DarkMetal', g); const a2 = i / 6 * Math.PI * 2; add('Brass', tube(0.0052, 0.0052, -0.0215, -0.0195, Math.cos(a2) * 0.0135, Math.sin(a2) * 0.0135, 8)); } });
    mark('.357 FRUNGZ', mz > 0.2 ? 0.2 : 0.12, bore - 0.016, -0.0086, 0.006, -1); M.kind = 'revolver'; M.mag = [0.022, cy - 0.03]; M.muzzle = [mz + 0.003, bore]; M.sightY = bore + 0.027; M.rear = -0.062; M.gb = -0.076; M.pistol = true; return G;
  },
  // MP5 de la police : boîtier tubulaire, chargeur courbe, crosse fixe
  smg: () => { const G = carbine({ bore: 0.07, rx0: -0.08, rx1: 0.1, hx1: 0.24, mz: 0.275, xr: -0.225, recv: 'tube', hg: 'poly', hr: 0.021, br: 0.0075, st: 'fixed', body: 'Black', low: 'Black', furn: 'Black2', magx: 0.075, mag: { w: 0.034, h: 0.15, lean: 0.06, curve: 0.2, th: 0.02 }, muz: 'plain', gas: false, optic: 'irons', bot: 0.036 }); return G; },
  // PM de patrouille : boîtier polymère carré, crosse squelette, point rouge
  pm: () => carbine({ bore: 0.074, rx0: -0.1, rx1: 0.16, hx1: 0.27, mz: 0.3, xr: -0.25, recv: 'ar', hg: 'poly', hr: 0.02, br: 0.008, st: 'skel', body: 'Black', low: 'Black2', furn: 'Black', magx: 0.085, mag: { w: 0.036, h: 0.17, lean: 0.02, th: 0.022, m: 'Black2', base: 'Black' }, muz: 'plain', gas: false, optic: 'dot', top: 0.074 + 0.032 }),
  // PM compact : chargeur dans la poignée, crosse en fil d'acier
  compact: () => {
    const G = new Gun(), M = G.meta, bore = 0.07;
    add('DarkMetal', ext(cham([[-0.11, bore - 0.03], [0.13, bore - 0.03], [0.13, bore + 0.026], [-0.1, bore + 0.026], [-0.11, bore + 0.016]], 0.004), 0.04, 0.005));
    add('Black', ext(cham([[-0.05, bore - 0.03], [0.1, bore - 0.03], [0.09, bore - 0.045], [0.024, bore - 0.045], [0.014, -0.02], [0.012, -0.068], [-0.036, -0.068], [-0.036, 0.0]], 0.004), 0.036, 0.006)); if (!LO) add('Grip', ext(cham(rect(-0.03, 0.006, -0.058, 0.01), 0.004), 0.039, 0.003));
    guard(0.022, 0.085, bore - 0.045, -0.014, 0.011, 'Black'); pins([[0.1, bore - 0.01], [-0.08, bore - 0.01], [0.04, bore + 0.01]], 0.04);
    add('DarkMetal', tube(0.0085, 0.0085, 0.13, 0.2, bore)); add('Black2', pipe(0.006, 0.0135, 0.13, 0.165, bore)); add('DarkMetal', pipe(0.0055, 0.0085, 0.196, 0.203, bore));
    if (!LO) add('Black2', box(0.06, 0.018, 0.002, 0.05, bore + 0.004, 0.02));
    G.part('bolt', null, () => { add('LightMetal', box(0.05, 0.013, 0.002, 0.05, bore + 0.004, 0.0204)); add('Black2', ext(cham(rect(0.03, 0.05, bore + 0.026, bore + 0.04), 0.003), 0.018, 0.004)); }); M.bolt = { travel: 0.045, handle: [0.04, bore + 0.036, 0] };
    G.part('mag', null, () => { M.mag = magazine(-0.012, -0.03, { w: 0.03, h: 0.16, lean: 0, th: 0.02 }); }); M.magDir = [0, -1];
    M.sightY = irons(0.11, -0.085, bore + 0.026); for (const z of [-0.0215, 0.0215]) add('DarkMetal', tube(0.0034, 0.0034, -0.21, 0.0, bore + 0.012, z, 8)); add('DarkMetal', ext(cham(rect(-0.218, -0.21, bore - 0.07, bore + 0.02), 0.002), 0.05, 0.003));
    add('Black', ext(cham([[0.1, bore - 0.03], [0.126, bore - 0.03], [0.122, bore - 0.05], [0.104, bore - 0.05]], 0.003), 0.03, 0.004));
    M.muzzle = [0.203, bore]; M.rear = -0.218; M.support = [0.113, bore - 0.05]; M.eject = [0.05, bore, 0.02]; M.gb = -0.068; return G;
  },
  // fusil d'assaut : garde-main à fentes, crosse réglable, organes de visée rabattables
  rifle: () => carbine({ hx1: 0.42, mz: 0.505, mag: { curve: 0.08, lean: 0.1, h: 0.155 }, optic: 'irons' }),
  // carabine tactique : sable et noir, viseur holographique, frein de bouche
  carabine: () => carbine({ rx0: -0.095, rx1: 0.14, hx1: 0.39, mz: 0.44, xr: -0.335, body: 'Tan', low: 'Tan', furn: 'Black', st: 'm4', mag: { m: 'Tan', base: 'Black2', lean: 0.1, curve: 0.06 }, optic: 'holo', muz: 'brake', hr: 0.027 }),
  // fusil à rafales : bullpup français à grande poignée de transport
  rafale: () => {
    const G = new Gun(), M = G.meta, bore = 0.072, w = 0.046;
    add('Green', ext(cham([[-0.37, bore + 0.012], [-0.37, bore - 0.07], [-0.2, bore - 0.074], [-0.19, bore - 0.045], [-0.085, bore - 0.045], [-0.07, 0.03], [0.1, 0.034], [0.19, bore - 0.03], [0.23, bore - 0.026], [0.23, bore + 0.022], [-0.3, bore + 0.03]], 0.008), w, 0.011));
    add('Rubber', ext(cham(rect(-0.384, -0.368, bore - 0.074, bore + 0.016), 0.004), w + 0.002, 0.005)); add('Black', ext(cham([[-0.3, bore + 0.03], [-0.16, bore + 0.028], [-0.17, bore + 0.042], [-0.29, bore + 0.044]], 0.005), w - 0.006, 0.01));
    // poignée de transport : grand arceau qui porte la hausse et le guidon
    add('Black', ext(cham([[-0.19, bore + 0.026], [-0.16, bore + 0.092], [0.17, bore + 0.092], [0.215, bore + 0.022]], 0.008), 0.02, 0.005, 0, [cham([[-0.165, bore + 0.03], [-0.145, bore + 0.078], [0.158, bore + 0.078], [0.19, bore + 0.03]], 0.008)]));
    if (!LO) { add('Black2', box(0.012, 0.012, 0.024, -0.14, bore + 0.097)); add('Black2', box(0.012, 0.014, 0.022, 0.15, bore + 0.098)); for (const z of [-0.008, 0.008]) add('Black2', box(0.012, 0.012, 0.004, 0.15, bore + 0.11, z)); for (const z of [-0.0066, 0.0066]) add('Black2', box(0.006, 0.014, 0.0052, -0.14, bore + 0.108, z)); add('DarkMetal', box(0.003, 0.012, 0.003, 0.15, bore + 0.109)); }
    M.sightY = bore + 0.1135;
    G.part('bolt', null, () => { add('DarkMetal', ext(cham(rect(0.02, 0.05, bore + 0.03, bore + 0.05), 0.004), 0.012, 0.004)); add('LightMetal', box(0.05, 0.014, 0.002, -0.2, bore - 0.004, w / 2 + 0.0004)); }); M.bolt = { travel: 0.07, handle: [0.035, bore + 0.04, 0] };
    if (!LO) { add('Black2', box(0.06, 0.02, 0.002, -0.2, bore - 0.004, w / 2)); pins([[-0.1, bore - 0.02], [0.06, 0.05], [-0.25, bore - 0.03]], w, 0.004); for (const z of [-1, 1]) { add('DarkMetal', tube(0.0045, 0.0045, 0.0, 0.2, bore + 0.036, z * 0.027, 8)); add('Rubber', tube(0.006, 0.006, 0.0, 0.03, bore + 0.036, z * 0.027, 8)); } }
    grip('Black'); add('Black', ext(cham([[0.022, 0.03], [0.095, 0.034], [0.095, -0.036], [0.01, -0.057]], 0.006), 0.012, 0.003, 0, [cham([[0.028, 0.026], [0.089, 0.03], [0.089, -0.03], [0.018, -0.047]], 0.005)])); add('Metal', ext([[0.046, 0.03], [0.052, 0.03], [0.048, 0.018], [0.053, 0.004], [0.049, 0.002], [0.042, 0.018]], 0.006, 0.001));
    G.part('mag', null, () => { M.mag = magazine(-0.14, bore - 0.044, { w: 0.05, h: 0.13, lean: 0.04, th: 0.022 }); }); M.magDir = [0.04, -1];
    add('DarkMetal', tube(0.0085, 0.0085, 0.23, 0.44, bore)); if (!LO) for (let i = 0; i < 3; i++) add('DarkMetal', tube(0.0105, 0.0105, 0.33 + i * 0.022, 0.338 + i * 0.022, bore)); add('DarkMetal', tube(0.011, 0.011, 0.23, 0.27, bore));
    M.muzzle = [muzzleDev('flash', 0.44, bore, 0.0085), bore]; M.rear = -0.384; M.support = [0.15, bore - 0.036]; M.eject = [-0.2, bore, w / 2]; M.bullpup = true; return G;
  },
  // fusil d'assaut 7,62 : tôle emboutie, garnitures bois, chargeur banane
  fusil_lourd: () => { const G = carbine({ recv: 'ak', hg: 'wood', st: 'wood', body: 'DarkMetal', low: 'DarkMetal', furn: 'Wood', rx0: -0.1, rx1: 0.14, hx1: 0.33, mz: 0.5, xr: -0.335, mag: { w: 0.062, h: 0.17, lean: 0.12, curve: 0.3, th: 0.024, m: 'DarkMetal', base: 'DarkMetal', rib: 3 }, magx: 0.1, muz: 'comp', br: 0.008, top: 0.078 + 0.034, hr: 0.024, knobSide: 1 }); return G; },
  revolver_court: () => B.revolver(0.14),
  // pistolet de match : glissière longue ajourée, compensateur, petit point rouge monté sur la glissière
  pistolet_match: () => { const G = pistol({ L: 0.26, comp: true, frame: 'Black', slide: 'LightMetal' }), y = 0.083;
    G.part('bolt', null, () => { add('Black2', ext(cham(rect(-0.04, -0.006, y, y + 0.006), 0.002), 0.024, 0.002)); for (const z of [-0.0105, 0.0105]) add('Black2', box(0.004, 0.022, 0.003, -0.012, y + 0.016, z)); add('Black2', box(0.004, 0.003, 0.024, -0.012, y + 0.0275)); add('GlassLens', box(0.001, 0.02, 0.019, -0.012, y + 0.016)); mark('', -0.0128, y + 0.016, 0, 0.018, 0, { ret: 'dot', grp: 'bolt' }); });
    G.meta.sightY = y + 0.016; G.meta.optic = 'dot'; return G; },
  pm_sil: () => carbine({ bore: 0.07, rx0: -0.08, rx1: 0.1, hx1: 0.22, mz: 0.23, xr: -0.225, recv: 'tube', hg: 'poly', hr: 0.021, br: 0.0085, st: 'skel', body: 'Black', low: 'Black', furn: 'Black2', magx: 0.075, mag: { w: 0.034, h: 0.15, lean: 0.06, curve: 0.2, th: 0.02 }, muz: 'sil', gas: false, optic: 'irons', bot: 0.036 }),
  pm_vecteur: () => carbine({ bore: 0.074, rx0: -0.1, rx1: 0.15, hx1: 0.26, mz: 0.275, xr: -0.24, hg: 'mlok', hr: 0.024, br: 0.008, st: 'skel', body: 'Tan', low: 'Black', furn: 'Black', magx: 0.085, mag: { w: 0.036, h: 0.2, lean: 0.02, th: 0.022, m: 'Black2', base: 'Black' }, muz: 'comp', gas: false, optic: 'holo', fgrip: 0.21 }),
  carabine_sil: () => carbine({ hx1: 0.37, mz: 0.4, muz: 'sil', optic: 'dot', body: 'Black', low: 'Black2', mag: { curve: 0.08, lean: 0.1, h: 0.155 } }),
  ak_court: () => carbine({ recv: 'ak', hg: 'wood', st: 'skel', body: 'DarkMetal', low: 'DarkMetal', furn: 'Black', rx0: -0.1, rx1: 0.14, hx1: 0.28, mz: 0.35, xr: -0.31, mag: { w: 0.062, h: 0.17, lean: 0.12, curve: 0.3, th: 0.024, m: 'DarkMetal', base: 'DarkMetal', rib: 3 }, magx: 0.1, muz: 'flash', br: 0.008, top: 0.078 + 0.034, hr: 0.024, knobSide: 1, gas: false }),
  chasse: () => carbine({ recv: 'ak', hg: 'wood', st: 'wood', body: 'DarkMetal', low: 'DarkMetal', furn: 'Wood', rx0: -0.1, rx1: 0.14, hx1: 0.36, mz: 0.62, xr: -0.34, mag: { w: 0.06, h: 0.07, lean: 0.05, th: 0.024, rib: 0 }, magx: 0.1, muz: 'plain', optic: 'scope', top: 0.078 + 0.034, hr: 0.024, knobSide: 1, gas: false }),
  pompe_tac: () => shotgun({ pg: true, st: 'm4', optic: 'ghost', mz: 0.52, tubeEnd: 0.46, xr: -0.33, furn: 'Tan' }),
  shotgun: () => shotgun({}),
  pompe_court: () => shotgun({ mz: 0.4, tubeEnd: 0.36, pg: true, st: 'none', breach: true, furn: 'Black', rx0: -0.09, xr: -0.1 }),
  semi_auto: () => shotgun({ pump: false, pg: true, st: 'm4', optic: 'ghost', mz: 0.63, tubeEnd: 0.5, xr: -0.335, furn: 'Black' }),
  // canon scié : deux canons juxtaposés qui basculent, bois et acier
  canon_scie: () => {
    const G = new Gun(), M = G.meta, bore = 0.066, hx = 0.085;
    add('Metal', ext(cham([[-0.05, bore - 0.03], [hx + 0.01, bore - 0.034], [hx + 0.01, bore - 0.014], [0.03, bore - 0.012], [0.03, bore + 0.016], [-0.03, bore + 0.016], [-0.05, bore + 0.004]], 0.004), 0.05, 0.007));
    add('Wood', ext(cham([[-0.03, bore + 0.012], [-0.07, bore], [-0.13, bore - 0.05], [-0.15, bore - 0.1], [-0.115, bore - 0.115], [-0.06, bore - 0.07], [-0.02, -0.04], [0.02, 0.0], [0.022, bore - 0.03], [-0.03, bore - 0.03]], 0.008), 0.04, 0.012));
    guard(0.024, 0.09, bore - 0.033, bore - 0.078, 0.01, 'Metal'); if (!LO) { add('Metal', ext([[0.062, bore - 0.034], [0.067, bore - 0.034], [0.064, bore - 0.06], [0.06, bore - 0.058]], 0.004, 0.001, 0.004)); for (const z of [-0.012, 0.012]) add('DarkMetal', ext(cham([[-0.03, bore + 0.014], [-0.022, bore + 0.03], [-0.04, bore + 0.036], [-0.044, bore + 0.03], [-0.034, bore + 0.024]], 0.002), 0.008, 0.002, z)); add('DarkMetal', ext(cham([[-0.01, bore + 0.016], [0.02, bore + 0.016], [0.016, bore + 0.022], [-0.006, bore + 0.022]], 0.002), 0.008, 0.002)); pins([[hx, bore - 0.024]], 0.05, 0.005, 'LightMetal'); }
    G.part('brk', [hx, bore - 0.024, 0], () => { const y = 0.024; for (const z of [-0.0125, 0.0125]) { add('DarkMetal', tube(0.0125, 0.0122, 0.03 - hx, 0.38 - hx, y, z)); add('DarkMetal', pipe(0.0095, 0.0122, 0.378 - hx, 0.384 - hx, y, z)); }
      add('DarkMetal', box(0.33, 0.006, 0.008, 0.2 - hx, y + 0.011)); add('DarkMetal', box(0.33, 0.006, 0.008, 0.2 - hx, y - 0.011)); add('Brass', tubeY(0.0026, y + 0.012, y + 0.02, 0.37 - hx));
      add('Wood', ext(cham([[0.105 - hx, y - 0.036], [0.26 - hx, y - 0.03], [0.26 - hx, y - 0.004], [0.105 - hx, y - 0.004]], 0.007), 0.052, 0.012)); if (!LO) for (const z of [-0.0125, 0.0125]) add('Brass', tube(0.0105, 0.0105, 0.028 - hx, 0.031 - hx, y, z, 12)); });
    M.kind = 'break'; M.muzzle = [0.384, bore]; M.sightY = bore + 0.02; M.rear = -0.15; M.support = [0.18, bore - 0.036]; M.gb = -0.05; M.mag = [0.03, bore]; return G;
  },
  // fusil de tireur d'élite : semi-automatique, long garde-main, lunette, bipied
  dmr: () => carbine({ rx0: -0.1, rx1: 0.15, hx1: 0.5, mz: 0.64, xr: -0.36, st: 'prec', body: 'Black', low: 'Black', furn: 'Black', mag: { w: 0.066, h: 0.12, lean: 0.06, th: 0.026 }, magx: 0.095, optic: 'scope', muz: 'brake', bip: true, br: 0.0095, hr: 0.028, scope: { r: 0.015, ro: 0.027 } }),
  // fusil de précision à verrou : châssis vert, canon lourd flûté, grosse lunette
  sniper: () => {
    const G = new Gun(), M = G.meta, bore = 0.08, rx0 = -0.1, rx1 = 0.16, mz = 0.7, xr = -0.38, w = 0.036;
    add('Green', ext(cham([[rx0, bore - 0.03], [0.44, bore - 0.036], [0.44, bore - 0.008], [rx1, bore - 0.004], [rx0, bore - 0.004]], 0.006), 0.044, 0.01));
    add('DarkMetal', tube(0.0175, 0.0175, rx0, rx1, bore + 0.002)); if (!LO) add('Black2', box(0.07, 0.014, 0.004, 0.06, bore + 0.006, 0.016));
    add('DarkMetal', tube(0.0135, 0.011, rx1, mz, bore)); if (!LO) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const g = box(0.3, 0.003, 0.0012, 0.45, 0, 0.0122); g.rotateX(a); g.translate(0, bore, 0); add('Black2', g); }
    M.muzzle = [muzzleDev('brake', mz, bore, 0.01), bore];
    G.part('bolt', [rx0 + 0.02, bore + 0.002, 0], () => { add('LightMetal', tube(0.009, 0.009, -0.03, 0.03, 0, 0, 12)); add('LightMetal', box(0.008, 0.008, 0.04, 0.012, -0.006, 0.034)); const k = new THREE.SphereGeometry(0.011, LO ? 6 : 12, LO ? 4 : 8); k.translate(0.012, -0.016, 0.056); add('Black2', k); }); M.bolt = { travel: 0.075, lift: true, handle: [rx0 + 0.032, bore - 0.014, 0.056] };
    grip('Black'); guard(0.026, 0.085, bore - 0.03, 0.006, 0.011, 'Black'); G.part('mag', null, () => { M.mag = magazine(0.115, bore - 0.034, { w: 0.07, h: 0.06, lean: 0, th: 0.026, rib: 0 }); }); M.magDir = [0, -1];
    stock('prec', xr, rx0, bore - 0.002, 'Green'); rail(rx0 + 0.01, rx1 + 0.04, bore + 0.018); M.sightY = scope(-0.08, 0.27, bore + 0.026, { r: 0.016, ro: 0.031, re: 0.021, h: 0.04 }); M.scope = true;
    bipod(0.36, bore - 0.034, 0.22); M.rear = xr; M.support = [0.3, bore - 0.038]; M.eject = [0.06, bore, 0.018]; return G;
  },
  // fusil antimatériel : énorme frein de bouche, canon flûté, châssis squelette, verrou
  calibre50: () => {
    const G = new Gun(), M = G.meta, bore = 0.086, rx0 = -0.13, rx1 = 0.2, mz = 0.86, xr = -0.43, w = 0.044;
    add('DarkMetal', ext(cham([[rx0, bore - 0.034], [rx1, bore - 0.034], [rx1, bore + 0.028], [rx0 + 0.02, bore + 0.028], [rx0, bore + 0.012]], 0.005), w, 0.008));
    add('Black', ext(cham([[rx1, bore - 0.034], [0.52, bore - 0.03], [0.52, bore - 0.012], [rx1, bore - 0.012]], 0.004), 0.04, 0.008)); if (!LO) { for (let i = 0; i < 5; i++) add('Black2', box(0.036, 0.008, 0.0412, rx1 + 0.04 + i * 0.058, bore - 0.022)); add('Black2', box(0.11, 0.022, 0.002, 0.06, bore + 0.006, w / 2)); pins([[rx1 - 0.02, bore - 0.02], [rx0 + 0.03, bore - 0.02], [0.02, bore + 0.016]], w, 0.004); }
    add('DarkMetal', tube(0.019, 0.015, rx1, mz, bore)); if (!LO) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const g = box(0.42, 0.004, 0.0014, 0.52, 0, 0.0166); g.rotateX(a); g.translate(0, bore, 0); add('Black2', g); }
    add('DarkMetal', pipe(0.008, 0.014, mz, mz + 0.03, bore)); for (let i = 0; i < 2; i++) { add('DarkMetal', ext(cham(rect(mz + 0.03 + i * 0.05, mz + 0.045 + i * 0.05, bore - 0.03, bore + 0.03), 0.004), 0.1, 0.006)); add('DarkMetal', pipe(0.008, 0.016, mz + 0.045 + i * 0.05, mz + 0.08 + i * 0.05, bore)); }
    add('DarkMetal', ext(cham(rect(mz + 0.13, mz + 0.142, bore - 0.026, bore + 0.026), 0.004), 0.07, 0.005)); M.muzzle = [mz + 0.142, bore];
    G.part('bolt', [rx0 + 0.03, bore + 0.006, 0], () => { add('LightMetal', tube(0.011, 0.011, -0.03, 0.04, 0, 0, 12)); add('LightMetal', box(0.01, 0.01, 0.046, 0.02, -0.008, 0.04)); const k = new THREE.SphereGeometry(0.013, LO ? 6 : 12, LO ? 4 : 8); k.translate(0.02, -0.02, 0.066); add('Black2', k); }); M.bolt = { travel: 0.1, lift: true, handle: [rx0 + 0.05, bore - 0.014, 0.066] };
    grip('Black', 'Grip', 1.05); guard(0.026, 0.09, bore - 0.034, 0.004, 0.012, 'DarkMetal'); G.part('mag', null, () => { M.mag = magazine(0.14, bore - 0.036, { w: 0.1, h: 0.1, lean: 0.05, th: 0.032, rib: 2 }); }); M.magDir = [0.05, -1];
    // crosse squelette : deux tubes, plaque de couche réglable, béquille arrière
    for (const y of [bore + 0.008, bore - 0.06]) add('DarkMetal', tube(0.008, 0.008, xr + 0.01, rx0, y, 0, 10)); add('Black', ext(cham(rect(xr + 0.09, rx0 - 0.04, bore + 0.014, bore + 0.036), 0.005), 0.034, 0.008)); add('Rubber', ext(cham(rect(xr, xr + 0.018, bore - 0.11, bore + 0.03), 0.004), 0.04, 0.005)); add('DarkMetal', tubeY(0.006, bore - 0.14, bore - 0.06, xr + 0.07)); add('Rubber', tubeY(0.011, bore - 0.146, bore - 0.138, xr + 0.07));
    rail(rx0 + 0.02, rx1 + 0.06, bore + 0.028, 0.022); M.sightY = scope(-0.09, 0.3, bore + 0.036, { r: 0.017, ro: 0.034, re: 0.022, h: 0.044 }); M.scope = true;
    bipod(0.44, bore - 0.03, 0.26); add('Black', ext(cham([[0.26, bore + 0.028], [0.3, bore + 0.06], [0.42, bore + 0.06], [0.46, bore + 0.018], [0.44, bore + 0.018], [0.41, bore + 0.048], [0.31, bore + 0.048], [0.285, bore + 0.028]], 0.004), 0.012, 0.003));
    M.rear = xr; M.support = [0.32, bore - 0.034]; M.eject = [0.06, bore, w / 2]; return G;
  },
  // fusil-mitrailleur : boîte à bande, capot, garde-main ventilé, poignée de transport, bipied
  mitrailleuse: () => {
    const G = carbine({ bore: 0.08, rx0: -0.11, rx1: 0.19, hx1: 0.42, mz: 0.56, xr: -0.36, st: 'skel', hg: 'heat', body: 'DarkMetal', low: 'DarkMetal', furn: 'Black', hr: 0.027, br: 0.0105, magx: 0.11, muz: 'flash', bip: true, optic: 'irons', top: 0.08 + 0.022, w: 0.04 }), M = G.meta, bore = 0.08;
    // la boîte à bande remplace le chargeur
    G.groups.mag.parts.length = 0; G.part('mag', null, () => { add('Green', ext(cham([[0.045, 0.03], [0.185, 0.03], [0.19, -0.085], [0.04, -0.085]], 0.008), 0.07, 0.008)); add('Black2', ext(cham(rect(0.05, 0.18, 0.026, 0.04), 0.003), 0.05, 0.004)); if (!LO) { add('Black2', box(0.1, 0.004, 0.072, 0.115, -0.02)); add('Brass', box(0.03, 0.012, 0.02, 0.12, 0.05, 0.03)); } }); M.mag = [0.115, -0.085]; M.magDir = [0, -1];
    cur = G.groups.body.parts;
    G.part('cover', [0.16, bore + 0.022, 0], () => { add('DarkMetal', ext(cham([[-0.25, 0], [0, 0], [0, 0.014], [-0.02, 0.02], [-0.23, 0.02], [-0.25, 0.012]], 0.004), 0.042, 0.006)); });
    add('Black', ext(cham([[0.3, bore + 0.03], [0.32, bore + 0.066], [0.4, bore + 0.066], [0.42, bore + 0.03], [0.405, bore + 0.03], [0.39, bore + 0.054], [0.33, bore + 0.054], [0.318, bore + 0.03]], 0.004), 0.012, 0.003));
    M.kind = 'belt'; return G;
  },
};

// ---------------------------------------------------------------- marquages et réticules (textures dessinées)
const TAGS = { rifle: 'FA-556  CAL 5,56', carabine: 'CT-4  CAL 5,56', carabine_sil: 'CT-4 SD  CAL 5,56', fusil_lourd: 'AR-762  CAL 7,62', ak_court: 'AR-762 C  CAL 7,62', chasse: 'CH-308  CAL 7,62', pm: 'PP-45  9×19', pm_vecteur: 'PV-9  9×19',
  dmr: 'TE-762  CAL 7,62', mitrailleuse: 'FM-556  CAL 5,56', pistol: 'P-17  9×19', pistolet_lourd: 'PL-45  CAL .45', pistolet_auto: 'PA-18  9×19', pistolet_match: 'PM-17 MATCH  9×19' };
const TEX = {};
function engraving(text) {
  if (TEX[text]) return TEX[text]; const c = document.createElement('canvas'), x = c.getContext('2d'); x.font = '600 44px "Arial Narrow", Arial, sans-serif'; const w = Math.ceil(x.measureText(text).width) + 16; c.width = w; c.height = 56;
  const y = c.getContext('2d'); y.font = '600 44px "Arial Narrow", Arial, sans-serif'; y.textBaseline = 'middle'; y.fillStyle = 'rgba(8,9,10,0.55)'; y.fillText(text, 9, 30); y.fillStyle = 'rgba(222,226,230,0.82)'; y.fillText(text, 8, 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (TEX[text] = { asp: w / 56, mat: new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, name: 'Marquage' }) });
}
function reticle(kind) {
  const key = 'ret:' + kind; if (TEX[key]) return TEX[key]; const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), m = 128;
  const glow = (r, a) => { const g = x.createRadialGradient(m, m, 0, m, m, r); g.addColorStop(0, `rgba(255,60,40,${a})`); g.addColorStop(1, 'rgba(255,40,30,0)'); x.fillStyle = g; x.beginPath(); x.arc(m, m, r, 0, 7); x.fill(); };
  if (kind === 'dot') { glow(20, 0.4); x.fillStyle = '#ff4a38'; x.beginPath(); x.arc(m, m, 6, 0, 7); x.fill(); x.fillStyle = '#ffd9d0'; x.beginPath(); x.arc(m, m, 2.5, 0, 7); x.fill(); }
  else { glow(22, 0.5); x.strokeStyle = 'rgba(255,80,60,0.95)'; x.lineWidth = 5; x.beginPath(); x.arc(m, m, 78, 0, 7); x.stroke(); x.fillStyle = '#ff6a56'; x.beginPath(); x.arc(m, m, 5, 0, 7); x.fill(); x.lineWidth = 5; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; x.beginPath(); x.moveTo(m + Math.cos(a) * 78, m + Math.sin(a) * 78); x.lineTo(m + Math.cos(a) * 100, m + Math.sin(a) * 100); x.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (TEX[key] = { asp: 1, mat: new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, name: 'Reticule' }) });
}

// ---------------------------------------------------------------- fabrique
const LOD_COL = { Black: '#24282d', Black2: '#191c20', Grey: '#4a4f57', Metal: '#676e78', DarkMetal: '#3a3f47', LightMetal: '#a9b0ba', Wood: '#8a5a3a', DarkWood: '#6a452e', Glass: '#16304d', GlassLens: '#22384a', Main: '#2f3740', MainLight: '#465563', MainDark: '#22282f', Green: '#4c573b', Tan: '#9a8563', Brass: '#b08a3e', Rubber: '#17191c', Grip: '#1d2024', GlowDot: '#e8f6e0' };
export const hasBuild = (id) => !!B[id];
// construit l'arme « id ». mat(nom) donne la matière ; lo : version légère (un seul maillage, couleurs par sommet)
export function buildGun(id, mat, lo = false) {
  LO = lo; TAG = TAGS[id] || null; const G = B[id](), W = WEAPONS[id]; LO = false; TAG = null;
  const model = new THREE.Group(), lodCol = lo ? (m) => C.set(LOD_COL[m] || '#333').clone() : null;
  if (lo) { const all = []; for (const [name, g] of Object.entries(G.groups)) for (const [m, geo] of g.parts) { if (m === 'GlassLens') continue; if (name !== 'body') geo.translate(...g.pivot); all.push([m, geo]); } model.add(...assemble(all, mat, lodCol).children); }
  else { for (const [name, g] of Object.entries(G.groups)) { const grp = assemble(g.parts, mat); grp.name = name; grp.position.set(...g.pivot); model.add(grp); }
    for (const d of G.decals) { const T = d.ret ? reticle(d.ret) : engraving(d.text), wd = d.h * T.asp, pl = new THREE.Mesh(new THREE.PlaneGeometry(wd, d.h), T.mat), piv = G.groups[d.grp].pivot;
      pl.geometry.rotateY(d.side === 0 ? -Math.PI / 2 : d.side < 0 ? Math.PI : 0); pl.geometry.translate(d.x - piv[0], d.y - piv[1], d.z - piv[2]); pl.renderOrder = d.ret ? 7 : 5; model.getObjectByName(d.grp).add(pl); } }
  // mise à la longueur réelle de la fiche de l'arme
  const box3 = new THREE.Box3().setFromObject(model), k = W.len ? W.len / (box3.max.x - box3.min.x) : 1;
  model.traverse((o) => { if (o.isMesh) o.geometry.scale(k, k, k); else o.position.multiplyScalar(k); });
  const M = G.meta, S = (a) => a && a.map((v) => v * k);
  const holder = new THREE.Group(); holder.add(model);
  const mz = new THREE.Object3D(); mz.position.set(M.muzzle[0] * k, M.muzzle[1] * k, 0); holder.add(mz); holder.userData.muzzle = mz;
  holder.userData.dim = { rear: box3.min.x * k, front: box3.max.x * k, top: box3.max.y * k, bot: box3.min.y * k, unit: 1 };
  holder.userData.meta = { kind: M.kind || 'mag', mag: S(M.mag), magDir: M.magDir || [0.18, -1], bolt: M.bolt ? { ...M.bolt, travel: M.bolt.travel * k, handle: S(M.bolt.handle) } : null, pump: M.pump ? { travel: M.pump.travel * k } : null,
    support: S(M.support), fore: S(M.fore), sightY: M.sightY * k, optic: M.optic || null, scope: !!M.scope, eject: S(M.eject), gb: M.gb != null ? M.gb * k : -0.057 * k, pistol: !!M.pistol, k };
  return holder;
}
