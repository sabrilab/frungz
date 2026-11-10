// Objets de jeu modélisés en code (style low-poly) : vitrines de boutique, objets de butin, socles de planque,
// receleur, barricades, grenades, marquage POLICE.
import * as THREE from 'three';
import { RARITY } from './data.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.6, metalness: o.m ?? 0, flatShading: true, emissive: o.e || '#000', emissiveIntensity: o.ei ?? 1, transparent: !!o.t, opacity: o.op ?? 1 });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const cyl = (r0, r1, h, seg, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; return m; };

export function textTex(text, opts = {}) {
  const { w = 512, h = 96, bg = '#111', fg = '#f4d58a', font = 'Bungee, Inter, sans-serif', size = 56, border = null } = opts;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; let s = size; g.font = `${s}px ${font}`; while (g.measureText(text).width > w * 0.9 && s > 10) { s -= 2; g.font = `${s}px ${font}`; }
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- objets de butin ----------
const lootCache = {};
export function lootMesh(type, rarity) {
  const key = type + rarity; if (lootCache[key]) return lootCache[key].clone();
  const g = new THREE.Group(); const rc = RARITY[rarity].color;
  const gold = M('#e5b84a', { m: 0.8, r: 0.3 }), glow = M(rc, { e: rc, ei: 0.6, m: 0.3, r: 0.3 });
  switch (type) {
    case 'sac': { const b = box(0.36, 0.26, 0.14, M(['#7a3b2e', '#1c1c1c', '#c9a27a', '#8e1f3a'][(Math.random() * 4) | 0], { r: 0.4 }), 0, 0.13); g.add(b); const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 12, Math.PI), gold); h.position.y = 0.26; g.add(h); g.add(box(0.08, 0.04, 0.15, gold, 0, 0.2)); break; }
    case 'montre': { const t = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 14), M('#2a2a2a')); t.rotation.x = Math.PI / 2; t.position.y = 0.07; t.rotation.z = 0; g.add(t); const f = cyl(0.055, 0.055, 0.03, 12, gold, 0, 0.12); g.add(f); g.add(cyl(0.045, 0.045, 0.032, 12, glow, 0, 0.12)); break; }
    case 'bijou': { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), M(rc, { e: rc, ei: 0.5, m: 0.2, r: 0.1 })); gem.position.y = 0.16; gem.scale.y = 1.3; g.add(gem); const r = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 16), gold); r.position.y = 0.08; g.add(r); break; }
    case 'parfum': { g.add(box(0.12, 0.16, 0.06, M('#f3c6d8', { t: true, op: 0.75, r: 0.1 }), 0, 0.08)); g.add(cyl(0.03, 0.03, 0.05, 8, gold, 0, 0.185)); break; }
    case 'telephone': { g.add(box(0.08, 0.16, 0.012, M('#151515', { r: 0.2, m: 0.5 }), 0, 0.08)); g.add(box(0.07, 0.14, 0.002, glow, 0, 0.08, 0.007)); break; }
    case 'tv': { g.add(box(0.9, 0.52, 0.06, M('#121212', { r: 0.3 }), 0, 0.36)); g.add(box(0.84, 0.46, 0.005, M('#1d2b44', { e: '#1d3a6a', ei: 0.6 }), 0, 0.36, 0.033)); g.add(box(0.3, 0.1, 0.18, M('#222'), 0, 0.05)); break; }
    case 'vetement': { g.add(box(0.34, 0.42, 0.06, M(['#2e3a59', '#7b2d2d', '#c7b18a', '#1f1f1f'][(Math.random() * 4) | 0]), 0, 0.25)); g.add(box(0.36, 0.03, 0.03, gold, 0, 0.47)); break; }
    case 'vin': { g.add(cyl(0.04, 0.04, 0.22, 8, M('#1d3b25', { r: 0.2 }), 0, 0.11)); g.add(cyl(0.015, 0.03, 0.09, 8, M('#1d3b25', { r: 0.2 }), 0, 0.26)); g.add(cyl(0.041, 0.041, 0.07, 8, M('#efe6d0'), 0, 0.1)); break; }
    case 'art': { g.add(box(0.7, 0.5, 0.05, gold, 0, 0.35)); const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); for (let i = 0; i < 9; i++) { x.fillStyle = `hsl(${Math.random() * 360},70%,${40 + Math.random() * 30}%)`; x.fillRect(Math.random() * 64, Math.random() * 64, 10 + Math.random() * 30, 10 + Math.random() * 30); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshStandardMaterial({ map: t })); p.position.set(0, 0.35, 0.03); g.add(p); break; }
    case 'baskets': { for (const s of [-1, 1]) { g.add(box(0.11, 0.08, 0.28, M('#f2f2f2'), s * 0.07, 0.05)); g.add(box(0.115, 0.03, 0.29, glow, s * 0.07, 0.015)); } break; }
    case 'frungz': { const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M('#ffcf3d', { m: 0.9, r: 0.2, e: '#ff9d00', ei: 0.3 })); b.scale.set(1.2, 0.8, 1); b.position.y = 0.2; g.add(b); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), gold); e.position.set(s * 0.12, 0.36, 0.08); g.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), M('#111')); p.position.set(s * 0.12, 0.38, 0.14); g.add(p); } break; }
    default: g.add(box(0.2, 0.2, 0.2, glow, 0, 0.1));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  lootCache[key] = g; return g.clone();
}
// faisceau vertical de rareté (objets au sol)
// repère de butin au sol : colonne fine et courte qui s'efface vers le haut, et petit disque lumineux (zone éclairée limitée)
let beamAlpha = null, ringAlpha = null;
const beamMats = {};
export function beam(rarity) {
  const c = RARITY[rarity].color;
  if (!beamAlpha) {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#777'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); beamAlpha = new THREE.CanvasTexture(cv);
    const cr = document.createElement('canvas'); cr.width = cr.height = 64; const h = cr.getContext('2d'); const rg = h.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, '#fff'); rg.addColorStop(0.5, '#555'); rg.addColorStop(1, '#000'); h.fillStyle = rg; h.fillRect(0, 0, 64, 64); ringAlpha = new THREE.CanvasTexture(cr);
  }
  const k = { commun: 0, rare: 1, epique: 2, legendaire: 3 }[rarity] ?? 0;
  const mats = beamMats[rarity] || (beamMats[rarity] = [
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16 + k * 0.03, alphaMap: beamAlpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, alphaMap: ringAlpha, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  ]);
  const H = 0.9 + k * 0.3; const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, H, 8, 1, true), mats[0]); col.position.y = H / 2; g.add(col);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), mats[1]); disc.position.y = 0.03; g.add(disc);
  return g;
}

