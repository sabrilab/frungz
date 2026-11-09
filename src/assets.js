// Personnages (Quaternius Ultimate Modular Men, animations incluses) et armes (Quaternius Ultimate Gun, OBJ).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { loader, loadGLB } from './world.js';
import { WEAPONS } from './data.js';

const CHAR_H = 1.8;
export const chars = {}; // nom → { scene, clips, k, minY }
export const guns = {}; // id → Object3D (barre vers +x, poignée à l'origine, longueur réelle)
const GUN_LEN = { pistol: 0.24, smg: 0.5, shotgun: 0.95, rifle: 0.88, sniper: 1.15, revolver: 0.32 };

export async function loadChars(names, onEach) {
  await Promise.all(names.map(async (n) => {
    const g = await loadGLB(`assets/chars/${n}.glb`);
    const s = g.scene; s.updateMatrixWorld(true);
    s.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (/Pistol|Sword|Knife/i.test(o.name)) o.visible = false; if (o.material) { o.material = o.material.clone(); o.material.roughness = Math.max(0.55, o.material.roughness ?? 0.8); o.material.metalness = 0; } }
    });
    const box = new THREE.Box3().setFromObject(s); const k = CHAR_H / (box.max.y - box.min.y);
    mergeChar(s);
    chars[n] = { scene: s, clips: g.animations, k, minY: box.min.y };
    onEach?.();
  }));
}

// Fusionne toutes les pièces d'un personnage (corps, tête, jambes, pieds : ~12 maillages et 5 squelettes)
// en un seul maillage à couleurs par sommet et un seul squelette : 12 fois moins d'appels de dessin et de squelettes à calculer.
const KEEP = ['position', 'normal', 'skinIndex', 'skinWeight'];
function mergeChar(scene) {
  scene.updateMatrixWorld(true);
  const parts = []; scene.traverse((o) => { if (o.isSkinnedMesh && o.visible) parts.push(o); });
  if (parts.length < 2) return;
  const bones = parts[0].skeleton.bones;
  if (!parts.every((p) => p.skeleton.bones.length === bones.length && p.skeleton.bones.every((b, i) => b.name === bones[i].name))) return;
  const geos = [], ranges = []; let off = 0;
  for (const p of parts) {
    const src = p.geometry, g = new THREE.BufferGeometry(), n = src.attributes.position.count;
    for (const key of KEEP) {
      const a = src.attributes[key]; if (!a) return; const arr = key === 'skinIndex' ? new Uint16Array(n * a.itemSize) : new Float32Array(n * a.itemSize);
      for (let i = 0; i < n; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(key, new THREE.BufferAttribute(arr, a.itemSize));
    }
    if (src.index) g.setIndex(Array.from(src.index.array));
    const col = new Float32Array(n * 3), mats = [].concat(p.material);
    const groups = src.groups.length && Array.isArray(p.material) ? src.groups : [{ start: 0, count: src.index ? src.index.count : n, materialIndex: 0 }];
    for (const gr of groups) {
      const m = mats[gr.materialIndex] || mats[0]; const vs = [];
      for (let i = gr.start; i < gr.start + gr.count; i++) { const v = src.index ? src.index.getX(i) : i; col[v * 3] = m.color.r; col[v * 3 + 1] = m.color.g; col[v * 3 + 2] = m.color.b; vs.push(v + off); }
      ranges.push({ name: m.name || '', verts: vs });
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // les inverseBindMatrices diffèrent d'une pièce à l'autre (quantification) : on ramène chaque pièce dans l'espace de liaison de la première
    const T = new THREE.Matrix4().copy(parts[0].skeleton.boneInverses[0]).invert().multiply(p.skeleton.boneInverses[0]).multiply(p.bindMatrix);
    g.applyMatrix4(T); geos.push(g); off += n;
  }
  const geo = mergeGeometries(geos, false); if (!geo) return;
  geo.userData.ranges = ranges;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, name: 'corps' });
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.name = 'corps'; mesh.castShadow = true; mesh.receiveShadow = false;
  parts[0].parent.add(mesh); mesh.bind(parts[0].skeleton, new THREE.Matrix4());
  for (const p of parts) p.parent.remove(p);
  mesh.updateMatrixWorld(true); mesh.computeBoundingSphere(); mesh.boundingSphere.radius *= 1.7; mesh.frustumCulled = true;
}

