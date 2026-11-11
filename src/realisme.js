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

let _stone = null;
// (v12) texture de matière, 512 px, tuilable. R : pores et trous de coquille de la pierre (1 = plein) ; G : marbrures ;
// B : stries (taille de la pierre, fil du bois, brossage du zinc) ; A : fissures fines (1 = aucune)
export function stoneTexture(S = 512) {
  if (_stone) return _stone;
  const pit = new Float32Array(S * S).fill(1), crk = new Float32Array(S * S).fill(1), g = fbm(S, 6, 5, 71), n = tileNoise(S, 64, 53), b = new Float32Array(S * S);
  let sd = 9001; const rnd = () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296, W = (v) => ((v % S) + S) % S;
  for (let k = 0; k < 750; k++) { const cx = rnd() * S, cy = rnd() * S, r = 0.7 + rnd() * rnd() * rnd() * 6.0, d = 0.35 + rnd() * 0.65, R = Math.ceil(r + 1);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) { const q = Math.hypot(x, y * (0.7 + rnd() * 0.0)) / r; if (q < 1.25) { const i = W(Math.round(cy + y)) * S + W(Math.round(cx + x)); pit[i] = Math.min(pit[i], 1 - d * Math.max(0, 1 - q * q * 0.8)); } } }
  for (let k = 0; k < 16; k++) { let x = rnd() * S, y = rnd() * S, a = rnd() * 6.283; const L = 50 + rnd() * 130;
    for (let i = 0; i < L; i++) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a) * 0.6 + 0.35; const f = Math.sin(i / L * Math.PI); for (const [ox, oy, w] of [[0, 0, 1], [1, 0, 0.45], [0, 1, 0.45]]) { const j = W(Math.round(y + oy)) * S + W(Math.round(x + ox)); crk[j] = Math.min(crk[j], 1 - 0.85 * f * w); } } }
  for (let y = 0; y < S; y++) { let acc = 0; const K = 22; for (let x = -K; x < K; x++) acc += n[y * S + W(x)]; for (let x = 0; x < S; x++) { b[y * S + x] = acc / (2 * K); acc += n[y * S + W(x + K)] - n[y * S + W(x - K)]; } }
  const data = new Uint8Array(S * S * 4), st = (v, k) => Math.max(0, Math.min(255, Math.round((0.5 + (v - 0.5) * k) * 255)));
  for (let i = 0; i < S * S; i++) { data[i * 4] = Math.round(pit[i] * 255); data[i * 4 + 1] = st(g[i], 2.6); data[i * 4 + 2] = st(b[i], 3.4); data[i * 4 + 3] = Math.round(crk[i] * 255); }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return (_stone = t);
}

