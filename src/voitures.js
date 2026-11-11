// Voitures de la ville, générées par le jeu (aucun modèle tiers) : carrosserie galbée, vitres affleurantes,
// passages de roue, optiques, calandre, plaques, rétroviseurs, poignées, jantes en alliage, pneus à sculptures,
// disques et étriers, intérieur visible à travers le pare-brise. Sportives génériques, sans marque ni logo.
//
// Méthode : la caisse est une surface « lissée » entre des couples (sections transversales) le long de la voiture.
// Chaque couple dépend du profil de côté (bas de caisse, ligne de ceinture, toit), de la largeur vue de dessus
// (avant et arrière arrondis en super-ellipse) et du rentré du pavillon. Les vitres sont des zones de cette même
// surface, légèrement en retrait ; les optiques et la calandre sont des « décalques » collés sur la surface,
// tous dans un seul atlas de textures (un seul dessin pour tous les détails).
//
// Convention (identique aux anciens .glb) : mètres, sol y = 0, avant +Z, gauche +X ; nœuds wheel-front-left/right,
// wheel-back-left/right (pivot au centre), seat-driver, door-driver ; userData.size = [largeur, hauteur, longueur].
// Toutes les pièces sont construites sans échelle négative : la fusion des voitures garées (game.js) reste correcte.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// interpolation cubique monotone (pas de dépassement entre deux points de contrôle)
function curve(pts) {
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---------------------------------------------------------------- atlas des détails (optiques, calandres, plaque, sérigraphies)
const AW = 2048, AH = 1024;
const R = {
  phareA: [0, 0, 512, 160], phareB: [512, 0, 512, 160], phareC: [1024, 0, 256, 160],
  feuA: [0, 176, 512, 112], feuB: [512, 176, 512, 112],
  grilleA: [1024, 176, 512, 192], grilleB: [1536, 176, 512, 192], grilleC: [1536, 0, 512, 160],
  plaque: [1290, 0, 236, 52], plaqueAr: [1290, 60, 236, 52], prise: [0, 300, 512, 96],
  police: [0, 416, 2048, 128], policeCapot: [0, 560, 768, 128], taxi: [800, 560, 400, 96], rampe: [1216, 560, 512, 96],
  carbone: [0, 704, 256, 256], nid: [272, 704, 256, 256], danger: [544, 704, 512, 128], grille2: [544, 848, 256, 128],
};
// cases de couleur unie (u, v au centre) : pièces pleines qui partagent le même matériau que les optiques
const SOLID = { vert: '#2f8f4e', marine: '#1c3f8f', kaki: '#4f5a35', rouge: '#c8141b', jaune: '#e8b400', bleuLum: '#1f5bff', rougeLum: '#ff1a10', orange: '#ff8a00', blanc: '#f2f2f2', noir: '#0b0b0c', gris: '#6b6e72', miroir: '#9fb3c4', chrome: '#c9ccd0', ambre: '#ffb000' };
const SOLID_LIT = new Set(['bleuLum', 'rougeLum', 'orange', 'ambre']);
const solidCell = {}; Object.keys(SOLID).forEach((k, i) => { solidCell[k] = [1760 + (i % 7) * 36, 704 + Math.floor(i / 7) * 36, 32, 32]; });

let _atlas = null;
function atlas() {
  if (_atlas) return _atlas;
  const mk = () => { const c = document.createElement('canvas'); c.width = AW; c.height = AH; return c; };
  const C = mk(), E = mk(), g = C.getContext('2d'), e = E.getContext('2d');
  g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, AW, AH); e.fillStyle = '#000'; e.fillRect(0, 0, AW, AH);
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const grad = (c, x0, y0, x1, y1, stops) => { const G = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => G.addColorStop(o, col)); return G; };
  // projecteur : réflecteur chromé, lentille, bague
  const lens = (x, y, r) => {
    const G = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); G.addColorStop(0, '#f4f6f8'); G.addColorStop(0.5, '#8d949b'); G.addColorStop(1, '#2a2d31');
    g.fillStyle = '#1a1c1f'; g.beginPath(); g.arc(x, y, r * 1.25, 0, 7); g.fill(); g.fillStyle = G; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, 7); g.fill();
  };
  // optiques découpées (alpha) : à gauche de chaque case = côté extérieur de la voiture pour les phares, côté intérieur pour les feux
  const shape = (c, rect, pts) => { const [x, y, w, h] = rect; c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo : c.moveTo).call(c, x + px * w, y + py * h)); c.closePath(); };
  const lightBox = (rect, pts, draw) => { const [x, y, w, h] = rect; g.clearRect(x, y, w, h); e.clearRect(x, y, w, h); g.save(); e.save(); shape(g, rect, pts); g.clip(); shape(e, rect, pts); e.clip(); e.fillStyle = '#000'; e.fillRect(x, y, w, h); draw(x, y, w, h); g.restore(); e.restore();
    shape(g, rect, pts); g.strokeStyle = 'rgba(150,155,162,0.9)'; g.lineWidth = 3; g.stroke(); };
  // phare A (sportive) : effilé, deux petits projecteurs, signature LED en virgule
  lightBox(R.phareA, [[0, 0.05], [0.55, 0.12], [1, 0.42], [0.98, 0.95], [0.45, 0.8], [0.04, 0.6]], (x, y, w, h) => {
    g.fillStyle = grad(g, x, y, x, y + h, [[0, '#30343a'], [0.5, '#0b0c0e'], [1, '#202328']]); g.fillRect(x, y, w, h);
    lens(x + w * 0.5, y + h * 0.5, h * 0.15); lens(x + w * 0.72, y + h * 0.6, h * 0.14);
    for (const c of [g, e]) { c.strokeStyle = '#fff'; c.lineWidth = h * 0.07; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + w * 0.06, y + h * 0.16); c.lineTo(x + w * 0.55, y + h * 0.24); c.quadraticCurveTo(x + w * 0.9, y + h * 0.42, x + w * 0.93, y + h * 0.8); c.stroke(); }
    g.fillStyle = '#ffae00'; g.fillRect(x + w * 0.06, y + h * 0.42, w * 0.18, h * 0.07); });
  // phare B (berline, citadine) : trapèze, réflecteur chromé, projecteur, feu de jour en ligne haute
  lightBox(R.phareB, [[0, 0.1], [0.55, 0.04], [1, 0.3], [0.98, 0.9], [0.45, 0.82], [0.02, 0.55]], (x, y, w, h) => {
    g.fillStyle = grad(g, x, y, x, y + h, [[0, '#d8dce0'], [0.35, '#7d838a'], [1, '#2a2d32']]); g.fillRect(x, y, w, h);
    g.fillStyle = '#16181b'; g.fillRect(x + w * 0.38, y + h * 0.3, w * 0.5, h * 0.55);
    lens(x + w * 0.52, y + h * 0.58, h * 0.19); lens(x + w * 0.76, y + h * 0.58, h * 0.16);
    for (const c of [g, e]) { c.strokeStyle = '#fff'; c.lineWidth = h * 0.065; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + w * 0.05, y + h * 0.18); c.lineTo(x + w * 0.6, y + h * 0.12); c.lineTo(x + w * 0.95, y + h * 0.28); c.stroke(); }
    g.fillStyle = '#ffa400'; g.fillRect(x + w * 0.06, y + h * 0.4, w * 0.24, h * 0.18); });
  // phare C (utilitaire, 4x4) : rectangulaire, deux réflecteurs, feu de jour en bas
  lightBox(R.phareC, [[0, 0.04], [1, 0.04], [1, 0.96], [0, 0.96]], (x, y, w, h) => {
    g.fillStyle = grad(g, x, y, x, y + h, [[0, '#c8ccd1'], [0.5, '#5e646b'], [1, '#25282c']]); g.fillRect(x, y, w, h);
    g.fillStyle = '#1a1c1f'; g.fillRect(x + w * 0.42, y + h * 0.2, w * 0.5, h * 0.5); lens(x + w * 0.67, y + h * 0.45, h * 0.17);
    for (const c of [g, e]) { c.fillStyle = '#fff'; c.fillRect(x + w * 0.06, y + h * 0.78, w * 0.88, h * 0.07); }
    g.fillStyle = '#ffa400'; g.fillRect(x + w * 0.08, y + h * 0.3, w * 0.24, h * 0.3); });
  // feux arrière A : lame effilée rouge fumé, trois lignes LED
  lightBox(R.feuA, [[0, 0.35], [0.7, 0.04], [1, 0.08], [1, 0.92], [0.55, 0.85], [0, 0.72]], (x, y, w, h) => {
    g.fillStyle = grad(g, x, y, x, y + h, [[0, '#4a0505'], [0.5, '#230202'], [1, '#3d0404']]); g.fillRect(x, y, w, h);
    for (const c of [g, e]) { c.strokeStyle = c === g ? '#ff4030' : '#d01408'; c.lineWidth = h * 0.08; c.lineCap = 'round'; for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(x + w * 0.04, y + h * (0.5 + i * 0.16)); c.lineTo(x + w * 0.65, y + h * (0.22 + i * 0.22)); c.lineTo(x + w * 0.96, y + h * (0.25 + i * 0.3)); c.stroke(); } }
    g.fillStyle = '#d9d9d9'; g.fillRect(x + w * 0.7, y + h * 0.66, w * 0.22, h * 0.12); });
  // feux arrière B : bloc rouge à alvéoles, recul blanc et clignotant
  lightBox(R.feuB, [[0, 0.1], [1, 0.02], [1, 0.98], [0, 0.9]], (x, y, w, h) => {
    g.fillStyle = '#6e0909'; g.fillRect(x, y, w, h); g.fillStyle = '#9a0f0f'; for (let i = 0; i < 12; i++) g.fillRect(x + 10 + i * (w - 20) / 12, y + 10, (w - 20) / 12 - 4, h * 0.5);
    e.fillStyle = '#6a0604'; e.fillRect(x, y, w, h * 0.62);
    g.fillStyle = '#ececec'; g.fillRect(x + w * 0.08, y + h * 0.68, w * 0.36, h * 0.2); g.fillStyle = '#e88a00'; g.fillRect(x + w * 0.56, y + h * 0.68, w * 0.36, h * 0.2); });
  // calandres : nid d'abeille noir (sport), lames chromées (berline), maille (utilitaire)
  { const [x, y, w, h] = R.grilleA; g.fillStyle = '#030303'; g.fillRect(x, y, w, h); g.strokeStyle = '#2a2c30'; g.lineWidth = 3;
    for (let j = 0; j < 14; j++) for (let i = 0; i < 26; i++) { const cx = x + 10 + i * 19.5 + (j % 2) * 9.7, cy = y + 8 + j * 13.5; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 6.5); } g.closePath(); g.stroke(); }
    g.strokeStyle = '#3a3d42'; g.lineWidth = 8; g.strokeRect(x + 4, y + 4, w - 8, h - 8); }
  { const [x, y, w, h] = R.grilleB; g.fillStyle = '#050505'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = grad(g, 0, y + 14 + i * 30, 0, y + 26 + i * 30, [[0, '#f2f4f6'], [0.5, '#8a9097'], [1, '#2a2d31']]); g.fillRect(x + 10, y + 14 + i * 30, w - 20, 11); }
    g.strokeStyle = '#d6d9dd'; g.lineWidth = 10; g.strokeRect(x + 5, y + 5, w - 10, h - 10); }
  { const [x, y, w, h] = R.grilleC; g.fillStyle = '#101113'; g.fillRect(x, y, w, h); g.fillStyle = '#26292d';
    for (let i = 0; i < 9; i++) g.fillRect(x + 10, y + 12 + i * 16, w - 20, 7); }
  // plaques (format européen, numéro fictif)
  for (const [k, txt] of [['plaque', 'GZ-424-FR'], ['plaqueAr', 'FR-075-GZ']]) { const [x, y, w, h] = R[k]; g.fillStyle = k === 'plaque' ? '#f4f4f0' : '#f4f4f0'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1d3e9c'; g.fillRect(x, y, 22, h); g.fillRect(x + w - 22, y, 22, h); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('F', x + 11, y + h - 8); g.fillText('75', x + w - 11, y + h - 8);
    g.fillStyle = '#ffcc00'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.fillRect(x + 11 + Math.cos(a) * 6 - 1, y + 16 + Math.sin(a) * 6 - 1, 2, 2); }
    g.fillStyle = '#111'; g.font = 'bold 34px "Arial Narrow", Arial, sans-serif'; g.fillText(txt, x + w / 2, y + 39); g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  // prise d'air / diffuseur
  { const [x, y, w, h] = R.prise; g.fillStyle = '#050506'; g.fillRect(x, y, w, h); g.fillStyle = '#1b1d20'; for (let i = 0; i < 9; i++) g.fillRect(x + 12 + i * 56, y, 8, h); }
  // sérigraphie Police (bande bleue, filet tricolore, lettrage)
  { const [x, y, w, h] = R.police; g.fillStyle = '#f4f5f6'; g.fillRect(x, y, w, h); g.fillStyle = '#1b2a6b'; g.fillRect(x, y + h * 0.18, w, h * 0.56);
    g.fillStyle = '#1b2a6b'; g.fillRect(x, y + h * 0.82, w * 0.34, h * 0.08); g.fillStyle = '#f4f5f6'; g.fillRect(x + w * 0.34, y + h * 0.82, w * 0.33, h * 0.08); g.fillStyle = '#d0142b'; g.fillRect(x + w * 0.67, y + h * 0.82, w * 0.33, h * 0.08);
    g.fillStyle = '#fff'; g.font = 'bold 66px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLICE', x + w * 0.5, y + h * 0.47); g.font = 'bold 30px Arial'; g.fillText('17', x + w * 0.88, y + h * 0.47); }
  { const [x, y, w, h] = R.policeCapot; g.fillStyle = '#1b2a6b'; g.fillRect(x, y, w, h); g.fillStyle = '#fff'; g.font = 'bold 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLICE', x + w / 2, y + h / 2 + 4); }
  { const [x, y, w, h] = R.taxi; g.fillStyle = '#f2f2f2'; g.fillRect(x, y, w, h); g.fillStyle = '#111'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TAXI PARISIEN', x + w / 2, y + h / 2); e.fillStyle = '#5a6a55'; e.fillRect(x, y, w, h); }
  // rampe de gyrophares (lentilles bleues sur fond chromé)
  { const [x, y, w, h] = R.rampe; g.fillStyle = '#2b2e33'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 6; i++) { const cx = x + 8 + i * (w - 16) / 6; g.fillStyle = i === 2 || i === 3 ? '#e8e8e8' : '#1d4dff'; g.fillRect(cx + 3, y + 10, (w - 16) / 6 - 6, h - 20); e.fillStyle = i === 2 || i === 3 ? '#222' : '#0a2a9a'; e.fillRect(cx + 3, y + 10, (w - 16) / 6 - 6, h - 20); } }
  // carbone et maille
  { const [x, y, w, h] = R.carbone; for (let j = 0; j < h; j += 8) for (let i = 0; i < w; i += 8) { g.fillStyle = (i + j) / 8 % 2 ? '#1a1b1d' : '#2a2c30'; g.fillRect(x + i, y + j, 8, 8); } }
  { const [x, y, w, h] = R.nid; g.fillStyle = '#060606'; g.fillRect(x, y, w, h); g.fillStyle = '#202225'; for (let j = 0; j < h; j += 10) for (let i = (j / 10 % 2) * 5; i < w; i += 10) g.fillRect(x + i, y + j, 5, 5); }
  { const [x, y, w, h] = R.danger; g.fillStyle = '#f2c200'; g.fillRect(x, y, w, h); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = '#111'; for (let i = -h; i < w; i += 64) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + 32, y + h); g.lineTo(x + i + 32 + h, y); g.lineTo(x + i + h, y); g.fill(); } g.restore(); }
  { const [x, y, w, h] = R.grille2; g.fillStyle = '#0b0c0d'; g.fillRect(x, y, w, h); g.strokeStyle = '#3a3e44'; g.lineWidth = 3; for (let i = 6; i < w; i += 12) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i, y + h); g.stroke(); } for (let j = 6; j < h; j += 12) { g.beginPath(); g.moveTo(x, y + j); g.lineTo(x + w, y + j); g.stroke(); } }
  for (const [k, col] of Object.entries(SOLID)) { const [x, y, w, h] = solidCell[k]; g.fillStyle = col; g.fillRect(x, y, w, h); if (SOLID_LIT.has(k)) { e.fillStyle = col; e.fillRect(x, y, w, h); } }
  const T = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; return t; };
  _atlas = { map: T(C), emissive: T(E) };
  return _atlas;
}
export const ATLAS = R;
export const uvOf = (rect) => [rect[0] / AW, rect[1] / AH, (rect[0] + rect[2]) / AW, (rect[1] + rect[3]) / AH];
export const solidUV = (k) => { const [x, y, w, h] = solidCell[k]; return [(x + w / 2) / AW, (y + h / 2) / AH]; };

