// Décor du salon d'accueil : une vraie scène autour de l'équipe.
// - lumière de fin de journée (soleil bas derrière l'équipe, ciel orangé, brume chaude) tant que la nuit d'émeute n'est pas choisie ;
// - barrières de police, fumigènes aux couleurs du camp, poussière qui flotte dans la lumière, brume au loin ;
// - la nuit, la Tour Eiffel scintille et son phare tourne (carte Paris).
// Tout est rattaché au groupe du salon (caché en partie) ; la lumière est rendue à la nuit/au jour du jeu en sortant du salon.
import * as THREE from 'three';
import { skyEnvironment, realismUniforms } from './realisme.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const GREY = new THREE.Color('#c8c4c0');

function canvasTex(S, draw) {
  const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// bouffée de fumée : plusieurs disques flous superposés, bords irréguliers
const puffTex = () => canvasTex(128, (g, S) => {
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + rnd(-22, 22), y = S / 2 + rnd(-22, 22), r = rnd(20, 44);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
});
const dotTex = () => canvasTex(32, (g, S) => {
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
});

// barrière de police « Vauban » : cadre en tube galvanisé, barreaux verticaux, deux pieds plats
function barrier() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.85, roughness: 0.38 });
  const tube = (len, r = 0.022) => new THREE.CylinderGeometry(r, r, len, 8);
  const W = 2, H = 1.0, y0 = 0.12;
  const add = (geo, x, y, z = 0, rz = 0) => { const m = new THREE.Mesh(geo, metal); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; g.add(m); };
  add(tube(W), 0, y0 + H, 0, Math.PI / 2); add(tube(W), 0, y0 + 0.08, 0, Math.PI / 2);
  add(tube(H + 0.12, 0.026), -W / 2, y0 + H / 2); add(tube(H + 0.12, 0.026), W / 2, y0 + H / 2);
  for (let i = 1; i < 14; i++) add(tube(H - 0.08, 0.008), -W / 2 + (i * W) / 14, y0 + H / 2 + 0.04);
  // panneau « POLICE » au milieu
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.17), new THREE.MeshStandardMaterial({ color: '#f3f3f0', roughness: 0.6,
    map: canvasTex(128, (c, S) => { c.fillStyle = '#1c2f6b'; c.fillRect(0, 0, S, S); c.fillStyle = '#fff'; c.font = '900 34px Inter, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('POLICE', S / 2, S / 2 + 2); }) }));
  sign.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = 0.36 + v * 0.28; }); // bande du milieu de la texture carrée
  sign.position.set(0, y0 + H * 0.62, 0.012); g.add(sign); const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = -0.012; g.add(back);
  for (const x of [-W / 2, W / 2]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.55), metal); f.position.set(x, 0.015, 0); f.castShadow = true; g.add(f); const l = new THREE.Mesh(tube(0.12), metal); l.position.set(x, 0.07, 0); g.add(l); }
  return g;
}

