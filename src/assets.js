// Personnages (Quaternius Ultimate Modular Men, animations incluses) et armes (Quaternius Ultimate Gun, OBJ).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
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
    chars[n] = { scene: s, clips: g.animations, k, minY: box.min.y };
    onEach?.();
  }));
}

export function makeCharacter(name) {
  const C = chars[name];
  const root = new THREE.Group();
  const model = cloneSkinned(C.scene); model.scale.setScalar(C.k); model.position.y = -C.minY * C.k; root.add(model);
  model.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
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
