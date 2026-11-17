// Construit une carte à partir de son plan (cartes/<id>/plan.json) : une seule liste de volumes donne
//   - public/assets/<id>/map.glb        : le modèle 3D chargé par le jeu (fusionné par matière et par secteur)
//   - public/assets/<id>/gameplay.json  : collisions, étages, escaliers, zones, départs, boutiques, parkings
//   - cartes/<id>/scene.py              : le même modèle pour Blender / Higgsfield 3D Jutsu (voir, retoucher, exporter)
// Rien n'est recopié à la main : modifier le plan puis relancer `node cartes/construire.mjs centre`.
// Repère du jeu : x vers l'est, y vers le haut, z vers le sud (c'est aussi celui du glTF).
import fs from 'fs';
import { Document, NodeIO } from '@gltf-transform/core';

const id = process.argv[2] || 'centre';
const P = JSON.parse(fs.readFileSync(new URL(`./${id}/plan.json`, import.meta.url)));
const L = P.limites, B = P.batiment, SECT = P.secteur || 40;
const Y1 = 5, Y2 = 10, SLAB = 0.3, WT = 0.4, PARA = 0.7, DOOR_H = 3.2;

// ------------------------------------------------------------------ matières (couleur, rugosité, métal, émission)
const MATS = {
  asphalte: ['#3a3d42', 0.92, 0], marquage: ['#e8e8e2', 0.8, 0], trottoir: ['#a9a69e', 0.85, 0], dallage: ['#d8d2c4', 0.35, 0], dallage_etage: ['#cfc8b8', 0.4, 0],
  facade: ['#e9e4d8', 0.8, 0], facade_ocre: ['#d9a95b', 0.75, 0], facade_gris: ['#7d848c', 0.6, 0.2], beton: ['#9a9890', 0.9, 0], toit: ['#b7b4ac', 0.9, 0],
  cloison: ['#f2efe8', 0.7, 0], glass: ['#9fd0ea', 0.08, 0.1], glassRail: ['#bfe3f2', 0.08, 0.1], verriere: ['#8fc4e6', 0.1, 0.2], metal: ['#5d636b', 0.4, 0.8], metal_clair: ['#a8b0b8', 0.35, 0.8],
  enseigne: ['#ffcf4a', 0.5, 0, '#ffb030'], glow: ['#fff3d6', 0.5, 0, '#ffd890'], bois: ['#8a6440', 0.7, 0], vert: ['#4f8a46', 0.9, 0], leaf: ['#3f7a3a', 0.85, 0], tronc: ['#5a4030', 0.9, 0],
  eau: ['#3f7fb0', 0.05, 0.1], conteneur_rouge: ['#b23a2c', 0.6, 0.4], conteneur_bleu: ['#2f5f9a', 0.6, 0.4], conteneur_vert: ['#3f7a4a', 0.6, 0.4], conteneur_ocre: ['#c98a2c', 0.6, 0.4],
  camion: ['#e4e4e0', 0.5, 0.3], pneu: ['#1b1c1e', 0.9, 0], marchandise: ['#6a5a8a', 0.6, 0.1], lointain: ['#8f99a6', 0.95, 0],
};

// ------------------------------------------------------------------ volumes
const parts = []; // { grp, mat, kind: 'box'|'quad'|'prism', ... , name? (nœud séparé), col? }
const colliders = [], plats = [], rampes = [];
const box = (grp, mat, x0, y0, z0, x1, y1, z1, o = {}) => {
  [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
  parts.push({ grp, mat, kind: 'box', b: [x0, y0, z0, x1, y1, z1], name: o.name, extras: o.extras });
  if (o.col !== false && grp !== 'sol' && y1 - y0 > 0.05) colliders.push({ type: 'box', x: r2((x0 + x1) / 2), z: r2((z0 + z1) / 2), hx: r2((x1 - x0) / 2), hz: r2((z1 - z0) / 2), yaw: 0, y0: r2(y0), h: r2(y1 - y0), tag: o.tag || 'mur', ...(o.colx || {}) });
};
const r2 = (v) => Math.round(v * 100) / 100;
const plat = (pid, x0, z0, x1, z1, y, extra = {}) => plats.push({ id: pid, poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, escaladable: false, ...extra });
// dalle praticable : maillage « sol_ » (hauteur du sol) + plateforme
const slab = (pid, mat, x0, z0, x1, z1, y) => { box('sol', mat, x0, y - SLAB, z0, x1, y, z1); plat(pid, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y); };
// prisme vertical (colonnes, troncs, fontaine) : n côtés
const prism = (grp, mat, x, z, r, y0, y1, n = 8, o = {}) => { parts.push({ grp, mat, kind: 'prism', x, z, r, y0, y1, n }); if (o.col !== false) colliders.push({ type: 'circle', x, z, r: r2(r), h: r2(y1 - y0), y0, tag: o.tag || 'mobilier' }); };
const cone = (grp, mat, x, z, r, y0, y1, n = 8) => parts.push({ grp, mat, kind: 'prism', x, z, r, r1: 0.05, y0, y1, n });
// volée d'escalier ou escalator : rampe praticable de a à b (milieu bas/haut), largeur w ; rampe de jeu + garde-corps
function stair(sid, a, b, w, mat = 'beton') {
  const dx = b[0] - a[0], dz = b[2] - a[2], Ld = Math.hypot(dx, dz), ux = dx / Ld, uz = dz / Ld, px = -uz * w / 2, pz = ux * w / 2, T = 0.25;
  parts.push({ grp: 'sol', mat, kind: 'quad', q: [[a[0] + px, a[1], a[2] + pz], [a[0] - px, a[1], a[2] - pz], [b[0] - px, b[1], b[2] - pz], [b[0] + px, b[1], b[2] + pz]], t: T });
  for (const s of [1, -1]) parts.push({ grp: 'deco', mat: 'glassRail', kind: 'quad', q: [[a[0] + s * px, a[1], a[2] + s * pz], [b[0] + s * px, b[1], b[2] + s * pz], [b[0] + s * px, b[1] + 1, b[2] + s * pz], [a[0] + s * px, a[1] + 1, a[2] + s * pz]], t: 0.05 });
  rampes.push({ id: sid, a, b, largeur: w, marches: Math.round((b[1] - a[1]) / 0.18), palier: null });
}
// mur droit de (x0,z0) à (x1,z1) (parallèle à x ou z) avec ouvertures [{c (abscisse le long du mur), w, y0, y1}]
function wall(mat, x0, z0, x1, z1, ya, yb, holes = [], o = {}) {
  const alongX = Math.abs(z1 - z0) < 1e-6, s0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), s1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1), k = alongX ? z0 : x0, t = (o.t ?? WT) / 2;
  const B2 = (a, b, y0, y1) => { if (b - a < 0.05 || y1 - y0 < 0.05) return; alongX ? box('mur', mat, a, y0, k - t, b, y1, k + t, o) : box('mur', mat, k - t, y0, a, k + t, y1, b, o); };
  const H = holes.filter((h) => h.c - h.w / 2 < s1 && h.c + h.w / 2 > s0).sort((p, q) => p.c - q.c); let cur = s0;
  // découpe en bandes verticales : plein entre les ouvertures, allège et linteau autour de chacune
  const cuts = [...new Set([s0, s1, ...H.flatMap((h) => [Math.max(s0, h.c - h.w / 2), Math.min(s1, h.c + h.w / 2)])])].sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) { const a = cuts[i], b = cuts[i + 1], m = (a + b) / 2; const hs = H.filter((h) => m > h.c - h.w / 2 && m < h.c + h.w / 2).sort((p, q) => p.y0 - q.y0);
    let y = ya; for (const h of hs) { B2(a, b, y, h.y0); y = Math.max(y, h.y1); } B2(a, b, y, yb); }
}