// réglages par nom de matériau : amt = force du grain et des taches, streak = coulures verticales, wet = flaques (sols), base = encrassement en pied de mur
// (v8) bump = relief du grain (m), joint = appareil de pierre de taille sur les murs clairs, wear = peinture routière usée, mapBump = relief tiré de la texture (pavés, joints), leaf = feuillage (découpe, vent)
const PRESETS = {
  // (v12) stone = pierre de taille texturée (pores, marbrures, fissures, patine), wood = fil du bois peint, zinc = feuilles de zinc à joints debout
  matte: { amt: 1.0, streak: 0.4, base: 1.0, bump: 0.5, joint: 1, wear: 1, stone: 1 }, satin: { amt: 0.45, streak: 0.5, base: 0.5, bump: 0.12, wood: 1 }, metal: { amt: 0.7, streak: 1.0, base: 0, bump: 0.1, zinc: 1 },
  asphalt: { amt: 0.5, ao: 1, wet: 1, bump: 0.9, mapBump: 0.6 }, cobble: { amt: 0.5, ao: 1, wet: 0.7, bump: 0.4, mapBump: 2.4 },
  // (v9) slab = dalles de granit : nuance, poli et légère pente propres à chaque dalle, chewing-gums ; glass = vitres anciennes qui ondulent
  sidewalk: { amt: 0.45, ao: 1, wet: 0.7, bump: 0.5, mapBump: 1.6, slab: 1 }, curb: { amt: 0.4, ao: 1, wet: 0.2, bump: 0.5, mapBump: 1.2 }, gutter: { amt: 0.5, ao: 1, wet: 1.6, bump: 0.4, mapBump: 2.2 },
  glass: { amt: 0.2, glass: 1.2 }, glassLit: { amt: 0.2, glass: 1.2 }, ground: { amt: 0.6, ao: 1, bump: 0.6 },
  carrelage: { amt: 0.35, streak: 0.6, mapBump: 0.8 }, carrelage_voute: { amt: 0.5, streak: 0.8, mapBump: 0.8 }, granito: { amt: 0.4, mapBump: 0.5 }, horizon: null,
  leaf: { amt: 0.9, leaf: 1 },
  // (v11) water = eau vivante : rides qui se déplacent, reflets du ciel plus francs en vue rasante
  eau: { amt: 0.15, water: 1 }, eauClaire: { amt: 0.1, water: 0.7 },
};
const shared = { uAO: { value: null }, uAOBox: { value: new THREE.Vector4(0, 0, 0, 0) }, uAOFlip: { value: 0 }, uDetail: { value: null }, uStone: { value: null }, uWet: { value: 0.4 }, uReal: { value: 1 }, uTime: { value: 0 }, uWind: { value: 1 } };
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
    sh.uniforms.uRBump = { value: P.bump ?? 0 }; sh.uniforms.uRJoint = { value: P.joint ?? 0 }; sh.uniforms.uRWear = { value: P.wear ?? 0 }; sh.uniforms.uRMapBump = { value: P.mapBump ?? 0 }; sh.uniforms.uRSlab = { value: P.slab ?? 0 }; sh.uniforms.uRGlass = { value: P.glass ?? 0 }; sh.uniforms.uRWater = { value: P.water ?? 0 }; sh.uniforms.uRAO = { value: P.ao ?? 0 }; sh.uniforms.uStone = shared.uStone; sh.uniforms.uRStone = { value: P.stone ?? 0 }; sh.uniforms.uRWood = { value: P.wood ?? 0 }; sh.uniforms.uRZinc = { value: P.zinc ?? 0 }; sh.uniforms.uAO = shared.uAO; sh.uniforms.uAOBox = shared.uAOBox; sh.uniforms.uAOFlip = shared.uAOFlip;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRPos; varying vec3 vRNrm; uniform float uTime, uWind, uReal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vRPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vRNrm = normalize(mat3(modelMatrix) * objectNormal);` + (LEAF ? `
  { float rS = uReal * uWind * smoothstep(2.2, 6.5, vRPos.y) * 0.07; float rT = uTime * 1.25 + vRPos.x * 0.37 + vRPos.z * 0.29;
    transformed += inverse(mat3(modelMatrix)) * rS * vec3(sin(rT) + 0.4 * sin(rT * 2.7 + vRPos.y), 0.35 * sin(rT * 1.9 + vRPos.x), cos(rT * 0.83) + 0.4 * sin(rT * 3.1 + vRPos.z)); }` : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRPos; varying vec3 vRNrm; uniform sampler2D uDetail; uniform float uWet, uReal, uRAmt, uRStreak, uRWet, uRBase, uRBump, uRJoint, uRWear, uRMapBump, uRSlab, uRGlass, uRWater, uTime, uRAO, uAOFlip, uRStone, uRWood, uRZinc; uniform sampler2D uAO, uStone; uniform vec4 uAOBox;\nfloat rHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 rN = abs(vRNrm); float rUp = step(0.6, rN.y); float rDist = length(vViewPosition);
  vec2 rUV = rUp > 0.5 ? vRPos.xz : (rN.x > rN.z ? vRPos.zy : vRPos.xy);
  float rGrain = texture2D(uDetail, rUV * 0.55).r - 0.5;
  float rBlot = texture2D(uDetail, rUV * 0.047 + 0.31).g - 0.5;
  float rH = rGrain * uRBump;` + (LEAF ? `
  { // feuillage : découpe en feuilles près de la caméra, dégradé de teinte, envers plus sombre
    float rCut = texture2D(uDetail, rUV * 0.46 + vRPos.y * 0.17).b + rGrain * 0.4;
    float rNear = uReal * (1.0 - smoothstep(22.0, 48.0, rDist));
    float rEdge = 1.0 - abs(dot(normalize(vRNrm), normalize(cameraPosition - vRPos))); // (v11) la découpe ronge surtout la silhouette : contour déchiqueté, cœur plein
    if (rCut < 0.62 * rEdge * rEdge * rNear * smoothstep(1.7, 3.2, vRPos.y)) discard;
    diffuseColor.rgb *= mix(1.0, mix(0.7, 1.1, smoothstep(0.22, 0.6, rCut)), uReal); // creux entre les touffes
    diffuseColor.rgb *= 1.0 - uReal * 0.22 * (1.0 - rEdge) * smoothstep(0.1, -0.5, normalize(vRNrm).y); // dessous des masses plus sombre
    diffuseColor.rgb *= 1.0 + uReal * (rBlot * 0.55 + rGrain * 0.3 + (rCut - 0.5) * 0.3);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.1, 0.62), uReal * smoothstep(0.05, 0.3, rBlot) * 0.5);
    if (!gl_FrontFacing) diffuseColor.rgb *= 0.8;
  }` : `
  float rStreak = (1.0 - rUp) * (texture2D(uDetail, vec2(rUV.x * 0.8, rUV.y * 0.03)).b - 0.5) * smoothstep(-0.02, 0.3, rBlot);
  float rBase = (1.0 - rUp) * uRBase * (1.0 - smoothstep(0.0, 1.4, vRPos.y)) * step(-0.3, vRPos.y);
  float rWet = uRWet * uWet * rUp * smoothstep(0.16, 0.34, rBlot + rGrain * 0.12);
  float rK = uReal * uRAmt;
  float rSlabR = 0.0, rZr = 0.0; vec2 rTilt = vec2(0.0);
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
  if (uRStone > 0.0) { // (v12) pierre calcaire : pores, marbrures, fissures, grandes plages de patine
    float rSm = uReal * uRStone * smoothstep(0.38, 0.58, rLum) * (1.0 - smoothstep(0.12, 0.26, rSat)) * (1.0 - smoothstep(40.0, 90.0, rDist));
    if (rSm > 0.003) { vec4 rS1 = texture2D(uStone, rUV * 0.62); float rS2 = texture2D(uStone, rUV * 0.137 + 0.37).g, rPit = 1.0 - rS1.r, rCrk = 1.0 - rS1.a;
      diffuseColor.rgb *= 1.0 + rSm * ((rS1.g - 0.5) * 0.2 + (rS1.b - 0.5) * 0.05 - rPit * 0.3 - rCrk * 0.3);
      diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.9, 0.89, 0.87), vec3(1.05, 1.02, 0.95), smoothstep(0.3, 0.7, rS2)), rSm * 0.8);
      rH -= rSm * (rPit * 2.2 + rCrk * 1.5 - (rS1.b - 0.5) * 0.15); } }
  if (uRWood > 0.0) { // (v12) bois peint : fil vertical, peinture inégale
    float rWm = uReal * uRWood * (1.0 - smoothstep(25.0, 60.0, rDist)); vec4 rS1 = texture2D(uStone, rUV.yx * vec2(0.35, 2.4));
    diffuseColor.rgb *= 1.0 + rWm * ((rS1.b - 0.5) * 0.1 + (rS1.g - 0.5) * 0.1); rH += rWm * (rS1.b - 0.5) * 0.25; }
  if (uRZinc > 0.0) { // (v12) toits : feuilles de zinc de 65 cm à joints debout, recouvrements, patine et coulures d'oxyde
    float rZm = uReal * uRZinc * smoothstep(0.02, 0.06, diffuseColor.b - diffuseColor.r) * smoothstep(0.25, 0.4, rLum) * (1.0 - smoothstep(60.0, 140.0, rDist));
    if (rZm > 0.003) { vec3 rNn = normalize(vRNrm), rHd = abs(rNn.y) > 0.985 ? vec3(1.0, 0.0, 0.0) : normalize(cross(rNn, vec3(0.0, 1.0, 0.0))), rSd = cross(rHd, rNn);
      float rU = dot(vRPos, rHd) / 0.65, rV = dot(vRPos, rSd), rId = floor(rU), rFu = min(fract(rU), 1.0 - fract(rU)) * 0.65;
      float rVv = rV / 2.2 + rHash(vec2(rId, 3.7)), rFv = min(fract(rVv), 1.0 - fract(rVv)) * 2.2, rSw = 0.012 + rDist * 0.0012;
      float rSeam = 1.0 - smoothstep(rSw, rSw * 2.2, rFu), rLap = 1.0 - smoothstep(rSw * 0.5, rSw * 1.4, rFv), rPt = rHash(vec2(rId, floor(rVv))) - 0.5;
      vec4 rS1 = texture2D(uStone, vec2(rU * 0.65, rV) * 0.4); float rOx = smoothstep(0.55, 0.8, texture2D(uStone, vec2(rV * 0.12, rU * 0.6)).b);
      diffuseColor.rgb *= 1.0 + rZm * (rPt * 0.16 + (rS1.g - 0.5) * 0.3 - rLap * 0.25 + rSeam * 0.12);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.82, 0.82) * min(1.0, rLum * 1.6), rZm * rOx * 0.3);
      rH += rZm * (rSeam * 3.0 - rLap); rZr = rZm * (rPt * 0.3 + (rS1.g - 0.5) * 0.5); } }
  if (uRJoint > 0.0) { // pierre de taille : assises de 45 cm à joints croisés, chaque pierre a sa nuance
    float rM = uReal * uRJoint * (1.0 - rUp) * smoothstep(0.42, 0.6, rLum) * (1.0 - smoothstep(0.1, 0.22, rSat)) * (1.0 - smoothstep(28.0, 70.0, rDist));
    if (rM > 0.003) { float rCy = vRPos.y / 0.45, rRow = floor(rCy), rCx = rUV.x / 1.15 + 0.5 * mod(rRow, 2.0);
      float rW = 0.009 + rDist * 0.0016, rJy = min(fract(rCy), 1.0 - fract(rCy)) * 0.45, rJx = min(fract(rCx), 1.0 - fract(rCx)) * 1.15;
      float rJ = max(1.0 - smoothstep(rW * 0.4, rW, rJy), 0.8 * (1.0 - smoothstep(rW * 0.4, rW, rJx)));
      float rTone = fract(sin(dot(vec2(rRow, floor(rCx)), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      diffuseColor.rgb *= (1.0 + rM * (rTone * 0.12 - rJ * 0.22)) * mix(vec3(1.0), vec3(1.0 + rTone * 0.05, 1.0, 1.0 - rTone * 0.07), rM); rH -= rJ * rM * 1.6; }
  }
  if (uRWear > 0.0 && rUp > 0.5 && vRPos.y < 0.12 && vRPos.y > -0.3) { // peinture routière usée par le passage
    float rWr = uReal * smoothstep(0.72, 0.86, rLum) * smoothstep(-0.12, 0.2, rGrain * 0.7 + rBlot);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.3, 0.31), rWr * 0.62); }
  #ifdef USE_MAP
  rH += dot(sampledDiffuseColor.rgb, vec3(0.3333)) * uRMapBump;
  #endif
  diffuseColor.rgb *= 1.0 + rK * (rGrain * 0.13 + rBlot * 0.36) + uReal * uRStreak * min(rStreak, 0.08) * 0.7;
  diffuseColor.rgb *= 1.0 - uReal * (rBase * (0.16 + rBlot * 0.25) + rWet * 0.42);
  if (uRAO > 0.0 && uAOBox.z > 0.0 && rUp > 0.5 && vRPos.y > -1.5) { // (v11) ombre de contact au pied des murs, des arbres et du mobilier
    vec2 rA = (vRPos.xz - uAOBox.xy) * uAOBox.zw; float rIn = step(0.0, rA.x) * step(rA.x, 1.0) * step(0.0, rA.y) * step(rA.y, 1.0); rA.y = 1.0 - rA.y; // même repère dans la visionneuse et dans le .glb (l'export retourne l'image avec flipY)
    diffuseColor.rgb *= 1.0 - uReal * uRAO * 0.52 * rIn * texture2D(uAO, rA).r; }`))
      .replace('#include <roughnessmap_fragment>', LEAF ? '#include <roughnessmap_fragment>' : `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + rK * (rBlot * 0.35 + rGrain * 0.2) + rSlabR + rZr, 0.04, 1.0);
  roughnessFactor = mix(roughnessFactor, 0.05, rWet * uReal);
  if (uRWater > 0.0) roughnessFactor = mix(roughnessFactor, 0.06, uReal);`)
      .replace('#include <normal_fragment_maps>', LEAF ? '#include <normal_fragment_maps>' : `#include <normal_fragment_maps>
  { // relief : la normale suit la pente du grain, des joints et de la texture (aucune lecture de texture en plus)
    float rBk = uReal * 0.012 * (1.0 - rWet) * (1.0 - smoothstep(30.0, 80.0, rDist));
    if (rBk > 0.0) { vec3 rPx = dFdx(-vViewPosition), rPy = dFdy(-vViewPosition); float rHx = dFdx(rH), rHy = dFdy(rH);
      vec3 rR1 = cross(rPy, normal), rR2 = cross(normal, rPx); float rDet = dot(rPx, rR1);
      vec3 rNb = abs(rDet) * normal - rBk * sign(rDet) * (rHx * rR1 + rHy * rR2); float rL = dot(rNb, rNb);
      if (rL > 1e-16 && rL < 1e16) normal = rNb * inversesqrt(rL); }
    if (rTilt.x != 0.0 || rTilt.y != 0.0) normal = normalize(normal + mat3(viewMatrix) * vec3(rTilt.x, 0.0, rTilt.y) * (1.0 - rWet));
    if (uRWater > 0.0 && rUp > 0.5) { // rides : deux nappes de bruit qui glissent en sens croisés, plus fines près du bord de l'œil
      vec2 rW1 = texture2D(uDetail, vRPos.xz * 0.11 + uTime * vec2(0.013, 0.021)).rg - 0.5, rW2 = texture2D(uDetail, vRPos.zx * 0.31 - uTime * vec2(0.034, 0.019)).gb - 0.5;
      vec2 rWv = (rW1 * 1.3 + rW2 * 0.8) * uRWater * uReal * (0.5 + 0.5 / (1.0 + rDist * 0.03));
      normal = normalize(normal + mat3(viewMatrix) * vec3(rWv.x, 0.0, rWv.y)); }
  }`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|real12' + (LEAF ? 'L' : '');
  m.needsUpdate = true;
}

