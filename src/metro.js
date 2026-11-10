// Rame de la ligne F : trois voitures placées sur le chemin du tunnel selon l'horaire de la map
// (période 60 s : 6 s à quai Ouest, 24 s de trajet, 6 s à quai Est, 24 s retour ; profil u - sin(2πu)/2π).
// Chaque voiture a une boîte de collision mobile ; une rame lancée tue ce qu'elle percute sur la voie.
import * as THREE from 'three';

export function createMetro({ rame, gp, audio }) {
  const R = rame?.userData?.metro || gp.metro?.rame; if (!rame || !R) return null;
  const pts = R.chemin.map((p) => new THREE.Vector3(p[0], p[1], p[2])); const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const at = (s, out) => { s = Math.max(0, Math.min(total, s)); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]); return out.copy(pts[lo]).lerp(pts[hi], t); };
  const VO = R.voiture || {}; const FLOOR = VO.plancher ?? 1.15, HALFIN = VO.demiLargeurInt ?? 1.19;
  const cars = rame.children.filter((c) => c.userData?.voiture).map((n) => ({ n, off: n.userData.decalage || 0, L: n.userData.longueur || 10, W: n.userData.largeur || 2.4, H: n.userData.hauteur || 3.7 }));
  // collisions : rame creuse (parois locales, caisse sous le plancher, une boîte par porte quand elle est fermée)
  const box = (l, extra = {}) => ({ type: 'box', x: 0, z: 0, hx: l.hx, hz: l.hz, yaw: 0, cs: 1, sn: 0, y0: 0, h: l.h, metro: true, l, ...extra });
  for (const c of cars) {
    const parois = c.n.userData.parois || VO.parois;
    if (parois?.length) {
      c.cols = parois.map((l) => box(l));
      c.cols.push(box({ x: 0, z: 0, hx: c.W / 2, hz: c.L / 2, y0: 0, h: FLOOR }, { under: true }));
      c.doors = (VO.portes || []).filter((d) => d.quai !== false).map((d) => box({ x: (d.cote || 1) * 1.22, z: d.z, hx: 0.07, hz: (d.largeur || 1.3) / 2, y0: FLOOR, h: d.hauteur || 2 }, { door: true }));
      c.cols.push(...c.doors);
    } else c.cols = [box({ x: 0, z: 0, hx: c.W / 2, hz: c.L / 2, y0: 0, h: c.H })];
    // vantaux (exportés ouverts) : on retient leur position ouverte, fermé = z 0
    c.leaves = []; c.n.traverse((o) => { if (/^RAME_PORTES_[GD]/.test(o.name)) c.leaves.push({ o, zOpen: o.position.z }); });
    n_shadow(c.n);
  }
  function n_shadow(n) { n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
  const P = R.periode || 60, A = R.arret || 6, T = R.trajet || 24, s0 = R.sOuest, s1 = R.sEst;
  const prof = (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);
  const sAt = (t) => { t = ((t % P) + P) % P; if (t < A) return s0; if (t < A + T) return s0 + (s1 - s0) * prof((t - A) / T); if (t < 2 * A + T) return s1; return s1 + (s0 - s1) * prof((t - 2 * A - T) / T); };
  // portes ouvertes pendant l'arrêt, fermées 1,5 s avant le départ
  const doorsOpen = (t) => { t = ((t % P) + P) % P; return (t > 0.8 && t < A - 1.5) || (t > A + T + 0.8 && t < 2 * A + T - 1.5); };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), m = new THREE.Vector3();
  const st = { s: s0, v: 0, cars, cols: cars.flatMap((c) => c.cols), t: 0, floor: FLOOR, halfIn: HALFIN, open: true, floors: [] };
  // planchers (pour le sol sous les pieds des passagers), intercirculations comprises
  st.floors = cars.map((c) => ({ x: 0, z: 0, cs: 1, sn: 0, hx: HALFIN, hz: c.L / 2 + 0.6, y: 0 }));
  let lastMoving = false, doorK = 1;
  st.update = (time, dt, listener) => {
    const s = sAt(time); st.v = dt > 0 ? (s - st.s) / dt : 0; st.s = s; st.t = time;
    const open = doorsOpen(time); if (open !== st.open && listener && audio) { const mid = cars[1]?.n.position || m; if (mid.distanceTo(listener) < 40) audio.play(open ? 'cloth' : 'slam', mid, 0.6, [0.6, 0.7], 0); }
    st.open = open; doorK += ((open ? 1 : 0) - doorK) * Math.min(1, dt * 4);
    cars.forEach((c, i) => {
      c.prev = c.prev || {}; Object.assign(c.prev, { x: c.x ?? 0, z: c.z ?? 0, y: c.y ?? 0, yaw: c.yaw ?? 0, ok: c.x != null });
      const sc = s + c.off; at(sc - c.L * 0.4, a); at(sc + c.L * 0.4, b); m.addVectors(a, b).multiplyScalar(0.5);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z), cs = Math.cos(yaw), sn = Math.sin(yaw);
      c.n.position.copy(m); c.n.rotation.set(0, yaw, 0); c.x = m.x; c.z = m.z; c.y = m.y; c.yaw = yaw;
      for (const col of c.cols) { const l = col.l; Object.assign(col, { x: m.x + l.x * cs + l.z * sn, z: m.z - l.x * sn + l.z * cs, yaw, cs, sn, y0: m.y + (l.y0 || 0) }); }
      for (const d of c.doors || []) d.off = doorK > 0.5;
      for (const lf of c.leaves) lf.o.position.z = lf.zOpen * doorK;
      Object.assign(st.floors[i], { x: m.x, z: m.z, cs, sn, y: m.y + FLOOR });
    });
    // bruit de roulement quand la rame démarre ou freine près du joueur
    const moving = Math.abs(st.v) > 0.5;
    if (moving !== lastMoving && listener && audio) { const mid = cars[1]?.n.position || m; if (mid.distanceTo(listener) < 60) audio.play(moving ? 'slam' : 'thud', mid, 0.5, [0.5, 0.6], 0); }
    lastMoving = moving;
  };
  st.update(0, 0);
  return st;
}