// ------------------------------------------------------------------ sol, rues, parking
box('sol', 'asphalte', L.x0 - 30, -0.4, L.z0 - 30, L.x1 + 30, 0, L.z1 + 30);
const PK = P.parking.rect; box('sol', 'trottoir', PK[0], 0, PK[1], PK[2], 0.03, PK[3]);
for (const [x0, z, x1] of P.parking.rangees) { for (let x = x0; x <= x1 + 0.01; x += 2.8) box('deco', 'marquage', x - 0.06, 0.03, z - 2.4, x + 0.06, 0.05, z + 2.4, { col: false }); box('deco', 'marquage', x0, 0.03, z - 0.06, x1, 0.05, z + 0.06, { col: false }); }
for (const r of P.rues) { const [x0, z0, x1, z1] = r.rect; const alongX = x1 - x0 > z1 - z0; for (let s = (alongX ? x0 : z0) + 2; s < (alongX ? x1 : z1) - 3; s += 6) alongX ? box('deco', 'marquage', s, 0.01, (z0 + z1) / 2 - 0.08, s + 3, 0.02, (z0 + z1) / 2 + 0.08, { col: false }) : box('deco', 'marquage', (x0 + x1) / 2 - 0.08, 0.01, s, (x0 + x1) / 2 + 0.08, 0.02, s + 3, { col: false }); }
// terre-plein planté
for (const [x0, z0, x1, z1] of P.parking.terre_plein) { box('mur', 'beton', x0, 0, z0, x1, 0.3, z1, { tag: 'muret' }); box('deco', 'vert', x0 + 0.2, 0.3, z0 + 0.2, x1 - 0.2, 0.35, z1 - 0.2, { col: false });
  for (let x = x0 + 4; x < x1 - 2; x += 9) { prism('deco', 'tronc', x, (z0 + z1) / 2, 0.22, 0.3, 3.2, 6); cone('deco', 'leaf', x, (z0 + z1) / 2, 1.9, 2.4, 6.5, 7); } }
