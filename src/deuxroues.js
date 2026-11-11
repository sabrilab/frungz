// Deux-roues : motos (sportive, roadster, scooter, moto de police) et skateboards.
// Modélisés en low-poly directement dans le code (formes génériques, aucune marque ni logo), donc sans licence à suivre.
// Repère des modèles : mètres, sol y = 0, avant +Z, gauche +X (même convention que les voitures).
// Le pilote reste visible : sa pose est calculée chaque image (bassin sur la selle, pieds sur les repose-pieds ou la planche,
// mains sur le guidon) par cinématique inverse à deux os, par-dessus l'animation de repos.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const GRAV = 19;

// ---------------------------------------------------------------- matériaux et formes
const mats = {};
function mat(color, o = {}) {
  const key = color + JSON.stringify(o); if (mats[key]) return mats[key];
  // (passe réalisme : surfaces lisses ; peintures vernies en qualité haute)
  const hq = !['bas', 'mobile'].includes(globalThis.__quality), P = o.p && hq ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  return (mats[key] = new P({ color, roughness: o.r ?? 0.55, metalness: o.m ?? 0.1, flatShading: o.flat ?? false, ...(o.p && hq ? { clearcoat: 1, clearcoatRoughness: 0.04 } : {}), emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1, transparent: o.t != null, opacity: o.t ?? 1, depthWrite: o.t == null }));
}
const M = {
  noir: () => mat('#17191d', { r: 0.6 }), metal: () => mat('#9aa0a8', { r: 0.3, m: 0.75 }), alu: () => mat('#c3c7cc', { r: 0.28, m: 0.8 }), chrome: () => mat('#d9dde2', { r: 0.15, m: 0.95 }),
  pneu: () => mat('#141414', { r: 0.9 }), moteur: () => mat('#3a3d42', { r: 0.45, m: 0.55 }), selle: () => mat('#1b1b1d', { r: 0.85 }),
  phare: () => mat('#fff6dc', { e: '#fff1c8', ei: 1.4 }), feu: () => mat('#c0141a', { e: '#ff1a1a', ei: 1.2 }), clignot: () => mat('#ff9d1e', { e: '#ff8a00', ei: 0.6 }),
  vitre: () => mat('#5d6d78', { r: 0.1, m: 0.3, t: 0.45 }), bleu: () => mat('#1d3fb0', { e: '#2a5bff', ei: 1.6 }),
};
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; }
const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
// cylindre d'un point à un autre
function tube(a, b, r, m, seg = 16, r2 = r) {
  const d = b.clone().sub(a), L = d.length(); const o = mesh(new THREE.CylinderGeometry(r2, r, L, seg), m);
  o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return o;
}
// profil de côté (z, y) extrudé sur la largeur (x), arêtes adoucies
function profile(pts, width, m, bevel = 0.02) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const b = Math.min(bevel, width * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.002, width - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - 2 * b) / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals();
  return mesh(g, m);
}
// roue : pneu, jante à branches, moyeu, disque de frein ; tourne autour de son axe X
function wheel(R, w, rimCol, disc = true) {
  const g = new THREE.Group();
  // pneu au profil arrondi (tourné), jante à bâtons dédoublés, moyeu, disque de frein et étrier
  const prof = []; const Ri = R - w * 0.95; for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + k / 16 * Math.PI; prof.push(new THREE.Vector2(Ri + (R - Ri) * (0.55 + 0.45 * Math.cos(a)), Math.sin(a) * w * 0.5)); }
  const tg = new THREE.LatheGeometry(prof, 36); tg.rotateZ(-Math.PI / 2); g.add(mesh(tg, M.pneu()));
  const rimR = Ri; const rm = mat(rimCol, { r: 0.3, m: 0.7, p: true });
  const rim = mesh(new THREE.TorusGeometry(rimR, 0.016, 8, 40), rm); rim.rotation.y = Math.PI / 2; g.add(rim);
  for (let i = 0; i < 5; i++) for (const d of [-0.06, 0.06]) { const sp = box(0.022, rimR * 0.98, 0.02, rm); sp.geometry.translate(0, rimR * 0.49, 0); sp.rotation.x = i * Math.PI * 2 / 5 + d; g.add(sp); }
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, w * 0.9, 20).rotateZ(Math.PI / 2), M.alu()));
  if (disc) { const d = mesh(new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.008, 32).rotateZ(Math.PI / 2), M.chrome()); d.position.x = w * 0.42; g.add(d);
    const hubD = mesh(new THREE.CylinderGeometry(rimR * 0.4, rimR * 0.4, 0.012, 20).rotateZ(Math.PI / 2), M.noir()); hubD.position.x = w * 0.42; g.add(hubD); }
  g.userData.R = R; return g;
}
const named = (o, n) => { o.name = n; return o; };

// ---------------------------------------------------------------- motos
// R rayon des roues, wb empattement, rake angle de chasse, fork longueur de fourche ; guidon dans le repère de la colonne (gw demi-largeur, hb hauteur, hz recul)
export const MOTOS = {
  sportive: { nom: 'Moto sportive rouge', classe: 'sport', R: 0.31, w: 0.17, wb: 1.42, rake: 0.42, fork: 0.74, gw: 0.30, hb: 0.0, hz: -0.06, seat: [0, 0.84, -0.2], peg: [0.17, 0.40, -0.28], lean: 0.6, body: '#b3161b', accent: '#16181c', rim: '#222428', max: 46, accel: 16, hp: 170 },
  roadster: { nom: 'Roadster gris', classe: 'roadster', R: 0.31, w: 0.16, wb: 1.46, rake: 0.44, fork: 0.78, gw: 0.38, hb: 0.13, hz: -0.14, seat: [0, 0.84, -0.30], peg: [0.18, 0.38, -0.12], lean: 0.26, body: '#4c5157', accent: '#c46a1c', rim: '#1d1f22', max: 40, accel: 15, hp: 170 },
  scooter: { nom: 'Scooter blanc', classe: 'scooter', R: 0.23, w: 0.13, wb: 1.32, rake: 0.47, fork: 0.70, gw: 0.34, hb: 0.10, hz: -0.10, seat: [0, 0.84, -0.34], peg: [0.15, 0.36, 0.06], lean: 0.06, body: '#e9e8e3', accent: '#2a2c30', rim: '#a8adb3', max: 25, accel: 9, hp: 140 },
  police: { nom: 'Moto de police', classe: 'police', R: 0.32, w: 0.16, wb: 1.52, rake: 0.44, fork: 0.80, gw: 0.40, hb: 0.13, hz: -0.16, seat: [0, 0.88, -0.30], peg: [0.19, 0.40, -0.06], lean: 0.12, body: '#f1f2f3', accent: '#1d3fb0', rim: '#202226', max: 42, accel: 15, hp: 230, police: true },
};