// ---------------------------------------------------------------- matériaux partagés
const _mats = new Map();
export function mats(hq) {
  const key = hq ? 'hq' : 'lq'; if (_mats.has(key)) return _mats.get(key);
  const P = hq ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial, A = atlas();
  const tread = treadTexture();
  const m = {
    glass: new P({ name: 'car_vitre', color: '#0b0e12', roughness: 0.02, metalness: 0.2, envMapIntensity: 1.7, ...(hq ? { clearcoat: 1, clearcoatRoughness: 0.0 } : {}) }),
    trim: new P({ name: 'car_noir_brillant', color: '#09090a', roughness: 0.18, metalness: 0.1, envMapIntensity: 1.2, ...(hq ? { clearcoat: 0.8, clearcoatRoughness: 0.08 } : {}) }),
    plastic: new THREE.MeshStandardMaterial({ name: 'car_plastique', color: '#131416', roughness: 0.78, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ name: 'car_alu', color: '#c4c8cd', roughness: 0.22, metalness: 1, envMapIntensity: 1.3 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'car_pneu', color: '#171718', roughness: 0.92, metalness: 0, bumpMap: tread, bumpScale: 2.2 }),
    detail: new P({ name: 'car_optiques', map: A.map, alphaTest: 0.5, emissiveMap: A.emissive, emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.12, metalness: 0.15, ...(hq ? { clearcoat: 1, clearcoatRoughness: 0.02 } : {}), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    // ombre de contact sous la voiture (pose la voiture sur le sol, même quand l'ombre du soleil part loin)
    contact: new THREE.MeshBasicMaterial({ name: 'car_ombre_contact', map: contactTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false }),
    interior: new THREE.MeshStandardMaterial({ name: 'car_interieur', color: '#1d1e20', roughness: 0.85, metalness: 0 }),
  };
  _mats.set(key, m); return m;
}
const _paints = new Map();
// peintures : métallisée (paillettes = un peu de métal, vernis brillant) ou unie
export function paint(hex, hq, { metal = 0.55, rough = 0.32, mat = false } = {}) {
  const k = `${hex}|${hq}|${metal}|${rough}|${mat}`; if (_paints.has(k)) return _paints.get(k);
  const p = hq ? new THREE.MeshPhysicalMaterial({ name: 'car_peinture', color: hex, metalness: metal, roughness: mat ? 0.6 : rough, clearcoat: mat ? 0.15 : 1, clearcoatRoughness: mat ? 0.4 : 0.03, envMapIntensity: 1.15 })
    : new THREE.MeshStandardMaterial({ name: 'car_peinture', color: hex, metalness: metal * 0.8, roughness: mat ? 0.6 : 0.3, envMapIntensity: 1.1 });
  _paints.set(k, p); return p;
}
function contactTexture() {
  // la voiture couvre le centre (≈ 66 % × 84 %) : ombre dense dessous, qui s'estompe sur ~50 cm autour
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'), d = g.createImageData(64, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 64; i++) { const x = Math.max(0, Math.abs(i - 31.5) / 32 - 0.6) / 0.4, y = Math.max(0, Math.abs(j - 63.5) / 64 - 0.8) / 0.2; const r = Math.min(1, Math.hypot(x, y)); const a = Math.pow(1 - r, 2.2) * 0.8; const k = (j * 64 + i) * 4; d.data[k + 3] = a * 255; }
  g.putImageData(d, 0, 0); return new THREE.CanvasTexture(c);
}
function treadTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 64, 256);
  // sculptures : rainures longitudinales + lamelles obliques sur la bande de roulement (milieu du profil)
  g.fillStyle = '#1a1a1a'; for (const v of [0.4, 0.5, 0.6]) g.fillRect(0, v * 256 - 2, 64, 4);
  for (let i = 0; i < 64; i += 8) { g.save(); g.translate(i, 0); g.fillRect(0, 0.36 * 256, 3, 0.28 * 256); g.restore(); }
  // flanc : légère texture en relief (inscriptions illisibles)
  g.fillStyle = '#6e6e6e'; for (let i = 0; i < 64; i += 16) g.fillRect(i, 0.14 * 256, 10, 6);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(12, 1); return t;
}