// abris
for (const a of P.parking.abris) {
  const [x0, z0, x1, z1] = a.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (a.type === 'muret') box('mur', 'beton', x0, 0, z0, x1, 1.05, z1, { tag: 'muret' });
  else if (a.type === 'kiosque') { box('mur', 'bois', x0, 0, z0, x1, 1.1, z1, { tag: 'muret' }); box('mur', 'bois', x0, 0, z0, x0 + 0.4, 3, z1); box('mur', 'bois', x1 - 0.4, 0, z0, x1, 3, z1); box('mur', 'bois', x0, 0, z0, x1, 3, z0 + 0.4);
    box('mur', 'facade_ocre', x0 - 0.8, 3, z0 - 0.8, x1 + 0.8, 3.4, z1 + 0.8, { col: false }); box('deco', 'enseigne', cx - 2.5, 3.4, z1 + 0.4, cx + 2.5, 4.1, z1 + 0.6, { col: false }); }
  else if (a.type === 'chariots') { box('mur', 'metal', x0, 0, z1 - 0.3, x1, 1.2, z1, { tag: 'muret' }); for (const x of [x0, x1 - 0.15]) for (const z of [z0, z1 - 0.15]) prism('deco', 'metal', x + 0.07, z + 0.07, 0.07, 0, 2.4, 4, { col: false });
    box('mur', 'verriere', x0 - 0.3, 2.4, z0 - 0.3, x1 + 0.3, 2.55, z1 + 0.3, { col: false }); for (let x = x0 + 0.6; x < x1 - 0.5; x += 1.2) box('deco', 'metal_clair', x, 0, z0 + 0.5, x + 0.7, 1, z1 - 0.6, { col: false }); }
  else if (a.type === 'camion') { const along = x1 - x0 > z1 - z0; const [u0, u1] = along ? [x0, x1] : [z0, z1]; const c = along ? cz : cx; const cab = 2.6;
    const B3 = (s0, y0, s1, y1, w, mat, o) => along ? box('mur', mat, s0, y0, c - w, s1, y1, c + w, o) : box('mur', mat, c - w, y0, s0, c + w, y1, s1, o);
    B3(u0, 0.9, u1 - cab, 4, 1.25, 'camion', { tag: 'vehicule' }); B3(u1 - cab, 0.9, u1, 3, 1.2, 'conteneur_bleu', { tag: 'vehicule' }); B3(u0 + 1, 0, u1 - 0.6, 0.9, 1.15, 'pneu', { tag: 'vehicule' }); }
  else if (a.type === 'conteneur') { const along = x1 - x0 > z1 - z0; const pal = ['conteneur_rouge', 'conteneur_bleu', 'conteneur_vert', 'conteneur_ocre']; const mat = pal[(Math.abs(Math.round(cx * 7 + cz * 3))) % 4];
    const stacked = /empil/i.test(a.nom), open = /ouvert/i.test(a.nom), H = 2.6;
    if (open) { // on le traverse dans sa longueur : deux flancs et un toit
      if (along) { box('mur', mat, x0, 0, z0, x1, H, z0 + 0.15, { tag: 'conteneur' }); box('mur', mat, x0, 0, z1 - 0.15, x1, H, z1, { tag: 'conteneur' }); }
      else { box('mur', mat, x0, 0, z0, x0 + 0.15, H, z1, { tag: 'conteneur' }); box('mur', mat, x1 - 0.15, 0, z0, x1, H, z1, { tag: 'conteneur' }); }
      box('mur', mat, x0, H - 0.15, z0, x1, H, z1, { col: false }); colliders.push({ type: 'box', x: r2(cx), z: r2(cz), hx: r2((x1 - x0) / 2), hz: r2((z1 - z0) / 2), yaw: 0, y0: H - 0.15, h: 0.15, tag: 'conteneur' }); plat('toit_cont_' + Math.round(cx) + '_' + Math.round(cz), x0, z0, x1, z1, H, { escaladable: true });
    } else { box('mur', mat, x0, 0, z0, x1, H, z1, { tag: 'conteneur' }); plat('toit_cont_' + Math.round(cx) + '_' + Math.round(cz), x0, z0, x1, z1, H, { escaladable: true });
      if (stacked) { const m2 = pal[(pal.indexOf(mat) + 2) % 4]; box('mur', m2, x0 + (along ? 3 : 0), H, z0 + (along ? 0 : 3), x1, 2 * H, z1, { tag: 'conteneur' }); } }
    // nervures (lecture de la tôle ondulée), sans collision
    for (let s = (along ? x0 : z0) + 0.6; s < (along ? x1 : z1) - 0.4; s += 0.9) along ? box('deco', mat, s, 0.2, z0 - 0.04, s + 0.12, H - 0.2, z1 + 0.04, { col: false }) : box('deco', mat, x0 - 0.04, 0.2, s, x1 + 0.04, H - 0.2, s + 0.12, { col: false }); }
}
// lampadaires du parking
for (const [x, z] of [[-66, 8], [-30, 8], [6, 8], [-66, 40], [-30, 40], [6, 40]]) { prism('deco', 'metal', x, z, 0.12, 0, 7, 6); box('deco', 'glow', x - 0.5, 6.8, z - 0.25, x + 0.5, 7.05, z + 0.25, { col: false }); }

// ------------------------------------------------------------------ bâtiment : sols, murs, boutiques, étage, toit
const wings = [...B.ailes.map((a) => a.rect), B.atrium.rect];
for (const [x0, z0, x1, z1] of wings) box('sol', 'dallage', x0, 0, z0, x1, 0.15, z1);
// entrées : ouverture dans le mur extérieur le plus proche
const entr = B.entrees.map(([x, z, n]) => ({ x, z, n }));
const holesOn = (axis, k, s0, s1) => entr.filter((e) => (axis === 'x' ? Math.abs(e.z - k) < 1 && e.x > s0 && e.x < s1 : Math.abs(e.x - k) < 1 && e.z > s0 && e.z < s1)).map((e) => ({ c: axis === 'x' ? e.x : e.z, w: 4, y0: 0.15, y1: DOOR_H }));
// portes de l'étage vers la terrasse de l'arcade, et passages des escaliers du toit dans l'acrotère
const upDoors = { south: [-45, 0], west: [15] }; const roofGaps = P.toitAcces || [];
const gapsAt = (axis, k) => roofGaps.filter((g) => g.axis === axis && Math.abs(g.k - k) < 1).map((g) => ({ c: g.c, w: 3, y0: Y2, y1: Y2 + PARA + 0.1 }));
const ext = (x0, z0, x1, z1, extra = []) => { const axis = Math.abs(z1 - z0) < 1e-6 ? 'x' : 'z', k = axis === 'x' ? z0 : x0, s0 = axis === 'x' ? Math.min(x0, x1) : Math.min(z0, z1), s1 = axis === 'x' ? Math.max(x0, x1) : Math.max(z0, z1);
  wall('facade', x0, z0, x1, z1, 0, Y2 + PARA, [...holesOn(axis, k, s0, s1), ...extra, ...gapsAt(axis, k)]); };
