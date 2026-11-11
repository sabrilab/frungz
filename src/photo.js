// Passe photoréaliste : ce qui rapproche l'image d'une photo, sans toucher aux modèles.
// - skyReflections : les reflets (vitres, carrosseries, flaques, métal) viennent du vrai ciel du jeu, nuages compris.
// - enhanceMap / enhanceCar : matières qui réfléchissent comme en vrai (vitres, zinc, peinture vernie des voitures, phares).
// - PhotoPass (qualité haute) : occlusion ambiante à l'écran (coins, pieds de murs, dessous des voitures, plis des persos,
//   à petite et grande échelle) et perspective atmosphérique (le lointain se bleuit et se voile, plus clair côté soleil).
//   Calculée à demi-résolution puis recomposée avec un flou qui respecte les bords. Coupée seule quand ça rame.
// Garde-fous (cause connue des rectangles noirs) : sorties bornées, NaN neutralisés, profondeur invalide ignorée.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ---------- reflets : environnement fabriqué à partir du ciel affiché ----------
export function skyReflections(renderer, sky, { ground = '#4d4a45' } = {}) {
  const sc = new THREE.Scene();
  const s = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), sky.material); sc.add(s);
  // sol : la moitié basse de l'environnement est la ville (pierre, bitume), pas le ciel
  const g = new THREE.Mesh(new THREE.SphereGeometry(45, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: ground, side: THREE.BackSide }));
  sc.add(g);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0, 0.1, 200); pm.dispose(); g.geometry.dispose(); g.material.dispose(); s.geometry.dispose();
  return rt.texture;
}

// ---------- matières ----------
const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
// map : vitres et vitrines qui reflètent le ciel et les façades d'en face, zinc et ferronnerie un peu plus brillants
export function enhanceMap(root, aniso = 8) {
  const seen = new Set(), tex = new Set();
  root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m) || !m.isMeshStandardMaterial) continue; seen.add(m);
    for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) if (m[k] && !tex.has(m[k])) { tex.add(m[k]); m[k].anisotropy = Math.min(aniso, 16); m[k].needsUpdate = true; }
    const n = m.name || '';
    if (n === 'glass') { m.roughness = 0.04; m.metalness = 0.35; m.envMapIntensity = 2.2; }
    else if (n === 'vitre') { m.roughness = 0.03; m.envMapIntensity = 2.0; }
    else if (n === 'glassLit') { m.roughness = 0.06; m.envMapIntensity = 1.4; }
    else if (n === 'metal') { m.envMapIntensity = 1.35; }
    else if (n === 'lamp') { m.envMapIntensity = 1.5; }
  } });
}
// voitures : peinture vernie (couche de vernis brillante sur une teinte un peu métallisée), vitres teintées miroir,
// jantes et chromes métalliques, pneus et plastiques mats, phares qui brillent légèrement
const _carCache = new Map();
function carMaterial(m) {
  if (_carCache.has(m)) return _carCache.get(m);
  const n = (m.name || '').toLowerCase(), c = m.color?.clone() || new THREE.Color(1, 1, 1), L = lum(c);
  const base = { name: m.name, color: c, map: m.map || null, vertexColors: m.vertexColors, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, normalMap: m.normalMap || null, emissive: m.emissive?.clone(), emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1 };
  let out;
  if (/window|glass|vitre/.test(n)) out = new THREE.MeshPhysicalMaterial({ ...base, color: new THREE.Color(0.012, 0.014, 0.018), roughness: 0.03, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
  else if (/light|phare|feu/.test(n)) out = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, emissive: c.clone().multiplyScalar(0.35), emissiveIntensity: 1 });
  else if (/black|noir|tire|tyre|pneu|rubber/.test(n) || L < 0.02) out = new THREE.MeshStandardMaterial({ ...base, roughness: 0.82, metalness: 0 });
  else if (/grey|gray|gris|chrome|metal|rim|jante/.test(n)) out = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.28, metalness: 0.85, envMapIntensity: 1.3 });
  else out = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.42, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25 });
  _carCache.set(m, out); return out;
}
export function enhanceCar(root) {
  root.traverse((o) => { if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => (m?.isMeshStandardMaterial ? carMaterial(m) : m)) : o.material.isMeshStandardMaterial ? carMaterial(o.material) : o.material; });
}