// ---------------------------------------------------------------- modèles
// z0/z1 : arrière/avant ; W : demi-largeur ; ax : essieux [arrière, avant] ; R : rayon de roue ; top : profil du dessus [z, y] (de l'arrière vers l'avant)
// cowl / roofF / roofR / deck : pied de pare-brise, haut de pare-brise, haut de lunette, bas de lunette (z) ; belt : ligne de ceinture [z, y]
// win : fenêtres latérales [zArrière, zAvant] ; G : rentré du pavillon (demi-largeur du toit / demi-largeur) ; pf / pr : arrondi avant/arrière vu de dessus
const MODELS = {
  // berlinette à moteur central : très basse, pare-brise couché, grandes prises d'air
  berlinette: { L: 4.45, W: 0.97, ax: [-1.3, 1.32], R: 0.345, tw: 0.27, clear: 0.12, G: 0.7, pf: 2.6, pr: 3.2, capF: 0.62, capR: 0.5,
    top: [[-2.225, 0.72], [-2.2, 0.86], [-2.0, 0.98], [-1.55, 1.0], [-0.55, 1.18], [-0.15, 1.2], [0.25, 1.17], [1.1, 0.9], [1.7, 0.78], [2.08, 0.7], [2.225, 0.56]],
    belt: [[-2.225, 0.86], [-1.0, 0.92], [0.4, 0.86], [1.1, 0.84], [2.225, 0.6]], bot: [[-2.225, 0.3], [-1.9, 0.2], [0, 0.12], [1.9, 0.14], [2.225, 0.22]],
    cowl: 1.1, roofF: 0.25, roofR: -0.55, deck: -1.5, win: [[-0.62, 1.0]], quarter: [-1.15, -0.65], phare: 'A', feu: 'A', grille: 'A', rim: 'sport', caliper: 'jaune', sport: true, intakes: true, wing: 0.06, pipes: 2 },
  // grand coupé GT : long capot, habitacle reculé, fastback
  gt: { L: 4.75, W: 0.98, ax: [-1.42, 1.45], R: 0.355, tw: 0.27, clear: 0.13, G: 0.72, pf: 2.8, pr: 3.4, capF: 0.6, capR: 0.5,
    top: [[-2.375, 0.78], [-2.35, 0.92], [-2.15, 1.0], [-1.7, 1.03], [-0.85, 1.25], [-0.35, 1.3], [0.05, 1.28], [0.75, 0.99], [1.6, 0.9], [2.22, 0.78], [2.375, 0.62]],
    belt: [[-2.375, 0.9], [-1.0, 0.98], [0.75, 0.92], [2.375, 0.68]], bot: [[-2.375, 0.32], [-2.0, 0.2], [0, 0.13], [2.0, 0.15], [2.375, 0.24]],
    cowl: 0.75, roofF: 0.05, roofR: -0.85, deck: -1.68, win: [[-0.95, 0.66]], phare: 'A', feu: 'A', grille: 'A', rim: 'sport', caliper: 'rouge', sport: true, pipes: 4 },
  // coupé 2+2
  coupe: { L: 4.5, W: 0.93, ax: [-1.3, 1.35], R: 0.34, tw: 0.25, clear: 0.13, G: 0.74, pf: 3, pr: 3.2, capF: 0.58, capR: 0.52,
    top: [[-2.25, 0.78], [-2.22, 0.92], [-2.0, 1.0], [-1.55, 1.04], [-0.7, 1.3], [-0.2, 1.34], [0.2, 1.32], [0.9, 1.0], [1.6, 0.9], [2.1, 0.8], [2.25, 0.64]],
    belt: [[-2.25, 0.9], [-1.0, 0.98], [0.9, 0.92], [2.25, 0.7]], bot: [[-2.25, 0.32], [-1.9, 0.2], [0, 0.14], [1.9, 0.16], [2.25, 0.25]],
    cowl: 0.9, roofF: 0.2, roofR: -0.7, deck: -1.5, win: [[-0.85, 0.82]], phare: 'A', feu: 'A', grille: 'A', rim: 'sport', caliper: 'rouge', sport: true, pipes: 2 },
  // citadine 5 portes
  citadine: { L: 4.05, W: 0.88, ax: [-1.25, 1.33], R: 0.31, tw: 0.2, clear: 0.15, G: 0.84, pf: 2.6, pr: 3.2, capF: 0.55, capR: 0.42,
    top: [[-2.025, 0.85], [-2.0, 1.05], [-1.92, 1.32], [-1.75, 1.47], [-1.2, 1.5], [0.2, 1.5], [0.55, 1.45], [1.15, 1.04], [1.7, 0.94], [1.92, 0.87], [2.025, 0.72]],
    belt: [[-2.025, 1.05], [-1.0, 1.02], [1.15, 0.96], [2.025, 0.75]], bot: [[-2.025, 0.38], [-1.7, 0.2], [0, 0.15], [1.7, 0.18], [2.025, 0.26]],
    cowl: 1.15, roofF: 0.5, roofR: -1.72, deck: -1.96, win: [[-0.35, 1.05], [-1.62, -0.45]], bpil: -0.4, phare: 'B', feu: 'B', grille: 'B', rim: 'ville', caliper: null },
  // berline
  berline: { L: 4.75, W: 0.92, ax: [-1.4, 1.42], R: 0.33, tw: 0.23, clear: 0.15, G: 0.82, pf: 2.8, pr: 3.4, capF: 0.6, capR: 0.55,
    top: [[-2.375, 0.84], [-2.35, 0.98], [-2.15, 1.06], [-1.65, 1.1], [-0.85, 1.42], [-0.3, 1.47], [0.3, 1.46], [1.05, 1.06], [1.8, 0.96], [2.22, 0.87], [2.375, 0.72]],
    belt: [[-2.375, 1.0], [-1.0, 1.02], [1.05, 0.96], [2.375, 0.74]], bot: [[-2.375, 0.36], [-2.0, 0.21], [0, 0.15], [2.0, 0.17], [2.375, 0.26]],
    cowl: 1.05, roofF: 0.32, roofR: -0.85, deck: -1.6, win: [[-0.12, 1.0], [-1.02, -0.22]], bpil: -0.17, phare: 'B', feu: 'B', grille: 'B', rim: 'ville', caliper: 'gris' },
  // SUV
  suv: { L: 4.85, W: 0.98, ax: [-1.45, 1.45], R: 0.39, tw: 0.27, clear: 0.22, G: 0.8, pf: 3, pr: 3.6, capF: 0.58, capR: 0.48,
    top: [[-2.425, 1.0], [-2.4, 1.2], [-2.3, 1.55], [-2.1, 1.72], [-1.6, 1.76], [0.15, 1.77], [0.5, 1.72], [1.2, 1.25], [1.9, 1.15], [2.3, 1.06], [2.425, 0.9]],
    belt: [[-2.425, 1.22], [-1.0, 1.2], [1.2, 1.16], [2.425, 0.92]], bot: [[-2.425, 0.48], [-2.0, 0.3], [0, 0.22], [2.0, 0.28], [2.425, 0.36]],
    cowl: 1.2, roofF: 0.48, roofR: -2.1, deck: -2.36, win: [[-0.1, 1.15], [-1.3, -0.2]], quarter: [-2.0, -1.4], bpil: -0.15, phare: 'A', feu: 'A', grille: 'B', rim: 'suv', caliper: 'gris', cladding: true, rails: true },
  // break
  break: { L: 4.8, W: 0.92, ax: [-1.42, 1.42], R: 0.33, tw: 0.23, clear: 0.15, G: 0.83, pf: 2.8, pr: 3.6, capF: 0.6, capR: 0.45,
    top: [[-2.4, 0.86], [-2.38, 1.05], [-2.3, 1.36], [-2.12, 1.45], [-1.6, 1.47], [0.3, 1.47], [1.05, 1.06], [1.8, 0.96], [2.25, 0.87], [2.4, 0.72]],
    belt: [[-2.4, 1.02], [-1.0, 1.02], [1.05, 0.96], [2.4, 0.74]], bot: [[-2.4, 0.36], [-2.0, 0.21], [0, 0.15], [2.0, 0.17], [2.4, 0.26]],
    cowl: 1.05, roofF: 0.32, roofR: -2.12, deck: -2.36, win: [[-0.12, 1.0], [-1.02, -0.22]], quarter: [-1.98, -1.1], bpil: -0.17, phare: 'B', feu: 'B', grille: 'B', rim: 'ville', caliper: 'gris', rails: true },
  // fourgon utilitaire (cabine vitrée, caisse tôlée)
  fourgon: { L: 5.4, W: 1.0, ax: [-1.75, 1.75], R: 0.36, tw: 0.23, clear: 0.2, G: 0.93, pf: 3, pr: 6, capF: 0.62, capR: 0.25,
    top: [[-2.7, 1.0], [-2.68, 2.2], [-2.6, 2.4], [-2.3, 2.45], [1.15, 2.45], [1.45, 2.32], [2.05, 1.38], [2.45, 1.18], [2.6, 1.08], [2.7, 0.92]],
    belt: [[-2.7, 1.2], [-1.0, 1.2], [1.4, 1.18], [2.7, 0.95]], bot: [[-2.7, 0.45], [-2.4, 0.3], [0, 0.22], [2.2, 0.3], [2.7, 0.36]],
    cowl: 2.0, roofF: 1.42, roofR: -2.66, deck: -2.68, win: [[1.0, 1.9]], bpil: 0.95, noRear: true, phare: 'C', feu: 'B', grille: 'C', rim: 'acier', caliper: null, van: true },
  // 4x4 blindé
  blinde: { L: 5.1, W: 1.06, ax: [-1.5, 1.6], R: 0.43, tw: 0.32, clear: 0.3, G: 0.86, pf: 5, pr: 6, capF: 0.42, capR: 0.3,
    top: [[-2.55, 1.0], [-2.53, 1.55], [-2.45, 1.95], [-2.3, 2.0], [0.4, 2.0], [0.75, 1.92], [1.25, 1.42], [2.3, 1.35], [2.5, 1.3], [2.55, 1.1]],
    belt: [[-2.55, 1.42], [-1.0, 1.42], [1.25, 1.38], [2.55, 1.15]], bot: [[-2.55, 0.55], [-2.2, 0.38], [0, 0.32], [2.2, 0.38], [2.55, 0.5]],
    cowl: 1.25, roofF: 0.72, roofR: -2.3, deck: -2.5, win: [[-0.2, 1.15], [-1.25, -0.3]], bpil: -0.25, phare: 'C', feu: 'B', grille: 'C', rim: 'acier', caliper: null, armored: true, cladding: true },
};