// ---------- vitrine de boutique (adossée à la façade) ----------
// repère local : façade en z = 0, la vitrine avance vers +z (la rue), largeur en x
export function shopCase(shop) {
  const g = new THREE.Group(); const luxe = shop.gamme === 'luxe';
  const frameC = luxe ? '#c9a24a' : ['#2f6d4f', '#8c2b2b', '#2b4f8c', '#5b2b8c'][shop.seed % 4];
  const frame = M(frameC, { m: luxe ? 0.8 : 0.1, r: luxe ? 0.3 : 0.6 }), back = M(luxe ? '#1a1612' : '#2a2a2a'), floor = M(luxe ? '#efe7da' : '#cfcac2');
  const W = shop.w, D = shop.d, H = 2.5;
  g.add(box(W, 0.35, D, floor, 0, 0.175, D / 2)); // socle
  g.add(box(W, H, 0.08, back, 0, H / 2, 0.04)); // fond
  for (const s of [-1, 1]) g.add(box(0.1, H, D, frame, s * (W / 2 - 0.05), H / 2, D / 2)); // montants
  g.add(box(W, 0.12, D, frame, 0, H - 0.06, D / 2)); // linteau
  // étagères lumineuses
  const shelfM = M(luxe ? '#fff4dc' : '#dfe6ee', { e: luxe ? '#ffe2a8' : '#cfe3ff', ei: 0.5 });
  g.add(box(W - 0.3, 0.04, D * 0.6, shelfM, 0, 1.2, D * 0.4));
  const light = new THREE.PointLight(luxe ? '#ffd9a0' : '#d8ecff', 3, 4, 2); light.position.set(0, 2.1, D * 0.6); g.add(light);
  // enseigne
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.5), new THREE.MeshStandardMaterial({ map: textTex(shop.enseigne, { bg: luxe ? '#14110d' : frameC, fg: luxe ? '#f1d27a' : '#fff', border: luxe ? '#c9a24a' : null }), emissive: '#fff', emissiveIntensity: 0.25, emissiveMap: null }));
  sign.position.set(0, H + 0.3, D + 0.02); g.add(sign); g.add(box(W, 0.6, 0.06, frame, 0, H + 0.3, D - 0.02));
  // store banne rayé (commerce) ou marquise dorée (luxe)
  if (!luxe) { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#fff' : frameC; x.fillRect(i * 8, 0, 8, 8); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const aw = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.1), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide })); aw.position.set(0, H + 0.75, D + 0.45); aw.rotation.x = -1.0; g.add(aw); }
  // verre
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, H - 0.47, 0.04), new THREE.MeshPhysicalMaterial({ color: '#cfe6ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }));
  glass.position.set(0, 0.35 + (H - 0.47) / 2, D - 0.03); g.add(glass); g.userData.glass = glass;
  // éclats restants sur le cadre une fois cassée
  const shards = new THREE.Group(); for (let i = 0; i < 10; i++) { const tri = new THREE.Mesh(new THREE.ConeGeometry(0.12 + Math.random() * 0.1, 0.3 + Math.random() * 0.3, 3), M('#cfe6ff', { t: true, op: 0.4, r: 0.05 })); const side = i % 2 ? 1 : -1; tri.position.set(side * (W / 2 - 0.15), 0.5 + Math.random() * 1.6, D - 0.03); tri.rotation.z = side * Math.PI / 2; shards.add(tri); } shards.visible = false; g.add(shards); g.userData.shards = shards;
  // ruban d'alarme (clignote quand on casse)
  const alarm = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M('#ff2a2a', { e: '#ff2a2a', ei: 0 })); alarm.position.set(W / 2 - 0.2, H - 0.25, D - 0.05); g.add(alarm); g.userData.alarm = alarm;
  return g;
}