// enveloppe du L (les limites communes entre ailes et atrium restent ouvertes)
const [NX0, NZ0, NX1, NZ1] = B.ailes[0].rect, [EX0, EZ0, EX1, EZ1] = B.ailes[1].rect, [AX0, AZ0, AX1, AZ1] = B.atrium.rect;
ext(NX0, NZ0, AX1, NZ0); ext(AX1, AZ0, EX1, EZ1); ext(EX0, EZ1, EX1, EZ1); ext(EX0, EZ0, EX0, EZ1, upDoors.west.map((c) => ({ c, w: 3, y0: Y1, y1: Y1 + 2.6 }))); ext(NX0, NZ1, NX1, NZ1, upDoors.south.map((c) => ({ c, w: 3, y0: Y1, y1: Y1 + 2.6 }))); ext(NX0, NZ0, NX0, NZ1);
// bandeaux de façade (lecture des deux niveaux) et grandes baies vitrées de l'étage, sans collision
for (const [x0, z0, x1, z1] of [[NX0, NZ0, AX1, NZ0], [NX0, NZ1, NX1, NZ1], [EX0, EZ1, EX1, EZ1]]) { box('deco', 'facade_gris', x0, Y1 - 0.4, z0 - 0.3, x1, Y1, z1 + 0.3, { col: false }); }
for (const [x0, z0, x1, z1] of [[AX1, AZ0, EX1, EZ1], [EX0, EZ0, EX0, EZ1], [NX0, NZ0, NX0, NZ1]]) { box('deco', 'facade_gris', x0 - 0.3, Y1 - 0.4, z0, x1 + 0.3, Y1, z1, { col: false }); }
// boutiques : cloisons, vitrines cassables (nœuds VITRINE_), enseigne, butin (nœuds BUTIN_)
const LUXE = /bijoux|luxe|parfum|mode/i, LOOTS = { luxe: [['montre', 'Montre', 1400, 'epique', 0.3], ['bijou', 'Collier', 1800, 'epique', 0.2], ['sac', 'Sac en cuir', 900, 'rare', 1.5], ['parfum', 'Parfum', 260, 'commun', 0.5]], commerce: [['telephone', 'Téléphone', 700, 'rare', 0.3], ['console', 'Console de jeu', 550, 'rare', 3], ['casque', 'Casque audio', 350, 'commun', 0.4], ['baskets', 'Baskets', 520, 'rare', 1]] };
const galleries = B.ailes.map((a) => a.galerie);
const boutiques = []; let recel = null;
B.boutiques.forEach(([x0, z0, x1, z1, nom], i) => {
  // façade : le côté qui touche une galerie (ou l'atrium)
  const touch = (gx0, gz0, gx1, gz1) => [[z1, 'S', Math.abs(z1 - gz0) < 0.5 && x0 < gx1 && x1 > gx0], [z0, 'N', Math.abs(z0 - gz1) < 0.5 && x0 < gx1 && x1 > gx0], [x1, 'E', Math.abs(x1 - gx0) < 0.5 && z0 < gz1 && z1 > gz0], [x0, 'W', Math.abs(x0 - gx1) < 0.5 && z0 < gz1 && z1 > gz0]].find((t) => t[2]);
  let f = null; for (const g of [...galleries, B.atrium.rect]) { f = touch(...g); if (f) break; } if (!f) return; const side = f[1];
  const sid = 'plz_' + String(i + 1).padStart(2, '0'), gamme = /receleur/i.test(nom) ? 'receleur' : LUXE.test(nom) ? 'luxe' : 'commerce';
  const alongX = side === 'N' || side === 'S', k = side === 'S' ? z1 : side === 'N' ? z0 : side === 'E' ? x1 : x0, s0 = alongX ? x0 : z0, s1 = alongX ? x1 : z1, mid = (s0 + s1) / 2;
  const nrm = side === 'S' ? [0, 0, 1] : side === 'N' ? [0, 0, -1] : side === 'E' ? [1, 0, 0] : [-1, 0, 0];
  // cloisons latérales (rez-de-chaussée)
  if (alongX) { for (const x of [x0, x1]) box('mur', 'cloison', x - 0.12, 0.15, z0, x + 0.12, Y1 - SLAB, z1); } else { for (const z of [z0, z1]) box('mur', 'cloison', x0, 0.15, z - 0.12, x1, Y1 - SLAB, z + 0.12); }
  // linteau au-dessus des vitrines, enseigne lumineuse
  const P2 = (a, b, y0, y1, t, mat, o) => alongX ? box(o?.grp || 'mur', mat, a, y0, k - t, b, y1, k + t, o) : box(o?.grp || 'mur', mat, k - t, y0, a, k + t, y1, b, o);
  P2(s0, DOOR_H, s1, Y1 - SLAB, 0.2, 'facade_gris'); P2(mid - Math.min(4, (s1 - s0) / 3), DOOR_H + 0.3, mid + Math.min(4, (s1 - s0) / 3), DOOR_H + 1.2, 0.3, 'enseigne', { col: false, grp: 'deco' });
  // vitrines de part et d'autre de la porte (2,4 m)
  const vits = [];
  [[s0 + 0.15, mid - 1.2], [mid + 1.2, s1 - 0.15]].forEach(([a, b], j) => { if (b - a < 0.8) return; const vid = `${sid}_v${j + 1}`, c = (a + b) / 2;
    const cen = alongX ? [r2(c), r2((0.15 + DOOR_H) / 2), k] : [k, r2((0.15 + DOOR_H) / 2), r2(c)];
    P2(a, 0.15, b, DOOR_H, 0.06, 'glass', { name: 'VITRINE_' + vid, tag: 'vitrine', colx: { vitrine: vid, boutique: sid } });
    P2(a, 0.15, b, 0.6, 0.12, 'facade_gris', { col: false, grp: 'deco' });
    vits.push({ id: vid, centre: cen, largeur: r2(b - a), hauteur: r2(DOOR_H - 0.15), normale: nrm, pv: gamme === 'luxe' ? 160 : 120 }); });
  // intérieur : présentoirs et butin
  const inner = [[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5], [x1 - 0.5, z1 - 0.5], [x0 + 0.5, z1 - 0.5]];
  const back = (d) => (side === 'S' ? [mid, z1 - d] : side === 'N' ? [mid, z0 + d] : side === 'E' ? [x1 - d, mid] : [x0 + d, mid]);
  const butin = [];
  if (gamme !== 'receleur') { const items = LOOTS[gamme]; for (let j = 0; j < 3; j++) { const [cx, cz] = back(4 + j * 3.5); const off = (j - 1) * 2.2; const px = cx + (alongX ? off : 0), pz = cz + (alongX ? 0 : off);
    box('mur', 'bois', px - 0.8, 0.15, pz - 0.5, px + 0.8, 1.05, pz + 0.5, { tag: 'mobilier' }); const [type, nm, val, rar, kg] = items[(i + j) % items.length]; const bid = `${sid}_b${j + 1}`;
    box('deco', 'marchandise', px - 0.25, 1.05, pz - 0.2, px + 0.25, 1.35, pz + 0.2, { col: false, name: 'BUTIN_' + bid }); butin.push({ id: bid, type, nom: nm, valeur: val, rarete: rar, poids: kg, pos: [r2(px), 1.2, r2(pz)] }); } }
  const [dx, dz] = back(-0.8);
  const b = { id: sid, gamme, enseigne: nom.toUpperCase(), theme: nom, porte: { pos: [r2(dx), 0.16, r2(dz)], yaw: Math.atan2(nrm[0], nrm[2]) }, vitrines: vits, interieur: { poly: inner, sol_y: 0.15, hauteur: Y1 - SLAB }, butin };
  boutiques.push(b); if (gamme === 'receleur') recel = b;
});
// étage : dalles autour des vides des galeries, passerelles, palier de l'atrium
const bridges = { nord: [[-56, -52], [-32, -28], [8, 12]], est: [[14, 22], [42, 48]] };
const [ng0, ngz0, ng1, ngz1] = B.ailes[0].galerie, [eg0, egz0, eg1, egz1] = B.ailes[1].galerie;
slab('etage_nord_n', 'dallage_etage', NX0, NZ0, NX1, ngz0, Y1); slab('etage_nord_s', 'dallage_etage', NX0, ngz1, NX1, NZ1, Y1);
for (const [a, b] of bridges.nord) slab(`passerelle_nord_${a}`, 'dallage_etage', a, ngz0, b, ngz1, Y1);
slab('etage_est_o', 'dallage_etage', EX0, EZ0, eg0, EZ1, Y1); slab('etage_est_e', 'dallage_etage', eg1, EZ0, EX1, EZ1, Y1);
for (const [a, b] of bridges.est) slab(`passerelle_est_${a}`, 'dallage_etage', eg0, a, eg1, b, Y1);
slab('atrium_n', 'dallage_etage', AX0, AZ0, AX1, AZ0 + 6, Y1); slab('atrium_e', 'dallage_etage', AX1 - 6, AZ0 + 6, AX1, AZ1, Y1); slab('atrium_o', 'dallage_etage', AX0, AZ0 + 6, AX0 + 6, AZ1, Y1);
// garde-corps vitrés le long des vides (on voit et on tire au travers ; collision à hauteur de hanche)
const rail = (x0, z0, x1, z1, skips = []) => { const alongX = Math.abs(z1 - z0) < 1e-6; wall('glassRail', x0, z0, x1, z1, Y1, Y1 + 1.05, skips.map(([a, b]) => ({ c: (a + b) / 2, w: b - a, y0: Y1 - 1, y1: Y1 + 2 })), { t: 0.08, tag: 'garde_corps' }); };
rail(NX0, ngz0, NX1, ngz0, bridges.nord); rail(NX0, ngz1, NX1, ngz1, bridges.nord);
rail(eg0, EZ0, eg0, EZ1, bridges.est); rail(eg1, EZ0, eg1, EZ1, bridges.est);
rail(AX0 + 6, AZ0 + 6, AX1 - 6, AZ0 + 6); rail(AX1 - 6, AZ0 + 6, AX1 - 6, AZ1); rail(AX0 + 6, AZ0 + 6, AX0 + 6, AZ1, [[-34, -30]]);
// mobilier de l'étage (couvert) : jardinières, bancs
for (const [x, z] of [[-60, -55], [-36, -55], [-12, -55], [18, -55], [-50, -29], [-24, -29], [16, -29], [37, -5], [37, 30], [63, 2], [63, 33]]) box('mur', 'beton', x - 1.6, Y1, z - 0.6, x + 1.6, Y1 + 1, z + 0.6, { tag: 'muret' });
// toit praticable, acrotère, centrales de ventilation, verrière de l'atrium
slab('toit_nord', 'toit', NX0, NZ0, NX1, NZ1, Y2); slab('toit_est', 'toit', EX0, EZ0, EX1, EZ1, Y2); slab('toit_atrium_bord_n', 'toit', AX0, AZ0, AX1, AZ0 + 2, Y2); slab('toit_atrium_bord_e', 'toit', AX1 - 2, AZ0, AX1, AZ1, Y2);
box('deco', 'verriere', AX0, Y2 + 0.4, AZ0 + 2, AX1 - 2, Y2 + 0.55, AZ1, { col: false });
for (let x = AX0 + 4; x < AX1 - 2; x += 4) box('deco', 'metal', x, Y2 + 0.3, AZ0 + 2, x + 0.2, Y2 + 0.7, AZ1, { col: false });
colliders.push({ type: 'box', x: (AX0 + AX1 - 2) / 2, z: (AZ0 + 2 + AZ1) / 2, hx: (AX1 - 2 - AX0) / 2, hz: (AZ1 - AZ0 - 2) / 2, yaw: 0, y0: Y2 + 0.3, h: 0.4, tag: 'verriere' });
for (const [x, z, w, d] of [[-55, -50, 6, 4], [-25, -32, 4, 6], [5, -52, 6, 3], [40, 2, 4, 7], [62, 26, 5, 5], [40, 46, 6, 4]]) box('mur', 'metal_clair', x - w / 2, Y2, z - d / 2, x + w / 2, Y2 + 1.8, z + d / 2, { tag: 'clim' });
// fontaine de l'atrium
{ const [fx, fz, fr] = B.atrium.fontaine; prism('mur', 'dallage', fx, fz, fr, 0.15, 0.75, 12, { tag: 'muret' }); prism('deco', 'eau', fx, fz, fr - 0.4, 0.75, 0.8, 12, { col: false }); prism('mur', 'facade_gris', fx, fz, 0.9, 0.75, 3, 8, { tag: 'mobilier' }); }
// arcade : colonnes, terrasse praticable à l'étage (avec la trémie de l'escalier), garde-corps
const AH = [-20, -17, -10, -14]; // trémie de l'escalier de l'arcade
for (let x = NX0 + 4; x <= 20; x += 8) prism('mur', 'facade', x, -14.4, 0.35, 0, Y1 - SLAB, 8, { tag: 'colonne' });
for (let z = -6; z <= 56; z += 8) prism('mur', 'facade', 22.4, z, 0.35, 0, Y1 - SLAB, 8, { tag: 'colonne' });
slab('terrasse_n_o', 'dallage_etage', NX0, NZ1, AH[0], -14, Y1); slab('terrasse_n_trem', 'dallage_etage', AH[0], NZ1, AH[2], AH[1], Y1); slab('terrasse_n_e', 'dallage_etage', AH[2], NZ1, 30, -14, Y1); slab('terrasse_e', 'dallage_etage', 22, -14, 30, 58, Y1);
box('sol', 'dallage', NX0, 0, NZ1, 30, 0.12, -14); box('sol', 'dallage', 22, 0, -14, 30, 0.12, 58);
wall('glassRail', NX0, -14, AH[0], -14, Y1, Y1 + 1.05, [], { t: 0.08, tag: 'garde_corps' }); wall('glassRail', AH[2], -14, 22, -14, Y1, Y1 + 1.05, [], { t: 0.08, tag: 'garde_corps' }); wall('glassRail', 22, -14, 22, 58, Y1, Y1 + 1.05, [[26, 50]].length ? [] : [], { t: 0.08, tag: 'garde_corps' });
wall('glassRail', AH[0], AH[1], AH[2], AH[1], Y1, Y1 + 1.05, [], { t: 0.08, tag: 'garde_corps' });
// escaliers et escalators (montée à l'étage), escaliers du toit
for (const m of B.montees) stair(m.id, m.a, m.b, m.l || 2.4, m.type === 'escalator' ? 'metal_clair' : 'beton');
for (const g of roofGaps) if (g.palier) slab('palier_' + g.id, 'beton', ...g.palier, Y2);
// décor lointain : silhouettes d'immeubles autour du terrain (sans collision ni ombre)
for (const [x0, z0, x1, z1, h] of [[-140, -140, -95, -90, 28], [-130, -60, -95, 10, 18], [-140, 30, -100, 120, 34], [-60, 95, 10, 135, 22], [30, 95, 110, 140, 40], [95, 0, 140, 80, 26], [100, -100, 150, -20, 32], [-40, -140, 60, -100, 24]]) box('deco', 'lointain', x0, 0, z0, x1, h, z1, { col: false, name: undefined, grp2: 'decor_lointain' });
// limites de la carte (murs invisibles)
for (const [x, z, hx, hz] of [[(L.x0 + L.x1) / 2, L.z0 - 0.5, (L.x1 - L.x0) / 2 + 1, 0.5], [(L.x0 + L.x1) / 2, L.z1 + 0.5, (L.x1 - L.x0) / 2 + 1, 0.5], [L.x0 - 0.5, (L.z0 + L.z1) / 2, 0.5, (L.z1 - L.z0) / 2 + 1], [L.x1 + 0.5, (L.z0 + L.z1) / 2, 0.5, (L.z1 - L.z0) / 2 + 1]]) colliders.push({ type: 'box', x, z, hx, hz, yaw: 0, y0: -2, h: 40, tag: 'limite' });

