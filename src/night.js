// Nuit façon émeute de cinéma : ciel bleu nuit, lampadaires au sodium, voitures en feu, fumée qui monte, gyrophares.
// Les lumières ponctuelles sont un petit lot réattribué aux lampadaires / feux les plus proches de la caméra.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function glowTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createNight({ scene, sun, hemi, renderer, world, mapRoot, fx, quality }) {
  const sky = scene.children.find((o) => o.material?.uniforms?.top);
  const day = { fog: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far, sunI: sun.intensity, sunC: sun.color.clone(), hemiI: hemi?.intensity, exp: renderer.toneMappingExposure, envI: scene.environmentIntensity,
    sky: sky && ['top', 'mid', 'hor'].map((k) => sky.material.uniforms[k].value.clone()) };
  const lit = []; mapRoot.traverse((o) => { if (o.isMesh && o.material && /glow|glassLit/.test(o.material.name || '')) lit.push([o.material, o.material.emissive?.clone(), o.material.emissiveIntensity]); });
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  // lampadaires : ampoules (une seule géométrie instanciée) et halos
  const lampCols = world.colliders.filter((c) => /lampadaire|candelabre/.test(c.tag || '') && c.x !== undefined && (c.y0 || 0) > -1);
  const lamps = lampCols.map((c) => V(c.x, world.groundY(c.x, c.z) + (c.tag === 'candelabre' ? 3.6 : 4.4), c.z));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd59a' }), Math.max(1, lamps.length));
  lamps.forEach((p, i) => bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z))); bulbs.count = lamps.length; group.add(bulbs);
  const haloTex = glowTex('rgba(255,220,160,0.9)', 'rgba(255,150,60,0.25)');
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
  const halos = lamps.map((p) => { const s = new THREE.Sprite(haloMat); s.position.copy(p); s.scale.setScalar(2.6); group.add(s); return s; });
  const lampOff = new Uint8Array(lamps.length); const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // lampadaire cassé : ampoule et halo éteints (et rallumés à la réparation)
  const checkLamps = () => { let ch = false; lampCols.forEach((c, i) => { const off = c.off ? 1 : 0; if (off !== lampOff[i]) { lampOff[i] = off; halos[i].visible = !off; bulbs.setMatrixAt(i, off ? zero : new THREE.Matrix4().makeTranslation(lamps[i].x, lamps[i].y, lamps[i].z)); ch = true; } }); if (ch) bulbs.instanceMatrix.needsUpdate = true; };
  // voitures en feu et barricades qui brûlent
  const fireTex = glowTex('rgba(255,240,180,1)', 'rgba(255,90,20,0.6)');
  // barricades (voitures renversées, palettes), braseros, puis poubelles et conteneurs qui brûlent
  const gp = world.gp; const spots = [...(gp.parkings || []).filter((p) => p.renversee), ...world.colliders.filter((c) => /voiture|barricade|fourgon|brasero/.test(c.tag || '') && (c.y0 || 0) > -1), ...(gp.cassables || []).filter((c) => /poubelle|conteneur/.test(c.type)).map((c) => ({ x: c.pos[0], z: c.pos[2] }))];
  const fires = [];
  for (const c of spots.map((c, i) => [c, i < 6 ? -1 : Math.random()]).sort((a, b) => a[1] - b[1]).map((e) => e[0])) {
    const x = c.x ?? (c.bb ? (c.bb[0] + c.bb[2]) / 2 : null), z = c.z ?? (c.bb ? (c.bb[1] + c.bb[3]) / 2 : null); if (x == null) continue;
    if (fires.some((f) => Math.hypot(f.p.x - x, f.p.z - z) < 45)) continue;
    const p = V(x, world.groundY(x, z) + 1.1, z); const g = new THREE.Group(); g.position.copy(p);
    const flames = []; for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.position.set((Math.random() - 0.5) * 1.6, Math.random() * 0.5, (Math.random() - 0.5) * 1.2); g.add(s); flames.push(s); }
    group.add(g); fires.push({ p, flames, smokeT: Math.random() }); if (fires.length >= 7) break;
  }
  // lot de lumières ponctuelles
  const nL = { bas: 3, moyen: 7, haut: 11 }[quality] ?? 7; const lights = [];
  for (let i = 0; i < nL; i++) { const l = new THREE.PointLight('#ffad5c', 0, 18, 1.6); group.add(l); lights.push(l); }
  // gyrophares des voitures de police
  const beacon = new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  let on = false, assignT = 0, t = 0;
  function set(v) {
    on = v; group.visible = v;
    if (v) {
      scene.fog.color.set('#141a2a'); scene.fog.near = 12; scene.fog.far = 230; sun.intensity = 0.3; sun.color.set('#7f98ff'); if (hemi) hemi.intensity = 0.14; renderer.toneMappingExposure = 1.05; scene.environmentIntensity = 0.05;
      if (sky) { sky.material.uniforms.top.value.set('#03050d'); sky.material.uniforms.mid.value.set('#0d1426'); sky.material.uniforms.hor.value.set('#3a2a2a'); }
      for (const [m] of lit) { m.emissive?.set(/glassLit/.test(m.name) ? '#ffc27a' : '#ffb070'); m.emissiveIntensity = /glassLit/.test(m.name) ? 0.9 : 1.2; }
    } else {
      scene.fog.color.copy(day.fog); scene.fog.near = day.near; scene.fog.far = day.far; sun.intensity = day.sunI; sun.color.copy(day.sunC); if (hemi) hemi.intensity = day.hemiI; renderer.toneMappingExposure = day.exp; scene.environmentIntensity = day.envI ?? scene.environmentIntensity;
      if (sky) ['top', 'mid', 'hor'].forEach((k, i) => sky.material.uniforms[k].value.copy(day.sky[i]));
      for (const [m, e, i] of lit) { if (e) m.emissive.copy(e); m.emissiveIntensity = i; }
    }
  }
  function update(dt, camPos, cars) {
    if (!on) return; t += dt; assignT -= dt;
    if (assignT <= 0) {
      assignT = 0.35; checkLamps();
      const cand = fires.map((f) => ({ p: f.p, fire: true, d: f.p.distanceToSquared(camPos) * 0.35 })).concat(lamps.filter((p, i) => !lampOff[i]).map((p) => ({ p, fire: false, d: p.distanceToSquared(camPos) })));
      cand.sort((a, b) => a.d - b.d);
      lights.forEach((l, i) => { const c = cand[i]; if (!c) { l.intensity = 0; return; } l.position.copy(c.p); l.position.y += c.fire ? 0.8 : -0.3; l.userData.fire = c.fire; l.color.set(c.fire ? '#ff7a2a' : '#ffad5c'); l.distance = c.fire ? 22 : 17; });
    }
    for (const l of lights) l.intensity = l.userData.fire ? 26 + Math.sin(t * 23 + l.position.x) * 6 + Math.random() * 6 : 14;
    for (const f of fires) {
      f.flames.forEach((s, i) => { const k = 1.4 + Math.sin(t * (9 + i * 3) + i) * 0.35 + Math.random() * 0.25; s.scale.set(k, k * 1.5, 1); s.position.y = 0.2 + ((t * 0.9 + i * 0.27) % 1) * 0.6; });
      f.smokeT -= dt; if (f.smokeT <= 0 && f.p.distanceToSquared(camPos) < 110 * 110) { f.smokeT = 0.28; fx.burst(f.p.clone().add(V((Math.random() - 0.5) * 1.5, 1.6, (Math.random() - 0.5) * 1.5)), 1, { color: '#1c1c1f', speed: 0.6, size: 0.9, life: 4.5, grav: -1.1, opacity: 0.55 }); if (Math.random() < 0.3) fx.burst(f.p.clone().add(V(0, 0.8, 0)), 2, { color: '#ffb347', speed: 2.5, size: 0.04, life: 0.9, grav: -2, emissive: true }); }
    }
    for (const c of cars || []) { if (!c.police || c.dead) continue;
      if (!c.beacons) { c.beacons = ['#ff2a2a', '#2a5bff'].map((col, i) => { const s = new THREE.Sprite(beacon.clone()); s.material.color.set(col); s.position.set((i ? 0.35 : -0.35) * c.W, c.H + 0.05, 0); s.scale.setScalar(1.1); c.obj.add(s); return s; }); }
      const ph = Math.floor(t * 6) % 2; c.beacons[0].visible = ph === 0; c.beacons[1].visible = ph === 1; }
  }
  return { set, update, get on() { return on; } };
}