// roster du jeu : [id, modèle, classe, nom, peinture, options]
export const CAR_LIST = [
  ['berlinette-rouge', 'berlinette', 'sport', 'Berlinette rouge', '#a3080e', { metal: 0.15, rough: 0.22 }],
  ['berlinette-jaune', 'berlinette', 'sport', 'Berlinette jaune', '#d8a200', { metal: 0.1, rough: 0.24 }],
  ['gt-argent', 'gt', 'sport', 'Coupé GT argent', '#9ea3a8', { metal: 0.85, rough: 0.3 }],
  ['gt-noir', 'gt', 'sport', 'Coupé GT noir', '#0a0b0d', { metal: 0.6, rough: 0.28 }],
  ['coupe-bleu', 'coupe', 'sport', 'Coupé bleu nuit', '#0d2148', { metal: 0.7, rough: 0.3 }],
  ['coupe-blanc', 'coupe', 'sport', 'Coupé blanc nacré', '#e4e4e0', { metal: 0.25, rough: 0.25 }],
  ['citadine-blanche', 'citadine', 'civil', 'Citadine blanche', '#dcdcd8', { metal: 0.05, rough: 0.3 }],
  ['citadine-rouge', 'citadine', 'civil', 'Citadine rouge', '#8c1015', { metal: 0.4, rough: 0.3 }],
  ['berline-grise', 'berline', 'civil', 'Berline gris acier', '#4b5056', { metal: 0.75, rough: 0.32 }],
  ['berline-bleue', 'berline', 'civil', 'Berline bleu marine', '#16233a', { metal: 0.65, rough: 0.32 }],
  ['break-noir', 'break', 'civil', 'Break noir', '#0c0d0f', { metal: 0.55, rough: 0.3 }],
  ['suv-blanc', 'suv', 'civil', 'SUV de luxe blanc', '#e6e6e2', { metal: 0.2, rough: 0.28 }],
  ['suv-gris', 'suv', 'civil', 'SUV de luxe gris', '#2c2f33', { metal: 0.7, rough: 0.3 }],
  ['taxi', 'berline', 'civil', 'Taxi parisien', '#0b0c0e', { metal: 0.6, rough: 0.3, taxi: true }],
  ['fourgon', 'fourgon', 'civil', 'Fourgon utilitaire', '#e9e9e6', { metal: 0.02, rough: 0.34 }],
  ['police', 'berline', 'police', 'Voiture de police', '#eef0f2', { metal: 0.05, rough: 0.3, police: true }],
  ['police-break', 'break', 'police', 'Break de police', '#eef0f2', { metal: 0.05, rough: 0.3, police: true }],
  ['police-fourgon', 'fourgon', 'police', 'Fourgon de police', '#eef0f2', { metal: 0.05, rough: 0.3, police: true }],
  ['blinde', 'blinde', 'blinde', '4x4 blindé', '#1f2326', { metal: 0.3, rough: 0.55, mat: true }],
];