function buildMoto(type) {
  const S = MOTOS[type]; const g = new THREE.Group(); g.name = 'moto-' + type;
  const body = mat(S.body, { r: 0.3, m: 0.3, p: true }), acc = mat(S.accent, { r: 0.35, m: 0.2, p: true });
  const zf = S.wb / 2, zb = -S.wb / 2, R = S.R;
  // colonne de direction : pivot en haut de la fourche, axe local Y incliné de l'angle de chasse
  const head = V(0, R + S.fork * Math.cos(S.rake), zf - S.fork * Math.sin(S.rake));
  const steer = named(new THREE.Group(), 'steer'); steer.position.copy(head); steer.userData.rake = S.rake; steer.quaternion.setFromAxisAngle(V(1, 0, 0), -S.rake); g.add(steer); // (userData est copié en JSON au clonage : on garde un nombre)
  const wf = named(wheel(R, S.w, S.rim), 'wheel-front'); wf.position.set(0, -S.fork, 0); steer.add(wf);
  const wr = named(wheel(R, S.w + 0.03, S.rim), 'wheel-back'); wr.position.set(0, R, zb); g.add(wr);
  // fourche (deux tubes), tés, garde-boue avant
  for (const sx of [-1, 1]) { steer.add(tube(V(sx * 0.1, -S.fork, 0), V(sx * 0.1, 0.02, 0), 0.026, M.alu())); steer.add(tube(V(sx * 0.1, -S.fork + 0.02, 0), V(sx * 0.1, -S.fork * 0.45, 0), 0.034, type === 'scooter' ? M.noir() : M.chrome())); }
  steer.add(box(0.26, 0.04, 0.08, M.alu(), 0, 0.0, 0)); steer.add(box(0.26, 0.03, 0.07, M.alu(), 0, -0.14, 0));
  const fender = profile([[-0.2, R + 0.03], [0, R + 0.07], [0.22, R + 0.03], [0.24, R - 0.02], [0, R + 0.02], [-0.18, R - 0.01]], S.w + 0.03, type === 'roadster' ? M.noir() : body, 0.01); fender.position.y = -S.fork; fender.rotation.x = S.rake; steer.add(fender);
  // guidon et poignées (les mains du pilote les suivent quand on braque)
  const bar = new THREE.Group(); bar.position.set(0, S.hb, S.hz); steer.add(bar);
  bar.add(tube(V(-S.gw, 0, 0), V(S.gw, 0, 0), 0.014, type === 'sportive' ? M.alu() : M.noir()));
  if (S.hb > 0.05) bar.add(tube(V(0, -S.hb, -S.hz), V(0, 0, 0), 0.022, M.alu()));
  for (const sx of [-1, 1]) {
    const grip = named(new THREE.Object3D(), sx > 0 ? 'grip-left' : 'grip-right'); grip.position.set(sx * (S.gw - 0.05), 0, 0); bar.add(grip);
    bar.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8).rotateZ(Math.PI / 2), M.selle(), sx * (S.gw - 0.05), 0, 0));
    bar.add(box(0.12, 0.012, 0.02, M.alu(), sx * (S.gw - 0.1), 0.0, 0.07)); // levier
    if (type !== 'sportive') { const st = tube(V(sx * (S.gw - 0.12), 0, 0), V(sx * (S.gw + 0.02), 0.22, -0.02), 0.008, M.noir()); bar.add(st); bar.add(box(0.1, 0.06, 0.015, M.chrome(), sx * (S.gw + 0.03), 0.24, -0.02)); }
  }
  // corps selon le type
  const P = V(0, R + 0.16, zb + 0.62); // axe du bras oscillant
  if (type === 'scooter') {
    // tablier, plancher plat, coque arrière, top-case : scooter urbain générique
    g.add(profile([[0.18, 0.28], [0.42, 0.42], [0.50, 0.82], [0.44, 1.02], [0.33, 1.0], [0.27, 0.42]], 0.46, body, 0.04));
    g.add(profile([[0.27, 0.42], [0.33, 1.0], [0.24, 0.98], [0.2, 0.44]], 0.36, acc, 0.02));
    g.add(box(0.36, 0.07, 0.52, M.noir(), 0, 0.30, 0.0));
    g.add(profile([[0.02, 0.3], [0.0, 0.66], [-0.12, 0.8], [-0.62, 0.84], [-0.86, 0.74], [-0.88, 0.5], [-0.6, 0.36], [-0.25, 0.27]], 0.38, body, 0.05));
    g.add(profile([[-0.08, 0.8], [-0.66, 0.85], [-0.66, 0.92], [-0.1, 0.89]], 0.32, M.selle(), 0.03));
    g.add(box(0.38, 0.26, 0.34, M.noir(), 0, 1.02, -0.78)); g.add(box(0.3, 0.04, 0.02, M.feu(), 0, 0.95, -0.955));
    g.add(box(0.12, 0.18, 0.5, M.moteur(), 0.13, R + 0.02, zb + 0.3));
    g.add(tube(V(-0.12, R - 0.02, zb + 0.4), V(-0.14, R + 0.06, zb - 0.02), 0.045, M.chrome()));
    g.add(box(0.2, 0.05, 0.06, M.feu(), 0, 0.72, -0.9));
    // carénage du guidon avec phare
    const cap = profile([[-0.08, -0.04], [0.1, -0.06], [0.14, 0.06], [-0.04, 0.1]], S.gw * 1.25, body, 0.03); bar.add(cap);
    bar.add(box(0.16, 0.05, 0.02, M.phare(), 0, 0.01, 0.145));
  } else {
    // moteur, cadre, bras oscillant, échappement
    g.add(box(0.3, 0.3, 0.42, M.moteur(), 0, R + 0.12, 0.02));
    g.add(box(0.26, 0.2, 0.22, M.moteur(), 0, R + 0.33, 0.14));
    if (type === 'roadster' || type === 'police') for (let i = 0; i < 4; i++) g.add(box(0.34, 0.012, 0.24, M.metal(), 0, R + 0.26 + i * 0.035, 0.14));
    for (const sx of [-1, 1]) {
      g.add(tube(V(sx * 0.12, head.y - 0.04, head.z - 0.02), V(sx * 0.13, P.y + 0.1, P.z + 0.05), 0.03, type === 'sportive' ? M.alu() : M.noir()));
      g.add(tube(V(sx * 0.11, P.y, P.z), V(sx * 0.1, R, zb), 0.03, type === 'sportive' ? M.alu() : M.noir()));
    }
    g.add(tube(V(0, R + 0.5, zb + 0.5), V(0, R + 0.12, zb + 0.28), 0.03, M.chrome())); // amortisseur
    const ex = type === 'sportive' ? [V(-0.1, R + 0.05, 0.22), V(-0.14, R + 0.02, -0.18), V(-0.17, R + 0.3, -0.62)] : [V(-0.1, R + 0.1, 0.25), V(-0.15, R + 0.0, -0.1), V(-0.18, R + 0.12, -0.7)];
    g.add(tube(ex[0], ex[1], 0.03, M.chrome())); g.add(tube(ex[1], ex[2], 0.055, type === 'sportive' ? M.noir() : M.chrome(), 10, 0.045));
    // repose-pieds
    for (const sx of [-1, 1]) g.add(tube(V(sx * 0.12, S.peg[1], S.peg[2]), V(sx * (S.peg[0] + 0.06), S.peg[1], S.peg[2]), 0.012, M.alu()));
    // réservoir, selle, coque arrière, feu
    if (type === 'sportive') {
      g.add(profile([[0.30, 0.84], [0.26, 1.0], [0.06, 1.03], [-0.12, 0.92], [-0.12, 0.8], [0.2, 0.74]], 0.36, body, 0.06));
      g.add(profile([[-0.12, 0.85], [-0.5, 0.86], [-0.52, 0.91], [-0.12, 0.91]], 0.27, M.selle(), 0.03));
      g.add(profile([[-0.1, 0.78], [-0.5, 0.85], [-0.78, 0.99], [-0.88, 0.97], [-0.76, 0.84], [-0.44, 0.72], [-0.08, 0.68]], 0.26, body, 0.04));
      g.add(box(0.12, 0.03, 0.02, M.feu(), 0, 0.96, -0.85));
      // carénage intégral, bulle, double optique
      for (const sx of [-1, 1]) { const side = profile([[0.62, 0.52], [0.66, 0.78], [0.46, 0.96], [0.2, 0.86], [0.0, 0.46], [0.22, 0.36]], 0.06, body, 0.015); side.position.x = sx * 0.17; g.add(side); const st = profile([[0.5, 0.46], [0.18, 0.4], [0.1, 0.5], [0.4, 0.6]], 0.04, acc, 0.01); st.position.x = sx * 0.2; g.add(st); }
      g.add(profile([[0.48, 0.86], [0.70, 0.84], [0.76, 0.94], [0.62, 1.06], [0.44, 1.04]], 0.38, body, 0.05));
      g.add(profile([[0.44, 1.03], [0.62, 1.05], [0.48, 1.2], [0.4, 1.16]], 0.3, M.vitre(), 0.01));
      for (const sx of [-1, 1]) { g.add(box(0.09, 0.035, 0.03, M.phare(), sx * 0.07, 0.9, 0.77)); g.add(box(0.03, 0.03, 0.12, M.noir(), sx * 0.2, 1.06, 0.48)); g.add(box(0.1, 0.05, 0.015, M.chrome(), sx * 0.27, 1.08, 0.45)); }
      g.add(box(0.06, 0.03, 0.04, M.clignot(), 0.22, 0.96, 0.6)); g.add(box(0.06, 0.03, 0.04, M.clignot(), -0.22, 0.96, 0.6));
    } else {
      g.add(profile([[0.34, 0.86], [0.28, 1.02], [0.02, 1.04], [-0.14, 0.92], [-0.1, 0.8], [0.24, 0.78]], 0.38, body, 0.07));
      if (type === 'roadster') { const st = profile([[0.3, 0.97], [0.02, 0.99], [0.02, 0.95], [0.3, 0.93]], 0.385, acc, 0.0); g.add(st); }
      g.add(profile([[-0.12, 0.86], [-0.68, 0.9], [-0.7, 0.97], [-0.12, 0.94]], 0.3, M.selle(), 0.03));
      g.add(profile([[-0.08, 0.8], [-0.66, 0.86], [-0.8, 0.88], [-0.78, 0.78], [-0.4, 0.66], [-0.05, 0.64]], 0.26, type === 'police' ? body : M.noir(), 0.03));
      g.add(box(0.14, 0.05, 0.03, M.feu(), 0, 0.85, -0.81));
      g.add(box(0.24, 0.1, 0.16, M.noir(), 0, R + 0.33, -0.2)); // boîte à air / côté
      // phare rond monté sur la fourche
      const hl = mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.1, 14).rotateX(Math.PI / 2), M.noir()); hl.position.set(0, -0.1, 0.12); steer.add(hl);
      const lens = mesh(new THREE.CircleGeometry(0.085, 14), M.phare()); lens.position.set(0, -0.1, 0.171); lens.castShadow = false; steer.add(lens); lens.rotation.x = 0;
      for (const sx of [-1, 1]) steer.add(box(0.05, 0.03, 0.04, M.clignot(), sx * 0.16, -0.1, 0.08));
      if (type === 'police') {
        // tête de fourche et bulle haute, valises, feux bleus, bandes bleues : livrée générique sans écusson
        const fair = profile([[-0.05, -0.2], [0.2, -0.22], [0.24, 0.1], [0.06, 0.2], [-0.06, 0.12]], 0.54, body, 0.04); fair.rotation.x = S.rake * 0.6; steer.add(fair);
        const ws = profile([[0.04, 0.16], [0.18, 0.14], [0.02, 0.5], [-0.08, 0.46]], 0.48, M.vitre(), 0.01); ws.rotation.x = S.rake * 0.6; steer.add(ws);
        for (const sx of [-1, 1]) { g.add(box(0.18, 0.3, 0.46, body, sx * 0.29, 0.62, -0.5)); g.add(box(0.185, 0.06, 0.465, acc, sx * 0.29, 0.6, -0.5)); g.add(box(0.06, 0.06, 0.05, M.bleu(), sx * 0.3, 0.8, -0.74)); g.add(box(0.05, 0.05, 0.04, M.bleu(), sx * 0.2, 0.55, 0.42)); }
        g.add(tube(V(0.2, 0.42, 0.34), V(0.2, 0.7, 0.3), 0.016, M.chrome())); g.add(tube(V(-0.2, 0.42, 0.34), V(-0.2, 0.7, 0.3), 0.016, M.chrome()));
        g.add(box(0.385, 0.05, 0.3, acc, 0, 0.93, 0.16));
      }
    }
  }
  // repères du pilote
  const seat = named(new THREE.Object3D(), 'seat-driver'); seat.position.set(...S.seat); g.add(seat);
  for (const sx of [-1, 1]) { const p = named(new THREE.Object3D(), sx > 0 ? 'peg-left' : 'peg-right'); p.position.set(sx * S.peg[0], S.peg[1] + 0.03, S.peg[2]); g.add(p); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { scene: g, kind: 'moto', type, nom: S.nom, classe: S.classe, police: !!S.police, spec: S, size: [0.76, 1.2, S.wb + 2 * R + 0.12] };
}

