// Cosmétiques en 3D : camouflages d'arme (motif calculé au pixel, pas de texture), couleur des traçantes, effets d'élimination.
// Catalogue : src/boutique-data.mjs. Rien ici ne change le gameplay.
import * as THREE from 'three';
import { CAMOS, TRACANTES, EFFETS } from './boutique-data.mjs';

// temps partagé par les motifs animés (néon, lave, matière noire, diamant)
const CTIME = { value: 0 };
let clockOn = false;
function startClock() { if (clockOn) return; clockOn = true; const t0 = performance.now(); const f = () => { CTIME.value = (performance.now() - t0) / 1000; requestAnimationFrame(f); }; requestAnimationFrame(f); }

const TYPES = { uni: 0, taches: 1, pixels: 2, rayures: 3, carbone: 4, bandes: 5, damas: 6, neon: 7, lave: 8, cosmos: 9, diamant: 10 };
const NOISE = `
float cHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cHash(i), cHash(i + vec3(1,0,0)), f.x), mix(cHash(i + vec3(0,1,0)), cHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cHash(i + vec3(0,0,1)), cHash(i + vec3(1,0,1)), f.x), mix(cHash(i + vec3(0,1,1)), cHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float cFbm(vec3 p) { return cNoise(p) * 0.55 + cNoise(p * 2.03 + 1.7) * 0.3 + cNoise(p * 4.1 + 3.3) * 0.15; }`;
// motif : renvoie la couleur (cCol), la part de métal (cMet), la lumière émise (cEm)
const PATTERN = `
vec3 cP = vCamP * cScale; float cT = cTime; vec3 cCol = cA;
#if CAMO_T == 0
  cCol = mix(cA, cC, cNoise(vCamP * 25.0) * 0.35);
#elif CAMO_T == 1
  float n1 = cFbm(cP), n2 = cFbm(cP * 1.3 + 7.1), n3 = cFbm(cP * 0.8 + 13.7);
  cCol = cA; cCol = mix(cCol, cB, step(0.52, n1)); cCol = mix(cCol, cC, step(0.58, n2)); cCol = mix(cCol, cD, step(0.62, n3));
#elif CAMO_T == 2
  vec3 q = floor(cP); float n1 = cFbm(q * 0.11), n2 = cFbm(q * 0.13 + 5.0), n3 = cFbm(q * 0.09 + 9.0);
  cCol = cA; cCol = mix(cCol, cB, step(0.5, n1)); cCol = mix(cCol, cC, step(0.58, n2)); cCol = mix(cCol, cD, step(0.63, n3));
#elif CAMO_T == 3
  float w = sin(cP.x * 2.2 + cFbm(cP * 0.7) * 6.0 + cP.y * 0.8) ; float s = smoothstep(0.45, 0.6, w);
  cCol = mix(mix(cA, cC, cNoise(cP * 0.6)), mix(cB, cD, cNoise(cP)), s);
#elif CAMO_T == 4
  vec2 g = vec2(vCamP.x + vCamP.y, vCamP.x - vCamP.y + vCamP.z) * cScale; vec2 f = fract(g); float k = mod(floor(g.x) + floor(g.y), 2.0);
  float weave = k > 0.5 ? smoothstep(0.0, 0.5, f.x) * smoothstep(1.0, 0.5, f.x) : smoothstep(0.0, 0.5, f.y) * smoothstep(1.0, 0.5, f.y);
  cCol = mix(cA, cB, weave) + cD * 0.08 * k;
#elif CAMO_T == 5
  float u = clamp((vCamP.x - cBox.x) / max(1e-4, cBox.y - cBox.x), 0.0, 1.0);
  cCol = u < 0.333 ? cA : u < 0.666 ? cB : cC;
#elif CAMO_T == 6
  float w = sin(cP.x * 0.35 + cFbm(cP * 0.08) * 22.0 + cP.y * 0.2 + cP.z * 0.2);
  cCol = mix(cB, cC, smoothstep(-0.2, 0.9, w)) ; cCol = mix(cCol, cD, smoothstep(0.85, 1.0, abs(w)) * 0.4);
#elif CAMO_T == 7
  float lines = abs(fract(cP.x * 0.5 + cFbm(cP * 0.2) * 1.5 - cT * 0.25) - 0.5);
  float l2 = abs(fract((cP.y + cP.z) * 0.9 + cP.x * 0.15 + cT * 0.18) - 0.5);
  float m1 = smoothstep(0.06, 0.0, lines), m2 = smoothstep(0.04, 0.0, l2) * 0.8;
  cCol = mix(cA, cD, cNoise(cP * 0.3)); cEm = cB * m1 + cC * m2; cCol += cEm * 0.15;
#elif CAMO_T == 8
  float n = cFbm(cP + vec3(0.0, -cT * 0.15, cT * 0.05)); float cr = smoothstep(0.08, 0.0, abs(n - 0.5));
  float pulse = 0.75 + 0.25 * sin(cT * 2.5 + n * 12.0);
  cCol = mix(cA, cD, cNoise(cP * 3.0)); cEm = mix(cB, cC, cr * cr) * cr * pulse; cCol = mix(cCol, cB * 0.4, cr);
#elif CAMO_T == 9
  vec3 sp = cP + vec3(sin(cT * 0.2) * 2.0, cT * 0.12, cos(cT * 0.17) * 2.0);
  float neb = cFbm(sp * 0.8); float neb2 = cFbm(sp * 1.6 + 4.0);
  float st = step(0.985, cHash(floor(vCamP * 900.0))) * (0.6 + 0.4 * sin(cT * 6.0 + cHash(floor(vCamP * 900.0)) * 40.0));
  cCol = mix(cA, cB * 0.35, smoothstep(0.45, 0.8, neb)); cEm = cB * smoothstep(0.55, 0.85, neb) * 0.6 + cC * smoothstep(0.62, 0.9, neb2) * 0.5 + cD * st * 2.0;
#elif CAMO_T == 10
  vec3 q = floor(cP); float h = cHash(q); float f = cHash(q + 3.1);
  cCol = mix(cA, cC, h) * (0.8 + 0.4 * f); float sp = pow(max(0.0, sin(cT * 3.0 + h * 30.0)), 24.0); cEm = cC * sp * 1.5 + cB * 0.05;
#endif`;

