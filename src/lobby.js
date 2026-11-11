// Salon d'accueil : l'équipe (toi au centre, trois places autour) posée sur la place, en vrai dans la map,
// caméra de portrait, socles lumineux aux couleurs du camp. Les étiquettes et les boutons « + » sont en HTML,
// placés chaque image à l'aplomb des têtes (projection écran).
import * as THREE from 'three';
import { makeCharacter, attachGun, tintTeam, chars } from './assets.js';
import { holdPose } from './hold.js';
import { TEAMS, WEAPONS, classOf } from './data.js';
import { createDecor } from './salon-decor.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// places : toi devant au centre, puis gauche, droite, loin à droite (en mètres, repère de la scène : x à droite, z vers la caméra)
export const SLOTS = [[0, 0.5], [-1.6, -0.6], [1.6, -0.6], [-2.95, -1.6]];

export function createLobby({ scene, camera, world, Q, sun, hemi, renderer, night }) {
  // lieu : sur le pont, entre les pieds de la Tour Eiffel, le Trocadéro au fond (Paris) ; réglable par ?lobby=x,z,yaw pour essayer d'autres décors
  const L = (Q.get('lobby') || world.gp.lobby?.join(',') || '0,-150,0').split(',').map(Number);
  const root = new THREE.Group(); root.name = 'lobby'; root.visible = false; scene.add(root);
  const gy = world.groundY(L[0], L[1], 2);
  root.position.set(L[0], gy, L[1]); root.rotation.y = L[2] || 0;

  // éclairage de portrait : une douce de face, un contre-jour à la couleur du camp, une lueur chaude au sol
  const key = new THREE.SpotLight('#fff1dc', 40, 18, 0.7, 0.6, 1.4); key.position.set(-2.5, 5, 6.5); key.target.position.set(0.6, 1, -0.6); root.add(key, key.target);
  const rim = new THREE.SpotLight('#5ad1ff', 55, 14, 0.9, 0.7, 1.3); rim.position.set(1.5, 4.5, -4.5); rim.target.position.set(0.6, 1, -0.6); root.add(rim, rim.target);
  const bounce = new THREE.PointLight('#ffb347', 6, 7, 1.6); bounce.position.set(0.6, 0.4, 1.2); root.add(bounce);

  // socles : disque sombre, anneau lumineux, faisceau qui monte (couleur du camp, plus vif sous toi)
  const ringGeo = new THREE.RingGeometry(0.52, 0.6, 48).rotateX(-Math.PI / 2), discGeo = new THREE.CircleGeometry(0.62, 48).rotateX(-Math.PI / 2);
  const beamGeo = new THREE.CylinderGeometry(0.56, 0.6, 2.4, 40, 1, true).translate(0, 1.2, 0);
  const beamMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { c: { value: new THREE.Color('#fff') }, a: { value: 0.3 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float a, t; varying vec2 vU; void main(){ float f = pow(1.0 - vU.y, 2.2); float s = 0.75 + 0.25 * sin(vU.x * 62.83 + t * 1.5); gl_FragColor = vec4(c * s, f * a); }' });
  // décor : barrières, fumigènes, poussière dans la lumière, coucher de soleil (ou tour qui scintille la nuit)
  let decor = null; try { if (sun && renderer) decor = createDecor({ root, scene, sun, hemi, renderer, night, world, camera }); } catch (e) { console.warn('décor du salon indisponible', e); }
  let teamCol = '#34c759';
  const pads = SLOTS.map(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, 0.02, z);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: '#14161c', roughness: 0.35, metalness: 0.4 }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#fff', toneMapped: false }));
    const beam = new THREE.Mesh(beamGeo, beamMat()); beam.renderOrder = 3;
    disc.receiveShadow = true; g.add(disc, ring, beam); root.add(g);
    return { g, ring, beam, ch: null, key: '', turn: i === 0 ? 0 : (i === 1 ? 0.3 : i === 2 ? -0.3 : 0.45), spin: 0, head: V(), idleT: Math.random() * 10 };
  });

  // caméra de portrait (le groupe est un peu à droite à cause de la 4e place : on vise entre toi et elle)
  // vues : « salon » = toute l'équipe, toi pile au centre ; « casier » = gros plan sur toi, décalé à droite pour laisser la place aux réglages
  const VIEWS = { salon: { pos: V(0, 1.75, 9.6), look: V(0, 1.12, -0.5) }, casier: { pos: V(-0.95, 1.3, 4.7), look: V(-0.95, 1.02, 0.4) } };
  const camPos = VIEWS.salon.pos.clone(), camLook = VIEWS.salon.look.clone(); let view = 'salon'; const tmp = V(), look = V();
  let t = 0, drag = 0, dragV = 0, party = [];

  function dress(p, m) {
    // m : { skin, team, gun, kind }
    const k = m ? `${m.skin}|${m.team}|${m.gun}` : '';
    if (k === p.key) return; p.key = k;
    if (p.ch) { p.g.remove(p.ch.root); p.ch = null; }
    if (!m || !chars[m.skin]) return;
    const ch = makeCharacter(m.skin); tintTeam(ch.model, m.skin, m.team);
    ch.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    try { if (m.gun) { attachGun(ch, m.gun); ch.gunId = m.gun; } } catch (e) { console.warn('arme du salon', e); }
    // repos arme basse (pas en joue : au salon, l'arme pointée au visage cachait les mains et la tête)
    const pistol = WEAPONS[m.gun]?.hand === 'pistol';
    const idle = ch.actions[pistol ? 'MXP_IdleLow' : 'MX_IdleLow'] || ch.actions.MX_IdleLow || ch.actions.MX_Idle || Object.values(ch.actions)[0];
    idle?.play(); ch.idle = idle; ch.low = /IdleLow$/.test(idle?.getClip().name || ''); ch.mixer.update(Math.random() * 2);
    ch.root.rotation.y = p.turn; p.g.add(ch.root); p.ch = ch;
  }

  // petit geste de temps en temps (sobre : poing levé, applaudissement) puis retour au repos
  function gesture(p, name) {
    const ch = p.ch; const a = ch?.actions[name]; if (!a || ch.busy) return;
    ch.busy = true; a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.fadeIn(0.25).play(); ch.idle?.fadeOut(0.25);
    const back = () => { ch.mixer.removeEventListener('finished', back); ch.idle?.reset().fadeIn(0.35).play(); a.fadeOut(0.35); ch.busy = false; };
    ch.mixer.addEventListener('finished', back);
  }

  return {
    root,
    show(on) { root.visible = on; if (!on) decor?.hide(); if (on) { camera.fov = 30; camera.updateProjectionMatrix(); } else { camera.fov = 70; camera.updateProjectionMatrix(); } },
    get visible() { return root.visible; },
    // membres : tableau de 4 éléments (null = place libre)
    setParty(list, team) {
      party = list; const col = new THREE.Color(TEAMS[team].color); teamCol = TEAMS[team].color;
      pads.forEach((p, i) => {
        dress(p, list[i]);
        const on = !!list[i]; const c = i === 0 ? new THREE.Color('#ffc23d') : col;
        p.ring.material.color.copy(c).multiplyScalar(on ? 1.6 : 0.6); p.beam.material.uniforms.c.value.copy(c); p.beam.material.uniforms.a.value = i === 0 ? 0.3 : on ? 0.18 : 0.1;
      });
      rim.color.copy(col).lerp(new THREE.Color('#ffffff'), 0.25);
    },
    setView(v) { if (VIEWS[v]) view = v; },
    gesture(i, name) { const p = pads[i]; if (p) gesture(p, name); },
    // glisser pour faire tourner ton perso
    drag(dx) { dragV += dx * 0.012; },
    update(dt) {
      decor?.update(dt, teamCol); key.intensity = night?.on ? 40 : 95;
      t += dt; const V0 = VIEWS[view], kk = 1 - Math.pow(0.004, dt); camPos.lerp(V0.pos, kk); camLook.lerp(V0.look, kk);
      pads.forEach((p, i) => { if (i) p.g.visible = view === 'salon'; });
      dragV *= Math.pow(0.02, dt); drag += dragV * dt * 60 * 0.06; drag *= Math.pow(0.35, dt);
      pads.forEach((p, i) => {
        p.beam.material.uniforms.t.value = t + i;
        if (!p.ch) return; p.ch.mixer.update(dt); if (p.ch.gun && p.ch.gunId && !p.ch.busy) holdPose(p.ch, p.ch.gunId, !p.ch.low);
        p.ch.root.rotation.y = p.turn + (i === 0 ? drag : 0) + Math.sin(t * 0.4 + i) * 0.03;
        if (i > 0 && !p.ch.busy && (p.idleT -= dt) < 0) { p.idleT = 9 + Math.random() * 12; gesture(p, Math.random() < 0.5 ? 'MX_FistPump' : 'MX_Cheer'); }
      });
      // caméra : respiration lente, léger parallaxe
      root.updateMatrixWorld(true);
      tmp.set(camPos.x + Math.sin(t * 0.25) * 0.05, camPos.y + Math.sin(t * 0.33) * 0.04, camPos.z); root.localToWorld(tmp); camera.position.copy(tmp);
      look.copy(camLook); root.localToWorld(look); camera.lookAt(look);
    },
    // positions écran (pixels CSS) au-dessus de chaque place, pour les étiquettes HTML
    anchors(w, h) {
      return pads.map((p, i) => {
        tmp.set(SLOTS[i][0], 2.02, SLOTS[i][1]); root.localToWorld(tmp); tmp.project(camera);
        const top = V(SLOTS[i][0], 0.02, SLOTS[i][1]); root.localToWorld(top); top.project(camera);
        return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, fy: (-top.y * 0.5 + 0.5) * h, vis: tmp.z < 1 };
      });
    },
    relight() { decor?.relight(); },
    focusPoint() { const p = V(0, 1, 0); root.localToWorld(p); return p; },
  };
}
