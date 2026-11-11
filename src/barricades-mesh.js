// Barricades : modèles et matières réalistes, faits pour être vus de près (on les a souvent plein champ).
// Textures peintes au chargement (couleur + relief + rugosité, tuilables, 512 px), plaquées en mètres par projection
// selon la face (même densité partout, pas d'étirement), arêtes chanfreinées, vraie tôle ondulée, saleté qui remonte du sol
// (couleurs de sommets), ombre de contact au pied. Une géométrie fusionnée par matière et par (camp, niveau), partagée.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BARRICADE, textTex } from './props.js';

// ------------------------------------------------------------------ bruit tuilable
const hash = (x, y, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function noise(S, cx, cy, seed) { // bruit de valeur lissé, tuilable, cx × cy cellules
  const o = new Float32Array(S * S);
  for (let y = 0; y < S; y++) { const fy = y / S * cy, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < S; x++) { const fx = x / S * cx, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
      const a = hash(ix % cx, iy % cy, seed), b = hash((ix + 1) % cx, iy % cy, seed), c = hash(ix % cx, (iy + 1) % cy, seed), d = hash((ix + 1) % cx, (iy + 1) % cy, seed);
      o[y * S + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; } }
  return o;
}
function fbm(S, cx, cy, oct, seed) { const o = new Float32Array(S * S); let amp = 0.5, tot = 0; for (let k = 0; k < oct; k++) { const n = noise(S, cx << k, cy << k, seed + k * 31); for (let i = 0; i < o.length; i++) o[i] += n[i] * amp; tot += amp; amp *= 0.5; } for (let i = 0; i < o.length; i++) o[i] /= tot; return o; }
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (c) => { const v = new THREE.Color(c); return [v.r, v.g, v.b]; }; // linéaire → on écrit en sRGB plus bas

// peint une matière : f(x, y, i) → [r, g, b, hauteur 0..1, rugosité 0..1] ; renvoie map (sRGB), bumpMap, roughnessMap
function paint(S, f) {
  const cm = document.createElement('canvas'), cb = document.createElement('canvas'), cr = document.createElement('canvas'); cm.width = cm.height = cb.width = cb.height = cr.width = cr.height = S;
  const gm = cm.getContext('2d'), gb = cb.getContext('2d'), gr = cr.getContext('2d'); const im = gm.createImageData(S, S), ib = gb.createImageData(S, S), ir = gr.createImageData(S, S);
  const toS = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, [r, g, b, h, ro] = f(x, y, i), k = i * 4;
    im.data[k] = toS(r); im.data[k + 1] = toS(g); im.data[k + 2] = toS(b); im.data[k + 3] = 255;
    const hv = Math.round(sat(h) * 255); ib.data[k] = ib.data[k + 1] = ib.data[k + 2] = hv; ib.data[k + 3] = 255;
    const rv = Math.round(sat(ro) * 255); ir.data[k] = ir.data[k + 1] = ir.data[k + 2] = rv; ir.data[k + 3] = 255; }
  gm.putImageData(im, 0, 0); gb.putImageData(ib, 0, 0); gr.putImageData(ir, 0, 0);
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: T(cm, true), bump: T(cb), rough: T(cr) };
}