// ---------- occlusion ambiante + perspective atmosphérique ----------
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const AO_N = 12;
const aoFrag = `
uniform sampler2D tDepth; uniform mat4 uProjInv; uniform float uProjY, uAspect, uRadius, uFar; uniform vec2 uTexel;
varying vec2 vUv;
vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
void main(){
  float d = texture2D(tDepth, vUv).x;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = vpos(vUv); float z = -P.z;
  if (!(z > 0.0 && z < uFar)) { gl_FragColor = vec4(1.0); return; }
  // normale reconstruite : côté du voisin le plus proche en profondeur (pas de bavure sur les silhouettes)
  vec3 r = vpos(vUv + vec2(uTexel.x, 0.0)) - P, l = P - vpos(vUv - vec2(uTexel.x, 0.0));
  vec3 u = vpos(vUv + vec2(0.0, uTexel.y)) - P, b = P - vpos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(r.z) < abs(l.z) ? r : l, dy = abs(u.z) < abs(b.z) ? u : b;
  vec3 N = normalize(cross(dx, dy)); if (dot(N, P) > 0.0) N = -N;
  if (!(N.x == N.x)) { gl_FragColor = vec4(1.0); return; }
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float ao = 0.0, wsum = 0.0;
  for (int i = 0; i < ${AO_N}; i++) {
    float f = (float(i) + jit) / float(${AO_N});
    // rayons de 15 cm à uRadius : petits recoins et grandes masses (pied des façades, dessous des auvents)
    float R = mix(0.15, uRadius, f * f);
    float sr = min(R * uProjY / z * 0.5, 0.18);
    float a = float(i) * 2.39996 + jit * 6.2832;
    vec2 uv = vUv + vec2(cos(a) / uAspect, sin(a)) * sr;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    vec3 v = vpos(uv) - P; float vv = dot(v, v), vn = dot(v, N);
    float fall = 1.0 - smoothstep(R * R, R * R * 4.0, vv);
    // angle au-dessus du plan tangent, avec un seuil : un mur plat ou un sol plat ne s'occultent jamais eux-mêmes (pas de voile gris)
    float cosA = vn * inversesqrt(vv + 1e-6);
    ao += max(0.0, cosA - 0.3) / 0.7 * fall; wsum += 1.0;
  }
  ao = wsum > 0.0 ? 1.0 - ao / wsum * 1.5 : 1.0;
  ao = clamp(ao, 0.35, 1.0); ao = mix(ao, 1.0, smoothstep(uFar * 0.6, uFar, z));
  gl_FragColor = vec4(ao, 1.0, 1.0, 1.0);
}`;
const compFrag = `
uniform sampler2D tDiffuse, tDepth, tAO; uniform mat4 uProjInv, uCamWorld; uniform vec2 uAOTexel;
uniform vec3 uHaze, uSunCol, uSunDir; uniform float uDebug, uAOk, uAerial, uDen, uNear, uFar;
varying vec2 vUv;
float lin(float d){ return (uNear * uFar) / max(uFar - d * (uFar - uNear), 1e-4); }
vec3 safe(vec3 c){
  if (!(c.r >= 0.0 && c.r < 1e4)) c.r = c.r > 0.0 ? 16.0 : 0.0;
  if (!(c.g >= 0.0 && c.g < 1e4)) c.g = c.g > 0.0 ? 16.0 : 0.0;
  if (!(c.b >= 0.0 && c.b < 1e4)) c.b = c.b > 0.0 ? 16.0 : 0.0;
  return min(c, vec3(16.0));
}
void main(){
  vec3 c = safe(texture2D(tDiffuse, vUv).rgb);
  float d = texture2D(tDepth, vUv).x;
  if (d >= 0.99999) { gl_FragColor = vec4(c, 1.0); return; } // ciel
  float z = lin(d);
  // occlusion : 9 lectures de la carte à demi-résolution, pondérées par l'écart de profondeur (bords nets)
  if (uAOk > 0.0) {
    float s = 0.0, w = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j)) * uAOTexel * 0.75; float zt = lin(texture2D(tDepth, vUv + o).x);
      float wt = exp(-abs(zt - z) / (z * 0.015 + 0.02)) * (i == 0 && j == 0 ? 2.0 : 1.0);
      s += texture2D(tAO, vUv + o).r * wt; w += wt;
    }
    float ao = w > 0.0 ? s / w : 1.0; ao = clamp(ao, 0.0, 1.0);
    // l'occlusion pèse surtout sur la lumière ambiante : moins sur les zones très éclairées par le soleil
    float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c *= mix(1.0, ao, uAOk * mix(1.0, 0.55, smoothstep(0.6, 2.5, L)));
    if (uDebug > 0.5) { gl_FragColor = vec4(vec3(ao), 1.0); return; }
  }
  // perspective atmosphérique : voile bleuté avec la distance, plus dense en bas, réchauffé du côté du soleil
  if (uAerial > 0.0) {
    vec4 p = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec3 P = p.xyz / p.w;
    vec3 wd = normalize(mat3(uCamWorld) * P); float wy = (uCamWorld * vec4(P, 1.0)).y;
    float k = (1.0 - exp(-max(z - 80.0, 0.0) * uDen * exp(-max(wy, 0.0) * 0.012))) * uAerial;
    vec3 hz = uHaze + uSunCol * pow(max(dot(wd, uSunDir), 0.0), 6.0) * 0.5;
    c = mix(c, hz, clamp(k, 0.0, 0.85));
  }
  gl_FragColor = vec4(safe(c), 1.0);
}`;

