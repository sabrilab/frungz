// Effets : traçantes, flammes de bouche, étincelles, éclats de verre, impacts, nombres de dégâts, nuages (lacrymo, fumée), explosions.
//
// Optimisation « carnage » : avant, chaque étincelle, éclat, bouffée de fumée, traçante, douille ou impact était un objet
// Three.js à part, avec souvent son propre matériau. En 50 contre 50 avec des explosions, cela faisait des milliers d'objets
// et jusqu'à 2 600 appels de dessin par image, et des centaines de bouffées de fumée plein écran empilées (la carte
// graphique saturait). Maintenant tout passe par quelques réserves instanciées de taille fixe : une poignée d'appels de
// dessin quelle que soit la bagarre, aucun matériau créé en jeu, et des plafonds qui recyclent les plus anciens.
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

// ---------------------------------------------------------------- panneaux face caméra instanciés
// Un seul appel de dessin pour toutes les bouffées (ou tous les halos). Chaque panneau : position, taille, rotation, couleur, opacité.
// Les panneaux tout près de la caméra s'effacent (sinon une bouffée de 3 m posée sur l'objectif couvre tout l'écran :
// cent couches plein écran, c'est ce qui faisait caler la carte graphique dans la fumée).
function billboards(N, map, additive) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iSR = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage); // taille, rotation
  const iCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos); geo.setAttribute('iSR', iSR); geo.setAttribute('iCol', iCol); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) }, fog: true, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, defines: additive ? { ADDITIVE: 1 } : {},
    vertexShader: `attribute vec3 iPos; attribute vec2 iSR; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0); float c = cos(iSR.y), s = sin(iSR.y);
        vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSR.x; mvPosition.xy += q;
        float d = -mvPosition.z; vCol = iCol; vCol.a *= smoothstep(iSR.x * 0.35, iSR.x * 1.1 + 0.3, d);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
      #include <fog_pars_fragment>
      void main() { vec4 t = texture2D(map, vUv); float a = t.a * vCol.a; if (a < 0.004) discard;
        #ifdef ADDITIVE
          gl_FragColor = vec4(vCol.rgb * t.rgb * a, 1.0);
        #else
          gl_FragColor = vec4(vCol.rgb * t.rgb, a);
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef ADDITIVE
          #ifdef USE_FOG
            #ifdef FOG_EXP2
              float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            #else
              float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
            #endif
            gl_FragColor.rgb *= 1.0 - fogFactor;
          #endif
        #else
          #include <fog_fragment>
        #endif
      }`,
  });
  if (additive) { mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; mat.blending = THREE.CustomBlending; }
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = additive ? 3 : 2;
  const live = []; // { p: Vector3, size, rot, r, g, b, a }
  function add(o) { if (live.length >= N) live.shift(); live.push(o); return o; }
  function remove(o) { const i = live.indexOf(o); if (i >= 0) live.splice(i, 1); }
  const cp = new THREE.Vector3();
  function flush(camera) {
    let n = 0;
    // fumée (mélange normal) : du plus loin au plus proche, sinon les bouffées se découpent les unes les autres
    if (!additive && live.length > 1) { cp.copy(camera.position); for (const o of live) o.d = o.p.distanceToSquared(cp); live.sort((u, v) => v.d - u.d); }
    const P = iPos.array, S = iSR.array, C = iCol.array;
    for (const o of live) { if (o.a <= 0.003 || o.size <= 0) continue; P[n * 3] = o.p.x; P[n * 3 + 1] = o.p.y; P[n * 3 + 2] = o.p.z; S[n * 2] = o.size; S[n * 2 + 1] = o.rot; C[n * 4] = o.r; C[n * 4 + 1] = o.g; C[n * 4 + 2] = o.b; C[n * 4 + 3] = o.a; n++; }
    geo.instanceCount = n; mesh.visible = n > 0;
    if (n) { iPos.addUpdateRange(0, n * 3); iSR.addUpdateRange(0, n * 2); iCol.addUpdateRange(0, n * 4); iPos.needsUpdate = iSR.needsUpdate = iCol.needsUpdate = true; }
  }
  return { mesh, add, remove, flush, live };
}

// ---------------------------------------------------------------- maillages instanciés à durée de vie (particules, traçantes)
function instPool(geo, mat, N) {
  const m = new THREE.InstancedMesh(geo, mat, N); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  return m;
}