// ------------------------------------------------------------------ gameplay.json
const spawnGrid = (r, n, yaw) => { const [x0, z0, x1, z1] = r, out = []; const cols = Math.ceil(Math.sqrt(n * (x1 - x0) / (z1 - z0))), rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) { const c = i % cols, w = (i / cols) | 0; out.push({ x: r2(x0 + (c + 0.5) * (x1 - x0) / cols), z: r2(z0 + (w + 0.5) * (z1 - z0) / rows), yaw, y: 0 }); } return out; };
const base = (team, r) => colliders.push({ type: 'poly', id: 'base_' + team, poly: [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], y0: 0, h: 0.02, tag: 'base' });
base('ordre', P.spawns.ordre.base || P.spawns.ordre.rect); base('civils', P.spawns.civils.base || P.spawns.civils.rect);
const parkings = []; P.parking.rangees.forEach(([x0, z, x1], ri) => { for (let x = x0 + 1.4, k = 0; x < x1; x += 2.8, k++) if ((k + ri) % 3 === 0) parkings.push({ id: `P${parkings.length + 1}`, x: r2(x), z: r2(z + (ri % 2 ? 0.2 : -0.2)), y: 0, yaw: ri % 2 ? 0 : Math.PI, gabarit: 'voiture', rue: 'parking' }); });
const gp = {
  version: 1, id: P.id, nom: P.nom, joueurs: P.joueurs, unite: 'mètre', axes: 'x est, y haut, z sud', source: `cartes/${P.id}/plan.json (généré par cartes/construire.mjs)`,
  limites: L, zones: P.zones.map((z) => ({ id: z.id, name: z.nom, center: z.pos, radius: 4, y: z.niveau ? Y1 + 0.05 : 0.17 })),
  spawns: { ordre: spawnGrid(P.spawns.ordre.rect, 20, Math.PI / 2), civils: spawnGrid(P.spawns.civils.rect, 20, Math.PI) }, lobby: P.salon || [-30, 20, 0],
  realisme: {}, cassables: [], parkings, colliders, plateformes: plats, rampes, boutiques,
  revente: recel ? [{ id: 'receleur', nom: 'Le receleur du centre', boutique: recel.id, pos: recel.porte.pos, rayon: 2.5, prix: { commun: 0.35, rare: 0.4, epique: 0.45, legendaire: 0.5 }, bonus: {} }] : [],
};

