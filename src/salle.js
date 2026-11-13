// La Salle : troisième carte, petite, construite en code (pas de .glb). Salle d'entraînement façon arcade :
// mur d'armes (toutes les armes du jeu, à prendre), stand de tir avec cibles à distance, arène où l'on fait
// apparaître des bots, parcours chronométré pour régler les déplacements, cercles de lancer.
// Repère : x est, y haut, z sud, en mètres (comme les deux autres cartes).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WEAPONS, WEAPON_CATS } from './data.js';

// ------------------------------------------------------------------ plan
export const HALL = { x0: -42, x1: 42, z0: -24, z1: 24, h: 9.5 };
export const NEON = { cyan: '#22e3ff', rose: '#ff2d95', jaune: '#ffd23d', vert: '#39ff88', orange: '#ff7a2f', violet: '#a46bff' };
const CAT_COL = { pistolet: NEON.cyan, pm: NEON.vert, fusil: NEON.jaune, pompe: NEON.orange, precision: NEON.violet, lourde: NEON.rose, explosif: NEON.rose };
// stand de tir : ligne de tir en x = 2, trois couloirs ; cibles (mannequins) à distance croissante
export const RANGE = { line: 2, x1: 41, z0: -23.4, z1: -6.6, lanes: [-20.6, -15, -9.4] };
export const TARGETS = [
  { lane: 0, d: 7, dz: -1 }, { lane: 0, d: 12, dz: 1 },
  { lane: 1, d: 18, dz: -1 }, { lane: 1, d: 25, dz: 1 },
  { lane: 2, d: 31, dz: -1 }, { lane: 2, d: 38, dz: 1 },
];
// arène des bots (sud-est) et parcours (sud-ouest) ; zone de départ et bornes au centre-ouest
export const ARENA = { x0: 4, x1: 41.4, z0: -5.4, z1: 23.4, spawn: { x0: 27, x1: 40, z0: -3, z1: 21 }, throwFrom: [5, 18], rings: [10, 20, 30] };
export const COURSE = { start: -38, laneA: [3.6, 9.6], laneB: [13, 22.6], turn: -4 };
export const SPAWN = { x: -33, z: -7, yaw: 2.2 };
export const WALL_Z = HALL.z0 + 0.32; // face du mur d'armes
export const CABINETS = [
  { id: 'bot', titre: 'UN BOT', sous: 'apparaît dans l\'arène', col: NEON.cyan },
  { id: 'vague', titre: 'VAGUE ×5', sous: 'cinq bots d\'un coup', col: NEON.rose },
  { id: 'mode', titre: 'COMPORTEMENT', sous: 'cible · mobile · riposte', col: NEON.jaune },
  { id: 'effacer', titre: 'EFFACER', sous: 'retire les bots', col: NEON.orange },
  { id: 'atouts', titre: 'ATOUTS', sous: 'grenades et séries', col: NEON.vert },
  { id: 'infini', titre: 'MUNITIONS ∞', sous: 'chargeurs et lancers', col: NEON.violet },
  { id: 'dieu', titre: 'INVINCIBLE', sous: 'aucun dégât reçu', col: NEON.cyan },
].map((c, i) => ({ ...c, x: HALL.x0 + 0.95, z: -13.2 + i * 1.75, yaw: Math.PI / 2 }));

// ------------------------------------------------------------------ outils
const rnd = (a, b) => a + Math.random() * (b - a);
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, rep = [1, 1], srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 8; return t; };
const FONT = 'Bungee, Inter, sans-serif';
// panneau de texte (fond transparent possible), net : 256 px par mètre de hauteur
function label(text, { w = 2, h = 0.4, fg = '#fff', bg = null, glow = null, font = FONT, weight = '', align = 'center', pad = 0.06 } = {}) {
  const ppm = 256, W = Math.round(w * ppm), H = Math.round(h * ppm); const [c, g] = canvas(W, H);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
  let s = H * 0.72; g.font = `${weight} ${s}px ${font}`; while (g.measureText(text).width > W * (1 - pad * 2) && s > 8) { s -= 2; g.font = `${weight} ${s}px ${font}`; }
  g.textAlign = align; g.textBaseline = 'middle'; const x = align === 'left' ? W * pad : align === 'right' ? W * (1 - pad) : W / 2;
  if (glow) { g.shadowColor = glow; g.shadowBlur = H * 0.18; }
  g.fillStyle = fg; g.fillText(text, x, H / 2 + s * 0.04);
  if (glow) { g.shadowBlur = 0; g.fillText(text, x, H / 2 + s * 0.04); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 2; return m;
}

// regroupe la géométrie statique par matière (quelques dizaines d'appels de rendu pour toute la salle)
class Batch {
  constructor() { this.parts = new Map(); }
  add(mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(g); return this;
  }
  box(mat, w, h, d, x, y, z, ry = 0) { return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, ry); }
  build(root, name, { cast = true, receive = true } = {}) {
    let i = 0; for (const [mat, list] of this.parts) { const g = mergeGeometries(list, false); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.name = `${name}_${i++}`; m.castShadow = cast; m.receiveShadow = receive; root.add(m); }
  }
}
// UV « monde » pour les boîtes (texture à l'échelle, sans étirement) : u,v en mètres / taille du motif
function worldUV(geo, size = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]; uv[i * 2] = u / size; uv[i * 2 + 1] = v / size; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}

