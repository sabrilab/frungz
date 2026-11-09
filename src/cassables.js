// Mobilier cassable de la map v5 (633 nœuds CASSABLE_<type>_<n>) : fusionné par matériau au chargement (une vingtaine
// d'appels de rendu au lieu de ~1400). Quand un objet casse, ses sommets sont écrasés dans le maillage fusionné et
// son nœud d'origine réapparaît comme débris : il bascule, rebondit puis s'enfonce.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// couleur des éclats par type
const CHIPS = { lampadaire: '#2b3a33', potelet: '#3a2a22', terrasse: '#8a6a45', bouquiniste: '#2f5a3a', vauban: '#9aa0a6', feu: '#333', panneau: '#c8c8c8', poubelle: '#4b6b3b', jardiniere: '#6b5a44', dab: '#9aa0aa', parcmetre: '#30404c', topiaire: '#3f6b33', conteneur: '#3d6b45', cordon: '#c9a646', parasol: '#d8c9a8', scooter: '#c33', chevalet: '#8a6a45', morris: '#2f4a3a', etal: '#9a7b52', velos: '#556', distributeur: '#c44', palette: '#b08a58', abribus: '#9fb7c4', kiosque: '#2f4a3a', cagettes: '#b08a58', colonne_verre: '#3f6b33', barricade: '#777', projecteur: '#333', brasero: '#552' };
// objets qui tombent comme un arbre (pivot au pied) ; les autres sont projetés et roulent
const TALL = /lampadaire|feu|panneau|potelet|parasol|morris|colonne|projecteur|topiaire/;