// teinte des tenues de la Brigade (bleu marine), calculée une fois par skin et partagée
const tinted = {};
export function tintBrigade(model, skin) {
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (!o.geometry.userData.ranges) { if (o.material) { const n = o.material.name || ''; if (/^Swat$|Grey|Suit$|Adventurer|Worker/.test(n) && !/Skin|Hair|Eye|Black|Visor/.test(n)) o.material.color.lerp(new THREE.Color('#1c2a4a'), 0.75); } return; }
    if (!tinted[skin]) {
      const g = o.geometry.clone(); g.userData = o.geometry.userData; const col = g.attributes.color, navy = new THREE.Color('#1c2a4a'), c = new THREE.Color();
      for (const r of g.userData.ranges) if (/^Swat$|Grey|Suit$|Adventurer|Worker/.test(r.name) && !/Skin|Hair|Eye|Black|Visor/.test(r.name)) for (const v of r.verts) { c.fromBufferAttribute(col, v).lerp(navy, 0.75); col.setXYZ(v, c.r, c.g, c.b); }
      tinted[skin] = g;
    }
    o.geometry = tinted[skin];
  });
}

export function makeCharacter(name) {
  const C = chars[name];
  const root = new THREE.Group();
  const model = cloneSkinned(C.scene); model.scale.setScalar(C.k); model.position.y = -C.minY * C.k; root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {}; for (const c of C.clips) actions[c.name] = mixer.clipAction(c);
  const bones = {}; model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return { root, model, mixer, actions, bones };
}

export async function loadGuns(onEach) {
  const ids = Object.keys(WEAPONS);
  await Promise.all(ids.map(async (id) => {
    const W = WEAPONS[id];
    const mtl = await new MTLLoader().setPath('assets/guns/').loadAsync(`${W.model}.mtl`); mtl.preload();
    const obj = await new OBJLoader().setMaterials(mtl).setPath('assets/guns/').loadAsync(`${W.model}.obj`);
    // matériaux : couleurs de l'MTL en PBR mat, un peu de métal
    obj.traverse((o) => {
      if (!o.isMesh) return; o.castShadow = true;
      const conv = (m) => new THREE.MeshStandardMaterial({ color: m.color.clone().convertLinearToSRGB().multiplyScalar(1.4).convertSRGBToLinear(), roughness: /metal/i.test(m.name) ? 0.35 : 0.6, metalness: /metal/i.test(m.name) ? 0.6 : 0.1, name: m.name, flatShading: true });
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    // poignée à l'origine (sommets les plus bas), longueur réelle
    const pos = []; obj.traverse((o) => { if (o.isMesh) { const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++) pos.push([a.getX(i), a.getY(i), a.getZ(i)]); } });
    const box = new THREE.Box3().setFromObject(obj); const len = box.max.x - box.min.x; const k = GUN_LEN[id] / len;
    pos.sort((a, b) => a[1] - b[1]); const low = pos.slice(0, 30); const gx = low.reduce((s, v) => s + v[0], 0) / low.length;
    const grip = new THREE.Vector3(gx, box.min.y * 0.62, 0);
    const holder = new THREE.Group(); obj.position.copy(grip).multiplyScalar(-1); holder.add(obj); holder.scale.setScalar(k);
    // bouche du canon (pour la flamme et les traçantes)
    const muzzle = new THREE.Object3D(); muzzle.position.set(box.max.x - grip.x, (box.max.y + box.min.y) * 0.5 + 0.1 - grip.y, 0); holder.add(muzzle); holder.userData.muzzle = muzzle;
    guns[id] = holder; onEach?.();
  }));
}
export function gunInstance(id) { const g = guns[id].clone(true); g.userData.muzzle = g.children[1]; return g; }

// réglage de la prise en main (repère de l'os Wrist.R des Modular Men)
export const GRIP = { rot: [-0.022, 0.177, 1.615], off: [0, 0.07, 0.0] };
// accroche l'arme à la main droite (os WristR), orientée canon vers l'avant du personnage
export function attachGun(ch, id) {
  const w = ch.bones.WristR; if (ch.gun) ch.gun.parent?.remove(ch.gun);
  const g = gunInstance(id); ch.model.updateMatrixWorld(true); const ws = new THREE.Vector3(); w.getWorldScale(ws);
  g.scale.multiplyScalar(1 / ws.x); g.rotation.set(...GRIP.rot); g.position.set(GRIP.off[0] / ws.x, GRIP.off[1] / ws.x, GRIP.off[2] / ws.x);
  w.add(g); ch.gun = g; return g;
}