export function createDecor({ root, scene, sun, hemi, renderer, night, world, camera }) {
  const decor = new THREE.Group(); decor.name = 'salon-decor'; root.add(decor);
  const sky = scene.children.find((o) => o.material?.uniforms?.top && o.material.uniforms.sunDir);
  const SUN0 = sky ? sky.material.uniforms.sunDir.value.clone() : V(-0.48, 0.78, 0.4).normalize();
  // soleil couchant : derrière l'équipe (−z du salon), un peu sur la droite, très bas
  const SUNSET_LOCAL = V(0.42, 0.13, -0.9).normalize();
  const sunset = V();

  // ---- barrières : derrière l'équipe, en désordre (une renversée) ----
  const B = [[-4.9, -3.1, 0.55, 0], [-2.7, -4.6, 0.12, 0], [4.7, -3.4, -0.5, 0], [3.3, -5.4, 0.3, 1]];
  for (const [x, z, yaw, down] of B) {
    const b = barrier(); b.position.set(x, 0, z); b.rotation.y = yaw;
    if (down) { b.rotation.x = -Math.PI / 2 + 0.06; b.position.y = 0.05; b.position.z += 0.5; }
    decor.add(b);
  }

  // ---- fumigènes : bâton rouge au sol, flamme vive, lumière qui vacille, fumée colorée qui monte et dérive ----
  const smokeMap = puffTex();
  const flares = [V(-4.4, 0.04, -2.9), V(3.9, 0.04, -2.6)].map((p, k) => {
    const g = new THREE.Group(); g.position.copy(p); decor.add(g);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), new THREE.MeshStandardMaterial({ color: '#b3231c', roughness: 0.6 }));
    stick.rotation.z = Math.PI / 2 - 0.25; stick.rotation.y = k ? 0.8 : -0.6; stick.position.y = 0.04; stick.castShadow = true; g.add(stick);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: '#ff5a3a', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flame.position.set(0.14 * (k ? 1 : -1), 0.08, 0); flame.scale.setScalar(0.5); g.add(flame);
    const light = new THREE.PointLight('#ff4a2a', 3, 6, 1.6); light.position.set(0, 0.35, 0); g.add(light);
    const puffs = Array.from({ length: 34 }, (_, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, color: '#ffffff', transparent: true, depthWrite: false, opacity: 0 }));
      s.renderOrder = 4; g.add(s); return { s, age: (i / 34) * 6, life: 6, vx: 0, vz: 0, rot: rnd(-0.4, 0.4) };
    });
    return { g, flame, light, puffs, col: new THREE.Color('#fff'), seed: Math.random() * 10 };
  });

  // ---- poussière / braises qui flottent dans la lumière ----
  const N = 260, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-7, 7); pos[i * 3 + 1] = rnd(0, 5); pos[i * 3 + 2] = rnd(-9, 4); seed[i] = Math.random(); }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dustGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const dustMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { t: { value: 0 }, map: { value: dotTex() }, col: { value: new THREE.Color('#ffc37a') }, k: { value: 1 }, px: { value: 1 } },
    vertexShader: `uniform float t, px; attribute float seed; varying float vA;
      void main(){ vec3 p = position; float s = seed * 6.2831;
        p.y = mod(p.y + t * (0.12 + seed * 0.18), 5.0); p.x += sin(t * 0.4 + s) * 0.35; p.z += cos(t * 0.31 + s * 1.7) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = px * (14.0 + seed * 22.0) / -mv.z; vA = smoothstep(0.0, 0.6, p.y) * (1.0 - smoothstep(4.0, 5.0, p.y)) * (0.35 + 0.65 * sin(t * (0.6 + seed) + s * 3.0) * sin(t * (0.6 + seed) + s * 3.0)); }`,
    fragmentShader: 'uniform sampler2D map; uniform vec3 col; uniform float k; varying float vA; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(col * k, c.a * vA * 0.8); }' });
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.renderOrder = 5; decor.add(dust);

  // ---- brume chaude au loin, au ras du sol, derrière l'équipe ----
  const hazeMat = new THREE.SpriteMaterial({ map: smokeMap, color: '#ffd2a0', transparent: true, depthWrite: false, opacity: 0.22, fog: false });
  const haze = Array.from({ length: 7 }, (_, i) => { const s = new THREE.Sprite(hazeMat); s.position.set(-15 + i * 5 + rnd(-1.5, 1.5), rnd(1.2, 2.6), rnd(-22, -14)); s.scale.set(rnd(12, 18), rnd(4, 6), 1); s.renderOrder = 2; decor.add(s); return { s, x0: s.position.x, ph: Math.random() * 6 }; });

  // ---- la nuit : la Tour Eiffel scintille, son phare tourne (Paris seulement) ----
  const tour = world.gp?.extension?.tour; let sparkle = null, beacon = null, glow = null;
  if (tour) {
    const H = tour.hauteur || 165, prof = [[0, (tour.base || 62) / 2], [(tour.etages?.[0] || 28.5), 17], [(tour.etages?.[1] || 57.5), 9.5], [(tour.etages?.[2] || 138), 2.6], [H, 0.7]];
    const hw = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][0]) { const [y0, w0] = prof[i - 1], [y1, w1] = prof[i]; return w0 + (w1 - w0) * (y - y0) / (y1 - y0); } return 0.7; };
    const M = 5200, sp = new Float32Array(M * 3), ss = new Float32Array(M); const gy = world.groundY?.(tour.x, tour.z, 2) ?? 0;
    for (let i = 0; i < M; i++) {
      const y = Math.pow(Math.random(), 1.25) * H * 0.985, w = hw(y);
      // sur les arêtes surtout (les pieds), un peu sur les faces
      const side = (Math.random() * 4) | 0, u = Math.random() < 0.55 ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.85, 1) : rnd(-1, 1);
      const a = [[u, 1], [u, -1], [1, u], [-1, u]][side];
      sp[i * 3] = tour.x + a[0] * w; sp[i * 3 + 1] = gy + y; sp[i * 3 + 2] = tour.z + a[1] * w; ss[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('seed', new THREE.BufferAttribute(ss, 1));
    const sm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 }, map: { value: dustMat.uniforms.map.value }, px: { value: 1 } },
      vertexShader: `uniform float t, px; attribute float seed; varying float vA;
        varying float vF;
        void main(){ float ph = fract(t * (0.35 + seed * 0.5) + seed * 17.0); vF = smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.04, 0.16, ph)) * step(0.55, fract(seed * 7.13));
          vA = 0.9 + vF; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(px * 480.0 * (1.0 + vF * 1.4) / -mv.z, 2.5, 12.0); }`,
      fragmentShader: 'uniform sampler2D map; varying float vA, vF; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(mix(vec3(1.0, 0.62, 0.22) * 1.3, vec3(1.0, 0.97, 0.9) * 2.4, vF), c.a * vA); }' });
    sparkle = new THREE.Points(sg, sm); sparkle.frustumCulled = false; sparkle.visible = false; sparkle.renderOrder = 6; scene.add(sparkle);
    // phare : deux longs faisceaux opposés qui tournent au sommet
    const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vU; void main(){ float a = pow(1.0 - vU.y, 1.6) * 0.16; gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * a, 1.0); }' });
    const cone = new THREE.ConeGeometry(14, 420, 24, 1, true).translate(0, -210, 0).rotateZ(Math.PI / 2); // pointe au sommet, s'ouvre vers +x
    beacon = new THREE.Group(); beacon.position.set(tour.x, gy + H - 4, tour.z); beacon.visible = false;
    const b1 = new THREE.Mesh(cone, bm), b2 = new THREE.Mesh(cone, bm); b2.rotation.y = Math.PI; b1.rotation.z = b2.rotation.z = -0.05; beacon.add(b1, b2); scene.add(beacon);
    b1.frustumCulled = b2.frustumCulled = false;
    // illumination dorée : la charpente de la tour, redessinée par-dessus en lumière additive, plus forte en bas (projecteurs au pied)
    let src = null; scene.traverse((o) => { if (!src && o.isMesh && o.name === 'extension_metal') src = o; });
    if (src) {
      const gm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
        uniforms: { cx: { value: tour.x }, cz: { value: tour.z }, H: { value: H } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'uniform float cx, cz, H; varying vec3 vW; void main(){ float r = length(vW.xz - vec2(cx, cz)); float on = 1.0 - smoothstep(38.0, 46.0, r); float k = mix(0.55, 0.22, clamp(vW.y / H, 0.0, 1.0)); gl_FragColor = vec4(vec3(1.0, 0.6, 0.22) * k * on, 1.0); }' });
      glow = new THREE.Mesh(src.geometry, gm); glow.matrixAutoUpdate = false; src.updateWorldMatrix(true, false); glow.matrix.copy(src.matrixWorld); glow.visible = false; glow.frustumCulled = false; glow.renderOrder = 1; scene.add(glow);
    }
  }

  // ---- lumière de fin de journée ----
  let applied = false, sunsetEnv = null;
  function apply() {
    sunset.copy(SUNSET_LOCAL).applyQuaternion(root.quaternion).normalize();
    if (sky) { const u = sky.material.uniforms; u.top.value.set('#2f4a86'); u.mid.value.set('#c99a93'); u.hor.value.set('#ffb36e'); u.sunDir.value.copy(sunset); if (u.night) u.night.value = 0; }
    scene.fog.color.set('#e6a97f'); scene.fog.near = Math.min(scene.fog.near, 90) * 0.6;
    sun.color.set('#ffaa5c'); sun.intensity = 3.4;
    if (hemi) { hemi.color.set('#9fb2e0'); hemi.groundColor.set('#6e4a36'); hemi.intensity = 0.75; }
    renderer.toneMappingExposure = 1.0; realismUniforms.uWet.value = 0.7; // pavés mouillés : le couchant s'y reflète
    if (sunsetEnv === null) { try { sunsetEnv = skyEnvironment(renderer, { top: '#3a5590', mid: '#d3a090', horizon: '#ffb070', ground: '#4a3a32', sunDir: sunset.toArray(), sunColor: '#ffb070', sun: 5 }); } catch (e) { console.warn('reflets du salon indisponibles', e); sunsetEnv = false; } }
    if (sunsetEnv) { scene.environment = sunsetEnv; scene.environmentIntensity = 0.55; }
    applied = true;
  }
  function restore() { applied = false; if (sky) sky.material.uniforms.sunDir.value.copy(SUN0); night?.set(night.on); }

  let t = 0;
  return {
    // appelé chaque image tant que le salon est affiché
    update(dt, teamColor) {
      t += dt; const isNight = !!night?.on;
      if (!isNight && !applied) apply(); else if (isNight && applied) { applied = false; if (sky) sky.material.uniforms.sunDir.value.copy(SUN0); }
      const px = renderer.domElement.height / 720;
      dustMat.uniforms.t.value = t; dustMat.uniforms.px.value = px;
      dustMat.uniforms.col.value.set(isNight ? '#ffb070' : '#ffd08a'); dustMat.uniforms.k.value = isNight ? 0.7 : 1;
      hazeMat.color.set(isNight ? '#3a3a55' : '#ffd2a0'); hazeMat.opacity = isNight ? 0.28 : 0.2;
      haze.forEach((h, i) => { h.s.position.x = h.x0 + Math.sin(t * 0.05 + h.ph) * 2.5; });
      // fumigènes
      for (const f of flares) {
        f.col.set(teamColor || '#ff6a3a');
        const fl = 0.75 + 0.25 * Math.sin(t * 31 + f.seed) * Math.sin(t * 17.3 + f.seed * 2);
        f.light.intensity = (isNight ? 6 : 2.5) * fl; f.flame.scale.setScalar(0.38 + 0.14 * fl);
        for (const p of f.puffs) {
          p.age += dt;
          if (p.age >= p.life) { p.age -= p.life; p.vx = rnd(-0.18, 0.18); p.vz = rnd(-0.15, 0.15); p.rot = rnd(-0.5, 0.5); }
          const a = p.age / p.life, s = p.s;
          s.position.set(p.vx * p.age + a * a * 3.2 + Math.sin(p.age * 0.9 + p.rot * 9) * 0.25 * a, 0.12 + p.age * 0.42 + a * 0.6, p.vz * p.age - a * 1.2);
          s.scale.setScalar(0.45 + a * 3.6); s.material.rotation += p.rot * dt;
          s.material.color.copy(f.col).lerp(GREY, 0.12 + a * 0.5);
          s.material.opacity = Math.min(1, a * 6) * Math.pow(1 - a, 1.4) * (isNight ? 0.55 : 0.6);
        }
      }
      if (sparkle) { sparkle.visible = isNight; sparkle.material.uniforms.t.value = t; sparkle.material.uniforms.px.value = px; }
      if (glow) glow.visible = isNight;
      if (beacon) { beacon.visible = isNight; beacon.rotation.y = t * 0.55; }
    },
    // après le placement de l'ombre : soleil couchant
    relight() { if (applied) sun.position.copy(sun.target.position).addScaledVector(sunset, 140); },
    hide() { if (glow) glow.visible = false; if (sparkle) sparkle.visible = false; if (beacon) beacon.visible = false; if (applied) restore(); },
  };
}