// géométrie en flottants dans le repère du monde, avec les attributs voulus
function flatGeo(mesh, attrs) {
  const src = mesh.geometry, g = new THREE.BufferGeometry();
  for (const n of attrs) {
    const a = src.attributes[n];
    if (!a) { const sz = n === 'uv' ? 2 : n === 'color' ? 3 : 3; g.setAttribute(n, new THREE.Float32BufferAttribute(new Float32Array(src.attributes.position.count * sz).fill(n === 'color' ? 1 : 0), sz)); continue; }
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(n, new THREE.Float32BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(Array.from(src.index.array)); else g.setIndex(Array.from({ length: src.attributes.position.count }, (_, i) => i));
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

export function createCassables({ nodes, scene, world, fx, audio }) {
  const byId = new Map(); const groups = new Map(); // matériau → [{ geo, entry }]
  scene.updateMatrixWorld(true);
  for (const node of nodes) {
    const ex = node.userData; const id = ex.cassable;
    const gp = world.gp.cassables?.find?.((c) => c.id === id);
    const e = { id, type: ex.type || gp?.type || 'objet', pv: ex.pv ?? gp?.pv ?? 60, max: ex.pv ?? gp?.pv ?? 60, points: ex.points ?? gp?.points ?? 10, butin: gp?.butin || ex.butin || null, node, parts: [], cols: [], broken: false, pos: node.getWorldPosition(V()), yaw: gp?.yaw ?? 0 };
    node.traverse((o) => { if (!o.isMesh) return; const m = o.material; const key = m.uuid; if (!groups.has(key)) groups.set(key, { mat: m, list: [] }); groups.get(key).list.push({ mesh: o, e }); });
    byId.set(id, e);
  }
  for (const c of world.colliders) if (c.cassable && byId.has(c.cassable)) byId.get(c.cassable).cols.push(c);
  // fusion par matériau
  const merged = [];
  for (const { mat, list } of groups.values()) {
    const has = (n) => list.every(({ mesh }) => mesh.geometry.attributes[n]);
    const attrs = ['position', 'normal']; if (list.some(({ mesh }) => mesh.geometry.attributes.uv)) attrs.push('uv'); if (has('color') || mat.vertexColors) attrs.push('color');
    const geos = []; let v0 = 0;
    for (const { mesh, e } of list) { const g = flatGeo(mesh, attrs); const n = g.attributes.position.count; e.parts.push({ start: v0, count: n, idx: merged.length }); v0 += n; geos.push(g); }
    const geo = mergeGeometries(geos, false); if (!geo) continue; for (const g of geos) g.dispose();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.castShadow = !/glass|glow|lamp|vitre/.test(mat.name || ''); m.receiveShadow = true; m.name = 'cassables_' + (mat.name || 'mat');
    m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); merged.push(m);
  }
  // les nœuds d'origine sortent de la map (ils serviront de débris)
  for (const e of byId.values()) { e.node.removeFromParent(); }

  const debris = []; const listeners = [];
  function collapse(e) {
    for (const p of e.parts) { const m = merged[p.idx]; const pos = m.geometry.attributes.position; const x = pos.getX(p.start), y = pos.getY(p.start), z = pos.getZ(p.start);
      for (let i = p.start; i < p.start + p.count; i++) pos.setXYZ(i, x, y, z);
      pos.addUpdateRange(p.start * 3, p.count * 3); pos.needsUpdate = true; }
  }
  function restore(e) {
    // on retrouve les sommets d'origine à partir du nœud (réparation en fin de manche)
    e.node.updateMatrixWorld(true); let k = 0;
    e.node.traverse((o) => { if (!o.isMesh) return; const p = e.parts[k++]; if (!p) return; const m = merged[p.idx], pos = m.geometry.attributes.position, src = o.geometry.attributes.position, v = V();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(src, i).applyMatrix4(o.matrixWorld); pos.setXYZ(p.start + i, v.x, v.y, v.z); }
      pos.addUpdateRange(p.start * 3, p.count * 3); pos.needsUpdate = true; });
  }
  // casse : débris qui bascule dans la direction du coup
  function breakIt(e, dir, by) {
    if (e.broken) return; e.broken = true; e.pv = 0;
    for (const c of e.cols) c.off = true;
    if (e.cols.length) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const c of e.cols) { const r = c.type === 'box' ? Math.hypot(c.hx, c.hz) : c.r || 1; x0 = Math.min(x0, c.x - r); x1 = Math.max(x1, c.x + r); z0 = Math.min(z0, c.z - r); z1 = Math.max(z1, c.z + r); } world.refreshNav(x0 - 1, z0 - 1, x1 + 1, z1 + 1); }
    collapse(e);
    const d = (dir && Math.hypot(dir.x, dir.z) > 1e-3) ? V(dir.x, 0, dir.z).normalize() : V(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const n = e.node; n.position.copy(e.pos); scene.add(n); n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const tall = TALL.test(e.type);
    // pivot : axe horizontal perpendiculaire au coup
    const axis = V(d.z, 0, -d.x); const q0 = n.quaternion.clone();
    debris.push({ e, n, axis, q0, ang: 0, w: tall ? 0.6 : 2 + Math.random() * 2, tall, vel: tall ? V() : d.clone().multiplyScalar(3 + Math.random() * 3).setY(2.5), t: 0, y0: e.pos.y });
    const p = e.pos.clone().add(V(0, 0.6, 0)); fx.burst(p, 14, { color: CHIPS[e.type] || '#888', speed: 5, size: 0.07, life: 0.8 });
    if (/lampadaire|feu|projecteur|dab|distributeur|parcmetre/.test(e.type)) fx.burst(p.clone().add(V(0, tall ? 3 : 0.4, 0)), 10, { color: '#ffd27a', speed: 6, size: 0.03, emissive: true, life: 0.4 });
    audio.play(/abribus|kiosque|colonne_verre/.test(e.type) ? 'debris' : 'thud', e.pos, 0.9, [0.8, 1.1], 0.05);
    if (/abribus|kiosque|colonne_verre/.test(e.type)) audio.glass?.(e.pos);
    for (const f of listeners) f(e, by, d);
  }
  function damage(e, dmg, dir, by) { if (e.broken) return false; e.pv -= dmg; if (e.pv <= 0) breakIt(e, dir, by); return true; }
  function update(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const b = debris[i]; b.t += dt;
      if (b.tall) { // chute d'un objet haut autour de son pied, avec un petit rebond
        if (b.ang < Math.PI / 2) { b.w += dt * 5.5; b.ang = Math.min(Math.PI / 2, b.ang + b.w * dt); if (b.ang >= Math.PI / 2) { b.w = 0; audio.play('thud', b.n.position, 0.7, [0.7, 0.9], 0); } }
        b.n.quaternion.setFromAxisAngle(b.axis, b.ang).multiply(b.q0);
      } else { // objet projeté : vol, rebond, roulis
        b.vel.y -= 18 * dt; b.n.position.addScaledVector(b.vel, dt); const gy = world.groundY(b.n.position.x, b.n.position.z, b.n.position.y + 0.3);
        if (b.n.position.y < gy) { b.n.position.y = gy; if (Math.abs(b.vel.y) > 2) b.vel.y *= -0.3; else b.vel.y = 0; b.vel.x *= 0.6; b.vel.z *= 0.6; }
        b.ang = Math.min(Math.PI / 2, b.ang + b.w * dt * (Math.hypot(b.vel.x, b.vel.z) > 0.3 ? 1 : 0)); b.n.quaternion.setFromAxisAngle(b.axis, b.ang).multiply(b.q0);
      }
      if (b.t > 14) b.n.position.y -= dt * 0.4; // s'enfonce puis disparaît
      if (b.t > 17) { b.n.removeFromParent(); b.n.quaternion.copy(b.q0); b.n.position.copy(b.e.pos); debris.splice(i, 1); }
    }
  }
  // réparation (fin de manche ou objets cassés depuis longtemps)
  function repair(e) { if (!e.broken) return; e.broken = false; e.pv = e.max; for (const c of e.cols) c.off = false; restore(e);
    const b = debris.findIndex((d) => d.e === e); if (b >= 0) { const d = debris[b]; d.n.removeFromParent(); d.n.quaternion.copy(d.q0); d.n.position.copy(e.pos); debris.splice(b, 1); }
    for (const c of e.cols) { const r = c.type === 'box' ? Math.hypot(c.hx, c.hz) : c.r || 1; world.refreshNav(c.x - r - 1, c.z - r - 1, c.x + r + 1, c.z + r + 1); } }
  // dégâts de zone (explosions)
  function blast(p, r, dmg, by) { for (const e of byId.values()) { if (e.broken) continue; const d = e.pos.distanceTo(p); if (d < r) damage(e, dmg * (1 - d / r), V(e.pos.x - p.x, 0, e.pos.z - p.z), by); } }
  return { byId, list: [...byId.values()], damage, breakIt, blast, update, repair, onBreak: (f) => listeners.push(f), merged };
}