// ------------------------------------------------------------------ géométrie : faces de chaque volume
function geomOf(p) {
  const V = [], I = [];
  const quad = (a, b, c, d) => { const n = V.length / 3; V.push(...a, ...b, ...c, ...d); I.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  if (p.kind === 'box') { const [x0, y0, z0, x1, y1, z1] = p.b;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); }
  else if (p.kind === 'quad') { const [a, b, c, d] = p.q, t = p.t; const e1 = sub(b, a), e2 = sub(d, a); let n = cross(e1, e2); const l = Math.hypot(...n); n = n.map((v) => (v / l) * t);
    const A = [a, b, c, d], Bq = A.map((v) => sub(v, n)); quad(...A); quad(Bq[3], Bq[2], Bq[1], Bq[0]); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(Bq[i], Bq[j], A[j], A[i]); } }
  else { const { x, z, r, y0, y1, n } = p, r1 = p.r1 ?? r; for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const P0 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], P1 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r], Q0 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1], Q1 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
      quad(P1, P0, Q0, Q1); const c = V.length / 3; V.push(x, y1, z, ...Q1, ...Q0); I.push(c, c + 1, c + 2); } }
  return { V, I };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// normales plates : un sommet par face
function flat({ V, I }) { const P2 = [], N = []; for (let i = 0; i < I.length; i += 3) { const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3; const A = V.slice(a, a + 3), Bv = V.slice(b, b + 3), C = V.slice(c, c + 3);
  let n = cross(sub(Bv, A), sub(C, A)); const l = Math.hypot(...n) || 1; n = n.map((v) => v / l); P2.push(...A, ...Bv, ...C); N.push(...n, ...n, ...n); } return { P: P2, N }; }