export class PhotoPass extends Pass {
  constructor(camera, { sky, sun, scene } = {}) {
    super();
    this.camera = camera; this.sky = sky; this.sun = sun; this.scene = scene; this.needsSwap = false;
    // image recomposée dans une cible à part : le passage cinéma la lit avec la profondeur de la cible d'origine
    // (écrire dans l'autre cible du composer, dont la profondeur est lue ensuite, formerait une boucle de rétroaction)
    this.outRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, type: THREE.HalfFloatType }); this.colorOut = null;
    this.aoRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.aoMat = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProjY: { value: 1 }, uAspect: { value: 1 }, uRadius: { value: 0.9 }, uFar: { value: 160 }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: VS, fragmentShader: aoFrag, depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tAO: { value: this.aoRT.texture }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uAOTexel: { value: new THREE.Vector2() },
      uHaze: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uDebug: { value: 0 }, uAOk: { value: 1.0 }, uAerial: { value: 1 }, uDen: { value: 0.0007 }, uNear: { value: 0.05 }, uFar: { value: 1000 } },
      vertexShader: VS, fragmentShader: compFrag, depthTest: false, depthWrite: false });
    this.aoQ = new FullScreenQuad(this.aoMat); this.compQ = new FullScreenQuad(this.compMat);
    this.enabled2 = true; // choix du joueur
    this.auto = 1; // coupé automatiquement quand ça rame
    this.ao = 1.0; this.aerial = 1;
  }
  setSize(w, h) { this.outRT.setSize(w, h); const W = Math.max(1, Math.round(w / 2)), H = Math.max(1, Math.round(h / 2)); this.aoRT.setSize(W, H); this.aoMat.uniforms.uTexel.value.set(1 / w, 1 / h); this.compMat.uniforms.uAOTexel.value.set(1 / W, 1 / H); }
  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture; this.colorOut = null;
    const on = this.enabled2 && this.auto > 0 && !!depth;
    if (!on) return; // rien à faire : l'image passe telle quelle au passage suivant, sans copie
    const cam = this.camera, a = this.aoMat.uniforms, c = this.compMat.uniforms;
    const night = this.sky?.material.uniforms.night?.value > 0.5;
    a.tDepth.value = depth; a.uProjInv.value.copy(cam.projectionMatrixInverse); a.uProjY.value = cam.projectionMatrix.elements[5]; a.uAspect.value = cam.aspect;
    c.tDiffuse.value = readBuffer.texture; c.tDepth.value = depth; c.uProjInv.value.copy(cam.projectionMatrixInverse); c.uCamWorld.value.copy(cam.matrixWorld); c.uNear.value = cam.near; c.uFar.value = cam.far;
    c.uAOk.value = this.ao * (night ? 0.7 : 1); c.uAerial.value = this.aerial * (night ? 0.5 : 1);
    // voile = couleur de l'horizon du ciel affiché (suit le jour, la nuit), éclairci côté soleil
    const su = this.sky?.material.uniforms; if (su) { c.uHaze.value.copy(su.hor.value).multiplyScalar(night ? 0.6 : 1.0); c.uSunDir.value.copy(su.sunDir.value); }
    c.uSunCol.value.copy(this.sun?.color || c.uSunCol.value).multiplyScalar(night ? 0.0 : 0.6);
    if (c.uAOk.value > 0.001) { renderer.setRenderTarget(this.aoRT); this.aoQ.render(renderer); }
    renderer.setRenderTarget(this.outRT); this.compQ.render(renderer); this.colorOut = this.outRT.texture;
  }
  dispose() { this.outRT.dispose(); this.aoRT.dispose(); this.aoMat.dispose(); this.compMat.dispose(); this.aoQ.dispose(); this.compQ.dispose(); }
}

// ---------- netteté : accentuation adaptative au contraste (façon AMD CAS) ----------
// Dernier passage, après l'anticrénelage : rend le piqué des textures (pierre, pavés, tissus) sans créer de halos,
// car la force baisse là où le contraste local est déjà fort. uSharp : 0 = rien, 1 = maximum.
export const SharpenShader = {
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uSharp: { value: 0.6 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uSharp; varying vec2 vUv;
    void main(){
      vec3 a = texture2D(tDiffuse, vUv + vec2(0.0, -uTexel.y)).rgb, b = texture2D(tDiffuse, vUv + vec2(-uTexel.x, 0.0)).rgb, c = texture2D(tDiffuse, vUv).rgb;
      vec3 d = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb, e = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
      vec3 mn = min(c, min(min(a, b), min(d, e))), mx = max(c, max(max(a, b), max(d, e)));
      vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
      vec3 w = -amp / mix(8.0, 4.6, clamp(uSharp, 0.0, 1.0));
      vec3 r = (c + (a + b + d + e) * w) / (1.0 + 4.0 * w);
      gl_FragColor = vec4(clamp(r, 0.0, 1.0), 1.0);
    }`,
};