// ------------------------------------------------------------------ matières (1 tuile = `tile` mètres)
const LIB = {
  // planches de palette : bois brut grisé, fil, nœuds, têtes de clous, interstices
  palette: { tile: 1.2, bump: 2.2, metal: 0, gen(S) {
    const g1 = fbm(S, 2, 32, 4, 11), g2 = fbm(S, 4, 4, 3, 12), tone = fbm(S, 3, 3, 2, 13), PL = 6; // 6 planches par tuile (20 cm)
    return paint(S, (x, y, i) => { const p = Math.floor(y / S * PL), v = (y / S * PL) % 1, pid = hash(p, 0, 5);
      const gap = sstep(0.0, 0.035, v) * sstep(1, 0.965, v), grain = g1[(y * S + ((x + Math.floor(pid * S)) % S))];
      let kn = 0; for (let k = 0; k < 2; k++) { const kx = hash(p, k, 9) * S, ky = (p + 0.3 + 0.4 * hash(p, k, 8)) / PL * S, d = Math.hypot((x - kx) * 0.6, y - ky) / (S * 0.018); kn = Math.max(kn, sstep(1.4, 0.2, d)); }
      const nail = [0.08, 0.92].some((u) => Math.hypot(x - u * S, y - (p + 0.5) / PL * S) < S * 0.006);
      const base = hex(pid < 0.33 ? '#c2a27a' : pid < 0.66 ? '#b0916c' : '#cdb08a'), w = 0.78 + grain * 0.38 + (tone[i] - 0.5) * 0.25 - kn * 0.35 - (g2[i] > 0.62 ? (g2[i] - 0.62) * 1.2 : 0);
      const c = base.map((ch, j) => ch * w * (j === 2 ? 0.95 : 1));
      if (nail) return [0.06, 0.055, 0.05, 0.55, 0.35];
      return [c[0] * gap + 0.02 * (1 - gap), c[1] * gap + 0.018 * (1 - gap), c[2] * gap + 0.015 * (1 - gap), 0.25 + gap * (0.45 + grain * 0.3) - kn * 0.15, 0.82 + grain * 0.12]; }); } },
  // montants et dés de palette : même bois, plus sombre et humide
  dés: { tile: 0.6, bump: 1.6, metal: 0, gen(S) { const g = fbm(S, 2, 24, 4, 21), t = fbm(S, 3, 3, 2, 22);
    return paint(S, (x, y, i) => { const w = 0.62 + g[i] * 0.4 + (t[i] - 0.5) * 0.3; return [0.38 * w, 0.27 * w, 0.17 * w, 0.3 + g[i] * 0.5, 0.85]; }); } },
  // boucliers de maintien de l'ordre : polycarbonate teinté bleu nuit, rayures et éraflures de chocs, poussière
  bouclier: { tile: 1.0, bump: 0.6, metal: 0.05, gen(S) { const n = fbm(S, 4, 4, 4, 31), d = fbm(S, 8, 8, 3, 32);
    const scr = new Float32Array(S * S); for (let k = 0; k < 220; k++) { let x = hash(k, 1, 33) * S, y = hash(k, 2, 33) * S; const a = hash(k, 3, 33) * 6.28, L = 10 + hash(k, 4, 33) * 70, s = hash(k, 5, 33); for (let t = 0; t < L; t++) { const ix = ((x + Math.cos(a) * t) % S + S) % S | 0, iy = ((y + Math.sin(a) * t) % S + S) % S | 0; scr[iy * S + ix] = Math.max(scr[iy * S + ix], 0.4 + s * 0.6); } }
    return paint(S, (x, y, i) => { const w = 0.85 + n[i] * 0.3, s = scr[i], dust = sstep(0.55, 0.8, d[i]) * 0.25; const c = [0.018 * w, 0.03 * w, 0.075 * w];
      return [c[0] + s * 0.12 + dust * 0.12, c[1] + s * 0.13 + dust * 0.11, c[2] + s * 0.15 + dust * 0.09, 0.5 - s * 0.3, 0.32 + s * 0.35 + dust * 0.4 + n[i] * 0.1]; }); } },
  // cadre et rails en alu brossé
  alu: { tile: 0.5, bump: 0.3, metal: 0.85, gen(S) { const b = fbm(S, 1, 64, 3, 41), n = fbm(S, 4, 4, 3, 42);
    return paint(S, (x, y, i) => { const w = 0.55 + b[i] * 0.2 + (n[i] - 0.5) * 0.15; return [w, w * 1.01, w * 1.03, 0.5 + b[i] * 0.2, 0.3 + n[i] * 0.2]; }); } },
  // tôle galvanisée : fleurs de zinc, coulures de rouille sous les rivets, éclaboussures du trottoir
  galva: { tile: 1.6, bump: 0.5, metal: 0.75, side: THREE.DoubleSide, gen(S) { const sp = noise(S, 48, 48, 51), n = fbm(S, 4, 4, 4, 52), streak = fbm(S, 24, 2, 3, 53), spot = fbm(S, 6, 6, 3, 54);
    return paint(S, (x, y, i) => { const w = 0.6 + (sp[i] - 0.5) * 0.18 + (n[i] - 0.5) * 0.22;
      const rust = sstep(0.68, 0.86, streak[i] * 0.75 + spot[i] * 0.45) * 0.7, ox = sstep(0.55, 0.75, n[i]) * 0.3;
      const c = [w * (1 - rust) + rust * 0.32, w * (1 - rust) + rust * 0.14, w * 1.03 * (1 - rust) + rust * 0.05];
      return [c[0] * (1 - ox * 0.3), c[1] * (1 - ox * 0.25), c[2] * (1 - ox * 0.2), 0.5 + rust * 0.25 - sp[i] * 0.1, 0.35 + rust * 0.55 + ox * 0.3 + (sp[i] - 0.5) * 0.2]; }); } },
  // tubes d'échafaudage
  tube: { tile: 0.8, bump: 0.4, metal: 0.8, gen(S) { const n = fbm(S, 4, 4, 4, 61), r = fbm(S, 8, 8, 3, 62);
    return paint(S, (x, y, i) => { const rs = sstep(0.6, 0.78, r[i]) * 0.8, w = 0.42 + n[i] * 0.2; return [w * (1 - rs) + rs * 0.3, w * (1 - rs) + rs * 0.13, w * (1 - rs) + rs * 0.05, 0.5 + rs * 0.3, 0.4 + rs * 0.5]; }); } },
  // grille anti-émeute : acier peint gris-bleu, éclats de peinture sur métal nu, rayures, voile de rouille
  acier: { tile: 1.2, bump: 0.8, metal: 0.55, gen(S) { const n = fbm(S, 4, 4, 4, 71), chip = fbm(S, 10, 10, 4, 72), r = fbm(S, 5, 5, 3, 73);
    return paint(S, (x, y, i) => { const bare = sstep(0.75, 0.77, chip[i]) * sstep(0.45, 0.6, r[i]), rs = sstep(0.74, 0.9, r[i]) * 0.35 * (1 - bare), w = 0.9 + (n[i] - 0.5) * 0.2;
      const paintC = [0.2 * w, 0.24 * w, 0.28 * w], metal = [0.5, 0.5, 0.52];
      const c = paintC.map((v, j) => v * (1 - bare) + metal[j] * bare);
      return [c[0] * (1 - rs) + 0.26 * rs, c[1] * (1 - rs) + 0.12 * rs, c[2] * (1 - rs) + 0.05 * rs, 0.55 - bare * 0.2 + (n[i] - 0.5) * 0.1, 0.55 - bare * 0.25 + rs * 0.35]; }); } },
  // béton coulé : pores, bullage, reprises de coffrage, traces de calcin, coins épaufrés
  beton: { tile: 1.5, bump: 1.6, metal: 0, gen(S) { const n = fbm(S, 4, 4, 5, 81), m = fbm(S, 2, 2, 3, 82), pore = noise(S, 90, 90, 83), st = fbm(S, 16, 2, 3, 84);
    return paint(S, (x, y, i) => { const p = sstep(0.82, 0.9, pore[i]), board = Math.abs(((y / S * 3) % 1) - 0.5) > 0.495 ? 1 : 0, stain = sstep(0.6, 0.85, st[i]) * 0.12;
      const w = 0.37 + (n[i] - 0.5) * 0.16 + (m[i] - 0.5) * 0.18 - p * 0.3 - board * 0.08 - stain;
      return [w, w * 0.985, w * 0.955, 0.6 + (n[i] - 0.5) * 0.4 - p * 0.5 - board * 0.2, 0.9 + (n[i] - 0.5) * 0.1]; }); } },
  // parpaings 50 × 20 cm montés au mortier, joints en retrait, bavures, chaque bloc sa nuance
  parpaing: { tile: 1.0, bump: 2.4, metal: 0, gen(S) { const n = fbm(S, 8, 8, 4, 91), pore = noise(S, 140, 140, 92), mo = fbm(S, 16, 16, 3, 93);
    return paint(S, (x, y, i) => { const row = Math.floor(y / S * 5), v = (y / S * 5) % 1, u = (x / S * 2 + (row % 2) * 0.5) % 1, col = Math.floor(x / S * 2 + (row % 2) * 0.5);
      const jv = Math.min(v, 1 - v) * 0.2, ju = Math.min(u, 1 - u) * 0.5, j = 1 - sstep(0.004, 0.009, Math.min(jv, ju)), smear = j > 0 ? 0 : sstep(0.012, 0.004, Math.min(jv, ju)) * sstep(0.5, 0.7, mo[i]);
      const bid = hash(col, row, 94), p = sstep(0.78, 0.88, pore[i]);
      const w = 0.36 + bid * 0.08 + (n[i] - 0.5) * 0.18 - p * 0.2;
      if (j > 0.01) { const mw = 0.5 + (mo[i] - 0.5) * 0.16; return [mw * (1 - j) + mw * j, mw * 0.97, mw * 0.92, 0.2 + (1 - j) * 0.4, 0.95]; }
      return [w + smear * 0.1, w * 0.975 + smear * 0.09, w * 0.93 + smear * 0.08, 0.72 + (n[i] - 0.5) * 0.3 - p * 0.45, 0.93]; }); } },
  // sacs de sable : toile de jute, trame
  jute: { tile: 0.5, bump: 1.4, metal: 0, gen(S) { const n = fbm(S, 4, 4, 3, 101), d = fbm(S, 6, 6, 3, 102);
    return paint(S, (x, y, i) => { const wx = Math.sin(x / S * Math.PI * 2 * 64), wy = Math.sin(y / S * Math.PI * 2 * 64), weave = 0.5 + 0.25 * (wx * (y % 8 < 4 ? 1 : -1)) + 0.25 * wy, w = 0.62 + weave * 0.18 + (n[i] - 0.5) * 0.25 - sstep(0.6, 0.85, d[i]) * 0.2;
      return [0.62 * w, 0.5 * w, 0.33 * w, weave, 0.95]; }); } },
  // bandes rétroréfléchissantes rouge et blanc (un peu sales)
  rouge: { tile: 0.5, bump: 0.3, metal: 0, gen(S) { const n = fbm(S, 4, 4, 3, 111); return paint(S, (x, y, i) => { const w = 0.85 + n[i] * 0.2; return [0.55 * w, 0.03 * w, 0.04 * w, 0.5, 0.35 + n[i] * 0.2]; }); } },
  blanc: { tile: 0.5, bump: 0.3, metal: 0, gen(S) { const n = fbm(S, 4, 4, 3, 112); return paint(S, (x, y, i) => { const w = 0.72 + n[i] * 0.2; return [w, w, w * 0.97, 0.5, 0.3 + n[i] * 0.25]; }); } },
  // caoutchouc des patins
  gomme: { tile: 0.5, bump: 0.5, metal: 0, gen(S) { const n = fbm(S, 8, 8, 3, 121); return paint(S, (x, y, i) => { const w = 0.03 + n[i] * 0.03; return [w, w, w, 0.5 + n[i] * 0.3, 0.9]; }); } },
};
const MATS = {};
function mat(key) {
  if (MATS[key]) return MATS[key]; const L = LIB[key]; const S = /palette|beton|parpaing|galva|acier|bouclier/.test(key) ? 512 : 256; const t = L.gen(S);
  return (MATS[key] = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: L.bump, roughnessMap: t.rough, roughness: 1, metalness: L.metal, vertexColors: true, side: L.side || THREE.FrontSide, name: 'barricade_' + key }));
}
const TEX = {};
const texMat = (text, fg, size, op = 0.92) => TEX[text + fg] ||= new THREE.MeshStandardMaterial({ map: textTex(text, { bg: null, fg, size }), transparent: true, opacity: op, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
let SHADOW = null;
function shadowMat() { // ombre de contact au pied : dégradé doux
  if (SHADOW) return SHADOW; const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 32, 4, 64, 32, 62); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.save(); g.scale(1, 0.5); g.translate(0, 32); g.fillRect(0, -32, 128, 128); g.restore();
  const g2 = g.createLinearGradient(0, 0, 0, 64); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.5, 'rgba(0,0,0,0.55)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = g2; g.fillRect(8, 0, 112, 64);
  const t = new THREE.CanvasTexture(c); return (SHADOW = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: '#000', opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -1 }));
}
// fissures (barricade abîmée) : calque posé sur les deux faces, plus visible à mesure que la barricade souffre
let CRACK = null;
export function crackTexture() {
  if (CRACK) return CRACK; const S = 512, c = document.createElement('canvas'); c.width = S; c.height = S / 2; const g = c.getContext('2d'); g.lineCap = 'round';
  const branch = (x, y, a, L, w, d) => { if (d > 5 || L < 4) return; let px = x, py = y; g.lineWidth = w; g.beginPath(); g.moveTo(px, py); const n = 6; for (let k = 0; k < n; k++) { a += (Math.random() - 0.5) * 0.9; px += Math.cos(a) * L / n; py += Math.sin(a) * L / n; g.lineTo(px, py); } g.stroke(); const m = 1 + (Math.random() < 0.6); for (let k = 0; k < m; k++) branch(px, py, a + (Math.random() - 0.5) * 1.6, L * 0.62, w * 0.65, d + 1); };
  g.strokeStyle = 'rgba(25,22,20,0.85)'; for (let k = 0; k < 4; k++) { const x = S * (0.15 + 0.7 * Math.random()), y = S / 2 * (0.2 + 0.6 * Math.random()); for (let j = 0; j < 4; j++) branch(x, y, Math.random() * 6.28, 50 + Math.random() * 70, 1.8, 0); g.fillStyle = 'rgba(20,18,16,0.7)'; g.beginPath(); g.arc(x, y, 3 + Math.random() * 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (CRACK = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, opacity: 0 }));
}