// ------------------------------------------------------------------ map.glb : fusion par groupe, matière et secteur
const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene(P.id); const root = doc.createNode(P.id); scene.addChild(root);
const mats = {}; const matOf = (m) => mats[m] ||= (() => { const [c, r, me, e] = MATS[m] || ['#ff00ff', 0.5, 0]; const hex = (h) => [1, 3, 5].map((i) => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2));
  const M = doc.createMaterial(m).setBaseColorFactor([...hex(c), /glass|verriere|eau/.test(m) ? 0.45 : 1]).setRoughnessFactor(r).setMetallicFactor(me); if (/glass|verriere|eau/.test(m)) M.setAlphaMode('BLEND'); if (e) M.setEmissiveFactor(hex(e)); return M; })();
const groups = new Map(); let tris = 0;
const sectorOf = (p) => { const c = p.kind === 'box' ? [(p.b[0] + p.b[3]) / 2, (p.b[2] + p.b[5]) / 2] : p.kind === 'quad' ? [(p.q[0][0] + p.q[2][0]) / 2, (p.q[0][2] + p.q[2][2]) / 2] : [p.x, p.z]; return `${Math.floor((c[0] - L.x0) / SECT)}${Math.floor((c[1] - L.z0) / SECT)}`; };
const addMesh = (name, mat, list, extras) => { let P2 = [], N = []; for (const p of list) { const f = flat(geomOf(p)); P2 = P2.concat(f.P); N = N.concat(f.N); } tris += P2.length / 9;
  const prim = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P2)).setBuffer(buf)).setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf)).setMaterial(matOf(mat));
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)); if (extras) node.setExtras(extras); root.addChild(node); };
for (const p of parts) { if (p.name) { addMesh(p.name, p.mat, [p], p.extras); continue; } const big = p.grp === 'sol' && p.kind === 'box' && (p.b[3] - p.b[0] > 2 * SECT || p.b[5] - p.b[2] > 2 * SECT);
  const key = p.grp2 ? `${p.grp2}_${p.mat}` : `${p.grp}_${p.mat}_s${big ? 'X' : sectorOf(p)}`; if (!groups.has(key)) groups.set(key, { mat: p.mat, list: [] }); groups.get(key).list.push(p); }
for (const [k, g] of groups) addMesh(k, g.mat, g.list);
gp.triangles = Math.round(tris);
const outDir = new URL(`../public/assets/${P.id}/`, import.meta.url); fs.mkdirSync(outDir, { recursive: true });
await new NodeIO().write(new URL('map.glb', outDir).pathname, doc);
fs.writeFileSync(new URL('gameplay.json', outDir), JSON.stringify(gp));

// ------------------------------------------------------------------ scene.py : la même carte pour Blender (Higgsfield 3D Jutsu)
// Repère Blender : x = x du jeu, y = −z du jeu, z = hauteur. Un objet par groupe fusionné, mêmes noms que dans map.glb.
const py = [`# Frungz : carte « ${P.nom} », générée par cartes/construire.mjs depuis cartes/${P.id}/plan.json. Ne pas retoucher à la main : relancer le générateur.`,
  'import bpy, bmesh', 'for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)',
  'col = bpy.data.collections.get("FRUNGZ_MAP") or bpy.data.collections.new("FRUNGZ_MAP")', 'if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)',
  `MATS = ${JSON.stringify(Object.fromEntries(Object.keys(mats).map((m) => [m, MATS[m]])))}`,
  'def mat(n):', '    m = bpy.data.materials.get(n)', '    if m: return m', '    c, r, me = MATS[n][0], MATS[n][1], MATS[n][2]', '    m = bpy.data.materials.new(n); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]',
  '    rgb = [pow(int(c[i:i+2], 16) / 255, 2.2) for i in (1, 3, 5)]', '    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = r; b.inputs["Metallic"].default_value = me',
  '    if len(MATS[n]) > 3: e = MATS[n][3]; b.inputs["Emission Color"].default_value = (*[pow(int(e[i:i+2], 16) / 255, 2.2) for i in (1, 3, 5)], 1); b.inputs["Emission Strength"].default_value = 1.5',
  '    if n in ("glass", "glassRail", "verriere", "eau"): b.inputs["Alpha"].default_value = 0.45', '    return m',
  'def obj(name, m, V, F):', '    me = bpy.data.meshes.new(name); me.from_pydata([(v[0], -v[2], v[1]) for v in V], [], F); me.update()', '    o = bpy.data.objects.new(name, me); o.data.materials.append(mat(m)); col.objects.link(o); return o'];