export function createFX(scene, camera) {
  const glowT = softTex(), puffT = puffTex();
  const items = []; // effets à durée de vie (comportement par fonction upd)
  const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  // charge : 1 = normal ; le jeu la baisse quand les images/s chutent (moins d'éclats par explosion, fumée plus légère)
  let load = 1;
  const glow = billboards(320, glowT, true), smoke = billboards(700, puffT, false);
  scene.add(glow.mesh, smoke.mesh);

  // traçantes : segments étirés et additifs, tous dans un seul maillage instancié
  const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const tracerMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const TR = instPool(tracerGeo, tracerMat, 260); scene.add(TR); const tracers = [];
  const TRC = new THREE.Color('#ffe9a8');
  function tracer(a, b, color) {
    const L = a.distanceTo(b); if (L < 0.5) return;
    if (tracers.length >= 260) tracers.shift();
    const dir = b.clone().sub(a).normalize(); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    tracers.push({ a: a.clone(), b: b.clone(), q, seg: Math.min(L, 6 + L * 0.15), t: 0, life: Math.min(0.12, L / 300 + 0.04), col: color ? new THREE.Color(color) : TRC });
  }
  function updateTracers(dt) {
    let n = 0;
    for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.t += dt; if (t.t >= t.life) { tracers.splice(i, 1); continue; } }
    for (const t of tracers) { const k = t.t / t.life; _p.lerpVectors(t.a, t.b, k); _s.set(1, 1, t.seg * (1 - k * 0.5)); _m.compose(_p, t.q, _s); TR.setMatrixAt(n, _m); _c.copy(t.col).multiplyScalar(0.9 * (1 - k)); TR.setColorAt(n, _c); n++; }
    TR.count = n; TR.visible = n > 0; if (n) { TR.instanceMatrix.needsUpdate = true; TR.instanceColor.needsUpdate = true; }
  }

  // flamme de bouche + une seule lumière partagée
  const flashLight = new THREE.PointLight('#ffb35c', 0, 9, 2); scene.add(flashLight);
  const FLASH = new THREE.Color('#ffc46b');
  let flashT = 0;
  function sprite(pool, pos, size, color, alpha, life, upd) {
    const o = pool.add({ p: pos.clone(), size, rot: Math.random() * 6.28, r: color.r, g: color.g, b: color.b, a: alpha });
    items.push({ t: 0, life, upd: upd ? (it, k, dt) => upd(o, k, dt) : null, end: () => pool.remove(o) }); return o;
  }
  function muzzle(pos, big = 1) {
    const k = (0.35 + Math.random() * 0.25) * big; sprite(glow, pos, k, FLASH, 1, 0.05);
    // la lumière ne suit que les tirs proches de la caméra (au loin, elle n'éclaire rien de visible)
    if (pos.distanceToSquared(camera.position) < 45 * 45 || flashT <= 0) { flashLight.position.copy(pos); flashLight.position.y += 0.12; /* jamais pile sur une surface */ flashLight.intensity = 14 * big; flashT = 0.05; }
  }

  // particules ponctuelles (étincelles, verre, débris, confettis) : petits cubes instanciés, qui rétrécissent pour disparaître
  const pGeo = new THREE.BoxGeometry(1, 1, 1);
  const PN = 1400;
  const pools = {
    lit: instPool(pGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.3 }), PN),
    glow: instPool(pGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), PN),
    glass: instPool(pGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6, depthWrite: false }), 600),
  };
  for (const k in pools) scene.add(pools[k]);
  const parts = { lit: [], glow: [], glass: [] };
  const UP = new THREE.Vector3(0, 1, 0);
  function burst(pos, n, opts = {}) {
    const { color = '#ffd27a', speed = 4, size = 0.04, life = 0.5, grav = 9, normal = null, emissive = false, spread = 1 } = opts;
    // fumées légères (échappement, moteur en feu) : des bouffées plutôt que des cubes gris
    if ((opts.opacity ?? 1) < 0.5 || grav < 0) { puffBurst(pos, n, color, size, life, speed, grav, opts.opacity ?? 0.35, normal); return; }
    n = Math.max(1, Math.round(n * load));
    const kind = emissive ? 'glow' : (opts.opacity ?? 1) < 1 ? 'glass' : 'lit'; const L0 = parts[kind], cap = pools[kind].instanceMatrix.count;
    _c.set(color);
    for (let i = 0; i < n; i++) {
      const s = size * (0.5 + Math.random());
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      if (normal) v.addScaledVector(normal, speed * spread * Math.random());
      if (L0.length >= cap) L0.shift();
      L0.push({ p: pos.clone(), v, r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), spin: [Math.random() * 14, Math.random() * 14], sc: new THREE.Vector3(s, s * (opts.flat ? 0.15 : 1), s * (opts.long ? 3 : 1)), col: _c.clone(), t: 0, life: life * (0.6 + Math.random() * 0.8), grav });
    }
  }
  function updateParts(dt) {
    for (const kind in parts) {
      const L = parts[kind], M = pools[kind]; let n = 0;
      for (let i = L.length - 1; i >= 0; i--) if ((L[i].t += dt) >= L[i].life) L.splice(i, 1);
      for (const o of L) {
        o.v.y -= o.grav * dt; o.p.addScaledVector(o.v, dt); o.r.x += o.spin[0] * dt; o.r.y += o.spin[1] * dt;
        if (o.p.y < 0.02) { o.p.y = 0.02; o.v.multiplyScalar(0.4); o.v.y = Math.abs(o.v.y) * 0.3; }
        const k = o.t / o.life, f = k > 0.6 ? (1 - k) / 0.4 : 1;
        _q.setFromEuler(o.r); _s.copy(o.sc).multiplyScalar(f); _m.compose(o.p, _q, _s); M.setMatrixAt(n, _m); M.setColorAt(n, o.col); n++;
      }
      M.count = n; M.visible = n > 0; if (n) { M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true; }
    }
  }

  // impacts (petits trous sombres, persistants un moment) : anneau de 160 places
  const DN = 160;
  const DEC = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 6), new THREE.MeshBasicMaterial({ color: '#1a1714', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: true }), DN);
  DEC.frustumCulled = false; DEC.count = 0; scene.add(DEC); let decI = 0;
  const _o = new THREE.Object3D();
  function decal(pos, n) {
    _o.position.set(pos.x + n[0] * 0.01, pos.y + n[1] * 0.01, pos.z + n[2] * 0.01); _o.lookAt(_o.position.x + n[0], _o.position.y + n[1], _o.position.z + n[2]); _o.updateMatrix();
    DEC.setMatrixAt(decI, _o.matrix); decI = (decI + 1) % DN; DEC.count = Math.min(DN, DEC.count + 1); DEC.instanceMatrix.needsUpdate = true;
  }
  function impact(pos, n, kind = 'world') {
    const nv = new THREE.Vector3(...(n || [0, 1, 0]));
    if (kind === 'flesh') burst(pos, 6, { color: '#b3132a', speed: 2.5, size: 0.05, life: 0.4, normal: nv });
    else if (kind === 'glass') burst(pos, 8, { color: '#cfe8ff', speed: 3, size: 0.06, life: 0.8, flat: true, normal: nv, opacity: 0.7 });
    else if (kind === 'metal') { burst(pos, 7, { color: '#ffd27a', speed: 6, size: 0.02, life: 0.25, emissive: true, long: true, normal: nv }); decal(pos, n || [0, 1, 0]); }
    else { burst(pos, 4, { color: '#ffd27a', speed: 5, size: 0.02, life: 0.2, emissive: true, long: true, normal: nv }); burst(pos, 4, { color: '#bfb2a0', speed: 1.5, size: 0.04, life: 0.6, normal: nv }); decal(pos, n || [0, 1, 0]); }
  }
  function shatter(center, w, h, normal) { // vitrine qui éclate
    const n = new THREE.Vector3(...normal); const N = Math.round(46 * load);
    for (let i = 0; i < N; i++) { const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * w * Math.abs(n.z) + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * h, (Math.random() - 0.5) * w * Math.abs(n.x))); burst(p, 1, { color: '#d6ecff', speed: 3.5, size: 0.16, life: 1.6, flat: true, normal: n, spread: 0.8, opacity: 0.75 }); }
  }

  // douilles éjectées : laiton qui rebondit sur le sol puis reste un moment (deux anneaux instanciés de 70 places)
  const casingGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.028, 6).rotateZ(Math.PI / 2);
  const casingMat = new THREE.MeshStandardMaterial({ color: '#d4a94a', metalness: 0.35, roughness: 0.4, emissive: '#3a2a08' }); // sans carte d'environnement, un métal trop pur rend noir
  const shellMat = new THREE.MeshStandardMaterial({ color: '#b3261e', metalness: 0.2, roughness: 0.5 });
  const CN = 70; const CAS = [new THREE.InstancedMesh(casingGeo, casingMat, CN), new THREE.InstancedMesh(casingGeo, shellMat, CN)];
  for (const m of CAS) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
  const casings = [[], []]; let groundFn = null; let onTink = null;
  function setGround(fn, tink) { groundFn = fn; onTink = tink; }
  function casing(pos, right, big = false) {
    const L = casings[big ? 1 : 0]; if (L.length >= CN) L.shift();
    const v = right.clone().multiplyScalar(1.8 + Math.random() * 1.2); v.y += 1.6 + Math.random(); v.x += (Math.random() - 0.5) * 0.6; v.z += (Math.random() - 0.5) * 0.6;
    L.push({ p: pos.clone(), r: new THREE.Euler(), v, spin: new THREE.Vector3(Math.random() * 30, Math.random() * 30, Math.random() * 30), gy: groundFn ? groundFn(pos.x, pos.z, pos.y) : 0, bounces: 0, t: 0, big });
  }
  function updateCasings(dt) {
    for (let j = 0; j < 2; j++) {
      const L = casings[j], M = CAS[j]; const s = j ? 2.2 : 1; _s.set(s, s, s); let n = 0;
      for (let i = L.length - 1; i >= 0; i--) if ((L[i].t += dt) > 6) L.splice(i, 1);
      for (const c of L) {
        if (c.bounces <= 2) {
          c.v.y -= 12 * dt; c.p.addScaledVector(c.v, dt); c.r.x += c.spin.x * dt; c.r.y += c.spin.y * dt;
          if (c.p.y < c.gy + 0.01) { c.p.y = c.gy + 0.01; c.v.y = Math.abs(c.v.y) * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.spin.multiplyScalar(0.5); c.bounces++; if (c.bounces === 1) onTink?.(c.p, c.big); if (c.bounces > 2) c.r.x = Math.PI / 2 * Math.round(c.r.x / (Math.PI / 2)); }
        }
        _q.setFromEuler(c.r); _m.compose(c.p, _q, _s); M.setMatrixAt(n++, _m);
      }
      M.count = n; M.visible = n > 0; if (n) M.instanceMatrix.needsUpdate = true;
    }
  }

  // poussière (atterrissage, glissade, sprint)
  const DUST = new THREE.Color('#cbbfae');
  function dust(pos, n = 6, power = 1) {
    n = Math.max(1, Math.round(n * load));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (0.8 + Math.random() * 1.2) * power; const v = new THREE.Vector3(Math.cos(a) * sp, 0.3 + Math.random() * 0.4, Math.sin(a) * sp);
      const p = pos.clone(); p.y += 0.1;
      sprite(smoke, p, 0.3, DUST, 0, 0.9 + Math.random() * 0.6, (o, k, dt) => { v.multiplyScalar(Math.exp(-dt * 3)); o.p.addScaledVector(v, dt); o.size = 0.3 + k * 1.1 * power; o.a = 0.35 * (1 - k) * Math.min(1, k * 8); });
    }
  }
  // bouffées légères (échappement, carcasse qui fume, éclaboussures vaporeuses)
  function puffBurst(pos, n, color, size, life, speed, grav, op, normal) {
    _c.set(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8)); if (normal) v.addScaledVector(normal, speed * Math.random());
      const s0 = size * 2.2;
      sprite(smoke, pos, s0, _c, 0, life * (0.8 + Math.random() * 0.6), (o, k, dt) => { v.y -= grav * dt; v.multiplyScalar(Math.exp(-dt * 1.5)); o.p.addScaledVector(v, dt); o.size = s0 * (1 + k * 2.2); o.a = op * (1 - k) * Math.min(1, k * 6); o.rot += dt * 0.4; });
    }
  }

  // nombres de dégâts (DOM) ; au plus 24 à la fois
  const layer = document.createElement('div'); layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2'; document.body.appendChild(layer);
  const v3 = new THREE.Vector3(); const nums = [];
  function number(pos, txt, color = '#fff', big = false) {
    if (nums.length >= 24) { const o = nums.shift(); o.t = o.life; }
    const el = document.createElement('div'); el.textContent = txt;
    el.style.cssText = `position:absolute;left:0;top:0;font:${big ? 26 : 18}px Bungee,Inter,sans-serif;color:${color};text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,.6);white-space:nowrap;will-change:transform`;
    layer.appendChild(el); const p = pos.clone(); const dx = (Math.random() - 0.5) * 0.6;
    const it = { el, t: 0, life: 0.9, upd: (it, k) => { v3.copy(p); v3.y += k * 1.2; v3.x += dx * k; v3.project(camera); if (v3.z > 1) { el.style.display = 'none'; return; } el.style.display = ''; const x = (v3.x * 0.5 + 0.5) * innerWidth, y = (-v3.y * 0.5 + 0.5) * innerHeight; el.style.opacity = k < 0.7 ? 1 : (1 - k) / 0.3; el.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-50%) scale(${k < 0.1 ? 1 + (0.1 - k) * 6 : 1})`; }, end: () => { it.done = true; const i = nums.indexOf(it); if (i >= 0) nums.splice(i, 1); } };
    items.push(it); nums.push(it); return it;
  }

  // nuages persistants (lacrymo : blanc-jaune, fumigène : coloré)
  const clouds = [];
  // fumée réaliste : la grenade crache des bouffées pendant quelques secondes ; chaque bouffée
  // part en jet, ralentit, gonfle, monte un peu, dérive avec le vent puis se dissipe.
  // Plafond global de bouffées (PUFFS) : quand il est atteint, les nouveaux nuages émettent moins et les bouffées sont plus grosses.
  const PUFFS = 420;
  const wind = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
  let puffCount = 0;
  function cloud(pos, kind, owner) {
    const gas = kind === 'gas', dark = kind === 'smoke-dark';
    const base = new THREE.Color(gas ? '#dcdccb' : dark ? '#4a4846' : '#d9dadc');
    const tint = gas ? null : dark ? null : new THREE.Color(['#ffb08a', '#ffc2dd', '#bfe9ff', '#d9ffc2'][(Math.random() * 4) | 0]);
    const c = { pos: pos.clone(), src: pos.clone(), kind, owner, r: 0.5, maxR: gas ? 6 : 5.5, t: 0, emitT: dark ? 1.2 : gas ? 9 : 10, life: dark ? 9 : gas ? 22 : 24, puffs: [], acc: 0, base, tint };
    // trop de nuages : les plus anciens arrêtent d'émettre
    if (clouds.length >= 14) clouds[0].emitT = Math.min(clouds[0].emitT, clouds[0].t);
    clouds.push(c); return c;
  }
  function puff(c) {
    const col = c.base.clone(); if (c.tint && Math.random() < 0.35) col.lerp(c.tint, 0.5); col.multiplyScalar(0.85 + Math.random() * 0.25);
    const a = Math.random() * 6.28, jet = 2.5 + Math.random() * 3;
    const o = smoke.add({ p: c.src.clone(), size: 0, rot: Math.random() * 6.28, r: col.r, g: col.g, b: col.b, a: 0 }); o.p.y += 0.2;
    // compat : game.js lit s.position et s.userData (densité de fumée, lignes de vue)
    o.position = o.p; o.userData = { v: new THREE.Vector3(Math.cos(a) * jet, 0.4 + Math.random() * 1.2, Math.sin(a) * jet), t: 0, life: 7 + Math.random() * 6, sz: 0.6 + Math.random() * 0.5, spin: (Math.random() - 0.5) * 0.3, big: 1 };
    // beaucoup de fumée à l'écran : moins de bouffées mais plus grosses (même volume, beaucoup moins de couches à dessiner)
    if (puffCount > PUFFS * 0.6) o.userData.big = 1.5;
    c.puffs.push(o); puffCount++;
  }
  function updateClouds(dt) {
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i]; c.t += dt;
      // débit fort au début puis qui faiblit
      if (c.t < c.emitT) {
        const crowd = puffCount > PUFFS * 0.6 ? 0.45 : 1;
        const rate = (c.kind === 'smoke-dark' ? 25 : 9) * (1 - 0.6 * c.t / c.emitT) * crowd * load; c.acc += rate * dt;
        while (c.acc >= 1 && c.puffs.length < 45 && puffCount < PUFFS) { c.acc--; puff(c); } if (c.acc > 2) c.acc = 2;
      }
      let cx = 0, cz = 0, n = 0, rr = 0;
      for (let j = c.puffs.length - 1; j >= 0; j--) {
        const s = c.puffs[j], u = s.userData; u.t += dt; const k = u.t / u.life;
        if (k >= 1) { smoke.remove(s); c.puffs.splice(j, 1); puffCount--; continue; }
        u.v.multiplyScalar(Math.exp(-dt * 1.6)); // freinage par l'air
        s.p.addScaledVector(u.v, dt).addScaledVector(wind, dt * Math.min(1, u.t / 2));
        s.p.y += dt * 0.18; if (s.p.y < c.src.y + u.sz * 0.6) s.p.y = c.src.y + u.sz * 0.6;
        const sc = (u.sz + Math.sqrt(u.t) * 1.35) * (c.kind === 'smoke-dark' ? 0.8 : 1) * u.big; s.size = sc; s.rot += u.spin * dt;
        u.dens = (k < 0.08 ? k / 0.08 : 1) * Math.pow(1 - k, 1.4) * Math.sqrt(u.big); // densité qui se dissipe
        s.a = (c.kind === 'smoke-dark' ? 0.5 : 0.42) * u.dens;
        u.r = sc * 0.45; cx += s.p.x; cz += s.p.z; n++;
      }
      if (n) { c.pos.set(cx / n, c.src.y, cz / n); for (const s of c.puffs) rr = Math.max(rr, Math.hypot(s.p.x - c.pos.x, s.p.z - c.pos.z) + s.userData.r * 0.6); c.r = rr; }
      if ((c.t > c.emitT && !c.puffs.length) || c.t > c.life + 15) { for (const s of c.puffs) { smoke.remove(s); puffCount--; } clouds.splice(i, 1); }
    }
  }
  // densité de fumée en un point (0 = air pur, ~1 = épais)
  function density(p, kinds) {
    let d = 0;
    for (const c of clouds) {
      if (kinds && !kinds.includes(c.kind)) continue;
      if (Math.abs(p.x - c.pos.x) > c.r + 3 || Math.abs(p.z - c.pos.z) > c.r + 3) continue;
      for (const s of c.puffs) { const u = s.userData; if (!u.dens) continue; const dx = p.x - s.p.x, dy = (p.y - s.p.y) * 0.8, dz = p.z - s.p.z; const q = (dx * dx + dy * dy + dz * dz) / (u.r * u.r); if (q < 4) d += u.dens * Math.exp(-q) * 0.35; }
    }
    return Math.min(1.5, d);
  }
  // explosion
  const BOOM = new THREE.Color('#ff9a3d');
  function explosion(pos) {
    burst(pos, 30, { color: '#ffb347', speed: 9, size: 0.12, life: 0.7, emissive: true });
    burst(pos, 16, { color: '#2b2b2b', speed: 4, size: 0.25, life: 1.6 });
    sprite(glow, pos, 2, BOOM, 1, 0.6, (o, k) => { o.size = 2 + k * 9; o.a = 1 - k; });
    // la lumière d'explosion ne bouge que pour une explosion visible de près, ou si elle est libre
    if (pos.distanceToSquared(camera.position) < 80 * 80 || flashT <= 0) { flashLight.position.copy(pos); flashLight.position.y += 0.6; flashLight.intensity = 60; flashT = 0.15; }
    cloud(pos.clone(), 'smoke-dark');
  }
  // anneau qui s'élargit (capture, ramassage) : géométrie partagée (avant, une nouvelle géométrie jamais libérée à chaque anneau)
  const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
  function ring(pos, color) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos); m.position.y += 0.1; scene.add(m);
    items.push({ t: 0, life: 0.6, upd: (it, k) => { m.scale.setScalar(1 + k * 3); m.material.opacity = 1 - k; }, end: () => { scene.remove(m); m.material.dispose(); } });
  }
  function update(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.t += dt; const k = Math.min(1, it.t / it.life); it.upd?.(it, k, dt);
      if (it.t >= it.life) { it.end?.(); if (it.el) it.el.remove(); items.splice(i, 1); }
    }
    flashT -= dt; if (flashT <= 0) flashLight.intensity = 0;
    updateClouds(dt); updateParts(dt); updateTracers(dt); updateCasings(dt);
    glow.flush(camera); smoke.flush(camera);
  }
  function setLoad(k) { load = Math.max(0.35, Math.min(1, k)); }
  function stats() { return { items: items.length, parts: parts.lit.length + parts.glow.length + parts.glass.length, puffs: puffCount, smoke: smoke.live.length, glow: glow.live.length, tracers: tracers.length, clouds: clouds.length, load }; }
  return { _meshes: { glow: glow.mesh, smoke: smoke.mesh }, casing, dust, setGround, tracer, muzzle, burst, impact, shatter, number, cloud, clouds, density, wind, explosion, ring, update, glowT, setLoad, stats };
}
