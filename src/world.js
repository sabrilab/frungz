// Monde : map Place Frungz (glb), ciel, lumière, colliders 2D extrudés, hauteur du sol, lancer de rayons, grille de navigation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export function setupScene(renderer) {
  const scene = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#4f86c9') }, mid: { value: new THREE.Color('#a9c8e6') }, hor: { value: new THREE.Color('#f6d7b0') }, sunDir: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top, mid, hor, sunDir; varying vec3 vP;
      void main(){ float h = max(vP.y, 0.0); vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.8, h));
        float s = max(dot(normalize(vP), sunDir), 0.0); c += vec3(1.0,0.75,0.45) * (pow(s, 8.0) * 0.35 + pow(s, 600.0) * 4.0);
        if (vP.y < 0.0) c = hor * 0.9; gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat); sky.frustumCulled = false; scene.add(sky);
  scene.fog = new THREE.Fog('#d9cfc0', 150, 620);
  const hemi = new THREE.HemisphereLight('#bcd3f2', '#8c7a62', 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe0b8', 3.6);
  const SUN = new THREE.Vector3(-0.48, 0.78, 0.4).normalize();
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 5, far: 260 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target); skyMat.uniforms.sunDir.value.copy(SUN);
  // l'ombre suit le joueur (cadre de 90 m, calé sur les texels pour ne pas scintiller)
  const followShadow = (p) => {
    const step = 90 / 2048; const cx = Math.round(p.x / step) * step, cz = Math.round(p.z / step) * step;
    sun.target.position.set(cx, 0, cz); sun.position.set(cx + SUN.x * 140, SUN.y * 140, cz + SUN.z * 140);
  };
  return { scene, sun, hemi, followShadow };
}

// charge un .glb en préférant sa version .gz (le CDN ne compresse pas les .glb : 3 à 4 fois moins à télécharger), décompressée dans le navigateur
export async function loadGLB(url, onProgress) {
  if (typeof DecompressionStream !== 'undefined') try {
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
    o.castShadow = !/glass|glow|lamp|decor_lointain|sol_|zones/.test(n);
    o.receiveShadow = true;
    if (/^sol_/.test(n)) ground.push(o);
    // skyline lointaine : hors brouillard, sans ombre
    let inHorizon = false; for (let q = o; q; q = q.parent) if (q.name === 'horizon') { inHorizon = true; break; }
    if (inHorizon || o.material?.name === 'horizon') { o.castShadow = false; o.receiveShadow = false; for (const m of [].concat(o.material)) if (m) m.fog = false; }
    if (o.material?.name === 'glow') { o.material.emissive?.set('#ffb070'); o.material.emissiveIntensity = 0.25; }
  });
  const marks = root.getObjectByName('zones_marquage'); if (marks) marks.visible = false;
  return { root, ground };
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
    const H = new Float32Array(nx * nz).fill(-1e9), v = new THREE.Vector3();
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
          const y = l1 * ay + l2 * by + l3 * cy, k = j * nx + i; if (y > H[k]) H[k] = y;
        } }
      }
    }
    for (let k = 0; k < H.length; k++) if (H[k] < -1e8) H[k] = 0;
    // sols surélevés (butte, bases) et escaliers
    const ter = this.colliders.filter((c) => c.type === 'poly' && c.tag === 'terrasse').map((t) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of t.poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return { t, x0, z0, x1, z1 }; });
    const ramps = this.gp.rampes || [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = B.x0 + i * S, z = B.z0 + j * S; let h = H[j * nx + i];
      for (const { t, x0, z0, x1, z1 } of ter) if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && pointInPoly(x, z, t.poly)) h = Math.max(h, t.sol_y ?? (t.y0 || 0) + t.h);
      for (const r of ramps) { const dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2], L = Math.hypot(dx, dz); const ux = dx / L, uz = dz / L; const px = x - r.a[0], pz = z - r.a[2]; const along = px * ux + pz * uz, side = Math.abs(-px * uz + pz * ux); if (along >= -0.3 && along <= L + 0.3 && side <= r.largeur / 2 + 0.1) { const t = Math.max(0, Math.min(1, along / L)); h = Math.max(h, r.a[1] + (r.b[1] - r.a[1]) * t); } }
      H[j * nx + i] = h;
    }
    this.H = H; this.hnx = nx; this.hnz = nz; this.hS = S;
  }
  groundY(x, z) {
    const B = this.bounds, S = this.hS; const fx = (x - B.x0) / S, fz = (z - B.z0) / S;
    const i = Math.max(0, Math.min(this.hnx - 1, Math.round(fx))), j = Math.max(0, Math.min(this.hnz - 1, Math.round(fz)));
    return this.H[j * this.hnx + i];
  }
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
    let y = this.groundY(x, z);
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
    if (d.y < -1e-4) { let t = (this.groundY(o.x, o.z) - o.y) / d.y; if (t > 0 && t < best) { const gy = this.groundY(o.x + d.x * t, o.z + d.z * t); t = (gy - o.y) / d.y; if (t > 0 && t < best) { best = t; bn = [0, 1, 0]; bc = null; } } }
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
    // barricades posées pendant la partie : les bots les contournent
    for (const c of this.dynamic) { if (!c.wall) continue; const dx = q.x - c.x, dz = q.z - c.z, lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs; if (Math.abs(lx) < c.hx + 0.55 && Math.abs(lz) < c.hz + 0.55) return true; }
    for (const c of this.colliders) {
      if (c.off) continue;
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
  refreshNav(x0, z0, x1, z1) { const N = this.nav, B = this.bounds; const g = N.g;
    const [i0, j0] = [Math.max(0, Math.floor((x0 - B.x0) / N.S)), Math.max(0, Math.floor((z0 - B.z0) / N.S))], [i1, j1] = [Math.min(N.nx - 1, Math.floor((x1 - B.x0) / N.S)), Math.min(N.nz - 1, Math.floor((z1 - B.z0) / N.S))];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * N.nx + i] = this._cellBlocked(B.x0 + (i + 0.5) * N.S, B.z0 + (j + 0.5) * N.S) ? 1 : 0;
    this.labelNav();
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
    while (heap.length && iter++ < 30000) {
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