// ---------------------------------------------------------------- surface de la caisse
// paramètre u : 0 → 1 calotte arrière (super-ellipse), 1 → 2 partie centrale, 2 → 3 calotte avant ; t : 0 dessous (milieu) → 1 toit (milieu)
function bodyFn(M) {
  const z0 = -M.L / 2, z1 = M.L / 2, zr = z0 + M.capR, zf = z1 - M.capF;
  const top = curve(M.top), belt = curve(M.belt), bot0 = curve(M.bot);
  const Ra = M.R + 0.06;
  const bot = (z) => { let y = bot0(z); for (const za of M.ax) { const dz = z - za; if (Math.abs(dz) < Ra) y = Math.max(y, M.R + Math.sqrt(Ra * Ra - dz * dz) * 0.97 + 0.02); } return y; };
  const sup = (th, p) => [Math.pow(Math.cos(th), 2 / p), Math.pow(Math.sin(th), 2 / p)];
  const station = (u) => {
    if (u <= 1) { const th = Math.PI / 2 * (0.5 + 0.5 * Math.cos(Math.PI * u)); const [c, s] = sup(th, M.pr); return [zr - M.capR * s, c]; }
    if (u >= 2) { const th = Math.PI / 2 * (0.5 - 0.5 * Math.cos(Math.PI * (u - 2))); const [c, s] = sup(th, M.pf); return [zf + M.capF * s, c]; }
    return [lerp(zr, zf, u - 1), 1];
  };
  const zToU = (z) => (z <= zr || z >= zf) ? null : 1 + (z - zr) / (zf - zr);
  // point (x ≥ 0, y) du couple à la station u, abscisse t
  const sect = (u, t) => {
    const [z, wf] = station(u), W = M.W * wf, yt0 = top(z);
    const yb = Math.min(bot(z), yt0 - 0.08), ys = clamp(Math.min(belt(z), yt0 - 0.004), yb + 0.05, 9), yt = Math.max(yt0, ys + 0.004), h = yt - ys;
    // pavillon : rentré (tumblehome) seulement là où il y a un habitacle
    const G = W * lerp(0.9, M.G * (z > M.roofF ? lerp(1, 0.94, sstep(M.roofF, M.cowl, z)) : 1), sstep(0.05, 0.35, h));
    const crown = 0.025 * wf + (h < 0.1 ? 0.02 : 0);
    let x, y;
    const qb = (p0, c, p1, s) => [(1 - s) * (1 - s) * p0[0] + 2 * (1 - s) * s * c[0] + s * s * p1[0], (1 - s) * (1 - s) * p0[1] + 2 * (1 - s) * s * c[1] + s * s * p1[1]];
    const lowR = Math.min(0.09, (ys - yb) * 0.3), ym = yb + (ys - yb) * 0.42;
    if (t < 0.1) { x = W * 0.84 * (t / 0.1); y = yb; }
    else if (t < 0.17) [x, y] = qb([W * 0.84, yb], [W * 0.975, yb], [W * 0.985, yb + lowR], (t - 0.1) / 0.07);
    else if (t < 0.32) { const s = (t - 0.17) / 0.15; y = lerp(yb + lowR, ym, s); x = W * (0.985 + 0.015 * Math.sin(s * Math.PI / 2)); }
    else if (t < 0.47) { const s = (t - 0.32) / 0.15; y = lerp(ym, ys, s); x = W * (1 - 0.018 * s * s); }
    else if (t < 0.53) { const sh = Math.min(0.035, h * 0.3); [x, y] = qb([W * 0.982, ys], [W * 0.975, ys + sh], [W * 0.93, ys + sh], (t - 0.47) / 0.06); }
    else if (t < 0.85) { const s = (t - 0.53) / 0.32, sh = Math.min(0.035, h * 0.3), rr = Math.min(0.055, h * 0.22); const x5 = W * 0.93, Gt = Math.min(G, x5); y = lerp(ys + sh, yt - rr, s); x = lerp(x5, Gt, s) + Math.sin(s * Math.PI) * 0.012 * sstep(0.1, 0.4, h); }
    else if (t < 0.91) { const rr = Math.min(0.055, h * 0.22), Gt = Math.min(G, W * 0.93); [x, y] = qb([Gt, yt - rr], [Gt, yt], [Gt - rr * 1.3, yt], (t - 0.85) / 0.06); }
    else { const rr = Math.min(0.055, h * 0.22), x7 = Math.max(0, Math.min(G, W * 0.93) - rr * 1.3), s = (t - 0.91) / 0.09; x = x7 * (1 - s); y = yt + crown * (1 - (1 - s) * (1 - s)); }
    return [x, y, z, ys, yt, yb];
  };
  return { sect, station, zToU, top, belt, bot, z0, z1, zr, zf };
}

// classement des facettes de la caisse : vitres, montants, toit, dessous, bas de caisse
function classify(M, B, z, t, y, ys, yt) {
  if (t < 0.1) return 'under';
  const h = yt - ys;
  if (M.cladding && t < 0.24) return 'plastic';
  // pare-brise
  if (t > 0.905 && z > M.roofF + 0.04 && z < M.cowl - 0.05 && h > 0.08) return 'glass';
  // lunette arrière
  if (!M.noRear && t > 0.905 && z < M.roofR - 0.04 && z > M.deck + 0.05 && h > 0.08) return 'glass';
  // vitres latérales : entre les montants (qui suivent la pente du pare-brise et de la lunette)
  if (t > 0.565 && t < 0.835 && h > 0.15) {
    const yR = B.top((M.roofF + M.roofR) / 2), yC = B.top(M.cowl), yD = B.top(M.deck);
    const zA = M.cowl + (M.roofF - M.cowl) * clamp((y - yC) / (yR - yC), 0, 1) - 0.075;
    const zC = M.deck + (M.roofR - M.deck) * clamp((y - yD) / (yR - yD), 0, 1) + (M.van ? 0 : 0.1);
    if (z < zA && (M.van || z > zC)) for (const [a, b] of M.win.concat(M.quarter ? [M.quarter] : [])) if (z > a && z < b) return 'glass';
    if (M.bpil != null && Math.abs(z - M.bpil) < 0.1 && z < zA && z > zC) return 'trim';
  }
  // jonc noir brillant sous les vitres (ligne de ceinture)
  if (t > 0.535 && t <= 0.565 && h > 0.15) {
    const yR = B.top((M.roofF + M.roofR) / 2), yC = B.top(M.cowl), yD = B.top(M.deck);
    const zA = M.cowl + (M.roofF - M.cowl) * clamp((y - yC) / (yR - yC), 0, 1) - 0.075, zC = M.deck + (M.roofR - M.deck) * clamp((y - yD) / (yR - yD), 0, 1) + (M.van ? 0 : 0.1);
    if (z < zA + 0.02 && (M.van ? z > M.win[0][0] : z > zC - 0.02)) return 'trim';
  }
  // toit noir brillant (sportives) ou pavillon peint
  if (M.sport && t > 0.92 && z < M.roofF && z > M.roofR) return 'trim';
  return 'paint';
}

// ---------------------------------------------------------------- géométrie utilitaire
function geo(pos, nor, uv, idx) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g; }
// miroir gauche ↔ droite sans échelle négative (ordre des sommets inversé)
function mirrorX(g) {
  const m = g.clone(); const p = m.attributes.position, n = m.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); if (n) n.setX(i, -n.getX(i)); }
  if (m.index) { const a = m.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } } else { const pos = p.array; /* non indexé : inverser chaque triangle */ for (const A of [p, n, m.attributes.uv].filter(Boolean)) { const s = A.itemSize, arr = A.array; for (let i = 0; i < A.count; i += 3) for (let k = 0; k < s; k++) { const t = arr[(i + 1) * s + k]; arr[(i + 1) * s + k] = arr[(i + 2) * s + k]; arr[(i + 2) * s + k] = t; } } void pos; }
  return m;
}
export const solidUVs = (g, k) => { const [u, v] = solidUV(k); const uv = g.attributes.uv; if (!uv) { g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); } const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, u, v); return g; };
const rectUVs = (g, rect) => { const [u0, v0, u1, v1] = uvOf(rect); const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, lerp(u0, u1, a.getX(i)), lerp(v0, v1, 1 - a.getY(i))); return g; };
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);

