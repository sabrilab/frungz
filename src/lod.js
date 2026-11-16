// Niveaux de détail des personnages. Le corps d'un perso fait près de 47 000 triangles : parfait à 3 m, du gaspillage à 40 m
// où il mesure trente pixels de haut. On calcule une fois par tenue trois versions allégées (mêmes sommets, mêmes os, mêmes
// textures : seule la liste des triangles change, donc presque pas de mémoire en plus), et le jeu choisit selon la distance.
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';

let ok = false;
export const lodReady = MeshoptSimplifier.ready.then(() => { ok = !!MeshoptSimplifier.supported; MeshoptSimplifier.useExperimentalFeatures = true; }).catch((e) => console.warn('niveaux de détail indisponibles', e));
// part de triangles gardée et écart toléré (en fraction de la taille du perso) pour les niveaux 1, 2 et 3
const LEVELS = [[0.27, 0.006], [0.085, 0.02], [0.03, 0.06]];
// distances de bascule (mètres, pour un champ de vision normal ; le zoom d'une lunette rapproche d'autant)
export const LOD_DIST = [7, 19, 44];

// géométries du corps pour une tenue : [complète, niveau 1, niveau 2, niveau 3] (en cache sur la géométrie d'origine)
export function bodyLods(geo) {
  if (geo.userData.lods) return geo.userData.lods;
  if (!ok) return [geo]; // simplificateur pas encore prêt : version complète, on réessaiera
  const lods = (geo.userData.lods = [geo]);
  const pos = geo.attributes.position, idx = geo.index;
  if (!idx || !(pos?.array instanceof Float32Array) || pos.isInterleavedBufferAttribute) return lods;
  try {
    const I = idx.array instanceof Uint32Array ? idx.array : new Uint32Array(idx.array), nv = pos.count;
    // les couleurs et les UV comptent dans la simplification : les bords des vêtements et de la peau restent nets
    const col = geo.attributes.color, uv = geo.attributes.uv, st = (col ? 3 : 0) + (uv ? 2 : 0); let A = null, W = null;
    if (st) { A = new Float32Array(nv * st); W = []; for (let i = 0; i < nv; i++) { let o = i * st; if (col) { A[o++] = col.getX(i); A[o++] = col.getY(i); A[o++] = col.getZ(i); } if (uv) { A[o++] = uv.getX(i); A[o++] = uv.getY(i); } } if (col) W.push(0.6, 0.6, 0.6); if (uv) W.push(1, 1); }
    for (const [ratio, err] of LEVELS) {
      const target = Math.max(300, Math.floor(I.length * ratio / 3) * 3);
      let out = A ? MeshoptSimplifier.simplifyWithAttributes(I, pos.array, 3, A, st, W, null, target, err)[0] : MeshoptSimplifier.simplify(I, pos.array, 3, target, err)[0];
      // la version « avec attributs » s'arrête parfois trop tôt sur les coutures : pour les niveaux lointains, la forme seule suffit
      if (out.length > target * 1.5) { const o2 = MeshoptSimplifier.simplify(I, pos.array, 3, target, err * 1.5)[0]; if (o2.length < out.length) out = o2; }
      const g = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a); // sommets partagés avec la version complète
      g.setIndex(new THREE.BufferAttribute(out, 1)); g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox; g.userData.lodOf = geo;
      lods.push(out.length < lods[lods.length - 1].index.count ? g : lods[lods.length - 1]);
    }
  } catch (e) { console.warn('niveaux de détail', e); }
  return lods;
}
// niveau voulu pour une distance « ressentie » d (distance × ouverture du champ), avec une marge pour ne pas clignoter à la limite
export function lodLevel(d, cur = 0, scale = 1) {
  let k = 0; for (let i = 0; i < LOD_DIST.length; i++) if (d > LOD_DIST[i] * scale * (cur > i ? 0.9 : 1)) k = i + 1;
  return k;
}
