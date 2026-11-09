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
  const cars = rame.children.filter((c) => c.userData?.voiture).map((n) => ({ n, off: n.userData.decalage || 0, L: n.userData.longueur || 10, W: n.userData.largeur || 2.4, H: n.userData.hauteur || 3.7 }));
  for (const c of cars) { c.col = { type: 'box', x: 0, z: 0, hx: c.W / 2, hz: c.L / 2, yaw: 0, cs: 1, sn: 0, y0: pts[0].y, h: c.H, metro: true }; n_shadow(c.n); }
  function n_shadow(n) { n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
  const P = R.periode || 60, A = R.arret || 6, T = R.trajet || 24, s0 = R.sOuest, s1 = R.sEst;
  const prof = (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);
  const sAt = (t) => { t = ((t % P) + P) % P; if (t < A) return s0; if (t < A + T) return s0 + (s1 - s0) * prof((t - A) / T); if (t < 2 * A + T) return s1; return s1 + (s0 - s1) * prof((t - 2 * A - T) / T); };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), m = new THREE.Vector3();
  const st = { s: s0, v: 0, cars, cols: cars.map((c) => c.col), t: 0 };
  let lastMoving = false;
  st.update = (time, dt, listener) => {
    const s = sAt(time); st.v = dt > 0 ? (s - st.s) / dt : 0; st.s = s; st.t = time;
    for (const c of cars) {
      const sc = s + c.off; at(sc - c.L * 0.4, a); at(sc + c.L * 0.4, b); m.addVectors(a, b).multiplyScalar(0.5);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      c.n.position.copy(m); c.n.rotation.set(0, yaw, 0);
      Object.assign(c.col, { x: m.x, z: m.z, yaw, cs: Math.cos(yaw), sn: Math.sin(yaw), y0: m.y });
    }
    // bruit de roulement quand la rame démarre ou freine près du joueur
    const moving = Math.abs(st.v) > 0.5;
    if (moving !== lastMoving && listener && audio) { const mid = cars[1]?.n.position || m; if (mid.distanceTo(listener) < 60) audio.play(moving ? 'slam' : 'thud', mid, 0.5, [0.5, 0.6], 0); }
    lastMoving = moving;
  };
  st.update(0, 0);
  return st;
}