// ---------------------------------------------------------------- skateboards
export const SKATES = [
  { nom: 'Skateboard', deck: '#7a4e2d', grip: '#1a1a1a', wheel: '#e8e2cf', truck: '#a9adb2' },
  { nom: 'Skateboard', deck: '#1f4f7a', grip: '#161616', wheel: '#d94a2b', truck: '#8b9096' },
  { nom: 'Skateboard', deck: '#2f2f2f', grip: '#121212', wheel: '#f2f0ea', truck: '#c9ccd0' },
  { nom: 'Skateboard', deck: '#8a1f24', grip: '#191919', wheel: '#ffd23f', truck: '#9da2a8' },
];
export const DECK_Y = 0.105; // dessus de la planche
function buildSkate(v) {
  const C = SKATES[v % SKATES.length]; const g = new THREE.Group(); g.name = 'skate';
  // planche : rectangle aux bouts arrondis (vu de dessus), extrudé puis relevé aux deux extrémités (kicktails)
  const L = 0.8, W = 0.21, T = 0.014, r = W / 2, s = new THREE.Shape();
  s.moveTo(-r, -L / 2 + r); s.absarc(0, -L / 2 + r, r, Math.PI, 2 * Math.PI, false); s.lineTo(r, L / 2 - r); s.absarc(0, L / 2 - r, r, 0, Math.PI, false); s.closePath();
  const deckGeo = (th) => { const geo = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 6 }); geo.rotateX(-Math.PI / 2); // x, -z ← forme ; épaisseur vers +y
    const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const z = -p.getZ(i); p.setZ(i, z); const k = Math.max(0, Math.abs(z) - 0.27); p.setY(i, p.getY(i) + k * 0.5 + k * k * 2); }
    geo.computeVertexNormals(); return geo; };
  const deck = mesh(deckGeo(T), mat(C.deck, { r: 0.7 })); deck.position.y = DECK_Y - T; g.add(deck);
  const grip = mesh(deckGeo(0.002), mat(C.grip, { r: 0.95 })); grip.position.y = DECK_Y; g.add(grip);
  // trucks et roues
  const wm = mat(C.wheel, { r: 0.5 }), tm = mat(C.truck, { r: 0.3, m: 0.8 });
  for (const z of [-0.23, 0.23]) {
    g.add(box(0.06, 0.012, 0.09, tm, 0, DECK_Y - T - 0.006, z));
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.04, 6), tm, 0, DECK_Y - T - 0.032, z));
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.2, 6).rotateZ(Math.PI / 2), tm, 0, 0.028, z));
    for (const sx of [-1, 1]) { const w = named(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.032, 10).rotateZ(Math.PI / 2), wm, sx * 0.085, 0.028, z), 'skate-wheel'); g.add(w); }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { scene: g, kind: 'skate', type: 'skate', nom: C.nom, classe: 'skate', size: [0.22, 0.12, 0.8] };
}