// ---------------------------------------------------------------- construction
export function buildCar(spec, { hq = true, lod = 1 } = {}) {
  if (!spec) return null;
  const [id, model, classe, nom, color, opt = {}] = spec; const M = typeof model === 'string' ? MODELS[model] : model;
  const B = bodyFn(M), MT = mats(hq), PAINT = paint(color, hq, opt);
  const parts = { paint: [], glass: [], trim: [], plastic: [], metal: [], rubber: [], detail: [], interior: [], contact: [] };
  { const sh = new THREE.PlaneGeometry(M.W * 2 / 0.6, M.L / 0.8); sh.rotateX(-Math.PI / 2); sh.translate(0, 0.012, 0); parts.contact.push(nonIdx(sh)); }
  const add = (k, g, both = false) => { parts[k].push(nonIdx(g)); if (both) parts[k].push(nonIdx(mirrorX(g))); };

  // --- caisse : grille de points (stations × couples), normales par différences finies sur la grille
  const NR = Math.round(16 * lod) + 2, NF = Math.round(20 * lod) + 2, NT = Math.round(40 * lod);
  const us = []; for (let i = 0; i < NR; i++) us.push(i / (NR - 1) * 0.999);
  const zMid = []; const step = 0.09 / lod; for (let z = B.zr; z < B.zf; z += step) zMid.push(z); zMid.push(B.zf);
  // stations supplémentaires autour des passages de roue (arc net)
  const extra = []; for (const za of M.ax) for (let k = -7; k <= 7; k++) extra.push(za + k / 7 * (M.R + 0.08));
  const zs = [...new Set(zMid.concat(extra.filter((z) => z > B.zr && z < B.zf)).map((z) => +z.toFixed(4)))].sort((a, b) => a - b);
  for (const z of zs) us.push(B.zToU(z) ?? (z <= B.zr ? 1 : 2));
  for (let i = 0; i < NF; i++) us.push(2 + 0.001 + i / (NF - 1) * 0.999);
  us.sort((a, b) => a - b);
  const U = us.length, ts = []; for (let j = 0; j <= NT; j++) { const s = j / NT; ts.push(s); }
  // t plus serré dans les zones à courbure (bas de caisse, épaule, arrondi de toit)
  const P = [], info = [];
  for (let i = 0; i < U; i++) { const row = [], inf = []; for (let j = 0; j <= NT; j++) { const r = B.sect(us[i], ts[j]); row.push(new THREE.Vector3(r[0], r[1], r[2])); inf.push(r); } P.push(row); info.push(inf); }
  const N = []; const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  for (let i = 0; i < U; i++) { const row = []; for (let j = 0; j <= NT; j++) {
    const a = P[Math.min(U - 1, i + 1)][j], b = P[Math.max(0, i - 1)][j], c = P[i][Math.min(NT, j + 1)], d = P[i][Math.max(0, j - 1)];
    tmpA.subVectors(a, b); tmpB.subVectors(c, d); if (tmpA.lengthSq() < 1e-10) tmpA.set(0, 0, i === 0 ? -1 : 1);
    // orientation donnée par le paramétrage (t vers le haut, u vers l'avant) : extérieur partout, dessous compris
    const n = new THREE.Vector3().crossVectors(tmpB, tmpA); if (n.lengthSq() < 1e-12) n.set(0, j < NT / 2 ? -1 : 1, 0); n.normalize(); row.push(n); } N.push(row); }
  const buckets = {};
  for (let i = 0; i < U - 1; i++) for (let j = 0; j < NT; j++) {
    const I = info[i][j], I2 = info[i + 1][j + 1]; const zc = (I[2] + I2[2]) / 2, tc = (ts[j] + ts[j + 1]) / 2, yc = (P[i][j].y + P[i + 1][j + 1].y) / 2;
    const k = classify(M, B, zc, tc, yc, (I[3] + I2[3]) / 2, (I[4] + I2[4]) / 2);
    (buckets[k] ||= []).push([i, j]);
  }
  for (const [k, list] of Object.entries(buckets)) {
    const pos = [], nor = [], uv = [], idx = []; let v = 0; const inset = k === 'glass' ? -0.009 : 0;
    for (const [i, j] of list) { const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      for (const [a, b] of q) { const p = P[a][b], n = N[a][b]; pos.push(p.x + n.x * inset, p.y + n.y * inset, p.z + n.z * inset); nor.push(n.x, n.y, n.z); uv.push(p.z, p.y); }
      // ordre : extérieur vu depuis +X
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2); v += 4; }
    const g = geo(pos, nor, uv, idx);
    const tgt = k === 'paint' ? 'paint' : k === 'glass' ? 'glass' : k === 'trim' ? 'trim' : k === 'under' ? 'plastic' : 'plastic';
    add(tgt, g, true);
  }
  // vérifie l'orientation (normale géométrique vs normale stockée) sur un triangle de la carrosserie et corrige si besoin
  fixWinding(parts.paint); fixWinding(parts.glass); fixWinding(parts.trim); fixWinding(parts.plastic);

  // --- décalques collés sur la carrosserie (optiques, calandre, plaques, prises d'air, sérigraphies)
  const decal = (u0, u1, t0, t1, rect, { off = 0.004, nu = 10, nt = 8, mat = 'detail', flipU = false, both = true, solid = null } = {}) => {
    const pos = [], nor = [], uv = [], idx = [];
    const S = (u, t) => { const r = B.sect(u, t); return new THREE.Vector3(r[0], r[1], r[2]); };
    for (let a = 0; a <= nu; a++) for (let b = 0; b <= nt; b++) {
      const u = lerp(u0, u1, a / nu), t = lerp(t0, t1, b / nt), p = S(u, t);
      const du = S(Math.min(3, u + 0.004), t).sub(S(Math.max(0, u - 0.004), t)), dt = S(u, Math.min(1, t + 0.004)).sub(S(u, Math.max(0, t - 0.004)));
      const n = new THREE.Vector3().crossVectors(dt, du); if (n.lengthSq() < 1e-14) n.set(0, 0, u > 1.5 ? 1 : -1); n.normalize();
      pos.push(p.x + n.x * off, p.y + n.y * off, p.z + n.z * off); nor.push(n.x, n.y, n.z); uv.push(flipU ? 1 - a / nu : a / nu, b / nt);
    }
    for (let a = 0; a < nu; a++) for (let b = 0; b < nt; b++) { const i0 = a * (nt + 1) + b, i1 = (a + 1) * (nt + 1) + b; idx.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1); }
    let g = geo(pos, nor, uv, idx); if (solid) solidUVs(g, solid); else if (rect) rectUVs(g, rect);
    g = nonIdx(g); fixWinding([g]);
    parts[mat].push(g); if (both) { const m = mirrorX(g); if (!solid && rect && !flipU) { /* texte lisible des deux côtés */ } parts[mat].push(m); }
  };
  const uF = (f) => 2 + f, uR = (f) => 1 - f; // f : 0 = début de calotte, 1 = bout de la voiture
  const zU = (z) => B.zToU(z) ?? (z < 0 ? 1 : 2);
  // phares : coin avant, sous l'épaule
  const ph = { A: [0.18, 0.62, 0.41, 0.5, R.phareA], B: [0.14, 0.6, 0.4, 0.505, R.phareB], C: [0.3, 0.68, 0.36, 0.47, R.phareC] }[M.phare];
  decal(uF(ph[0]), uF(ph[1]), ph[2], ph[3], ph[4]);
  // calandre et bouclier : bas de la face avant
  const gr = { A: [0.7, 0.999, 0.12, 0.33, R.grilleA], B: [0.72, 0.999, 0.22, 0.38, R.grilleB], C: [0.66, 0.999, 0.24, 0.42, R.grilleC] }[M.grille];
  decal(uF(gr[0]), uF(gr[1]), gr[2], gr[3], gr[4], { nu: 6 });
  if (M.intakes || M.sport) decal(uF(0.4), uF(0.66), 0.14, 0.26, R.nid, { nu: 6, nt: 4 });
  // plaques : planes, posées au bout de la voiture (au centre de la face avant et de la face arrière)
  const plate = (front, y, rect) => { const g = new THREE.PlaneGeometry(0.52, 0.11); rectUVs(g, rect); if (!front) g.rotateY(Math.PI); g.translate(0, y, front ? B.z1 + 0.012 : B.z0 - 0.012); parts.detail.push(nonIdx(g)); const bk = new THREE.BoxGeometry(0.54, 0.13, 0.012); bk.translate(0, y, front ? B.z1 + 0.004 : B.z0 - 0.004); parts.plastic.push(nonIdx(bk)); };
  plate(true, B.sect(3, gr[2] - 0.04)[1], R.plaque);
  // feux arrière
  const fe = M.van ? [0.55, 0.85, 0.3, 0.5, R.feuB] : M.feu === 'A' ? [0.12, 0.7, 0.41, 0.49, R.feuA] : [0.18, 0.66, 0.41, 0.5, R.feuB];
  decal(uR(fe[0]), uR(fe[1]), fe[2], fe[3], fe[4], { flipU: true });
  if (M.feu === 'A' && !M.van) decal(uR(0.7), uR(0.999), 0.452, 0.462, null, { solid: 'rougeLum', nu: 3, nt: 1 }); // bandeau qui relie les feux
  plate(false, B.sect(0, 0.3)[1], R.plaqueAr);
  decal(uR(0.3), uR(0.999), 0.1, 0.2, R.prise, { nu: 6, nt: 3 }); // diffuseur
  // joints de portières et de capot (fines lignes sombres), poignées
  const seam = (z, t0, t1) => { const u = zU(z); decal(u - 0.0012, u + 0.0012, t0, t1, null, { solid: 'noir', nu: 1, nt: 10, off: 0.0015 }); };
  const doorF = M.cowl - 0.02, doorR = M.bpil != null ? M.bpil : M.win[0][0] - 0.05;
  if (!M.van) { seam(doorF, 0.2, 0.5); seam(doorR, 0.2, 0.5); if (M.bpil != null && M.win[1]) seam(M.win[1][0] - 0.02, 0.24, 0.5); }
  else { seam(doorF, 0.2, 0.5); seam(M.bpil - 0.03, 0.2, 0.84); seam(-0.4, 0.2, 0.84); }
  const handle = (z) => { const u = zU(z); decal(u - 0.012, u + 0.012, 0.445, 0.46, null, { solid: 'chrome', nu: 2, nt: 1, off: 0.006 }); };
  handle(doorR + 0.12); if (M.bpil != null && M.win[1]) handle(M.win[1][0] + 0.1);
  // jupes / élargisseurs en plastique au-dessus des roues (SUV, 4x4)
  // police : bande latérale, capot ; taxi : lumineux de toit
  // (texte : côté +X lu de l'arrière vers l'avant inversé, d'où flipU, puis l'autre côté construit à l'endroit et retourné)
  if (opt.police) { const a = zU(M.ax[0] + 0.45), b = zU(M.ax[1] - 0.45); decal(a, b, 0.28, 0.43, R.police, { nu: 12, nt: 2, off: 0.002, both: false, flipU: true }); decal(a, b, 0.28, 0.43, R.police, { nu: 12, nt: 2, off: 0.002, both: false }); parts.detail.push(mirrorX(parts.detail.pop()));
  }

  // bande de couleur sur les flancs (utilitaires de la bande, fourgons)
  if (opt.stripe) decal(zU(M.ax[0] - 0.2), zU(M.ax[1] - 0.3), 0.3, 0.37, null, { solid: opt.stripe, nu: 8, nt: 1, off: 0.002 });
  // --- rétroviseurs : coque peinte, miroir
  { const zM = M.cowl - 0.06, yM = B.belt(zM) + 0.11, W = M.W * 0.95;
    const shell = new THREE.SphereGeometry(1, 12, 8); shell.scale(0.07, 0.065, 0.11); shell.translate(W + 0.15, yM, zM);
    const arm = new THREE.BoxGeometry(0.16, 0.03, 0.06); arm.translate(W + 0.06, yM - 0.03, zM + 0.01);
    const glassM = new THREE.CircleGeometry(1, 12); glassM.scale(0.055, 0.05, 1); glassM.rotateY(Math.PI); glassM.translate(W + 0.15, yM, zM - 0.075); solidUVs(glassM, 'miroir');
    add('paint', shell, true); add('trim', arm, true); add('detail', glassM, true); }
  // --- essuie-glaces
  { const zc = M.cowl - 0.03, yc = B.top(zc) + 0.01; for (const x of [0.32, -0.12]) { const w = new THREE.BoxGeometry(0.62, 0.012, 0.02); w.rotateY(-0.08); w.rotateX(-0.25); w.translate(x, yc, zc - 0.03); add('plastic', w); } }
  // --- échappements
  for (let k = 0; k < (M.pipes || (M.van ? 0 : 1)); k++) { const x = (M.pipes === 4 ? [-0.62, -0.5, 0.5, 0.62] : M.pipes === 2 ? [-0.5, 0.5] : [-0.45])[k]; const p = new THREE.CylinderGeometry(0.042, 0.042, 0.16, 14, 1, true); p.rotateX(Math.PI / 2); p.translate(x, B.bot(B.z0 + 0.1) + 0.06, B.z0 + 0.05); add('metal', p); const i2 = new THREE.CircleGeometry(0.036, 14); i2.rotateY(Math.PI); i2.translate(x, B.bot(B.z0 + 0.1) + 0.06, B.z0 + 0.07); add('plastic', i2); }
  // --- aileron (berlinette) : lame noire sur la malle
  if (M.wing) { const z = B.z0 + 0.25, y = B.top(z) + M.wing; const w = new THREE.BoxGeometry(1.5, 0.018, 0.22); w.rotateX(0.08); w.translate(0, y, z); add('trim', w); for (const x of [-0.5, 0.5]) { const s = new THREE.BoxGeometry(0.02, M.wing + 0.01, 0.1); s.translate(x, y - M.wing / 2, z); add('trim', s); } }
  // --- barres de toit
  if (M.rails) { const y = B.top(-0.6) + 0.035, x = M.W * M.G * 0.82; for (const s of [1, -1]) { const r = new THREE.BoxGeometry(0.03, 0.03, (M.roofF - M.roofR) * 0.92); r.translate(s * x, y, (M.roofF + M.roofR) / 2); add('metal', r); } }
  // --- antenne aileron de requin
  if (!M.van) { const z = M.roofR + 0.12, y = B.top(z); const f = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); f.scale(0.025, 0.06, 0.12); f.translate(0, y, z); add('trim', f); }
  // --- police : rampe de gyrophares ; taxi : lumineux
  if (opt.police) { const zr = (M.roofF + M.roofR) / 2 + (M.van ? 0.8 : 0.1), y = B.top(zr); const bar = new THREE.BoxGeometry(1.15, 0.07, 0.26, 1, 1, 1); bar.translate(0, y + 0.05, zr); add('trim', bar);
    const lens = new THREE.BoxGeometry(1.1, 0.05, 0.27); lens.translate(0, y + 0.06, zr); rectUVsBox(lens, R.rampe); add('detail', lens);
    for (const x of [-0.35, 0.35]) { const f = new THREE.BoxGeometry(0.08, 0.02, 0.2); f.translate(x, y + 0.01, zr); add('plastic', f); } }
  if (opt.taxi) { const zr = (M.roofF + M.roofR) / 2 + 0.15, y = B.top(zr); const s = new THREE.BoxGeometry(0.42, 0.11, 0.14); s.translate(0, y + 0.07, zr); rectUVsBox(s, R.taxi); add('detail', s); }
  // --- pare-buffle et grilles (blindé)
  if (M.armored) { const zf = B.z1 - 0.05; for (const y of [0.55, 0.85]) { const b = new THREE.CylinderGeometry(0.035, 0.035, 1.6, 10); b.rotateZ(Math.PI / 2); b.translate(0, y, zf + 0.12); add('trim', b); } for (const x of [-0.55, 0.55]) { const b = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10); b.translate(x, 0.7, zf + 0.12); add('trim', b); }
    const step2 = new THREE.BoxGeometry(0.16, 0.04, (M.ax[1] - M.ax[0]) - 1.0); step2.translate(M.W + 0.04, 0.42, (M.ax[0] + M.ax[1]) / 2); add('trim', step2, true); }
  // --- marchepieds / ailes plastiques des SUV : cache roues
  // --- intérieur (visible à travers le pare-brise) : planche de bord, sièges, volant, plage arrière
  { const zc = M.cowl, yb = B.belt(zc), wi = M.W * M.G * 1.05;
    const dash = new THREE.BoxGeometry(wi * 2 - 0.1, 0.12, 0.45); dash.translate(0, yb + 0.02, zc - 0.25); add('interior', dash);
    const zs0 = lerp(M.cowl, M.roofR, 0.42);
    const yRoof = B.top(zs0), sTop = yRoof - 0.12, sBot = yb - 0.32, sh = sTop - sBot;
    for (const x of [0.38, -0.38]) { const seat = new THREE.BoxGeometry(0.5, sh, 0.12); seat.rotateX(-0.18); seat.translate(x * M.W / 0.92, (sTop + sBot) / 2, zs0 - 0.1); add('interior', seat); const cu = new THREE.BoxGeometry(0.5, 0.12, 0.5); cu.translate(x * M.W / 0.92, sBot + 0.06, zs0 + 0.18); add('interior', cu); }
    const sw = new THREE.TorusGeometry(0.18, 0.022, 6, 20); sw.rotateX(-0.45); sw.translate(0.38 * M.W / 0.92, yb + 0.12, zc - 0.48); add('plastic', sw);
    if (!M.van && M.win[1]) { const rear = new THREE.BoxGeometry(wi * 2 - 0.2, 0.5, 0.12); rear.rotateX(-0.2); rear.translate(0, Math.min(yb - 0.02, B.top(M.win[1][0]) - 0.4), M.win[1][0] - 0.25); add('interior', rear); }
    const floor = new THREE.BoxGeometry(wi * 2, 0.04, Math.max(0.5, M.cowl - M.roofR - 0.3)); floor.translate(0, yb - 0.35, (M.cowl + M.roofR) / 2); add('interior', floor);
    // cloison sombre derrière les places avant des fourgons, et caissons qui ferment les passages de roue
    if (M.van) { const wall = new THREE.BoxGeometry(wi * 2, 1.2, 0.04); wall.translate(0, yb + 0.4, M.bpil - 0.1); add('interior', wall); }
    for (const za of M.ax) { const box = new THREE.BoxGeometry((M.W - M.tw - 0.05) * 2, M.R * 1.1, 0.8); box.translate(0, M.R * 0.95, za); add('plastic', box); } }

  // --- roues
  const root = new THREE.Group(); root.name = id;
  const wheelNames = { 'wheel-front-left': [1, 1], 'wheel-front-right': [-1, 1], 'wheel-back-left': [1, 0], 'wheel-back-right': [-1, 0] };
  const wheelInfo = {}; const WG = wheelGeos(M, MT, hq, lod);
  for (const [n, [sx, front]] of Object.entries(wheelNames)) { if (M.cabOnly && !front) continue;
    const z = M.ax[front], x = sx * (M.W - M.tw / 2 - 0.015);
    const w = new THREE.Group(); w.name = n; w.rotation.order = 'YXZ'; w.position.set(x, M.R, z);
    for (const [k, g] of Object.entries(sx > 0 ? WG.L : WG.Rt)) { const m = new THREE.Mesh(g, k === 'paint' ? PAINT : MT[k]); m.castShadow = true; m.receiveShadow = true; w.add(m); }
    if (M.caliper) { const Ri = M.R * (M.rim === 'sport' ? 0.74 : 0.68), cal = new THREE.BoxGeometry(0.05, Ri * 0.42, Ri * 0.3); cal.rotateX(sx * 0 + 0.5); cal.translate(x + sx * (M.tw / 2 - 0.1), M.R + Ri * 0.55, z - Ri * 0.3); solidUVs(cal, M.caliper); parts.detail.push(nonIdx(cal)); }
    root.add(w); wheelInfo[n] = { center: [x, M.R, z], radius: M.R, width: M.tw };
  }
  // --- caisse : un maillage par matériau
  const body = new THREE.Group(); body.name = 'body';
  for (const [k, list] of Object.entries(parts)) { if (!list.length) continue; const g = mergeGeometries(list.map(clean), false); if (!g) continue; g.computeBoundingSphere(); const m = new THREE.Mesh(g, k === 'paint' ? PAINT : MT[k]); m.name = 'body_' + k; m.castShadow = k !== 'glass' && k !== 'detail' && k !== 'contact'; if (k === 'contact') m.renderOrder = -1; m.receiveShadow = true; body.add(m); }
  root.add(body);
  const seat = new THREE.Object3D(); seat.name = 'seat-driver'; seat.position.set(0.38 * M.W / 0.92, B.belt(M.cowl) - 0.25, lerp(M.cowl, M.roofR, 0.42)); root.add(seat);
  const door = new THREE.Object3D(); door.name = 'door-driver'; door.position.set(M.W + 0.6, 0, lerp(M.cowl, M.roofR, 0.35)); root.add(door);
  const H = Math.max(...M.top.map((p) => p[1])) + (opt.police ? 0.1 : 0);
  root.userData = { size: [M.W * 2, H, M.L], wheels: wheelInfo, modele: model };
  const scene = new THREE.Group(); scene.add(root); scene.userData.size = root.userData.size;
  return scene;
}
function clean(g) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g.index ? g.toNonIndexed() : g; }
// boîte : toutes les faces prennent la même zone de l'atlas
export function rectUVsBox(g, rect) { const [u0, v0, u1, v1] = uvOf(rect); const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, lerp(u0, u1, a.getX(i)), lerp(v0, v1, 1 - a.getY(i))); }
// remet chaque triangle dans le sens de sa normale (la face visible est celle qui regarde vers l'extérieur)
function fixWinding(list) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const g of list) { const p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); b.sub(a); c.sub(a); const f = b.cross(c);
      n.fromBufferAttribute(nr, i).add(new THREE.Vector3().fromBufferAttribute(nr, i + 1)).add(new THREE.Vector3().fromBufferAttribute(nr, i + 2));
      if (f.dot(n) < 0) for (const A of [p, nr, uv]) { if (!A) continue; const s = A.itemSize; for (let k = 0; k < s; k++) { const t = A.array[(i + 1) * s + k]; A.array[(i + 1) * s + k] = A.array[(i + 2) * s + k]; A.array[(i + 2) * s + k] = t; } } } }
}

