// Personnages (Quaternius Modular Character Outfits – Fantasy + Universal Base Characters, assemblés par tools/build-chars) et armes (Quaternius Ultimate Gun, OBJ).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { loader, loadGLB } from './world.js';
import { WEAPONS } from './data.js';

const CHAR_H = 1.8;
export const chars = {}; // nom → { scene, clips, k, minY }
export const guns = {}; // id → Object3D (barre vers +x, poignée à l'origine, longueur réelle)

// animations Mixamo reciblées hors ligne sur le squelette des Modular Men (outil : bake/ dans le fil du jeu) : course, pas chassés, diagonales, saut, chute, accroupi
let mxClips = null;
export function loadMx() { return (mxClips ||= fetchMx()); }
async function fetchMx() { try { const j = await (await fetch('assets/anims/mx.json')).json(); return j.map((c) => THREE.AnimationClip.parse(c)); } catch (e) { console.warn('anims Mixamo absentes', e); return []; } }
export async function loadChars(names, onEach) {
  const mx = await loadMx();
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
  if (chars[skin]?.noTint) return; // skins du studio : vraies couleurs
  const key = skin + '#' + team, base = TEAM_HUE[team]; const hb = {}; base.getHSL(hb);
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.geometry.userData.ranges) return;
    if (!tinted[key]) {
      const g = o.geometry.clone(); g.userData = o.geometry.userData; const col = g.attributes.color, c = new THREE.Color(), hsl = {};
      for (const r of g.userData.ranges) if (!NOT_CLOTH.test(r.name)) for (const v of r.verts) {
        c.fromBufferAttribute(col, v); c.getHSL(hsl);
        // on garde le modelé de la tenue : le cuir (bruns) et le métal (clairs, gris) restent tels quels, les tissus colorés prennent la teinte de l'équipe, les tissus clairs sont teintés à moitié
        const cuir = hsl.h > 0.02 && hsl.h < 0.13 && hsl.s > 0.22 && hsl.l < 0.4, metal = hsl.s < 0.12 && hsl.l > 0.5; if (metal || (cuir && team !== 'ordre')) continue;
        if (cuir) { c.setHSL(hb.h + 0.02, 0.38, hsl.l * 0.8); col.setXYZ(v, c.r, c.g, c.b); continue; } /* Brigade : le cuir brun devient bleu nuit, toute la tenue se lit comme un uniforme */
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

// matières des armes : [couleur, rugosité, métal]. Les couleurs du pack sont presque noires : on les remonte en acier bronzé, polymère mat et bois verni pour que les volumes se lisent
const GUN_MATS = { Black: ['#262a30', 0.6, 0.1], Black2: ['#1c1f24', 0.65, 0.1], Grey: ['#4a4f57', 0.5, 0.35], Metal: ['#646b75', 0.3, 0.9], DarkMetal: ['#3d424a', 0.36, 0.85], LightMetal: ['#a3abb6', 0.22, 0.95],
  Wood: ['#8f5d3b', 0.55, 0], DarkWood: ['#6e472f', 0.6, 0], Glass: ['#16304d', 0.08, 0.3], Main: ['#333e49', 0.5, 0.3], MainLight: ['#465563', 0.45, 0.4], MainDark: ['#232b34', 0.55, 0.25], Green: ['#5e6c4b', 0.6, 0.1] };
// Matière d'une pièce d'arme. Le grain est calculé dans le shader à partir de la position sur l'arme (les modèles n'ont pas d'UV) :
// acier brossé dans le sens du canon, bois veiné, polymère finement grainé. « unit » convertit les unités du modèle en mètres.
const GUN_GRAIN = `
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
const gunMatCache = {};
function gunMaterial(name, unit) {
  const key = name + '|' + unit.toFixed(5); if (gunMatCache[key]) return gunMatCache[key];
  const P = GUN_MATS[name] || GUN_MATS.Black, kind = /Metal/.test(name) ? 1 : /Wood/.test(name) ? 2 : /Glass/.test(name) ? 3 : 0;
  const m = new THREE.MeshStandardMaterial({ color: P[0], roughness: P[1], metalness: P[2], envMapIntensity: P[2] > 0.5 ? 1.7 : 1.0, name });
  if (kind !== 3) { m.onBeforeCompile = (sh) => { sh.uniforms.gUnit = { value: unit };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGunP; uniform float gUnit;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGunP = position * gUnit;');
    const body = kind === 1
      ? 'float gs = gNoise(vec3(vGunP.x * 14.0, vGunP.y * 900.0, vGunP.z * 900.0)); float gb = gNoise(vGunP * 38.0); float gG = (gs - 0.5) * 0.16 + (gb - 0.5) * 0.12; float gR = (gs - 0.5) * 0.22 + (gb - 0.5) * 0.18;'
      : kind === 2
        ? 'float gw = gNoise(vec3(vGunP.x * 9.0, vGunP.y * 70.0, vGunP.z * 70.0)); float gv = sin((vGunP.y + vGunP.z * 0.6) * 520.0 + gw * 9.0) * 0.5 + 0.5; float gG = (gv - 0.5) * 0.34 + (gw - 0.5) * 0.2; float gR = (0.5 - gv) * 0.25;'
        : 'float gp = gNoise(vGunP * 1400.0); float gb = gNoise(vGunP * 30.0); float gG = (gp - 0.5) * 0.14 + (gb - 0.5) * 0.08; float gR = (gp - 0.5) * 0.2 + (gb - 0.5) * 0.12;';
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGunP;' + GUN_GRAIN)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + body + '\ndiffuseColor.rgb *= 1.0 + gG;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + gR, 0.06, 1.0);'); };
    m.customProgramCacheKey = () => 'gun' + kind; }
  return (gunMatCache[key] = m);
}
export async function loadGuns(onEach) {
  const ids = Object.keys(WEAPONS);
  await Promise.all(ids.map(async (id) => {
    const W = WEAPONS[id];
    try {
    const mtl = await new MTLLoader().setPath('assets/guns/').loadAsync(`${W.model}.mtl`); mtl.preload();
    const obj = await new OBJLoader().setMaterials(mtl).setPath('assets/guns/').loadAsync(`${W.model}.obj`);
    // formes adoucies (canons et lunettes ronds, arêtes vives gardées) et matières avec un grain propre à chaque matériau
    const box0 = new THREE.Box3().setFromObject(obj), unit = (W.len || 0.6) / (box0.max.x - box0.min.x);
    obj.traverse((o) => {
      if (!o.isMesh) return; o.castShadow = true;
      o.geometry = toCreasedNormals(o.geometry, 0.62);
      const conv = (m) => gunMaterial(m.name, unit);
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

// ---------------------------------------------------------------- marquages de tenue
// Marquages Brigade peints sur le vêtement : « POLICE » dans le dos et sur la poitrine, brassard orange au bras gauche.
// Ce ne sont plus des panneaux posés sur le perso : on reprend les triangles de la tenue eux-mêmes (mêmes os, mêmes poids),
// avec une image projetée dessus. Le marquage suit donc exactement le tissu, plis et mouvements compris.
let markTex = null; const markCache = {};
function markTexture() {
  if (markTex) return markTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '92px Bungee, Inter, sans-serif'; g.fillStyle = '#f2f4f7'; g.fillText('POLICE', 256, 66);
  g.fillStyle = '#f08a12'; g.fillRect(0, 136, 512, 112); g.fillStyle = '#d97706'; g.fillRect(0, 136, 512, 8); g.fillRect(0, 240, 512, 8);
  g.fillStyle = '#18233f'; g.font = '70px Bungee, Inter, sans-serif'; g.fillText('POLICE', 256, 196);
  markTex = new THREE.CanvasTexture(c); markTex.colorSpace = THREE.SRGBColorSpace; markTex.generateMipmaps = false; markTex.minFilter = THREE.LinearFilter; markTex.anisotropy = 4; return markTex;
}
const RECT_TEXT = [0.01, 1 - 126 / 256, 0.99, 1 - 6 / 256], RECT_BAND = [0, 1 - 248 / 256, 1, 1 - 136 / 256];
export function teamMarkings(ch, skin) {
  let mesh = null; ch.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'corps') mesh = o; }); if (!mesh) return null;
  // skins du studio : marquages au choix (« POLICE » dans le dos, brassard) ; cache par géométrie (le studio refait le skin à chaque retouche)
  const def = chars[skin]?.def, want = def ? { dos: (def.extras || []).includes('dos'), brassard: (def.extras || []).includes('brassard') } : { dos: true, brassard: true };
  if (!want.dos && !want.brassard) return null; const key = mesh.geometry.uuid + (want.dos ? 'D' : '') + (want.brassard ? 'B' : '');
  if (markCache[key] === undefined) markCache[key] = buildMarkings(ch, mesh, want);
  const geo = markCache[key]; if (!geo) return null;
  const mat = new THREE.MeshStandardMaterial({ map: markTexture(), roughness: 0.85, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 dRect; attribute float dWrap; varying vec4 vDRect; varying float vDWrap;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDRect = dRect; vDWrap = dWrap;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vDRect; varying float vDWrap;')
      .replace('#include <map_fragment>', 'vec2 duv = vMapUv; if (vDWrap > 0.5) duv.x = fract(duv.x); if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) discard;\nvec4 sampledDiffuseColor = texture2D(map, mix(vDRect.xy, vDRect.zw, duv)); if (sampledDiffuseColor.a < 0.05) discard; diffuseColor *= sampledDiffuseColor;');
  };
  const dm = new THREE.SkinnedMesh(geo, mat); dm.name = 'marquages'; dm.bind(mesh.skeleton, mesh.bindMatrix); dm.position.copy(mesh.position); dm.quaternion.copy(mesh.quaternion); dm.scale.copy(mesh.scale);
  dm.frustumCulled = false; dm.castShadow = false; dm.renderOrder = 1; mesh.parent.add(dm); return dm;
}
function buildMarkings(ch, mesh, want = { dos: true, brassard: true }) {
  const src = mesh.geometry, I = src.index, P = src.attributes.position, SI = src.attributes.skinIndex, SW = src.attributes.skinWeight; if (!I || !SI) return null;
  ch.root.updateMatrixWorld(true); mesh.skeleton.update(); const m = ch.root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  // sommets en pose de repos, dans le repère du perso (mètres, y vers le haut, dos vers -z)
  const R = new Float32Array(P.count * 3), v = new THREE.Vector3(); let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < P.count; i++) { mesh.getVertexPosition(i, v); v.applyMatrix4(m); R[i * 3] = v.x; R[i * 3 + 1] = v.y; R[i * 3 + 2] = v.z; y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const H = y1 - y0, bones = mesh.skeleton.bones, dom = (i) => { let b = 0, w = -1; for (let k = 0; k < 4; k++) { const ww = SW.getComponent(i, k); if (ww > w) { w = ww; b = SI.getComponent(i, k); } } return bones[b].name; };
  const pos = [], uv = [], si = [], sw = [], rect = [], wrap = [];
  const push = (i, u, w2, r, wr) => { pos.push(P.getX(i), P.getY(i), P.getZ(i)); uv.push(u, w2); for (let k = 0; k < 4; k++) { si.push(SI.getComponent(i, k)); sw.push(SW.getComponent(i, k)); } rect.push(...r); wrap.push(wr); };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  const TORSO = /^(Chest|Torso|Abdomen|Shoulder|Neck)/;
  // plans : dos (large) et poitrine côté cœur (petit), à hauteur de poitrine
  const plans = want.dos ? [{ cx: 0, cy: y0 + H * 0.725, w: 0.3, h: 0.3 * 120 / 502, back: true }] : [];
  // brassard : bande autour du bras gauche, entre l'épaule et le coude
  const UA = ch.bones.UpperArmL, LA = ch.bones.LowerArmL; let band = null;
  if (UA && LA && want.brassard) { const inv = ch.root.matrixWorld.clone().invert(), a0 = UA.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), a1 = LA.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), d = a1.clone().sub(a0), L = d.length(); d.normalize();
    const p1 = new THREE.Vector3(0, 0, 1).addScaledVector(d, -d.z).normalize(), p2 = new THREE.Vector3().crossVectors(d, p1); band = { a0, d, L, p1, p2, s0: L * 0.42, h: 0.085 }; }
  for (let t = 0; t < I.count; t += 3) { const ia = I.getX(t), ib = I.getX(t + 1), ic = I.getX(t + 2);
    A.fromArray(R, ia * 3); B.fromArray(R, ib * 3); C.fromArray(R, ic * 3); n.copy(B).sub(A).cross(e.copy(C).sub(A)).normalize();
    const da = dom(ia), db = dom(ib), dc = dom(ic);
    if (TORSO.test(da) && TORSO.test(db) && TORSO.test(dc)) for (const p of plans) {
      if (p.back ? n.z > -0.3 : n.z < 0.3) continue; const x0 = Math.min(A.x, B.x, C.x), x1 = Math.max(A.x, B.x, C.x), ya = Math.min(A.y, B.y, C.y), yb = Math.max(A.y, B.y, C.y);
      if (x1 < p.cx - p.w / 2 || x0 > p.cx + p.w / 2 || yb < p.cy - p.h / 2 || ya > p.cy + p.h / 2) continue;
      for (const [i, q] of [[ia, A], [ib, B], [ic, C]]) push(i, 0.5 + (p.back ? -1 : 1) * (q.x - p.cx) / p.w, 0.5 + (q.y - p.cy) / p.h, RECT_TEXT, 0); }
    if (band && (da === 'UpperArmL' || db === 'UpperArmL' || dc === 'UpperArmL') && [da, db, dc].every((x) => /^(UpperArmL|LowerArmL|ShoulderL)/.test(x))) {
      const sv = [], av = []; for (const q of [A, B, C]) { e.copy(q).sub(band.a0); sv.push(e.dot(band.d)); av.push(Math.atan2(e.dot(band.p2), e.dot(band.p1)) / (2 * Math.PI)); }
      if (Math.max(...sv) < band.s0 || Math.min(...sv) > band.s0 + band.h) continue;
      for (let k = 1; k < 3; k++) { while (av[k] - av[0] > 0.5) av[k] -= 1; while (av[k] - av[0] < -0.5) av[k] += 1; } // le triangle ne doit pas être coupé par la couture de l'angle
      [ia, ib, ic].forEach((i, k) => push(i, 4 - av[k] * 2, 1 - (sv[k] - band.s0) / band.h, RECT_BAND, 1)); } }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); geo.setAttribute('dRect', new THREE.Float32BufferAttribute(rect, 4)); geo.setAttribute('dWrap', new THREE.Float32BufferAttribute(wrap, 1));
  geo.computeVertexNormals(); return geo;
}
