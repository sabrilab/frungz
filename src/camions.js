// Camions et fourgons des séries (convois.js) : canon à eau, camion militaire bâché, camion-bélier, fourgons de la bande,
// des CRS et des émeutiers. Même méthode que les voitures (voitures.js) : cabine à la carrosserie galbée, vitres, optiques,
// calandre, rétroviseurs, roues détaillées ; caisse, citerne ou bâche posées sur un vrai châssis (longerons, réservoir,
// garde-boue, pare-cycliste, feux arrière). Chaque modèle est construit une fois puis cloné à chaque arrivée.
// Repère : mètres, sol y = 0, avant +Z. userData : wheels (toutes les roues), et selon le modèle l1/l2 (gyrophares), tur/noz (canon).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries as mergeGeo } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCar, mats, paint, wheelGeos, solidUVs, rectUVsBox, ATLAS } from './voitures.js';

const LEN = { eau: 7.5, armee: 7, belier: 8, bande: 5.4, crs: 5.4, emeute: 5.4 };
// cabine avancée de poids lourd : face plate et haute, grand pare-brise, marche sous la portière
const CAB = { L: 2.3, W: 1.22, ax: [-50, 0.42], R: 0.5, tw: 0.34, clear: 0.4, G: 0.93, pf: 5, pr: 9, capF: 0.32, capR: 0.1,
  top: [[-1.15, 1.3], [-1.13, 2.85], [-1.0, 2.98], [0.45, 3.0], [0.72, 2.92], [1.02, 1.8], [1.1, 1.58], [1.15, 1.25]],
  belt: [[-1.15, 1.85], [0.6, 1.82], [1.15, 1.62]], bot: [[-1.15, 1.02], [-0.3, 1.0], [0.9, 0.62], [1.15, 0.5]],
  cowl: 1.0, roofF: 0.74, roofR: -1.12, deck: -1.13, win: [[-0.38, 0.98]], bpil: -0.42, noRear: true, phare: 'C', feu: 'B', grille: 'C', rim: 'acier', caliper: null, van: true, cabOnly: true };

const box = (w, h, d, x, y, z, r = 0.04) => { const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cyl = (r, h, x, y, z, axis = 'y', seg = 16) => { const g = new THREE.CylinderGeometry(r, r, h, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); if (axis === 'z') g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
const mesh = (g, m, name) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; if (name) o.name = name; return o; };
function merge(list) { const keep = ['position', 'normal', 'uv']; const L = list.map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k); return g; }); return L.length ? mergeGeo(L) : null; }

const _cache = new Map();
export function truckModel(kind, hq = true) {
  const k = kind + hq; if (_cache.has(k)) return _cache.get(k);
  const m = build(kind, hq); _cache.set(k, m); return m;
}
// une instance prête à rouler (clonée), userData recâblé sur ses propres pièces
export function truckMesh(kind, hq = !['bas', 'mobile'].includes(globalThis.__quality)) {
  const g = truckModel(kind, hq).clone(true), ud = { wheels: [] };
  g.traverse((o) => { if (/^wheel/.test(o.name)) ud.wheels.push(o); if (['l1', 'l2', 'tur', 'noz'].includes(o.name)) ud[o.name] = o; });
  g.userData = ud; return g;
}