// roue : pneu (profil tourné, flancs bombés, sculptures), jante en alliage (rayons extrudés), disque, étrier
const _wheelCache = new Map();
export function wheelGeos(M, MT, hq, lod) {
  const key = `${M.R}|${M.tw}|${M.rim}|${M.caliper}|${lod}`; if (_wheelCache.has(key)) return _wheelCache.get(key);
  const Rw = M.R, tw = M.tw, Ri = Rw * (M.rim === 'acier' ? 0.62 : M.rim === 'sport' ? 0.74 : 0.68), seg = Math.max(14, Math.round(28 * lod));
  // pneu : profil (r, x) autour de l'axe ; x vers l'extérieur
  const prof = [];
  const sw = (s) => Ri + (Rw - Ri) * s;
  prof.push([Ri - 0.005, -tw / 2 + 0.01]);
  for (let k = 0; k <= 6; k++) { const s = k / 6; prof.push([sw(s * 0.86), -tw / 2 - Math.sin(s * Math.PI) * 0.012]); }
  for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI / 2; prof.push([Rw - 0.035 + Math.sin(a) * 0.035, -tw / 2 + 0.035 - Math.cos(a) * 0.035]); }
  for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI / 2; prof.push([Rw - 0.035 + Math.cos(a) * 0.035, tw / 2 - 0.035 + Math.sin(a) * 0.035]); }
  for (let k = 0; k <= 6; k++) { const s = 1 - k / 6; prof.push([sw(s * 0.86), tw / 2 + Math.sin(s * Math.PI) * 0.012]); }
  prof.push([Ri - 0.005, tw / 2 - 0.01]);
  const tire = new THREE.LatheGeometry(prof.map(([r, x]) => new THREE.Vector2(r, x)), seg); // axe Y
  tire.rotateZ(-Math.PI / 2); // axe Y → axe X (y local → x)
  // jante : face avant extrudée avec ouvertures entre les rayons
  const face = new THREE.Shape(); face.absarc(0, 0, Ri - 0.004, 0, Math.PI * 2, false);
  const nsp = M.rim === 'sport' ? 10 : M.rim === 'suv' ? 6 : M.rim === 'acier' ? 8 : 5;
  for (let k = 0; k < nsp; k++) {
    const a0 = k / nsp * Math.PI * 2, span = Math.PI * 2 / nsp;
    const h = new THREE.Path(); const r1 = Ri * (M.rim === 'acier' ? 0.6 : 0.36), r2 = Ri * (M.rim === 'acier' ? 0.78 : 0.86);
    const gap = M.rim === 'acier' ? 0.62 : M.rim === 'sport' ? 0.2 : 0.16, w0 = a0 + span * gap / 2 + 0.02, w1 = a0 + span * (1 - gap / 2) - 0.02;
    if (M.rim === 'acier') { const ac = a0 + span / 2; h.absellipse(Math.cos(ac) * (r1 + r2) / 2, Math.sin(ac) * (r1 + r2) / 2, (r2 - r1) / 2.4, (r2 - r1) / 2.4, 0, Math.PI * 2, true); }
    else { const q = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
      const sp = (span * gap) / 2, w0b = a0 + sp + 0.04 * (Ri / r1), w1b = a0 + span - sp - 0.04 * (Ri / r1);
      h.moveTo(...q(r1, w0b)); h.lineTo(...q(r2, w0)); h.absarc(0, 0, r2, w0, w1, false); h.lineTo(...q(r1, w1b)); h.absarc(0, 0, r1, w1b, w0b, true); }
    face.holes.push(h);
  }
  // au loin : simple disque (les ouvertures entre rayons ne se voient plus)
  const rimFace = lod < 0.5 ? (() => { const d = new THREE.CylinderGeometry(Ri - 0.004, Ri - 0.004, 0.02, seg); d.rotateX(Math.PI / 2); d.translate(0, 0, 0.01); return d; })() : new THREE.ExtrudeGeometry(face, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1, curveSegments: Math.max(4, Math.round(8 * lod)) });
  rimFace.rotateY(Math.PI / 2); rimFace.translate(tw / 2 - 0.05, 0, 0); // face vers +X (extérieur)
  const barrel = new THREE.CylinderGeometry(Ri - 0.004, Ri - 0.004, tw - 0.03, seg, 1, true); barrel.rotateZ(Math.PI / 2);
  const lip = new THREE.TorusGeometry(Ri - 0.004, 0.009, 6, seg); lip.rotateY(Math.PI / 2); lip.translate(tw / 2 - 0.02, 0, 0);
  const hub = new THREE.CylinderGeometry(Ri * 0.2, Ri * 0.22, 0.035, 20); hub.rotateZ(Math.PI / 2); hub.translate(tw / 2 - 0.04, 0, 0);
  const disc = new THREE.CylinderGeometry(Ri * 0.84, Ri * 0.84, 0.028, 32); disc.rotateZ(Math.PI / 2); disc.translate(tw / 2 - 0.12, 0, 0);
  const metalParts = [rimFace, lip, hub], darkParts = [barrel];
  const L = {}; L.rubber = tire; L.metal = mergeGeometries(metalParts.map(clean)); L.plastic = mergeGeometries([...darkParts, disc].map(clean));
  if (M.rim === 'acier') { L.trim = L.metal; delete L.metal; }
  // étrier (ne tourne pas dans la réalité, ici il tourne avec la roue : on le met près de l'axe vertical haut, discret)
  // côté droit : miroir des géométries (sans échelle négative)
  const Rt = {}; for (const [k, g] of Object.entries(L)) Rt[k] = mirrorX(g);
  const out = { L, Rt }; _wheelCache.set(key, out); return out;
}

// toutes les voitures du jeu (une scène par entrée de CAR_LIST)
export function buildAllCars({ hq = true, lod = 1 } = {}) {
  return CAR_LIST.map((s) => ({ scene: buildCar(s, { hq, lod }), classe: s[2], nom: s[3], id: s[0] }));
}
