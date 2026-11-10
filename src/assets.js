// Personnages (Quaternius Modular Character Outfits – Fantasy + Universal Base Characters, assemblés par tools/build-chars) et armes (Quaternius Ultimate Gun, OBJ).
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

// animations Mixamo reciblées hors ligne sur le squelette des Modular Men (outil : bake/ dans le fil du jeu) : course, pas chassés, diagonales, saut, chute, accroupi
let mxClips = null;
async function loadMx() { try { const j = await (await fetch('assets/anims/mx.json')).json(); return j.map((c) => THREE.AnimationClip.parse(c)); } catch (e) { console.warn('anims Mixamo absentes', e); return []; } }
export async function loadChars(names, onEach) {
  mxClips ||= loadMx(); const mx = await mxClips;
  await Promise.all(names.map(async (n) => {
    const g = await loadGLB(`assets/chars/${n}.glb`);
    const s = g.scene; s.updateMatrixWorld(true);
    s.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (/Pistol|Sword|Knife/i.test(o.name)) o.visible = false; if (o.material) { o.material = o.material.clone(); o.material.roughness = Math.max(0.55, o.material.roughness ?? 0.8); o.material.metalness = 0; } }
    });
    const box = new THREE.Box3().setFromObject(s); const k = CHAR_H / (box.max.y - box.min.y);
    mergeChar(s);
    chars[n] = { scene: s, clips: g.animations.concat(mx), k, minY: box.min.y };
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
      const sc = src.attributes.color; // persos Fantasy : couleurs déjà cuites par sommet (textures du pack), sinon la couleur de la matière
      for (let i = gr.start; i < gr.start + gr.count; i++) { const v = src.index ? src.index.getX(i) : i; if (sc) { col[v * 3] = sc.getX(v) * m.color.r; col[v * 3 + 1] = sc.getY(v) * m.color.g; col[v * 3 + 2] = sc.getZ(v) * m.color.b; } else { col[v * 3] = m.color.r; col[v * 3 + 1] = m.color.g; col[v * 3 + 2] = m.color.b; } vs.push(v + off); }
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

// tenues d'équipe : Brigade en bleu police, Frungz en vert ; peau, cheveux, yeux, métal et noir gardent leur couleur
const NOT_CLOTH = /Skin|Hair|Eye|Moustache|Earrings|Gold|Visor|Metal|Tie|Black/;
const TEAM_HUE = { ordre: new THREE.Color('#1f4fd1'), civils: new THREE.Color('#1fa83f') };
const tinted = {}; const _tc = new THREE.Color();
export function tintTeam(model, skin, team) {
  const key = skin + '#' + team, base = TEAM_HUE[team]; const hb = {}; base.getHSL(hb);
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.geometry.userData.ranges) return;
    if (!tinted[key]) {
      const g = o.geometry.clone(); g.userData = o.geometry.userData; const col = g.attributes.color, c = new THREE.Color(), hsl = {};
      for (const r of g.userData.ranges) if (!NOT_CLOTH.test(r.name)) for (const v of r.verts) {
        c.fromBufferAttribute(col, v); c.getHSL(hsl);
        // on garde le modelé de la tenue : le cuir (bruns) et le métal (clairs, gris) restent tels quels, les tissus colorés prennent la teinte de l'équipe, les tissus clairs sont teintés à moitié
        const cuir = hsl.h > 0.02 && hsl.h < 0.13 && hsl.s > 0.22 && hsl.l < 0.4, metal = hsl.s < 0.12 && hsl.l > 0.5; if (cuir || metal) continue;
        if (hsl.s >= 0.2) c.setHSL(hb.h, Math.max(0.5, hsl.s), hsl.l); else c.lerp(_tc.setHSL(hb.h, 0.6, Math.max(0.12, hsl.l * 0.8)), 0.5);
        col.setXYZ(v, c.r, c.g, c.b);
      }
      tinted[key] = g;
    }
    o.geometry = tinted[key];
  });
}
// point du dos à hauteur de poitrine (pour l'écusson POLICE), mesuré sur le maillage animé en pose de repos, dans le repère de ch.root
const backCache = {};
export function backPoint(ch, skin) {
  if (backCache[skin] !== undefined) return backCache[skin];
  let mesh = null; ch.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'corps') mesh = o; }); if (!mesh) return (backCache[skin] = null);
  ch.root.updateMatrixWorld(true); mesh.skeleton.update(); const inv = ch.root.matrixWorld.clone().invert(), m = inv.multiply(mesh.matrixWorld);
  const pos = mesh.geometry.attributes.position, v = new THREE.Vector3(), pts = []; let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < pos.count; i += 2) { mesh.getVertexPosition(i, v); v.applyMatrix4(m); pts.push(v.x, v.y, v.z); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const H = y1 - y0, lo = y0 + H * 0.66, hi = y0 + H * 0.74; let zmin = 1e9;
  for (let i = 0; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1], z = pts[i + 2]; if (y < lo || y > hi || Math.abs(x) > 0.08) continue; zmin = Math.min(zmin, z); }
  return (backCache[skin] = zmin > 1e8 ? null : { y: y0 + H * 0.70, z: zmin });
}

