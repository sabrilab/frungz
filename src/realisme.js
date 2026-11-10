// Réalisme des matières (v9) : module autonome (three seulement), à appeler une fois après le chargement de la map.
//   import { applyRealism, skyEnvironment } from './realisme.js';
//   applyRealism(root, { renderer, wet: 0.5 });            // grain, salissures, coulures, sol mouillé
//   scene.environment = skyEnvironment(renderer, { ... });  // reflets du ciel (remplace RoomEnvironment)
// Rien n'est stocké dans le .glb : une seule texture de 512 px générée au chargement, plaquée en coordonnées monde
// (projection selon l'axe dominant de la normale : 3 lectures de texture par pixel, aucun UV supplémentaire).
import * as THREE from 'three';

// bruit de valeur périodique (tuilable)
function tileNoise(S, cells, seed) {
  const g = new Float32Array(cells * cells); let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[i] = s / 4294967296; }
  const out = new Float32Array(S * S), f = cells / S, sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x * f, fy = y * f, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const a = g[(y0 % cells) * cells + (x0 % cells)], b = g[(y0 % cells) * cells + ((x0 + 1) % cells)], c = g[((y0 + 1) % cells) * cells + (x0 % cells)], d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
    out[y * S + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  return out;
}
const fbm = (S, cells, oct, seed) => { const o = new Float32Array(S * S); let amp = 0.5, tot = 0; for (let k = 0; k < oct; k++) { const n = tileNoise(S, cells << k, seed + k * 97); for (let i = 0; i < o.length; i++) o[i] += n[i] * amp; tot += amp; amp *= 0.5; } for (let i = 0; i < o.length; i++) o[i] /= tot; return o; };