// applique le réalisme à tous les matériaux de la map (par nom). opts : { wet, presets }
export function applyRealism(root, opts = {}) {
  shared.uDetail.value = detailTexture(); shared.uStone.value = stoneTexture();
  if (opts.wet != null) shared.uWet.value = opts.wet;
  const P = { ...PRESETS, ...(opts.presets || {}) }, seen = new Set();
  // (v11) carte d'ombres de contact livrée dans le .glb : matériau « aoSol_x0_z0_x1_z1 » posé sur un triangle caché
  root.traverse((o) => { const m = o.isMesh && [].concat(o.material)[0]; if (!m || !/^aoSol_/.test(m.name || '') || !m.map) return; const b = m.name.split('_').slice(1).map(Number); if (b.length < 4 || b.some(isNaN)) return;
    o.visible = false; m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping; shared.uAO.value = m.map; shared.uAOBox.value.set(b[0], b[1], 1 / (b[2] - b[0]), 1 / (b[3] - b[1])); shared.uAOFlip.value = m.map.flipY ? 1 : 0; });
  root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m)) continue; seen.add(m); const p = P[m.name]; if (p) patchMaterial(m, p); } });
  // l'horloge du vent avance toute seule : rien à appeler à chaque image
  root.traverse((o) => { if (!o.isMesh || !/^(leaf|eau|eauClaire)$/.test([].concat(o.material)[0]?.name || '')) return; const prev = o.onBeforeRender; o.onBeforeRender = function (...a) { shared.uTime.value = performance.now() / 1000; prev?.apply(this, a); }; });
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
