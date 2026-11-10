// Aperçu 3D de l'armurerie : un petit moteur de rendu séparé (plateau tournant, éclairage studio) qui sert
// à la fois l'aperçu en grand de l'objet survolé et les vignettes des cartes (images mises en cache).
import * as THREE from 'three';
import { guns, gunInstance } from './assets.js';
import { socle } from './props.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.7, metalness: o.m ?? 0.05, flatShading: true, emissive: o.e || '#000', emissiveIntensity: o.ei ?? 0 });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r0, r1, h, s, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, s), m); o.position.set(x, y, z); return o; };

// gilet pare-balles : une plaque de plus par niveau, bandes réfléchissantes, écusson
function vest(level) {
  const g = new THREE.Group(); const fab = M('#232a36'), strap = M('#151a22'), plate = M('#3a4658', { r: 0.5, m: 0.2 }), refl = M('#d8dde4', { e: '#9aa', ei: 0.25 });
  g.add(box(0.46, 0.56, 0.08, fab, 0, 0, 0.11)); g.add(box(0.46, 0.56, 0.08, fab, 0, 0, -0.11)); // devant / dos
  g.add(box(0.07, 0.4, 0.22, fab, -0.22, -0.06, 0)); g.add(box(0.07, 0.4, 0.22, fab, 0.22, -0.06, 0)); // flancs
  g.add(box(0.1, 0.06, 0.3, strap, -0.15, 0.3, 0)); g.add(box(0.1, 0.06, 0.3, strap, 0.15, 0.3, 0)); // épaulières
  const neck = box(0.18, 0.1, 0.09, M('#11151b'), 0, 0.24, 0.12); g.add(neck);
  g.add(box(0.47, 0.04, 0.012, refl, 0, -0.16, 0.156)); g.add(box(0.47, 0.04, 0.012, refl, 0, -0.16, -0.156));
  // poches et plaques (niveau)
  for (let i = 0; i < 3; i++) g.add(box(0.11, 0.12, 0.05, strap, -0.13 + i * 0.13, -0.22, 0.17));
  for (let i = 0; i < Math.max(1, level); i++) { const p = box(0.32 - i * 0.03, 0.08, 0.03, plate, 0, 0.14 - i * 0.075, 0.165 + i * 0.012); g.add(p); }
  const badge = box(0.09, 0.06, 0.01, M('#e8c547', { e: '#e8c547', ei: 0.2 }), 0.12, 0.08, 0.157 + Math.max(1, level) * 0.012 + 0.02); g.add(badge);
  g.scale.setScalar(1.6); return g;
}
// sac de sport (bras solides)
function bag() {
  const g = new THREE.Group(); const c = M('#2f5a8a'), d = M('#1c2a3a');
  const b = cyl(0.17, 0.17, 0.6, 10, c); b.rotation.z = Math.PI / 2; g.add(b);
  for (const x of [-0.3, 0.3]) { const e = cyl(0.175, 0.175, 0.03, 10, d, x); e.rotation.z = Math.PI / 2; g.add(e); }
  g.add(box(0.5, 0.02, 0.04, M('#d8c070', { m: 0.6, r: 0.3 }), 0, 0.165, 0));
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 12, Math.PI), d); h.position.y = 0.17; g.add(h);
  g.scale.setScalar(1.5); return g;
}
// caisse à outils
function toolbox() {
  const g = new THREE.Group(); const red = M('#c43a2c', { r: 0.45, m: 0.3 }), steel = M('#9aa3ad', { r: 0.3, m: 0.8 });
  g.add(box(0.6, 0.26, 0.28, red, 0, 0, 0)); g.add(box(0.62, 0.05, 0.3, red, 0, 0.15, 0));
  g.add(box(0.06, 0.04, 0.02, steel, -0.2, 0.06, 0.15)); g.add(box(0.06, 0.04, 0.02, steel, 0.2, 0.06, 0.15));
  g.add(box(0.32, 0.03, 0.04, steel, 0, 0.27, 0)); g.add(box(0.03, 0.09, 0.04, steel, -0.15, 0.22, 0)); g.add(box(0.03, 0.09, 0.04, steel, 0.15, 0.22, 0));
  const ham = new THREE.Group(); ham.add(box(0.03, 0.03, 0.34, M('#8a6a45'))); ham.add(box(0.06, 0.06, 0.12, steel, 0, 0, 0.17)); ham.position.set(0.1, 0.2, -0.05); ham.rotation.set(0.2, 0.9, 1.3); g.add(ham);
  g.scale.setScalar(1.4); return g;
}