// ---------- socle de planque ----------
export function socle(team) {
  const g = new THREE.Group(); const c = team === 'ordre' ? '#3d8bff' : '#34c759';
  g.add(cyl(0.5, 0.6, 0.5, 8, M('#e8e1d4'), 0, 0.25));
  const top = cyl(0.52, 0.52, 0.05, 8, M(c, { e: c, ei: 0.35 }), 0, 0.52); g.add(top);
  return g;
}
// pancarte de base
export function baseSign(text, team) {
  const c = team === 'ordre' ? '#1c2a4a' : '#34c759';
  const g = new THREE.Group(); g.add(box(0.1, 2.6, 0.1, M('#333'), 0, 1.3));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), new THREE.MeshStandardMaterial({ map: textTex(text, { bg: c, fg: '#fff', border: '#fff' }), side: THREE.DoubleSide }));
  p.position.y = 2.6; g.add(p); return g;
}

// ---------- receleur : camionnette ouverte + étal ----------
export function receleur() {
  const g = new THREE.Group(); const body = M('#e8e3d6'), dark = M('#222');
  g.add(box(2.0, 1.9, 4.6, body, 0, 1.25, 0)); g.add(box(1.9, 0.9, 1.0, M('#26313d', { r: 0.1 }), 0, 1.6, 2.32));
  for (const z of [-1.5, 1.5]) for (const s of [-1, 1]) { const w = cyl(0.36, 0.36, 0.25, 10, dark, s * 0.95, 0.36, z); w.rotation.z = Math.PI / 2; g.add(w); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.5), new THREE.MeshStandardMaterial({ map: textTex('ACHAT · OR · TOUT', { bg: '#0f0f0f', fg: '#ffcf3d' }), emissive: '#fff', emissiveIntensity: 0.3 }));
  sign.position.set(1.01, 1.8, 0); sign.rotation.y = Math.PI / 2; g.add(sign);
  g.add(box(1.6, 0.8, 0.6, M('#6b4a2a'), 2.0, 0.4, 0)); // table
  const lamp = new THREE.PointLight('#ffcf3d', 4, 6, 2); lamp.position.set(2, 2, 0); g.add(lamp);
  return g;
}