let DEFS = null;
export function rideDefs() {
  if (DEFS) return DEFS;
  DEFS = { motos: Object.fromEntries(Object.keys(MOTOS).map((k) => [k, buildMoto(k)])), skates: SKATES.map((_, i) => buildSkate(i)) };
  return DEFS;
}

// ---------------------------------------------------------------- cinématique inverse
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = V(), _v2 = V();
const wpos = (o, out = V()) => o.getWorldPosition(out);
// tourne un os pour que la direction monde `from` devienne `to` (rotation appliquée dans le repère monde)
function turnBone(bone, from, to) {
  _q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  bone.getWorldQuaternion(_q2); _q2.premultiply(_q);
  const pq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq); bone.quaternion.copy(pq.invert().multiply(_q2)); bone.updateMatrixWorld(true);
}
function rotBoneWorld(bone, axis, ang) {
  _q.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_q2); _q2.premultiply(_q);
  const pq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq); bone.quaternion.copy(pq.invert().multiply(_q2)); bone.updateMatrixWorld(true);
}
// deux os : upper → lower → bout (endLocal = position du bout dans le repère de lower), cible et direction du coude / genou
function ik2(upper, lower, endLocal, target, pole) {
  const A = wpos(upper), B = wpos(lower), C = lower.localToWorld(endLocal.clone());
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  const AT = target.clone().sub(A); let d = AT.length(); const u = AT.divideScalar(d || 1);
  d = clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  const p = pole.clone().addScaledVector(u, -pole.dot(u)); if (p.lengthSq() < 1e-6) p.set(0, 1, 0).addScaledVector(u, -u.y); p.normalize();
  const K = A.clone().addScaledVector(u, l1 * ca).addScaledVector(p, l1 * sa);
  turnBone(upper, B.sub(A), K.clone().sub(A));
  const C2 = lower.localToWorld(endLocal.clone()), B2 = wpos(lower);
  const T = A.clone().addScaledVector(u, d);
  turnBone(lower, C2.sub(B2), T.sub(B2));
  return lower.localToWorld(endLocal.clone());
}

