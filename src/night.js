// Nuit façon émeute de cinéma : ciel bleu nuit, lampadaires au sodium, voitures en feu, fumée qui monte, gyrophares.
// Les lumières ponctuelles sont un petit lot réattribué aux lampadaires / feux les plus proches de la caméra.
import * as THREE from 'three';
import { skyEnvironment, realismUniforms } from './realisme.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function glowTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createNight({ scene, sun, hemi, renderer, world, mapRoot, fx, quality, getPost }) {
  const sky = scene.children.find((o) => o.material?.uniforms?.top);
  const day = { fog: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far, sunI: sun.intensity, sunC: sun.color.clone(), hemiI: hemi?.intensity, exp: renderer.toneMappingExposure, envI: scene.environmentIntensity, env: scene.environment, hemiS: hemi?.color.clone(), hemiG: hemi?.groundColor.clone(), wet: realismUniforms.uWet.value,
    sky: sky && ['top', 'mid', 'hor'].map((k) => sky.material.uniforms[k].value.clone()) };
  const lit = []; mapRoot.traverse((o) => { if (o.isMesh && o.material && /glow|glassLit/.test(o.material.name || '')) lit.push([o.material, o.material.emissive?.clone(), o.material.emissiveIntensity]); });
  // ampoules des lanternes et intérieurs (boutiques, halls) : allumés plus fort la nuit
  const glowMats = new Map(); mapRoot.traverse((o) => { if (o.isMesh && o.material && /^(lamp|inside)$/.test(o.material.name || '') && !glowMats.has(o.material)) glowMats.set(o.material, [o.material.emissive?.clone(), o.material.emissiveIntensity]); });
  // reflets de nuit : ciel bleu nuit, lueur orangée de la ville à l'horizon, lune froide (fabriqué une seule fois, au premier passage en nuit)
  let nightEnv = null; const getNightEnv = () => { if (nightEnv === null) { try { nightEnv = skyEnvironment(renderer, { top: '#0a1022', mid: '#18213a', horizon: '#3a2c2a', ground: '#1c1a1c', sunDir: sun.position.clone().normalize().toArray(), sunColor: '#a9bcff', sun: 1.2 }); } catch (e) { console.warn('reflets de nuit indisponibles', e); nightEnv = false; } } return nightEnv || day.env; };
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  // lampadaires : ampoules (une seule géométrie instanciée) et halos
  const lampCols = world.colliders.filter((c) => /lampadaire|candelabre/.test(c.tag || '') && c.x !== undefined && (c.y0 || 0) > -1);
  const lamps = lampCols.map((c) => V(c.x, world.groundY(c.x, c.z) + (c.tag === 'candelabre' ? 3.6 : 4.4), c.z));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd59a' }), Math.max(1, lamps.length));
  lamps.forEach((p, i) => bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z))); bulbs.count = lamps.length; group.add(bulbs);
  const haloTex = glowTex('rgba(255,220,160,0.9)', 'rgba(255,150,60,0.25)');
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
  const halos = lamps.map((p) => { const s = new THREE.Sprite(haloMat); s.position.copy(p); s.scale.setScalar(2.6); group.add(s); return s; });
  // flaques de lumière au sol : un seul maillage instancié (aucune lumière dynamique), sous chaque lampadaire, devant les vitrines et autour des feux
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.2)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
  const pools = []; // [x, y, z, sx, sz, yaw, r, g, b]
  const LAMP = [1.0, 0.62, 0.3], SHOP = [1.0, 0.78, 0.5], FIRE = [1.0, 0.42, 0.12];
  lamps.forEach((p) => pools.push([p.x, world.groundY(p.x, p.z), p.z, 10, 10, 0, ...LAMP]));
  for (const b of world.gp.boutiques || []) for (const v of b.vitrines || []) { const [x, , z] = v.centre, n = v.normale || [0, 0, 1]; const px = x + n[0] * 1.6, pz = z + n[2] * 1.6; const y = world.groundY(px, pz); if (!(y > -1)) continue;
    pools.push([px, y, pz, Math.max(3, (v.largeur || 2) * 2.2), 4.2, Math.atan2(n[0], n[2]), ...SHOP]); }
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, Math.max(1, pools.length + 8)); poolMesh.frustumCulled = false; poolMesh.renderOrder = 1;
  const poolM = new THREE.Matrix4(), poolQ = new THREE.Quaternion(), poolS = new THREE.Vector3(), poolP = new THREE.Vector3(), poolC = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
  const setPool = (i, x, y, z, sx, sz, yaw, r, g, b, k = 1) => { poolM.compose(poolP.set(x, y + 0.05, z), poolQ.setFromAxisAngle(UP, yaw), poolS.set(sx * (k ? 1 : 0), 1, sz * (k ? 1 : 0))); poolMesh.setMatrixAt(i, poolM); poolMesh.setColorAt(i, poolC.setRGB(r * 0.2, g * 0.2, b * 0.2)); };
  pools.forEach((q, i) => setPool(i, ...q)); poolMesh.count = pools.length; group.add(poolMesh);
  const lampOff = new Uint8Array(lamps.length); const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // lampadaire cassé : ampoule et halo éteints (et rallumés à la réparation)
  const checkLamps = () => { let ch = false; lampCols.forEach((c, i) => { const off = c.off ? 1 : 0; if (off !== lampOff[i]) { lampOff[i] = off; halos[i].visible = !off; setPool(i, ...pools[i].slice(0, 9), !off); poolMesh.instanceMatrix.needsUpdate = true; bulbs.setMatrixAt(i, off ? zero : new THREE.Matrix4().makeTranslation(lamps[i].x, lamps[i].y, lamps[i].z)); ch = true; } }); if (ch) bulbs.instanceMatrix.needsUpdate = true; };
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
  fires.forEach((f, i) => { const k = pools.length + i; if (k < pools.length + 8) { setPool(k, f.p.x, world.groundY(f.p.x, f.p.z), f.p.z, 14, 14, 0, ...FIRE); f.pool = k; } }); poolMesh.count = pools.length + Math.min(8, fires.length);
  poolMesh.instanceColor && (poolMesh.instanceColor.needsUpdate = true);
  // lot de lumières ponctuelles
  const nL = { bas: 3, moyen: 7, haut: 11 }[quality] ?? 7; const lights = [];
  for (let i = 0; i < nL; i++) { const l = new THREE.PointLight('#ffad5c', 0, 18, 1.6); group.add(l); lights.push(l); }
  // gyrophares des voitures de police
  const beacon = new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  let on = false, assignT = 0, t = 0;
  const bloomPass = () => getPost?.()?.passes?.find((p) => p.threshold !== undefined && p.strength !== undefined);
  function set(v) {
    on = v; group.visible = v;
    if (v) {
      // clair de lune lisible : on doit voir les silhouettes et le décor, la chaleur vient des lampadaires et des vitrines
      scene.fog.color.set('#1a2136'); scene.fog.near = 35; scene.fog.far = Math.max(320, day.far * 0.6); sun.intensity = 0.5; sun.color.set('#7390ff');
      if (hemi) { hemi.intensity = 0.34; hemi.color.set('#5068b0'); hemi.groundColor.set('#2a2630'); } renderer.toneMappingExposure = 1.08;
      scene.environment = getNightEnv(); scene.environmentIntensity = 0.35; realismUniforms.uWet.value = 0.8;
      if (sky) { sky.material.uniforms.top.value.set('#050a1a'); sky.material.uniforms.mid.value.set('#16203c'); sky.material.uniforms.hor.value.set('#5c3e33'); if (sky.material.uniforms.night) sky.material.uniforms.night.value = 1; }
      for (const [m] of lit) { m.emissive?.set(/glassLit/.test(m.name) ? '#ffc27a' : '#ffb070'); m.emissiveIntensity = /glassLit/.test(m.name) ? 1.05 : 1.6; }
      for (const [m] of glowMats) { m.emissive?.set(m.name === 'lamp' ? '#ffd29a' : '#ffcf96'); m.emissiveIntensity = m.name === 'lamp' ? 3 : 0.85; }
      const b = bloomPass(); if (b) { b.__day ??= [b.strength, b.threshold, b.radius]; b.strength = 0.5; b.threshold = 0.8; b.radius = 0.55; }
    } else {
      scene.fog.color.copy(day.fog); scene.fog.near = day.near; scene.fog.far = day.far; sun.intensity = day.sunI; sun.color.copy(day.sunC); if (hemi) hemi.intensity = day.hemiI; renderer.toneMappingExposure = day.exp; scene.environmentIntensity = day.envI ?? scene.environmentIntensity;
      if (sky) ['top', 'mid', 'hor'].forEach((k, i) => sky.material.uniforms[k].value.copy(day.sky[i]));
      for (const [m, e, i] of lit) { if (e) m.emissive.copy(e); m.emissiveIntensity = i; }
      for (const [m, [e, i]] of glowMats) { if (e) m.emissive.copy(e); m.emissiveIntensity = i; }
      if (hemi && day.hemiS) { hemi.color.copy(day.hemiS); hemi.groundColor.copy(day.hemiG); } scene.environment = day.env; realismUniforms.uWet.value = day.wet; if (sky?.material.uniforms.night) sky.material.uniforms.night.value = 0;
      const b = bloomPass(); if (b?.__day) [b.strength, b.threshold, b.radius] = b.__day;
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
    for (const l of lights) l.intensity = l.userData.fire ? 26 + Math.sin(t * 23 + l.position.x) * 6 + Math.random() * 6 : 11;
    if (fires.length && poolMesh.instanceColor) { for (const f of fires) if (f.pool != null) { const k = 0.85 + Math.sin(t * 17 + f.p.x) * 0.1 + Math.random() * 0.1; poolMesh.setColorAt(f.pool, poolC.setRGB(FIRE[0] * 0.3 * k, FIRE[1] * 0.3 * k, FIRE[2] * 0.3 * k)); } poolMesh.instanceColor.needsUpdate = true; }
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