export function makeCharacter(name) {
  const C = chars[name];
  const root = new THREE.Group();
  const model = cloneSkinned(C.scene); model.scale.setScalar(C.k); model.position.y = -C.minY * C.k; root.add(model);
  model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'corps') o.material = o.material.clone(); });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {}; for (const c of C.clips) actions[c.name] = mixer.clipAction(c);
  const bones = {}; model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return { root, model, mixer, actions, bones };
}

export async function loadGuns(onEach) {
  const ids = Object.keys(WEAPONS);
  await Promise.all(ids.map(async (id) => {
    const W = WEAPONS[id];
    try {
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
    const box = new THREE.Box3().setFromObject(obj); const len = box.max.x - box.min.x; const k = (W.len || 0.6) / len;
    pos.sort((a, b) => a[1] - b[1]); const win = W.grip != null ? pos.filter((v) => Math.abs((v[0] - box.min.x) / len - W.grip) < 0.08) : pos; const low = (win.length >= 30 ? win : pos).slice(0, 30); /* W.grip : position de la poignée (fraction de la longueur depuis la crosse), sinon le chargeur ou le bipied passeraient pour la poignée */ const gx = low.reduce((s, v) => s + v[0], 0) / low.length;
    const grip = new THREE.Vector3(gx, box.min.y * 0.62, 0);
    const holder = new THREE.Group(); obj.position.copy(grip).multiplyScalar(-1); holder.add(obj); holder.scale.setScalar(k);
    // bouche du canon (pour la flamme et les traçantes)
    const muzzle = new THREE.Object3D(); muzzle.position.set(box.max.x - grip.x, (box.max.y + box.min.y) * 0.5 + 0.1 - grip.y, 0); holder.add(muzzle); holder.userData.muzzle = muzzle;
    guns[id] = holder;
    } catch (e) { console.warn('arme', id, W.model, e); }
    onEach?.();
  }));
  // modèle manquant : on prend celui d'une arme de la même famille (le jeu reste jouable)
  for (const id of ids) if (!guns[id]) { const alt = ids.find((j) => guns[j] && WEAPONS[j].cat === WEAPONS[id].cat) || 'pistol'; const g = guns[alt].clone(true); g.userData.muzzle = g.children[1]; guns[id] = g; }
}
export function gunInstance(id) { const g = guns[id].clone(true); g.userData.muzzle = g.children[1]; return g; }

// réglage de la prise en main (repère de l'os de la main droite, renommé WristR)
export const GRIP = { rot: [-1.96, 1.452, -2.725], off: [0, 0.08, 0.0] }; // os de la main droite des persos Fantasy (tools/bake-anims/calib.html)
// accroche l'arme à la main droite (os WristR), orientée canon vers l'avant du personnage
export function attachGun(ch, id) {
  const w = ch.bones.WristR; if (ch.gun) ch.gun.parent?.remove(ch.gun);
  const g = gunInstance(id); ch.model.updateMatrixWorld(true); const ws = new THREE.Vector3(); w.getWorldScale(ws);
  g.scale.multiplyScalar(1 / ws.x); g.rotation.set(...GRIP.rot); g.position.set(GRIP.off[0] / ws.x, GRIP.off[1] / ws.x, GRIP.off[2] / ws.x);
  w.add(g); ch.gun = g; return g;
}