const camoCache = new Map();
// matière camouflée tirée d'une matière d'arme : on garde le grain d'origine (s'il y en a un) et on peint par-dessus
function camoMaterial(base, cid, box) {
  const C = CAMOS[cid]; const key = base.uuid + '|' + cid + (C.type === 'bandes' ? '|' + box.x.toFixed(3) + box.y.toFixed(3) : '');
  if (camoCache.has(key)) return camoCache.get(key);
  const gun = base.userData?.gun; const unit = gun?.unit ?? 1;
  const m = base.clone(); m.vertexColors = false; m.emissive = new THREE.Color(0, 0, 0); m.emissiveIntensity = 1;
  const baseCompile = gun ? base.onBeforeCompile : null; const col = (i) => new THREE.Color(C.c[i]).convertSRGBToLinear();
  const U = { cA: { value: col(0) }, cB: { value: col(1) }, cC: { value: col(2) }, cD: { value: col(3) }, cScale: { value: C.echelle || 10 }, cTime: CTIME,
    cMetal: { value: C.metal ?? 0.3 }, cRough: { value: C.rough ?? 0.5 }, cEmi: { value: C.emi || 0 }, cUnit: { value: unit }, cBox: { value: box.clone() } };
  m.onBeforeCompile = (sh, r) => {
    if (baseCompile) baseCompile(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCamP; uniform float cUnit;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamP = position * cUnit;');
    sh.fragmentShader = '#define CAMO_T ' + TYPES[C.type] + '\n' + (gun ? '#define CAMO_GRAIN\n' : '') + sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCamP; uniform vec3 cA, cB, cC, cD; uniform float cScale, cTime, cMetal, cRough, cEmi; uniform vec2 cBox;' + NOISE)
      .replace('#include <roughnessmap_fragment>', 'vec3 cEm = vec3(0.0); float cWear = 0.0;\n{' + PATTERN + `
#ifdef CAMO_GRAIN
  cWear = clamp(gEd * 0.8, 0.0, 1.0); cCol *= 1.0 + gG * 0.55;
#endif
  diffuseColor.rgb = mix(cCol, vec3(0.42, 0.44, 0.47), cWear);
}
#include <roughnessmap_fragment>`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(cMetal, 0.9, cWear);\nroughnessFactor = clamp(cRough + (roughnessFactor - 0.5) * 0.3, 0.04, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cEm * cEmi;');
  };
  m.customProgramCacheKey = () => 'camo|' + cid + '|' + (gun ? 'g' + gun.kind : 'x');
  if (C.anim) startClock();
  camoCache.set(key, m); return m;
}
// les pièces qui ne se peignent pas : verres, point lumineux, quadrillage de poignée, caoutchouc
const SKIP = /Glass|GlowDot|Rubber|Grip|Lens|verre|lunette/i;
// applique un camouflage à une arme (instance clonée : gunInstance) ; « aucun » ne touche à rien
export function applyCamo(obj, cid) {
  if (!obj || !cid || cid === 'aucun' || !CAMOS[cid]) return obj;
  obj.updateMatrixWorld(true);
  // longueur de l'arme dans son repère (pour les bandes tricolores, du canon à la crosse)
  let x0 = 1e9, x1 = -1e9;
  obj.traverse((o) => { if (!o.isMesh) return; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; const u = (Array.isArray(o.material) ? o.material[0] : o.material)?.userData?.gun?.unit ?? 1; x0 = Math.min(x0, b.min.x * u); x1 = Math.max(x1, b.max.x * u); });
  const box = new THREE.Vector2(x0, x1);
  const conv = (m) => (!m || SKIP.test(m.name || '') || m.transparent || m.userData?.gun?.kind === 3 || m.userData?.gun?.kind === 4 ? m : camoMaterial(m, cid, box));
  obj.traverse((o) => { if (o.isMesh && !o.userData.noCamo) o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); });
  return obj;
}

// ---------------------------------------------------------------- traçantes
let rainbow = 0;
export function tracerColor(tid) {
  const T = TRACANTES[tid]; if (!T || tid === 'aucune') return null;
  if (T.c === 'arcenciel') { rainbow = (rainbow + 0.07) % 1; return '#' + new THREE.Color().setHSL(rainbow, 1, 0.6).getHexString(); }
  if (T.c === 'tricolore') { rainbow = (rainbow + 1) % 3; return ['#2b5bff', '#ffffff', '#ff2b2b'][rainbow | 0]; }
  return T.c;
}

// ---------------------------------------------------------------- effets d'élimination
export function killEffect(fx, pos, eid) {
  const E = EFFETS[eid]; if (!E || !E.fx || !fx || !pos) return;
  const p = pos.clone(); p.y += 1.1;
  switch (E.fx) {
    case 'billets': for (const c of ['#3f9a4a', '#5cbf5c', '#2e7d3a']) fx.burst(p, 14, { color: c, speed: 3.5, size: 0.09, life: 1.6, grav: 2.5 }); break;
    case 'confettis': for (const c of ['#ff3d7f', '#2fd3ff', '#ffe23d', '#7a3dff', '#3dff6e']) fx.burst(p, 10, { color: c, speed: 6, size: 0.05, life: 1.4, grav: 4, emissive: true }); break;
    case 'eclair': fx.burst(p, 28, { color: '#7fd4ff', speed: 9, size: 0.04, life: 0.35, grav: 0, emissive: true }); fx.ring(pos, '#5ab8ff'); fx.ring(p, '#bfe9ff'); break;
    case 'flammes': fx.burst(p, 26, { color: '#ff7a1a', speed: 4, size: 0.1, life: 0.8, grav: -2, emissive: true }); fx.burst(p, 14, { color: '#ffd04a', speed: 2.5, size: 0.07, life: 0.6, grav: -3, emissive: true }); fx.wisp?.(p, { color: '#3a3330', s1: 1.8, life: 1.8 }); break;
    case 'glitch': for (const c of ['#ff00e6', '#00f0ff', '#ffffff']) fx.burst(p, 12, { color: c, speed: 5, size: 0.12, life: 0.5, grav: 0, emissive: true }); fx.ring(pos, '#ff00e6'); break;
    case 'paillettes': fx.burst(p, 40, { color: '#ffd04a', speed: 5, size: 0.04, life: 1.8, grav: 1.5, emissive: true }); fx.ring(pos, '#ffc83d'); break;
  }
}