// ------------------------------------------------------------------ géométrie
const W = BARRICADE.w, H = BARRICADE.h, [h0, h1] = [BARRICADE.holes[0][2], BARRICADE.holes[0][3]];
const SEGS = [[-W / 2, -1.1], [-0.7, 0.7], [1.1, W / 2]];
const inHole = (x, y) => y > h0 - 0.02 && y < h1 + 0.02 && ((x > -1.12 && x < -0.68) || (x > 0.68 && x < 1.12));

// UV en mètres, projetées selon l'axe dominant de la normale ; couleur de sommet = saleté qui remonte du sol + nuance de la pièce
function finish(g, tile, seed, dirt = 1) {
  const p = g.attributes.position, n = g.attributes.normal, N = p.count, uv = new Float32Array(N * 2), col = new Float32Array(N * 3);
  const ou = hash(seed, 1, 7), ov = hash(seed, 2, 7), tint = 0.93 + hash(seed, 3, 7) * 0.12;
  for (let i = 0; i < N; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v; if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u / tile + ou; uv[i * 2 + 1] = v / tile + ov;
    const k = tint * (1 - dirt * 0.38 * (1 - sstep(0.0, 0.85, y))); col[i * 3] = k; col[i * 3 + 1] = k * 0.985; col[i * 3 + 2] = k * 0.96; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}

function build(team, tier) {
  const parts = new Map(); let seed = team.length * 100 + tier * 10;
  const add = (m, g) => { if (!parts.has(m)) parts.set(m, []); parts.get(m).push(g); };
  const prep = (g, key, o = {}) => { if (o.rx) g.rotateX(o.rx); if (o.ry) g.rotateY(o.ry); if (o.rz) g.rotateZ(o.rz); g.translate(o.x || 0, o.y || 0, o.z || 0); if (g.index) g = g.toNonIndexed(); finish(g, LIB[key].tile, seed++, o.dirt ?? 1); add(mat(key), g); };
  // boîte chanfreinée (rayon 1 à 2,5 cm) : les arêtes accrochent la lumière comme un vrai objet
  const B = (key, w, h, d, x = 0, y = 0, z = 0, o = {}) => { const r = Math.min(o.r ?? 0.012, w / 2.2, h / 2.2, d / 2.2); const g = r > 0.003 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d); prep(g, key, { ...o, x, y, z }); };
  const panel = (key, d, z = 0, o = {}) => { B(key, W, h0, d, 0, h0 / 2, z, o); B(key, W, H - h1, d, 0, h1 + (H - h1) / 2, z, o); for (const [x0, x1] of SEGS) B(key, x1 - x0, h1 - h0, d, (x0 + x1) / 2, (h0 + h1) / 2, z, o); };
  const plane = (m, w, h, x, y, z, back = false, rz = 0) => { const g = new THREE.PlaneGeometry(w, h); if (rz) g.rotateZ(rz); if (back) g.rotateY(Math.PI); g.translate(x, y, z); const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); add(m, g.toNonIndexed()); };
  // tôle ondulée (onde de 76 mm, 18 mm de creux) entre x0..x1 et y0..y1, épaisseur visuelle par les deux faces
  const corr = (x0, x1, y0, y1, z) => { const w = x1 - x0, nx = Math.max(4, Math.round(w / 0.019)), g = new THREE.PlaneGeometry(w, y1 - y0, nx, 3), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + x0 + w / 2) / 0.076 * Math.PI * 2) * 0.009); g.computeVertexNormals(); prep(g, 'galva', { x: x0 + w / 2, y: (y0 + y1) / 2, z }); };
  const sk = (key, x, y, z, w, h, d) => B(key, w, h, d, x, y, z);
  const ordre = team === 'ordre';

  if (tier === 0) {
    if (ordre) { // boucliers : 5 boucliers rectangulaires bleu nuit tenus dans un cadre alu, hublots, patins caoutchouc
      panel('bouclier', 0.05, 0, { r: 0.02 });
      for (const x of [-1.5, -0.4, 0.4, 1.5]) B('alu', 0.035, H - 0.06, 0.08, x, H / 2, 0, { r: 0.008 }); // joints entre boucliers
      B('alu', W + 0.04, 0.05, 0.09, 0, H - 0.01, 0); B('alu', W + 0.04, 0.05, 0.09, 0, 0.03, 0);
      for (const [x0, x1] of [[-1.1, -0.7], [0.7, 1.1]]) { B('alu', x1 - x0 + 0.06, 0.035, 0.09, (x0 + x1) / 2, h0, 0); B('alu', x1 - x0 + 0.06, 0.035, 0.09, (x0 + x1) / 2, h1, 0); B('alu', 0.035, h1 - h0, 0.09, x0, (h0 + h1) / 2, 0); B('alu', 0.035, h1 - h0, 0.09, x1, (h0 + h1) / 2, 0); }
      for (const sx of [-1, 1]) { B('alu', 0.05, 0.05, 0.9, sx * 1.75, 0.045, -0.3); B('gomme', 0.12, 0.04, 0.12, sx * 1.75, 0.02, -0.7); B('alu', 0.04, 1.3, 0.04, sx * 1.75, 0.6, -0.35, { rx: -0.55 }); } // béquilles
      const t = texMat('POLICE', '#e8ecf2', 70, 0.85); plane(t, 1.5, 0.36, 0, 0.72, 0.03); plane(t, 1.5, 0.36, 0, 0.72, -0.03, true);
      B('rouge', W, 0.07, 0.06, 0, 1.0, 0, { r: 0.004 });
    } else { // palette de chantier redressée : planches de 20 cm clouées sur trois traverses, dés, une palette posée de biais en renfort
      panel('palette', 0.024, 0.05, { r: 0.004 });
      for (const x of [-1.85, -0.9, 0, 0.9, 1.85]) B('dés', 0.1, H, 0.08, x, H / 2, -0.03, { r: 0.006 }); // traverses verticales
      for (const y of [0.15, 1.15, 2.15]) B('dés', W - 0.1, 0.09, 0.05, 0, y, -0.1, { r: 0.006 });
      for (const sx of [-1, 1]) { B('dés', 0.12, 1.8, 0.1, sx * 1.4, 0.85, -0.55, { rx: -0.42 }); B('dés', 0.14, 0.1, 0.5, sx * 1.4, 0.05, -0.85); } // étais
      const t = texMat('FRUNGZ', '#ff4fa0', 72, 0.82); plane(t, 1.7, 0.48, 0.2, 0.7, 0.064, false, 0.05); plane(texMat('75', '#151515', 64, 0.7), 0.5, 0.24, -1.55, 1.85, 0.064, false, -0.08);
    }
  } else if (tier === 1) {
    if (ordre) { // grille anti-émeute : tôle d'acier de 6 mm, cadre en profilés, nervures, bandeau POLICE, chevrons, béquilles articulées
      panel('acier', 0.03, 0, { r: 0.004 });
      for (const y of [0.32, 0.8, 1.95]) B('acier', W - 0.1, 0.06, 0.07, 0, y, 0.02, { r: 0.01 });
      for (const x of [-1.95, -1.5, 1.5, 1.95]) B('acier', 0.08, H, 0.09, x, H / 2, 0, { r: 0.01 });
      B('acier', W + 0.06, 0.08, 0.1, 0, H - 0.02, 0, { r: 0.012 });
      for (const [x0, x1] of [[-1.1, -0.7], [0.7, 1.1]]) { B('acier', x1 - x0 + 0.08, 0.04, 0.08, (x0 + x1) / 2, h0 - 0.01, 0); B('acier', x1 - x0 + 0.08, 0.04, 0.08, (x0 + x1) / 2, h1 + 0.01, 0); B('acier', 0.04, h1 - h0, 0.08, x0, (h0 + h1) / 2, 0); B('acier', 0.04, h1 - h0, 0.08, x1, (h0 + h1) / 2, 0); }
      for (let k = 0; k < 16; k++) { const x = -1.9 + k * 0.253; for (const y of [0.32, 0.8, 1.95]) if (!inHole(x, y)) B('alu', 0.025, 0.025, 0.012, x, y, 0.06, { r: 0 }); } // rivets
      for (let i = 0; i < 8; i++) B(i % 2 ? 'blanc' : 'rouge', 0.38, 0.16, 0.035, -1.75 + i * 0.5, 0.13, 0.02, { rz: 0.5, r: 0.003 });
      B('bouclier', W - 0.2, 0.26, 0.04, 0, H - 0.2, 0.025, { r: 0.006 });
      const t = texMat('POLICE', '#ffffff', 70, 0.9); plane(t, 1.4, 0.26, 0, H - 0.2, 0.047); plane(t, 1.4, 0.26, 0, H - 0.2, -0.047, true);
      for (const sx of [-1, 1]) { B('tube', 0.06, 1.6, 0.06, sx * 1.6, 0.72, -0.48, { rx: -0.65, r: 0.02 }); B('gomme', 0.16, 0.05, 0.16, sx * 1.6, 0.025, -0.95); }
    } else { // palissade de chantier : bacs acier ondulés vissés sur un cadre en tubes d'échafaudage, colliers, pieds béton
      corr(-W / 2, W / 2, 0.05, h0, 0); corr(-W / 2, W / 2, h1, H, 0);
      for (const [x0, x1] of SEGS) corr(x0, x1, h0, h1, 0);
      for (const y of [0.25, 1.1, 2.1]) B('tube', W + 0.1, 0.048, 0.048, 0, y, -0.05, { r: 0.022 });
      for (const x of [-1.95, -0.9, 0.9, 1.95]) B('tube', 0.048, H + 0.1, 0.048, x, H / 2, -0.05, { r: 0.022 });
      for (const x of [-1.1, -0.7, 0.7, 1.1]) B('tube', 0.04, h1 - h0 + 0.1, 0.04, x, (h0 + h1) / 2, -0.03, { r: 0.018 });
      for (const sx of [-1.95, -0.9, 0.9, 1.95]) for (const y of [0.25, 1.1, 2.1]) B('alu', 0.09, 0.07, 0.07, sx, y, -0.05, { r: 0.01 }); // colliers
      for (const sx of [-1, 1]) { B('beton', 0.6, 0.16, 0.45, sx * 1.6, 0.08, -0.1, { r: 0.02, dirt: 0.5 }); B('tube', 0.048, 1.7, 0.048, sx * 1.6, 0.75, -0.5, { rx: -0.6, r: 0.022 }); }
      const t = texMat('FRUNGZ', '#ff4fa0', 72, 0.85); plane(t, 2.0, 0.55, 0.1, 0.72, 0.016, false, -0.04); plane(texMat('PARIS 75', '#f2f2f2', 64, 0.7), 1.3, 0.26, -1.0, 1.85, 0.016, false, 0.03);
    }
  } else {
    if (ordre) { // muret béton type GBA : semelle évasée, voile de 30 cm chanfreiné, bandes rétroréfléchissantes, anneaux de levage
      B('beton', W, 0.25, 0.62, 0, 0.125, 0, { r: 0.03 }); B('beton', W, 0.35, 0.46, 0, 0.42, 0, { r: 0.03 });
      panel('beton', 0.3, 0, { r: 0.025 });
      B('beton', W + 0.02, 0.08, 0.34, 0, H - 0.04, 0, { r: 0.03 });
      for (const [x0, x1] of [[-1.1, -0.7], [0.7, 1.1]]) { B('acier', x1 - x0 + 0.04, 0.03, 0.32, (x0 + x1) / 2, h0, 0, { r: 0.006 }); B('acier', x1 - x0 + 0.04, 0.03, 0.32, (x0 + x1) / 2, h1, 0, { r: 0.006 }); }
      for (let i = 0; i < 8; i++) for (const z of [0.152, -0.152]) B(i % 2 ? 'blanc' : 'rouge', 0.5, 0.12, 0.004, -1.75 + i * 0.5, H - 0.24, z, { r: 0 });
      for (const sx of [-1.3, 1.3]) B('tube', 0.14, 0.1, 0.04, sx, H + 0.03, 0, { r: 0.018 }); // anneaux de levage
      const t = texMat('POLICE', '#1c2a4a', 70, 0.8); plane(t, 1.5, 0.32, 0, 0.88, 0.156); plane(t, 1.5, 0.32, 0, 0.88, -0.156, true);
    } else { // mur de parpaings monté à la va-vite : 20 cm d'épaisseur, joints baveux, sacs de sable au pied, chaînage de travers
      panel('parpaing', 0.2, 0, { r: 0.008 });
      B('parpaing', W + 0.06, 0.06, 0.24, 0.02, H - 0.03, 0, { r: 0.01, rz: 0.006 });
      for (let i = 0; i < 6; i++) { const x = -1.9 + i * 0.76; for (const z of [0.36, -0.36]) B('jute', 0.68, 0.2, 0.36, x, 0.1, z, { rz: (i % 2 ? 0.04 : -0.04), ry: (hash(i, z > 0 ? 1 : 2, 3) - 0.5) * 0.2, r: 0.07, dirt: 0.6 }); }
      for (let i = 0; i < 5; i++) B('jute', 0.66, 0.18, 0.34, -1.5 + i * 0.75, 0.29, 0.36, { ry: (hash(i, 9, 3) - 0.5) * 0.25, r: 0.065, dirt: 0.6 });
      plane(texMat('FRUNGZ', '#ff4fa0', 72, 0.85), 2.2, 0.6, 0, 1.0, 0.102, false, 0.04); plane(texMat('TIENT BON', '#ffd23d', 64, 0.8), 1.2, 0.3, -0.3, 1.95, 0.102, false, -0.03);
    }
  }
  // ombre de contact
  { const d = tier === 2 ? 1.3 : 1.0, g = new THREE.PlaneGeometry(W + 0.9, d).rotateX(-Math.PI / 2).translate(0, 0.012, 0); const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); add(shadowMat(), g.toNonIndexed()); }
  const out = [];
  for (const [m, gs] of parts) { for (const g of gs) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); }
    const g = mergeGeometries(gs, false); g.computeBoundingSphere(); out.push([g, m]); for (const x of gs) x.dispose(); }
  return out;
}
const CACHE = {};
export function wallMesh(team, tier) {
  const parts = CACHE[team + tier] ||= build(team, tier);
  const g = new THREE.Group();
  for (const [geo, m] of parts) { const o = new THREE.Mesh(geo, m); const flat = m.transparent; o.castShadow = !flat; o.receiveShadow = !flat; g.add(o); }
  // calque de fissures, un par face (matière propre à la barricade : son opacité suit les dégâts)
  const cm = crackTexture().clone(); cm.color.set(tier === 1 ? '#3a3a3a' : tier === 0 && team === 'civils' ? '#2a1d12' : '#1b1a18');
  const d = tier === 2 ? (team === 'ordre' ? 0.152 : 0.102) : tier === 1 ? (team === 'ordre' ? 0.02 : 0.02) : team === 'ordre' ? 0.03 : 0.064;
  for (const s of [1, -1]) { const p = new THREE.Mesh(CRACK_GEO, cm); p.position.set(0, H / 2, s * (d + 0.003)); if (s < 0) p.rotation.y = Math.PI; p.visible = false; g.add(p); }
  g.userData.crack = cm; return g;
}
const CRACK_GEO = new THREE.PlaneGeometry(W * 0.96, H * 0.96);
// à appeler une fois (chargement) : peint toutes les matières pour que la première pose en jeu ne fige pas l'image
export function prewarmWallMeshes() { for (const t of ['ordre', 'civils']) for (const k of [0, 1, 2]) CACHE[t + k] ||= build(t, k); return Object.values(CACHE); }