// ---------- barricades ----------
// barricade de 4 m avec deux meurtrières (fentes à hauteur d'épaule pour tirer à travers)
export const BARRICADE = { w: 4, h: 2.3, holes: [[-1.1, -0.7, 1.22, 1.58], [0.7, 1.1, 1.22, 1.58]] };
export function barricade(team) {
  const g = new THREE.Group(), W = BARRICADE.w, H = BARRICADE.h, [h0, h1] = [BARRICADE.holes[0][2], BARRICADE.holes[0][3]];
  // bandes pleines en bas et en haut, bande du milieu découpée autour des fentes
  const segs = [[-W / 2, -1.1], [-0.7, 0.7], [1.1, W / 2]];
  const panel = (mat, d) => { g.add(box(W, h0, d, mat, 0, h0 / 2, 0)); g.add(box(W, H - h1, d, mat, 0, h1 + (H - h1) / 2, 0)); for (const [x0, x1] of segs) g.add(box(x1 - x0, h1 - h0, d, mat, (x0 + x1) / 2, (h0 + h1) / 2, 0)); };
  if (team === 'ordre') { // boucliers anti-émeute bleu nuit
    const m = M('#1c2a4a', { m: 0.4, r: 0.4 }); panel(m, 0.12);
    for (const z of [0.07, -0.07]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: textTex('POLICE', { bg: null, fg: '#ffffff', size: 70 }), transparent: true })); p.position.set(0, 0.7, z); if (z < 0) p.rotation.y = Math.PI; g.add(p); }
    g.add(box(W, 0.08, 0.14, M('#d8d8d8', { m: 0.6 }), 0, H, 0)); g.add(box(W, 0.1, 0.14, M('#c8102e'), 0, 1.0, 0));
    for (const x of [-1.1, -0.7, 0.7, 1.1]) g.add(box(0.05, h1 - h0 + 0.08, 0.15, M('#d8d8d8', { m: 0.6 }), x, (h0 + h1) / 2, 0));
    for (const sx of [-1, 1]) g.add(box(0.1, 0.1, 0.8, M('#555'), sx * 1.8, 0.05, -0.2));
  } else { // palissade de palettes, fentes encadrées
    const wood = M('#b48a5a'), dark = M('#7a5a3a'); panel(wood, 0.1);
    for (let i = 1; i < 6; i++) g.add(box(W, 0.03, 0.11, dark, 0, i * 0.4, 0.005));
    for (const x of [-1.9, -0.9, 0, 0.9, 1.9]) g.add(box(0.12, H, 0.14, dark, x, H / 2, -0.06));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshStandardMaterial({ map: textTex('FRUNGZ', { bg: null, fg: '#ff4fa0', size: 72 }), transparent: true })); p.position.set(0, 0.7, 0.06); p.rotation.z = 0.06; g.add(p);
  }
  return g;
}
// grenade (lacrymo : cartouche grise ; fumigène : pot coloré)
export function grenadeMesh(kind) {
  const g = new THREE.Group(); g.add(cyl(0.05, 0.05, 0.16, 8, M(kind === 'gas' ? '#7d8a6a' : '#ff4fa0'))); g.add(cyl(0.02, 0.02, 0.04, 6, M('#333'), 0, 0.1)); return g;
}

// ---------- marquage police (dos et brassard) ----------
let policeTex = null;
export function policeBadge() {
  policeTex ||= textTex('POLICE', { w: 256, h: 64, bg: null, fg: '#ffffff', size: 46 });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshBasicMaterial({ map: policeTex, transparent: true, depthWrite: false }));
  return p;
}
export function brassard() {
  const t = textTex('POLICE', { w: 256, h: 64, bg: '#ff8c00', fg: '#1c2a4a', size: 44 });
  return new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 10, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
}
// marqueur flottant au-dessus d'une tête (couleur du camp, pastille de butin volé)
export function headMarker(color) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 }));
  m.rotation.x = Math.PI; m.renderOrder = 10; return m;
}
