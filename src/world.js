// Monde : map Place Frungz (glb), ciel, lumière, colliders 2D extrudés, hauteur du sol, lancer de rayons, grille de navigation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export function setupScene(renderer) {
  const scene = new THREE.Scene();
  // ciel (passe photoréaliste) : dégradé d'atmosphère (zénith profond, horizon voilé de brume claire), halo de diffusion
  // autour du soleil, disque solaire très lumineux (il fait réagir le bloom) et cumulus procéduraux éclairés par le soleil,
  // qui dérivent lentement. La nuit (uniforme night, piloté par src/night.js) garde lune, étoiles et lueur de la ville.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#2f62ad') }, mid: { value: new THREE.Color('#86acd8') }, hor: { value: new THREE.Color('#d3dde6') }, sunDir: { value: new THREE.Vector3() }, night: { value: 0 }, uTime: { value: 0 }, uCloud: { value: 1 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top, mid, hor, sunDir; uniform float night, uTime, uCloud; varying vec3 vP;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return s; }
      void main(){ vec3 d = normalize(vP); float h = max(d.y, 0.0); vec3 c = mix(hor, mid, smoothstep(0.0, 0.16, h)); c = mix(c, top, smoothstep(0.12, 0.85, h));
        float s = max(dot(d, sunDir), 0.0);
        if (night < 0.5) {
          vec3 sunC = vec3(1.0, 0.93, 0.82);
          c += sunC * (pow(s, 6.0) * 0.22 + pow(s, 48.0) * 0.35) + vec3(1.0, 0.95, 0.85) * smoothstep(0.99975, 0.99988, s) * 40.0;
          if (uCloud > 0.0 && d.y > 0.0) { // cumulus : projection sur un plafond plat, densité fbm, ombre propre vers le soleil
            vec2 uv = d.xz / (d.y + 0.06) * 0.55 + uTime * vec2(0.004, 0.0025);
            float n = fbm(uv * 2.2), cov = smoothstep(0.48, 0.78, n) * smoothstep(0.0, 0.14, d.y) * uCloud;
            float n2 = fbm(uv * 2.2 + sunDir.xz * 0.12), lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0);
            vec3 cc = mix(vec3(0.56, 0.6, 0.68), vec3(1.15, 1.1, 1.02), lit) * mix(1.0, 0.85, smoothstep(0.62, 0.9, n));
            cc += sunC * pow(s, 5.0) * 0.9 * (1.0 - smoothstep(0.5, 0.85, n)); // liseré argenté près du soleil
            cc = mix(cc, hor * 1.05, smoothstep(0.25, 0.0, d.y) * 0.6); // les nuages lointains se perdent dans la brume
            c = mix(c, cc, cov * 0.92);
          }
        } else {
          // nuit : lune nette avec halo froid, étoiles discrètes qui s'effacent dans la lueur de la ville
          c += vec3(0.55, 0.65, 0.9) * (pow(s, 40.0) * 0.18 + pow(s, 3.0) * 0.04) + vec3(0.95, 0.97, 1.0) * smoothstep(0.99955, 0.9997, s) * 1.6;
          vec3 g = floor(d * 260.0); float st = hash(g); float tw = 0.75 + 0.25 * sin(st * 90.0);
          c += vec3(0.85, 0.9, 1.0) * step(0.9965, st) * smoothstep(0.12, 0.5, h) * tw * (1.0 - step(0.995, s)) * 0.9;
        }
        if (vP.y < 0.0) c = hor * 0.9; gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat); sky.frustumCulled = false; scene.add(sky);
  sky.onBeforeRender = () => { skyMat.uniforms.uTime.value = performance.now() / 1000; };
  scene.fog = new THREE.Fog('#c4ced8', 150, 620);
  // lumière du ciel : gris-bleu léger, pas bleu franc (avec les reflets du ciel en plus, les ombres viraient au bleu)
  const hemi = new THREE.HemisphereLight('#c8d2e0', '#94806a', 0.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe6c4', 4.0);
  const SUN = new THREE.Vector3(-0.48, 0.78, 0.4).normalize();
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 5, far: 300 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target); skyMat.uniforms.sunDir.value.copy(SUN);
  // l'ombre suit le joueur (cadre calé sur les texels pour ne pas scintiller). lead : décalage vers l'endroit où regarde la caméra,
  // pour que le cadre d'ombre couvre surtout ce qu'on voit
  const followShadow = (p, lead) => {
    const half = sun.shadow.camera.right, step = (half * 2) / sun.shadow.mapSize.x;
    const x = p.x + (lead?.x || 0), z = p.z + (lead?.z || 0);
    const cx = Math.round(x / step) * step, cz = Math.round(z / step) * step;
    sun.target.position.set(cx, 0, cz); sun.position.set(cx + SUN.x * 160, SUN.y * 160, cz + SUN.z * 160);
  };
  // taille du cadre d'ombre (m, demi-côté) et définition de la carte
  const setShadowFrame = (half, size) => { Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half }); sun.shadow.camera.updateProjectionMatrix(); if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; } };
  return { scene, sun, hemi, sky, followShadow, setShadowFrame };
}