let _detail = null;
// R : grain fin (pierre, enduit, peinture) ; G : grandes taches (salissures, flaques) ; B : bruit moyen (coulures une fois étiré)
export function detailTexture(S = 512) {
  if (_detail) return _detail;
  const r = fbm(S, 32, 4, 11), g = fbm(S, 4, 5, 23), b = fbm(S, 16, 3, 37), data = new Uint8Array(S * S * 4);
  const st = (v, k) => Math.max(0, Math.min(255, Math.round((0.5 + (v - 0.5) * k) * 255)));
  for (let i = 0; i < S * S; i++) { data[i * 4] = st(r[i], 2.2); data[i * 4 + 1] = st(g[i], 2.6); data[i * 4 + 2] = st(b[i], 2.4); data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return (_detail = t);
}

// réglages par nom de matériau : amt = force du grain et des taches, streak = coulures verticales, wet = flaques (sols), base = encrassement en pied de mur
// (v8) bump = relief du grain (m), joint = appareil de pierre de taille sur les murs clairs, wear = peinture routière usée, mapBump = relief tiré de la texture (pavés, joints), leaf = feuillage (découpe, vent)
const PRESETS = {
  matte: { amt: 1.0, streak: 1.0, base: 1.0, bump: 0.5, joint: 1, wear: 1 }, satin: { amt: 0.45, streak: 0.5, base: 0.5, bump: 0.12 }, metal: { amt: 0.7, streak: 1.0, base: 0, bump: 0.1 },
  asphalt: { amt: 0.5, wet: 1, bump: 0.9, mapBump: 0.6 }, cobble: { amt: 0.5, wet: 0.7, bump: 0.4, mapBump: 2.4 },
  // (v9) slab = dalles de granit : nuance, poli et légère pente propres à chaque dalle, chewing-gums ; glass = vitres anciennes qui ondulent
  sidewalk: { amt: 0.45, wet: 0.7, bump: 0.5, mapBump: 1.6, slab: 1 }, curb: { amt: 0.4, wet: 0.2, bump: 0.5, mapBump: 1.2 }, gutter: { amt: 0.5, wet: 1.6, bump: 0.4, mapBump: 2.2 },
  glass: { amt: 0.2, glass: 1.2 }, glassLit: { amt: 0.2, glass: 1.2 }, ground: { amt: 0.6, bump: 0.6 },
  carrelage: { amt: 0.35, streak: 0.6, mapBump: 0.8 }, carrelage_voute: { amt: 0.5, streak: 0.8, mapBump: 0.8 }, granito: { amt: 0.4, mapBump: 0.5 }, horizon: null,
  leaf: { amt: 0.9, leaf: 1 },
};
const shared = { uDetail: { value: null }, uWet: { value: 0.4 }, uReal: { value: 1 }, uTime: { value: 0 }, uWind: { value: 1 } };
export const realismUniforms = shared; // uWet (0 = sec, 1 = après la pluie), uReal (0 = coupé), uWind (0 = feuillage immobile) se règlent en direct ; uTime avance tout seul

const _done = new WeakSet();
export function patchMaterial(m, P) {
  if (!m || _done.has(m) || !m.isMeshStandardMaterial) return;
  _done.add(m); delete m.userData.__real; // (v8) plus de marqueur dans userData : il partait dans le .glb et le jeu croyait les matériaux déjà traités
  const prev = m.onBeforeCompile, LEAF = !!P.leaf;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uDetail = shared.uDetail; sh.uniforms.uWet = shared.uWet; sh.uniforms.uReal = shared.uReal; sh.uniforms.uTime = shared.uTime; sh.uniforms.uWind = shared.uWind;
    sh.uniforms.uRAmt = { value: P.amt ?? 0.5 }; sh.uniforms.uRStreak = { value: P.streak ?? 0 }; sh.uniforms.uRWet = { value: P.wet ?? 0 }; sh.uniforms.uRBase = { value: P.base ?? 0 };
    sh.uniforms.uRBump = { value: P.bump ?? 0 }; sh.uniforms.uRJoint = { value: P.joint ?? 0 }; sh.uniforms.uRWear = { value: P.wear ?? 0 }; sh.uniforms.uRMapBump = { value: P.mapBump ?? 0 }; sh.uniforms.uRSlab = { value: P.slab ?? 0 }; sh.uniforms.uRGlass = { value: P.glass ?? 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRPos; varying vec3 vRNrm; uniform float uTime, uWind, uReal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vRPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vRNrm = normalize(mat3(modelMatrix) * objectNormal);` + (LEAF ? `
  { float rS = uReal * uWind * smoothstep(2.2, 6.5, vRPos.y) * 0.07; float rT = uTime * 1.25 + vRPos.x * 0.37 + vRPos.z * 0.29;
    transformed += inverse(mat3(modelMatrix)) * rS * vec3(sin(rT) + 0.4 * sin(rT * 2.7 + vRPos.y), 0.35 * sin(rT * 1.9 + vRPos.x), cos(rT * 0.83) + 0.4 * sin(rT * 3.1 + vRPos.z)); }` : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRPos; varying vec3 vRNrm; uniform sampler2D uDetail; uniform float uWet, uReal, uRAmt, uRStreak, uRWet, uRBase, uRBump, uRJoint, uRWear, uRMapBump, uRSlab, uRGlass;\nfloat rHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 rN = abs(vRNrm); float rUp = step(0.6, rN.y); float rDist = length(vViewPosition);
  vec2 rUV = rUp > 0.5 ? vRPos.xz : (rN.x > rN.z ? vRPos.zy : vRPos.xy);
  float rGrain = texture2D(uDetail, rUV * 0.55).r - 0.5;
  float rBlot = texture2D(uDetail, rUV * 0.047 + 0.31).g - 0.5;
  float rH = rGrain * uRBump;` + (LEAF ? `
  { // feuillage : découpe en feuilles près de la caméra, dégradé de teinte, envers plus sombre
    float rCut = texture2D(uDetail, rUV * 0.83 + vRPos.y * 0.21).b + rGrain * 0.9;
    float rNear = uReal * (1.0 - smoothstep(22.0, 48.0, rDist));
    if (rCut < 0.3 * rNear * smoothstep(1.7, 3.2, vRPos.y)) discard;
    diffuseColor.rgb *= 1.0 + uReal * (rBlot * 0.55 + rGrain * 0.3 + (rCut - 0.5) * 0.3);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.1, 0.62), uReal * smoothstep(0.05, 0.3, rBlot) * 0.5);
    if (!gl_FrontFacing) diffuseColor.rgb *= 0.66;
  }` : `
  float rStreak = (1.0 - rUp) * (texture2D(uDetail, vec2(rUV.x * 0.8, rUV.y * 0.03)).b - 0.5) * smoothstep(-0.02, 0.3, rBlot);
  float rBase = (1.0 - rUp) * uRBase * (1.0 - smoothstep(0.0, 1.4, vRPos.y)) * step(-0.3, vRPos.y);
  float rWet = uRWet * uWet * rUp * smoothstep(0.16, 0.34, rBlot + rGrain * 0.12);
  float rK = uReal * uRAmt;
  float rSlabR = 0.0; vec2 rTilt = vec2(0.0);
  if (uRSlab > 0.0 && rUp > 0.5) { // dalles de 100 x 50 cm (même calepinage que la texture, 3 m par tuile) : chaque dalle a sa nuance, son poli, sa pente
    vec2 rSu = vec2(vRPos.x, -vRPos.z) / 3.0; float rRow = floor(rSu.y * 6.0), rCol = floor(rSu.x * 3.0 - (mod(rRow, 2.0) < 0.5 ? 0.5 : 0.0));
    float rH1 = rHash(vec2(rCol, rRow)), rH2 = rHash(vec2(rRow + 7.3, rCol - 3.1)), rF = uReal * uRSlab * (1.0 - smoothstep(35.0, 90.0, rDist));
    diffuseColor.rgb *= (1.0 + rF * (rH1 - 0.5) * 0.2) * mix(vec3(1.0), mix(vec3(1.035, 1.0, 0.955), vec3(0.965, 1.0, 1.04), rH2), rF);
    rSlabR = rF * (rH2 - 0.5) * 0.34; rTilt = rF * (vec2(rH1, rH2) - 0.5) * 0.035;
    vec2 rGc = vRPos.xz / 0.62, rCe = floor(rGc); float rGh = rHash(rCe + 31.7); // chewing-gums écrasés
    if (rGh > 0.7 && rDist < 30.0) { vec2 rCc = rCe + 0.2 + 0.6 * vec2(rHash(rCe + 1.3), rHash(rCe + 5.9)); float rD = length(rGc - rCc) * 0.62, rR = 0.013 + 0.014 * rHash(rCe + 9.1);
      float rSp = (1.0 - smoothstep(rR, rR + 0.006 + rDist * 0.0012, rD)) * rF; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(rGh > 0.93 ? 0.55 : 0.1), rSp * 0.72); rSlabR += rSp * 0.2; }
  }
  if (uRGlass > 0.0) rH += (texture2D(uDetail, rUV * 0.37 + 0.13).g - 0.5) * uRGlass * uReal;
  float rLum = dot(diffuseColor.rgb, vec3(0.3333)), rSat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
  if (uRJoint > 0.0) { // pierre de taille : assises de 45 cm à joints croisés, chaque pierre a sa nuance
    float rM = uReal * uRJoint * (1.0 - rUp) * smoothstep(0.42, 0.6, rLum) * (1.0 - smoothstep(0.1, 0.22, rSat)) * (1.0 - smoothstep(28.0, 70.0, rDist));
    if (rM > 0.003) { float rCy = vRPos.y / 0.45, rRow = floor(rCy), rCx = rUV.x / 1.15 + 0.5 * mod(rRow, 2.0);
      float rW = 0.009 + rDist * 0.0016, rJy = min(fract(rCy), 1.0 - fract(rCy)) * 0.45, rJx = min(fract(rCx), 1.0 - fract(rCx)) * 1.15;
      float rJ = max(1.0 - smoothstep(rW * 0.4, rW, rJy), 0.8 * (1.0 - smoothstep(rW * 0.4, rW, rJx)));
      float rTone = fract(sin(dot(vec2(rRow, floor(rCx)), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      diffuseColor.rgb *= 1.0 + rM * (rTone * 0.085 - rJ * 0.16); rH -= rJ * rM * 1.6; }
  }
  if (uRWear > 0.0 && rUp > 0.5 && vRPos.y < 0.12 && vRPos.y > -0.3) { // peinture routière usée par le passage
    float rWr = uReal * smoothstep(0.72, 0.86, rLum) * smoothstep(-0.12, 0.2, rGrain * 0.7 + rBlot);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.3, 0.31), rWr * 0.62); }
  #ifdef USE_MAP
  rH += dot(sampledDiffuseColor.rgb, vec3(0.3333)) * uRMapBump;
  #endif
  diffuseColor.rgb *= 1.0 + rK * (rGrain * 0.13 + rBlot * 0.36) + uReal * uRStreak * min(rStreak, 0.08) * 0.7;
  diffuseColor.rgb *= 1.0 - uReal * (rBase * (0.16 + rBlot * 0.25) + rWet * 0.42);`))
      .replace('#include <roughnessmap_fragment>', LEAF ? '#include <roughnessmap_fragment>' : `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + rK * (rBlot * 0.35 + rGrain * 0.2) + rSlabR, 0.04, 1.0);
  roughnessFactor = mix(roughnessFactor, 0.05, rWet * uReal);`)
      .replace('#include <normal_fragment_maps>', LEAF ? '#include <normal_fragment_maps>' : `#include <normal_fragment_maps>
  { // relief : la normale suit la pente du grain, des joints et de la texture (aucune lecture de texture en plus)
    float rBk = uReal * 0.012 * (1.0 - rWet) * (1.0 - smoothstep(30.0, 80.0, rDist));
    if (rBk > 0.0) { vec3 rPx = dFdx(-vViewPosition), rPy = dFdy(-vViewPosition); float rHx = dFdx(rH), rHy = dFdy(rH);
      vec3 rR1 = cross(rPy, normal), rR2 = cross(normal, rPx); float rDet = dot(rPx, rR1);
      vec3 rNb = abs(rDet) * normal - rBk * sign(rDet) * (rHx * rR1 + rHy * rR2); float rL = dot(rNb, rNb);
      if (rL > 1e-16 && rL < 1e16) normal = rNb * inversesqrt(rL); }
    if (rTilt.x != 0.0 || rTilt.y != 0.0) normal = normalize(normal + mat3(viewMatrix) * vec3(rTilt.x, 0.0, rTilt.y) * (1.0 - rWet));
  }`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|real9' + (LEAF ? 'L' : '');
  m.needsUpdate = true;
}

// applique le réalisme à tous les matériaux de la map (par nom). opts : { wet, presets }
export function applyRealism(root, opts = {}) {
  shared.uDetail.value = detailTexture();
  if (opts.wet != null) shared.uWet.value = opts.wet;
  const P = { ...PRESETS, ...(opts.presets || {}) }, seen = new Set();
  root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m)) continue; seen.add(m); const p = P[m.name]; if (p) patchMaterial(m, p); } });
  // l'horloge du vent avance toute seule : rien à appeler à chaque image
  let clock = null; root.traverse((o) => { if (!clock && o.isMesh && [].concat(o.material).some((m) => m && m.name === 'leaf')) clock = o; });
  if (clock) { const prev = clock.onBeforeRender; clock.onBeforeRender = function (...a) { shared.uTime.value = performance.now() / 1000; prev?.apply(this, a); }; }
  return shared;
}

