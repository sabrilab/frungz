// Réalisme des matières (v7) : module autonome (three seulement), à appeler une fois après le chargement de la map.
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
const PRESETS = {
  matte: { amt: 1.0, streak: 1.0, base: 1.0 }, satin: { amt: 0.45, streak: 0.5, base: 0.5 }, metal: { amt: 0.7, streak: 1.0, base: 0 },
  asphalt: { amt: 0.5, wet: 1 }, cobble: { amt: 0.5, wet: 0.7 }, sidewalk: { amt: 0.6, wet: 0.6 }, ground: { amt: 0.6 },
  carrelage: { amt: 0.35, streak: 0.6 }, carrelage_voute: { amt: 0.5, streak: 0.8 }, granito: { amt: 0.4 }, horizon: null, leaf: null,
};
const shared = { uDetail: { value: null }, uWet: { value: 0.4 }, uReal: { value: 1 } };
export const realismUniforms = shared; // uWet (0 = sec, 1 = après la pluie) et uReal (0 = coupé) se règlent en direct

export function patchMaterial(m, P) {
  if (!m || m.userData.__real || !m.isMeshStandardMaterial) return;
  m.userData.__real = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uDetail = shared.uDetail; sh.uniforms.uWet = shared.uWet; sh.uniforms.uReal = shared.uReal;
    sh.uniforms.uRAmt = { value: P.amt ?? 0.5 }; sh.uniforms.uRStreak = { value: P.streak ?? 0 }; sh.uniforms.uRWet = { value: P.wet ?? 0 }; sh.uniforms.uRBase = { value: P.base ?? 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRPos; varying vec3 vRNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vRNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRPos; varying vec3 vRNrm; uniform sampler2D uDetail; uniform float uWet, uReal, uRAmt, uRStreak, uRWet, uRBase;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 rN = abs(vRNrm); float rUp = step(0.6, rN.y);
  vec2 rUV = rUp > 0.5 ? vRPos.xz : (rN.x > rN.z ? vRPos.zy : vRPos.xy);
  float rGrain = texture2D(uDetail, rUV * 0.55).r - 0.5;
  float rBlot = texture2D(uDetail, rUV * 0.047 + 0.31).g - 0.5;
  float rStreak = (1.0 - rUp) * (texture2D(uDetail, vec2(rUV.x * 0.8, rUV.y * 0.03)).b - 0.5) * smoothstep(-0.02, 0.3, rBlot);
  float rBase = (1.0 - rUp) * uRBase * (1.0 - smoothstep(0.0, 1.4, vRPos.y)) * step(-0.3, vRPos.y);
  float rWet = uRWet * uWet * rUp * smoothstep(0.16, 0.34, rBlot + rGrain * 0.12);
  float rK = uReal * uRAmt;
  diffuseColor.rgb *= 1.0 + rK * (rGrain * 0.13 + rBlot * 0.36) + uReal * uRStreak * min(rStreak, 0.08) * 0.7;
  diffuseColor.rgb *= 1.0 - uReal * (rBase * (0.16 + rBlot * 0.25) + rWet * 0.42);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + rK * (rBlot * 0.35 + rGrain * 0.2), 0.04, 1.0);
  roughnessFactor = mix(roughnessFactor, 0.05, rWet * uReal);`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|real';
  m.needsUpdate = true;
}

// applique le réalisme à tous les matériaux de la map (par nom). opts : { wet, presets }
export function applyRealism(root, opts = {}) {
  shared.uDetail.value = detailTexture();
  if (opts.wet != null) shared.uWet.value = opts.wet;
  const P = { ...PRESETS, ...(opts.presets || {}) }, seen = new Set();
  root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m)) continue; seen.add(m); const p = P[m.name]; if (p) patchMaterial(m, p); } });
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
