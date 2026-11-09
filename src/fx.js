// Effets : traçantes, flammes de bouche, étincelles, éclats de verre, impacts, nombres de dégâts, nuages (lacrymo, fumée), explosions.
import * as THREE from 'three';

function softTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function puffTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) { const x = 64 + (Math.random() - 0.5) * 60, y = 64 + (Math.random() - 0.5) * 60, r = 14 + Math.random() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFX(scene, camera) {
  const glowT = softTex(), puffT = puffTex();
  const items = [];
  // traçantes : segments étirés et additifs
  const tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  function tracer(a, b, color) {
    const L = a.distanceTo(b); if (L < 0.5) return;
    const m = new THREE.Mesh(tracerGeo, color ? tracerMat.clone() : tracerMat); if (color) m.material.color.set(color);
    m.position.copy(a); m.lookAt(b); const seg = Math.min(L, 6 + L * 0.15); m.scale.set(1, 1, seg);
    scene.add(m); items.push({ o: m, t: 0, life: Math.min(0.12, L / 300 + 0.04), upd: (it, k) => { const p = k; m.position.lerpVectors(a, b, Math.min(1, p * 1.0)); m.scale.z = seg * (1 - p * 0.5); m.material.opacity = 0.9 * (1 - p); } });
  }
  // flamme de bouche + lumière
  const flashMat = new THREE.SpriteMaterial({ map: glowT, color: '#ffc46b', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flashLight = new THREE.PointLight('#ffb35c', 0, 9, 2); scene.add(flashLight);
  function muzzle(pos, big = 1) {
    const s = new THREE.Sprite(flashMat); s.position.copy(pos); const k = (0.35 + Math.random() * 0.25) * big; s.scale.set(k, k, k); s.material.rotation = Math.random() * 6;
    scene.add(s); items.push({ o: s, t: 0, life: 0.05 });
    flashLight.position.copy(pos); flashLight.intensity = 14 * big; flashT = 0.05;
  }
  let flashT = 0;
  // particules ponctuelles (étincelles, verre, débris, confettis)
  const pGeo = new THREE.BoxGeometry(1, 1, 1);
  function burst(pos, n, opts = {}) {
    const { color = '#ffd27a', speed = 4, size = 0.04, life = 0.5, grav = 9, normal = null, emissive = false, spread = 1 } = opts;
    for (let i = 0; i < n; i++) {
      const mat = emissive ? new THREE.MeshBasicMaterial({ color, transparent: true }) : new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.3, transparent: true, opacity: opts.opacity ?? 1 });
      const m = new THREE.Mesh(pGeo, mat); m.position.copy(pos); const s = size * (0.5 + Math.random()); m.scale.set(s, s * (opts.flat ? 0.15 : 1), s * (opts.long ? 3 : 1));
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      if (normal) v.addScaledVector(normal, speed * spread * Math.random());
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(14);
      const L = life * (0.6 + Math.random() * 0.8);
      scene.add(m); items.push({ o: m, t: 0, life: L, upd: (it, k, dt) => { v.y -= grav * dt; m.position.addScaledVector(v, dt); m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; if (m.position.y < 0.02) { m.position.y = 0.02; v.multiplyScalar(0.4); v.y = Math.abs(v.y) * 0.3; } if (k > 0.6) m.material.opacity = (1 - k) / 0.4; } });
    }
  }
  // impacts (petits trous sombres, persistants un moment)
  const decalMat = new THREE.MeshBasicMaterial({ color: '#1a1714', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const decalGeo = new THREE.CircleGeometry(0.05, 6);
  const decals = [];
  function decal(pos, n) {
    const m = new THREE.Mesh(decalGeo, decalMat); m.position.copy(pos).addScaledVector(new THREE.Vector3(...n), 0.01); m.lookAt(m.position.clone().add(new THREE.Vector3(...n)));
    scene.add(m); decals.push(m); if (decals.length > 120) scene.remove(decals.shift());
  }
  function impact(pos, n, kind = 'world') {
    const nv = new THREE.Vector3(...(n || [0, 1, 0]));
    if (kind === 'flesh') burst(pos, 6, { color: '#b3132a', speed: 2.5, size: 0.05, life: 0.4, normal: nv });
    else if (kind === 'glass') burst(pos, 8, { color: '#cfe8ff', speed: 3, size: 0.06, life: 0.8, flat: true, normal: nv, opacity: 0.7 });
    else if (kind === 'metal') { burst(pos, 7, { color: '#ffd27a', speed: 6, size: 0.02, life: 0.25, emissive: true, long: true, normal: nv }); decal(pos, n); }
    else { burst(pos, 4, { color: '#ffd27a', speed: 5, size: 0.02, life: 0.2, emissive: true, long: true, normal: nv }); burst(pos, 4, { color: '#bfb2a0', speed: 1.5, size: 0.04, life: 0.6, normal: nv }); decal(pos, n); }
  }
  function shatter(center, w, h, normal) { // vitrine qui éclate
    const n = new THREE.Vector3(...normal);
    for (let i = 0; i < 46; i++) { const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * w * Math.abs(n.z) + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * h, (Math.random() - 0.5) * w * Math.abs(n.x))); burst(p, 1, { color: '#d6ecff', speed: 3.5, size: 0.16, life: 1.6, flat: true, normal: n, spread: 0.8, opacity: 0.75 }); }
  }
  // douilles éjectées : laiton qui rebondit sur le sol puis reste un moment
  const casingGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.028, 6).rotateZ(Math.PI / 2);
  const casingMat = new THREE.MeshStandardMaterial({ color: '#c9a043', metalness: 0.85, roughness: 0.3 });
  const shellMat = new THREE.MeshStandardMaterial({ color: '#b3261e', metalness: 0.2, roughness: 0.5 });
  const casings = []; let groundFn = null; let onTink = null;
  function setGround(fn, tink) { groundFn = fn; onTink = tink; }
  function casing(pos, right, big = false) {
    const m = new THREE.Mesh(casingGeo, big ? shellMat : casingMat); if (big) m.scale.set(2.2, 2.2, 2.2); m.position.copy(pos); scene.add(m);
    const v = right.clone().multiplyScalar(1.8 + Math.random() * 1.2); v.y += 1.6 + Math.random(); v.x += (Math.random() - 0.5) * 0.6; v.z += (Math.random() - 0.5) * 0.6;
    const spin = new THREE.Vector3(Math.random() * 30, Math.random() * 30, Math.random() * 30); const gy = groundFn ? groundFn(pos.x, pos.z, pos.y) : 0; let bounces = 0;
    casings.push(m); if (casings.length > 70) { const o = casings.shift(); scene.remove(o); }
    items.push({ o: null, t: 0, life: 6, upd: (it, k, dt) => { if (bounces > 2) return; v.y -= 12 * dt; m.position.addScaledVector(v, dt); m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt;
      if (m.position.y < gy + 0.01) { m.position.y = gy + 0.01; v.y = Math.abs(v.y) * 0.35; v.x *= 0.5; v.z *= 0.5; spin.multiplyScalar(0.5); bounces++; if (bounces === 1) onTink?.(m.position, big); if (bounces > 2) { m.rotation.x = Math.PI / 2 * Math.round(m.rotation.x / (Math.PI / 2)); } } } });
  }
  // poussière (atterrissage, glissade, sprint)
  const dustMat = new THREE.SpriteMaterial({ map: puffT, color: '#cbbfae', transparent: true, depthWrite: false, opacity: 0 });
  function dust(pos, n = 6, power = 1) {
    for (let i = 0; i < n; i++) { const s = new THREE.Sprite(dustMat.clone()); s.position.copy(pos); s.position.y += 0.1; scene.add(s);
      const a = Math.random() * 6.28, sp = (0.8 + Math.random() * 1.2) * power; const v = new THREE.Vector3(Math.cos(a) * sp, 0.3 + Math.random() * 0.4, Math.sin(a) * sp);
      items.push({ o: s, t: 0, life: 0.9 + Math.random() * 0.6, upd: (it, k, dt) => { v.multiplyScalar(Math.exp(-dt * 3)); s.position.addScaledVector(v, dt); const sc = 0.3 + k * 1.1 * power; s.scale.set(sc, sc, sc); s.material.opacity = 0.35 * (1 - k) * Math.min(1, k * 8); }, end: () => s.material.dispose() }); }
  }
  // nombres de dégâts (DOM)
  const layer = document.createElement('div'); layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2'; document.body.appendChild(layer);
  const v3 = new THREE.Vector3();
  function number(pos, txt, color = '#fff', big = false) {
    const el = document.createElement('div'); el.textContent = txt;
    el.style.cssText = `position:absolute;font:${big ? 26 : 18}px Bungee,Inter,sans-serif;color:${color};text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,.6);transform:translate(-50%,-50%);white-space:nowrap`;
    layer.appendChild(el); const p = pos.clone(); const dx = (Math.random() - 0.5) * 0.6;
    items.push({ el, t: 0, life: 0.9, upd: (it, k) => { v3.copy(p); v3.y += k * 1.2; v3.x += dx * k; v3.project(camera); if (v3.z > 1) { el.style.display = 'none'; return; } el.style.display = ''; el.style.left = (v3.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-v3.y * 0.5 + 0.5) * innerHeight + 'px'; el.style.opacity = k < 0.7 ? 1 : (1 - k) / 0.3; el.style.transform = `translate(-50%,-50%) scale(${k < 0.1 ? 1 + (0.1 - k) * 6 : 1})`; } });
  }
  // nuages persistants (lacrymogène : blanc-jaune, fumigène : coloré)
  const clouds = [];
  // fumée réaliste : la grenade crache des bouffées pendant quelques secondes ; chaque bouffée
  // part en jet, ralentit, gonfle, monte un peu, dérive avec le vent puis se dissipe.
  const wind = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
  function cloud(pos, kind, owner) {
    const g = new THREE.Group(); scene.add(g);
    const gas = kind === 'gas', dark = kind === 'smoke-dark';
    const base = new THREE.Color(gas ? '#dcdccb' : dark ? '#4a4846' : '#d9dadc');
    const tint = gas ? null : dark ? null : new THREE.Color(['#ffb08a', '#ffc2dd', '#bfe9ff', '#d9ffc2'][(Math.random() * 4) | 0]);
    const c = { pos: pos.clone(), src: pos.clone(), kind, owner, r: 0.5, maxR: gas ? 6 : 5.5, t: 0, emitT: dark ? 1.2 : gas ? 9 : 10, life: dark ? 9 : gas ? 22 : 24, g, puffs: [], acc: 0, base, tint };
    // trop de nuages : les plus anciens arrêtent d'émettre
    if (clouds.length >= 14) clouds[0].emitT = Math.min(clouds[0].emitT, clouds[0].t);
    clouds.push(c); return c;
  }
  function puff(c) {
    const m = new THREE.SpriteMaterial({ map: puffT, color: c.base.clone(), transparent: true, depthWrite: false, opacity: 0, rotation: Math.random() * 6.28 });
    if (c.tint && Math.random() < 0.35) m.color.lerp(c.tint, 0.5);
    m.color.multiplyScalar(0.85 + Math.random() * 0.25);
    const s = new THREE.Sprite(m); s.position.copy(c.src); s.position.y += 0.2; c.g.add(s);
    const a = Math.random() * 6.28, jet = 2.5 + Math.random() * 3;
    s.userData = { v: new THREE.Vector3(Math.cos(a) * jet, 0.4 + Math.random() * 1.2, Math.sin(a) * jet), t: 0, life: 7 + Math.random() * 6, sz: 0.6 + Math.random() * 0.5, spin: (Math.random() - 0.5) * 0.3 };
    c.puffs.push(s);
  }
  function updateClouds(dt) {
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i]; c.t += dt;
      // débit fort au début puis qui faiblit
      if (c.t < c.emitT) { const rate = (c.kind === 'smoke-dark' ? 25 : 9) * (1 - 0.6 * c.t / c.emitT); c.acc += rate * dt; while (c.acc >= 1 && c.puffs.length < 60) { c.acc--; puff(c); } }
      let cx = 0, cz = 0, n = 0, rr = 0;
      for (let j = c.puffs.length - 1; j >= 0; j--) {
        const s = c.puffs[j], u = s.userData; u.t += dt; const k = u.t / u.life;
        if (k >= 1) { c.g.remove(s); s.material.dispose(); c.puffs.splice(j, 1); continue; }
        u.v.multiplyScalar(Math.exp(-dt * 1.6)); // freinage par l'air
        s.position.addScaledVector(u.v, dt).addScaledVector(wind, dt * Math.min(1, u.t / 2));
        s.position.y += dt * 0.18; if (s.position.y < c.src.y + u.sz * 0.6) s.position.y = c.src.y + u.sz * 0.6;
        const sc = (u.sz + Math.sqrt(u.t) * 1.35) * (c.kind === 'smoke-dark' ? 0.8 : 1); s.scale.set(sc, sc, sc); s.material.rotation += u.spin * dt;
        u.dens = (k < 0.08 ? k / 0.08 : 1) * Math.pow(1 - k, 1.4); // densité qui se dissipe
        s.material.opacity = (c.kind === 'smoke-dark' ? 0.5 : 0.42) * u.dens;
        u.r = sc * 0.45; cx += s.position.x; cz += s.position.z; n++;
      }
      if (n) { c.pos.set(cx / n, c.src.y, cz / n); for (const s of c.puffs) rr = Math.max(rr, Math.hypot(s.position.x - c.pos.x, s.position.z - c.pos.z) + s.userData.r * 0.6); c.r = rr; }
      if ((c.t > c.emitT && !c.puffs.length) || c.t > c.life + 15) { scene.remove(c.g); clouds.splice(i, 1); }
    }
  }
  // densité de fumée en un point (0 = air pur, ~1 = épais)
  function density(p, kinds) {
    let d = 0;
    for (const c of clouds) {
      if (kinds && !kinds.includes(c.kind)) continue;
      if (Math.abs(p.x - c.pos.x) > c.r + 3 || Math.abs(p.z - c.pos.z) > c.r + 3) continue;
      for (const s of c.puffs) { const u = s.userData; if (!u.dens) continue; const dx = p.x - s.position.x, dy = (p.y - s.position.y) * 0.8, dz = p.z - s.position.z; const q = (dx * dx + dy * dy + dz * dz) / (u.r * u.r); if (q < 4) d += u.dens * Math.exp(-q) * 0.35; }
    }
    return Math.min(1.5, d);
  }
  // explosion
  function explosion(pos) {
    burst(pos, 30, { color: '#ffb347', speed: 9, size: 0.12, life: 0.7, emissive: true });
    burst(pos, 16, { color: '#2b2b2b', speed: 4, size: 0.25, life: 1.6 });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: '#ff9a3d', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); s.position.copy(pos); scene.add(s);
    items.push({ o: s, t: 0, life: 0.6, upd: (it, k) => { const sc = 2 + k * 9; s.scale.set(sc, sc, sc); s.material.opacity = 1 - k; } });
    flashLight.position.copy(pos); flashLight.intensity = 60; flashT = 0.15;
    cloud(pos.clone(), 'smoke-dark');
  }
  // anneau qui s'élargit (capture, ramassage)
  function ring(pos, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos); m.position.y += 0.1; scene.add(m); items.push({ o: m, t: 0, life: 0.6, upd: (it, k) => { m.scale.setScalar(1 + k * 3); m.material.opacity = 1 - k; } });
  }
  function update(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.t += dt; const k = Math.min(1, it.t / it.life); it.upd?.(it, k, dt);
      if (it.t >= it.life) { if (it.o) { scene.remove(it.o); if (it.o.material && it.o.material !== tracerMat && it.o.material !== flashMat && it.o.material !== decalMat) it.o.material.dispose?.(); } if (it.el) it.el.remove(); items.splice(i, 1); }
    }
    flashT -= dt; if (flashT <= 0) flashLight.intensity = 0;
    updateClouds(dt);
  }
  return { casing, dust, setGround, tracer, muzzle, burst, impact, shatter, number, cloud, clouds, density, wind, explosion, ring, update, glowT };
}