// environnement de ciel pour les reflets (vitres, zinc, flaques) : dégradé + halo du soleil + sol sombre
export function skyEnvironment(renderer, { top = '#4f83c4', mid = '#a9c8e6', horizon = '#f3d9b8', ground = '#5a554e', sunDir = [-0.48, 0.78, 0.4], sunColor = '#fff0d0', sun = 6 } = {}) {
  const sc = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, hor: { value: new THREE.Color(horizon) }, gnd: { value: new THREE.Color(ground) }, sunDir: { value: new THREE.Vector3(...sunDir).normalize() }, sunCol: { value: new THREE.Color(sunColor) }, sunK: { value: sun } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, hor, gnd, sunDir, sunCol; uniform float sunK; varying vec3 vP;
      void main(){ vec3 d = normalize(vP); float h = max(d.y, 0.0); vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h)); c = mix(c, top, smoothstep(0.2, 0.85, h));
        float s = max(dot(d, sunDir), 0.0); c += sunCol * (pow(s, 12.0) * 0.5 + pow(s, 400.0) * sunK);
        c = mix(c, gnd, smoothstep(0.0, -0.12, d.y)); gl_FragColor = vec4(c, 1.0); }` });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0, 0.1, 200); pm.dispose(); mat.dispose();
  return rt.texture;
}