function build(kind, hq) {
  const MT = mats(hq), len = LEN[kind], g = new THREE.Group(); g.name = 'camion-' + kind;
  // fourgons : la carrosserie des voitures (modèle « fourgon »), livrée selon le camp
  if (kind === 'bande' || kind === 'crs' || kind === 'emeute') {
    const spec = kind === 'crs' ? ['crs', 'fourgon', 'police', 'Fourgon de CRS', '#eef0f2', { metal: 0.05, rough: 0.3, police: true }]
      : kind === 'bande' ? ['bande', 'fourgon', 'civil', 'Fourgon de la bande', '#e6e3dc', { metal: 0.02, rough: 0.4, stripe: 'vert' }]
        : ['emeute', 'fourgon', 'civil', 'Utilitaire', '#6f7376', { metal: 0.1, rough: 0.55, mat: true }];
    const car = buildCar(spec, { hq }); g.add(car);
    if (kind === 'crs') { // deux feux bleus qui clignotent l'un après l'autre, aux coins avant du toit
      for (const [n, x] of [['l1', -0.55], ['l2', 0.55]]) { const l = box(0.34, 0.1, 0.2, x, 2.52, 1.0, 0.03); solidUVs(l, 'bleuLum'); g.add(mesh(l, MT.detail, n)); }
    }
    return g;
  }
  const colors = { eau: ['#1c2a44', '#e9eef5'], armee: ['#4f5a35', '#56623a'], belier: ['#232323', '#d8541f'] }[kind];
  const body = paint(colors[0], hq, { metal: kind === 'armee' ? 0.05 : 0.4, rough: kind === 'armee' ? 0.6 : 0.32, mat: kind === 'armee' }), cabP = colors[1];
  // cabine à l'avant
  const cabZ = len / 2 - CAB.L / 2, cab = buildCar(['cab', CAB, 'camion', '', cabP, { metal: kind === 'armee' ? 0.05 : 0.2, rough: 0.35, mat: kind === 'armee' }], { hq });
  cab.position.z = cabZ; g.add(cab);
  for (const o of [...cab.children[0].children]) if (/^wheel/.test(o.name)) { o.position.z += cabZ; cab.children[0].remove(o); g.add(o); }
  // châssis : longerons, traverses, réservoir, boîte à batteries, pare-cyclistes
  const rearL = len - CAB.L - 0.05, rz = -len / 2 + rearL / 2, P = { plastic: [], trim: [], metal: [], paint: [], detail: [] };
  for (const x of [-0.45, 0.45]) P.trim.push(box(0.12, 0.26, len - 0.3, x, 0.86, -0.05, 0.02));
  for (let z = -len / 2 + 0.4; z < cabZ; z += 1.1) P.trim.push(box(0.9, 0.08, 0.1, 0, 0.84, z, 0));
  P.metal.push(cyl(0.3, 0.9, -0.85, 0.85, cabZ - 1.75, 'z', 20)); for (const dz of [-0.3, 0.3]) P.trim.push(cyl(0.31, 0.05, -0.85, 0.85, cabZ - 1.75 + dz, 'z', 20));
  P.plastic.push(box(0.5, 0.42, 0.6, 0.95, 0.85, cabZ - 1.75, 0.03));
  for (const sx of [-1, 1]) for (const y of [0.55, 0.78]) P.metal.push(box(0.03, 0.09, 1.3, sx * 1.12, y, cabZ - 2.6, 0.01));
  // essieux arrière : roues jumelées (deux pneus côte à côte), garde-boue
  const RM = { ...CAB, tw: 0.3 }, WG = wheelGeos(RM, MT, hq, 1), rearAx = len > 7.2 ? [-len / 2 + 1.35, -len / 2 + 2.65] : [-len / 2 + 1.55];
  rearAx.forEach((za, ai) => { for (const sx of [1, -1]) for (const dual of [0, 1]) {
    const w = new THREE.Group(); w.name = `wheel-r${ai}${sx > 0 ? 'l' : 'r'}${dual}`; w.rotation.order = 'YXZ'; w.position.set(sx * (1.1 - 0.17 - dual * 0.32), CAB.R, za);
    for (const [k, geo] of Object.entries(sx > 0 ? WG.L : WG.Rt)) if (!dual || k === 'rubber') w.add(mesh(geo, MT[k])); g.add(w); }
    for (const sx of [1, -1]) { const f = new THREE.CylinderGeometry(0.62, 0.62, 0.72, 20, 1, true, 0, Math.PI); f.rotateZ(Math.PI / 2); f.translate(sx * 0.82, CAB.R, za); P.plastic.push(f); } });
  // feux arrière, plaque, pare-chocs arrière
  const zb = -len / 2;
  P.trim.push(box(2.3, 0.14, 0.12, 0, 0.62, zb + 0.1, 0.02));
  for (const sx of [-1, 1]) { const f = box(0.36, 0.14, 0.04, sx * 0.85, 0.66, zb + 0.03, 0.01); rectUVsBox(f, ATLAS.feuB); P.detail.push(f); }
  { const pl = new THREE.PlaneGeometry(0.52, 0.11); pl.rotateY(Math.PI); pl.translate(0, 0.66, zb + 0.02); rectUVsBox(pl, ATLAS.plaqueAr); P.detail.push(pl); }
  // gabarits orange sur les flancs
  for (let z = zb + 0.6; z < cabZ - 1.4; z += 1.5) for (const sx of [-1, 1]) { const l = box(0.03, 0.05, 0.1, sx * 1.2, 1.2, z, 0); solidUVs(l, 'orange'); P.detail.push(l); }
  // superstructure selon le camion
  const top = 1.12;
  if (kind === 'eau') {
    // citerne carrossée, bande blanche, échelle, canon sur tourelle, gyrophares en cabine
    P.paint.push(box(2.36, 1.7, rearL, 0, top + 0.85, rz, 0.16));
    const band = box(2.38, 0.22, rearL - 0.2, 0, top + 0.45, rz, 0.03); solidUVs(band, 'blanc'); P.detail.push(band);
    for (let y = top + 0.2; y < top + 1.7; y += 0.25) P.metal.push(cyl(0.015, 0.5, 0, y, zb - 0.03, 'x', 6)); for (const x of [-0.25, 0.25]) P.metal.push(cyl(0.02, 1.6, x, top + 0.9, zb - 0.03, 'y', 6));
    const tur = new THREE.Group(); tur.name = 'tur'; tur.position.set(0, top + 1.75, rz + rearL / 2 - 0.6);
    tur.add(mesh(cyl(0.42, 0.3, 0, 0.15, 0, 'y', 24), MT.trim)); tur.add(mesh(box(0.5, 0.4, 0.55, 0, 0.45, 0, 0.08), body));
    const noz = new THREE.Group(); noz.name = 'noz'; noz.position.y = 0.48; noz.add(mesh(cyl(0.07, 1.3, 0, 0, 0.75, 'z', 14), MT.metal)); noz.add(mesh(cyl(0.1, 0.18, 0, 0, 1.38, 'z', 14), MT.trim)); tur.add(noz); g.add(tur);
    for (const [n, x, c] of [['l1', -0.55, 'bleuLum'], ['l2', 0.55, 'rougeLum']]) { const l = box(0.38, 0.12, 0.22, x, 3.08, cabZ - 0.15, 0.04); solidUVs(l, c); g.add(mesh(l, MT.detail, n)); }
  } else if (kind === 'armee') {
    // plateau à ridelles, bâche tendue sur arceaux (toile mate)
    P.paint.push(box(2.3, 0.12, rearL, 0, top + 0.06, rz, 0.01));
    for (const sx of [-1, 1]) P.paint.push(box(0.06, 0.55, rearL, sx * 1.12, top + 0.38, rz, 0.01)); P.paint.push(box(2.3, 0.55, 0.06, 0, top + 0.38, zb + 0.03, 0.01));
    const toile = new THREE.MeshStandardMaterial({ name: 'camion_bache', color: '#5b6040', roughness: 0.95 });
    const half = new THREE.CylinderGeometry(1.15, 1.15, rearL - 0.05, 28); half.rotateX(Math.PI / 2); half.scale(1, 0.55, 1); half.translate(0, top + 1.45, rz);
    g.add(mesh(half, toile)); g.add(mesh(box(2.3, 0.8, rearL - 0.05, 0, top + 1.05, rz, 0.02), toile));
    for (let z = zb + 0.5; z < cabZ - 1.2; z += 1.0) { const t = new THREE.TorusGeometry(1.16, 0.02, 4, 24, Math.PI); t.scale(1, 0.55, 1); t.translate(0, top + 1.45, z); P.trim.push(t); }
    // pare-buffle et jerrycans
    for (const sx of [-1, 1]) P.paint.push(box(0.16, 0.3, 0.36, sx * 0.85, 1.35, cabZ - 1.25, 0.03));
  } else if (kind === 'belier') {
    // caisse fourgon renforcée, éperon en acier hachuré jaune et noir à l'avant
    P.paint.push(box(2.46, 2.3, rearL, 0, top + 1.15, rz, 0.06));
    for (let z = zb + 0.4; z < cabZ - 1.2; z += 0.55) for (const sx of [-1, 1]) P.trim.push(box(0.03, 2.2, 0.06, sx * 1.235, top + 1.15, z, 0));
    const ram = box(3.0, 1.0, 0.18, 0, 1.15, len / 2 + 0.35, 0.03); rectUVsBox(ram, ATLAS.danger); P.detail.push(ram);
    for (const x of [-0.8, 0.8]) P.trim.push(box(0.2, 0.2, 0.9, x, 1.0, len / 2 - 0.05, 0.02));
    for (const sx of [-1, 1]) { P.metal.push(box(0.12, 0.9, 0.4, sx * 1.42, 1.15, len / 2 + 0.25, 0.02)); }
    const grid = box(1.9, 0.9, 0.04, 0, 2.3, len / 2 + 0.02, 0.01); rectUVsBox(grid, ATLAS.grille2); P.detail.push(grid); // grille de protection du pare-brise
  }
  for (const [k, list] of Object.entries(P)) { if (!list.length) continue; const geo = merge(list); if (geo) g.add(mesh(geo, k === 'paint' ? body : MT[k])); }
  // ombre de contact sur toute la longueur
  { const sh = new THREE.PlaneGeometry(2.6 / 0.6, len / 0.8); sh.rotateX(-Math.PI / 2); sh.translate(0, 0.012, 0); const o = new THREE.Mesh(sh, MT.contact); o.renderOrder = -1; g.add(o); }
  // l'ombre de contact de la cabine seule est retirée (la grande la remplace)
  cab.traverse((o) => { if (o.isMesh && o.material === MT.contact) o.visible = false; });
  return g;
}