const pyMesh = (name, mat, list) => { let V = [], F = []; for (const p of list) { const g = geomOf(p), o = V.length / 3; V = V.concat(g.V); for (let i = 0; i < g.I.length; i += 3) F.push([g.I[i] + o, g.I[i + 1] + o, g.I[i + 2] + o]); }
  const VV = []; for (let i = 0; i < V.length; i += 3) VV.push([r2(V[i]), r2(V[i + 1]), r2(V[i + 2])]); py.push(`obj(${JSON.stringify(name)}, ${JSON.stringify(mat)}, ${JSON.stringify(VV)}, ${JSON.stringify(F)})`); };
for (const p of parts) if (p.name) pyMesh(p.name, p.mat, [p]);
for (const [k, g] of groups) pyMesh(k, g.mat, g.list);
py.push(`result = {"objets": len(col.objects), "triangles": sum(len(o.data.polygons) for o in col.objects)}`);
fs.writeFileSync(new URL(`./${P.id}/scene.py`, import.meta.url), py.join('\n') + '\n');
// version compacte pour Higgsfield (le service limite la taille d'un envoi) : volumes décrits par quelques nombres, compressés ;
// Blender les redéploie lui-même (cartes/<id>/scene-compact.py)
{ const zlib = await import('zlib'); const R = (v) => Math.round(v * 100) / 100;
  const enc = (p) => (p.kind === 'box' ? ['b', ...p.b.map(R)] : p.kind === 'quad' ? ['q', ...p.q.flat().map(R), R(p.t)] : ['p', R(p.x), R(p.z), R(p.r), R(p.r1 ?? p.r), R(p.y0), R(p.y1), p.n]);
  const data = { mats: Object.fromEntries(Object.keys(mats).map((m) => [m, MATS[m]])), objs: [...parts.filter((p) => p.name).map((p) => [p.name, p.mat, [enc(p)]]), ...[...groups].map(([k, g]) => [k, g.mat, g.list.map(enc)])] };
  const b64 = zlib.deflateSync(Buffer.from(JSON.stringify(data)), { level: 9 }).toString('base64');
  fs.writeFileSync(new URL(`./${P.id}/scene-compact.py`, import.meta.url), `# Frungz : carte « ${P.nom} » pour Blender / Higgsfield, version compacte (générée par cartes/construire.mjs).
import bpy, json, zlib, base64, math
D = json.loads(zlib.decompress(base64.b64decode("${b64}")))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
col = bpy.data.collections.get("FRUNGZ_MAP") or bpy.data.collections.new("FRUNGZ_MAP")
if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)
def mat(n):
    m = bpy.data.materials.get(n)
    if m: return m
    c, r, me = D["mats"][n][:3]; m = bpy.data.materials.new(n); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    lin = lambda h: [pow(int(h[i:i+2], 16) / 255, 2.2) for i in (1, 3, 5)]
    b.inputs["Base Color"].default_value = (*lin(c), 1); b.inputs["Roughness"].default_value = r; b.inputs["Metallic"].default_value = me
    if len(D["mats"][n]) > 3: b.inputs["Emission Color"].default_value = (*lin(D["mats"][n][3]), 1); b.inputs["Emission Strength"].default_value = 1.5
    if n in ("glass", "glassRail", "verriere", "eau"): b.inputs["Alpha"].default_value = 0.45
    return m
def geo(p, V, F):
    o = len(V)
    if p[0] == "b":
        x0, y0, z0, x1, y1, z1 = p[1:]; V += [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        F += [[o+a, o+b, o+c, o+d] for a, b, c, d in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))]
    elif p[0] == "q":
        q = [p[1+3*i:4+3*i] for i in range(4)]; t = p[13]
        e1 = [q[1][i]-q[0][i] for i in range(3)]; e2 = [q[3][i]-q[0][i] for i in range(3)]
        n = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]; l = math.sqrt(sum(c*c for c in n)) or 1; n = [c/l*t for c in n]
        V += [tuple(v) for v in q] + [tuple(v[i]-n[i] for i in range(3)) for v in q]
        F += [[o, o+1, o+2, o+3], [o+7, o+6, o+5, o+4]] + [[o+4+i, o+4+(i+1)%4, o+(i+1)%4, o+i] for i in range(4)]
    else:
        x, z, r, r1, y0, y1, n = p[1:]
        for i in range(n):
            a = 2*math.pi*i/n; V += [(x+math.cos(a)*r, y0, z+math.sin(a)*r), (x+math.cos(a)*r1, y1, z+math.sin(a)*r1)]
        F += [[o+2*i, o+2*((i+1)%n), o+2*((i+1)%n)+1, o+2*i+1] for i in range(n)] + [[o+2*i+1 for i in range(n)][::-1]]
for name, m, plist in D["objs"]:
    V, F = [], []
    for p in plist: geo(p, V, F)
    me = bpy.data.meshes.new(name); me.from_pydata([(v[0], -v[2], v[1]) for v in V], [], F); me.update(); me.validate()
    for poly in me.polygons: poly.use_smooth = False
    ob = bpy.data.objects.new(name, me); ob.data.materials.append(mat(m)); col.objects.link(ob)
# repère du jeu (x est, y haut, z sud) → Blender (x, -z, y) ; faces orientées vers l'extérieur
for ob in col.objects:
    import bmesh; bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
result = {"objets": len(col.objects), "triangles": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in col.objects)}
`); }
console.log(`${P.nom} : ${groups.size + parts.filter((p) => p.name).length} objets, ${Math.round(tris / 1000)} k triangles, ${colliders.length} collisions, ${plats.length} plateformes, ${rampes.length} escaliers, ${boutiques.length} boutiques, ${parkings.length} places de voiture · scene.py ${Math.round(fs.statSync(new URL(`./${P.id}/scene.py`, import.meta.url)).size / 1024)} Ko`);