// ------------------------------------------------------------------ textures
// béton ciré sombre, dalles de 4 m avec joints sciés, légères traces de pneus de chariot et de semelles
function floorTexture() {
  const S = 1024; const [c, g] = canvas(S, S);
  g.fillStyle = '#34363b'; g.fillRect(0, 0, S, S);
  const im = g.getImageData(0, 0, S, S), d = im.data; // grain + nuages
  const cloud = (x, y) => Math.sin(x * 0.011 + Math.sin(y * 0.007) * 2) * Math.cos(y * 0.009 + Math.sin(x * 0.005) * 1.6);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = (y * S + x) * 4; const v = (Math.random() - 0.5) * 14 + cloud(x, y) * 9 + cloud(x * 2.3 + 40, y * 2.1) * 5; d[k] += v; d[k + 1] += v; d[k + 2] += v * 1.1; }
  g.putImageData(im, 0, 0);
  g.globalAlpha = 0.07; for (let i = 0; i < 60; i++) { g.strokeStyle = Math.random() < 0.5 ? '#000' : '#888'; g.lineWidth = rnd(4, 18); g.beginPath(); const x = rnd(0, S), y = rnd(0, S); g.moveTo(x, y); g.bezierCurveTo(x + rnd(-200, 200), y + rnd(-200, 200), x + rnd(-300, 300), y + rnd(-300, 300), x + rnd(-400, 400), y + rnd(-400, 400)); g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = '#1e1f22'; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S); // joints (dalle de 4 m)
  return tex(c, [(HALL.x1 - HALL.x0) / 4, (HALL.z1 - HALL.z0) / 4]);
}
function floorRough() { // brillant par plaques (cire usée)
  const S = 256; const [c, g] = canvas(S, S); g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,20' : '160,160,160'},${rnd(0.04, 0.14)})`; g.beginPath(); g.ellipse(rnd(0, S), rnd(0, S), rnd(10, 60), rnd(8, 40), rnd(0, 3), 0, 7); g.fill(); }
  return tex(c, [(HALL.x1 - HALL.x0) / 4, (HALL.z1 - HALL.z0) / 4], false);
}
// panneaux acoustiques sombres des murs (lames verticales)
function wallTexture() {
  const W = 512, H = 512; const [c, g] = canvas(W, H); g.fillStyle = '#1d2026'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 32) { g.fillStyle = x % 64 ? '#22262d' : '#1a1d22'; g.fillRect(x, 0, 28, H); g.fillStyle = '#121418'; g.fillRect(x + 28, 0, 4, H); }
  const im = g.getImageData(0, 0, W, H), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = (Math.random() - 0.5) * 8; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(im, 0, 0);
  return tex(c);
}
// panneau perforé (mur d'armes), gris anthracite
function pegTexture() {
  const S = 256; const [c, g] = canvas(S, S); g.fillStyle = '#2b2e33'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#121316'; for (let y = 8; y < S; y += 16) for (let x = 8; x < S; x += 16) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
  return tex(c);
}
// tapis de sol caoutchouc (arène, réception des sauts)
function rubberTexture(col = '#25282c') {
  const S = 256; const [c, g] = canvas(S, S); g.fillStyle = col; g.fillRect(0, 0, S, S);
  const im = g.getImageData(0, 0, S, S), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = (Math.random() - 0.5) * 22; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(im, 0, 0);
  return tex(c);
}
// marquage au sol de toute la salle (une seule texture) : couloirs de tir, cercles de lancer, tracé du parcours, zones
function markingsTexture() {
  const ppm = 24, W = (HALL.x1 - HALL.x0) * ppm, H = (HALL.z1 - HALL.z0) * ppm; const [c, g] = canvas(W, H);
  const X = (x) => (x - HALL.x0) * ppm, Z = (z) => (z - HALL.z0) * ppm;
  g.lineCap = 'round';
  const line = (x0, z0, x1, z1, col, w = 0.1, dash = null) => { g.strokeStyle = col; g.lineWidth = w * ppm; g.setLineDash(dash ? dash.map((v) => v * ppm) : []); g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); g.setLineDash([]); };
  const rect = (x0, z0, x1, z1, col, w = 0.1, dash) => { line(x0, z0, x1, z0, col, w, dash); line(x1, z0, x1, z1, col, w, dash); line(x1, z1, x0, z1, col, w, dash); line(x0, z1, x0, z0, col, w, dash); };
  const fillRect = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm); };
  // hachures jaunes et noires (zones à dégager)
  const hatch = (x0, z0, x1, z1) => { g.save(); g.beginPath(); g.rect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm); g.clip(); fillRect(x0, z0, x1, z1, 'rgba(255,210,61,0.85)'); g.strokeStyle = 'rgba(20,20,20,0.9)'; g.lineWidth = 0.25 * ppm; for (let k = -60; k < 60; k += 0.7) { g.beginPath(); g.moveTo(X(x0 + k), Z(z0)); g.lineTo(X(x0 + k + (z1 - z0)), Z(z1)); g.stroke(); } g.restore(); };
  // stand de tir : ligne de tir, couloirs, graduations tous les 5 m
  const R = RANGE; hatch(R.line - 0.35, R.z0, R.line, R.z1);
  for (let i = 0; i <= 3; i++) { const z = i === 0 ? R.z0 : i === 3 ? R.z1 : (R.lanes[i - 1] + R.lanes[i]) / 2; line(R.line, z, R.x1, z, 'rgba(255,255,255,0.55)', 0.08); }
  for (let d = 5; d <= 38; d += 5) line(R.line + d, R.z0 + 0.2, R.line + d, R.z1 - 0.2, d % 10 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.35)', d % 10 ? 0.04 : 0.07, [0.4, 0.4]);
  // arène : bord, cercles de lancer depuis la ligne de lancer
  rect(ARENA.x0 + 0.3, ARENA.z0 + 0.3, ARENA.x1 - 0.3, ARENA.z1 - 0.3, 'rgba(255,45,149,0.7)', 0.12);
  const [tx, tz] = ARENA.throwFrom; hatch(tx - 0.3, tz - 2, tx, tz + 2);
  for (const d of ARENA.rings) { g.strokeStyle = 'rgba(57,255,136,0.8)'; g.lineWidth = 0.12 * ppm; g.beginPath(); g.arc(X(tx + d), Z(tz), 2.2 * ppm, 0, 7); g.stroke(); g.strokeStyle = 'rgba(57,255,136,0.35)'; g.beginPath(); g.arc(X(tx + d), Z(tz), 1 * ppm, 0, 7); g.stroke(); }
  // parcours : couloirs aller (A) et retour (B), flèches, glissade graduée
  const C = COURSE; rect(C.start, C.laneA[0], C.turn, C.laneA[1], 'rgba(34,227,255,0.7)', 0.1); rect(C.start, C.laneB[0], C.turn, C.laneB[1], 'rgba(34,227,255,0.7)', 0.1);
  fillRect(C.start, C.laneA[0], C.start + 0.5, C.laneA[1], 'rgba(57,255,136,0.9)'); fillRect(C.start, C.laneB[0], C.start + 0.5, C.laneB[1], 'rgba(255,45,149,0.9)');
  const arrow = (x, z, dir, col) => { g.fillStyle = col; g.save(); g.translate(X(x), Z(z)); g.rotate(dir); g.beginPath(); g.moveTo(0.9 * ppm, 0); g.lineTo(-0.5 * ppm, -0.7 * ppm); g.lineTo(-0.2 * ppm, 0); g.lineTo(-0.5 * ppm, 0.7 * ppm); g.closePath(); g.fill(); g.restore(); };
  for (let x = C.start + 3; x < C.turn - 2; x += 7) arrow(x, (C.laneA[0] + C.laneA[1]) / 2 + 2.2, 0, 'rgba(34,227,255,0.45)');
  for (let x = C.turn - 4; x > C.start + 2; x -= 7) arrow(x, C.laneB[1] - 1.1, Math.PI, 'rgba(34,227,255,0.45)');
  arrow(C.turn + 1.6, 11.3, Math.PI / 2, 'rgba(34,227,255,0.6)');
  // glissade : 12 m gradués au mètre, fin du couloir retour
  for (let m = 0; m <= 12; m++) line(C.start + 2 + m, C.laneB[1] - 2.4, C.start + 2 + m, C.laneB[1] - 0.2, m % 5 ? 'rgba(255,255,255,0.25)' : 'rgba(255,210,61,0.8)', m % 5 ? 0.04 : 0.08);
  // zone de départ, armurerie, bornes
  rect(-41.2, -14.6, -27, 0.8, 'rgba(255,255,255,0.25)', 0.08, [0.6, 0.4]);
  line(HALL.x0 + 0.6, WALL_Z + 2.4, -3.8, WALL_Z + 2.4, 'rgba(255,210,61,0.75)', 0.08);
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.08 * ppm; g.beginPath(); g.arc(X(SPAWN.x), Z(SPAWN.z), 1.2 * ppm, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ------------------------------------------------------------------ gameplay (même format que gameplay.json)
export function salleGameplay() {
  const H = HALL, col = [], plat = [], rampes = [];
  const box = (x, z, hx, hz, h, tag = 'mobilier', y0 = 0, yaw = 0) => col.push({ type: 'box', x, z, hx, hz, h, y0, yaw, tag });
  // murs (épais, hauts : rien ne passe)
  box((H.x0 + H.x1) / 2, H.z0 - 0.3, (H.x1 - H.x0) / 2 + 1, 0.62, 12, 'limite'); box((H.x0 + H.x1) / 2, H.z1 + 0.3, (H.x1 - H.x0) / 2 + 1, 0.62, 12, 'limite');
  box(H.x0 - 0.3, 0, 0.62, (H.z1 - H.z0) / 2 + 1, 12, 'limite'); box(H.x1 + 0.3, 0, 0.62, (H.z1 - H.z0) / 2 + 1, 12, 'limite');
  for (const s of salleSolids()) box(s.x, s.z, s.hx, s.hz, s.h, s.tag, s.y0 || 0, s.yaw || 0);
  for (const r of salleRamps()) rampes.push(r);
  for (const c of CABINETS) box(c.x, c.z, 0.4, 0.42, 2.1, 'borne');
  for (const z of RANGE.lanes) box(RANGE.line - 0.6, z, 0.35, 1.9, 1.08, 'mobilier');
  box(-38.5, 0.2, 1.5, 0.25, 0.5, 'banc'); box(-25.05, H.z1 - 0.3, 1.75, 0.3, 1.9, 'mobilier');
  for (const [x, z] of [[40.6, -4.6], [40.6, 23], [3.4, 23], [-41, 23]]) col.push({ type: 'circle', x, z, r: 0.3, h: 0.9, y0: 0, tag: 'mobilier' });
  const spawns = (n) => Array.from({ length: n }, (_, i) => ({ x: SPAWN.x + (i % 4) * 1.3 - 2, z: SPAWN.z + ((i / 4) | 0) * 1.3 - 1.5, yaw: SPAWN.yaw, y: 0 }));
  return {
    version: 1, id: 'salle', nom: 'La Salle', unite: 'mètre', axes: 'x est, y haut, z sud',
    limites: { x0: H.x0 - 1, x1: H.x1 + 1, z0: H.z0 - 1, z1: H.z1 + 1 },
    zones: [], spawns: { ordre: spawns(12), civils: spawns(12) }, lobby: [-24.5, -18.6, 0],
    colliders: col, plateformes: plat, rampes, boutiques: [], revente: [], cassables: [], parkings: [], realisme: {},
  };
}
// volumes solides (collisions ET maillages) : obstacles du parcours, couvertures de l'arène, cloisons du stand
function salleSolids() {
  const L = [];
  const S = (x, z, w, d, h, kind, extra = {}) => L.push({ x, z, hx: w / 2, hz: d / 2, h, kind, tag: kind === 'mur' ? 'muret' : 'mobilier', ...extra });
  // stand de tir : cloisons entre les postes (à hauteur de taille), mur blindé qui sépare le stand de l'arène, butte au fond
  const R = RANGE; for (let i = 0; i <= 3; i++) { const z = i === 0 ? R.z0 + 0.1 : i === 3 ? R.z1 - 0.1 : (R.lanes[i - 1] + R.lanes[i]) / 2; S(R.line - 1.2, z, 2.6, 0.12, 1.35, 'cloison'); }
  S(R.line + 0.5 + (R.x1 - R.line) / 2, -6.1, R.x1 - R.line - 1, 0.4, 3.4, 'blinde'); // laisse 1,5 m d'accès entre stand et arène côté ligne de tir
  S(R.x1 - 0.2, (R.z0 + R.z1) / 2, 1, R.z1 - R.z0, 3.2, 'butte');
  // arène : caisses, murets, tour centrale avec rampe, poteaux, blocs béton
  S(23.5, 7.5, 6, 6, 2.6, 'tour');
  for (const [x, z, w, d, h] of [[12, -1.5, 1.2, 1.2, 1.2], [13.2, -1.5, 1.2, 1.2, 1.2], [12.6, -1.5, 1.2, 1.2, 2.4], [32, 0, 3.6, 0.5, 1.1], [16, 13, 0.5, 3.6, 1.1], [31.5, 14.5, 1.2, 1.2, 1.2], [31.5, 15.7, 1.2, 1.2, 1.2], [36.5, 6, 1.2, 1.2, 1.2], [36.5, 6, 1.2, 1.2, 2.4], [9, 7.5, 0.5, 4, 1.1], [27, 21, 4, 0.5, 1.1], [38, 19.5, 2.4, 1.2, 1.2]]) S(x, z, w, d, h, h > 1.15 && w > 1 && d > 1 ? 'caisse' : w === 1.2 && d === 1.2 ? 'caisse' : 'muret', { y0: h > 1.25 && w === 1.2 ? 0 : 0 });
  S(19, -0.5, 0.8, 0.8, 9.5, 'poteau'); S(30, 10.5, 0.8, 0.8, 9.5, 'poteau'); S(19, 18, 0.8, 0.8, 9.5, 'poteau');
  // parcours, couloir aller (A, z 3,6 à 9,6) : marche, haies de saut, mur à escalader, plateformes et vide à franchir
  const A = (COURSE.laneA[0] + COURSE.laneA[1]) / 2;
  S(-34, A, 1.2, 5.6, 0.45, 'bloc'); S(-30.5, A, 0.6, 5.6, 0.9, 'haie'); S(-27, A, 0.6, 5.6, 1.3, 'haie');
  S(-22.5, A, 0.5, 5.6, 2.2, 'mur'); S(-20.2, A, 4, 5.6, 2.2, 'estrade'); S(-14.6, A, 3.2, 5.6, 2.2, 'estrade'); // vide de 2,4 m entre les deux
  S(-9.5, A, 1.2, 2.4, 1.2, 'caisse'); S(-9.5, A + 1.8, 1.2, 1.2, 0.6, 'caisse');
  // couloir retour (B, z 13 à 22,6) : rampe vers une passerelle à 3 m, saut dans le vide sur un tapis, slalom, glissade graduée
  const B = (COURSE.laneB[0] + COURSE.laneB[1]) / 2;
  S(-12.5, 15.5, 8, 2.6, 3, 'passerelle');
  for (let i = 0; i < 4; i++) S(-29 + i * 2.6, i % 2 ? B - 1.3 : B + 1.3, 0.5, 0.5, 2.2, 'plot');
  return L;
}
function salleRamps() { return [
  { id: 'rampe_tour', a: [15.6, 0, 7.5], b: [20.5, 2.6, 7.5], largeur: 2.4, marches: 0, palier: null },
  { id: 'rampe_passerelle', a: [-2.6, 0, 15.5], b: [-8.5, 3, 15.5], largeur: 2.6, marches: 0, palier: null },
]; }

// ------------------------------------------------------------------ maillages
export function buildSalle() {
  const root = new THREE.Group(); root.name = 'salle'; const H = HALL, W = H.x1 - H.x0, D = H.z1 - H.z0;
  const ground = [];
  // sol
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughnessMap: floorRough(), roughness: 0.42, metalness: 0.05, color: '#ffffff' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat); floor.position.set((H.x0 + H.x1) / 2, 0, (H.z0 + H.z1) / 2); floor.name = 'sol_salle'; floor.receiveShadow = true; root.add(floor); ground.push(floor);
  const marks = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: markingsTexture(), transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  marks.position.set((H.x0 + H.x1) / 2, 0.004, (H.z0 + H.z1) / 2); marks.name = 'marquage_sol'; marks.receiveShadow = true; marks.renderOrder = 1; root.add(marks);

  const mats = {
    wall: new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.85, color: '#ffffff' }),
    peg: new THREE.MeshStandardMaterial({ map: pegTexture(), roughness: 0.7, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: '#3a3e45', roughness: 0.45, metalness: 0.85 }),
    steelDark: new THREE.MeshStandardMaterial({ color: '#202328', roughness: 0.5, metalness: 0.7 }),
    black: new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.6, metalness: 0.2 }),
    rubber: new THREE.MeshStandardMaterial({ map: rubberTexture(), roughness: 0.95 }),
    rubberRose: new THREE.MeshStandardMaterial({ map: rubberTexture('#5a1d3a'), roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#8d8f93', roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#9a7347', roughness: 0.75 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#e8b923', roughness: 0.55, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: '#9fd8ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
  };
  const neon = {}; for (const [k, c] of Object.entries(NEON)) neon[k] = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.4, toneMapped: false });
  const N = new Batch(), B = new Batch();
  // murs : panneaux sombres sur 9,5 m ; plinthe néon et bandeau néon en haut
  const wallGeo = (w, h, d) => worldUV(new THREE.BoxGeometry(w, h, d), 2);
  B.add(mats.wall, wallGeo(W + 2, H.h, 0.6), (H.x0 + H.x1) / 2, H.h / 2, H.z0 - 0.3).add(mats.wall, wallGeo(W + 2, H.h, 0.6), (H.x0 + H.x1) / 2, H.h / 2, H.z1 + 0.3);
  B.add(mats.wall, wallGeo(0.6, H.h, D), H.x0 - 0.3, H.h / 2, (H.z0 + H.z1) / 2).add(mats.wall, wallGeo(0.6, H.h, D), H.x1 + 0.3, H.h / 2, (H.z0 + H.z1) / 2);
  const strip = (x0, z0, x1, z1, y, col, t = 0.05) => { const L = Math.hypot(x1 - x0, z1 - z0); N.add(neon[col], new THREE.BoxGeometry(L, t, t), (x0 + x1) / 2, y, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0)); };
  const e = 0.03;
  strip(H.x0 + e, H.z0 + e, H.x1 - e, H.z0 + e, 0.12, 'cyan'); strip(H.x0 + e, H.z1 - e, H.x1 - e, H.z1 - e, 0.12, 'rose'); strip(H.x0 + e, H.z0 + e, H.x0 + e, H.z1 - e, 0.12, 'jaune'); strip(H.x1 - e, H.z0 + e, H.x1 - e, H.z1 - e, 0.12, 'violet');
  strip(H.x0 + e, H.z0 + e, H.x1 - e, H.z0 + e, 6.4, 'rose', 0.08); strip(H.x0 + e, H.z1 - e, H.x1 - e, H.z1 - e, 6.4, 'cyan', 0.08); strip(H.x0 + e, H.z0 + e, H.x0 + e, H.z1 - e, 6.4, 'cyan', 0.08); strip(H.x1 - e, H.z0 + e, H.x1 - e, H.z1 - e, 6.4, 'rose', 0.08);
  // verrière : fermes métalliques tous les 6 m (leurs ombres rayent le sol), pannes, et vitrage invisible au soleil
  for (let x = H.x0 + 3; x < H.x1; x += 6) {
    B.box(mats.steel, 0.25, 0.5, D, x, H.h - 0.25, (H.z0 + H.z1) / 2); B.box(mats.steel, 0.12, 0.12, D, x, H.h - 1.6, (H.z0 + H.z1) / 2);
    for (let z = H.z0 + 2; z < H.z1; z += 4) B.add(mats.steel, new THREE.BoxGeometry(0.06, 1.6, 0.06), x, H.h - 0.85, z, 0, (z / 4) % 2 ? 0.6 : -0.6);
  }
  for (let z = H.z0 + 4; z < H.z1; z += 8) B.box(mats.steelDark, W, 0.18, 0.14, (H.x0 + H.x1) / 2, H.h - 0.1, z);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), mats.glass); roof.position.set((H.x0 + H.x1) / 2, H.h, (H.z0 + H.z1) / 2); roof.name = 'verriere_glass'; roof.castShadow = false; root.add(roof);
  // rampes lumineuses suspendues aux fermes (tubes néon blancs chauds alternés)
  const tubeW = new THREE.MeshStandardMaterial({ color: '#fff3e0', emissive: '#fff3e0', emissiveIntensity: 1.6, toneMapped: false });
  for (let x = H.x0 + 3; x < H.x1; x += 12) for (let z = H.z0 + 6; z < H.z1; z += 12) N.add(tubeW, new THREE.BoxGeometry(0.06, 0.04, 3.2), x, H.h - 1.75, z);

  // mur d'armes : panneau perforé, bandeau d'enseigne
  const wallX0 = H.x0 + 0.6, wallX1 = -3.8;
  B.add(mats.peg, worldUV(new THREE.BoxGeometry(wallX1 - wallX0, 3.6, 0.06), 1.2), (wallX0 + wallX1) / 2, 2.05, H.z0 + 0.03);
  B.box(mats.black, wallX1 - wallX0 + 0.2, 0.7, 0.14, (wallX0 + wallX1) / 2, 4.25, H.z0 + 0.07);
  strip(wallX0, H.z0 + 0.16, wallX1, H.z0 + 0.16, 3.88, 'jaune', 0.04); strip(wallX0, H.z0 + 0.16, wallX1, H.z0 + 0.16, 0.24, 'jaune', 0.04);
  const ttl = label('ARMURERIE · PRENDS CE QUE TU VEUX', { w: 12, h: 0.55, fg: '#ffd23d', glow: '#ffb000' }); ttl.position.set((wallX0 + wallX1) / 2, 4.25, H.z0 + 0.15); root.add(ttl);
  // supports : un cadre lumineux par arme, plaque du nom, pictogramme de catégorie
  const slots = weaponSlots(); for (const s of slots) {
    const c = CAT_COL[s.cat];
    B.box(mats.black, s.w - 0.08, s.h - 0.08, 0.04, s.x, s.y, WALL_Z - 0.2);
    strip(s.x - s.w / 2 + 0.06, WALL_Z - 0.17, s.x + s.w / 2 - 0.06, WALL_Z - 0.17, s.y - s.h / 2 + 0.06, catKey(c), 0.025);
    for (const dx of [-0.32, 0.32]) B.add(mats.steel, new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6).rotateX(Math.PI / 2), s.x + dx * Math.min(1, s.w / 1.6), s.y - 0.08, WALL_Z - 0.12);
    const pl = label(WEAPONS[s.id].name.toUpperCase(), { w: s.w - 0.12, h: 0.17, fg: '#fff', bg: 'rgba(10,10,12,0.85)', font: 'Inter, sans-serif', weight: '900' }); pl.position.set(s.x, s.y - s.h / 2 + 0.16, WALL_Z - 0.17); root.add(pl);
  }
  for (const g of catGroups()) { const t = label(WEAPON_CATS[g.cat].toUpperCase(), { w: Math.max(1.6, g.x1 - g.x0), h: 0.26, fg: CAT_COL[g.cat], glow: CAT_COL[g.cat], font: 'Inter, sans-serif', weight: '900' }); t.position.set((g.x0 + g.x1) / 2, 3.62, WALL_Z - 0.17); root.add(t); }

  // volumes solides
  for (const s of salleSolids()) solidMesh(B, N, mats, s, strip);
  // rampes (béton strié + nez de marche jaunes)
  for (const r of salleRamps()) { const dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2], L = Math.hypot(dx, dz), h = r.b[1] - r.a[1]; const ang = Math.atan2(h, L), yaw = -Math.atan2(dz, dx);
    const g = new THREE.BoxGeometry(Math.hypot(L, h) + 0.1, 0.2, r.largeur); B.add(mats.rubber, g, (r.a[0] + r.b[0]) / 2, h / 2 - 0.08, (r.a[2] + r.b[2]) / 2, yaw, 0, ang * Math.sign(dx || 1));
    for (const s of [-1, 1]) { const ox = Math.sin(-yaw) * 0, sz = s * (r.largeur / 2 + 0.03); const px = (r.a[0] + r.b[0]) / 2 - Math.sin(yaw) * sz * 0, pz = (r.a[2] + r.b[2]) / 2 + sz * Math.cos(yaw); N.add(neon.jaune, new THREE.BoxGeometry(Math.hypot(L, h), 0.04, 0.04), px + ox, h / 2 + 0.05, pz, yaw, 0, ang * Math.sign(dx || 1)); }
  }
  // portiques du parcours (départ / arrivée) et grand chrono
  const gate = (z0, z1, col, text) => { const x = COURSE.start + 0.25; for (const z of [z0, z1]) B.box(mats.black, 0.2, 3.2, 0.2, x, 1.6, z); N.add(neon[col], new THREE.BoxGeometry(0.08, 0.08, z1 - z0), x, 3.15, (z0 + z1) / 2); for (const sd of [1, -1]) { const t = label(text, { w: z1 - z0 - 0.6, h: 0.5, fg: NEON[col], glow: NEON[col] }); t.rotation.y = sd * Math.PI / 2; t.position.set(x + sd * 0.12, 2.75, (z0 + z1) / 2); root.add(t); } };
  gate(COURSE.laneA[0], COURSE.laneA[1], 'vert', 'DÉPART →'); gate(COURSE.laneB[0], COURSE.laneB[1], 'rose', '← ARRIVÉE');
  // tapis de réception sous la passerelle et la plateforme
  B.add(mats.rubberRose, new THREE.BoxGeometry(4.4, 0.12, 5.4), -18.4, 0.06, 15.5); B.add(mats.rubberRose, new THREE.BoxGeometry(4, 0.12, 5.4), -11, 0.06, (COURSE.laneA[0] + COURSE.laneA[1]) / 2 + 0);
  // stand : tablettes des postes, écrans de distance, butte
  for (const z of RANGE.lanes) { B.box(mats.wood, 0.7, 0.06, 3.8, RANGE.line - 0.6, 1.05, z); B.box(mats.steelDark, 0.6, 1.0, 0.08, RANGE.line - 0.6, 0.52, z - 1.7); B.box(mats.steelDark, 0.6, 1.0, 0.08, RANGE.line - 0.6, 0.52, z + 1.7); }
  RANGE.lanes.forEach((z, i) => { const t = label(`POSTE ${i + 1}`, { w: 2.2, h: 0.4, fg: NEON.cyan, glow: NEON.cyan }); t.rotation.y = -Math.PI / 2; t.position.set(RANGE.line - 2.45, 2.8, z); root.add(t); });
  for (const T of TARGETS) { const z = RANGE.lanes[T.lane] + T.dz, x = RANGE.line + T.d; const t = label(`${T.d} M`, { w: 1.2, h: 0.36, fg: '#fff', bg: 'rgba(0,0,0,0.6)' }); t.rotation.y = -Math.PI / 2; t.position.set(x + 0.6, 2.35, z); root.add(t);
    B.add(mats.yellow, new THREE.CylinderGeometry(0.42, 0.48, 0.08, 16), x, 0.04, z); }
  // arène : panneau, numéros des cercles de lancer
  const arenaT = label('ARÈNE', { w: 6, h: 1.1, fg: NEON.rose, glow: NEON.rose }); arenaT.rotation.y = -Math.PI / 2; arenaT.position.set(H.x1 - 0.12, 4.6, 8.5); root.add(arenaT);
  ARENA.rings.forEach((d) => { const t = label(`${d} M`, { w: 1.6, h: 0.5, fg: NEON.vert, bg: null, glow: NEON.vert }); t.rotation.x = -Math.PI / 2; t.position.set(ARENA.throwFrom[0] + d, 0.02, ARENA.throwFrom[1] + 2.9); root.add(t); });
  { const t = label('LANCER', { w: 2.4, h: 0.5, fg: NEON.vert, glow: NEON.vert }); t.rotation.x = -Math.PI / 2; t.rotation.z = Math.PI / 2; t.position.set(ARENA.throwFrom[0] - 1.2, 0.02, ARENA.throwFrom[1]); root.add(t); }
  const parT = label('PARCOURS', { w: 7, h: 1.1, fg: NEON.cyan, glow: NEON.cyan }); parT.rotation.y = Math.PI; parT.position.set(-21, 4.6, H.z1 - 0.12); root.add(parT);
  const tirT = label('STAND DE TIR', { w: 8, h: 1.0, fg: NEON.jaune, glow: NEON.jaune }); tirT.rotation.y = -Math.PI / 2; tirT.position.set(H.x1 - 0.12, 4.9, -15); root.add(tirT);
  // enseigne principale « FRUNGZ ARCADE » suspendue au-dessus du centre, visible des deux côtés
  for (const s of [1, -1]) { const sg = label('FRUNGZ ARCADE', { w: 11, h: 1.6, fg: '#ffffff', glow: NEON.rose }); sg.position.set(0, 7.2, -0.04 * s); sg.rotation.y = s > 0 ? 0 : Math.PI; root.add(sg);
    const sub = label("SALLE D'ENTRAÎNEMENT", { w: 8, h: 0.45, fg: NEON.cyan, glow: NEON.cyan, font: 'Inter, sans-serif', weight: '900' }); sub.position.set(0, 6.15, -0.04 * s); sub.rotation.y = s > 0 ? 0 : Math.PI; root.add(sub); }
  B.box(mats.black, 11.6, 2.9, 0.06, 0, 6.85, 0); N.add(neon.rose, new THREE.BoxGeometry(11.6, 0.05, 0.1), 0, 8.32, 0); N.add(neon.rose, new THREE.BoxGeometry(11.6, 0.05, 0.1), 0, 5.38, 0);
  for (const x of [-5, 5]) B.box(mats.steel, 0.03, H.h - 8.3, 0.03, x, (H.h + 8.3) / 2, 0);
  // bornes d'arcade (actions de la salle)
  for (const c of CABINETS) root.add(cabinet(c));
  // décor : banc et casiers dans la zone de départ, fûts, enceintes
  B.box(mats.wood, 3, 0.08, 0.45, -38.5, 0.45, 0.2); for (const x of [-39.8, -37.2]) B.box(mats.steel, 0.06, 0.45, 0.4, x, 0.22, 0.2);
  for (let i = 0; i < 6; i++) { B.box(mats.steelDark, 0.55, 1.9, 0.5, -26.5 + i * 0.58, 0.95, H.z1 - 0.3); N.add(neon.cyan, new THREE.BoxGeometry(0.4, 0.02, 0.02), -26.5 + i * 0.58, 1.75, H.z1 - 0.56); }
  for (const [x, z] of [[40.6, -4.6], [40.6, 23], [3.4, 23], [-41, 23]]) { B.add(mats.yellow, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), x, 0.45, z); }
  for (const [x, z, r] of [[-41.4, -20, Math.PI / 2], [41.4, 0, -Math.PI / 2], [-6, 23.4, Math.PI]]) { B.box(mats.black, 0.7, 1.1, 0.5, x, 5.4, z, r); }

  B.build(root, 'salle'); N.build(root, 'glow_salle', { cast: false, receive: false });
  return { root, ground, slots };
}
const catKey = (c) => Object.keys(NEON).find((k) => NEON[k] === c) || 'cyan';
function solidMesh(B, N, mats, s, strip) {
  const w = s.hx * 2, d = s.hz * 2, h = s.h, x = s.x, z = s.z, y0 = s.y0 || 0;
  const rb = (m, ww, hh, dd, yy, r = 0.04) => B.add(m, new RoundedBoxGeometry(ww, hh, dd, 2, Math.min(r, ww / 2.5, hh / 2.5, dd / 2.5)), x, yy, z);
  switch (s.kind) {
    case 'caisse': { rb(mats.wood, w, h, d, y0 + h / 2, 0.03); for (let yy = 0.25; yy < h; yy += 1.2) B.box(mats.steelDark, w + 0.02, 0.06, d + 0.02, x, y0 + yy, z); B.box(mats.steelDark, w + 0.02, 0.06, d + 0.02, x, y0 + h - 0.05, z); break; }
    case 'muret': case 'bloc': { rb(mats.concrete, w, h, d, y0 + h / 2, 0.06); B.box(mats.yellow, w + 0.01, 0.1, d + 0.01, x, y0 + h - 0.05, z); break; }
    case 'haie': { rb(mats.black, w, h, d, h / 2, 0.05); B.box(mats.yellow, w + 0.01, 0.06, d + 0.01, x, h - 0.06, z); strip(x - w / 2 - 0.02, z - d / 2, x - w / 2 - 0.02, z + d / 2, h - 0.15, 'cyan', 0.03); break; }
    case 'mur': { rb(mats.black, w, h, d, h / 2, 0.04); strip(x - w / 2 - 0.02, z - d / 2, x - w / 2 - 0.02, z + d / 2, h - 0.08, 'cyan', 0.035); break; }
    case 'estrade': case 'passerelle': case 'tour': { rb(mats.steelDark, w, h - 0.12, d, (h - 0.12) / 2, 0.03); B.add(mats.rubber, new THREE.BoxGeometry(w, 0.12, d), x, h - 0.06, z);
      strip(x - w / 2, z - d / 2 - 0.02, x + w / 2, z - d / 2 - 0.02, h - 0.02, s.kind === 'tour' ? 'rose' : 'cyan', 0.035); strip(x - w / 2, z + d / 2 + 0.02, x + w / 2, z + d / 2 + 0.02, h - 0.02, s.kind === 'tour' ? 'rose' : 'cyan', 0.035);
      strip(x - w / 2 - 0.02, z - d / 2, x - w / 2 - 0.02, z + d / 2, h - 0.02, s.kind === 'tour' ? 'rose' : 'cyan', 0.035); strip(x + w / 2 + 0.02, z - d / 2, x + w / 2 + 0.02, z + d / 2, h - 0.02, s.kind === 'tour' ? 'rose' : 'cyan', 0.035); break; }
    case 'plot': { B.add(mats.yellow, new THREE.CylinderGeometry(0.25, 0.25, h, 14), x, h / 2, z); for (let yy = 0.3; yy < h; yy += 0.5) B.add(mats.black, new THREE.CylinderGeometry(0.255, 0.255, 0.18, 14), x, yy, z); break; }
    case 'poteau': { B.box(mats.steel, w, h, d, x, h / 2, z); strip(x - w / 2 - 0.02, z - d / 2 - 0.02, x - w / 2 - 0.02, z - d / 2 - 0.02, 0, 'rose'); for (const yy of [1.2, 2.4]) B.box(mats.yellow, w + 0.02, 0.12, d + 0.02, x, yy, z); break; }
    case 'cloison': { B.box(mats.steelDark, w, h, d, x, h / 2, z); B.box(mats.yellow, w + 0.01, 0.05, d + 0.02, x, h, z); break; }
    case 'blinde': { B.box(mats.concrete, w, 1.1, d, x, 0.55, z); B.box(mats.steelDark, w, 0.1, d + 0.06, x, 1.15, z); B.add(mats.glass, new THREE.BoxGeometry(w, h - 1.2, 0.06), x, 1.2 + (h - 1.2) / 2, z); for (let xx = x - w / 2; xx <= x + w / 2 + 0.01; xx += 3) B.box(mats.steelDark, 0.08, h - 1.2, 0.12, xx, 1.2 + (h - 1.2) / 2, z); B.box(mats.steelDark, w, 0.08, 0.12, x, h, z); break; }
    case 'butte': { B.add(mats.rubber, new THREE.BoxGeometry(w, h, d), x, h / 2, z); for (let zz = s.z - s.hz + 0.6; zz < s.z + s.hz; zz += 1.2) B.box(mats.black, 0.05, h - 0.2, 0.04, x - w / 2 - 0.02, h / 2, zz); break; }
  }
}
// cases du mur d'armes : par catégorie, en colonnes de deux, de gauche à droite
function weaponSlots() {
  const out = []; let x = HALL.x0 + 1.6; const ids = Object.keys(WEAPONS); const cw = 1.68, gap = 0.5, rows = [2.75, 1.45];
  for (const cat of Object.keys(WEAPON_CATS)) { const list = ids.filter((id) => WEAPONS[id].cat === cat); if (!list.length) continue;
    list.forEach((id, i) => out.push({ id, cat, x: x + ((i / 2) | 0) * cw + cw / 2, y: rows[i % 2], w: cw - 0.08, h: 1.18 }));
    x += Math.ceil(list.length / 2) * cw + gap; }
  return out;
}
function catGroups() { const g = {}; for (const s of weaponSlots()) { const e = g[s.cat] ||= { cat: s.cat, x0: 1e9, x1: -1e9 }; e.x0 = Math.min(e.x0, s.x - s.w / 2); e.x1 = Math.max(e.x1, s.x + s.w / 2); } return Object.values(g); }