// charge un .glb en préférant sa version .gz (le CDN ne compresse pas les .glb : 3 à 4 fois moins à télécharger), décompressée dans le navigateur
export async function loadGLB(url, onProgress) {
  // dans l'app iPhone, les fichiers sont dans l'app : pas de version compressée (on la retire du paquet), on lit le .glb directement
  if (typeof DecompressionStream !== 'undefined' && !window.Capacitor?.isNativePlatform?.()) try {
    const r = await fetch(url + '.gz'); const total = +r.headers.get('content-length') || 0;
    if (r.ok) {
      const chunks = []; let got = 0; const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; if (total) onProgress?.(Math.min(0.99, got / total)); }
      let buf = new Blob(chunks); const head = new Uint8Array(await buf.slice(0, 2).arrayBuffer());
      if (head[0] === 0x1f && head[1] === 0x8b) buf = new Blob([await new Response(buf.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()]);
      const ab = await buf.arrayBuffer(); const g = await new Promise((res, rej) => loader.parse(ab, url.replace(/[^/]*$/, ''), res, rej)); onProgress?.(1); return g;
    }
  } catch (e) { console.warn(url + '.gz indisponible, repli sur le .glb', e); }
  return loader.loadAsync(url, (e) => e.total && onProgress?.(e.loaded / e.total));
}

export async function loadMap(url, onProgress) {
  const g = await loadGLB(url, onProgress);
  const root = g.scene;
  const ground = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || '';
    o.castShadow = /^metro_(murs|voutes)/.test(n) || !/glass|glow|lamp|decor_lointain|sol_|zones|eau/.test(n);
    o.receiveShadow = true;
    if (/^(metro_)?sol_/.test(n)) ground.push(o);
    // skyline lointaine : hors brouillard, sans ombre
    let inHorizon = false; for (let q = o; q; q = q.parent) if (q.name === 'horizon') { inHorizon = true; break; }
    if (inHorizon || o.material?.name === 'horizon') { o.castShadow = false; o.receiveShadow = false; for (const m of [].concat(o.material)) if (m) m.fog = false; }
    if (o.material?.name === 'glow') { o.material.emissive?.set('#ffb070'); o.material.emissiveIntensity = 0.25; }
  });
  const marks = root.getObjectByName('zones_marquage'); if (marks) marks.visible = false;
  // les voûtes du métro sont vues de l'intérieur : elles doivent quand même projeter leur ombre (sinon le soleil traverse la rue)
  for (const nm of ['metro_voutes', 'metro_murs']) root.getObjectByName(nm)?.traverse((o) => { if (o.isMesh) { o.castShadow = true; for (const m of [].concat(o.material)) if (m) m.shadowSide = THREE.DoubleSide; } });
  const cassables = []; root.traverse((o) => { if (/^CASSABLE_/.test(o.name) && o.userData?.cassable) cassables.push(o); });
  const water = root.getObjectByName('seine_eau'); if (water) water.traverse((o) => { if (o.isMesh) { o.castShadow = false; for (const m of [].concat(o.material)) if (m) { m.transparent = true; m.opacity = 0.86; m.depthWrite = false; } } });
  return { root, ground, cassables, rame: root.getObjectByName('METRO_RAME') };
}

// ---------- géométrie 2D ----------
export function pointInPoly(x, z, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }

export class World {
  constructor(gameplay, ground) {
    this.gp = gameplay; this.bounds = gameplay.limites; this.zones = gameplay.zones; this.spawns = gameplay.spawns;
    this.colliders = gameplay.colliders.filter((c) => c.type !== 'roof').map((c) => ({ ...c }));
    for (const c of this.colliders) if (c.type === 'box') { c.cs = Math.cos(c.yaw); c.sn = Math.sin(c.yaw); }
    this.plats = (gameplay.plateformes || []).filter((p) => p.tag !== 'toit').map((p) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of p.poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return { type: 'plat', poly: p.poly, y: p.y, climb: p.escaladable !== false, bb: [x0, z0, x1, z1], id: p.id }; });
    this.buildHash();
    this.dynamic = []; // barricades, vitrines, voitures garées : { type:'box', x,z,hx,hz,h,yaw, cs, sn, owner }
    this.buildHeight(ground);
    this.buildNav();
  }
  // hauteur du sol (grille de 0,5 m lancée une fois sur les maillages du sol)
  buildHeight(ground) {
    const B = this.bounds, S = 0.5, nx = Math.ceil((B.x1 - B.x0) / S) + 1, nz = Math.ceil((B.z1 - B.z0) / S) + 1;
    // on « rasterise » les triangles du sol sur la grille (au lieu de 240 000 lancers de rayons, qui bloquaient le chargement)
    // jusqu'à NL couches par case (rue, couloirs à -5, quais à -8, quai bas sous le pont), triées de la plus haute à la plus basse
    const NL = this.NL = 4, H = new Float32Array(nx * nz * NL).fill(-1e9), v = new THREE.Vector3();
    const put = (k, y) => { const b = k * NL; for (let l = 0; l < NL; l++) { const h = H[b + l]; if (h < -1e8) { H[b + l] = y; return; } if (Math.abs(h - y) < 0.5) { if (y > h) H[b + l] = y; return; } if (y > h) { for (let m = NL - 1; m > l; m--) H[b + m] = H[b + m - 1]; H[b + l] = y; return; } } };
    const drop = (k, lo, hi) => { const b = k * NL; let w = 0; for (let l = 0; l < NL; l++) { const h = H[b + l]; if (h > -1e8 && (h < lo || h > hi)) H[b + w++] = h; } for (; w < NL; w++) H[b + w] = -1e9; };
    for (const m of ground) {
      m.updateMatrixWorld(true); const pos = m.geometry.attributes.position, idx = m.geometry.index; if (!pos) continue;
      const P = new Float32Array(pos.count * 3); for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z; }
      const nt = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < nt; t++) {
        const a = (idx ? idx.getX(t * 3) : t * 3) * 3, b = (idx ? idx.getX(t * 3 + 1) : t * 3 + 1) * 3, c = (idx ? idx.getX(t * 3 + 2) : t * 3 + 2) * 3;
        const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
        if (ay > 20 || by > 20 || cy > 20) continue;
        const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-9) continue; // triangle vertical
        const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - B.x0) / S)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - B.x0) / S));
        const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - B.z0) / S)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - B.z0) / S));
        for (let j = j0; j <= j1; j++) { const z = B.z0 + j * S; for (let i = i0; i <= i1; i++) {
          const x = B.x0 + i * S; const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, l3 = 1 - l1 - l2;
          if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
          put(j * nx + i, l1 * ay + l2 * by + l3 * cy);
        } }
      }
    }
    // lit de la Seine sous l'eau (pas de maillage de sol) ; ailleurs, sol par défaut à 0
    const eau = this.gp.seine?.eau;
    for (let k = 0; k < nx * nz; k++) if (H[k * NL] < -1e8) { const x = B.x0 + (k % nx) * S, z = B.z0 + ((k / nx) | 0) * S; H[k * NL] = eau && pointInPoly(x, z, eau.poly) ? (eau.fond ?? eau.y - 1.1) : 0; }
    // sols surélevés (butte, bases) et escaliers
    const ter = this.colliders.filter((c) => c.type === 'poly' && c.tag === 'terrasse').map((t) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of t.poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return { t, x0, z0, x1, z1 }; });
    this.ramps = (this.gp.rampes || []).map((r) => { const dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2], L = Math.hypot(dx, dz); const lo = Math.min(r.a[1], r.b[1]), hi = Math.max(r.a[1], r.b[1]);
      // palier : coordonnées le long de l'axe principal de la volée (plat entre les deux)
      let p0 = null, p1 = null; if (r.palier) { const ax = Math.abs(dx) > Math.abs(dz) ? 0 : 2; const a0 = r.a[ax], sg = Math.sign(r.b[ax] - a0) || 1; p0 = Math.min(...r.palier.map((v) => (v - a0) * sg)); p1 = Math.max(...r.palier.map((v) => (v - a0) * sg)); if (p0 < 0.05 || p1 > L - 0.05) p0 = p1 = null; }
      return { r, ux: dx / L, uz: dz / L, L, lo, hi, p0, p1, under: lo < -0.5 }; });
    const rampY = (R, along) => { const t = Math.max(0, Math.min(R.L, along)), r = R.r; if (R.p0 == null) return r.a[1] + (r.b[1] - r.a[1]) * t / R.L; const run = R.p0 + (R.L - R.p1); const d = t < R.p0 ? t : t < R.p1 ? R.p0 : t - (R.p1 - R.p0); return r.a[1] + (r.b[1] - r.a[1]) * d / run; };
    this.rampY = rampY;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = B.x0 + i * S, z = B.z0 + j * S, k = j * nx + i, b = k * NL;
      if (H[b] > -1) for (const { t, x0, z0, x1, z1 } of ter) if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && pointInPoly(x, z, t.poly)) H[b] = Math.max(H[b], t.sol_y ?? (t.y0 || 0) + t.h);
      for (const R of this.ramps) { const px = x - R.r.a[0], pz = z - R.r.a[2]; const along = px * R.ux + pz * R.uz, side = Math.abs(-px * R.uz + pz * R.ux); if (along >= -0.3 && along <= R.L + 0.3 && side <= R.r.largeur / 2 + 0.1) {
        const y = rampY(R, along);
        // escalier qui descend sous la rue : on retire ce qui est dans la tranche de la volée (trémie), on garde la rue au-dessus des escaliers des quais
        if (R.under || R.lo < -1) { drop(k, R.lo - 0.3, R.hi + 0.3); put(k, y); } else if (H[b] > R.lo - 1) H[b] = Math.max(H[b], y); else put(k, y);
      } }
    }
    this.H = H; this.hnx = nx; this.hnz = nz; this.hS = S;
    // la Seine : on nage à la surface (tête hors de l'eau)
    const sn = this.gp.seine; this.water = sn?.eau ? { poly: sn.eau.poly, y: sn.eau.y } : null;
  }
  hk(x, z) { const B = this.bounds, S = this.hS; const i = Math.max(0, Math.min(this.hnx - 1, Math.round((x - B.x0) / S))), j = Math.max(0, Math.min(this.hnz - 1, Math.round((z - B.z0) / S))); return (j * this.hnx + i) * this.NL; }
  // sol sous un point : la couche la plus haute sous (ref + 0,7 m) ; sans ref, la plus haute (la rue)
  groundY(x, z, ref = 1e9) {
    const b = this.hk(x, z), H = this.H; let low = H[b], g = null;
    for (let l = 0; l < this.NL; l++) { const y = H[b + l]; if (y < -1e8) break; if (y <= ref + 0.7) { g = y; break; } low = y; }
    if (g == null) g = low;
    // planchers mobiles (voitures du métro)
    const F = this.dynFloors; if (F && ref < -3) for (const f of F) { if (f.y > ref + 0.7 || f.y <= g) continue; const dx = x - f.x, dz = z - f.z; if (Math.abs(dx * f.cs - dz * f.sn) < f.hx && Math.abs(dx * f.sn + dz * f.cs) < f.hz) g = f.y; }
    return g;
  }
  // plafond au-dessus d'un point (la couche du dessus), ou Infinity
  ceilY(x, z, ref) { const b = this.hk(x, z), H = this.H; let c = Infinity; for (let l = 0; l < this.NL; l++) { const y = H[b + l]; if (y < -1e8) break; if (y > ref + 0.7) c = y; else break; } return c; }
  // point dans la masse (dalle entre la rue et le métro, ou terre sous une case sans métro)
  solid(x, y, z) { if (y > -0.6) return false; const b = this.hk(x, z), H = this.H; let up = null;
    for (let l = 0; l < this.NL; l++) { const h = H[b + l]; if (h < -1e8) break; if (h <= y + 0.3) return up != null && y > up - 1.8; up = h; }
    return !this.inWater(x, z); }
  inWater(x, z) { const w = this.water; return !!w && pointInPoly(x, z, w.poly); }
  underground(p) { return p.y < -2.5 && !this.inWater(p.x, p.z) && this.groundY(p.x, p.z) > p.y + 2; }
  *allColliders() { yield* this.colliders; yield* this.dynamic; }
  // grille spatiale (cases de 8 m) : on ne teste que les colliders proches au lieu des ~750 de la map
  buildHash() {
    const B = this.bounds, S = 8; this.gS = S; this.gnx = Math.ceil((B.x1 - B.x0) / S) + 1; this.gnz = Math.ceil((B.z1 - B.z0) / S) + 1;
    this.grid = Array.from({ length: this.gnx * this.gnz }, () => []);
    for (const c of this.colliders) {
      let x0, z0, x1, z1;
      if (c.type === 'poly') { x0 = z0 = 1e9; x1 = z1 = -1e9; for (const [x, z] of c.poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } c.bb ||= [x0, z0, x1, z1]; }
      else { const r = c.type === 'circle' ? c.r : Math.hypot(c.hx, c.hz); x0 = c.x - r; x1 = c.x + r; z0 = c.z - r; z1 = c.z + r; }
      const [i0, j0] = this.gcell(x0, z0), [i1, j1] = this.gcell(x1, z1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.grid[j * this.gnx + i].push(c);
    }
    this._stampN = 0; this._nearA = []; this._rayA = [];
  }
  gcell(x, z) { const B = this.bounds; return [Math.max(0, Math.min(this.gnx - 1, Math.floor((x - B.x0) / this.gS))), Math.max(0, Math.min(this.gnz - 1, Math.floor((z - B.z0) / this.gS)))]; }
  near(x, z, R, out = this._nearA) {
    out.length = 0; const st = ++this._stampN; const [i0, j0] = this.gcell(x - R, z - R), [i1, j1] = this.gcell(x + R, z + R);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const c of this.grid[j * this.gnx + i]) if (c._st !== st) { c._st = st; out.push(c); }
    for (const c of this.dynamic) out.push(c); return out;
  }
  // colliders des cases traversées par le rayon (parcours de grille 2D)
  rayCands(o, d, far) {
    const out = this._rayA; out.length = 0; const st = ++this._stampN, B = this.bounds, S = this.gS;
    const h = Math.hypot(d.x, d.z); const L = far * h;
    const push = (i, j) => { if (i < 0 || j < 0 || i >= this.gnx || j >= this.gnz) return; for (const c of this.grid[j * this.gnx + i]) if (c._st !== st) { c._st = st; out.push(c); } };
    let [i, j] = this.gcell(o.x, o.z);
    if (h < 1e-6) { push(i, j); for (const c of this.dynamic) out.push(c); return out; }
    const dx = d.x / h, dz = d.z / h, si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const fx = (o.x - B.x0) / S, fz = (o.z - B.z0) / S;
    let tMaxX = dx !== 0 ? ((si > 0 ? Math.floor(fx) + 1 - fx : fx - Math.floor(fx)) * S) / Math.abs(dx) : 1e9, tMaxZ = dz !== 0 ? ((sj > 0 ? Math.floor(fz) + 1 - fz : fz - Math.floor(fz)) * S) / Math.abs(dz) : 1e9;
    const tdx = dx !== 0 ? S / Math.abs(dx) : 1e9, tdz = dz !== 0 ? S / Math.abs(dz) : 1e9;
    for (let n = 0; n < 200; n++) { push(i, j); if (Math.min(tMaxX, tMaxZ) > L) break; if (tMaxX < tMaxZ) { i += si; tMaxX += tdx; } else { j += sj; tMaxZ += tdz; } if (i < 0 || j < 0 || i >= this.gnx || j >= this.gnz) break; }
    for (const c of this.dynamic) out.push(c); return out;
  }
  *standables() { yield* this.colliders; yield* this.dynamic; yield* this.plats; }
  // pousse un cylindre (rayon R) hors des colliders ; feetY permet d'enjamber le mobilier bas
  pushOut(p, R, feetY = 0, ignore = null) {
    let hit = false;
    for (const c of this.near(p.x, p.z, R + 0.5)) {
      if (c === ignore || c.off) continue;
      if (feetY + 1.9 < (c.y0 || 0)) continue;
      if (c.type === 'poly') {
        if (feetY > (c.y0 || 0) + c.h - 0.4) continue;
        if (c.bb && (p.x < c.bb[0] - R || p.x > c.bb[2] + R || p.z < c.bb[1] - R || p.z > c.bb[3] + R)) continue;
        const poly = c.poly; let inside = pointInPoly(p.x, p.z, poly), best = null, bd = Infinity;
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
          const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / L2)), qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(p.x - qx, p.z - qz);
          if (d < bd) { bd = d; best = [qx, qz]; }
        }
        if (inside) { const nx = best[0] - p.x, nz = best[1] - p.z, l = Math.hypot(nx, nz) || 1; p.x = best[0] + nx / l * R; p.z = best[1] + nz / l * R; hit = true; }
        else if (bd < R) { const nx = p.x - best[0], nz = p.z - best[1], l = bd || 1; p.x = best[0] + nx / l * R; p.z = best[1] + nz / l * R; hit = true; }
      } else if (c.type === 'circle') {
        if (feetY > (c.y0 || 0) + c.h - 0.35) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + R; if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; hit = true; }
      } else if (c.type === 'box') {
        if (feetY > (c.y0 || 0) + c.h - 0.35) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        let lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs;
        const ex = c.hx + R, ez = c.hz + R;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) { if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = Math.sign(lx) * ex; else lz = Math.sign(lz) * ez; p.x = c.x + lx * c.cs + lz * c.sn; p.z = c.z - lx * c.sn + lz * c.cs; hit = c; }
      }
    }
    const B = this.bounds; p.x = Math.max(B.x0 + R, Math.min(B.x1 - R, p.x)); p.z = Math.max(B.z0 + R, Math.min(B.z1 - R, p.z));
    return hit;
  }
  // hauteur du dessus d'un mobilier sous les pieds (pour monter sur un banc, une voiture…)
  standY(x, z, feetY) {
    let y = this.groundY(x, z, feetY);
    for (const c of [...this.near(x, z, 0.5), ...this.plats]) {
      if (c.off || c.type === 'poly') continue;
      const top = c.type === 'plat' ? c.y : (c.y0 || 0) + c.h; if (top > feetY + 0.45 || top <= y) continue;
      if (c.type === 'circle') { if (Math.hypot(x - c.x, z - c.z) < c.r) y = top; }
      else if (c.type === 'plat') { if (x > c.bb[0] && x < c.bb[2] && z > c.bb[1] && z < c.bb[3] && pointInPoly(x, z, c.poly)) y = top; }
      else { const dx = x - c.x, dz = z - c.z, lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs; if (Math.abs(lx) < c.hx && Math.abs(lz) < c.hz) y = top; }
    }
    return y;
  }
  // rayon contre le décor : { t, n (normale), c (collider) } ou null
  ray(o, d, far) {
    let best = far, bn = null, bc = null;
    // sol
    if (d.y < -1e-4) { let t = (this.groundY(o.x, o.z, o.y) - o.y) / d.y; if (t > 0 && t < best) { const gy = this.groundY(o.x + d.x * t, o.z + d.z * t, o.y); t = (gy - o.y) / d.y; if (t > 0 && t < best) { best = t; bn = [0, 1, 0]; bc = null; } } }
    else if (d.y > 1e-4 && o.y < -1) { const cy = this.ceilY(o.x, o.z, o.y); if (cy < Infinity) { const t = (cy - 1.8 - o.y) / d.y; if (t > 0 && t < best) { best = t; bn = [0, -1, 0]; bc = null; } } }
    // métro et rue ne se voient pas à travers la dalle : on échantillonne le trajet sous la rue (rare : seulement si un bout est sous terre)
    if (o.y < -1 || o.y + d.y * best < -1) { const n = Math.min(300, Math.ceil(best)); for (let k = 1; k < n; k++) { const t = best * k / n; if (this.solid(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)) { best = t; bn = [0, 1, 0]; bc = null; break; } } }
    const h2 = Math.hypot(d.x, d.z);
    for (const c of this.rayCands(o, d, far)) {
      if (c.off) continue;
      if (c.type === 'poly') {
        if (c.bb) { // test rapide de la boîte
          const tx0 = (c.bb[0] - o.x) / d.x, tx1 = (c.bb[2] - o.x) / d.x, tz0 = (c.bb[1] - o.z) / d.z, tz1 = (c.bb[3] - o.z) / d.z;
          const tmin = Math.max(Math.min(tx0, tx1), Math.min(tz0, tz1)), tmax = Math.min(Math.max(tx0, tx1), Math.max(tz0, tz1));
          if (tmax < 0 || tmin > tmax || tmin > best) continue;
        }
        const poly = c.poly;
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          const ex = b[0] - a[0], ez = b[1] - a[1], den = d.x * ez - d.z * ex; if (Math.abs(den) < 1e-9) continue;
          const t = ((a[0] - o.x) * ez - (a[1] - o.z) * ex) / den, u = ((a[0] - o.x) * d.z - (a[1] - o.z) * d.x) / den;
          if (t > 0 && t < best && u >= 0 && u <= 1) { const y = o.y + d.y * t; if (y < (c.y0 || 0) + c.h && y > (c.y0 || 0) - 1) { best = t; const l = Math.hypot(ex, ez); bn = [ez / l, 0, -ex / l]; if (bn[0] * d.x + bn[2] * d.z > 0) { bn[0] *= -1; bn[2] *= -1; } bc = c; } }
        }
      } else if (c.type === 'circle') {
        if (h2 < 1e-6) continue;
        const fx = o.x - c.x, fz = o.z - c.z, A = d.x * d.x + d.z * d.z, Bq = 2 * (fx * d.x + fz * d.z), C = fx * fx + fz * fz - c.r * c.r, D = Bq * Bq - 4 * A * C;
        if (D < 0) continue; const t = (-Bq - Math.sqrt(D)) / (2 * A);
        if (t > 0 && t < best) { const y = o.y + d.y * t; const gy = c.y0 ?? this.groundY(c.x, c.z); if (y < gy + c.h && y > gy - 0.2) { best = t; const px = o.x + d.x * t - c.x, pz = o.z + d.z * t - c.z, l = Math.hypot(px, pz) || 1; bn = [px / l, 0, pz / l]; bc = c; } }
      } else if (c.type === 'box') {
        // dans le repère de la boîte
        const dx = o.x - c.x, dz = o.z - c.z; const lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs;
        const vx = d.x * c.cs - d.z * c.sn, vz = d.x * c.sn + d.z * c.cs;
        const y0 = (c.y0 ?? this.groundY(c.x, c.z)), y1 = y0 + c.h + (c.y0 == null ? 0 : 0);
        const t1x = (-c.hx - lx) / vx, t2x = (c.hx - lx) / vx, t1z = (-c.hz - lz) / vz, t2z = (c.hz - lz) / vz, t1y = (y0 - o.y) / d.y, t2y = (y1 - o.y) / d.y;
        const tmin = Math.max(Math.min(t1x, t2x), Math.min(t1z, t2z), Math.min(t1y, t2y)), tmax = Math.min(Math.max(t1x, t2x), Math.max(t1z, t2z), Math.max(t1y, t2y));
        if (tmax >= tmin && tmin > 0 && tmin < best) {
          // meurtrières des barricades : la balle passe par les fentes
          if (c.holes) { const hx = lx + vx * tmin, hy = o.y + d.y * tmin - y0; if (c.holes.some((h) => hx > h[0] && hx < h[1] && hy > h[2] && hy < h[3])) continue; }
          best = tmin; bc = c;
          const ax = Math.min(t1x, t2x), az = Math.min(t1z, t2z), ay = Math.min(t1y, t2y);
          if (tmin === ay) bn = [0, d.y > 0 ? -1 : 1, 0];
          else { let nx = 0, nz = 0; if (tmin === ax) nx = vx > 0 ? -1 : 1; else nz = vz > 0 ? -1 : 1; bn = [nx * c.cs + nz * c.sn, 0, -nx * c.sn + nz * c.cs]; }
        }
      }
    }
    return bn ? { t: best, n: bn, c: bc } : null;
  }
  los(a, b) { const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); d.divideScalar(L); const h = this.ray(a, d, L); return !h; }

  // ---------- navigation : grille de 1 m, A* ----------
  buildNav() {
    const B = this.bounds, S = 1, nx = Math.round((B.x1 - B.x0) / S), nz = Math.round((B.z1 - B.z0) / S);
    const g = new Uint8Array(nx * nz); const p = { x: 0, z: 0 };
    for (const c of this.colliders) if (c.type === 'poly') { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of c.poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } c.bb = [x0, z0, x1, z1]; }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      p.x = B.x0 + (i + 0.5) * S; p.z = B.z0 + (j + 0.5) * S; const q = { x: p.x, z: p.z };
      const blocked = this._cellBlocked(q.x, q.z);
      g[j * nx + i] = blocked ? 1 : 0;
    }
    this.nav = { g, nx, nz, S }; this.labelNav();
  }
  _cellBlocked(x, z) {
    const q = { x, z };
    const gy0 = this.H ? this.groundY(x, z) : 0;
    if (this.H && this.groundY(x, z) < -1) return true; // trémies, quai bas, Seine
    if (this.inWater?.(x, z) && this.groundY(x, z) < 0) return true; // l'eau bloque, pas le tablier du pont
    for (const R of this.ramps || []) if (R.lo < -1) { const px = x - R.r.a[0], pz = z - R.r.a[2]; const along = px * R.ux + pz * R.uz, side = Math.abs(-px * R.uz + pz * R.ux); if (along >= -1.5 && along <= R.L + 1.5 && side <= R.r.largeur / 2 + 0.6) return true; }
    // barricades posées pendant la partie : les bots les contournent
    for (const c of this.dynamic) { if (!c.wall) continue; const dx = q.x - c.x, dz = q.z - c.z, lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs; if (Math.abs(lx) < c.hx + 0.55 && Math.abs(lz) < c.hz + 0.55) return true; }
    for (const c of this.near(x, z, 1.2, this._navA || (this._navA = []))) {
      if (c.off || c.car || c.metro || c.wall || (c.y0 || 0) + c.h < -0.5) continue;
      if (c.type === 'box' && c.y0 < -1 && c.y0 + c.h < gy0 + 0.4) continue; // mur enterré dont le sommet affleure le sol (mur de quai sous le pont)
      if (c.type === 'poly' && c.tag === 'terrasse') { if (q.x > c.bb[0] - 0.6 && q.x < c.bb[2] + 0.6 && q.z > c.bb[1] - 0.6 && q.z < c.bb[3] + 0.6 && this._polyDist(q, c.poly) < 0.6 && !this._onRamp(q.x, q.z)) return true; continue; }
      if (c.type === 'poly') { if (q.x > c.bb[0] - 0.6 && q.x < c.bb[2] + 0.6 && q.z > c.bb[1] - 0.6 && q.z < c.bb[3] + 0.6) { if (pointInPoly(q.x, q.z, c.poly) || this._polyDist(q, c.poly) < 0.6) return true; } }
      else if (c.type === 'circle') { if (c.h > 0.6 && Math.hypot(q.x - c.x, q.z - c.z) < c.r + 0.55) return true; }
      else if (c.type === 'box') { if (c.h > 0.6) { const dx = q.x - c.x, dz = q.z - c.z, lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs; if (Math.abs(lx) < c.hx + 0.55 && Math.abs(lz) < c.hz + 0.55) return true; } }
    }
    return false;
  }
  _onRamp(x, z) { for (const r of this.gp.rampes || []) { const dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2], L = Math.hypot(dx, dz); const ux = dx / L, uz = dz / L; const px = x - r.a[0], pz = z - r.a[2]; const along = px * ux + pz * uz, side = Math.abs(-px * uz + pz * ux); if (along >= -1.2 && along <= L + 1.2 && side <= r.largeur / 2) return true; } return false; }
  // recalcule une zone de la grille (vitrine brisée ou réparée)
  // composantes connexes de la grille : un trajet impossible est rejeté tout de suite (au lieu de 30 000 itérations)
  labelNav() {
    const N = this.nav, n = N.nx * N.nz; const L = this.comp || (this.comp = new Int32Array(n)); L.fill(0); let id = 0; const q = new Int32Array(n);
    for (let s = 0; s < n; s++) { if (N.g[s] || L[s]) continue; id++; let h = 0, t = 0; q[t++] = s; L[s] = id;
      while (h < t) { const k = q[h++], i = k % N.nx, j = (k / N.nx) | 0;
        for (let d = 0; d < 4; d++) { const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0); if (ni < 0 || nj < 0 || ni >= N.nx || nj >= N.nz) continue; const nk = nj * N.nx + ni; if (!N.g[nk] && !L[nk]) { L[nk] = id; q[t++] = nk; } } } }
  }
  refreshNav(x0, z0, x1, z1) { const q = this._navQ || (this._navQ = []); q.push([x0, z0, x1, z1]); }
  flushNav() { const q = this._navQ; if (!q || !q.length) return; for (const r of q) this._refreshNav(...r); q.length = 0; this.labelNav(); }
  _refreshNav(x0, z0, x1, z1) { const N = this.nav, B = this.bounds; const g = N.g;
    const [i0, j0] = [Math.max(0, Math.floor((x0 - B.x0) / N.S)), Math.max(0, Math.floor((z0 - B.z0) / N.S))], [i1, j1] = [Math.min(N.nx - 1, Math.floor((x1 - B.x0) / N.S)), Math.min(N.nz - 1, Math.floor((z1 - B.z0) / N.S))];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * N.nx + i] = this._cellBlocked(B.x0 + (i + 0.5) * N.S, B.z0 + (j + 0.5) * N.S) ? 1 : 0;
  }
  _polyDist(p, poly) {
    let bd = Infinity;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / L2)); bd = Math.min(bd, Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t)); }
    return bd;
  }
  cell(x, z) { const N = this.nav, B = this.bounds; return [Math.max(0, Math.min(N.nx - 1, Math.floor((x - B.x0) / N.S))), Math.max(0, Math.min(N.nz - 1, Math.floor((z - B.z0) / N.S)))]; }
  free(i, j) { const N = this.nav; return i >= 0 && j >= 0 && i < N.nx && j < N.nz && !N.g[j * N.nx + i]; }
  nearestFree(i, j) { if (this.free(i, j)) return [i, j]; for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if ((Math.abs(di) === r || Math.abs(dj) === r) && this.free(i + di, j + dj)) return [i + di, j + dj]; return [i, j]; }
  path(ax, az, bx, bz) {
    const N = this.nav, B = this.bounds; let [si, sj] = this.nearestFree(...this.cell(ax, az)); let [ti, tj] = this.nearestFree(...this.cell(bx, bz));
    const n = N.nx * N.nz, start = sj * N.nx + si, goal = tj * N.nx + ti;
    if (this.comp && this.comp[start] !== this.comp[goal]) return null;
    const gS = this._g || (this._g = new Float32Array(n)), from = this._f || (this._f = new Int32Array(n)), stamp = this._s || (this._s = new Uint32Array(n)), closed = this._c || (this._c = new Uint32Array(n));
    this._stamp = (this._stamp || 0) + 1; const st = this._stamp;
    const heap = []; const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    const h = (k) => { const i = k % N.nx, j = (k / N.nx) | 0; const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    stamp[start] = st; gS[start] = 0; from[start] = -1; push(start, h(start));
    let found = false, iter = 0;
    while (heap.length && iter++ < 90000) {
      const k = pop(); if (closed[k] === st) continue; closed[k] = st; if (k === goal) { found = true; break; }
      const i = k % N.nx, j = (k / N.nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(i + di, j) || !this.free(i, j + dj))) continue;
        const nk = nj * N.nx + ni; const cost = gS[k] + (di && dj ? 1.414 : 1);
        if (stamp[nk] !== st || cost < gS[nk]) { stamp[nk] = st; gS[nk] = cost; from[nk] = k; push(nk, cost + h(nk)); }
      }
    }
    if (!found) return null;
    const pts = []; for (let k = goal; k !== -1; k = from[k]) pts.push([B.x0 + ((k % N.nx) + 0.5) * N.S, B.z0 + (((k / N.nx) | 0) + 0.5) * N.S]);
    pts.reverse();
    // lissage : on saute les points en ligne de vue sur la grille
    const out = [pts[0]]; let a = 0;
    while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !this.gridLos(pts[a], pts[b])) b--; out.push(pts[b]); a = b; }
    return out;
  }
  gridLos(a, b) { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / 0.5); for (let k = 1; k < n; k++) { const t = k / n; const [i, j] = this.cell(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (!this.free(i, j)) return false; } return true; }
  randomFree(cx, cz, r) { for (let k = 0; k < 40; k++) { const x = cx + (Math.random() * 2 - 1) * r, z = cz + (Math.random() * 2 - 1) * r; if (this.free(...this.cell(x, z))) return [x, z]; } return [cx, cz]; }
}