// ---------------------------------------------------------------- méthodes ajoutées au jeu
export const rideMethods = {
  // motos et skates posés sur la map : motos de service à la base de la Brigade, motos et skates côté Frungz, motos garées entre les voitures, skates près des places
  buildRides() {
    const D = rideDefs(), W = this.world; let n = 0;
    const tooClose = (x, z, r) => this.cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < (c.kind ? r : c.L / 2 + r));
    const spot = (x, z, R, r) => { for (let k = 0; k < 30; k++) { const [px, pz] = k ? W.randomFree(x, z, R) : [x, z]; if (W.free(...W.cell(px, pz)) && !tooClose(px, pz, r) && !W.inWater(px, pz)) return [px, pz]; } return null; };
    const put = (def, x, z, yaw, R = 3, r = 1.6) => { const p = spot(x, z, R, r); if (p) { this.addRide(def, p[0], p[1], yaw); n++; } };
    const centre = (sp) => sp.reduce((s, p) => [s[0] + p.x / sp.length, s[1] + p.z / sp.length], [0, 0]);
    const M = D.motos;
    for (const t of ['ordre', 'civils']) {
      const sp = W.spawns[t] || []; if (!sp.length) continue; const [cx, cz] = centre(sp); const L = Math.hypot(cx, cz) || 1, dx = -cx / L, dz = -cz / L;
      const yaw = Math.atan2(dx, dz), ox = cx + dx * 12, oz = cz + dz * 12;
      const list = t === 'ordre' ? [M.police, M.police, M.police] : [M.sportive, M.roadster, M.scooter];
      list.forEach((d, i) => put(d, ox + dz * (i - 1) * 1.6, oz - dx * (i - 1) * 1.6, yaw, 4, 1.3));
      if (t === 'civils') for (let i = 0; i < 4; i++) put(D.skates[i], ox + dx * 2.5 + dz * (i - 1.5) * 0.9, oz + dz * 2.5 - dx * (i - 1.5) * 0.9, yaw, 3, 0.6);
    }
    // motos et scooters garés dans les rues, entre deux voitures
    const parks = (W.gp.parkings || []).filter((s) => !s.role && !s.renversee && s.gabarit === 'voiture'); const order = [M.scooter, M.roadster, M.sportive, M.scooter];
    parks.forEach((s, i) => { if (i % 3) return; const f = [Math.sin(s.yaw), Math.cos(s.yaw)]; put(order[(i / 3 | 0) % order.length], s.x + f[0] * 3.4, s.z + f[1] * 3.4, s.yaw + Math.PI / 2, 2.5, 1.2); });
    // skates autour des zones
    let k = 0; for (const z of W.zones || []) { if (z.optionnelle) continue; for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2, d = z.radius + 2 + Math.random() * 4; put(D.skates[k++ % D.skates.length], z.center[0] + Math.cos(a) * d, z.center[1] + Math.sin(a) * d, Math.random() * Math.PI * 2, 2, 0.8); } }
    console.log('deux-roues', n);
  },
  addRide(def, x, z, yaw) {
    const obj = def.scene.clone(true); this.root.add(obj);
    const moto = def.kind === 'moto', S = def.spec || {};
    const c = { def, obj, kind: def.kind, wheels: [], pos: V(x, this.world.groundY(x, z), z), yaw, speed: 0, steer: 0, hp: S.hp || 1, maxHp: S.hp || 1, driver: null, spawn: [x, z, yaw], dead: 0,
      W: def.size[0], L: def.size[2], H: def.size[1], max: moto ? S.max : 6.8, accel: moto ? S.accel : 6, police: !!def.police, rollV: moto ? -0.09 : 0, pitchV: 0, camH: moto ? 1.9 : 1.7, camBack: moto ? 4.4 : 3.4, hopY: 0, hopV: 0 };
    obj.traverse((o) => { if (/^wheel-|skate-wheel/.test(o.name)) c.wheels.push(o); });
    c.steerNode = obj.getObjectByName('steer');
    c.col = { type: 'box', x, z, hx: c.W / 2, hz: c.L / 2 - 0.15, h: moto ? 1.05 : 0.1, yaw, cs: Math.cos(yaw), sn: Math.sin(yaw), y0: c.pos.y, car: c };
    if (moto) this.world.dynamic.push(c.col); // le skate ne bloque personne
    this.attachStatic(c);
    this.cars.push(c); this.syncCar(c); return c;
  },
  ridePrompt(a, c) {
    if (c.kind === 'skate') return { text: 'Monter sur le skate', quick: true };
    if (c.police && a.team === 'ordre') return { text: 'Prendre la moto de service', quick: true };
    return { text: c.down ? 'Relever et voler' : 'Voler', quick: false, label: 'Démarrage…', dur: c.down ? 1.1 : 0.7 };
  },
  rideEnter(a, c) {
    c.driver = a; a.inCar = c; a.vel.set(0, 0, 0); a.channel = null; c.down = false; c.vel = null; c.speed = 0; c.push = 0; c.pushW = 0; c.bailT = 0;
    const ch = a.ch; ch.root.visible = true;
    // mesures du perso (une fois) : longueurs de jambe, bout des tibias
    const B = ch.bones; ch.root.updateMatrixWorld(true);
    if (!ch.rideRig && B.UpperLegL && B.LowerLegL && B.FootL) {
      const rig = { snap: {}, bones: ['Body', 'Hips', 'Neck', 'Head', 'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'WristL', 'WristR'].filter((n) => B[n]) };
      rig.endL = B.LowerLegL.worldToLocal(wpos(B.FootL)); rig.endR = B.LowerLegR.worldToLocal(wpos(B.FootR));
      rig.leg = wpos(B.UpperLegL).distanceTo(wpos(B.LowerLegL)) + wpos(B.LowerLegL).distanceTo(wpos(B.FootL));
      rig.hipH = wpos(B.UpperLegL).y - wpos(B.FootL).y;
      ch.rideRig = rig;
    }
    const rig = ch.rideRig; if (rig) for (const n of rig.bones) rig.snap[n] = { p: B[n].position.clone(), q: B[n].quaternion.clone() };
    if (ch.gun && c.kind === 'moto') ch.gun.visible = false;
    if (a === this.player) {
      this.cam.carYaw = c.yaw;
      if (c.kind === 'moto') { this.announce('', c.def.nom, '#fff', 1.3); this.audio.play('slam', c.pos, 0.35, [1.4, 1.6]); }
      else this.audio.play('land', c.pos, 0.5, [1.2, 1.3]);
    }
  },
  rideExit(a, c, dead) {
    c.driver = null; a.inCar = null; const ch = a.ch;
    const rig = ch.rideRig; if (rig) for (const n of rig.bones) { const s = rig.snap[n]; if (s) { ch.bones[n].position.copy(s.p); ch.bones[n].quaternion.copy(s.q); } }
    ch.root.rotation.set(0, c.yaw, 0); ch.root.quaternion.setFromEuler(ch.root.rotation); if (ch.gun) ch.gun.visible = true;
    const side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw)), f = V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    const p = c.pos.clone().addScaledVector(side, c.kind === 'skate' ? -0.25 : 0.55);
    a.pos.copy(p); this.world.pushOut(a.pos, 0.35, a.pos.y); a.pos.y = this.world.standY(a.pos.x, a.pos.z, c.pos.y + 0.5); a.yaw = c.yaw;
    const sp = Math.abs(c.speed);
    if (!dead && sp > 4.5) { // chute : le pilote est projeté avec l'élan
      a.vel.copy(c.vel || f.clone().multiplyScalar(c.speed)).multiplyScalar(0.75); a.vel.y = 2.5 + sp * 0.06; a.onGround = false; a.pos.y += 0.4;
      if (c.kind === 'moto') { this.damage(a, Math.min(60, (sp - 4.5) * 3), null); c.down = true; }
    } else if (c.kind === 'moto') { c.vel?.multiplyScalar(0.2); c.speed *= 0.2; }
    if (a === this.player) { this.audio.engine(false); this.audio.roll?.(false); this.cam.yaw = c.yaw; if (c.kind === 'moto' && !c.down) this.audio.play('cloth', c.pos, 0.5); }
  },

  // ---------------------------------------------------------------- physique
  updateRide(c, dt) {
    if (c.dead) { c.dead -= dt; if (c.dead <= 0) { c.dead = 0; c.down = false; [c.pos.x, c.pos.z, c.yaw] = c.spawn; c.pos.y = this.world.groundY(c.pos.x, c.pos.z); c.hp = c.maxHp; c.speed = 0; c.vel = null; c.rollV = c.kind === 'moto' ? -0.09 : 0; c.obj.visible = true; if (c.kind === 'moto' && !this.world.dynamic.includes(c.col)) this.world.dynamic.push(c.col); this.syncCar(c); } return; }
    const drv = c.driver;
    if (!drv && !c.air && Math.abs(c.speed) < 0.05 && !(c.vel && c.vel.lengthSq() > 0.01)) {
      c.speed = 0; c.vel = null;
      // moto à l'arrêt : sur sa béquille, ou couchée après une chute
      if (c.kind === 'moto') { const t = c.down ? -1.22 : -0.09; if (Math.abs(c.rollV - t) > 0.01) { c.rollV = lerp(c.rollV, t, 1 - Math.exp(-dt * (c.down ? 9 : 5))); c.steer = lerp(c.steer, c.down ? 0 : 0.35, 1 - Math.exp(-dt * 5)); this.steerWheels(c, 0); this.syncCar(c); } }
      return;
    }
    let thr = 0, brk = 0, st = 0, jump = false, I = null;
    if (drv === this.player && !this.paused) { I = this.input; const m = I.move(); thr = Math.max(-m.y, I.st.triggerR); brk = Math.max(m.y > 0 ? m.y : 0, I.st.triggerL); st = -m.x; jump = I.pressed('jump'); if (c.kind === 'moto' && I.pressed('horn')) this.audio.horn(); }
    const f = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)), side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    if (!c.vel) c.vel = f.clone().multiplyScalar(c.speed);
    let vf = c.vel.dot(f), vs = c.vel.dot(side), yawRate = 0;
    const moto = c.kind === 'moto';
    if (moto) {
      // moto : accélération forte, freinage puissant, pas de marche arrière (on recule en poussant avec les pieds)
      if (!drv) { thr = 0; brk = 0; }
      if (thr > 0) vf += thr * c.accel * dt * (1 - 0.75 * Math.max(0, vf / c.max) ** 2);
      if (brk > 0) vf = vf > 0.4 ? vf - brk * 15 * dt : Math.max(-1.6, vf - brk * 3 * dt);
      vf -= vf * 0.06 * dt; if (!thr && !brk) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (drv ? 1.2 : 4) * dt);
      vf = clamp(vf, -1.6, c.max);
      const maxSt = 0.6 / (1 + Math.abs(vf) * 0.22);
      c.steer = lerp(c.steer, st * maxSt, 1 - Math.exp(-dt * 6));
      yawRate = vf / c.def.spec.wb * Math.tan(c.steer);
      // frein arrière bloqué (saut) : l'arrière décroche, dérive courte
      const slide = drv && I?.down('jump') && Math.abs(vf) > 6; if (slide) { yawRate *= 1.35; vf -= Math.sign(vf) * 5 * dt; }
      vs *= Math.exp(-(slide ? 2.2 : 14) * dt);
      // inclinaison dans les virages (angle réel d'équilibre), un peu en retard sur la trajectoire
      const lean = drv ? clamp(-Math.atan(vf * yawRate / 9.8), -0.85, 0.85) : c.rollV;
      if (drv) c.rollV = lerp(c.rollV, lean, 1 - Math.exp(-dt * 7)); else if (Math.abs(vf) < 6) { c.down = true; c.rollV = lerp(c.rollV, -1.22, 1 - Math.exp(-dt * 5)); }
      c.pitchV = lerp(c.pitchV || 0, brk * 0.045 - thr * (vf < 8 ? 0.05 : 0.015), 1 - Math.exp(-dt * 6)); // cabre à l'accélération, plonge au freinage
      if (c.down) vf *= Math.exp(-dt * 1.8); // couchée, elle glisse et s'arrête
    } else {
      // skate : on pousse avec le pied arrière, on se laisse rouler, on freine en posant le pied, on tourne en se penchant
      const onG = !c.air;
      if (drv && onG && thr > 0.3 && vf < c.max - 0.3 && c.push <= 0) c.push = 0.62;
      if (c.push > 0) { const ph = 1 - c.push / 0.62; if (ph > 0.25 && ph < 0.7) vf += 9 * dt * (1 - Math.max(0, vf) / (c.max + 1.5)); c.push -= dt; }
      if (brk > 0 && onG) vf -= Math.sign(vf) * Math.min(Math.abs(vf), brk * 4.5 * dt);
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), (0.35 + 0.015 * vf * vf) * dt);
      // pente : la gravité accélère dans les descentes
      if (onG) { const ga = this.world.groundY(c.pos.x + f.x * 0.4, c.pos.z + f.z * 0.4, c.pos.y + 0.3), gb = this.world.groundY(c.pos.x - f.x * 0.4, c.pos.z - f.z * 0.4, c.pos.y + 0.3); const sl = clamp((ga - gb) / 0.8, -0.5, 0.5); if (Math.abs(ga - gb) < 0.25) vf -= 9.8 * sl * dt; }
      vf = clamp(vf, -3, 11);
      const curv = (Math.abs(vf) < 0.6 ? 0 : 0.95 / (1 + Math.abs(vf) * 0.12));
      c.steer = lerp(c.steer, st, 1 - Math.exp(-dt * 7));
      yawRate = Math.abs(vf) < 0.6 ? c.steer * 2.2 : vf * curv * c.steer;
      vs *= Math.exp(-16 * dt);
      c.rollV = lerp(c.rollV, onG ? -c.steer * 0.1 : 0, 1 - Math.exp(-dt * 10));
      // ollie : la planche saute avec le pilote, l'avant se lève puis se remet à plat
      if (jump && onG) { c.air = true; c.hopV = 4.9; c.popT = 0; this.audio.play('punch', c.pos, 0.35, [1.6, 1.8]); }
      if (c.air) { c.popT += dt; c.pitchV = -Math.sin(Math.min(1, c.popT / 0.35) * Math.PI) * 0.35; } else c.pitchV = lerp(c.pitchV, 0, 1 - Math.exp(-dt * 12));
    }
    c.vel.copy(f).multiplyScalar(vf).addScaledVector(side, vs); c.yaw += yawRate * dt; c.speed = vf;
    const prev = c.pos.clone(); c.pos.addScaledVector(c.vel, dt);
    const fwd = V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    // mobilier cassable fauché par la moto
    if (moto && this.world.cass && Math.abs(c.speed) > 4) for (const col of this.world.near(c.pos.x, c.pos.z, 1.8)) {
      if (!col.cassable || col.off) continue; const dx = col.x - c.pos.x, dz = col.z - c.pos.z; const lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
      const rr = col.type === 'box' ? Math.min(col.hx, col.hz) : col.r || 0.3; if (Math.abs(lx) > c.W / 2 + rr + 0.1 || Math.abs(lz) > c.L / 2 + rr + 0.2) continue;
      const e = this.world.cass.byId.get(col.cassable); if (!e) continue; const imp = Math.abs(c.speed) * 14;
      if (imp >= e.pv) { this.world.cass.breakIt(e, c.vel, drv); c.vel.multiplyScalar(e.max > 150 ? 0.6 : 0.9); c.speed = c.vel.dot(fwd); if (e.max > 150 && drv) c.bailT = 1; } else this.world.cass.damage(e, imp * 0.5, c.vel, drv);
    }
    // obstacles : le pilote est éjecté si on percute fort
    let bump = 0; const n = V(); const R = moto ? 0.36 : 0.3;
    for (const k of moto ? [-0.7, 0, 0.7] : [0]) {
      const q = c.pos.clone().addScaledVector(fwd, k * (c.L / 2 - R)); const q0 = q.clone();
      this.world.pushOut(q, R, c.pos.y + (moto ? 0.2 : 0.12), c.col); const dx = q.x - q0.x, dz = q.z - q0.z;
      if (dx || dz) { c.pos.x += dx; c.pos.z += dz; n.x += dx; n.z += dz; bump = Math.max(bump, Math.hypot(dx, dz)); }
    }
    if (bump > 0.005) { n.normalize(); const into = -c.vel.dot(n); if (into > 0) { c.vel.addScaledVector(n, into * 1.2); c.speed = c.vel.dot(fwd); if (into > (moto ? 7 : 3.2) && drv) { c.bailT = 1; c.why = 'choc ' + into.toFixed(1); } else if (into > 2) this.audio.play('thud', c.pos, Math.min(1, into / 8)); } }
    // piétons percutés
    if (moto && Math.abs(c.speed) > 4) for (const a of this.actors) {
      if (!a.alive || a.inCar || (drv && a.team === drv.team)) continue;
      const dx = a.pos.x - c.pos.x, dz = a.pos.z - c.pos.z; const lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
      if (Math.abs(lx) < c.W / 2 + 0.3 && Math.abs(lz) < c.L / 2 + 0.3) { this.damage(a, Math.abs(c.speed) * 3.5, drv, { blast: true }); a.vel.addScaledVector(fwd, c.speed * 0.6); a.vel.y = 3; a.onGround = false; c.vel.multiplyScalar(0.7); c.speed = c.vel.dot(fwd); this.audio.play('thud', a.pos, 1); if (Math.abs(c.speed) > 12 && drv) c.bailT = 1; }
    }
    // sol : bordures, marches, chute
    const gy = moto ? this.world.groundY(c.pos.x, c.pos.z, c.pos.y + 0.6) : this.world.standY(c.pos.x, c.pos.z, c.pos.y + (c.air ? 0.02 : 0.08));
    if (!moto && !c.air && gy > c.pos.y + 0.07) {
      // une bordure bloque les roues : chute si on va vite, sinon on s'arrête
      if (Math.abs(c.speed) > 2.4 && drv) { c.bailT = 1; c.why = 'bordure ' + (gy - c.pos.y).toFixed(2); } else { c.pos.x = prev.x; c.pos.z = prev.z; c.vel.multiplyScalar(0); c.speed = 0; }
    } else if (!moto && c.air) {
      c.hopV -= GRAV * dt; c.pos.y += c.hopV * dt;
      if (c.pos.y <= gy && c.hopV < 0) { c.pos.y = gy; c.air = false; c.hopV = 0; if (drv === this.player) { this.audio.play('land', c.pos, 0.6, [1.2, 1.4]); this.cam.dip -= 0.06; this.input.rumble(0.3, 0.2, 70); } }
    } else if (gy < c.pos.y - (moto ? 0.8 : 0.15)) {
      if (moto) { c.fallV = (c.fallV || 0) + GRAV * dt; c.pos.y = Math.max(gy, c.pos.y - c.fallV * dt); } else { c.air = true; c.hopV = 0; c.popT = 1; }
    } else { c.fallV = 0; c.pos.y = lerp(c.pos.y, gy, 1 - Math.exp(-dt * (moto ? 12 : 25))); }
    // dans la Seine
    const Wt = this.world.water; if (Wt && c.pos.y < Wt.y && this.world.inWater(c.pos.x, c.pos.z)) { this.fx.burst(V(c.pos.x, Wt.y + 0.2, c.pos.z), 20, { color: '#cfe3ef', speed: 5, size: 0.1, life: 0.9 }); if (drv) this.exitCar(drv); c.dead = 30; c.obj.visible = false; const j = this.world.dynamic.indexOf(c.col); if (j >= 0) this.world.dynamic.splice(j, 1); this.audio.play('thud', c.pos, 1); return; }
    // roues
    for (const w of c.wheels) w.rotation.x += c.speed * dt / (moto ? c.def.spec.R : 0.028);
    if (moto) this.steerWheels(c, c.steer);
    this.syncCar(c);
    if (drv) { drv.pos.copy(c.pos); drv.yaw = c.yaw; if (c.bailT > 0) { const d = drv; this.exitCar(d); if (d === this.player) this.announce('', moto ? 'Chute !' : 'Gamelle !', '#ff8a5a', 1.2); this.audio.play('slam', c.pos, 0.8); return; } }
    // effets : échappement, trace au freinage, son du moteur ou des roues
    const near = c.pos.distanceToSquared(this.camera.position) < 60 * 60;
    if (moto && near) {
      const back = c.pos.clone().addScaledVector(f, -c.L / 2 + 0.15).addScaledVector(side, -0.17); back.y += 0.5;
      if (drv && Math.random() < dt * (2 + thr * 6)) this.fx.burst(back, 1, { color: '#9a9a9a', speed: 0.5 + thr, size: 0.05 + thr * 0.04, life: 0.4, grav: -1.2, opacity: 0.25, normal: f.clone().negate(), spread: 0.8 });
      if ((brk > 0.7 && Math.abs(c.speed) > 8) || (I?.down('jump') && Math.abs(c.speed) > 6) || c.down) { const w = c.pos.clone().addScaledVector(f, -c.def.spec.wb / 2); w.y = this.world.groundY(w.x, w.z, c.pos.y + 0.5) + 0.02; this.skidMark(c, 0, w); } else c.skidPrev = null;
    }
    if (drv === this.player) {
      if (moto) { const r = Math.abs(c.speed) / c.max, gear = Math.min(5, Math.floor(r * 6)); this.audio.engine(true, clamp(0.25 + ((r * 6) % 1) * 0.55 + gear * 0.05, 0, 1), c.pos, 'moto'); }
      else this.audio.roll?.(!c.air && Math.abs(c.speed) > 0.4, Math.abs(c.speed) / 8);
    }
  },
  steerWheels(c, s) { const n = c.steerNode; if (!n) return; n.quaternion.setFromAxisAngle(V(1, 0, 0), -n.userData.rake).multiply(_q.setFromAxisAngle(V(0, 1, 0), s)); },

  // ---------------------------------------------------------------- pose du pilote
  rideAnimate(a, dt) {
    const c = a.inCar, ch = a.ch, B = ch.bones, rig = ch.rideRig; const moto = c.kind !== 'skate'; // le mini-hélico (helico.js) se pilote assis comme une moto
    // repère du pilote : celui du véhicule (inclinaison comprise) ; sur le skate, de profil, tourné vers l'avant pendant la poussée
    c.obj.updateMatrixWorld(true);
    const pushing = !moto && c.push > 0; c.pushW = lerp(c.pushW || 0, pushing ? 1 : 0, 1 - Math.exp(-dt * 9));
    const twist = moto ? 0 : -Math.PI / 2 + c.pushW * 0.95;
    const Mloc = new THREE.Matrix4().compose(V(0, moto ? 0 : DECK_Y, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), twist), V(1, 1, 1));
    const Mw = c.obj.matrixWorld.clone().multiply(Mloc); Mw.decompose(ch.root.position, ch.root.quaternion, _v);
    ch.model.rotation.x = 0;
    if (!rig) { ch.mixer.update(dt); return; }
    // on repart de la pose d'avant la montée (sinon les corrections s'accumulent sur les os que le clip n'anime pas)
    for (const n of rig.bones) { const s = rig.snap[n]; if (s) { B[n].position.copy(s.p); B[n].quaternion.copy(s.q); } }
    const A = ch.actions; const base = A.MX_Idle ? 'MX_Idle' : 'Idle_Gun';
    if (a.anim !== base) this.setAnim(a, base, 0.2, 1);
    if (A.MX_Idle) this.locomotion(a, dt, 0, false);
    ch.mixer.update(dt);
    ch.root.updateMatrixWorld(true);
    const toW = (x, y, z) => V(x, y, z).applyMatrix4(c.obj.matrixWorld);
    const up = V(0, 1, 0).transformDirection(c.obj.matrixWorld), fw = V(0, 0, 1).transformDirection(c.obj.matrixWorld), lf = V(1, 0, 0).transformDirection(c.obj.matrixWorld);
    // 1) bassin : milieu des hanches posé à la cible en déplaçant l'os Body
    const hipMid = wpos(B.UpperLegL).add(wpos(B.UpperLegR)).multiplyScalar(0.5);
    let target;
    if (moto) { const S = c.def.spec; target = toW(S.seat[0], S.seat[1] + 0.1, S.seat[2] - 0.02); }
    else {
      const crouch = c.air ? 0.2 * Math.sin(Math.min(1, (c.popT || 0) / 0.45) * Math.PI) : 0;
      const ph = pushing ? 1 - c.push / 0.62 : 0, dip = pushing ? Math.sin(clamp((ph - 0.15) / 0.7, 0, 1) * Math.PI) * 0.12 : 0;
      target = toW(0, DECK_Y + rig.hipH * 0.86 - crouch - dip - Math.abs(c.steer) * 0.05, pushing ? 0.12 * c.pushW : 0);
    }
    // (les nouveaux persos n'ont plus d'os Body : on déplace alors le bassin, Hips)
    const BD = B.Body || B.Hips; const dB = target.sub(hipMid); const bw = wpos(BD).add(dB); BD.parent.updateMatrixWorld(true); BD.position.copy(BD.parent.worldToLocal(bw)); BD.updateMatrixWorld(true);
    // 2) buste penché vers l'avant (sportive : position couchée), tête relevée pour regarder la route
    const lean = moto ? c.def.spec.lean + clamp(-c.speed / c.max * 0.05, -0.05, 0) : 0.18 + (c.air ? 0.15 : 0) + c.pushW * 0.15;
    const leanAxis = V(1, 0, 0).transformDirection(ch.root.matrixWorld); // gauche du pilote : le buste bascule vers l'avant
    if (B.Hips) rotBoneWorld(B.Hips, leanAxis, lean);
    if (B.Neck) rotBoneWorld(B.Neck, leanAxis, -lean * 0.75);
    // skate : la tête regarde dans le sens de la marche
    if (!moto && B.Head) { const want = c.pushW > 0.5 ? 0 : 0.9; rotBoneWorld(B.Head, up, want * (1 - c.pushW)); }
    // 3) jambes : pieds sur les repose-pieds / la planche (pied arrière qui pousse au sol)
    const legs = [['L', 1], ['R', -1]];
    for (const [s, sx] of legs) {
      let foot, pole;
      if (moto) { const peg = c.obj.getObjectByName(sx > 0 ? 'peg-left' : 'peg-right'); foot = wpos(peg); pole = fw.clone().multiplyScalar(1).addScaledVector(up, 0.4).addScaledVector(lf, sx * 0.35); }
      else {
        // pied gauche devant (position « regular »), pied droit sur le tail ; le droit pousse
        const front = sx > 0; let lx = 0, ly = DECK_Y + 0.01, lz = front ? 0.21 : -0.2;
        if (!front && pushing) { const ph = 1 - c.push / 0.62; const k = clamp((ph - 0.12) / 0.7, 0, 1); lx = -0.24; lz = lerp(0.1, -0.55, k); ly = ph < 0.12 || ph > 0.82 ? 0.12 : 0.01; lx *= Math.min(1, c.pushW * 1.5); }
        foot = toW(lx, ly, lz);
        const cf = V(0, 0, 1).transformDirection(ch.root.matrixWorld); pole = cf.clone().addScaledVector(fw, front ? 0.5 : -0.5);
      }
      const upper = B['UpperLeg' + s], lower = B['LowerLeg' + s], fb = B['Foot' + s]; if (!upper || !lower || !fb) continue;
      const end = ik2(upper, lower, rig['end' + s], foot, pole);
      fb.parent.updateMatrixWorld(true); fb.position.copy(fb.parent.worldToLocal(end)); fb.updateMatrixWorld(true);
    }
    // 4) bras : mains sur les poignées (moto) ; sur le skate, bras écartés pour l'équilibre (pose du clip)
    if (moto) for (const [s, sx] of legs) {
      const upper = B['UpperArm' + s], lower = B['LowerArm' + s], w = B['Wrist' + s]; if (!upper || !lower || !w) continue;
      const g = wpos(c.obj.getObjectByName(sx > 0 ? 'grip-left' : 'grip-right'));
      ik2(upper, lower, w.position.clone(), g, lf.clone().multiplyScalar(sx * 0.7).addScaledVector(up, -1).addScaledVector(fw, -0.4));
    }
    a.ch.root.visible = true;
  },
};