// pose les armes sur le mur une fois leurs modèles chargés
export function armerMur(root, slots, gunInstance) {
  const g = new THREE.Group(); g.name = 'mur_armes'; root.add(g); const box = new THREE.Box3(), size = new THREE.Vector3(), ctr = new THREE.Vector3();
  for (const s of slots) { let m; try { m = gunInstance(s.id); } catch (e) { console.warn('mur d\'armes', s.id, e); continue; }
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.setScalar(1); m.updateMatrixWorld(true); box.setFromObject(m); box.getSize(size); box.getCenter(ctr);
    const k = Math.min(1.25, (s.w - 0.22) / Math.max(0.2, size.x), 0.62 / Math.max(0.1, size.y));
    const holder = new THREE.Group(); holder.position.set(s.x, s.y + 0.06, WALL_Z - 0.05 - size.z * k / 2); holder.scale.setScalar(k); m.position.copy(ctr).multiplyScalar(-1); holder.add(m); g.add(holder);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); s.mesh = holder; }
  return g;
}

// borne d'arcade : caisson noir, écran lumineux avec le titre, panneau de boutons
function cabinet(c) {
  const g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = c.yaw; g.name = 'borne_' + c.id;
  const body = new THREE.MeshStandardMaterial({ color: '#15161b', roughness: 0.4, metalness: 0.3 });
  const side = new THREE.MeshStandardMaterial({ color: c.col, emissive: c.col, emissiveIntensity: 0.35, roughness: 0.35 });
  const b = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.02), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  b(0.78, 1.0, 0.7, body, 0, 0.5, -0.05); b(0.78, 0.95, 0.45, body, 0, 1.45, -0.18); b(0.82, 0.22, 0.6, side, 0, 1.98, -0.1);
  b(0.78, 0.12, 0.42, body, 0, 1.02, 0.22, -0.35); for (const sx of [-0.4, 0.4]) b(0.03, 2.1, 0.72, side, sx, 1.05, -0.08);
  // écran : titre, sous-titre, petit motif ; il s'allume (on le rafraîchit quand l'état change)
  const [cv, gx] = canvas(512, 384); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const draw = (state = '') => { gx.fillStyle = '#05060a'; gx.fillRect(0, 0, 512, 384); gx.strokeStyle = c.col; gx.lineWidth = 6; gx.strokeRect(14, 14, 484, 356);
    for (let y = 0; y < 384; y += 4) { gx.fillStyle = 'rgba(255,255,255,0.025)'; gx.fillRect(0, y, 512, 2); }
    gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.shadowColor = c.col; gx.shadowBlur = 18; gx.fillStyle = '#fff'; let s = 64; gx.font = `${s}px ${FONT}`; while (gx.measureText(c.titre).width > 460 && s > 20) { s -= 2; gx.font = `${s}px ${FONT}`; } gx.fillText(c.titre, 256, 130);
    gx.shadowBlur = 0; gx.fillStyle = c.col; gx.font = '900 30px Inter, sans-serif'; gx.fillText(c.sous, 256, 200);
    if (state) { gx.fillStyle = c.col; gx.fillRect(96, 250, 320, 70); gx.fillStyle = '#05060a'; gx.font = `40px ${FONT}`; gx.fillText(state, 256, 287); }
    else { gx.fillStyle = 'rgba(255,255,255,0.85)'; gx.font = '900 28px Inter, sans-serif'; gx.fillText('APPUIE POUR JOUER', 256, 285); }
    t.needsUpdate = true; };
  draw();
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.53), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); scr.position.set(0, 1.47, 0.075); scr.rotation.x = -0.12; g.add(scr);
  // boutons
  const bm = (col) => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, toneMapped: false });
  [[-0.2, '#ff2d95'], [0, '#ffd23d'], [0.2, '#22e3ff']].forEach(([x, col]) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), bm(col)); o.position.set(x, 1.1, 0.25); o.rotation.x = -0.35; g.add(o); });
  const stick = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), bm('#ff2d95')); stick.position.set(-0.32, 1.16, 0.18); g.add(stick);
  g.userData = { cab: c, draw };
  return g;
}