export function createPreview() {
  const W = 520, H = 300;
  const canvas = document.createElement('canvas'); canvas.className = 'pv3d';
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.setSize(W, H, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.5;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e8eeff', '#4a3a30', 2.2));
  const key = new THREE.DirectionalLight('#fff3e0', 3.6); key.position.set(1.5, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight('#8fc0ff', 3.2); rim.position.set(-2.5, 1.2, -2); scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffb070', 1.2); fill.position.set(-2, -1, 2); scene.add(fill);
  // socle tournant discret
  const plate = cyl(0.62, 0.66, 0.04, 40, M('#1b1f27', { r: 0.4, m: 0.3 }), 0, -0.02); scene.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.645, 0.008, 4, 64), new THREE.MeshBasicMaterial({ color: '#e8c547' })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; scene.add(ring);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
  const turn = new THREE.Group(); scene.add(turn);

  // fabrique l'objet 3D d'une entrée de l'armurerie, centré et mis à l'échelle
  function build(kind, id, level = 0) {
    let o = null;
    if (kind === 'w') { if (!guns[id]) return null; o = gunInstance(id); o.traverse((m) => { if (m.isMesh) m.castShadow = false; }); }
    else if (id === 'gilet') o = vest(level);
    else if (id === 'sac') o = bag();
    else if (id === 'mats') o = toolbox();
    else if (id === 'socles') { o = new THREE.Group(); const a = socle('civils'); a.position.x = -0.45; const b = socle('civils'); b.position.x = 0.45; o.add(a, b); }
    if (!o) return null;
    const g = new THREE.Group(); g.add(o);
    const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const k = 1.3 / Math.max(sz.x, sz.y * 1.6, sz.z); o.position.sub(c).multiplyScalar(k); o.scale.multiplyScalar(k);
    o.position.y += (sz.y * k) / 2 + 0.06; // posé sur le plateau
    g.userData.h = sz.y * k;
    return g;
  }
  function frame(g, w, h, d = 2.5) { const hh = g?.userData.h || 0.4; cam.aspect = w / h; cam.position.set(0, 0.35 + hh * 0.6, d); cam.lookAt(0, hh * 0.5 + 0.04, 0); cam.updateProjectionMatrix(); }
  function setObj(g) { turn.clear(); if (g) turn.add(g); }

  // vignettes : image fixe de trois quarts, en cache
  const thumbs = new Map();
  function thumb(kind, id, level) {
    const key = kind + id + ':' + level; if (thumbs.has(key)) return thumbs.get(key);
    const g = build(kind, id, level); if (!g) return '';
    const prev = turn.children[0]; const ry = turn.rotation.y; setObj(g); turn.rotation.y = kind === 'w' ? -0.5 : 0.6;
    r.setPixelRatio(1); r.setSize(320, 184, false); frame(g, 320, 184, 2.0); plate.visible = ring.visible = false; r.render(scene, cam);
    const url = canvas.toDataURL('image/png'); thumbs.set(key, url);
    plate.visible = ring.visible = true; setObj(prev || null); turn.rotation.y = ry; r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.setSize(W, H, false); frame(prev, W, H);
    return url;
  }

  let cur = '', raf = 0, last = 0, spin = 0, drag = null;
  function show(kind, id, level = 0) {
    const key = kind + id + ':' + level; if (key === cur) return; cur = key;
    const g = build(kind, id, level); setObj(g); frame(g, W, H); spin = 0.9; // petit élan à chaque changement
    turn.scale.setScalar(0.85);
  }
  function loop(t) {
    raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    if (!drag) { spin += (0.45 - spin) * Math.min(1, dt * 2); turn.rotation.y += spin * dt; }
    turn.scale.setScalar(turn.scale.x + (1 - turn.scale.x) * Math.min(1, dt * 10));
    turn.position.y = Math.sin(t / 900) * 0.015;
    r.render(scene, cam);
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  // on peut faire tourner l'objet à la souris
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; const d = e.clientX - drag.x; drag.x = e.clientX; turn.rotation.y += d * 0.012; spin = d * 0.6; });
  canvas.addEventListener('pointerup', () => { drag = null; });
  return { canvas, show, thumb, start, stop };
}
